"""Info IP publik (ISP/ASN, negara, kota) untuk Log Aktivitas — dengan cache di DB.

Penyedia (SystemConfig `ip_lookup_provider`):
- `ipinfo`  : IPinfo Lite — ASN + nama ISP + negara, gratis tanpa batas & boleh
              dipakai komersial (wajib atribusi), perlu token gratis
              (`ip_lookup_token`, disimpan terenkripsi).
- `ip-api`  : ip-api.com — sampai kota + ISP, tanpa token, TETAPI endpoint
              gratisnya hanya untuk non-komersial & HTTP saja. Hanya dipakai bila
              admin memilihnya sendiri.
- `off`     : tidak mengirim IP ke pihak luar (bawaan bila belum ada token).

Pencarian berjalan di thread latar (`ensure_async`), tidak pernah memperlambat
permintaan; IP privat/loopback tidak pernah dikirim keluar. Hasil disimpan 30 hari,
kegagalan dicoba lagi setelah 1 jam.
"""
import ipaddress
import json
import threading
import urllib.request
from datetime import datetime, timedelta, timezone

from extensions import logger

PROVIDERS = ('off', 'ipinfo', 'ip-api')
TTL_OK = timedelta(days=30)
TTL_ERR = timedelta(hours=1)
MAX_PER_RUN = 60
TIMEOUT = 4

_lock = threading.Lock()
_running = False


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def is_public(ip):
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return a.is_global


def scope_label(ip):
    """Keterangan untuk IP non-publik (tidak dicari keluar)."""
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        return ''
    if a.is_loopback:
        return 'loopback'
    if a.version == 4 and a in ipaddress.ip_network('100.64.0.0/10'):
        return 'cgnat'
    if a.is_private or a.is_link_local:
        return 'private'
    return ''


# ─── konfigurasi ───
def get_config(with_secret=False):
    from models import SystemConfig, decrypt_field
    rows = {r.key: r.value for r in SystemConfig.query.filter(
        SystemConfig.key.in_(['ip_lookup_provider', 'ip_lookup_token'])).all()}
    token = ''
    if rows.get('ip_lookup_token'):
        try:
            token = decrypt_field(rows['ip_lookup_token']) or ''
        except Exception:
            token = ''
    prov = rows.get('ip_lookup_provider') or ('ipinfo' if token else 'off')
    if prov not in PROVIDERS:
        prov = 'off'
    out = {'provider': prov, 'has_token': bool(token)}
    if with_secret:
        out['token'] = token
    return out


def save_config(data):
    from models import db, SystemConfig, encrypt_field

    def put(k, v):
        row = SystemConfig.query.filter_by(key=k).first()
        if row:
            row.value = v
        else:
            db.session.add(SystemConfig(key=k, value=v))
    if data.get('provider') in PROVIDERS:
        put('ip_lookup_provider', data['provider'])
    if 'token' in data:
        tok = str(data.get('token') or '').strip()[:100]
        put('ip_lookup_token', encrypt_field(tok) if tok else '')
    # ganti penyedia/token → info gagal lama boleh dicoba ulang segera
    from models import IpInfo
    IpInfo.query.filter(IpInfo.error != '').delete()


