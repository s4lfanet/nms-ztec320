"""Audit konfigurasi keamanan router MikroTik (HANYA MEMBACA lewat API).

`gather(cli)`   — baca menu RouterOS yang relevan (print/GET saja); menu yang tidak ada → None.
`evaluate(raw)` — murni (bisa dites): → (temuan, skor 0–100, versi).
`run(dev)`      — sambung, gather, evaluate, simpan `MtSecAudit`; temuan KRITIS baru dicatat sebagai
                  peristiwa `audit` → dialert oleh `mikrotik_security.check_security`.
Dijalankan otomatis tiap `mt_audit_hours` (bawaan 24) dari poller, atau manual dari tab Keamanan.
"""
import json
import logging
import re
from datetime import datetime, timezone

from models import db, MtSecAudit, MtSecEvent

logger = logging.getLogger(__name__)

SEV_WEIGHT = {'critical': 25, 'warning': 8, 'info': 2}
MGMT_SERVICES = ('winbox', 'ssh', 'api', 'api-ssl', 'www', 'www-ssl', 'telnet', 'ftp')
PLAIN_SERVICES = ('telnet', 'ftp', 'www')          # tanpa enkripsi
SUSPICIOUS = re.compile(r'(/tool\s+fetch|\bfetch\b[^\n]*url=|/ip\s+socks|socks\s+set|/ip\s+proxy\s+set|'
                        r'\bimport\b|/user\s+add|/system\s+reset|/file\s+remove)', re.I)


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _yes(v):
    return str(v).lower() in ('true', 'yes', '1')


def parse_version(v):
    m = re.match(r'(\d+)\.(\d+)(?:\.(\d+))?', str(v or ''))
    return tuple(int(x or 0) for x in m.groups()) if m else None


# ───────────────────────────── baca router ─────────────────────────────

READS = {
    'resource': ('system/resource', 'version,board-name'),
    'services': ('ip/service', 'name,port,address,disabled'),
    'users': ('user', 'name,group,address,disabled'),
    'dns': ('ip/dns', 'allow-remote-requests'),
    'proxy': ('ip/proxy', 'enabled,port'),
    'socks': ('ip/socks', 'enabled,port'),
    'scheduler': ('system/scheduler', 'name,on-event,disabled'),
    'scripts': ('system/script', 'name,source'),
    'btest': ('tool/bandwidth-server', 'enabled,authenticate'),
    'upnp': ('ip/upnp', 'enabled'),
    'filter': ('ip/firewall/filter', 'chain,action,protocol,dst-port,in-interface,in-interface-list,'
                                     'src-address-list,disabled,dynamic'),
}


def gather(cli):
    out = {}
    for key, (path, props) in READS.items():
        try:
            out[key] = cli.read(path, props)
        except Exception as e:   # menu tidak ada di versi ini / tanpa izin → lewati
            out[key] = None
            logger.debug('audit read %s: %s', path, e)
    return out


# ───────────────────────────── penilaian ─────────────────────────────

def _f(out, fid, sev, title, detail, fix=''):
    out.append({'id': fid, 'severity': sev, 'title': title, 'detail': detail, 'fix': fix})


