"""Keamanan MikroTik — deteksi brute force & login mencurigakan dari log router.

Alur (hanya MEMBACA router, tidak pernah mengubah konfigurasi):
  1. `collect(dev, cli)` dipanggil poller link-state (`link_state_poller.poll_device`)
     memakai koneksi API yang sudah terbuka. Paling cepat tiap `mt_sec_interval` detik
     ia membaca `/log` (buffer memori router), mengambil baris baru (`.id` > terakhir),
     lalu menyimpan peristiwa:
       login_fail   "login failure for user X from IP via winbox/ssh/web/api/ftp/telnet"
       login_ok     "user X logged in from IP via …" (login NMS sendiri via API dilewati)
       user_change  "user X added/removed/changed by …"
     Pembacaan pertama hanya menjadi titik awal (log lama tidak memicu alert) dan
     mempelajari IP login yang sudah ada.
  2. `check_security(now, notifs, alerts)` dipanggil siklus alert (±1 menit) — membaca
     DB saja, membuat alert lewat jalur alert biasa (lonceng, Telegram, WhatsApp, push):
       bruteforce          ≥ N login gagal dari SATU IP dalam M menit
       distributed         ≥ T login gagal total dari ≥3 IP dalam M menit
       success_after_fail  login BERHASIL dari IP yang barusan gagal berkali-kali
       new_ip              login berhasil dari IP publik yang belum pernah dipakai user itu
                           (setelah masa belajar 24 jam)
       user_change         akun user router ditambah/dihapus/diubah
     Alert serangan ditutup otomatis setelah `mt_sec_quiet_minutes` tanpa percobaan.
  3. Bila AI agent aktif (`mt_sec_ai_analysis`), analisis + saran tindakan dikirim
     menyusul di thread latar (tidak menahan alert utama).
"""
import ipaddress
import logging
import re
import threading
from datetime import datetime, timedelta, timezone

from models import (db, SystemConfig, MikrotikDevice, Notification, MtSecState, MtSecEvent,
                    MtSecLogin, MtSecAlert, MtSecFwSeen, MtSecAudit)

logger = logging.getLogger(__name__)

CATEGORY = 'mt_security'
TARGET = 'mt_sec'
KINDS = ('bruteforce', 'distributed', 'success_after_fail', 'new_ip', 'user_change', 'fw_list', 'audit')
MAX_NEW_ROWS = 500          # per pembacaan (buffer memori router default 1000 baris)
LEARNING = timedelta(hours=24)

DEFAULTS = {
    'mt_sec_enabled': 1,
    'mt_sec_interval': 60,             # detik antar pembacaan log per router
    'mt_sec_bf_threshold': 5,          # login gagal dari satu IP …
    'mt_sec_bf_minutes': 10,           # … dalam jendela ini (menit)
    'mt_sec_dist_threshold': 20,       # total login gagal dari ≥3 IP dalam jendela yang sama
    'mt_sec_quiet_minutes': 30,        # serangan dianggap berhenti setelah sekian menit tanpa percobaan
    'mt_sec_alert_success': 1,
    'mt_sec_alert_new_ip': 1,
    'mt_sec_alert_user_change': 1,
    'mt_sec_ai_analysis': 1,
    'mt_sec_retention_days': 30,
    'mt_sec_alert_fw': 1,              # alert IP baru di address-list firewall yang dipantau
    'mt_sec_fw_digest_minutes': 60,    # IP baru per daftar dikumpulkan jadi satu pesan per jendela ini
    'mt_sec_alert_audit': 1,           # alert temuan KRITIS baru dari audit konfigurasi
    'mt_audit_hours': 24,              # audit konfigurasi otomatis tiap N jam (0 = hanya manual)
}
FW_LISTS_KEY = 'mt_sec_fw_lists'
FW_LISTS_DEFAULT = 'nms-portscan\nnms-portscan-lan\nnms-synflood\nnms-bruteforce'
LIMITS = {
    'mt_sec_enabled': (0, 1), 'mt_sec_interval': (30, 900), 'mt_sec_bf_threshold': (2, 100),
    'mt_sec_bf_minutes': (1, 240), 'mt_sec_dist_threshold': (5, 1000), 'mt_sec_quiet_minutes': (5, 720),
    'mt_sec_alert_success': (0, 1), 'mt_sec_alert_new_ip': (0, 1), 'mt_sec_alert_user_change': (0, 1),
    'mt_sec_ai_analysis': (0, 1), 'mt_sec_retention_days': (1, 365),
    'mt_sec_alert_fw': (0, 1), 'mt_sec_fw_digest_minutes': (5, 1440), 'mt_sec_alert_audit': (0, 1),
    'mt_audit_hours': (0, 168),
}
WHITELIST_KEY = 'mt_sec_whitelist'


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ───────────────────────────── pengaturan ─────────────────────────────

def get_settings():
    rows = {r.key: r.value for r in SystemConfig.query.filter(
        SystemConfig.key.in_(list(DEFAULTS) + [WHITELIST_KEY, FW_LISTS_KEY])).all()}
    out = {}
    for k, d in DEFAULTS.items():
        try:
            v = int(float(rows[k])) if rows.get(k) not in (None, '') else d
        except (TypeError, ValueError):
            v = d
        lo, hi = LIMITS[k]
        out[k] = min(max(v, lo), hi)
    out[WHITELIST_KEY] = rows.get(WHITELIST_KEY) or ''
    out[FW_LISTS_KEY] = rows[FW_LISTS_KEY] if rows.get(FW_LISTS_KEY) is not None else FW_LISTS_DEFAULT
    return out


