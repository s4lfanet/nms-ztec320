"""SNMP Trap listener for real-time ONU event detection.

Instead of polling OLT every 5 minutes for ONU status, this listens for
SNMP Traps pushed by the OLT when ONUs go offline/online — enabling
sub-second detection of ONU state changes.

Architecture (inspired by snmp-olt-zte Go service):
    OLT ──(SNMP Trap UDP 162)──> TrapListener ──> Verify via SNMP GET
          ──> Event Queue (dedup + recovery) ──> Batched Webhook

Features:
    - SNMP verification: re-queries ONU status via SNMP GET on trap receive
      to prevent false alerts from stale/lost traps
    - Event enrichment: adds ONU name, serial, RX power from SNMP to notifications
    - Cache invalidation: clears ONU cache on trap so next request fetches fresh data
    - Event deduplication: each ONU appears only once per batch
    - Recovery detection: ONUs back online before flush are removed
    - Repeat intervals: re-notify for persistent offline ONUs (e.g. every 60min)
    - Batched notifications: per-severity batch intervals
    - Webhook notifications: Telegram, Discord, Slack, generic HTTP
    - Runs as background thread alongside Flask app

Usage:
    from trap_listener import TrapListener

    listener = TrapListener(
        olt_ip='10.0.0.1',
        community='public',
        port=162,
        webhook_url='https://api.telegram.org/bot.../sendMessage',
        webhook_type='telegram',
        webhook_chat_id='@channel',
        repeat_intervals={'critical': 3600, 'high': 7200},  # re-notify every 1h/2h
    )
    listener.start()  # non-blocking, runs in background thread
    # ... later
    listener.stop()
"""
import logging
import threading
import time
import json
import socket
from typing import Optional, Callable
from collections import defaultdict

logger = logging.getLogger("trap_listener")

# ZTE C320/C300 SNMP Trap OIDs
# Standard SNMPv2 trap OIDs for link up/down
TRAP_COLD_START = '1.3.6.1.6.3.1.1.5.1'
TRAP_WARM_START = '1.3.6.1.6.3.1.1.5.2'
TRAP_LINK_DOWN = '1.3.6.1.6.3.1.1.5.3'
TRAP_LINK_UP = '1.3.6.1.6.3.1.1.5.4'

# ZTE enterprise trap OIDs (ONU events)
ZTE_ENTERPRISE_OID = '1.3.6.1.4.1.3902'
ZTE_ONU_OFFLINE_TRAP = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.7'  # dereg reason
ZTE_ONU_STATE_CHANGE = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.6'  # oper state

# Severity classification
SEVERITY_CRITICAL = 'critical'   # ONU offline, LOS
SEVERITY_HIGH = 'high'           # ONU dyinggasp
SEVERITY_MEDIUM = 'medium'       # ONU auth fail
SEVERITY_LOW = 'low'             # ONU online (recovery)
SEVERITY_INFO = 'info'           # Link up, cold start

# Batch intervals per severity (seconds)
DEFAULT_BATCH_INTERVALS = {
    SEVERITY_CRITICAL: 10,
    SEVERITY_HIGH: 30,
    SEVERITY_MEDIUM: 60,
    SEVERITY_LOW: 120,
    SEVERITY_INFO: 300,
}

# Default repeat intervals (seconds) — re-notify for persistent conditions
# 0 = no repeat (notify once per batch, then drop)
DEFAULT_REPEAT_INTERVALS = {
    SEVERITY_CRITICAL: 3600,   # re-notify every 1 hour
    SEVERITY_HIGH: 7200,       # re-notify every 2 hours
    SEVERITY_MEDIUM: 14400,    # re-notify every 4 hours
    SEVERITY_LOW: 0,           # no repeat for recovery
    SEVERITY_INFO: 0,          # no repeat for info events
}

# Alert event types — only these trigger webhook notifications
ALERT_EVENT_TYPES = {
    'LOS', 'DyingGasp', 'PowerOff', 'Offline', 'AuthFailed',
    'LOSi', 'LOFi', 'Logging', 'Synchronization',
}


