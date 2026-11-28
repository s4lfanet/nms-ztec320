"""Penemuan perangkat otomatis (tahap E) — selalu sebagai USULAN; admin yang memutuskan menambah.

1. `neighbor_candidates()` — tetangga LLDP/CDP/MNDP yang punya IP manajemen tapi belum terdaftar.
2. `Scanner` — pindai subnet (hanya IPv4 privat, maks /22) dengan community/versi bawaan Pengaturan:
   tiap IP diuji SNMP GET sysName/sysDescr. Berjalan di thread latar; hasil dibaca lewat `status()`.
Hanya membaca (SNMP GET) — tidak mengubah perangkat apa pun.
"""
import ipaddress
import threading
import time
from concurrent.futures import ThreadPoolExecutor

MAX_HOSTS = 1024
WORKERS = 24


def parse_cidr(text):
    """→ (network, error). Hanya IPv4 privat/link-local, prefix /22 atau lebih kecil."""
    try:
        net = ipaddress.ip_network((text or '').strip(), strict=False)
    except ValueError:
        return None, 'CIDR tidak valid (contoh: 10.10.1.0/24)'
    if net.version != 4:
        return None, 'Hanya IPv4'
    if not (net.is_private or net.is_link_local):
        return None, 'Hanya rentang IP privat (10.x, 172.16–31.x, 192.168.x)'
    if net.num_addresses > MAX_HOSTS:
        return None, f'Rentang terlalu besar (maks {MAX_HOSTS} alamat, mis. /22)'
    return net, None


def known_hosts():
    from models import SnmpDevice
    return {(d.host or '').strip() for d in SnmpDevice.query.all()}


def neighbor_candidates():
    """Tetangga ber-IP yang belum menjadi perangkat SNMP → daftar usulan (satu per IP)."""
    from models import SnmpNeighbor, SnmpDevice
    known = known_hosts()
    names = {d.id: d.name for d in SnmpDevice.query.all()}
    out = {}
    for n in SnmpNeighbor.query.filter(SnmpNeighbor.remote_ip != '', SnmpNeighbor.remote_device_id.is_(None)) \
            .order_by(SnmpNeighbor.last_seen.desc()).all():
        ip = (n.remote_ip or '').strip()
        try:
            if ipaddress.ip_address(ip).version != 4:
                continue
        except ValueError:
            continue
        if ip in known or ip in out:
            continue
        out[ip] = {'ip': ip, 'name': n.remote_name or '', 'platform': n.remote_platform or '', 'protocol': n.protocol,
                   'seen_from': names.get(n.device_id, ''), 'source': 'neighbor'}
    return list(out.values())


_state = {'running': False, 'cidr': '', 'total': 0, 'done': 0, 'found': [], 'error': '', 'started': 0.0}
_lock = threading.Lock()


def status():
    with _lock:
        return {k: (list(v) if isinstance(v, list) else v) for k, v in _state.items()}


def _probe(ip, base):
    import snmp_monitor
    r = snmp_monitor.test_connection({**base, 'host': ip})
    if r.get('ok'):
        return {'ip': ip, 'name': r.get('sys_name') or '', 'platform': (r.get('vendor') or '') + (' ' + r['os'] if r.get('os') else ''),
                'descr': r.get('sys_descr') or '', 'source': 'scan'}
    return None


def start_scan(cidr, base_params, app):
    """Mulai pindai di thread latar. → (ok, pesan). base_params = device_params-style tanpa host."""
    net, err = parse_cidr(cidr)
    if err:
        return False, err
    with _lock:
        if _state['running']:
            return False, 'Pemindaian lain masih berjalan'
        known = known_hosts()
        hosts = [str(h) for h in net.hosts() if str(h) not in known]
        _state.update(running=True, cidr=str(net), total=len(hosts), done=0, found=[], error='', started=time.time())

    def work():
        try:
            with app.app_context():
                with ThreadPoolExecutor(max_workers=WORKERS) as ex:
                    for res in ex.map(lambda ip: _safe(ip, base_params), hosts):
                        with _lock:
                            _state['done'] += 1
                            if res:
                                _state['found'].append(res)
        except Exception as e:  # noqa: BLE001
            with _lock:
                _state['error'] = str(e)[:200]
        finally:
            with _lock:
                _state['running'] = False
    threading.Thread(target=work, daemon=True, name='snmp-scan').start()
    return True, f'Memindai {len(hosts)} alamat'


def _safe(ip, base):
    try:
        return _probe(ip, base)
    except Exception:  # noqa: BLE001
        return None