_LIST_RE = re.compile(r'^[A-Za-z0-9_.:-]{1,63}$')


def fw_lists(cfg):
    """Nama address-list yang dipantau (aman untuk query API)."""
    return [x for x in dict.fromkeys(re.split(r'[\s,;]+', cfg.get(FW_LISTS_KEY) or '')) if x and _LIST_RE.match(x)][:20]


def _parse_whitelist(text):
    nets = []
    for tok in re.split(r'[\s,;]+', text or ''):
        if not tok:
            continue
        try:
            nets.append(ipaddress.ip_network(tok, strict=False))
        except ValueError:
            continue
    return nets


def normalize_whitelist(text):
    """→ (teks rapi, daftar entri tidak valid)."""
    good, bad = [], []
    for tok in re.split(r'[\s,;]+', text or ''):
        if not tok:
            continue
        try:
            good.append(str(ipaddress.ip_network(tok, strict=False)))
        except ValueError:
            bad.append(tok)
    return '\n'.join(dict.fromkeys(good)), bad


def save_settings(data):
    changed = []

    def put(k, v):
        row = SystemConfig.query.filter_by(key=k).first()
        if row:
            if row.value != v:
                row.value = v
                changed.append(k)
        else:
            db.session.add(SystemConfig(key=k, value=v))
            changed.append(k)
    for k in DEFAULTS:
        if k not in data:
            continue
        v = data[k]
        if isinstance(v, bool):
            v = int(v)
        try:
            v = int(float(v))
        except (TypeError, ValueError):
            continue
        lo, hi = LIMITS[k]
        put(k, str(min(max(v, lo), hi)))
    if FW_LISTS_KEY in data:
        names = [x for x in dict.fromkeys(re.split(r'[\s,;]+', str(data.get(FW_LISTS_KEY) or '')[:2000]))
                 if x and _LIST_RE.match(x)][:20]
        put(FW_LISTS_KEY, '\n'.join(names))
    bad = []
    if WHITELIST_KEY in data:
        text, bad = normalize_whitelist(str(data.get(WHITELIST_KEY) or '')[:4000])
        put(WHITELIST_KEY, text)
    return changed, bad


def _whitelisted(ip, nets):
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(a in n for n in nets)


# ───────────────────────────── parsing log ─────────────────────────────

_IP = r'(?P<ip>[0-9A-Fa-f:.]+)'
RE_FAIL = re.compile(r'login failure for user (?P<user>.+?)(?: from ' + _IP + r')? via (?P<via>[\w-]+)', re.I)
RE_OK = re.compile(r'user (?P<user>.+?) logged in(?: from ' + _IP + r')? via (?P<via>[\w-]+)', re.I)
RE_USER = re.compile(r'^user (?P<user>\S+) (?P<act>added|removed|changed) by (?P<by>[^\s(]+)', re.I)


def _valid_ip(ip):
    try:
        ipaddress.ip_address(ip)
        return True
    except (ValueError, TypeError):
        return False


def parse_message(message):
    """Baris log RouterOS → dict peristiwa atau None (bukan peristiwa keamanan)."""
    msg = (message or '').strip()
    if not msg:
        return None
    m = RE_FAIL.search(msg)
    if m:
        ip = m.group('ip') or ''
        return {'kind': 'login_fail', 'user': m.group('user')[:80], 'ip': ip if _valid_ip(ip) else '',
                'via': m.group('via').lower()[:20]}
    m = RE_USER.search(msg)
    if m:
        return {'kind': 'user_change', 'user': m.group('user')[:80], 'act': m.group('act').lower(),
                'by': m.group('by')[:120], 'ip': '', 'via': ''}
    m = RE_OK.search(msg)
    if m:
        ip = m.group('ip') or ''
        return {'kind': 'login_ok', 'user': m.group('user')[:80], 'ip': ip if _valid_ip(ip) else '',
                'via': m.group('via').lower()[:20]}
    return None


def _id_num(v):
    try:
        return int(str(v).lstrip('*'), 16)
    except (TypeError, ValueError):
        return None


# ───────────────────────────── pengumpulan ─────────────────────────────

def _state(dev_id):
    st = db.session.get(MtSecState, dev_id)
    if not st:
        st = MtSecState(device_id=dev_id)
        db.session.add(st)
    return st


def _remember_login(dev_id, user, ip, via, now):
    """Catat IP login berhasil. → (baru?, baris)."""
    row = MtSecLogin.query.filter_by(device_id=dev_id, user=user, ip=ip).first()
    if row:
        prev = row.last_seen
        row.last_seen, row.count, row.via = now, (row.count or 0) + 1, via or row.via
        return False, prev
    db.session.add(MtSecLogin(device_id=dev_id, user=user, ip=ip, via=via, first_seen=now, last_seen=now, count=1))
    return True, None


