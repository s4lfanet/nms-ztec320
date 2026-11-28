"""Tabel ARP & MAC (forwarding database) perangkat SNMP.

Konsep modul arp-table / fdb-table Observium, kode sendiri:
- ARP  : IP-MIB `ipNetToMediaTable` (indeks ifIndex.a.b.c.d), cadangan
         `ipNetToPhysicalTable` (indeks ifIndex.addrType.len.alamat — hanya IPv4 diambil).
- MAC  : Q-BRIDGE `dot1qTpFdbTable` (indeks fdbId.mac6, per VLAN), cadangan
         BRIDGE-MIB `dot1dTpFdbTable` (indeks mac6). Nomor bridge port → ifIndex
         lewat `dot1dBasePortIfIndex`; fdbId → VLAN lewat `dot1qVlanFdbId` (bila
         tidak ada, fdbId dianggap nomor VLAN — perilaku umum switch).

Dibaca terjadwal (bukan tiap poll; `snmp_tables_minutes`) karena tabelnya bisa
ribuan baris. `collect()` murni jaringan, `parse()` murni data, `apply()` menulis
`SnmpArp`/`SnmpFdb` dengan first_seen/last_seen — baris yang hilang tidak langsung
dihapus, jadi "MAC ini terakhir terlihat di port mana" tetap bisa dicari sampai
batas simpan (`snmp_tables_keep_hours`). Hanya membaca; tidak mengubah perangkat.
"""
from snmp_topology import _mac

ARP_MEDIA_PHYS = '1.3.6.1.2.1.4.22.1.2'
ARP_MEDIA_TYPE = '1.3.6.1.2.1.4.22.1.4'      # 2 = invalid
ARP_PHYS_PHYS = '1.3.6.1.2.1.4.35.1.4'
ARP_PHYS_TYPE = '1.3.6.1.2.1.4.35.1.6'       # 2 = invalid
BASE_PORT_IF = '1.3.6.1.2.1.17.1.4.1.2'      # dot1dBasePortIfIndex
Q_FDB_PORT = '1.3.6.1.2.1.17.7.1.2.2.1.2'    # dot1qTpFdbPort
Q_FDB_STATUS = '1.3.6.1.2.1.17.7.1.2.2.1.3'
Q_VLAN_FDB = '1.3.6.1.2.1.17.7.1.4.2.1.3'    # dot1qVlanFdbId (indeks timeMark.vlan)
D_FDB_PORT = '1.3.6.1.2.1.17.4.3.1.2'        # dot1dTpFdbPort
D_FDB_STATUS = '1.3.6.1.2.1.17.4.3.1.3'
Q_VLAN_NAME = '1.3.6.1.2.1.17.7.1.4.3.1.1'     # dot1qVlanStaticName (indeks vlan)
Q_VLAN_EGRESS = '1.3.6.1.2.1.17.7.1.4.3.1.2'   # dot1qVlanStaticEgressPorts (bitmap port bridge)
Q_VLAN_UNTAG = '1.3.6.1.2.1.17.7.1.4.3.1.4'    # dot1qVlanStaticUntaggedPorts
Q_PVID = '1.3.6.1.2.1.17.7.1.4.5.1.1'          # dot1qPvid (indeks nomor port bridge)
WL_AP = '1.3.6.1.4.1.14988.1.1.1.3.1'          # mtxrWlApEntry: .4 ssid .6 klien .7 freq .9 noise .10 ccq
WL_RTAB = '1.3.6.1.4.1.14988.1.1.1.2.1'        # mtxrWlRtabEntry (indeks mac6.ifIndex): .3 sinyal .8 tx .9 rx .11 uptime .12 snr
MAX_ROWS = 20000
FDB_SKIP = {2, 4}  # invalid, self (MAC perangkat itu sendiri)


async def collect(c):
    """→ data mentah; tabel yang tidak didukung = {} ; walk gagal total → RuntimeError."""
    async def walk(oid):
        try:
            return await c.walk(oid, max_rows=MAX_ROWS)
        except RuntimeError as e:
            if 'timeout' in str(e).lower() or 'No SNMP response' in str(e):
                raise
            return {}
    out = {'arp_media': await walk(ARP_MEDIA_PHYS)}
    if out['arp_media']:
        out['arp_media_type'] = await walk(ARP_MEDIA_TYPE)
    else:
        out['arp_phys'] = await walk(ARP_PHYS_PHYS)
        out['arp_phys_type'] = await walk(ARP_PHYS_TYPE) if out['arp_phys'] else {}
    out['q_fdb'] = await walk(Q_FDB_PORT)
    if out['q_fdb']:
        out['q_fdb_status'] = await walk(Q_FDB_STATUS)
        out['q_vlan_fdb'] = await walk(Q_VLAN_FDB)
    else:
        out['d_fdb'] = await walk(D_FDB_PORT)
        out['d_fdb_status'] = await walk(D_FDB_STATUS) if out['d_fdb'] else {}
    out['vlan_egress'] = await walk(Q_VLAN_EGRESS)
    if out['vlan_egress']:
        out['vlan_name'] = await walk(Q_VLAN_NAME)
        out['vlan_untag'] = await walk(Q_VLAN_UNTAG)
        out['pvid'] = await walk(Q_PVID)
    # Wireless MikroTik (tidak ada di perangkat lain → walk kosong, murah)
    out['wl_signal'] = await walk(WL_RTAB + '.3')
    if out['wl_signal']:
        for k, col in (('wl_tx', 8), ('wl_rx', 9), ('wl_uptime', 11), ('wl_snr', 12)):
            out[k] = await walk(f'{WL_RTAB}.{col}')
    out['wl_ssid'] = await walk(WL_AP + '.4')
    if out['wl_ssid']:
        for k, col in (('wl_clients', 6), ('wl_freq', 7), ('wl_noise', 9), ('wl_ccq', 10)):
            out[k] = await walk(f'{WL_AP}.{col}')
    out['base_port'] = await walk(BASE_PORT_IF) if (out.get('q_fdb') or out.get('d_fdb') or out['vlan_egress']) else {}
    return out