def evaluate(raw):
    """→ (findings, score, version)."""
    F = []
    res = (raw.get('resource') or [{}])[0] if raw.get('resource') else {}
    version = str(res.get('version') or '')
    ver = parse_version(version)
    filt = [r for r in (raw.get('filter') or []) if not _yes(r.get('disabled')) and not _yes(r.get('dynamic'))]
    input_drop = [r for r in filt if r.get('chain') == 'input' and r.get('action') in ('drop', 'reject')]
    has_input_fw = bool(input_drop)

    # 1) Versi RouterOS
    if ver:
        if ver < (6, 42, 1):
            _f(F, 'ver_cve_2018_14847', 'critical', f'RouterOS {version} rentan celah Winbox (CVE-2018-14847)',
               'Celah ini memungkinkan penyerang membaca file user (termasuk password) TANPA login. '
               'Banyak router dibobol lewat celah ini.',
               '/system package update check-for-updates; /system package update install  (lalu ganti SEMUA password)')
        elif ver < (6, 49, 0):
            _f(F, 'ver_old', 'warning', f'RouterOS {version} sudah lama',
               'Versi di bawah 6.49 belum memuat banyak perbaikan keamanan. Perbarui ke long-term/stable terbaru.',
               '/system package update set channel=long-term; /system package update check-for-updates')
    # 2) Layanan manajemen
    services = raw.get('services')
    if services is not None:
        for s in services:
            name = s.get('name', '')
            if name not in MGMT_SERVICES or _yes(s.get('disabled')):
                continue
            addr = (s.get('address') or '').strip()
            if name in PLAIN_SERVICES:
                _f(F, f'svc_plain_{name}', 'warning', f'Layanan {name} aktif (tanpa enkripsi)',
                   f'{name} mengirim password tanpa enkripsi dan sering jadi sasaran brute force.',
                   f'/ip service set {name} disabled=yes')
            if not addr:
                sev = 'critical' if not has_input_fw else 'warning'
                _f(F, f'svc_open_{name}', sev, f'Layanan {name} (port {s.get("port", "?")}) bisa diakses dari IP mana pun',
                   'Tidak ada batas "Available From". ' + ('Router juga tidak punya aturan drop di chain input, '
                   'jadi layanan ini terbuka ke internet.' if not has_input_fw else 'Batasi hanya ke IP admin.'),
                   f'/ip service set {name} address=<IP-admin>/32,<jaringan-NMS>')
    # 3) User
    users = raw.get('users')
    if users is not None:
        active = [u for u in users if not _yes(u.get('disabled'))]
        if any(u.get('name') == 'admin' for u in active):
            _f(F, 'user_admin', 'warning', 'User bawaan "admin" masih aktif',
               'Bot brute force hampir selalu mencoba user "admin". Buat user baru grup full, lalu nonaktifkan/hapus admin.',
               '/user add name=<nama-baru> group=full password=<kuat>; /user disable admin')
        full_open = [u['name'] for u in active if u.get('group') == 'full' and not (u.get('address') or '').strip()]
        if full_open:
            _f(F, 'user_full_open', 'info', f'User grup full tanpa batas IP: {", ".join(full_open[:6])}',
               'User full bisa login dari IP mana pun. Isi "Allowed Address" untuk user admin.',
               '/user set <nama> address=<IP-admin>/32')
    # 4) DNS, proxy, SOCKS, bandwidth test, UPnP
    dns = (raw.get('dns') or [{}])[0] if raw.get('dns') else {}
    if _yes(dns.get('allow-remote-requests')):
        dns_fw = any(r.get('chain') == 'input' and r.get('action') in ('drop', 'reject')
                     and '53' in str(r.get('dst-port') or '') for r in filt)
        if not dns_fw:
            _f(F, 'dns_open', 'warning', 'DNS router menerima permintaan luar tanpa aturan firewall port 53',
               'Bila port 53 terbuka ke internet, router bisa dipakai untuk serangan DDoS amplifikasi.',
               '/ip firewall filter add chain=input in-interface-list=WAN protocol=udp dst-port=53 action=drop')
    proxy = (raw.get('proxy') or [{}])[0] if raw.get('proxy') else {}
    if _yes(proxy.get('enabled')):
        _f(F, 'proxy_on', 'warning', f'Web proxy aktif (port {proxy.get("port", "?")})',
           'Proxy terbuka bisa dipakai orang luar menyamarkan trafik. Matikan bila tidak dipakai.', '/ip proxy set enabled=no')
    socks = (raw.get('socks') or [{}])[0] if raw.get('socks') else {}
    if _yes(socks.get('enabled')):
        _f(F, 'socks_on', 'critical', f'SOCKS proxy aktif (port {socks.get("port", "?")})',
           'SOCKS aktif adalah tanda umum router yang sudah dibobol botnet (mis. Meris). Cek user, scheduler, '
           'dan script; ganti password.', '/ip socks set enabled=no')
    btest = (raw.get('btest') or [{}])[0] if raw.get('btest') else {}
    if _yes(btest.get('enabled')):
        _f(F, 'btest_on', 'info' if _yes(btest.get('authenticate', 'yes')) else 'warning',
           'Bandwidth-test server aktif', 'Bisa dipakai menghabiskan bandwidth/CPU. Matikan bila tidak dipakai.',
           '/tool bandwidth-server set enabled=no')
    upnp = (raw.get('upnp') or [{}])[0] if raw.get('upnp') else {}
    if _yes(upnp.get('enabled')):
        _f(F, 'upnp_on', 'info', 'UPnP aktif', 'Perangkat di jaringan bisa membuka port ke internet sendiri.',
           '/ip upnp set enabled=no')
    # 5) Scheduler & script mencurigakan
    sus = []
    for s in raw.get('scheduler') or []:
        if not _yes(s.get('disabled')) and SUSPICIOUS.search(s.get('on-event') or ''):
            sus.append(f'scheduler "{s.get("name", "?")}"')
    for s in raw.get('scripts') or []:
        if SUSPICIOUS.search(s.get('source') or ''):
            sus.append(f'script "{s.get("name", "?")}"')
    if sus:
        _f(F, 'suspicious_scripts', 'warning', f'Scheduler/script perlu dicek: {", ".join(sus[:6])}',
           'Berisi perintah unduh (fetch), import, tambah user, atau SOCKS/proxy. Bisa sah (mis. backup), '
           'tapi juga pola umum router yang dibobol. Pastikan Anda mengenalinya.',
           '/system scheduler print detail; /system script print detail')
    # 6) Firewall
    if raw.get('filter') is not None and not has_input_fw:
        _f(F, 'no_input_drop', 'critical', 'Tidak ada aturan drop di chain input',
           'Semua layanan router (Winbox, SSH, DNS, API…) terbuka dari internet. Pasang firewall dasar '
           '(lihat Generator script di tab Keamanan).',
           '/ip firewall filter add chain=input in-interface-list=WAN action=drop  (setelah aturan accept established & admin)')
    score = max(0, 100 - sum(SEV_WEIGHT[f['severity']] for f in F))
    order = {'critical': 0, 'warning': 1, 'info': 2}
    F.sort(key=lambda f: order[f['severity']])
    return F, score, version