class TrapEvent:
    """Represents a single SNMP trap event from an ONU."""

    def __init__(self, olt_ip: str, onu_index: str, severity: str,
                 description: str, timestamp: float = None):
        self.olt_ip = olt_ip
        self.onu_index = onu_index  # e.g. "1/2/8:1" (frame/slot/port:onu_id)
        self.severity = severity
        self.description = description
        self.timestamp = timestamp or time.time()
        self.verified = False  # Double-verification flag
        # Enrichment fields (populated by SNMP verification)
        self.name = ''
        self.serial_number = ''
        self.onu_type = ''
        self.rx_power = None
        self.status = ''
        self.last_online = ''
        self.last_offline = ''
        self.event_type = ''  # Resolved event type after SNMP verification
        self.last_notified = 0.0  # Timestamp of last notification (for repeat intervals)

    @property
    def dedup_key(self) -> str:
        """Key for deduplication — same ONU + same severity = same event."""
        return f"{self.olt_ip}:{self.onu_index}:{self.severity}"

    def to_dict(self) -> dict:
        return {
            'olt_ip': self.olt_ip,
            'onu_index': self.onu_index,
            'severity': self.severity,
            'description': self.description,
            'timestamp': self.timestamp,
            'verified': self.verified,
            'name': self.name,
            'serial_number': self.serial_number,
            'rx_power': self.rx_power,
            'status': self.status,
            'event_type': self.event_type,
        }

    def __repr__(self):
        return f"TrapEvent({self.olt_ip}:{self.onu_index} [{self.severity}])"


