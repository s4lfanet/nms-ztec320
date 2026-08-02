"""
Alert monitoring module for FiberNMS.
Runs as a background thread to detect:
- ONU status changes (offline, dyinggasp, los)
- RX power degradation (per-PON batched)
- Recovery events (ONU back online after outage)
- Unconfigured ONUs

Sends notifications via:
- In-app bell notifications
- Telegram bot
- WhatsApp API (third-party or native gateway)

Alerts are batched by PON port — multiple affected ONUs on the same
PON interface are grouped into a single alert message with impact summary.
"""
import logging
import time
import threading
import asyncio
import urllib.request
import urllib.error
import json
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

# ─── Timezone helper ───

def _get_tz():
    """Get configured timezone, default Asia/Jakarta."""
    try:
        from models import SystemConfig
        cfg = SystemConfig.query.filter_by(key='timezone').first()
        if cfg and cfg.value:
            from zoneinfo import ZoneInfo
            return ZoneInfo(cfg.value)
    except Exception:
        pass
    from zoneinfo import ZoneInfo
    return ZoneInfo('Asia/Jakarta')


def _fmt_time(dt=None):
    """Format datetime in Indonesian locale using configured timezone."""
    if dt is None:
        dt = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    tz = _get_tz()
    local = dt.astimezone(tz)
    return local.strftime('%d/%m/%Y, %H.%M.%S')


def _get_check_interval():
    """Read alert check interval from SystemConfig, default 60 seconds."""
    try:
        from models import db, SystemConfig
        config = SystemConfig.query.filter_by(key='alert_check_interval').first()
        if config and config.value:
            interval = int(config.value)
            if interval >= 10:
                return interval
    except Exception:
        pass
    return 60


# ─── OLT Health Check ───