def ingest(dev, rows, now=None, api_user=None):
    """Proses baris /log. → jumlah peristiwa baru disimpan. (Terpisah dari jaringan → bisa dites.)"""
    now = now or _now()
    api_user = dev.api_user if api_user is None else api_user
    st = _state(dev.id)
    items = []
    for r in rows or []:
        n = _id_num(r.get('.id'))
        if n is not None:
            items.append((n, r))
    items.sort(key=lambda x: x[0])
    st.last_read_at, st.last_error = now, ''
    if not items:
        return 0
    max_id = items[-1][0]
    first = st.last_id is None
    if first:
        new = []
        st.baseline_at = now
        # Pelajari IP login yang sudah ada di log supaya admin lama tidak dianggap "IP baru".
        for _, r in items:
            ev = parse_message(r.get('message'))
            if ev and ev['kind'] == 'login_ok' and ev['ip'] and not (ev['via'] == 'api' and ev['user'] == api_user):
                _remember_login(dev.id, ev['user'], ev['ip'], ev['via'], now)
    elif max_id < st.last_id:
        new = items                      # .id mulai dari awal → router reboot / log dibersihkan
    else:
        new = [x for x in items if x[0] > st.last_id]
    st.last_id = max_id
    saved = 0
    for _, r in new[-MAX_NEW_ROWS:]:
        ev = parse_message(r.get('message'))
        if not ev:
            continue
        kind = ev['kind']
        if kind == 'login_ok':
            if ev['via'] == 'api' and ev['user'] == api_user:
                continue                 # koneksi poller NMS sendiri
            if not ev['ip']:
                continue                 # login lokal/console tanpa IP
            is_new, prev = _remember_login(dev.id, ev['user'], ev['ip'], ev['via'], now)
            # Simpan sebagai "sesi" (bukan tiap koneksi API berulang): IP baru atau jeda > 1 jam
            if not is_new and prev and now - prev < timedelta(hours=1):
                continue
            db.session.add(MtSecEvent(device_id=dev.id, kind=kind, user=ev['user'], ip=ev['ip'], via=ev['via'],
                                      new_ip=is_new, message=(r.get('message') or '')[:300],
                                      log_time=str(r.get('time') or '')[:40], created_at=now))
        else:
            db.session.add(MtSecEvent(device_id=dev.id, kind=kind, user=ev['user'], ip=ev.get('ip', ''),
                                      via=ev.get('via', ''), by=ev.get('by', ''),
                                      message=(r.get('message') or '')[:300],
                                      log_time=str(r.get('time') or '')[:40], created_at=now))
        saved += 1
    return saved


def collect(dev, cli, now=None):
    """Dipanggil poller dengan koneksi API terbuka. Tidak pernah raise."""
    now = now or _now()
    try:
        cfg = get_settings()
        if not cfg['mt_sec_enabled']:
            return 0
        st = db.session.get(MtSecState, dev.id)
        if st and st.last_read_at and (now - st.last_read_at).total_seconds() < cfg['mt_sec_interval'] - 5:
            return 0
    except Exception as e:
        db.session.rollback()
        logger.warning('mt-sec %s settings: %s', dev.host, e)
        return 0
    try:
        rows = cli.get_log()
    except Exception as e:
        try:
            st = _state(dev.id)
            st.last_read_at, st.last_error = now, ('Gagal membaca /log: ' + str(e))[:300]
            db.session.commit()
        except Exception:
            db.session.rollback()
        logger.warning('mt-sec %s /log failed: %s', dev.host, e)
        return 0
    n = 0
    try:
        n = ingest(dev, rows, now)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        logger.warning('mt-sec %s ingest failed: %s', dev.host, e)
    # Address-list firewall yang dipantau (nms-portscan, nms-synflood, …)
    lists = fw_lists(cfg)
    if lists:
        try:
            entries = []
            for name in lists:
                for r in cli.read('ip/firewall/address-list', 'list,address,comment,disabled', {'list': name}) or []:
                    if not str(r.get('disabled', '')).lower() in ('true', 'yes'):
                        entries.append(r)
            ingest_fw(dev, entries, lists, now)
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            logger.warning('mt-sec %s address-list read failed: %s', dev.host, e)
    # Audit konfigurasi terjadwal
    if cfg['mt_audit_hours']:
        try:
            a = db.session.get(MtSecAudit, dev.id)
            if not a or not a.at or (now - a.at).total_seconds() >= cfg['mt_audit_hours'] * 3600:
                import mikrotik_audit
                mikrotik_audit.run(dev, cli, now)
        except Exception as e:
            db.session.rollback()
            logger.warning('mt-sec %s audit failed: %s', dev.host, e)
    return n


def ingest_fw(dev, entries, lists, now):
    """Catat IP di address-list yang dipantau. IP yang tidak ada di pembacaan sebelumnya → peristiwa fw_list.
    Daftar yang pertama kali dibaca = baseline (isinya tidak dialert)."""
    seen = {(r.list, r.address): r for r in MtSecFwSeen.query.filter(MtSecFwSeen.device_id == dev.id,
                                                                    MtSecFwSeen.list.in_(lists)).all()}
    # Pembacaan sebelumnya = last_seen terbaru. IP yang TIDAK ada di pembacaan itu (baru, atau keluar lalu masuk
    # lagi setelah timeout) dianggap baru — NMS yang sempat mati tidak membuat isi daftar lama dialert ulang.
    # Per daftar ada baris penanda (address='') yang mencatat kapan daftar itu terakhir dibaca — juga untuk daftar
    # kosong, supaya IP PERTAMA yang masuk ke daftar yang baru dipasang tetap dialert.
    prev = {}
    for lst in lists:
        mark = seen.get((lst, ''))
        if mark and mark.last_seen:
            prev[lst] = mark.last_seen
        if not mark:
            mark = MtSecFwSeen(device_id=dev.id, list=lst, address='', first_seen=now, times=0)
            db.session.add(mark)
            seen[(lst, '')] = mark
        mark.last_seen = now
    added = 0
    for e in entries:
        lst, addr = str(e.get('list') or '')[:64], str(e.get('address') or '')[:64]
        if not lst or not addr:
            continue
        row = seen.get((lst, addr))
        first = lst not in prev
        fresh = row is None or (not first and row.last_seen is not None and row.last_seen < prev[lst])
        if row is None:
            row = MtSecFwSeen(device_id=dev.id, list=lst, address=addr, first_seen=now, times=0)
            db.session.add(row)
            seen[(lst, addr)] = row
        if fresh:
            row.times = (row.times or 0) + 1
        row.last_seen, row.comment = now, str(e.get('comment') or '')[:200]
        if fresh and not first:
            ip = addr.split('/')[0]
            db.session.add(MtSecEvent(device_id=dev.id, kind='fw_list', user=lst, ip=ip, via='firewall',
                                      message=f'{addr} masuk daftar {lst}' + (f' ({row.comment})' if row.comment else ''),
                                      created_at=now))
            added += 1
    return added


