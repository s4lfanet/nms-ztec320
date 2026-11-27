"""Topologi otomatis perangkat SNMP (tahap 4) — tetangga dari LLDP-MIB, CDP,
dan tabel tetangga MikroTik (MNDP/CDP/LLDP di RouterOS).

Dibaca saat discovery (bukan tiap poll): `collect()` murni jaringan (dipanggil di
`snmp_monitor.collect_discovery`), `parse()` murni data, `apply()` menulis
`SnmpNeighbor`, `link_all()` mencocokkan tetangga ke perangkat yang terdaftar
(IP manajemen → host, sysName/identity → sys_name/nama, MAC chassis → MAC port).
`build()` menyusun graf untuk UI. Hanya baca SNMP; tidak mengubah perangkat.
"""
import ipaddress

LLDP = '1.0.8802.1.1.2.1'
LLDP_LOC_PORT_ID = LLDP + '.3.7.1.3'
LLDP_LOC_PORT_DESC = LLDP + '.3.7.1.4'
LLDP_REM = LLDP + '.4.1.1'          # indeks timeMark.localPortNum.remIndex
LLDP_REM_COLS = {'chassis_sub': '4', 'chassis': '5', 'port_sub': '6', 'port': '7', 'port_desc': '8',
                 'sys_name': '9', 'sys_desc': '10'}
LLDP_MAN_ADDR = LLDP + '.4.2.1.3'   # alamat ada di indeks
CDP = '1.3.6.1.4.1.9.9.23.1.2.1.1'  # indeks ifIndex.devIndex
CDP_COLS = {'addr_type': '3', 'addr': '4', 'device_id': '6', 'port': '7', 'platform': '8'}
MT_NBR = '1.3.6.1.4.1.14988.1.1.11.1.1'
MT_NBR_COLS = {'ip': '2', 'mac': '3', 'version': '4', 'platform': '5', 'identity': '6', 'if_index': '8'}


def _text(b):
    if b is None:
        return ''
    if isinstance(b, bytes):
        return b.decode('utf-8', 'replace').replace('\x00', '').strip()
    return str(b).strip()


def _mac(b):
    if isinstance(b, bytes) and len(b) == 6:
        return ':'.join(f'{x:02x}' for x in b)
    if isinstance(b, str):
        s = b.strip().lower().replace('-', ':')
        if len(s) == 17 and s.count(':') == 5:
            return s
    return ''


def _ip(b):
    if isinstance(b, bytes) and len(b) == 4:
        return '.'.join(str(x) for x in b)
    s = _text(b)
    try:
        ipaddress.ip_address(s)
        return s
    except ValueError:
        return ''


def _printable(b):
    """Chassis/port id: MAC bila 6 byte, teks bila bisa dibaca, selain itu hex."""
    if isinstance(b, bytes):
        if len(b) == 6 and not all(32 <= x < 127 for x in b):
            return _mac(b)
        if b and all(32 <= x < 127 for x in b):
            return b.decode()
        return b.hex(':') if b else ''
    return _text(b)


async def collect(c, mikrotik=False):
    """→ {'lldp': {...}, 'cdp': {...}, 'mt': {...}}; tabel yang tidak didukung = kosong."""
    async def walk(oid, rows=2000):
        try:
            return await c.walk(oid, max_rows=rows)
        except RuntimeError:
            return {}
    out = {'lldp': {}, 'cdp': {}, 'mt': {}}
    rem = {k: await walk(f'{LLDP_REM}.{col}') for k, col in LLDP_REM_COLS.items() if k != 'chassis_sub'}
    if any(rem.values()):
        rem['loc_port_id'] = await walk(LLDP_LOC_PORT_ID)
        rem['loc_port_desc'] = await walk(LLDP_LOC_PORT_DESC)
        rem['man'] = await walk(LLDP_MAN_ADDR)
        out['lldp'] = rem
    cdp = {k: await walk(f'{CDP}.{col}') for k, col in CDP_COLS.items()}
    if any(cdp.values()):
        out['cdp'] = cdp
    if mikrotik:
        mt = {k: await walk(f'{MT_NBR}.{col}') for k, col in MT_NBR_COLS.items()}
        if any(mt.values()):
            out['mt'] = mt
    return out