def _check_olt_health(olt, rule, now, notifications_to_create, alerts_to_send):
    """Check OLT reachability and system health (CPU, memory, temperature) via SNMP.
    Uses vendor-specific OIDs. For ZTE C300/C320: standard enterprise OIDs.
    Returns True if OLT is reachable, False if offline."""
    from models import db, AlertHistory, Notification

    is_reachable = False
    cpu_load = None
    mem_usage = None
    temperature = None

    # ── SNMP health check ──
    try:
        async def _snmp_health():
            from pysnmp.hlapi.v1arch.asyncio import Slim, ObjectType, ObjectIdentity
            from snmp_core import OID_SYS_DESCR

            result = {'reachable': False, 'cpu': None, 'mem': None, 'temp': None}

            # Step 1: Ping OLT via sysDescr GET
            slim = Slim(1)
            try:
                ei, es, eidx, vb = await slim.get(
                    olt.snmp_community or 'public', olt.ip_address, olt.snmp_port or 161,
                    ObjectType(ObjectIdentity(OID_SYS_DESCR)), timeout=5, retries=2)
                if not ei and not es:
                    result['reachable'] = True
                    result['description'] = str(vb[0][1]).strip()
            except Exception:
                pass
            finally:
                slim.close()

            if not result['reachable']:
                return result

            # Step 2: Check CPU, Memory, Temperature (ZTE C300/C320 OIDs)
            # These OIDs are from the .3902.1082 tree (C300 enterprise MIB)
            # C320 may or may not support them — failure is gracefully handled
            health_oids = {
                'cpu':  '1.3.6.1.4.1.3902.1082.10.1.2.4.1.9.1.1',   # CPU Load %
                'mem':  '1.3.6.1.4.1.3902.1082.10.1.2.4.1.11.1.1',  # Memory Usage %
                'temp': '1.3.6.1.4.1.3902.1082.10.10.2.1.6.1.2.1.1', # Temperature °C
            }

            for key, oid in health_oids.items():
                slim2 = Slim(1)
                try:
                    ei2, es2, eidx2, vb2 = await slim2.get(
                        olt.snmp_community or 'public', olt.ip_address, olt.snmp_port or 161,
                        ObjectType(ObjectIdentity(oid)), timeout=3, retries=1)
                    if not ei2 and not es2:
                        val = int(vb2[0][1])
                        result[key] = val
                except Exception:
                    pass  # OID not supported on this vendor/firmware — skip
                finally:
                    slim2.close()

            return result

        loop = asyncio.new_event_loop()
        try:
            snmp_result = loop.run_until_complete(_snmp_health())
        finally:
            loop.close()

        is_reachable = snmp_result.get('reachable', False)
        cpu_load = snmp_result.get('cpu')
        mem_usage = snmp_result.get('mem')
        temperature = snmp_result.get('temp')

    except Exception as e:
        logger.error(f"[ALERT] OLT health SNMP check failed for {olt.name}: {e}")
        is_reachable = False

    # ── OLT Offline Alert ──
    if not is_reachable:
        if not rule.check_olt_offline:
            return False

        recent = AlertHistory.query.filter_by(
            olt_id=olt.id, alert_type='olt_offline'
        ).filter(
            AlertHistory.last_alert_at > now - timedelta(hours=2)
        ).first()

        if not recent:
            title = f"🔴 OLT OFFLINE: {olt.name}"
            message = (
                f"🔴 OLT OFFLINE 🔴\n\n"
                f"OLT: {olt.name} ({olt.ip_address})\n"
                f"Vendor: {olt.vendor or 'Unknown'}\n"
                f"Status: Tidak dapat dijangkau via SNMP\n\n"
                f"⚠️ Indikasi: OLT mati, jaringan terputus, atau SNMP tidak merespons.\n"
                f"⚠️ Semua monitoring ONU untuk OLT ini di-sampai OLT kembali online.\n\n"
                f"🕒 Waktu: {_fmt_time(now)}"
            )

            existing = Notification.query.filter_by(
                olt_id=olt.id, category='olt_offline', is_read=False
            ).first()

            if existing:
                existing.created_at = now
                existing.message = message
            else:
                notifications_to_create.append({
                    'olt_id': olt.id,
                    'onu_id': None,
                    'severity': 'critical',
                    'category': 'olt_offline',
                    'title': title,
                    'message': message,
                    'target_roles': '',
                })

            if not existing:
                alerts_to_send.append({
                    'type': 'olt_offline',
                    'severity': 'critical',
                    'title': title,
                    'message': message,
                    'olt_name': olt.name,
                    'olt_ip': olt.ip_address,
                    'is_recovery': False,
                })

            # Update history
            hist = AlertHistory.query.filter_by(olt_id=olt.id, alert_type='olt_offline').first()
            if hist:
                hist.last_alert_at = now
                hist.last_value = 'offline'
            else:
                db.session.add(AlertHistory(olt_id=olt.id, alert_type='olt_offline', last_value='offline', last_alert_at=now))

        # Mark OLT offline in DB
        if olt.is_online:
            olt.is_online = False
            db.session.commit()
            logger.warning(f"[ALERT] OLT {olt.name} marked offline")

        return False

    # ── OLT is reachable ──
    # Clear offline alert if OLT was previously offline
    was_offline = AlertHistory.query.filter_by(olt_id=olt.id, alert_type='olt_offline').first()
    if was_offline and was_offline.last_value == 'offline':
        was_offline.last_value = 'online'
        was_offline.last_alert_at = now

        # Auto-resolve old OLT offline notification
        old_offline_notif = Notification.query.filter_by(
            olt_id=olt.id, category='olt_offline', resolved=False
        ).first()
        if old_offline_notif:
            old_offline_notif.resolved = True
            old_offline_notif.resolved_at = now
            old_offline_notif.is_read = True

        # Dedup: check existing unread OLT recovery notification
        existing_recovery = Notification.query.filter_by(
            olt_id=olt.id, category='olt_recovery', is_read=False, resolved=False
        ).first()
        if not existing_recovery:
            notifications_to_create.append({
                'olt_id': olt.id,
                'onu_id': None,
                'severity': 'info',
                'category': 'olt_recovery',
                'title': f"✅ OLT ONLINE: {olt.name}",
                'message': (
                    f"✅ OLT KEMBALI ONLINE ✅\n\n"
                    f"OLT: {olt.name} ({olt.ip_address})\n"
                    f"Status: Sudah kembali dapat dijangkau\n\n"
                    f"🕒 Waktu: {_fmt_time(now)}"
                ),
                'target_roles': '',
            })

    if not olt.is_online:
        olt.is_online = True

    # ── CPU Alert ──
    if cpu_load is not None and rule.check_olt_cpu and cpu_load >= rule.olt_cpu_threshold:
        recent_cpu = AlertHistory.query.filter_by(
            olt_id=olt.id, alert_type='olt_cpu_high'
        ).filter(
            AlertHistory.last_alert_at > now - timedelta(hours=1)
        ).first()

        if not recent_cpu:
            title = f"⚠️ CPU Tinggi: {olt.name} ({cpu_load}%)"
            message = (
                f"OLT: {olt.name} ({olt.ip_address})\n"
                f"CPU Load: {cpu_load}% (threshold: {rule.olt_cpu_threshold}%)\n\n"
                f"🕒 Waktu: {_fmt_time(now)}"
            )

            existing = Notification.query.filter_by(
                olt_id=olt.id, category='olt_cpu_high', is_read=False
            ).first()

            if not existing:
                notifications_to_create.append({
                    'olt_id': olt.id, 'onu_id': None,
                    'severity': 'warning', 'category': 'olt_cpu_high',
                    'title': title, 'message': message, 'target_roles': '',
                })
                alerts_to_send.append({
                    'type': 'olt_cpu_high', 'severity': 'warning',
                    'title': title, 'message': message,
                    'olt_name': olt.name, 'olt_ip': olt.ip_address, 'is_recovery': False,
                })

            hist = AlertHistory.query.filter_by(olt_id=olt.id, alert_type='olt_cpu_high').first()
            if hist:
                hist.last_alert_at = now; hist.last_value = str(cpu_load)
            else:
                db.session.add(AlertHistory(olt_id=olt.id, alert_type='olt_cpu_high', last_value=str(cpu_load), last_alert_at=now))

    # ── Memory Alert ──
    if mem_usage is not None and rule.check_olt_memory and mem_usage >= rule.olt_memory_threshold:
        recent_mem = AlertHistory.query.filter_by(
            olt_id=olt.id, alert_type='olt_mem_high'
        ).filter(
            AlertHistory.last_alert_at > now - timedelta(hours=1)
        ).first()

        if not recent_mem:
            title = f"⚠️ Memory Tinggi: {olt.name} ({mem_usage}%)"
            message = (
                f"OLT: {olt.name} ({olt.ip_address})\n"
                f"Memory Usage: {mem_usage}% (threshold: {rule.olt_memory_threshold}%)\n\n"
                f"🕒 Waktu: {_fmt_time(now)}"
            )

            existing = Notification.query.filter_by(
                olt_id=olt.id, category='olt_mem_high', is_read=False
            ).first()

            if not existing:
                notifications_to_create.append({
                    'olt_id': olt.id, 'onu_id': None,
                    'severity': 'warning', 'category': 'olt_mem_high',
                    'title': title, 'message': message, 'target_roles': '',
                })
                alerts_to_send.append({
                    'type': 'olt_mem_high', 'severity': 'warning',
                    'title': title, 'message': message,
                    'olt_name': olt.name, 'olt_ip': olt.ip_address, 'is_recovery': False,
                })

            hist = AlertHistory.query.filter_by(olt_id=olt.id, alert_type='olt_mem_high').first()
            if hist:
                hist.last_alert_at = now; hist.last_value = str(mem_usage)
            else:
                db.session.add(AlertHistory(olt_id=olt.id, alert_type='olt_mem_high', last_value=str(mem_usage), last_alert_at=now))

    # ── Temperature Alert ──
    if temperature is not None and rule.check_olt_temperature and temperature >= rule.olt_temp_threshold:
        recent_temp = AlertHistory.query.filter_by(
            olt_id=olt.id, alert_type='olt_temp_high'
        ).filter(
            AlertHistory.last_alert_at > now - timedelta(hours=1)
        ).first()

        if not recent_temp:
            title = f"🌡️ Suhu Tinggi: {olt.name} ({temperature}°C)"
            message = (
                f"OLT: {olt.name} ({olt.ip_address})\n"
                f"Temperature: {temperature}°C (threshold: {rule.olt_temp_threshold}°C)\n\n"
                f"⚠️ Indikasi: Suhu OLT melebihi batas aman. Periksa ventilasi dan pendingin.\n\n"
                f"🕒 Waktu: {_fmt_time(now)}"
            )

            existing = Notification.query.filter_by(
                olt_id=olt.id, category='olt_temp_high', is_read=False
            ).first()

            if not existing:
                notifications_to_create.append({
                    'olt_id': olt.id, 'onu_id': None,
                    'severity': 'critical', 'category': 'olt_temp_high',
                    'title': title, 'message': message, 'target_roles': '',
                })
                alerts_to_send.append({
                    'type': 'olt_temp_high', 'severity': 'critical',
                    'title': title, 'message': message,
                    'olt_name': olt.name, 'olt_ip': olt.ip_address, 'is_recovery': False,
                })

            hist = AlertHistory.query.filter_by(olt_id=olt.id, alert_type='olt_temp_high').first()
            if hist:
                hist.last_alert_at = now; hist.last_value = str(temperature)
            else:
                db.session.add(AlertHistory(olt_id=olt.id, alert_type='olt_temp_high', last_value=str(temperature), last_alert_at=now))

    # ── Auto-resolve OLT health alerts when condition clears ──
    health_checks = [
        ('olt_cpu_high', 'olt_cpu_high', cpu_load, rule.olt_cpu_threshold if rule.check_olt_cpu else 999),
        ('olt_mem_high', 'olt_mem_high', mem_usage, rule.olt_memory_threshold if rule.check_olt_memory else 999),
        ('olt_temp_high', 'olt_temp_high', temperature, rule.olt_temp_threshold if rule.check_olt_temperature else 999),
    ]
    for atype, cat, current_val, threshold in health_checks:
        active_notif = Notification.query.filter_by(
            olt_id=olt.id, category=cat, resolved=False
        ).first()
        if active_notif and current_val is not None and current_val < threshold:
            hist = AlertHistory.query.filter_by(olt_id=olt.id, alert_type=atype).first()
            if hist:
                hist.last_alert_at = now - timedelta(hours=24)
            active_notif.resolved = True
            active_notif.resolved_at = now
            active_notif.is_read = True

    return True