class TrapListener:
    """SNMP Trap listener with batched notifications and deduplication.

    Listens for UDP traps on the specified port, classifies events by
    severity, deduplicates, and flushes batched notifications at
    per-severity intervals.
    """

    def __init__(
        self,
        olt_ip: str = '0.0.0.0',
        community: str = 'public',
        port: int = 162,
        snmp_port: int = 161,
        webhook_url: Optional[str] = None,
        webhook_type: str = 'generic',
        webhook_chat_id: Optional[str] = None,
        batch_intervals: Optional[dict] = None,
        repeat_intervals: Optional[dict] = None,
        on_event: Optional[Callable] = None,
        verify_snmp: bool = True,
    ):
        self.olt_ip = olt_ip
        self.community = community
        self.port = port
        self.snmp_port = snmp_port
        self.webhook_url = webhook_url
        self.webhook_type = webhook_type
        self.webhook_chat_id = webhook_chat_id
        self.batch_intervals = batch_intervals or DEFAULT_BATCH_INTERVALS
        self.repeat_intervals = repeat_intervals or DEFAULT_REPEAT_INTERVALS
        self.on_event = on_event  # Custom callback for trap events
        self.verify_snmp = verify_snmp  # Verify trap via SNMP GET before alerting

        # State
        self._sock: Optional[socket.socket] = None
        self._running = False
        self._listen_thread: Optional[threading.Thread] = None
        self._flush_thread: Optional[threading.Thread] = None

        # Event queues per severity
        self._pending: dict[str, dict[str, TrapEvent]] = defaultdict(dict)
        self._pending_lock = threading.Lock()
        self._last_flush: dict[str, float] = {}

        # Stats
        self.stats = {
            'traps_received': 0,
            'traps_processed': 0,
            'traps_deduplicated': 0,
            'traps_recovered': 0,
            'traps_verified': 0,
            'traps_skipped_false': 0,
            'notifications_sent': 0,
            'notifications_repeated': 0,
            'errors': 0,
        }

    def start(self):
        """Start the trap listener (non-blocking)."""
        if self._running:
            logger.warning("Trap listener already running")
            return

        self._running = True

        # Start UDP listener thread
        self._listen_thread = threading.Thread(
            target=self._listen_loop, daemon=True, name='trap-listener'
        )
        self._listen_thread.start()

        # Start batch flush thread
        self._flush_thread = threading.Thread(
            target=self._flush_loop, daemon=True, name='trap-flusher'
        )
        self._flush_thread.start()

        logger.info(f"SNMP Trap listener started on UDP port {self.port}")

    def stop(self):
        """Stop the trap listener."""
        self._running = False
        if self._sock:
            try:
                self._sock.close()
            except Exception:
                pass
        logger.info("SNMP Trap listener stopped")

    def _listen_loop(self):
        """Main UDP listen loop — receives raw SNMP trap packets."""
        try:
            self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self._sock.bind(('0.0.0.0', self.port))
            self._sock.settimeout(1.0)  # Allow periodic _running check

            logger.info(f"Trap listener bound to 0.0.0.0:{self.port}")
        except Exception as e:
            logger.error(f"Failed to bind trap listener port {self.port}: {e}")
            self.stats['errors'] += 1
            self._running = False
            return

        while self._running:
            try:
                data, addr = self._sock.recvfrom(65535)
                self.stats['traps_received'] += 1
                threading.Thread(
                    target=self._process_trap,
                    args=(data, addr[0]),
                    daemon=True,
                ).start()
            except socket.timeout:
                continue
            except Exception as e:
                if self._running:
                    logger.error(f"Trap receive error: {e}")
                    self.stats['errors'] += 1

    def _process_trap(self, data: bytes, source_ip: str):
        """Process a raw SNMP trap packet and classify the event."""
        try:
            event = self._parse_trap(data, source_ip)
            if event:
                # SNMP verification: re-query ONU status to confirm trap is real
                if self.verify_snmp and event.onu_index != 'unknown':
                    event = self._verify_trap_via_snmp(event)
                    if event is None:
                        self.stats['traps_skipped_false'] += 1
                        return

                self._enqueue_event(event)
                self.stats['traps_processed'] += 1

                # Call custom callback if set
                if self.on_event:
                    try:
                        self.on_event(event)
                    except Exception as e:
                        logger.error(f"on_event callback error: {e}")
        except Exception as e:
            logger.error(f"Trap processing error: {e}")
            self.stats['errors'] += 1

    def _verify_trap_via_snmp(self, event: TrapEvent) -> Optional[TrapEvent]:
        """Verify trap by re-querying ONU status via SNMP batch GET.

        This prevents false alerts from stale/lost traps. Also enriches
        the event with ONU name, serial, RX power from live SNMP data.

        Returns None if the trap is determined to be false (ONU actually online).
        Returns the enriched event if confirmed offline/abnormal.
        """
        try:
            from snmp_core import SNMPCollector, parse_pon_index, BOARD1_BASE, BOARD2_BASE, PON_INCREMENT
            from cache import cache_delete, olt_cache_key

            # Parse onu_index "frame/slot/port:onu_id"
            parts = event.onu_index.split(':')
            if len(parts) != 2:
                return event  # Can't verify, pass through

            frame_port = parts[0].split('/')
            onu_id = int(parts[1])
            if len(frame_port) < 3:
                return event

            frame = int(frame_port[0])
            port = int(frame_port[2])

            # Compute pon_index
            if frame == 1:
                pon_index = BOARD1_BASE + port * PON_INCREMENT
            elif frame == 2:
                pon_index = BOARD2_BASE + port * PON_INCREMENT
            else:
                return event

            # Invalidate cache for this ONU's data
            try:
                cache_delete(olt_cache_key(0, f"onus:detail:{frame}:{port}:{onu_id}"))
            except Exception:
                pass

            # Query actual ONU status via batch GET
            collector = SNMPCollector(
                ip=event.olt_ip,
                community=self.community,
                port=self.snmp_port,
            )
            detail = collector.collect_onu_detail_batch(pon_index, onu_id)

            if not detail['serial_number']:
                logger.debug(f"Trap verification: ONU not found in SNMP {event.onu_index}")
                return None  # ONU doesn't exist in SNMP — false trap

            # Enrich event with SNMP data
            event.name = detail['name']
            event.serial_number = detail['serial_number']
            event.status = detail['status']
            event.rx_power = detail.get('rx_power')

            # Resolve actual event type from verified SNMP status
            event.event_type = self._resolve_event_type(detail['status'])

            # If ONU is actually online, this is a false trap — skip it
            if event.event_type == 'Online':
                logger.info(
                    f"Trap false alarm: {event.onu_index} on {event.olt_ip} "
                    f"is actually online (SNMP verified)"
                )
                return None

            # Update severity based on verified status
            if event.event_type == 'DyingGasp':
                event.severity = SEVERITY_HIGH
            elif event.event_type == 'AuthFailed':
                event.severity = SEVERITY_MEDIUM
            elif event.event_type in ('LOS', 'LOSi', 'LOFi', 'PowerOff', 'Offline'):
                event.severity = SEVERITY_CRITICAL

            event.verified = True
            self.stats['traps_verified'] += 1

            logger.info(
                f"Trap verified: {event.onu_index} on {event.olt_ip} "
                f"status={event.status} type={event.event_type} "
                f"serial={event.serial_number}"
            )
            return event

        except Exception as e:
            logger.error(f"Trap SNMP verification failed: {e}")
            return event  # Pass through unverified on error

    @staticmethod
    def _resolve_event_type(status: str) -> str:
        """Determine event type from SNMP-verified ONU status."""
        s = status.lower()
        if 'online' in s:
            return 'Online'
        if 'dying' in s:
            return 'DyingGasp'
        if 'los' in s:
            return 'LOS'
        if 'power' in s:
            return 'PowerOff'
        if 'auth' in s:
            return 'AuthFailed'
        if 'offline' in s:
            return 'Offline'
        return 'Online'

    def _parse_trap(self, data: bytes, source_ip: str) -> Optional[TrapEvent]:
        """Parse SNMP trap packet and classify into TrapEvent.

        Uses pysnmp's message parser to decode the ASN.1 BER encoded trap.
        """
        try:
            from pysnmp.proto.api import verdec
            from pysnmp.proto.api.verdec import api as snmp_api

            # Decode the SNMP message
            msg_ver = int(snmp_api.decodeMessageVersion(data))
            if msg_ver in (0, 1):
                # SNMPv1 or v2c trap
                msg = snmp_api.Message()
                msg.decode(data)

                # Extract varbinds
                var_binds = snmp_api.MessageComponents(msg).getVarBinds()

                trap_oid = None
                onu_index = None
                description = ''

                for var_bind in var_binds:
                    oid = str(var_bind[0])
                    val = str(var_bind[1])

                    # SNMPv2c trap OID is in snmpTrapOID (1.3.6.1.6.3.1.1.4.1)
                    if oid == '1.3.6.1.6.3.1.1.4.1':
                        trap_oid = val
                    # Try to extract ONU index from ZTE enterprise OIDs
                    elif ZTE_ENTERPRISE_OID in oid:
                        # Extract ONU index from OID suffix
                        # ZTE ONU OID suffix: .ponIndex.onuSlot.onuId
                        suffix = oid[oid.index(ZTE_ENTERPRISE_OID) + len(ZTE_ENTERPRISE_OID):]
                        parts = suffix.lstrip('.').split('.')
                        if len(parts) >= 3:
                            try:
                                pon_index = int(parts[0])
                                onu_slot = int(parts[1])
                                from snmp_core import parse_pon_index
                                frame, port = parse_pon_index(pon_index)
                                if frame > 0:
                                    onu_index = f"{frame}/{frame}/{port}:{onu_slot}"
                            except (ValueError, IndexError):
                                pass
                        description += f"{oid.split('.')[-1]}={val}; "

                # Classify severity
                if trap_oid == TRAP_LINK_DOWN or (trap_oid and '50.12' in trap_oid):
                    severity = SEVERITY_CRITICAL
                    desc = f"ONU {onu_index or 'unknown'} offline"
                elif trap_oid == TRAP_LINK_UP:
                    severity = SEVERITY_LOW
                    desc = f"ONU {onu_index or 'unknown'} back online"
                elif trap_oid and 'dyinggasp' in description.lower():
                    severity = SEVERITY_HIGH
                    desc = f"ONU {onu_index or 'unknown'} dyinggasp"
                elif trap_oid and 'auth' in description.lower():
                    severity = SEVERITY_MEDIUM
                    desc = f"ONU {onu_index or 'unknown'} auth failure"
                elif trap_oid in (TRAP_COLD_START, TRAP_WARM_START):
                    severity = SEVERITY_INFO
                    desc = f"OLT {source_ip} restarted"
                    onu_index = source_ip  # Use IP as identifier for OLT events
                else:
                    severity = SEVERITY_INFO
                    desc = f"Trap from {source_ip}: {trap_oid or 'unknown'}"

                if description:
                    desc += f" ({description})"

                return TrapEvent(
                    olt_ip=source_ip,
                    onu_index=onu_index or 'unknown',
                    severity=severity,
                    description=desc,
                )

        except ImportError:
            logger.warning("pysnmp not available for trap parsing — using raw decode")
            return self._parse_trap_raw(data, source_ip)
        except Exception as e:
            logger.error(f"Trap parse error: {e}")

        return None

    def _parse_trap_raw(self, data: bytes, source_ip: str) -> Optional[TrapEvent]:
        """Fallback raw trap parser — minimal ASN.1 BER decoding."""
        try:
            # Minimal: just detect link down/up by searching for known OID patterns
            data_str = data.hex()

            # Look for linkDown (1.3.6.1.6.3.1.1.5.3) pattern
            if '06032b060103' in data_str or 'linkdown' in data_str.lower():
                return TrapEvent(
                    olt_ip=source_ip, onu_index='unknown',
                    severity=SEVERITY_CRITICAL,
                    description=f"Link down detected from {source_ip}",
                )

            # Look for linkUp (1.3.6.1.6.3.1.1.5.4) pattern
            if '06032b060104' in data_str or 'linkup' in data_str.lower():
                return TrapEvent(
                    olt_ip=source_ip, onu_index='unknown',
                    severity=SEVERITY_LOW,
                    description=f"Link up detected from {source_ip}",
                )

            # Generic trap
            return TrapEvent(
                olt_ip=source_ip, onu_index='unknown',
                severity=SEVERITY_INFO,
                description=f"Unknown trap from {source_ip} ({len(data)} bytes)",
            )
        except Exception as e:
            logger.error(f"Raw trap parse error: {e}")
            return None

    def _enqueue_event(self, event: TrapEvent):
        """Add event to pending queue with deduplication."""
        with self._pending_lock:
            key = event.dedup_key

            # Recovery detection: if an offline event exists and new event is online
            if event.severity == SEVERITY_LOW:
                # Remove any pending critical/high events for same ONU
                removed = False
                for sev in [SEVERITY_CRITICAL, SEVERITY_HIGH, SEVERITY_MEDIUM]:
                    old_key = f"{event.olt_ip}:{event.onu_index}:{sev}"
                    if old_key in self._pending[sev]:
                        del self._pending[sev][old_key]
                        removed = True
                        self.stats['traps_recovered'] += 1
                        logger.info(f"Trap recovery: {event.onu_index} on {event.olt_ip}")
                if removed:
                    return  # Don't enqueue the recovery event itself

            # Deduplicate: if same key already pending, update timestamp
            if key in self._pending[event.severity]:
                self.stats['traps_deduplicated'] += 1
                self._pending[event.severity][key].timestamp = event.timestamp
                return

            self._pending[event.severity][key] = event

    def _flush_loop(self):
        """Background thread that flushes batched events at per-severity intervals."""
        while self._running:
            time.sleep(1.0)

            now = time.time()
            for severity, interval in self.batch_intervals.items():
                last = self._last_flush.get(severity, 0)
                if now - last >= interval:
                    self._flush_severity(severity)

    def _flush_severity(self, severity: str):
        """Flush all pending events for a given severity.

        With repeat intervals: events stay in queue for re-notification.
        Only removed if repeat_interval is 0 or ONU recovered.
        """
        with self._pending_lock:
            entries = dict(self._pending[severity])
            if not entries:
                return

            self._last_flush[severity] = time.time()

        repeat_interval = self.repeat_intervals.get(severity, 0)
        now = time.time()

        # Filter: only alert for confirmed event types
        to_notify = []
        to_remove = []

        for key, event in entries.items():
            # Skip non-alert events (e.g. Online recovery)
            if event.event_type and event.event_type not in ALERT_EVENT_TYPES:
                to_remove.append(key)
                continue

            # Check repeat interval
            if event.last_notified > 0:
                if repeat_interval <= 0:
                    to_remove.append(key)
                    continue
                if now - event.last_notified < repeat_interval:
                    continue  # Not enough time since last notification

            to_notify.append(event)
            event.last_notified = now

        # Remove processed/non-alert entries
        with self._pending_lock:
            for key in to_remove:
                self._pending[severity].pop(key, None)

        if not to_notify:
            return

        logger.info(f"Flushing {len(to_notify)} {severity} trap events")

        # Send webhook notification
        if self.webhook_url:
            try:
                self._send_webhook(to_notify, severity)
                self.stats['notifications_sent'] += 1
                # Track if this is a repeat notification
                for event in to_notify:
                    if event.last_notified > 0 and now - event.timestamp > self.batch_intervals.get(severity, 60):
                        self.stats['notifications_repeated'] += 1
            except Exception as e:
                logger.error(f"Webhook send failed: {e}")
                self.stats['errors'] += 1

        # Call custom callback for each event
        if self.on_event:
            for event in to_notify:
                try:
                    self.on_event(event)
                except Exception:
                    pass

    def _send_webhook(self, events: list[TrapEvent], severity: str):
        """Send batched notification to webhook (Telegram/Discord/Slack/generic)."""
        import urllib.request

        # Build message
        lines = [f"*SNMP Trap Alert — {severity.upper()}*"]
        lines.append(f"Events: {len(events)}")
        lines.append("")

        for event in events[:20]:  # Limit to 20 per message
            onu_label = event.onu_index
            if event.name:
                onu_label += f" ({event.name})"
            lines.append(f"• ONU `{onu_label}` on {event.olt_ip}")
            if event.serial_number:
                lines.append(f"  Serial: {event.serial_number}")
            if event.status:
                lines.append(f"  Status: {event.status}")
            if event.rx_power is not None:
                lines.append(f"  RX Power: {event.rx_power} dBm")
            if event.verified:
                lines.append(f"  ✅ SNMP Verified")
            lines.append(f"  {event.description}")

        if len(events) > 20:
            lines.append(f"... and {len(events) - 20} more")

        message = "\n".join(lines)

        if self.webhook_type == 'telegram':
            payload = json.dumps({
                'chat_id': self.webhook_chat_id,
                'text': message,
                'parse_mode': 'Markdown',
            }).encode()
            req = urllib.request.Request(
                self.webhook_url,
                data=payload,
                headers={'Content-Type': 'application/json'},
            )
        elif self.webhook_type == 'discord':
            payload = json.dumps({
                'content': message,
            }).encode()
            req = urllib.request.Request(
                self.webhook_url,
                data=payload,
                headers={'Content-Type': 'application/json'},
            )
        elif self.webhook_type == 'slack':
            payload = json.dumps({
                'text': message,
            }).encode()
            req = urllib.request.Request(
                self.webhook_url,
                data=payload,
                headers={'Content-Type': 'application/json'},
            )
        else:
            # Generic HTTP POST
            payload = json.dumps({
                'severity': severity,
                'events': [e.to_dict() for e in events],
            }).encode()
            req = urllib.request.Request(
                self.webhook_url,
                data=payload,
                headers={'Content-Type': 'application/json'},
            )

        urllib.request.urlopen(req, timeout=10)
        logger.info(f"Webhook sent ({self.webhook_type}): {len(events)} {severity} events")

    def get_stats(self) -> dict:
        """Get listener statistics."""
        with self._pending_lock:
            pending_count = sum(len(v) for v in self._pending.values())
        return {
            **self.stats,
            'running': self._running,
            'port': self.port,
            'pending_events': pending_count,
        }