def _local_if(num, loc_ids, loc_descs, ports):
    """lldpLocPortNum → ifIndex. Banyak agen memakai ifIndex langsung; selain itu cocokkan nama."""
    if num in ports:
        return num
    names = {_text(loc_ids.get(str(num))).lower(), _text(loc_descs.get(str(num))).lower()} - {''}
    for idx, p in ports.items():
        if {(p.get('name') or '').lower(), (p.get('descr') or '').lower()} & names:
            return idx
    return None


def parse(data, ports):
    """data = hasil collect(); ports = {ifIndex: {'name','descr'}} → daftar tetangga (dict)."""
    out = []
    lldp = (data or {}).get('lldp') or {}
    if lldp:
        man = {}
        for idx in (lldp.get('man') or {}):
            parts = idx.split('.')
            # timeMark.localPort.remIndex.addrSubtype.len.a.b.c.d (IPv4 = subtype 1, panjang 4)
            if len(parts) >= 9 and parts[3] == '1' and parts[4] == '4':
                man.setdefault((parts[1], parts[2]), '.'.join(parts[5:9]))
        keys = set()
        for col in ('chassis', 'sys_name', 'port'):
            keys |= set((lldp.get(col) or {}).keys())
        for idx in sorted(keys):
            parts = idx.split('.')
            if len(parts) != 3 or not parts[1].isdigit():
                continue
            g = lambda col: (lldp.get(col) or {}).get(idx)
            num = int(parts[1])
            out.append({
                'protocol': 'lldp',
                'local_if_index': _local_if(num, lldp.get('loc_port_id') or {}, lldp.get('loc_port_desc') or {}, ports),
                'remote_name': _text(g('sys_name'))[:255],
                'remote_chassis': _printable(g('chassis'))[:100],
                'remote_port': _printable(g('port'))[:150],
                'remote_port_descr': _text(g('port_desc'))[:255],
                'remote_platform': _text(g('sys_desc'))[:255],
                'remote_ip': man.get((parts[1], parts[2]), ''),
            })
    cdp = (data or {}).get('cdp') or {}
    if cdp:
        for idx, name in (cdp.get('device_id') or {}).items():
            parts = idx.split('.')
            if len(parts) != 2 or not parts[0].isdigit():
                continue
            addr = (cdp.get('addr') or {}).get(idx)
            out.append({
                'protocol': 'cdp',
                'local_if_index': int(parts[0]) if int(parts[0]) in ports else None,
                'remote_name': _text(name)[:255],
                'remote_chassis': '',
                'remote_port': _text((cdp.get('port') or {}).get(idx))[:150],
                'remote_port_descr': '',
                'remote_platform': _text((cdp.get('platform') or {}).get(idx))[:255],
                'remote_ip': _ip(addr) if (cdp.get('addr_type') or {}).get(idx, 1) == 1 else '',
            })
    mt = (data or {}).get('mt') or {}
    if mt:
        for idx in set((mt.get('identity') or {}).keys()) | set((mt.get('mac') or {}).keys()):
            g = lambda col: (mt.get(col) or {}).get(idx)
            ifi = g('if_index')
            ver = _text(g('version'))
            plat = _text(g('platform'))
            out.append({
                'protocol': 'mndp',
                'local_if_index': ifi if isinstance(ifi, int) and ifi in ports else None,
                'remote_name': _text(g('identity'))[:255],
                'remote_chassis': _mac(g('mac')),
                'remote_port': '',
                'remote_port_descr': '',
                'remote_platform': ' '.join(x for x in (plat, ver) if x)[:255],
                'remote_ip': _ip(g('ip')),
            })
    # Satu tetangga bisa terlihat lewat beberapa protokol: buang duplikat MNDP bila LLDP/CDP
    # sudah melaporkan perangkat yang sama di port yang sama.
    seen = set()
    for n in out:
        if n['protocol'] != 'mndp':
            seen.add((n['local_if_index'], n['remote_name'].lower()))
            if n['remote_chassis']:
                seen.add((n['local_if_index'], n['remote_chassis']))
    res = []
    for n in out:
        if n['protocol'] == 'mndp' and ((n['local_if_index'], n['remote_name'].lower()) in seen
                                        or (n['local_if_index'], n['remote_chassis']) in seen):
            continue
        if not (n['remote_name'] or n['remote_chassis'] or n['remote_ip']):
            continue
        res.append(n)
    return res