# ───────────────────────────── jalankan & simpan ─────────────────────────────

def save(dev, findings, score, version, now=None, error=''):
    now = now or _now()
    row = db.session.get(MtSecAudit, dev.id)
    prev = set()
    if row:
        try:
            prev = {f['id'] for f in json.loads(row.findings or '[]') if f.get('severity') == 'critical'}
        except ValueError:
            prev = set()
    else:
        row = MtSecAudit(device_id=dev.id)
        db.session.add(row)
    if error:
        row.at, row.error = now, error[:300]
        return row
    first = row.at is None or row.score is None
    row.at, row.score, row.version, row.error = now, score, version[:60], ''
    row.findings = json.dumps(findings, ensure_ascii=False)
    new_crit = [f for f in findings if f['severity'] == 'critical' and f['id'] not in prev]
    if new_crit:
        db.session.add(MtSecEvent(
            device_id=dev.id, kind='audit', user='', ip='', via='',
            by=','.join(f['id'] for f in new_crit)[:120],
            message=(' | '.join(f['title'] for f in new_crit))[:300],
            log_time='awal' if first else '', created_at=now))
    return row


def run(dev, cli=None, now=None):
    """Audit satu router. Tidak pernah raise. → dict hasil."""
    from routeros_client import RouterOSClient
    now = now or _now()
    own = cli is None
    try:
        if own:
            cli = RouterOSClient(dev.host, dev.api_mode, dev.api_port, dev.api_ssl,
                                 dev.api_user, dev.api_password, timeout=10).connect()
        raw = gather(cli)
        if raw.get('resource') is None and raw.get('services') is None:
            raise RuntimeError('tidak bisa membaca konfigurasi (cek izin read user API)')
        findings, score, version = evaluate(raw)
        save(dev, findings, score, version, now)
        db.session.commit()
        return {'ok': True, 'score': score, 'findings': findings, 'version': version}
    except Exception as e:
        db.session.rollback()
        try:
            save(dev, [], None, '', now, error=f'Audit gagal: {e}')
            db.session.commit()
        except Exception:
            db.session.rollback()
        return {'ok': False, 'error': str(e)[:300]}
    finally:
        if own and cli:
            try:
                cli.close()
            except Exception:
                pass


def result(dev_id):
    row = db.session.get(MtSecAudit, dev_id)
    if not row:
        return None
    try:
        findings = json.loads(row.findings or '[]')
    except ValueError:
        findings = []
    return {'at': row.at.isoformat() + 'Z' if row.at else None, 'score': row.score, 'version': row.version,
            'findings': findings, 'error': row.error or ''}