def prune(now=None):
    now = now or _now()
    days = get_settings()['mt_sec_retention_days']
    cut = now - timedelta(days=days)
    n = MtSecEvent.query.filter(MtSecEvent.created_at < cut).delete(synchronize_session=False)
    MtSecAlert.query.filter(MtSecAlert.closed_at.isnot(None), MtSecAlert.closed_at < cut).delete(
        synchronize_session=False)
    MtSecFwSeen.query.filter(MtSecFwSeen.last_seen < cut).delete(synchronize_session=False)
    db.session.commit()
    return n


# ───────────────────────────── alert ─────────────────────────────

def _origin(ip):
    """'🇮🇩 AS7713 PT Telkom · Jakarta' dari cache IP (cari langsung bila belum ada, maks 4 dtk)."""
    if not ip:
        return ''
    try:
        import ip_info
        infos, missing = ip_info.cached([ip])
        if missing:
            ip_info.lookup_now(missing)
            infos, _ = ip_info.cached([ip])
        d = infos.get(ip) or {}
    except Exception:
        return ''
    if d.get('scope'):
        return d['scope']
    parts = []
    if d.get('asn') or d.get('as_name'):
        parts.append(' '.join(x for x in (d.get('asn'), d.get('as_name')) if x))
    loc = ', '.join(x for x in (d.get('city'), d.get('country') or d.get('country_code')) if x)
    if loc:
        parts.append(loc)
    return ' · '.join(parts)


def _head(dev, title):
    return f'{title}\n\nRouter: {dev.name} ({dev.host})'


def _open_alert(dev, kind, key):
    return MtSecAlert.query.filter_by(device_id=dev.id, kind=kind, key=key, closed_at=None).first()


def _emit(ctx, dev, a, title, message):
    """Buat notifikasi + alert eksternal untuk MtSecAlert `a` (sudah di-flush, punya id)."""
    ctx['notifs'].append({'olt_id': None, 'onu_id': None, 'severity': a.severity, 'category': CATEGORY,
                          'title': title, 'message': message, 'target_roles': '',
                          'target_type': TARGET, 'target_id': a.id})
    ctx['alerts'].append({'olt_id': None, 'olt_name': dev.name, 'olt_ip': dev.host, 'target_type': TARGET,
                          'target_id': a.id, 'type': f'{CATEGORY}_{a.kind}', 'severity': a.severity,
                          'title': title, 'message': message, 'is_recovery': False})
    ctx['new'].append((a.id, title, message))


def _advice(kind, via):
    via_txt = {'winbox': 'Winbox (8291)', 'ssh': 'SSH (22)', 'telnet': 'Telnet (23)', 'web': 'WebFig (80/443)',
               'www': 'WebFig (80/443)', 'api': 'API (8728/8729)', 'ftp': 'FTP (21)'}.get(via, via or 'layanan')
    if kind in ('bruteforce', 'distributed'):
        return (f'⚠️ Saran: batasi akses {via_txt} hanya dari IP admin (IP → Services → Available From), '
                f'nonaktifkan layanan yang tidak dipakai (telnet/ftp/www), pakai password kuat & jangan '
                f'pakai user "admin", atau blokir IP penyerang lewat firewall address-list.')
    if kind == 'success_after_fail':
        return ('🚨 Segera: cek siapa yang login (System → Users → Active Users), ganti password user tersebut, '
                'periksa perubahan konfigurasi & user baru, dan batasi akses layanan hanya dari IP admin.')
    if kind == 'new_ip':
        return 'ℹ️ Bila ini bukan Anda/tim Anda, segera ganti password dan batasi akses layanan router.'
    return 'ℹ️ Pastikan perubahan akun ini memang dilakukan oleh tim Anda.'