def _key(n):
    return (n['protocol'], n['local_if_index'] or 0, n['remote_chassis'] or n['remote_name'].lower() or n['remote_ip'],
            n['remote_port'])


def apply(dev, neighbors, now):
    """Ganti daftar tetangga perangkat dengan hasil discovery terbaru."""
    from models import db, SnmpNeighbor, SnmpPort
    ports = {p.if_index: p.id for p in SnmpPort.query.filter_by(device_id=dev.id, deleted=False).all()}
    existing = {}
    for row in SnmpNeighbor.query.filter_by(device_id=dev.id).all():
        existing[(row.protocol, row.local_if_index or 0, row.remote_chassis or row.remote_name.lower() or row.remote_ip,
                  row.remote_port)] = row
    keep = set()
    for n in neighbors:
        k = _key(n)
        if k in keep:
            continue
        keep.add(k)
        row = existing.get(k)
        if not row:
            row = SnmpNeighbor(device_id=dev.id, first_seen=now)
            db.session.add(row)
        for f, v in n.items():
            setattr(row, f, v)
        row.port_id = ports.get(n['local_if_index'])
        row.last_seen = now
    for k, row in existing.items():
        if k not in keep:
            db.session.delete(row)


def _norm(s):
    return (s or '').strip().lower()


def link_all():
    """Cocokkan setiap tetangga ke SnmpDevice terdaftar (dan port lawannya)."""
    from models import SnmpDevice, SnmpNeighbor, SnmpPort
    devices = SnmpDevice.query.all()
    by_ip = {d.host.strip(): d.id for d in devices}
    by_name = {}
    for d in devices:
        for nm in (d.sys_name, d.name):
            if _norm(nm):
                by_name.setdefault(_norm(nm), d.id)
    ports = SnmpPort.query.filter_by(deleted=False).all()
    by_mac = {}
    ports_of = {}
    for p in ports:
        if p.mac:
            by_mac.setdefault(p.mac.lower(), p.device_id)
        ports_of.setdefault(p.device_id, []).append(p)
    for n in SnmpNeighbor.query.all():
        rid = (by_ip.get(n.remote_ip) if n.remote_ip else None) \
            or by_name.get(_norm(n.remote_name)) \
            or (by_mac.get(n.remote_chassis.lower()) if n.remote_chassis else None)
        if rid == n.device_id:
            rid = None
        n.remote_device_id = rid
        n.remote_port_id = None
        if rid and (n.remote_port or n.remote_port_descr):
            want = {_norm(n.remote_port), _norm(n.remote_port_descr)} - {''}
            for p in ports_of.get(rid, []):
                if {_norm(p.name), _norm(p.descr)} & want or (p.mac and _norm(p.mac) in want):
                    n.remote_port_id = p.id
                    break


def _util(p):
    if not p or not p.speed_mbps:
        return None
    return round(max(p.in_bps or 0, p.out_bps or 0) / (p.speed_mbps * 1e6) * 100, 1)