def run_alert_monitor(app):
    """Background thread that monitors ONU status changes and sends alerts."""
    logger.info("[ALERT] Alert monitor started")

    try:
        time.sleep(5)
        with app.app_context():
            _check_onus()
    except Exception as e:
        logger.error(f"[ALERT] Initial check error: {e}")

    while True:
        try:
            with app.app_context():
                interval = _get_check_interval()
            time.sleep(interval)
            with app.app_context():
                _check_onus()
        except Exception as e:
            logger.error(f"[ALERT] Monitor error: {e}")
            time.sleep(30)


# ─── Main check function ───

def _check_onus(force_send=False):
    """Check all ONUs for alert conditions. Batch by PON port.

    Args:
        force_send: If True, always send external alerts even if notification
                    already exists (used by manual recheck)."""
    _check_onus_for_tenant(force_send=force_send)


def _check_onus_for_tenant(force_send=False):
    """Check ONUs for alert conditions."""
    from models import db, OLT, ONU, Notification, AlertRule, AlertHistory, BotConfig

    rule = AlertRule.query.first()

    if not rule:
        existing_count = AlertRule.query.count()
        if existing_count == 0:
            rule = AlertRule(name='Default Alert Rule')
            db.session.add(rule)
            db.session.commit()
            logger.info("[ALERT] Auto-created default alert rule")
        else:
            logger.warning(f"[ALERT] Found {existing_count} existing rules but none matched — skipping")
            return

    if not rule.enabled:
        return

    olts = OLT.query.filter_by(monitoring_enabled=True).all()
    if not olts:
        return

    # Naive UTC — DB DateTime columns (SQLite) store/return naive datetimes,
    # so `now` must be naive too to avoid "can't compare offset-naive and
    # offset-aware datetimes" when comparing against AlertHistory/Notification/
    # MaintenanceWindow timestamps below.
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    notifications_to_create = []
    alerts_to_send = []
    recovery_to_send = []

    # Collect events grouped by (olt_id, slot, port)
    pon_groups = {}
    recovery_groups = {}

    for olt in olts:
        # ─── Maintenance Window Check ───
        from models import MaintenanceWindow
        in_maintenance = MaintenanceWindow.query.filter(
            MaintenanceWindow.start_time <= now,
            MaintenanceWindow.end_time >= now,
        ).filter(
            (MaintenanceWindow.olt_id == olt.id) | (MaintenanceWindow.olt_id.is_(None))
        ).first()
        if in_maintenance:
            logger.info(f"[ALERT] OLT {olt.name} is in maintenance window — skipping alerts")
            continue

        # ─── OLT Health Check (Fase 2A) ───
        olt_reachable = _check_olt_health(olt, rule, now, notifications_to_create, alerts_to_send)
        if not olt_reachable:
            logger.info(f"[ALERT] OLT {olt.name} is offline — skipping ONU checks")
            continue  # Skip ONU checks for unreachable OLT (avoid false positives)

        onus = ONU.query.filter_by(olt_id=olt.id).all()

        for onu in onus:
            pon_key = (olt.id, onu.slot, onu.port)

            if pon_key not in pon_groups:
                pon_groups[pon_key] = {
                    'olt': olt, 'slot': onu.slot, 'port': onu.port,
                    'total': 0, 'offline': [], 'signal_drop': [], 'recovery': [],
                }
            pon_groups[pon_key]['total'] += 1

            # ─── Check offline/dyinggasp/los (with debounce) ───
            if onu.status in ('offline', 'dyinggasp', 'los') and rule.check_offline:
                hist = AlertHistory.query.filter_by(
                    onu_id=onu.id, alert_type=onu.status
                ).first()

                already_alerted_recently = (
                    hist and hist.last_alert_at
                    and hist.last_alert_at > now - timedelta(hours=2)
                )

                if not already_alerted_recently:
                    if hist and hist.first_seen_at:
                        # Second+ detection — check if debounce period passed
                        debounce_seconds = 120  # 2 minutes
                        elapsed = (now - hist.first_seen_at).total_seconds()
                        if elapsed >= debounce_seconds:
                            # Debounce passed — fire alert
                            pon_groups[pon_key]['offline'].append(onu)
                            hist.last_value = onu.status
                            hist.last_alert_at = now

                            from models import UptimeLog
                            db.session.add(UptimeLog(
                                onu_id=onu.id, olt_id=olt.id,
                                old_status='online', new_status=onu.status,
                                changed_at=now
                            ))
                        # else: within debounce window — wait for next check
                    else:
                        # First detection — record but don't fire yet
                        if hist:
                            hist.first_seen_at = now
                            hist.last_value = onu.status
                        else:
                            db.session.add(AlertHistory(
                                onu_id=onu.id, alert_type=onu.status,
                                last_value=onu.status, first_seen_at=now,
                            ))

            # ─── Check recovery (was offline, now online) ───
            elif onu.status == 'online':
                recent_offline = AlertHistory.query.filter_by(
                    onu_id=onu.id
                ).filter(
                    AlertHistory.alert_type.in_(['offline', 'dyinggasp', 'los'])
                ).filter(
                    AlertHistory.last_alert_at > now - timedelta(hours=6)
                ).first()

                if recent_offline:
                    pon_groups[pon_key]['recovery'].append(onu)
                    recent_offline.last_alert_at = now - timedelta(hours=24)
                    recent_offline.first_seen_at = None  # reset for next cycle

                    from models import UptimeLog
                    db.session.add(UptimeLog(
                        onu_id=onu.id, olt_id=olt.id,
                        old_status='offline', new_status='online',
                        changed_at=now
                    ))

                    # Auto-resolve old offline notifications for this ONU
                    old_notifs = Notification.query.filter_by(
                        onu_id=onu.id, resolved=False
                    ).filter(
                        Notification.category.in_(['offline', 'dyinggasp', 'los', 'offline_batch', 'dyinggasp_batch', 'los_batch'])
                    ).all()
                    for n in old_notifs:
                        n.resolved = True
                        n.resolved_at = now
                        n.is_read = True

                else:
                    # ONU online, no recent offline — clean up any stale AlertHistory
                    stale = AlertHistory.query.filter_by(
                        onu_id=onu.id
                    ).filter(
                        AlertHistory.alert_type.in_(['offline', 'dyinggasp', 'los'])
                    ).filter(
                        AlertHistory.first_seen_at.isnot(None)
                    ).filter(
                        AlertHistory.last_alert_at <= now - timedelta(hours=2)
                    ).all()
                    for s in stale:
                        s.first_seen_at = None  # reset debounce (ONU recovered before alert fired)

            # ─── Check RX power degradation (use ONU RX, not OLT RX) ───
            if onu.onu_rx_power is not None and rule.check_rx_power and onu.status == 'online':
                _check_rx_power_batched(onu, olt, rule, now, pon_key, pon_groups)

            # ─── Check unconfigured ───
            if not onu.name or onu.name in ('Unnamed', ''):
                _handle_unconfigured_alert(onu, olt, rule, now, notifications_to_create, alerts_to_send)

    # ─── Build batched alerts from PON groups ───
    for pon_key, group in pon_groups.items():
        olt = group['olt']
        interface = f"gpon-olt_1/{group['slot']}/{group['port']}"
        total = group['total']

        offline_onus = group['offline']
        if offline_onus:
            _build_offline_batch(olt, interface, offline_onus, total, now,
                                 notifications_to_create, alerts_to_send, force_send)

        drop_onus = group['signal_drop']
        if drop_onus:
            _build_signal_drop_batch(olt, interface, drop_onus, total, now,
                                     notifications_to_create, alerts_to_send, force_send)

        recovery_onus = group['recovery']
        if recovery_onus:
            _build_recovery_batch(olt, interface, recovery_onus, total, now,
                                  notifications_to_create, recovery_to_send)

    # ─── Check unregistered ONUs via Telnet (show pon onu uncfg) ───
    for olt in olts:
        if not olt.telnet_enabled:
            continue
        try:
            from snmp_collector import TelnetCollector
            tc = TelnetCollector(olt.ip_address, olt.cli_username, olt.cli_password, olt.telnet_port)
            unregistered = tc.collect_unregistered_onus()
            if unregistered:
                _build_unregistered_alert(olt, unregistered, now,
                                          notifications_to_create, alerts_to_send, force_send)
        except Exception as e:
            logger.error(f"[ALERT] Unregistered check failed for {olt.name}: {e}")

    # ─── Create notifications ───
    if notifications_to_create:
        for notif_data in notifications_to_create:
            notif = Notification(**notif_data)
            db.session.add(notif)
        logger.info(f"[ALERT] Created {len(notifications_to_create)} notifications")

    # ─── Auto-cleanup: delete old read/resolved notifications (>7 days) ───
    try:
        cutoff = now - timedelta(days=7)
        old_notifs = Notification.query.filter(
            Notification.is_read == True
        ).filter(
            Notification.created_at < cutoff
        ).all()
        for n in old_notifs:
            db.session.delete(n)
        if old_notifs:
            logger.info(f"[ALERT] Auto-cleanup: removed {len(old_notifs)} old notifications (>7d)")
    except Exception as e:
        logger.debug(f"[ALERT] Auto-cleanup error: {e}")

    # Always commit — AlertHistory updates need to persist even if no new notifications
    db.session.commit()

    # ─── Push real-time alert to WebSocket clients ───
    if notifications_to_create or recovery_to_send:
        try:
            from ws_bridge import ws_broadcast_dashboard
            for notif_data in notifications_to_create:
                ws_broadcast_dashboard('alert', {
                    'type': 'new_alert',
                    'severity': notif_data.get('severity', 'info'),
                    'category': notif_data.get('category', 'status'),
                    'title': notif_data.get('title', ''),
                    'olt_id': notif_data.get('olt_id'),
                    'onu_id': notif_data.get('onu_id'),
                })
            for rec in recovery_to_send:
                ws_broadcast_dashboard('alert', {
                    'type': 'recovery',
                    'severity': rec.get('severity', 'info'),
                    'category': rec.get('type', 'recovery'),
                    'title': rec.get('title', ''),
                    'olt_name': rec.get('olt_name'),
                    'is_recovery': True,
                })
        except Exception as e:
            logger.debug(f"[ALERT] WS broadcast failed (server may be down): {e}")

    # ─── Send external alerts ───
    if alerts_to_send:
        _send_external_alerts(alerts_to_send)

    if recovery_to_send:
        _send_external_alerts(recovery_to_send)


