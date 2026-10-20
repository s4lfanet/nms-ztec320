"""Link-state poller — keeps ODP->ONU map lines "actual".

Polls every enabled MikrotikDevice:
  1. /ppp/active   -> PPPoE session inventory (cheap, all clients at once)
  2. batched ping  -> up to `ping_batch` clients per cycle, round-robin
                      (from Mikrotik and/or VPS depending on device settings)

Joins sessions to `onus.pppoe` (username) and persists OnuLinkState rows.
Only state *changes* are broadcast via ws_bridge so the map updates live.

Config keys in SystemConfig:
  link_check_interval  seconds between cycles      (default 45, clamp 15-600)
  link_slow_rtt_ms     RTT threshold for 'slow'    (default 150)
  link_fail_threshold  consecutive timeouts ->down (default 2)
"""
import logging
import subprocess
import threading
import time
from datetime import datetime, timezone

from models import db, MikrotikDevice, ONU, OnuLinkState, SystemConfig
from routeros_client import RouterOSClient, RouterOSError
from ws_bridge import ws_broadcast_dashboard

logger = logging.getLogger(__name__)

_poll_lock = threading.Lock()
_rr_cursor = {}  # mikrotik_id -> round-robin offset into its session list


def _cfg_int(key, default, lo=None, hi=None):
    row = SystemConfig.query.filter_by(key=key).first()
    try:
        v = int(row.value) if row and row.value is not None else default
    except (ValueError, TypeError):
        v = default
    if lo is not None:
        v = max(lo, v)
    if hi is not None:
        v = min(hi, v)
    return v


def ping_from_vps(address, count=2, timeout_s=2):
    """Ping a client IP from the NMS host. Returns same shape as router ping."""
    try:
        p = subprocess.run(
            ['/usr/bin/ping', '-c', str(count), '-W', str(timeout_s), '-n', address],
            capture_output=True, text=True, timeout=count * timeout_s + 4)
    except Exception:
        return None
    sent, received, avg = count, 0, None
    import re
    m = re.search(r'(\d+) packets transmitted, (\d+)(?:\+\d+ errors)? received', p.stdout)
    if m:
        sent, received = int(m.group(1)), int(m.group(2))
    m = re.search(r'min/avg/max[^=]*=\s*[\d.]+/([\d.]+)/', p.stdout)
    if m:
        avg = float(m.group(1))
    loss = round((1 - received / sent) * 100, 1) if sent else 100.0
    return {'sent': sent, 'received': received, 'loss_pct': loss, 'avg_rtt_ms': avg}


def _classify(state_row, ping, slow_rtt, fail_threshold):
    """Decide new link_state from ping result. Returns (state, fail_count)."""
    if ping is None:  # ping not attempted (batch limit) — keep previous state
        return state_row.link_state, state_row.fail_count
    loss = ping.get('loss_pct')
    rtt = ping.get('avg_rtt_ms')
    if loss is not None and loss >= 100:
        fails = (state_row.fail_count or 0) + 1
        return ('down' if fails >= fail_threshold else 'slow'), fails
    if (loss or 0) > 0 or (rtt is not None and rtt > slow_rtt):
        return 'slow', 0
    return 'ok', 0


def _get_or_create_state(onu_id):
    st = OnuLinkState.query.filter_by(onu_id=onu_id).first()
    if not st:
        st = OnuLinkState(onu_id=onu_id, link_state='unknown')
        db.session.add(st)
    return st