# ---------------------------------------------------------------------------
# Integration helper — start trap listener alongside Flask app
# ---------------------------------------------------------------------------
_trap_listeners: dict[str, TrapListener] = {}


def start_trap_listeners(olts: list[dict], **kwargs) -> dict[str, TrapListener]:
    """Start trap listeners for multiple OLTs.

    Args:
        olts: List of dicts with keys: ip, community, port, name
        **kwargs: Additional args passed to TrapListener (webhook_url, etc.)

    Returns:
        Dict mapping OLT IP to TrapListener instance
    """
    result = {}
    for olt in olts:
        ip = olt.get('ip', '')
        if not ip:
            continue

        # All OLTs send traps to the same port — one listener handles all
        # But we can start per-OLT listeners on different ports if needed
        listener = TrapListener(
            olt_ip=ip,
            community=olt.get('community', 'public'),
            port=olt.get('trap_port', 162),
            **kwargs,
        )
        listener.start()
        result[ip] = listener
        _trap_listeners[ip] = listener

    return result


def stop_all_trap_listeners():
    """Stop all running trap listeners."""
    for ip, listener in _trap_listeners.items():
        listener.stop()
    _trap_listeners.clear()


def get_trap_stats() -> dict:
    """Get aggregated stats from all trap listeners."""
    return {ip: l.get_stats() for ip, l in _trap_listeners.items()}