# ─── Batch builders ───

def _build_offline_batch(olt, interface, offline_onus, total_onus, now,
                         notifications, alerts, force_send=False):
    """Build a batched offline alert for a PON port."""
    from models import Notification

    affected = len(offline_onus)
    statuses = {}
    for onu in offline_onus:
        s = onu.status
        if s not in statuses:
            statuses[s] = []
        statuses[s].append(onu)

    if 'dyinggasp' in statuses:
        primary = 'dyinggasp'
    elif 'los' in statuses:
        primary = 'los'
    else:
        primary = 'offline'

    onu_lines = []
    for onu in offline_onus:
        rx = f"{onu.onu_rx_power:.2f} dBm" if onu.onu_rx_power is not None else 'N/A'
        onu_lines.append(f"  • {onu.name or onu.serial_number or onu.onu_id_str} — {onu.status.upper()} (RX: {rx})")

    if affected == 1:
        onu = offline_onus[0]
        customer = ''
        if onu.odp_port and onu.odp_port.customer_name:
            customer = onu.odp_port.customer_name
        elif onu.odp_port and onu.odp_port.odp:
            customer = onu.odp_port.odp.name
        title = f"ONU {onu.status.upper()}: {onu.name or onu.serial_number}"
        message = (
            f"{'🔴' if onu.status == 'los' else '⚡' if onu.status == 'dyinggasp' else '⚫'} ONU {onu.status.upper()}\n\n"
            f"ONU: {onu.onu_id_str}\n"
            f"Name: {onu.name or 'N/A'}\n"
            f"Serial: {onu.serial_number or 'N/A'}\n"
        )
        if customer:
            message += f"Pelanggan: {customer}\n"
        message += (
            f"Status: {onu.status.upper()}\n"
            f"RX ONU: {f'{onu.onu_rx_power:.2f} dBm' if onu.onu_rx_power is not None else 'N/A'}\n"
            f"Distance: {f'{onu.distance} m' if onu.distance else 'N/A'}\n"
            f"OLT: {olt.name} ({olt.ip_address})\n"
            f"Interface: {interface}\n\n"
            f"🕒 {_fmt_time(now)}"
        )
        category = onu.status
    else:
        title = f"⚠️ {affected} ONU OFFLINE — {olt.name}"
        message = (
            f"⚠️ {affected} ONU OFFLINE ⚠️\n\n"
            f"OLT: {olt.name} ({olt.ip_address})\n"
            f"Interface: {interface}\n"
            f"Impact: {affected} dari {total_onus} Pelanggan\n\n"
            f"ONU Terdampak:\n" + "\n".join(onu_lines[:15])
        )
        if affected > 15:
            message += f"\n  ... dan {affected - 15} lainnya"
        message += f"\n\n🕒 Waktu: {_fmt_time(now)}"
        category = f'{primary}_batch'

    existing = Notification.query.filter_by(
        olt_id=olt.id, category=category, is_read=False
    ).first()

    if existing:
        existing.created_at = now
        existing.message = message
    else:
        notifications.append({
            'olt_id': olt.id,
            'onu_id': offline_onus[0].id if affected == 1 else None,
            'severity': 'critical' if primary == 'dyinggasp' else 'warning',
            'category': category,
            'title': title,
            'message': message,
            'target_roles': '',
        })

    if not existing or force_send:
        alerts.append({
            'type': 'offline_batch' if affected > 1 else primary,
            'severity': 'critical' if primary == 'dyinggasp' else 'warning',
            'title': title,
            'message': message,
            'olt_name': olt.name,
            'olt_ip': olt.ip_address,
            'interface': interface,
            'affected': affected,
            'total': total_onus,
            'is_recovery': False,
        })