def _check_device(ctx, dev, cfg, nets, now):
    win = now - timedelta(minutes=cfg['mt_sec_bf_minutes'])
    fails = [e for e in MtSecEvent.query.filter(MtSecEvent.device_id == dev.id, MtSecEvent.kind == 'login_fail',
                                                MtSecEvent.created_at >= win).all()
             if not (e.ip and _whitelisted(e.ip, nets))]
    by_ip = {}
    for e in fails:
        by_ip.setdefault(e.ip or '(tanpa IP)', []).append(e)

    # 1) Brute force per IP
    for ip, evs in by_ip.items():
        if len(evs) < cfg['mt_sec_bf_threshold']:
            a = _open_alert(dev, 'bruteforce', ip)
            if a:
                a.count, a.last_seen_at = max(a.count or 0, len(evs)), max(e.created_at for e in evs)
            continue
        users = sorted({e.user for e in evs})
        vias = sorted({e.via for e in evs if e.via})
        a = _open_alert(dev, 'bruteforce', ip)
        if a:
            a.count = max(a.count or 0, len(evs))
            a.last_seen_at = max(e.created_at for e in evs)
            continue
        a = MtSecAlert(device_id=dev.id, kind='bruteforce', key=ip, severity='critical', count=len(evs),
                       detail=f'user: {", ".join(users)[:200]}; via: {", ".join(vias)}',
                       opened_at=now, last_seen_at=max(e.created_at for e in evs))
        db.session.add(a)
        db.session.flush()
        origin = _origin(ip) if ip != '(tanpa IP)' else ''
        title = f'🚨 Brute force ke MikroTik {dev.name} dari {ip}'
        msg = (_head(dev, '🚨 PERCOBAAN BRUTE FORCE')
               + f'\nIP penyerang: {ip}' + (f'\nAsal: {origin}' if origin else '')
               + f'\nLogin gagal: {len(evs)}× dalam {cfg["mt_sec_bf_minutes"]} menit'
               + f'\nUser dicoba: {", ".join(users)[:200]}'
               + (f'\nLewat: {", ".join(vias)}' if vias else '')
               + '\n\n' + _advice('bruteforce', vias[0] if vias else ''))
        _emit(ctx, dev, a, title, msg)

    # 2) Serangan terdistribusi (banyak IP sekaligus)
    ips = [ip for ip in by_ip if ip != '(tanpa IP)']
    dist = len(fails) >= cfg['mt_sec_dist_threshold'] and len(ips) >= 3
    a = _open_alert(dev, 'distributed', '')
    if dist and not a:
        top = sorted(by_ip.items(), key=lambda x: -len(x[1]))[:5]
        a = MtSecAlert(device_id=dev.id, kind='distributed', key='', severity='critical', count=len(fails),
                       detail=f'{len(ips)} IP', opened_at=now, last_seen_at=max(e.created_at for e in fails))
        db.session.add(a)
        db.session.flush()
        lines = '\n'.join(f'- {ip} ({len(evs)}×)' + (f' — {o}' if (o := _origin(ip)) else '') for ip, evs in top)
        title = f'🚨 Serangan login dari {len(ips)} IP ke MikroTik {dev.name}'
        msg = (_head(dev, '🚨 SERANGAN LOGIN TERDISTRIBUSI')
               + f'\nLogin gagal: {len(fails)}× dari {len(ips)} IP dalam {cfg["mt_sec_bf_minutes"]} menit'
               + f'\nIP teratas:\n{lines}\n\n' + _advice('distributed', ''))
        _emit(ctx, dev, a, title, msg)
    elif a and fails:
        a.count, a.last_seen_at = max(a.count or 0, len(fails)), max(e.created_at for e in fails)

    # 3) Peristiwa sekali-kirim: login berhasil (setelah gagal / dari IP baru) & perubahan user
    pending = MtSecEvent.query.filter(MtSecEvent.device_id == dev.id, MtSecEvent.alerted.is_(False),
                                      MtSecEvent.kind.in_(('login_ok', 'user_change'))).order_by(MtSecEvent.id).all()
    st = db.session.get(MtSecState, dev.id)
    learning = not st or not st.baseline_at or now - st.baseline_at < LEARNING
    for e in pending[:50]:
        e.alerted = True
        if e.ip and _whitelisted(e.ip, nets):
            continue
        if e.kind == 'login_ok':
            prior = MtSecEvent.query.filter(MtSecEvent.device_id == dev.id, MtSecEvent.kind == 'login_fail',
                                            MtSecEvent.ip == e.ip,
                                            MtSecEvent.created_at >= e.created_at - timedelta(hours=1),
                                            MtSecEvent.created_at <= e.created_at).count()
            if cfg['mt_sec_alert_success'] and prior >= 3:
                a = MtSecAlert(device_id=dev.id, kind='success_after_fail', key=f'{e.ip}|{e.user}',
                               severity='critical', count=prior, detail=f'user {e.user} via {e.via}',
                               opened_at=now, last_seen_at=e.created_at, closed_at=now)
                db.session.add(a)
                db.session.flush()
                origin = _origin(e.ip)
                title = f'🚨 Login BERHASIL setelah {prior}× gagal — MikroTik {dev.name}'
                msg = (_head(dev, '🚨 LOGIN BERHASIL SETELAH PERCOBAAN GAGAL')
                       + f'\nUser: {e.user}\nDari IP: {e.ip}' + (f'\nAsal: {origin}' if origin else '')
                       + f'\nLewat: {e.via}\nLogin gagal sebelumnya: {prior}× (1 jam terakhir)'
                       + '\n\nKemungkinan password berhasil ditebak.\n' + _advice('success_after_fail', e.via))
                _emit(ctx, dev, a, title, msg)
            elif (cfg['mt_sec_alert_new_ip'] and e.new_ip and not learning and e.ip
                  and _is_public(e.ip)):
                a = MtSecAlert(device_id=dev.id, kind='new_ip', key=f'{e.ip}|{e.user}', severity='warning',
                               count=1, detail=f'user {e.user} via {e.via}', opened_at=now,
                               last_seen_at=e.created_at, closed_at=now)
                db.session.add(a)
                db.session.flush()
                origin = _origin(e.ip)
                title = f'🟠 Login dari IP baru — MikroTik {dev.name} ({e.user} dari {e.ip})'
                msg = (_head(dev, '🟠 LOGIN DARI IP BARU')
                       + f'\nUser: {e.user}\nDari IP: {e.ip}' + (f'\nAsal: {origin}' if origin else '')
                       + f'\nLewat: {e.via}\nIP ini belum pernah dipakai user {e.user} sebelumnya.\n\n'
                       + _advice('new_ip', e.via))
                _emit(ctx, dev, a, title, msg)
        elif e.kind == 'user_change' and cfg['mt_sec_alert_user_change']:
            act = {'added': 'ditambahkan', 'removed': 'dihapus', 'changed': 'diubah'}.get(
                (re.search(r' (added|removed|changed) by', e.message or '') or [None, ''])[1], 'diubah')
            a = MtSecAlert(device_id=dev.id, kind='user_change', key=e.user, severity='warning', count=1,
                           detail=f'{act} oleh {e.by}'[:500], opened_at=now, last_seen_at=e.created_at, closed_at=now)
            db.session.add(a)
            db.session.flush()
            title = f'🟠 Akun user router {act}: {e.user} — MikroTik {dev.name}'
            msg = (_head(dev, '🟠 PERUBAHAN AKUN USER ROUTER')
                   + f'\nUser: {e.user}\nTindakan: {act}\nOleh: {e.by or "-"}\nLog: {(e.message or "")[:200]}\n\n'
                   + _advice('user_change', ''))
            _emit(ctx, dev, a, title, msg)