# ---------------------------------------------------------------------------
# Power Monitor — scheduled RX power threshold check
# ---------------------------------------------------------------------------
class PowerMonitor:
    """Periodically checks ONU RX power levels and sends alerts.

    Inspired by snmp-olt-zte power_monitor.go:
    - Cron-based scheduling with timezone support
    - Configurable high/low thresholds (dBm)
    - Alert deduplication: don't re-alert same ONU within repeat window
    - Uses cached ONU list (from trap listener or sync) to check RX power

    Usage:
        pm = PowerMonitor(
            olt_ip='10.0.0.1',
            community='public',
            snmp_port=161,
            high_threshold=-8.0,   # Overload (too hot)
            low_threshold=-28.0,   # Weak signal (too cold)
            interval=300,           # Check every 5 minutes
            webhook_url='https://...',
        )
        pm.start()  # non-blocking
    """

    def __init__(
        self,
        olt_ip: str,
        community: str = 'public',
        snmp_port: int = 161,
        high_threshold: float = -8.0,
        low_threshold: float = -28.0,
        interval: int = 300,
        cron_expr: Optional[str] = None,
        timezone: str = 'Asia/Jakarta',
        webhook_url: Optional[str] = None,
        webhook_type: str = 'generic',
        webhook_chat_id: Optional[str] = None,
        repeat_interval: int = 3600,
        on_alert: Optional[Callable] = None,
    ):
        self.olt_ip = olt_ip
        self.community = community
        self.snmp_port = snmp_port
        self.high_threshold = high_threshold
        self.low_threshold = low_threshold
        self.interval = interval
        self.cron_expr = cron_expr
        self.timezone = timezone
        self.webhook_url = webhook_url
        self.webhook_type = webhook_type
        self.webhook_chat_id = webhook_chat_id
        self.repeat_interval = repeat_interval
        self.on_alert = on_alert

        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._alerted: dict[str, float] = {}  # onu_key -> last_alert_time
        self._lock = threading.Lock()

    def start(self):
        """Start the power monitor (non-blocking)."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(
            target=self._monitor_loop, daemon=True, name='power-monitor'
        )
        self._thread.start()
        logger.info(
            f"Power monitor started: {self.olt_ip} "
            f"high={self.high_threshold}dBm low={self.low_threshold}dBm "
            f"interval={self.interval}s"
        )

    def stop(self):
        """Stop the power monitor."""
        self._running = False
        logger.info("Power monitor stopped")

    def _monitor_loop(self):
        """Main monitoring loop."""
        while self._running:
            try:
                self._scan()
            except Exception as e:
                logger.error(f"Power monitor scan error: {e}")

            # Wait for next interval
            wait = self.interval
            while wait > 0 and self._running:
                time.sleep(min(wait, 1.0))
                wait -= 1

    def _scan(self):
        """Scan all ONUs for abnormal RX power levels."""
        from snmp_core import SNMPCollector

        collector = SNMPCollector(
            ip=self.olt_ip,
            community=self.community,
            port=self.snmp_port,
        )

        onus = collector.collect_onus_light()
        if not onus:
            return

        now = time.time()
        alerts = []

        for onu in onus:
            rx = onu.get('rx_power')  # OLT RX (upstream)
            onu_rx = onu.get('onu_rx_power')  # ONU RX (downstream)

            # Check both RX values
            rx_val = rx if rx is not None else onu_rx
            if rx_val is None:
                continue

            onu_key = f"{onu['frame']}/{onu['slot']}/{onu['port']}:{onu['onu_id']}"

            # Check thresholds
            if rx_val > self.high_threshold:
                severity = SEVERITY_HIGH
                condition = 'overload'
                desc = f"RX power {rx_val}dBm > {self.high_threshold}dBm (overload)"
            elif rx_val < self.low_threshold:
                severity = SEVERITY_CRITICAL
                condition = 'weak_signal'
                desc = f"RX power {rx_val}dBm < {self.low_threshold}dBm (weak signal)"
            else:
                # Normal — clear any existing alert
                with self._lock:
                    self._alerted.pop(onu_key, None)
                continue

            # Check repeat interval — don't re-alert too frequently
            with self._lock:
                last_alert = self._alerted.get(onu_key, 0)
                if last_alert > 0 and now - last_alert < self.repeat_interval:
                    continue
                self._alerted[onu_key] = now

            event = TrapEvent(
                olt_ip=self.olt_ip,
                onu_index=onu_key,
                severity=severity,
                description=desc,
            )
            event.name = onu.get('name', '')
            event.serial_number = onu.get('serial_number', '')
            event.rx_power = rx_val
            event.status = onu.get('status', '')
            event.event_type = condition
            alerts.append(event)

        if not alerts:
            return

        logger.info(f"Power monitor: {len(alerts)} alerts from {self.olt_ip}")

        # Send webhook
        if self.webhook_url:
            try:
                self._send_power_webhook(alerts)
            except Exception as e:
                logger.error(f"Power monitor webhook failed: {e}")

        # Call custom callback
        if self.on_alert:
            for event in alerts:
                try:
                    self.on_alert(event)
                except Exception:
                    pass

    def _send_power_webhook(self, alerts: list[TrapEvent]):
        """Send power monitor alerts via webhook."""
        import urllib.request

        lines = [f"*RX Power Monitor Alert*"]
        lines.append(f"OLT: {self.olt_ip}")
        lines.append(f"Alerts: {len(alerts)}")
        lines.append("")

        for event in alerts[:20]:
            onu_label = event.onu_index
            if event.name:
                onu_label += f" ({event.name})"
            lines.append(f"• ONU `{onu_label}`")
            if event.serial_number:
                lines.append(f"  Serial: {event.serial_number}")
            lines.append(f"  RX: {event.rx_power}dBm")
            lines.append(f"  {event.description}")

        if len(alerts) > 20:
            lines.append(f"... and {len(alerts) - 20} more")

        message = "\n".join(lines)

        if self.webhook_type == 'telegram':
            payload = json.dumps({
                'chat_id': self.webhook_chat_id,
                'text': message,
                'parse_mode': 'Markdown',
            }).encode()
        elif self.webhook_type == 'discord':
            payload = json.dumps({'content': message}).encode()
        else:
            payload = json.dumps({
                'source': 'power_monitor',
                'olt_ip': self.olt_ip,
                'alerts': [e.to_dict() for e in alerts],
            }).encode()

        req = urllib.request.Request(
            self.webhook_url,
            data=payload,
            headers={'Content-Type': 'application/json'},
        )
        urllib.request.urlopen(req, timeout=10)
        logger.info(f"Power monitor webhook sent: {len(alerts)} alerts")


# Power monitor instances registry
_power_monitors: dict[str, PowerMonitor] = {}


def start_power_monitors(olts: list[dict], **kwargs) -> dict[str, PowerMonitor]:
    """Start power monitors for multiple OLTs.

    Args:
        olts: List of dicts with keys: ip, community, snmp_port
        **kwargs: Additional args for PowerMonitor (thresholds, webhook, etc.)

    Returns:
        Dict mapping OLT IP to PowerMonitor instance
    """
    result = {}
    for olt in olts:
        ip = olt.get('ip', '')
        if not ip:
            continue
        pm = PowerMonitor(
            olt_ip=ip,
            community=olt.get('community', 'public'),
            snmp_port=olt.get('snmp_port', 161),
            **kwargs,
        )
        pm.start()
        result[ip] = pm
        _power_monitors[ip] = pm
    return result


def stop_all_power_monitors():
    """Stop all running power monitors."""
    for ip, pm in _power_monitors.items():
        pm.stop()
    _power_monitors.clear()


def get_power_monitor_stats() -> dict:
    """Get stats from all power monitors."""
    return {ip: {'running': pm._running, 'alerted': len(pm._alerted)} for ip, pm in _power_monitors.items()}
