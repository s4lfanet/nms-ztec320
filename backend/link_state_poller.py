"""Link-state poller — keeps ODP->ONU map lines "actual".

Polls every enabled MikrotikDevice:
  1. /ppp/active   -> PPPoE session inventory (cheap, all clients at once)
  2. batched ping  -> up to `ping_batch` clients per cycle, round-robin
                      (from Mikrotik and/or VPS depending on device settings)

Joins sessions to `onus.pppoe` (username) and persists OnuLinkState rows.
Only state *changes* are broadcast via ws_bridge so the map updates live.

Ping source per device (`ping_source`):
  'mikrotik' (default) -> ping from the router, `ping_batch` clients per cycle
                          round-robin, VPS ping as fallback (original behaviour)
  'vps'                -> every client pinged from the NMS host in parallel each
                          cycle (fast for large networks; the VPS needs a route
                          to the client IPs)

Session history: PppoeSessionEvent rows ('up' / 'down' / 'reconnect' — the
last when a session's uptime went *down* between two cycles, i.e. it dropped
and redialled faster than the poll interval). Pruned after `pppoe_event_days`.

Config keys in SystemConfig:
  link_check_interval  seconds between cycles      (default 45, clamp 15-600)
  link_slow_rtt_ms     RTT threshold for 'slow'    (default 150)
  link_fail_threshold  consecutive timeouts ->down (default 2)
"""
import logging
import re
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta

from models import db, MikrotikDevice, ONU, OnuLinkState, SystemConfig, PppoeSessionEvent
from routeros_client import RouterOSClient, RouterOSError
from ws_bridge import ws_broadcast_dashboard

logger = logging.getLogger(__name__)

_poll_lock = threading.Lock()
_rx_lock = threading.Lock()
_rr_cursor = {}  # mikrotik_id -> round-robin offset into its session list

# ONU names that can never be PPPoE usernames — e.g. HiOSO sync stores 'NA'
# for every ONU. Skipping them avoids both false 'no_session' mass-marks and
# the pathological case of a real session literally named 'NA' binding to
# hundreds of ONUs at once.
_BAD_ONU_NAMES = {'', 'na', 'n/a', 'none', '-', 'onu', 'unknown'}


def _name_is_usable(name):
    return bool(name) and name.strip().lower() not in _BAD_ONU_NAMES


def _ident_key(o):
    """The identity used to decide 'no_session' vs 'unknown'.
    pppoe column is always trustworthy; a name only counts when it looks
    like a PPPoE username (ISP convention: user@realm)."""
    if o.pppoe:
        return o.pppoe
    n = (o.name or '').strip()
    if _name_is_usable(n) and '@' in n:
        return n
    return None


def _norm_mac(v):
    """Normalize a MAC/serial to 12 uppercase hex chars, '' if not a MAC."""
    h = re.sub(r'[^0-9A-Fa-f]', '', v or '').upper()
    return h if len(h) == 12 else ''


def _session_variants(name):
    """Yield match keys for a session name: exact first, then with the
    RouterOS duplicate-session suffix stripped ('user@rw03-1' -> 'user@rw03')."""
    yield name
    base = re.sub(r'-\d+$', '', name or '')
    if base != name:
        yield base


_UPTIME_UNITS = {'w': 604800, 'd': 86400, 'h': 3600, 'm': 60, 's': 1}
VPS_PING_WORKERS = 64
VPS_PING_MAX = 3000  # safety cap per device per cycle


def uptime_seconds(v):
    """RouterOS uptime → detik. '1w2d03:04:05', '2d3h4m5s', '00:05:12', '45s'.
    None bila tidak bisa dibaca."""
    v = (v or '').strip()
    if not v:
        return None
    total, rest = 0, v
    for num, unit in re.findall(r'(\d+)([wdhms])', v):
        total += int(num) * _UPTIME_UNITS[unit]
    rest = re.sub(r'\d+[wdhms]', '', v)
    m = re.search(r'(\d+):(\d+):(\d+)', rest)
    if m:
        total += int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
    elif not re.search(r'\d+[wdhms]', v):
        return None
    return total


def _event(st, onu_id, dev_id, kind, ip='', caller='', prev_uptime='', now=None):
    db.session.add(PppoeSessionEvent(
        onu_id=onu_id, mikrotik_id=dev_id, pppoe_user=st.pppoe_user or '', event=kind,
        ip=ip or '', caller_id=caller or '', prev_uptime=prev_uptime or '', at=now))


