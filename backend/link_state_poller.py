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
    """One poll cycle for a single Mikrotik device. Returns # of ONU states touched."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    try:
        cli = RouterOSClient(dev.host, dev.api_mode, dev.api_port, dev.api_ssl,
                             dev.api_user, dev.api_password, timeout=10).connect()
    except Exception as e:
        dev.last_ok, dev.last_error, dev.last_polled_at = False, str(e)[:300], now
        db.session.commit()
        logger.warning('mikrotik %s poll failed: %s', dev.host, e)
        return 0

    try:
        sessions = cli.get_pppoe_active() or []
    except Exception as e:
        cli.close()
        dev.last_ok, dev.last_error, dev.last_polled_at = False, str(e)[:300], now
        db.session.commit()
        logger.warning('mikrotik %s /ppp/active failed: %s', dev.host, e)
        return 0

    dev.last_ok, dev.last_error, dev.last_polled_at = True, '', now

    # session name -> session row (name is the PPPoE username)
    sess_by_name = {s['name']: s for s in sessions if s.get('name')}

    onus = ONU.query.filter(ONU.pppoe.isnot(None), ONU.pppoe != '').all()
    by_user = {}
    for o in onus:
        by_user.setdefault(o.pppoe, []).append(o)

    slow_rtt = _cfg_int('link_slow_rtt_ms', 150)
    fail_th = _cfg_int('link_fail_threshold', 2, 1, 10)
    batch = max(1, dev.ping_batch or 25)

    seen_users = set(sess_by_name)
    changed = []

    # --- sessions that map to known ONUs ----------------------------------
    matched = []
    for user, sess in sess_by_name.items():
        for onu in by_user.get(user, []):
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
    return len(matched)


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
                        for dev in devs:
                            try:
                                poll_device(dev)
                            except Exception as e:
                                db.session.rollback()
                                logger.warning('mikrotik %s cycle error: %s', dev.host, e)
                    finally:
                        _poll_lock.release()
            except Exception as e:
                db.session.rollback()
                logger.error('link poller cycle failed: %s', e)
            time.sleep(interval)
