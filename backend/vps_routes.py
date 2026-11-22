"""Rute server NMS → jaringan pelanggan PPPoE, diatur dari web.

Aplikasi berjalan sebagai user non-root; perubahan rute kernel hanya lewat helper
root yang sempit `/usr/local/sbin/salfanet-route` (dipasang `deploy/setup_routes.sh`,
diizinkan sudoers hanya untuk file itu). Helper yang memvalidasi ulang semua
aturan keamanan (IP privat, tidak beririsan dengan jaringan server, gateway on-link)
— validasi di sini hanya agar pesan error cepat & jelas.
"""
import ipaddress
import json
import logging
import os
import subprocess
from datetime import datetime, timezone

from models import db, VpsRoute, MikrotikDevice, OnuLinkState

logger = logging.getLogger(__name__)

HELPER = '/usr/local/sbin/salfanet-route'
SETUP_CMD = 'bash /opt/salfanet-nms/deploy/setup_routes.sh'
_ALLOWED = [ipaddress.ip_network(n) for n in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10')]


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _sudo(*args, timeout=15):
    """→ (ok, output). Tidak pernah melempar."""
    try:
        r = subprocess.run(['sudo', '-n', HELPER, *args], capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        return False, 'sudo tidak tersedia'
    except subprocess.TimeoutExpired:
        return False, 'helper rute timeout'
    out = (r.stdout if r.returncode == 0 else (r.stderr or r.stdout)).strip()
    return r.returncode == 0, out[:300]


def helper_status():
    """'ok' | 'missing' (belum dipasang) | 'no_sudo' (terpasang tapi izin sudo belum ada)."""
    if not os.path.exists(HELPER):
        return 'missing'
    ok, _ = _sudo('check', timeout=5)
    return 'ok' if ok else 'no_sudo'


def validate(cidr, gateway):
    """→ (cidr_normal, gateway, error|None). Pemeriksaan dasar sebelum memanggil helper."""
    try:
        net = ipaddress.ip_network(str(cidr).strip(), strict=False)
        gw = ipaddress.ip_address(str(gateway).strip())
    except ValueError:
        return None, None, 'Format CIDR/gateway tidak valid (contoh: 10.10.0.0/16 via 192.168.54.1)'
    if net.version != 4 or gw.version != 4:
        return None, None, 'Hanya IPv4'
    if not 8 <= net.prefixlen <= 32:
        return None, None, 'Prefix harus /8 sampai /32'
    if not any(net.subnet_of(a) for a in _ALLOWED):
        return None, None, 'Hanya jaringan privat (10/8, 172.16/12, 192.168/16) atau CGNAT 100.64/10'
    if gw in net:
        return None, None, 'Gateway tidak boleh berada di dalam jaringan tujuan'
    return str(net), str(gw), None


def apply(route):
    ok, out = _sudo('add', route.cidr, route.gateway)
    route.status, route.last_error = ('ok', '') if ok else ('error', out)
    route.applied_at = _now() if ok else route.applied_at
    return ok, out


def remove(route):
    return _sudo('del', route.cidr, route.gateway)


def kernel_routes():
    ok, out = _sudo('list', timeout=5)
    if not ok:
        return []
    try:
        return json.loads(out or '[]')
    except ValueError:
        return []


def apply_all():
    """Pasang ulang semua rute aktif (dipanggil saat service start)."""
    rows = VpsRoute.query.filter_by(enabled=True).all()
    if not rows or helper_status() != 'ok':
        return 0
    n = 0
    for r in rows:
        ok, out = apply(r)
        n += ok
        if not ok:
            logger.warning('vps route %s via %s failed: %s', r.cidr, r.gateway, out)
    db.session.commit()
    return n


def suggestions():
    """Usulan rute dari IP PPPoE yang terlihat poller: dikelompokkan per router
    ke /16 (10.x, 100.64.x, 172.x) atau /24 (192.168.x); gateway = host router
    bila berupa IPv4. Yang sudah tercakup rute tersimpan ditandai."""
    existing = [ipaddress.ip_network(r.cidr) for r in VpsRoute.query.all()]
    devs = {d.id: d for d in MikrotikDevice.query.all()}
    groups = {}
    for st in OnuLinkState.query.filter(OnuLinkState.pppoe_ip.isnot(None), OnuLinkState.pppoe_ip != '').all():
        try:
            ip = ipaddress.ip_address(st.pppoe_ip)
        except ValueError:
            continue
        if ip.version != 4 or not any(ip in a for a in _ALLOWED):
            continue
        plen = 24 if ip in ipaddress.ip_network('192.168.0.0/16') else 16
        net = ipaddress.ip_network(f'{ip}/{plen}', strict=False)
        key = (str(net), st.mikrotik_id)
        groups[key] = groups.get(key, 0) + 1
    out = []
    for (net, mid), count in sorted(groups.items(), key=lambda kv: -kv[1]):
        dev = devs.get(mid)
        gw = ''
        if dev:
            try:
                gw = str(ipaddress.ip_address(dev.host))
            except ValueError:
                gw = ''
        n = ipaddress.ip_network(net)
        out.append({'cidr': net, 'gateway': gw, 'mikrotik_id': mid, 'router': dev.name if dev else None,
                    'clients': count, 'covered': any(n.subnet_of(e) for e in existing if e.version == 4)})
    return out


def route_dict(r):
    return {'id': r.id, 'cidr': r.cidr, 'gateway': r.gateway, 'mikrotik_id': r.mikrotik_id, 'note': r.note,
            'enabled': bool(r.enabled), 'status': r.status, 'last_error': r.last_error,
            'applied_at': r.applied_at.isoformat() + 'Z' if r.applied_at else None}