def _build_signal_drop_batch(olt, interface, drop_onus, total_onus, now,
                              notifications, alerts, force_send=False):
    """Build a batched signal drop alert for a PON port."""
    from models import Notification

    affected = len(drop_onus)
    avg_drop = sum(d['drop'] for d in drop_onus) / affected if affected else 0

    odp_name = ''
    for d in drop_onus:
        if d['onu'].odp_port and d['onu'].odp_port.odp:
            odp_name = d['onu'].odp_port.odp.name
            break

    if affected == 1:
        d = drop_onus[0]
        onu = d['onu']
        customer = ''
        if onu.odp_port and onu.odp_port.customer_name:
            customer = onu.odp_port.customer_name
        title = f"📉 Signal Drop: {onu.name or onu.serial_number}"
        message = (
            f"📉 PENURUNAN SINYAL\n\n"
            f"ONU: {onu.onu_id_str}\n"
            f"Name: {onu.name or 'N/A'}\n"
            f"Serial: {onu.serial_number or 'N/A'}\n"
        )
        if customer:
            message += f"Pelanggan: {customer}\n"
        message += (
            f"RX ONU: {d['current']:.2f} dBm (sebelumnya {d['previous']:.2f} dBm)\n"
            f"Drop: ⬇️ {d['drop']:.2f} dB\n"
            f"Distance: {f'{onu.distance} m' if onu.distance else 'N/A'}\n"
            f"OLT: {olt.name} ({olt.ip_address})\n"
            f"Interface: {interface}\n\n"
            f"🕒 {_fmt_time(now)}"
        )
        category = 'rx_power'
    else:
        title = f"⚠️ MAJOR SIGNAL DROP — {olt.name}"
        odp_line = f"ODP: {odp_name}\n" if odp_name else ''
        message = (
            f"⚠️ MAJOR SIGNAL DROP ⚠️\n\n"
            f"OLT: {olt.name} ({olt.ip_address})\n"
            f"Interface: {interface}\n"
            f"{odp_line}"
            f"Impact: {affected} dari {total_onus} Pelanggan\n"
            f"Tingkat Drop: ⬇️ {avg_drop:.2f} dB\n\n"
            f"⚠️ Indikasi: Terjadi peluruhan sinyal massal. Segera periksa jalur distribusi!\n\n"
            f"🕒 Waktu: {_fmt_time(now)}"
        )
        category = 'signal_drop_batch'

    existing = Notification.query.filter_by(
        olt_id=olt.id, category=category, is_read=False
    ).first()

    if existing:
        existing.created_at = now
        existing.message = message
    else:
        notifications.append({
            'olt_id': olt.id,
            'onu_id': drop_onus[0]['onu'].id if affected == 1 else None,
            'severity': 'warning',
            'category': category,
            'title': title,
            'message': message,
            'target_roles': '',
        })

    if not existing or force_send:
        alerts.append({
            'type': 'signal_drop_batch' if affected > 1 else 'rx_power',
            'severity': 'warning',
            'title': title,
            'message': message,
            'olt_name': olt.name,
            'olt_ip': olt.ip_address,
            'interface': interface,
            'odp_name': odp_name,
            'affected': affected,
            'total': total_onus,
            'avg_drop': avg_drop,
            'is_recovery': False,
        })