def olt_links():
    """Sambungan perangkat SNMP → OLT: [{olt, device_id, port_id, source, link_id}].
    Prioritas: penautan manual (`SnmpOltLink`); bila OLT belum punya penautan manual dicari otomatis dari
    (1) tetangga LLDP/CDP/MNDP yang IP/namanya sama dengan OLT, lalu (2) ARP+FDB: MAC IP manajemen OLT
    dilihat di port mana (port 'ujung', bukan port yang menuju perangkat SNMP lain)."""
    from models import OLT, SnmpArp, SnmpFdb, SnmpNeighbor, SnmpOltLink
    olts = OLT.query.all()
    if not olts:
        return []
    out, manual_olts = [], set()
    for m in SnmpOltLink.query.all():
        out.append({'olt': next((o for o in olts if o.id == m.olt_id), None), 'device_id': m.device_id,
                    'port_id': m.port_id, 'source': 'manual', 'link_id': m.id})
        manual_olts.add(m.olt_id)
    out = [x for x in out if x['olt'] is not None]
    nbrs = SnmpNeighbor.query.all()
    trunk = {(n.device_id, n.port_id) for n in nbrs if n.remote_device_id and n.port_id}
    arp_by_ip = {}
    for a in SnmpArp.query.all():
        arp_by_ip.setdefault(a.ip, []).append(a)
    for o in olts:
        if o.id in manual_olts:
            continue
        found = {}
        ip, nm = (o.ip_address or '').strip(), _norm(o.name)
        for n in nbrs:
            if (ip and n.remote_ip == ip) or (nm and _norm(n.remote_name) == nm):
                found[(n.device_id, n.port_id)] = 'lldp'
        if not found and ip:
            macs = {a.mac.lower() for a in arp_by_ip.get(ip, []) if a.mac}
            if macs:
                for f in SnmpFdb.query.filter(SnmpFdb.mac.in_(list(macs))).all():
                    if f.port_id and (f.device_id, f.port_id) not in trunk:
                        found[(f.device_id, f.port_id)] = 'arp'
        for (did, pid), src in found.items():
            out.append({'olt': o, 'device_id': did, 'port_id': pid, 'source': src, 'link_id': None})
    return out