def _customer_for(ip):
    """IP lokal → pelanggan (sesi PPPoE dengan IP itu)."""
    try:
        from models import OnuLinkState, ONU
        st = OnuLinkState.query.filter_by(pppoe_ip=ip).first()
        if not st:
            return ''
        o = db.session.get(ONU, st.onu_id) if st.onu_id else None
        name = (o.name if o and o.name else '') or st.pppoe_user or ''
        return f'pelanggan {name}' + (f' (PPPoE {st.pppoe_user})' if st.pppoe_user and st.pppoe_user != name else '')
    except Exception:
        return ''


def _check_fw_and_audit(ctx, dev, cfg, nets, now):
    """Peristiwa firewall (digabung per daftar per jendela) & temuan audit kritis baru."""
    pending = MtSecEvent.query.filter(MtSecEvent.device_id == dev.id, MtSecEvent.alerted.is_(False),
                                      MtSecEvent.kind.in_(('fw_list', 'audit'))).order_by(MtSecEvent.id).all()
    by_list = {}
    for e in pending:
        if e.kind == 'audit':
            e.alerted = True
            if not cfg['mt_sec_alert_audit']:
                continue
            titles = [t.strip() for t in (e.message or '').split('|') if t.strip()]
            a = MtSecAlert(device_id=dev.id, kind='audit', key=e.by[:160], severity='critical', count=len(titles),
                           detail=(e.message or '')[:500], opened_at=now, last_seen_at=e.created_at, closed_at=now)
            db.session.add(a)
            db.session.flush()
            title = f'🛡️ Audit keamanan: {len(titles)} masalah kritis di MikroTik {dev.name}'
            msg = (_head(dev, '🛡️ AUDIT KONFIGURASI — MASALAH KRITIS')
                   + '\n' + '\n'.join(f'- {t}' for t in titles[:8])
                   + '\n\nDetail & cara memperbaiki ada di tab Keamanan (Audit konfigurasi).')
            _emit(ctx, dev, a, title, msg)
            continue
        if e.ip and _whitelisted(e.ip, nets):
            e.alerted = True
            continue
        by_list.setdefault(e.user, []).append(e)
    win = timedelta(minutes=cfg['mt_sec_fw_digest_minutes'])
    for lst, evs in by_list.items():
        if not cfg['mt_sec_alert_fw']:
            for e in evs:
                e.alerted = True
            continue
        last = (MtSecAlert.query.filter_by(device_id=dev.id, kind='fw_list', key=lst)
                .order_by(MtSecAlert.id.desc()).first())
        if last and last.opened_at and now - last.opened_at < win:
            continue     # tunggu jendela berikutnya → digabung jadi satu pesan
        for e in evs:
            e.alerted = True
        ips = list(dict.fromkeys(e.ip for e in evs))
        lan = 'lan' in lst.lower()
        a = MtSecAlert(device_id=dev.id, kind='fw_list', key=lst, severity='warning', count=len(ips),
                       detail=', '.join(ips[:20])[:500], opened_at=now, last_seen_at=evs[-1].created_at, closed_at=now)
        db.session.add(a)
        db.session.flush()
        lines = []
        for ip in ips[:8]:
            extra = _customer_for(ip) if lan or not _is_public(ip) else _origin(ip)
            lines.append(f'- {ip}' + (f' — {extra}' if extra else ''))
        if len(ips) > 8:
            lines.append(f'- … dan {len(ips) - 8} IP lain')
        if lan:
            title = f'🟠 Perangkat lokal tertangkap firewall ({lst}) — MikroTik {dev.name}'
            head = '🟠 SERANGAN DARI JARINGAN LOKAL'
            tip = ('⚠️ Kemungkinan perangkat pelanggan terinfeksi malware/bot. Hubungi pelanggan, minta ganti '
                   'password router/WiFi dan pindai perangkat; bila berlanjut, batasi sementara.')
        else:
            title = f'🟠 Firewall menangkap {len(ips)} IP ({lst}) — MikroTik {dev.name}'
            head = '🟠 FIREWALL MENANGKAP SERANGAN'
            tip = 'ℹ️ IP sudah masuk daftar firewall router. Pastikan ada aturan drop untuk daftar ini.'
        msg = (_head(dev, head) + f'\nDaftar: {lst}\nIP baru: {len(ips)}\n' + '\n'.join(lines) + '\n\n' + tip)
        _emit(ctx, dev, a, title, msg)


def _is_public(ip):
    try:
        return ipaddress.ip_address(ip).is_global
    except ValueError:
        return False


