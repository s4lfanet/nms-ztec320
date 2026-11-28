"""Sesi routing (BGP & OSPF) via MIB standar — dinilai sebagai sensor kind='routing'.

- BGP4-MIB `bgpPeerTable` (1.3.6.1.2.1.15.3.1, indeks = IP peer): state .2 (6 = established),
  remote AS .9.
- OSPF-MIB `ospfNbrTable` (1.3.6.1.2.1.14.10.1, indeks = IP.addrlessIndex): state .6 (8 = full).
Dibaca tiap poll (tabel kecil); perangkat tanpa BGP/OSPF mengembalikan walk kosong.
Nilai sensor 1 = sehat (established/full), 0 = bermasalah; `unit` memuat nama state.
Murni baca — tidak mengubah perangkat.
"""
BGP_PEER = '1.3.6.1.2.1.15.3.1'
OSPF_NBR = '1.3.6.1.2.1.14.10.1'
BGP_STATES = {1: 'idle', 2: 'connect', 3: 'active', 4: 'opensent', 5: 'openconf', 6: 'estab'}
OSPF_STATES = {1: 'down', 2: 'attempt', 3: 'init', 4: '2way', 5: 'exstart', 6: 'exchange', 7: 'loading', 8: 'full'}


def parse(bgp_state, bgp_as, ospf_state):
    """Walk mentah (kolom → {indeks: nilai}) → daftar sensor."""
    out = []
    for idx, st in (bgp_state or {}).items():
        if not isinstance(st, int) or idx.count('.') != 3:
            continue
        asn = (bgp_as or {}).get(idx)
        out.append({'kind': 'routing', 'key': f'bgp.{idx}', 'name': f'BGP {idx}' + (f' (AS{asn})' if isinstance(asn, int) and asn else ''),
                    'value': 1 if st == 6 else 0, 'unit': BGP_STATES.get(st, str(st))})
    for idx, st in (ospf_state or {}).items():
        p = idx.split('.')
        if not isinstance(st, int) or len(p) != 5:
            continue
        ip = '.'.join(p[:4])
        out.append({'kind': 'routing', 'key': f'ospf.{idx}', 'name': f'OSPF {ip}',
                    'value': 1 if st == 8 else 0, 'unit': OSPF_STATES.get(st, str(st))})
    return out


async def collect(c):
    async def walk(oid):
        try:
            return await c.walk(oid, max_rows=500)
        except RuntimeError as e:
            if 'timeout' in str(e).lower() or 'No SNMP response' in str(e):
                raise
            return {}
    bgp = await walk(BGP_PEER + '.2')
    asn = await walk(BGP_PEER + '.9') if bgp else {}
    ospf = await walk(OSPF_NBR + '.6')
    return parse(bgp, asn, ospf)