def poll_device(dev):
    """One poll cycle for a single Mikrotik device.
    Returns the set of active session names seen, or None on failure."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    try:
        cli = RouterOSClient(dev.host, dev.api_mode, dev.api_port, dev.api_ssl,
                             dev.api_user, dev.api_password, timeout=10).connect()
    except Exception as e:
        dev.last_ok, dev.last_error, dev.last_polled_at = False, str(e)[:300], now
        db.session.commit()
        logger.warning('mikrotik %s poll failed: %s', dev.host, e)
        return None

    try:
        sessions = cli.get_pppoe_active() or []
    except Exception as e:
        cli.close()
        dev.last_ok, dev.last_error, dev.last_polled_at = False, str(e)[:300], now
        db.session.commit()
        logger.warning('mikrotik %s /ppp/active failed: %s', dev.host, e)
        return None

    dev.last_ok, dev.last_error, dev.last_polled_at = True, '', now

    # session name -> session row (name is the PPPoE username)
    sess_by_name = {s['name']: s for s in sessions if s.get('name')}

    # Session name -> ONU. Primary key is onu.pppoe (parsed from the OLT's
    # `pppoe N nat enable user X` config). ONUs in bridge mode — PPPoE dialled
    # on the CPE/ONU via ACS rather than by OLT CLI — have pppoe='' but their
    # onu.name conventionally equals the PPPoE username, so fall back to name.
    onus = ONU.query.filter(db.or_(
        db.and_(ONU.pppoe.isnot(None), ONU.pppoe != ''),
        db.and_(ONU.name.isnot(None), ONU.name != ''))).all()
    by_pppoe, by_name = {}, {}
    for o in onus:
        if o.pppoe:
            by_pppoe.setdefault(o.pppoe, []).append(o)
        if o.name:
            by_name.setdefault(o.name, []).append(o)

    slow_rtt = _cfg_int('link_slow_rtt_ms', 150)
    fail_th = _cfg_int('link_fail_threshold', 2, 1, 10)
    batch = max(1, dev.ping_batch or 25)

    seen_users = set(sess_by_name)
    changed = []

    # --- sessions that map to known ONUs ----------------------------------
    matched = []
    for user, sess in sess_by_name.items():
        # pppoe column wins; fall back to ONU name (bridge-mode ONUs)
        targets = by_pppoe.get(user) or by_name.get(user, [])
        for onu in targets:
            if not onu.pppoe:
                onu.pppoe = user  # backfill for future syncs/map/searches
            st = _get_or_create_state(onu.id)
            old = st.link_state
            st.mikrotik_id = dev.id
            st.pppoe_user = user
            st.pppoe_ip = sess.get('address', '')
            st.session_up = True
            st.session_uptime = sess.get('uptime', '')
            st.caller_id = sess.get('caller-id', '')
            st.checked_at = now
            matched.append((st, st.pppoe_ip))
            if old == 'no_session':
                st.link_state = 'unknown'  # ping below resolves it
                changed.append(st)

    # --- ping batch (round-robin over matched sessions) --------------------
    if dev.ping_enabled and matched:
        off = _rr_cursor.get(dev.id, 0)
        ordered = matched[off % len(matched):] + matched[:off % len(matched)]
        _rr_cursor[dev.id] = (off + batch) % len(matched)
        for st, ip in ordered[:batch]:
            if not ip:
                continue
            old = st.link_state
            try:
                ping = cli.ping(ip, count=3)
            except Exception as e:
                logger.debug('mikrotik ping %s via %s failed: %s', ip, dev.host, e)
                ping = ping_from_vps(ip)
            new_state, fails = _classify(st, ping, slow_rtt, fail_th)
            st.link_state, st.fail_count = new_state, fails
            st.ping_checked_at = now
            if ping:
                st.rtt_ms, st.loss_pct = ping.get('avg_rtt_ms'), ping.get('loss_pct')
            if new_state != old:
                changed.append(st)

    cli.close()

    # --- rows bound to this device whose session vanished ------------------
    for st in OnuLinkState.query.filter_by(mikrotik_id=dev.id).all():
        if st.pppoe_user and st.pppoe_user not in seen_users \
                and st.link_state != 'no_session':
            st.link_state = 'no_session'
            st.session_up = False
            st.fail_count = 0
            st.checked_at = now
            changed.append(st)

    db.session.commit()

    for st in changed:
        _broadcast_state(st)
    return set(sess_by_name)


def reconcile_no_session(all_users, ok_dev_ids):
    """Global pass after all devices in a cycle have been polled.

    ONUs whose PPPoE username (or name fallback) is in *no* device's active
    session list get link_state='no_session' — including rows that never had a
    state before (so map lines show grey-dashed, not 'unknown'). Rows bound to
    a device that failed this cycle are left untouched (stale is safer than
    falsely declaring the session down)."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    changed = []
    onus = ONU.query.filter(db.or_(
        db.and_(ONU.pppoe.isnot(None), ONU.pppoe != ''),
        db.and_(ONU.name.isnot(None), ONU.name != ''))).all()
    for o in onus:
        if (o.pppoe and o.pppoe in all_users) or (o.name and o.name in all_users):
            continue
        st = OnuLinkState.query.filter_by(onu_id=o.id).first()
        if st is None:
            st = OnuLinkState(onu_id=o.id, pppoe_user=o.pppoe or o.name,
                              link_state='no_session', session_up=False,
                              checked_at=now)
            db.session.add(st)
            changed.append(st)
        elif st.link_state != 'no_session' and (
                st.mikrotik_id is None or st.mikrotik_id in ok_dev_ids):
            st.link_state = 'no_session'
            st.session_up = False
            st.fail_count = 0
            st.checked_at = now
            changed.append(st)
    if changed:
        db.session.commit()
        for st in changed:
            _broadcast_state(st)
    return len(changed)


def _broadcast_state(st):
    try:
        ws_broadcast_dashboard('onu_link_state', {
            'onu_id': st.onu_id,
            'link_state': st.link_state,
            'pppoe_ip': st.pppoe_ip,
            'rtt_ms': st.rtt_ms,
            'loss_pct': st.loss_pct,
            'checked_at': st.checked_at.isoformat() if st.checked_at else None,
        })
    except Exception:
        pass


def run_link_poller(app):
    """Daemon loop — started from run_server.py alongside the alert monitor."""
    with app.app_context():
        logger.info('link-state poller started')
        while True:
            interval = _cfg_int('link_check_interval', 45, 15, 600)
            try:
                if _poll_lock.acquire(blocking=False):
                    try:
                        devs = MikrotikDevice.query.filter_by(enabled=True).all()
                        all_users, ok_dev_ids = set(), set()
                        for dev in devs:
                            try:
                                users = poll_device(dev)
                                if users is not None:
                                    all_users |= users
                                    ok_dev_ids.add(dev.id)
                            except Exception as e:
                                db.session.rollback()
                                logger.warning('mikrotik %s cycle error: %s', dev.host, e)
                        if devs:
                            reconcile_no_session(all_users, ok_dev_ids)
                    finally:
                        _poll_lock.release()
            except Exception as e:
                db.session.rollback()
                logger.error('link poller cycle failed: %s', e)
            time.sleep(interval)