def _build_recovery_batch(olt, interface, recovery_onus, total_onus, now,
                          notifications, recovery_alerts):
    """Build a batched recovery alert for a PON port."""
    from models import Notification

    recovered = len(recovery_onus)

    odp_name = ''
    for onu in recovery_onus:
        if onu.odp_port and onu.odp_port.odp:
            odp_name = onu.odp_port.odp.name
            break

    if recovered == 1:
        onu = recovery_onus[0]
        customer = ''
        if onu.odp_port and onu.odp_port.customer_name:
            customer = onu.odp_port.customer_name
        title = f"✅ Recovery: {onu.name or onu.serial_number}"
        message = (
            f"✅ ONU KEMBALI ONLINE\n\n"
            f"ONU: {onu.onu_id_str}\n"
            f"Name: {onu.name or 'N/A'}\n"
            f"Serial: {onu.serial_number or 'N/A'}\n"
        )
        if customer:
            message += f"Pelanggan: {customer}\n"
        message += (
            f"Status: ONLINE\n"
            f"RX ONU: {f'{onu.onu_rx_power:.2f} dBm' if onu.onu_rx_power is not None else 'N/A'}\n"
            f"Distance: {f'{onu.distance} m' if onu.distance else 'N/A'}\n"
            f"OLT: {olt.name} ({olt.ip_address})\n"
            f"Interface: {interface}\n\n"
            f"🕒 {_fmt_time(now)}"
        )
        category = 'recovery'
    else:
        odp_line = f"Kawasan/ODP: {odp_name}\n" if odp_name else ''
        title = f"✅ Recovery: {recovered} ONU back online — {olt.name}"
        message = (
            f"✅ RECOVERY: GANGGUAN MASSAL SELESAI ✅\n\n"
            f"OLT: {olt.name} ({olt.ip_address})\n"
            f"{odp_line}"
            f"Interface: {interface}\n"
            f"Status: Sudah kembali online ({recovered} dari {total_onus} Pelanggan Aktif).\n\n"
            f"🕒 Waktu: {_fmt_time(now)}"
        )
        category = 'recovery_batch'

    # Dedup: check existing unread recovery notification for this OLT
    existing = Notification.query.filter_by(
        olt_id=olt.id, category=category, is_read=False, resolved=False
    ).first()

    if existing:
        existing.created_at = now
        existing.message = message
        existing.title = title
    else:
        notifications.append({
            'olt_id': olt.id,
            'onu_id': recovery_onus[0].id if recovered == 1 else None,
            'severity': 'info',
            'category': category,
            'title': title,
            'message': message,
            'target_roles': '',
        })

    recovery_alerts.append({
        'type': 'recovery_batch' if recovered > 1 else 'recovery',
        'severity': 'info',
        'title': title,
        'message': message,
        'olt_name': olt.name,
        'olt_ip': olt.ip_address,
        'interface': interface,
        'odp_name': odp_name,
        'affected': recovered,
        'total': total_onus,
        'is_recovery': True,
    })


# ─── RX power check (batched) ───

def _check_rx_power_batched(onu, olt, rule, now, pon_key, pon_groups):
    """Check RX power degradation and add to PON group if affected.
    Uses ONU RX Power (onu_rx_power, OID .10) — what ONU receives from OLT."""
    from models import db, AlertHistory

    rx = onu.onu_rx_power
    if rx is None:
        return

    # Check absolute threshold
    if rx < rule.rx_threshold:
        recent = AlertHistory.query.filter_by(
            onu_id=onu.id, alert_type='rx_power_low'
        ).filter(
            AlertHistory.last_alert_at > now - timedelta(hours=2)
        ).first()

        if not recent:
            pon_groups[pon_key]['signal_drop'].append({
                'onu': onu,
                'current': rx,
                'previous': rule.rx_threshold,
                'drop': rule.rx_threshold - rx,
            })
            hist = AlertHistory.query.filter_by(onu_id=onu.id, alert_type='rx_power_low').first()
            if hist:
                hist.last_value = str(rx)
                hist.last_alert_at = now
            else:
                db.session.add(AlertHistory(onu_id=onu.id, alert_type='rx_power_low', last_value=str(rx)))

    # Check change threshold (compare with last recorded value)
    last = AlertHistory.query.filter_by(onu_id=onu.id, alert_type='rx_power_change').first()
    if last and last.last_value:
        try:
            prev_rx = float(last.last_value)
            change = prev_rx - rx  # positive = signal dropped
            if change >= rule.rx_change_threshold:
                recent = AlertHistory.query.filter_by(
                    onu_id=onu.id, alert_type='rx_power_drop'
                ).filter(
                    AlertHistory.last_alert_at > now - timedelta(hours=2)
                ).first()

                if not recent:
                    pon_groups[pon_key]['signal_drop'].append({
                        'onu': onu,
                        'current': rx,
                        'previous': prev_rx,
                        'drop': change,
                    })
                    hist = AlertHistory.query.filter_by(onu_id=onu.id, alert_type='rx_power_drop').first()
                    if hist:
                        hist.last_value = str(rx)
                        hist.last_alert_at = now
                    else:
                        db.session.add(AlertHistory(onu_id=onu.id, alert_type='rx_power_drop', last_value=str(rx)))
        except (ValueError, TypeError):
            pass

    # Always update last recorded RX value
    rx_history = AlertHistory.query.filter_by(onu_id=onu.id, alert_type='rx_power_change').first()
    if rx_history:
        rx_history.last_value = str(rx)
        rx_history.last_alert_at = now
    else:
        db.session.add(AlertHistory(onu_id=onu.id, alert_type='rx_power_change', last_value=str(rx)))