def build():
    """Graf untuk UI: node = perangkat terdaftar + tetangga yang belum terdaftar; link = sambungan
    unik (A↔B digabung walau terlihat dari kedua sisi)."""
    from models import SnmpDevice, SnmpNeighbor, SnmpPort
    devices = {d.id: d for d in SnmpDevice.query.all()}
    ports = {p.id: p for p in SnmpPort.query.filter_by(deleted=False).all()}
    nodes = {}
    for d in devices.values():
        nodes[f'd{d.id}'] = {'id': f'd{d.id}', 'device_id': d.id, 'name': d.name, 'host': d.host,
                             'status': d.status if d.enabled else 'disabled',
                             'vendor': d.vendor or '', 'hardware': d.hardware or '', 'external': False}
    links = {}
    for n in SnmpNeighbor.query.all():
        if n.device_id not in devices:
            continue
        a = f'd{n.device_id}'
        if n.remote_device_id and n.remote_device_id in devices:
            b = f'd{n.remote_device_id}'
        else:
            ext = n.remote_chassis or _norm(n.remote_name) or n.remote_ip
            b = f'x:{ext}'
            if b not in nodes:
                nodes[b] = {'id': b, 'device_id': None, 'name': n.remote_name or n.remote_ip or n.remote_chassis,
                            'host': n.remote_ip, 'status': 'external', 'vendor': '',
                            'hardware': n.remote_platform, 'external': True}
        lp = ports.get(n.port_id)
        rp = ports.get(n.remote_port_id)
        side_a = {'port_id': n.port_id, 'port': lp.name if lp else '', 'alias': lp.alias if lp else ''}
        side_b = {'port_id': n.remote_port_id, 'port': rp.name if rp else (n.remote_port or n.remote_port_descr), 'alias': rp.alias if rp else ''}
        # kunci tak berarah: pasangan node + pasangan port (bila diketahui)
        pa = n.port_id or f'?{n.local_if_index}'
        pb = n.remote_port_id or f'?{_norm(n.remote_port)}'
        key = tuple(sorted([(a, str(pa)), (b, str(pb))]))
        alt = None
        if n.remote_port_id is None and n.remote_device_id:
            # sisi lain mungkin sudah tercatat dengan port lengkap → cari link yang sama dari arah sebaliknya
            alt = next((k for k, v in links.items() if {v['source'], v['target']} == {a, b}
                        and (v['source_port']['port_id'] == n.port_id or v['target_port']['port_id'] == n.port_id)), None)
        if alt or key in links:
            links[alt or key]['protocols'] = sorted(set(links[alt or key]['protocols']) | {n.protocol})
            continue
        port = lp or rp
        links[key] = {
            'id': '|'.join(f'{x[0]}:{x[1]}' for x in key), 'source': a, 'target': b,
            'source_port': side_a, 'target_port': side_b, 'protocols': [n.protocol],
            'speed_mbps': (port.speed_mbps if port else None),
            'util_pct': _util(lp) if lp else _util(rp),
            'in_bps': lp.in_bps if lp else None, 'out_bps': lp.out_bps if lp else None,
            'oper_status': (lp.oper_status if lp else (rp.oper_status if rp else '')),
            'last_seen': n.last_seen,
        }
    # OLT: node + garis ke port perangkat SNMP tempat OLT terhubung (hanya OLT yang punya sambungan)
    for ol in olt_links():
        o, did = ol['olt'], ol['device_id']
        if did not in devices:
            continue
        nid = f'o{o.id}'
        if nid not in nodes:
            nodes[nid] = {'id': nid, 'device_id': None, 'olt_id': o.id, 'kind': 'olt', 'name': o.name, 'host': o.ip_address,
                          'status': 'up' if o.is_online else 'down', 'vendor': (o.vendor or '').upper(),
                          'hardware': f'{o.model or ""} · ONU {o.online_onu or 0}/{o.total_onu or 0}', 'external': False}
        lp = ports.get(ol['port_id'])
        oper = lp.oper_status if lp else ''
        if not o.is_online:
            oper = 'down'
        key = ('olt', did, str(ol['port_id'] or ''), o.id)
        a = f'd{did}'
        if key in links:
            continue
        links[key] = {
            'id': f'olt:{did}:{ol["port_id"] or 0}:{o.id}', 'source': a, 'target': nid,
            'source_port': {'port_id': ol['port_id'], 'port': lp.name if lp else '', 'alias': lp.alias if lp else ''},
            'target_port': {'port_id': None, 'port': o.name, 'alias': ''},
            'protocols': ['olt' if ol['source'] == 'manual' else ol['source']],
            'speed_mbps': lp.speed_mbps if lp else None, 'util_pct': _util(lp) if lp else None,
            'in_bps': lp.in_bps if lp else None, 'out_bps': lp.out_bps if lp else None,
            'oper_status': oper, 'last_seen': None, 'olt_link_id': ol['link_id'],
        }
    return list(nodes.values()), list(links.values())


def olts_behind_port(port_id):
    """OLT yang terhubung lewat port ini → [(nama, total_onu, online_onu)] (untuk alert port turun)."""
    try:
        return [(x['olt'].name, x['olt'].total_onu or 0, x['olt'].online_onu or 0)
                for x in olt_links() if x['port_id'] == port_id]
    except Exception:
        return []


def annotate(nodes, now=None):
    """Lapisan gaya PRTG di atas peta: penanda pemeliharaan, status sensor kustom, dan garis
    dependensi induk-anak. Mengubah `nodes` di tempat; mengembalikan daftar dependensi."""
    from models import SnmpDevice, SnmpSensorRule
    from snmp_depend import Scope
    scope = Scope(now)
    rules = {}
    for r in SnmpSensorRule.query.filter_by(enabled=True).all():
        c = rules.setdefault(r.device_id, {'warning': 0, 'down': 0})
        if r.status in c:
            c[r.status] += 1
    for n in nodes:
        did = n.get('device_id')
        d = scope.by_id.get(did) if did else None
        n['parent_id'] = d.parent_id if d else None
        n['in_maintenance'] = bool(d and scope.in_maintenance(d))
        c = rules.get(did, {})
        n['rules_warn'], n['rules_down'] = c.get('warning', 0), c.get('down', 0)
    return [{'id': f'dep{d.id}', 'source': f'd{d.parent_id}', 'target': f'd{d.id}'}
            for d in scope.devs if d.parent_id and d.parent_id in scope.by_id]