# ─── penyedia ───
def _get_json(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:  # nosec B310 — URL tetap milik penyedia
        return json.loads(r.read().decode('utf-8', 'replace'))


def _fetch_ipinfo(ips, token):
    out = {}
    for ip in ips:
        try:
            d = _get_json(f'https://api.ipinfo.io/lite/{ip}', headers={'Authorization': f'Bearer {token}',
                                                                       'Accept': 'application/json'})
            out[ip] = {'asn': d.get('asn') or '', 'as_name': d.get('as_name') or '',
                       'as_domain': d.get('as_domain') or '', 'country_code': d.get('country_code') or '',
                       'country': d.get('country') or '', 'region': '', 'city': ''}
        except Exception as e:
            out[ip] = {'error': str(e)[:200]}
    return out


def _fetch_ipapi(ips):
    out = {}
    body = json.dumps([{'query': ip, 'fields': 'status,message,query,country,countryCode,regionName,city,isp,org,as'}
                       for ip in ips]).encode()
    try:
        rows = _get_json('http://ip-api.com/batch', data=body,  # nosec — endpoint gratis hanya HTTP
                         headers={'Content-Type': 'application/json'})
    except Exception as e:
        return {ip: {'error': str(e)[:200]} for ip in ips}
    for d in rows:
        ip = d.get('query')
        if d.get('status') != 'success':
            out[ip] = {'error': (d.get('message') or 'gagal')[:200]}
            continue
        asn = (d.get('as') or '').split(' ', 1)
        out[ip] = {'asn': asn[0] if asn and asn[0].startswith('AS') else '',
                   'as_name': d.get('isp') or d.get('org') or (asn[1] if len(asn) > 1 else ''),
                   'as_domain': '', 'country_code': d.get('countryCode') or '', 'country': d.get('country') or '',
                   'region': d.get('regionName') or '', 'city': d.get('city') or ''}
    return out


def lookup_now(ips):
    """Cari & simpan (dipanggil dari thread latar dengan app context). → jumlah tersimpan."""
    from models import db, IpInfo
    cfg = get_config(with_secret=True)
    prov = cfg['provider']
    if prov == 'off' or (prov == 'ipinfo' and not cfg.get('token')):
        return 0
    ips = [ip for ip in dict.fromkeys(ips) if is_public(ip)][:MAX_PER_RUN]
    if not ips:
        return 0
    res = _fetch_ipinfo(ips, cfg['token']) if prov == 'ipinfo' else _fetch_ipapi(ips[:100])
    now = _now()
    for ip, d in res.items():
        row = db.session.get(IpInfo, ip) or IpInfo(ip=ip)
        for k in ('asn', 'as_name', 'as_domain', 'country_code', 'country', 'region', 'city'):
            if k in d:
                setattr(row, k, (d.get(k) or '')[:200])
        row.error = (d.get('error') or '')[:200]
        row.provider, row.fetched_at = prov, now
        db.session.add(row)
    db.session.commit()
    return len(res)


def cached(ips):
    """→ {ip: dict} dari cache (tanpa jaringan) + daftar IP publik yang perlu dicari."""
    from models import IpInfo
    ips = [ip for ip in dict.fromkeys(ips) if ip]
    pub = [ip for ip in ips if is_public(ip)]
    rows = {r.ip: r for r in IpInfo.query.filter(IpInfo.ip.in_(pub)).all()} if pub else {}
    now = _now()
    out, missing = {}, []
    for ip in ips:
        scope = scope_label(ip)
        if scope:
            out[ip] = {'scope': scope}
            continue
        r = rows.get(ip)
        if r and not r.error:
            out[ip] = {'asn': r.asn, 'as_name': r.as_name, 'as_domain': r.as_domain,
                       'country_code': r.country_code, 'country': r.country, 'region': r.region, 'city': r.city}
        stale = (not r or not r.fetched_at
                 or now - r.fetched_at > (TTL_ERR if r.error else TTL_OK))
        if is_public(ip) and stale:
            missing.append(ip)
    return out, missing


def ensure_async(ips):
    """Jalankan pencarian di latar untuk IP yang belum ada di cache (maks satu thread)."""
    global _running
    if not ips:
        return
    from flask import current_app
    app = current_app._get_current_object()
    with _lock:
        if _running:
            return
        _running = True

    def run():
        global _running
        try:
            with app.app_context():
                lookup_now(ips)
        except Exception as e:
            logger.warning(f'[ip_info] lookup failed: {e}')
        finally:
            with _lock:
                _running = False
    threading.Thread(target=run, name='ip-info-lookup', daemon=True).start()