# ─── Unconfigured alert (kept individual) ───

def _handle_unconfigured_alert(onu, olt, rule, now, notifications, alerts):
    """Handle unconfigured ONU alerts."""
    from models import db, AlertHistory, Notification

    if onu.status not in ('online',):
        return

    recent = AlertHistory.query.filter_by(
        onu_id=onu.id, alert_type='unconfigured'
    ).filter(
        AlertHistory.last_alert_at > now - timedelta(hours=6)
    ).first()
    if recent:
        return

    title = f"Unconfigured ONU: {onu.serial_number or onu.onu_id_str}"
    message = (
        f"OLT: {olt.name} ({olt.ip_address})\n"
        f"ONU: {onu.onu_id_str}\n"
        f"Serial: {onu.serial_number or 'N/A'}\n"
        f"Status: {onu.status.upper()}\n"
        f"Note: ONU is online but has no name/description configured"
    )

    existing = Notification.query.filter_by(
        onu_id=onu.id, category='unconfigured', is_read=False
    ).first()

    if existing:
        existing.created_at = now
        existing.message = message
    else:
        notifications.append({
            'olt_id': olt.id,
            'onu_id': onu.id,
            'severity': 'warning',
            'category': 'unconfigured',
            'title': title,
            'message': message,
            'target_roles': '',
        })

    history = AlertHistory.query.filter_by(onu_id=onu.id, alert_type='unconfigured').first()
    if history:
        history.last_alert_at = now
    else:
        db.session.add(AlertHistory(onu_id=onu.id, alert_type='unconfigured', last_value=''))

    if not existing:
        alerts.append({
            'type': 'unconfigured',
            'severity': 'warning',
            'title': title,
            'message': message,
            'olt_name': olt.name,
            'is_recovery': False,
        })


# ─── Unregistered ONU alert (from Telnet show pon onu uncfg) ───

def _build_unregistered_alert(olt, unregistered, now, notifications, alerts, force_send=False):
    """Build alert for unregistered ONUs detected via Telnet."""
    from models import db, Notification, AlertHistory

    count = len(unregistered)

    # Dedup via AlertHistory: only send external alert once per 6 hours per OLT
    recent_alert = AlertHistory.query.filter_by(
        olt_id=olt.id, alert_type='unregistered'
    ).filter(
        AlertHistory.last_alert_at > now - timedelta(hours=6)
    ).first()

    # Build ONU list
    onu_lines = []
    for u in unregistered[:10]:
        sn = u.get('sn', '') or u.get('serial_number', '') or 'N/A'
        model = u.get('model', '') or u.get('type', '')
        iface = u.get('pon_port', '') or u.get('interface', '')
        if iface:
            iface = f'gpon-olt_{iface}'
        line = f"  • {iface} — SN: {sn}"
        if model:
            line += f" ({model})"
        onu_lines.append(line)

    title = f"⚠️ {count} ONU Belum Terdaftar — {olt.name}"
    message = (
        f"⚠️ ONU BELUM TERDAFTAR ⚠️\n\n"
        f"OLT: {olt.name} ({olt.ip_address})\n"
        f"Jumlah: {count} ONU menunggu registrasi\n\n"
        f"ONU Terdeteksi:\n" + "\n".join(onu_lines)
    )
    if count > 10:
        message += f"\n  ... dan {count - 10} lainnya"
    message += f"\n\n⚠️ Indikasi: Ada ONU yang terhubung ke PON tetapi belum diregistrasi di OLT.\n"
    message += f"🕒 Waktu: {_fmt_time(now)}"

    # Dedup: check existing unread notification with same title
    existing = Notification.query.filter_by(
        olt_id=olt.id, category='unconfig', is_read=False
    ).first()

    if existing:
        existing.created_at = now
        existing.message = message
        existing.title = title
    else:
        notifications.append({
            'olt_id': olt.id,
            'onu_id': None,
            'severity': 'warning',
            'category': 'unconfig',
            'title': title,
            'message': message,
            'target_roles': '',
        })

    # Only send external alert if:
    # - force_send (manual recheck) OR
    # - no recent AlertHistory entry (not sent in last 6 hours)
    should_send = force_send or not recent_alert
    if should_send:
        alerts.append({
            'type': 'unconfig',
            'severity': 'warning',
            'title': title,
            'message': message,
            'olt_name': olt.name,
            'olt_ip': olt.ip_address,
            'affected': count,
            'is_recovery': False,
        })

        # Only update AlertHistory when alert is actually sent — prevents 6h timer reset
        hist = AlertHistory.query.filter_by(olt_id=olt.id, alert_type='unregistered').first()
        if hist:
            hist.last_alert_at = now
            hist.last_value = str(count)
        else:
            db.session.add(AlertHistory(olt_id=olt.id, alert_type='unregistered', last_value=str(count), last_alert_at=now))


# ─── External alert senders ───

def _send_external_alerts(alerts):
    """Send batched alerts to Telegram, WhatsApp (third-party), and WhatsApp Native."""
    from models import BotConfig

    def find_config(bot_type):
        c = BotConfig.query.filter_by(bot_type=bot_type, enabled=True).first()
        if not c:
            logger.warning(f"[ALERT] No {bot_type} config found — skipping")
        return c

    logger.info(f"[ALERT] Sending external alerts: count={len(alerts)}")

    telegram_config = find_config('telegram')
    if telegram_config and telegram_config.bot_token and telegram_config.chat_id:
        logger.info(f"[ALERT] Telegram: chat_id={telegram_config.chat_id}")
        _send_telegram(telegram_config, alerts)
    else:
        logger.info("[ALERT] Telegram: skipped (no valid config)")

    whatsapp_config = find_config('whatsapp')
    if whatsapp_config and whatsapp_config.api_url:
        logger.info(f"[ALERT] WhatsApp: target={whatsapp_config.phone_number}, url={whatsapp_config.api_url}")
        _send_whatsapp(whatsapp_config, alerts)
    else:
        logger.info("[ALERT] WhatsApp: skipped (no valid config)")

    native_config = find_config('whatsapp_native')
    if native_config and native_config.api_url:
        logger.info(f"[ALERT] WA Native: target={native_config.phone_number}, url={native_config.api_url}")
        _send_whatsapp_native(native_config, alerts)
    else:
        logger.info("[ALERT] WA Native: skipped (no valid config)")

    # Send to technicians with receive_alerts permission and phone number
    _send_technician_alerts(alerts)