def prune_events(days=None):
    days = days or _cfg_int('pppoe_event_days', 30, 1, 365)
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    n = PppoeSessionEvent.query.filter(PppoeSessionEvent.at < cutoff).delete(synchronize_session=False)
    db.session.commit()
    return n


def _num(v):
    try:
        return float(str(v).strip().rstrip('%C').strip())
    except (TypeError, ValueError):
        return None


def read_health(dev, cli):
    """Isi kolom kesehatan router dari /system/resource & /system/health.
    Gagal membaca tidak menggagalkan siklus poll."""
    try:
        r = cli.get_resource() or {}
    except Exception as e:
        logger.debug('mikrotik %s resource failed: %s', dev.host, e)
        return
    cpu = _num(r.get('cpu-load'))
    dev.cpu_load = int(cpu) if cpu is not None else None
    free, total = _num(r.get('free-memory')), _num(r.get('total-memory'))
    dev.mem_used_pct = round((1 - free / total) * 100, 1) if free is not None and total else None
    dev.ros_uptime = str(r.get('uptime') or '')[:40]
    dev.ros_version = str(r.get('version') or '')[:60]
    dev.board = str(r.get('board-name') or '')[:60]
    h = cli.get_health() if hasattr(cli, 'get_health') else {}
    temp = None
    for k in ('cpu-temperature', 'temperature', 'board-temperature1', 'sfp-temperature'):
        temp = _num((h or {}).get(k))
        if temp is not None:
            break
    dev.temperature = temp
    dev.health_at = datetime.now(timezone.utc).replace(tzinfo=None)


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
    dev.last_ok_at = now
    read_health(dev, cli)
    db.session.commit()  # flush device bookkeeping now — never carry a dirty
    # session into the ping phase, or the open write transaction holds SQLite's
    # RESERVED lock for the whole (slow) network round-trip and every other
    # writer (UI edits, OLT delete, sync commits) dies with 'database is locked'.

    # Keamanan: baca log login router (brute force, login IP baru, perubahan user).
    # Baca-saja, dibatasi mt_sec_interval, tidak pernah menggagalkan poll.
    try:
        import mikrotik_security
        mikrotik_security.collect(dev, cli, now)
    except Exception as e:
        db.session.rollback()
        logger.warning('mikrotik %s security read failed: %s', dev.host, e)

    # session name -> session row (name is the PPPoE username)
    sess_by_name = {s['name']: s for s in sessions if s.get('name')}

    # Session name -> ONU. Primary key is onu.pppoe (parsed from the OLT's
    # `pppoe N nat enable user X` config). ONUs in bridge mode — PPPoE dialled
    # on the CPE/ONU via ACS rather than by OLT CLI — have pppoe='' but their
    # onu.name conventionally equals the PPPoE username, so fall back to name.
    onus = ONU.query.filter(db.or_(
        db.and_(ONU.pppoe.isnot(None), ONU.pppoe != ''),
        db.and_(ONU.name.isnot(None), ONU.name != ''),
        db.and_(ONU.serial_number.isnot(None), ONU.serial_number != ''))).all()
    by_pppoe, by_name, by_mac = {}, {}, {}
    for o in onus:
        if o.pppoe:
            by_pppoe.setdefault(o.pppoe, []).append(o)
        if _name_is_usable(o.name):
            by_name.setdefault(o.name, []).append(o)
        mac = _norm_mac(o.serial_number)
        if mac:
            by_mac.setdefault(mac, []).append(o)

    slow_rtt = _cfg_int('link_slow_rtt_ms', 150)
    fail_th = _cfg_int('link_fail_threshold', 2, 1, 10)
    batch = max(1, dev.ping_batch or 25)

    seen_users = set(sess_by_name)

    # --- phase 1 (read-only + network): build match plan, then ping ---------
    # Nothing is written to db.session here, so no write lock is held while
    # we wait on RouterOS/VPS ping round-trips.
    plans = []  # (onu, user, sess)
    for user, sess in sess_by_name.items():
        # Priority: pppoe column > ONU name (bridge-mode ONUs) > caller-id MAC
        # == serial_number (HiOSO/other OLTs whose ONUs dial PPPoE themselves —
        # the ONU MAC then arrives as the session's caller-id).
        targets = []
        for key in _session_variants(user):
            targets = by_pppoe.get(key) or by_name.get(key)
            if targets:
                break
        if not targets:
            targets = by_mac.get(_norm_mac(sess.get('caller-id'))) or []
        for onu in targets:
            plans.append((onu, user, sess))

    pings = {}  # onu_id -> ping result (or None when ping failed both ways)
    if dev.ping_enabled and plans and (dev.ping_source or 'mikrotik') == 'vps':
        # Semua klien sekaligus, paralel dari server NMS — router tidak dibebani.
        cli.close()
        targets = [(onu.id, sess.get('address', '')) for onu, _u, sess in plans
                   if sess.get('address')][:VPS_PING_MAX]
        with ThreadPoolExecutor(max_workers=VPS_PING_WORKERS) as ex:
            for oid, res in zip([t[0] for t in targets],
                                ex.map(lambda t: ping_from_vps(t[1], count=2, timeout_s=1), targets)):
                pings[oid] = res
    elif dev.ping_enabled and plans:
        off = _rr_cursor.get(dev.id, 0)
        ordered = plans[off % len(plans):] + plans[:off % len(plans)]
        _rr_cursor[dev.id] = (off + batch) % len(plans)
        for onu, _user, sess in ordered[:batch]:
            ip = sess.get('address', '')
            if not ip:
                continue
            try:
                pings[onu.id] = cli.ping(ip, count=3)
            except Exception as e:
                logger.debug('mikrotik ping %s via %s failed: %s', ip, dev.host, e)
                pings[onu.id] = ping_from_vps(ip)

    cli.close()

    # --- phase 2: apply everything in one short write transaction -----------
    st_map = {st.onu_id: st for st in OnuLinkState.query.filter(
        OnuLinkState.onu_id.in_([o.id for o, _u, _s in plans])).all()}
    changed = []
    for onu, user, sess in plans:
        if not onu.pppoe:
            onu.pppoe = user  # backfill for future syncs/map/searches
        if not _name_is_usable(onu.name):
            onu.name = user  # auto-name 'NA' ONUs (HiOSO) from session
        st = st_map.get(onu.id)
        if st is None:
            st = OnuLinkState(onu_id=onu.id, link_state='unknown')
            db.session.add(st)
            st_map[onu.id] = st
        old = st.link_state
        was_up, prev_uptime = bool(st.session_up), st.session_uptime or ''
        new_uptime = sess.get('uptime', '')
        if st.id is not None and not was_up and st.checked_at is not None:
            _event(st, onu.id, dev.id, 'up', sess.get('address', ''), sess.get('caller-id', ''), now=now)
        elif was_up and st.pppoe_user == user:
            a, b = uptime_seconds(prev_uptime), uptime_seconds(new_uptime)
            if a is not None and b is not None and b < a:
                _event(st, onu.id, dev.id, 'reconnect', sess.get('address', ''), sess.get('caller-id', ''),
                       prev_uptime, now=now)
        st.mikrotik_id = dev.id
        st.pppoe_user = user
        st.pppoe_ip = sess.get('address', '')
        st.session_up = True
        st.session_uptime = new_uptime
        st.caller_id = sess.get('caller-id', '')
        st.checked_at = now
        if old == 'no_session':
            st.link_state = 'unknown'  # ping below resolves it
        if onu.id in pings:
            new_state, fails = _classify(st, pings[onu.id], slow_rtt, fail_th)
            st.link_state, st.fail_count = new_state, fails
            st.ping_checked_at = now
            if pings[onu.id]:
                st.rtt_ms = pings[onu.id].get('avg_rtt_ms')
                st.loss_pct = pings[onu.id].get('loss_pct')
        if st.link_state != old:
            changed.append(st)

    # --- rows bound to this device whose session vanished ------------------
    for st in OnuLinkState.query.filter_by(mikrotik_id=dev.id).all():
        if st.pppoe_user and st.pppoe_user not in seen_users \
                and st.link_state != 'no_session':
            if st.session_up:
                _event(st, st.onu_id, dev.id, 'down', st.pppoe_ip, st.caller_id, st.session_uptime, now=now)
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
    falsely declaring the session down).

    ONUs that can't be identified on PPPoE at all (no pppoe value and a name
    that isn't a plausible username — e.g. HiOSO 'NA') keep/reset to
    'unknown': we simply can't tell whether their customer has a session."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    changed = []
    onus = ONU.query.filter(db.or_(
        db.and_(ONU.pppoe.isnot(None), ONU.pppoe != ''),
        db.and_(ONU.name.isnot(None), ONU.name != ''))).all()
    for o in onus:
        if (o.pppoe and o.pppoe in all_users) or (
                _name_is_usable(o.name) and o.name in all_users):
            continue
        st = OnuLinkState.query.filter_by(onu_id=o.id).first()
        if _ident_key(o) is None:
            # Not identifiable on PPPoE (e.g. HiOSO 'NA' names, auto-generated
            # labels) — 'unknown' is honest; 'no_session' would falsely read as
            # "customer offline". Clear a stale no_session left by older runs.
            if st is not None and st.link_state == 'no_session':
                st.link_state = 'unknown'
                st.session_up = False
                st.checked_at = now
                changed.append(st)
            continue
        if st is None:
            st = OnuLinkState(onu_id=o.id, pppoe_user=o.pppoe or o.name,
                              link_state='no_session', session_up=False,
                              checked_at=now)
            db.session.add(st)
            changed.append(st)
        elif st.link_state != 'no_session' and (
                st.mikrotik_id is None or st.mikrotik_id in ok_dev_ids):
            if st.session_up:
                _event(st, o.id, st.mikrotik_id, 'down', st.pppoe_ip, st.caller_id, st.session_uptime, now=now)
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