def _close_quiet(ctx, cfg, now):
    quiet = timedelta(minutes=cfg['mt_sec_quiet_minutes'])
    devs = {d.id: d for d in MikrotikDevice.query.all()}
    for a in MtSecAlert.query.filter(MtSecAlert.closed_at.is_(None),
                                     MtSecAlert.kind.in_(('bruteforce', 'distributed'))).all():
        dev = devs.get(a.device_id)
        if dev and dev.enabled and a.last_seen_at and now - a.last_seen_at < quiet:
            continue
        a.closed_at = now
        for n in Notification.query.filter_by(category=CATEGORY, target_type=TARGET, target_id=a.id,
                                              resolved=False).all():
            n.resolved, n.resolved_at = True, now
        if not dev:
            continue
        who = f'dari {a.key}' if a.kind == 'bruteforce' else f'({a.detail})'
        mins = cfg['mt_sec_quiet_minutes']
        ctx['alerts'].append({'olt_id': None, 'olt_name': dev.name, 'olt_ip': dev.host, 'target_type': TARGET,
                              'target_id': a.id, 'type': f'{CATEGORY}_{a.kind}_recovery', 'severity': 'info',
                              'title': f'✅ Serangan berhenti: MikroTik {dev.name}',
                              'message': f'✅ Percobaan login {who} ke {dev.name} sudah berhenti — tidak ada '
                                         f'percobaan baru {mins} menit. Total tercatat: {a.count}×.',
                              'is_recovery': True})
    # Notifikasi sekali-kirim (login IP baru, perubahan user, dll.) selesai otomatis setelah 24 jam
    old = now - timedelta(hours=24)
    for n in Notification.query.filter(Notification.category == CATEGORY, Notification.resolved.is_(False),
                                       Notification.created_at < old).all():
        a = db.session.get(MtSecAlert, n.target_id) if n.target_id else None
        if a is None or a.closed_at is not None:
            n.resolved, n.resolved_at = True, now


def check_security(now, notifications_to_create, alerts_to_send):
    """Dipanggil siklus alert. Hanya membaca DB."""
    cfg = get_settings()
    if not cfg['mt_sec_enabled']:
        return
    nets = _parse_whitelist(cfg[WHITELIST_KEY])
    ctx = {'notifs': notifications_to_create, 'alerts': alerts_to_send, 'new': []}
    for dev in MikrotikDevice.query.filter_by(enabled=True).all():
        try:
            _check_device(ctx, dev, cfg, nets, now)
            _check_fw_and_audit(ctx, dev, cfg, nets, now)
        except Exception as e:
            logger.warning('[MT-SEC] %s: %s', dev.name, e)
    _close_quiet(ctx, cfg, now)
    if ctx['new'] and cfg['mt_sec_ai_analysis']:
        _ai_followup_async(ctx['new'])


# ───────────────────────────── analisis AI ─────────────────────────────

_ai_lock = threading.Lock()


def _ai_enabled():
    try:
        import ai_agent
        c = ai_agent.get_config(include_key=True)
        return c['ai_enabled'] == '1' and (c['ai_provider'] != 'anthropic' or bool(c.get('api_key')))
    except Exception:
        return False


def ai_prompt(title, message):
    return ('Ada alert keamanan MikroTik berikut dari NMS. Analisis singkat (maks 8 baris) untuk admin '
            'jaringan: seberapa berbahaya, kemungkinan penyebab/pelaku (bot scanner internet, salah password '
            'teknisi, atau akun bocor), dan langkah konkret yang disarankan di RouterOS (sebut menu/perintah). '
            'Boleh pakai tool mikrotik_security untuk melihat riwayat serangan router ini. Jangan mengarang data.'
            f'\n\nJudul: {title}\n{message}')


def _ai_followup_async(items):
    if not _ai_enabled():
        return
    from flask import current_app
    try:
        app = current_app._get_current_object()
    except RuntimeError:
        return

    def work():
        if not _ai_lock.acquire(blocking=False):
            return
        try:
            with app.app_context():
                import ai_agent
                from alerts import _send_external_alerts
                from models import AlertRule
                for aid, title, message in items[:3]:   # batasi biaya: maks 3 analisis per siklus
                    text = ai_agent.ask(f'mt-sec-{aid}', ai_prompt(title, message))
                    if not text or text.startswith(('Maaf', 'AI agent NMS belum', 'Kunci API')):
                        continue
                    a = db.session.get(MtSecAlert, aid)
                    if a:
                        a.ai_text = text[:4000]
                        db.session.commit()
                    dev = db.session.get(MikrotikDevice, a.device_id) if a else None
                    _send_external_alerts([{
                        'olt_id': None, 'olt_name': dev.name if dev else '', 'olt_ip': dev.host if dev else '',
                        'type': f'{CATEGORY}_ai', 'severity': 'info', 'is_recovery': False,
                        'title': f'🤖 Analisis AI: {title}', 'message': f'🤖 ANALISIS AI\n{title}\n\n{text}'}],
                        AlertRule.query.first())
        except Exception as e:
            logger.warning('[MT-SEC] AI follow-up failed: %s', e)
        finally:
            _ai_lock.release()
    threading.Thread(target=work, daemon=True, name='mt-sec-ai').start()


# ───────────────────────────── ringkasan (API & AI) ─────────────────────────────