def _send_technician_alerts(alerts):
    """Send alert notifications to technician users (role has 'receive_alerts' perm) with phone numbers."""
    try:
        from models import User, Role
        users = User.query.filter(User.phone != None, User.phone != '', User.is_super_admin == False).all()

        technicians = []
        for u in users:
            if u.role and u.role.has_permission('receive_alerts'):
                technicians.append(u)

        if not technicians:
            logger.info("[ALERT] No technicians with phone found")
            return

        logger.info(f"[ALERT] Sending to {len(technicians)} technician(s)")

        # Use WA native gateway
        gateway_url = 'http://localhost:3000'
        text = "\n\n━━━━━━━━━━━\n\n".join(a['message'] for a in alerts)

        for tech in technicians:
            phone = tech.phone.strip()
            if not phone:
                continue
            try:
                payload = json.dumps({'phone': phone, 'message': text}).encode('utf-8')
                headers = {'Content-Type': 'application/json'}
                req = urllib.request.Request(
                    f'{gateway_url}/send',
                    data=payload,
                    headers=headers,
                )
                resp = urllib.request.urlopen(req, timeout=15)
                if resp.status in (200, 201):
                    logger.info(f"[ALERT] Technician WA sent: {tech.username} -> {phone}, status={resp.status}")
                else:
                    logger.error(f"[ALERT] Technician WA error: {tech.username} -> {phone}, status={resp.status}")
            except Exception as e:
                logger.error(f"[ALERT] Technician WA failed: {tech.username} -> {phone}, error={e}")
    except Exception as e:
        logger.error(f"[ALERT] _send_technician_alerts failed: {e}")


def _send_telegram(config, alerts):
    """Send alerts to Telegram bot."""
    try:
        messages = [a['message'] for a in alerts]
        text = "\n\n━━━━━━━━━━━\n\n".join(messages)
        if len(text) > 4000:
            for i in range(0, len(text), 4000):
                _send_telegram_single(config, text[i:i+4000])
        else:
            _send_telegram_single(config, text)
        logger.info(f"[ALERT] Telegram: sent {len(alerts)} alerts")
    except Exception as e:
        logger.error(f"[ALERT] Telegram send failed: {e}")


def _send_telegram_single(config, text):
    """Send a single message to Telegram."""
    url = f"https://api.telegram.org/bot{config.bot_token}/sendMessage"
    payload = json.dumps({
        'chat_id': config.chat_id,
        'text': text,
        'parse_mode': 'Markdown',
    }).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req, timeout=10)
    return resp.status == 200


def _send_whatsapp(config, alerts):
    """Send alerts to WhatsApp third-party API."""
    try:
        import urllib.parse as _parse
        text = "\n\n━━━━━━━━━━━\n\n".join(a['message'] for a in alerts)
        url = config.api_url
        phone = config.phone_number

        logger.info(f"[ALERT] WA send: target={phone}, url={url}, msg_len={len(text)}")

        if 'fonnte.com' in url:
            payload = _parse.urlencode({'target': phone, 'message': text, 'countryCode': '62'}).encode('utf-8')
            headers = {'Authorization': config.api_key or ''}
        elif 'wablas.com' in url:
            payload = json.dumps({'phone': phone, 'message': text}).encode('utf-8')
            headers = {'Content-Type': 'application/json'}
            if config.api_key:
                headers['Authorization'] = config.api_key
        elif 'callmebot.com' in url:
            url = f'{url}?phone={phone}&text={_parse.quote(text)}&apikey={config.api_key}'
            payload = None
            headers = {}
        elif 'green-api.com' in url:
            payload = json.dumps({'message': text, 'chatId': phone}).encode('utf-8')
            headers = {'Content-Type': 'application/json'}
        elif 'graph.facebook.com' in url:
            payload = json.dumps({'messaging_product': 'whatsapp', 'to': phone, 'type': 'text', 'text': {'body': text}}).encode('utf-8')
            headers = {'Content-Type': 'application/json'}
        else:
            payload = json.dumps({'phone': phone, 'message': text, 'target': phone, 'text': text}).encode('utf-8')
            headers = {'Content-Type': 'application/json'}
            if config.api_key:
                headers['Authorization'] = f'Bearer {config.api_key}'

        if payload:
            req = urllib.request.Request(url, data=payload, headers=headers)
        else:
            req = urllib.request.Request(url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=15)
        if resp.status in (200, 201):
            logger.info(f"[ALERT] WhatsApp: sent {len(alerts)} alerts, target={phone}, status={resp.status}")
        else:
            logger.error(f"[ALERT] WhatsApp error: status={resp.status}, target={phone}")
    except Exception as e:
        logger.error(f"[ALERT] WhatsApp send failed: {e}, target={phone}")


def _send_whatsapp_native(config, alerts):
    """Send alerts to native WhatsApp gateway (Baileys)."""
    try:
        text = "\n\n━━━━━━━━━━━\n\n".join(a['message'] for a in alerts)
        gateway_url = 'http://localhost:3000'
        phone = config.phone_number

        logger.info(f"[ALERT] WA Native send: target={phone}, url={gateway_url}, msg_len={len(text)}")

        payload = json.dumps({'phone': phone, 'message': text}).encode('utf-8')
        headers = {'Content-Type': 'application/json'}

        req = urllib.request.Request(
            f'{gateway_url}/send',
            data=payload,
            headers=headers,
        )
        resp = urllib.request.urlopen(req, timeout=15)
        if resp.status in (200, 201):
            logger.info(f"[ALERT] WhatsApp Native: sent {len(alerts)} alerts, target={phone}, status={resp.status}")
        else:
            logger.error(f"[ALERT] WhatsApp Native error: status={resp.status}, target={phone}")
    except Exception as e:
        logger.error(f"[ALERT] WhatsApp Native send failed: {e}")