def _rx_maintenance_async(app):
    """Rangkum sampel redaman ONU lama jadi per-jam + buang yang kedaluwarsa (sekali per jam).
    rx_history.py semula hanya skrip cron yang tidak pernah dijadwalkan → tabel
    onu_rx_samples terus membengkak. Idempoten; jalan di thread sendiri agar poller tak tertahan."""
    def work():
        try:
            with app.app_context():
                import rx_history
                rx_history.aggregate_rx_hourly()
                rx_history.prune_rx_history()
        except Exception as e:
            logger.warning('rx history maintenance failed: %s', e)
            try:
                db.session.rollback()
            except Exception:
                pass
    if not _rx_lock.acquire(blocking=False):
        return

    def run():
        try:
            work()
        finally:
            _rx_lock.release()
    threading.Thread(target=run, daemon=True, name='rx-maint').start()


def run_link_poller(app):
    """Daemon loop — started from run_server.py alongside the alert monitor."""
    with app.app_context():
        logger.info('link-state poller started')
        try:  # rute kernel hilang saat reboot — pasang ulang dari DB
            import vps_routes
            n = vps_routes.apply_all()
            if n:
                logger.info('re-applied %s VPS route(s)', n)
        except Exception as e:
            db.session.rollback()
            logger.warning('vps routes re-apply failed: %s', e)
        last_prune = 0.0
        last_rx_maint = 0.0
        last_acs_sync = time.time() - 25 * 60  # sinkron ACS pertama ±5 menit setelah start
        while True:
            interval = _cfg_int('link_check_interval', 45, 15, 600)
            try:
                import job_health
                job_health.beat('link-poller')
                if time.time() - last_rx_maint > 3600:
                    last_rx_maint = time.time()
                    _rx_maintenance_async(app)
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
            sync_min = _cfg_int('genieacs_sync_minutes', 30, 0, 1440)
            if sync_min and time.time() - last_acs_sync > sync_min * 60:
                last_acs_sync = time.time()
                try:
                    nbi = SystemConfig.query.filter_by(key='genieacs_nbi_url').first()
                    if nbi and nbi.value:
                        import genieacs_client
                        genieacs_client.sync_device_maps()
                except Exception as e:
                    db.session.rollback()
                    logger.warning('genieacs auto-sync failed: %s', e)
            if time.time() - last_prune > 3600:
                last_prune = time.time()
                try:
                    prune_events()
                except Exception as e:
                    db.session.rollback()
                    logger.warning('pppoe event prune failed: %s', e)
                try:
                    import mikrotik_security
                    mikrotik_security.prune()
                except Exception as e:
                    db.session.rollback()
                    logger.warning('mikrotik security prune failed: %s', e)
            time.sleep(interval)