def _bitmap_ports(b):
    """Bitmap PortList (bit 0 = MSB byte pertama = port bridge 1) → [nomor port bridge]."""
    if not isinstance(b, (bytes, bytearray)):
        return []
    return [i * 8 + bit + 1 for i, byte in enumerate(b) for bit in range(8) if byte & (0x80 >> bit)]


def _idx_mac(parts):
    """6 angka terakhir indeks → 'aa:bb:..'"""
    try:
        b = [int(x) for x in parts[-6:]]
    except ValueError:
        return ''
    if len(b) != 6 or any(not 0 <= x <= 255 for x in b):
        return ''
    return ':'.join(f'{x:02x}' for x in b)


def _int(v):
    return v if isinstance(v, int) else None


def parse(raw):
    """→ {'arp': [(if_index, ip, mac)], 'fdb': [(if_index|None, vlan|None, mac)]}"""
    arp = {}
    for idx, phys in (raw.get('arp_media') or {}).items():
        p = idx.split('.')
        if len(p) != 5:
            continue
        if _int((raw.get('arp_media_type') or {}).get(idx)) == 2:
            continue
        mac = _mac(phys)
        if mac and mac != '00:00:00:00:00:00':
            arp[(int(p[0]), '.'.join(p[1:]))] = mac
    for idx, phys in (raw.get('arp_phys') or {}).items():
        p = idx.split('.')
        # ifIndex.addrType(1=ipv4).len(4).a.b.c.d
        if len(p) != 7 or p[1] != '1' or p[2] != '4':
            continue
        if _int((raw.get('arp_phys_type') or {}).get(idx)) == 2:
            continue
        mac = _mac(phys)
        if mac and mac != '00:00:00:00:00:00':
            arp[(int(p[0]), '.'.join(p[3:]))] = mac

    base = {}
    for k, v in (raw.get('base_port') or {}).items():
        if k.isdigit() and isinstance(v, int):
            base[int(k)] = v
    fdb_vlan = {}
    for k, v in (raw.get('q_vlan_fdb') or {}).items():
        p = k.split('.')
        if isinstance(v, int) and p[-1].isdigit():
            fdb_vlan.setdefault(v, int(p[-1]))
    fdb = {}
    for idx, bport in (raw.get('q_fdb') or {}).items():
        p = idx.split('.')
        if len(p) != 7 or _int((raw.get('q_fdb_status') or {}).get(idx)) in FDB_SKIP:
            continue
        mac = _idx_mac(p)
        if not mac:
            continue
        fid = int(p[0])
        vlan = fdb_vlan.get(fid, fid if 0 < fid < 4095 else None)
        fdb[(mac, vlan)] = base.get(bport, bport if bport else None) if isinstance(bport, int) else None
    for idx, bport in (raw.get('d_fdb') or {}).items():
        p = idx.split('.')
        if len(p) != 6 or _int((raw.get('d_fdb_status') or {}).get(idx)) in FDB_SKIP:
            continue
        mac = _idx_mac(p)
        if mac:
            fdb[(mac, None)] = base.get(bport, bport if bport else None) if isinstance(bport, int) else None
    vlans = []
    for idx, bm in (raw.get('vlan_egress') or {}).items():
        if not idx.isdigit() or not 0 < int(idx) < 4095:
            continue
        to_if = lambda ports: sorted({base.get(bp, bp) for bp in ports})
        name = (raw.get('vlan_name') or {}).get(idx)
        if isinstance(name, (bytes, bytearray)):
            name = bytes(name).decode('utf-8', 'replace')
        vlans.append((int(idx), (name or '').strip()[:64] if isinstance(name, str) else '',
                      to_if(_bitmap_ports(bm)), to_if(_bitmap_ports((raw.get('vlan_untag') or {}).get(idx)))))
    pvid = {}
    for k, v in (raw.get('pvid') or {}).items():
        if k.isdigit() and isinstance(v, int) and v > 0:
            pvid[base.get(int(k), int(k))] = v
    radios = []
    for idx, ssid in (raw.get('wl_ssid') or {}).items():
        if not idx.isdigit():
            continue
        g = lambda k: _int((raw.get(k) or {}).get(idx))
        radios.append((int(idx), (ssid.decode('utf-8', 'replace') if isinstance(ssid, (bytes, bytearray)) else str(ssid or ''))[:64],
                       g('wl_freq'), g('wl_clients'), g('wl_noise'), g('wl_ccq')))
    wclients = []
    for idx, sig in (raw.get('wl_signal') or {}).items():
        p = idx.split('.')
        if len(p) != 7 or not isinstance(sig, int):
            continue
        mac = _idx_mac(p[:6])
        if not mac:
            continue
        g = lambda k: _int((raw.get(k) or {}).get(idx))
        up = g('wl_uptime')
        wclients.append((int(p[6]), mac, sig, g('wl_snr') or None, g('wl_tx'), g('wl_rx'),
                         up // 100 if up is not None else None))   # TimeTicks (1/100 dtk) → detik
    return {'arp': [(i, ip, m) for (i, ip), m in arp.items()],
            'fdb': [(i, v, m) for (m, v), i in fdb.items()],
            'vlans': sorted(vlans), 'pvid': pvid,
            'wifi_radios': sorted(radios), 'wifi_clients': sorted(wclients)}


def apply(dev, parsed, now):
    """Upsert baris ARP/MAC perangkat. → (jumlah arp, jumlah mac) yang terlihat sekarang."""
    from models import db, SnmpArp, SnmpFdb, SnmpPort
    ports = {p.if_index: p.id for p in SnmpPort.query.filter_by(device_id=dev.id).all()}

    have = {(r.ip, r.if_index): r for r in SnmpArp.query.filter_by(device_id=dev.id).all()}
    for if_index, ip, mac in parsed['arp']:
        r = have.get((ip, if_index))
        if r is None:
            r = SnmpArp(device_id=dev.id, ip=ip, if_index=if_index, first_seen=now)
            db.session.add(r)
            have[(ip, if_index)] = r
        if r.mac != mac:
            r.mac, r.first_seen = mac, now   # IP pindah ke perangkat lain = entri baru
        r.port_id, r.last_seen = ports.get(if_index), now

    have_f = {(r.mac, r.vlan): r for r in SnmpFdb.query.filter_by(device_id=dev.id).all()}
    for if_index, vlan, mac in parsed['fdb']:
        r = have_f.get((mac, vlan))
        if r is None:
            r = SnmpFdb(device_id=dev.id, mac=mac, vlan=vlan, first_seen=now)
            db.session.add(r)
            have_f[(mac, vlan)] = r
        if r.if_index != if_index:
            r.if_index, r.first_seen = if_index, now   # MAC pindah port
        r.port_id, r.last_seen = ports.get(if_index), now
    # VLAN: ganti seluruhnya tiap pembacaan (konfigurasi, bukan riwayat)
    import json
    from models import SnmpVlan
    SnmpVlan.query.filter_by(device_id=dev.id).delete()
    for vid, name, egress, untag in parsed.get('vlans') or []:
        db.session.add(SnmpVlan(device_id=dev.id, vlan=vid, name=name, egress=json.dumps(egress), untagged=json.dumps(untag)))
    pv = parsed.get('pvid') or {}
    for p in SnmpPort.query.filter_by(device_id=dev.id).all():
        p.pvid = pv.get(p.if_index)
    from models import SnmpWifiRadio, SnmpWifiClient
    SnmpWifiRadio.query.filter_by(device_id=dev.id).delete()
    SnmpWifiClient.query.filter_by(device_id=dev.id).delete()
    for i, ssid, freq, cl, noise, ccq in parsed.get('wifi_radios') or []:
        db.session.add(SnmpWifiRadio(device_id=dev.id, if_index=i, ssid=ssid, freq=freq, clients=cl, noise=noise, ccq=ccq))
    for i, mac, sig, snr, tx, rx, up in parsed.get('wifi_clients') or []:
        db.session.add(SnmpWifiClient(device_id=dev.id, if_index=i, mac=mac, signal=sig, snr=snr, tx_bps=tx, rx_bps=rx, uptime_s=up))
    dev.tables_at = now
    return len(parsed['arp']), len(parsed['fdb'])


def norm_query(q):
    """Teks pencarian → ('mac', hex) / ('ip', teks) / ('text', teks)."""
    s = (q or '').strip().lower()
    hexonly = ''.join(ch for ch in s if ch in '0123456789abcdef')
    seps = set(s) - set('0123456789abcdef')
    if len(hexonly) >= 4 and seps <= set(':-. ') and (any(ch in 'abcdef' for ch in hexonly) or seps & set(':-')):
        return 'mac', hexonly
    if s and set(s) <= set('0123456789.'):
        return 'ip', s
    return 'text', s