def summary(hours=24, device_id=None, limit=50):
    """Ringkasan untuk halaman Keamanan & tool AI."""
    import ip_info
    now = _now()
    since = now - timedelta(hours=hours)
    devs = {d.id: d for d in MikrotikDevice.query.order_by(MikrotikDevice.name).all()}
    q = MtSecEvent.query.filter(MtSecEvent.created_at >= since)
    if device_id:
        q = q.filter(MtSecEvent.device_id == device_id)
    evs = q.order_by(MtSecEvent.id.desc()).limit(5000).all()
    fails = [e for e in evs if e.kind == 'login_fail']
    attackers = {}
    for e in fails:
        k = (e.ip or '(tanpa IP)')
        a = attackers.setdefault(k, {'ip': k, 'count': 0, 'users': set(), 'via': set(), 'routers': set(),
                                     'last': e.created_at})
        a['count'] += 1
        a['users'].add(e.user)
        if e.via:
            a['via'].add(e.via)
        a['routers'].add(devs[e.device_id].name if e.device_id in devs else str(e.device_id))
        a['last'] = max(a['last'], e.created_at)
    top = sorted(attackers.values(), key=lambda x: -x['count'])[:20]
    infos, missing = ip_info.cached([a['ip'] for a in top])
    if missing:
        ip_info.ensure_async(missing)
    open_alerts = MtSecAlert.query.filter(MtSecAlert.closed_at.is_(None)).all()
    states = {s.device_id: s for s in MtSecState.query.all()}

    def iso(d):
        return d.isoformat() + 'Z' if d else None
    routers = []
    for d in devs.values():
        if device_id and d.id != device_id:
            continue
        st = states.get(d.id)
        df = [e for e in fails if e.device_id == d.id]
        import mikrotik_audit
        routers.append({'id': d.id, 'name': d.name, 'host': d.host, 'enabled': bool(d.enabled),
                        'audit': mikrotik_audit.result(d.id),
                        'reachable': bool(d.last_ok), 'fails': len(df),
                        'attackers': len({e.ip for e in df}),
                        'logins': sum(1 for e in evs if e.device_id == d.id and e.kind == 'login_ok'),
                        'open_alerts': sum(1 for a in open_alerts if a.device_id == d.id),
                        'last_read_at': iso(st.last_read_at) if st else None,
                        'learning': bool(not st or not st.baseline_at or now - st.baseline_at < LEARNING),
                        'error': (st.last_error if st else '') or ''})
    fwq = MtSecFwSeen.query.filter(MtSecFwSeen.last_seen >= since, MtSecFwSeen.address != '')
    if device_id:
        fwq = fwq.filter(MtSecFwSeen.device_id == device_id)
    fw = {}
    for r in fwq.order_by(MtSecFwSeen.last_seen.desc()).limit(3000).all():
        st = states.get(r.device_id)
        active = bool(st and st.last_read_at and r.last_seen and r.last_seen >= st.last_read_at)
        g = fw.setdefault((r.device_id, r.list), {'list': r.list, 'router': devs[r.device_id].name if r.device_id in devs else '',
                                                  'active': 0, 'seen': 0, 'recent': []})
        g['seen'] += 1
        g['active'] += int(active)
        if len(g['recent']) < 15:
            ip = r.address.split('/')[0]
            g['recent'].append({'ip': ip, 'active': active, 'first_seen': iso(r.first_seen), 'last_seen': iso(r.last_seen),
                                'times': r.times or 1, 'comment': r.comment or '',
                                'customer': _customer_for(ip) if 'lan' in r.list.lower() or not _is_public(ip) else ''})
    fw_ips = [x['ip'] for g in fw.values() for x in g['recent'] if _is_public(x['ip'])]
    if fw_ips:
        more, miss2 = ip_info.cached(fw_ips)
        infos.update(more)
        if miss2:
            ip_info.ensure_async(miss2)
    for g in fw.values():
        for x in g['recent']:
            x['info'] = infos.get(x['ip'])
    return {
        'hours': hours,
        'fw_lists': sorted(fw.values(), key=lambda g: (-g['active'], g['router'], g['list'])),
        'totals': {'fails': len(fails), 'attackers': len([a for a in attackers if a != '(tanpa IP)']),
                   'logins': sum(1 for e in evs if e.kind == 'login_ok'),
                   'user_changes': sum(1 for e in evs if e.kind == 'user_change'),
                   'fw_new': sum(1 for e in evs if e.kind == 'fw_list'),
                   'open_alerts': len(open_alerts)},
        'routers': routers,
        'attackers': [{'ip': a['ip'], 'count': a['count'], 'users': sorted(a['users'])[:8],
                       'via': sorted(a['via']), 'routers': sorted(a['routers']), 'last': iso(a['last']),
                       'info': infos.get(a['ip'])} for a in top],
        'alerts': [{'id': a.id, 'router': devs[a.device_id].name if a.device_id in devs else '',
                    'kind': a.kind, 'key': a.key, 'severity': a.severity, 'count': a.count, 'detail': a.detail,
                    'opened_at': iso(a.opened_at), 'last_seen_at': iso(a.last_seen_at),
                    'closed_at': iso(a.closed_at), 'ai_text': a.ai_text or ''}
                   for a in MtSecAlert.query.filter(
                       (MtSecAlert.closed_at.is_(None)) | (MtSecAlert.opened_at >= since))
                   .order_by(MtSecAlert.id.desc()).limit(30).all()
                   if not device_id or a.device_id == device_id],
        'events': [{'id': e.id, 'router': devs[e.device_id].name if e.device_id in devs else '',
                    'kind': e.kind, 'user': e.user, 'ip': e.ip, 'via': e.via, 'by': e.by, 'new_ip': bool(e.new_ip),
                    'message': e.message, 'at': iso(e.created_at)} for e in evs[:limit]],
    }
