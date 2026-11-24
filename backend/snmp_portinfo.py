"""Detail port ala Winbox/Observium (tahap 5).

Statis (dibaca saat discovery):
  MTU, duplex (EtherLike-MIB), alamat IP per interface (ipAddrTable), dan data modul SFP
  MikroTik (vendor, part number, serial, tipe, panjang gelombang, konektor, jarak, rate).
Dinamis (dibaca tiap poll):
  Optik SFP MikroTik (redaman RX/TX dBm, suhu, tegangan, bias, rx-loss, tx-fault),
  statistik Ethernet MikroTik (FCS/align/fragment/too-short/too-long/drop/collision/pause/
  broadcast/multicast/link-down) dan discard IF-MIB.

MikroTik TIDAK mengisi ifInErrors/ifOutErrors IF-MIB; error ada di mtxrInterfaceStatsTable
— `error_counters()` menjumlahkan kolom error di sana supaya grafik & alert error terisi.
Semua pembacaan opsional: tabel yang tidak didukung perangkat = kosong, tidak menggagalkan
discovery/poll. Hanya SNMP GET/WALK (baca saja).
"""
import json

IF = '1.3.6.1.2.1.2.2.1'
IFX = '1.3.6.1.2.1.31.1.1.1'
IF_MTU = IF + '.4'
IF_IN_DISCARDS = IF + '.13'
IF_OUT_DISCARDS = IF + '.19'
IFX_IN_MCAST, IFX_IN_BCAST = IFX + '.8', IFX + '.9'
IFX_OUT_MCAST, IFX_OUT_BCAST = IFX + '.12', IFX + '.13'
DOT3_DUPLEX = '1.3.6.1.2.1.10.7.2.1.19'          # 1 unknown, 2 half, 3 full
IP_ADDR_IFINDEX = '1.3.6.1.2.1.4.20.1.2'         # indeks = alamat IP
IP_ADDR_MASK = '1.3.6.1.2.1.4.20.1.3'

MT_OPT = '1.3.6.1.4.1.14988.1.1.19.1.1'          # mtxrOpticalTable (SFP & GPON)
OPT_STATIC = {'name': 2, 'wavelength': 5, 'vendor': 11, 'serial': 12, 'present': 13, 'part': 14,
              'type': 15, 'connector': 16, 'link_m': 17, 'rates': 18}
OPT_DYNAMIC = {'rx_loss': 3, 'tx_fault': 4, 'temp': 6, 'volt': 7, 'bias': 8, 'tx': 9, 'rx': 10}

MT_STATS = '1.3.6.1.4.1.14988.1.1.14.1.1'        # mtxrInterfaceStatsTable
STAT_COLS = {
    'name': 2,
    'rx_too_short': 33, 'rx_too_long': 41, 'rx_broadcast': 42, 'rx_pause': 43, 'rx_multicast': 44,
    'rx_fcs': 45, 'rx_align': 46, 'rx_fragment': 47, 'rx_overflow': 48, 'rx_length': 51, 'rx_code': 52,
    'rx_carrier': 53, 'rx_jabber': 54, 'rx_drop': 55,
    'tx_too_short': 63, 'tx_too_long': 71, 'tx_broadcast': 72, 'tx_pause': 73, 'tx_multicast': 74,
    'tx_underrun': 75, 'tx_collision': 83, 'tx_excessive_collision': 77, 'tx_late_collision': 82,
    'tx_deferred': 81, 'tx_drop': 85, 'tx_jabber': 86, 'tx_fcs': 87, 'tx_fragment': 89, 'link_downs': 90,
}
RX_ERROR_KEYS = ('rx_fcs', 'rx_align', 'rx_fragment', 'rx_too_short', 'rx_too_long', 'rx_length', 'rx_code',
                 'rx_carrier', 'rx_jabber')
TX_ERROR_KEYS = ('tx_fcs', 'tx_underrun', 'tx_late_collision', 'tx_excessive_collision', 'tx_jabber', 'tx_fragment')

OPT_TYPES = {1: 'SFP', 2: 'SFP+', 3: 'QSFP+', 4: 'QSFP28', 5: 'SFP28', 6: 'GPON'}
DUPLEX = {2: 'half', 3: 'full'}


def _text(v):
    if v is None:
        return ''
    if isinstance(v, bytes):
        return v.decode('utf-8', 'replace').replace('\x00', '').strip()
    return str(v).strip()


def _int(v):
    return v if isinstance(v, int) and not isinstance(v, bool) else None


def _signed32(v):
    """Integer32 dBm×1000 kadang terbaca sebagai unsigned → kembalikan ke bertanda."""
    v = _int(v)
    if v is None:
        return None
    return v - 2 ** 32 if v >= 2 ** 31 else v


async def _walk_cols(c, base, cols, rows=2000):
    """Walk beberapa kolom tabel → {indeks(int): {kunci: nilai}}. Kolom gagal = dilewati."""
    out = {}
    for key, col in cols.items():
        try:
            vals = await c.walk(f'{base}.{col}', max_rows=rows)
        except RuntimeError:
            continue
        for idx, v in vals.items():
            if idx.isdigit():
                out.setdefault(int(idx), {})[key] = v
    return out


async def collect_static(c, mikrotik=False):
    out = {'mtu': {}, 'duplex': {}, 'ips': {}, 'optics': {}}
    for key, oid in (('mtu', IF_MTU), ('duplex', DOT3_DUPLEX)):
        try:
            for idx, v in (await c.walk(oid)).items():
                if idx.isdigit():
                    out[key][int(idx)] = v
        except RuntimeError:
            pass
    try:
        ifidx = await c.walk(IP_ADDR_IFINDEX, max_rows=2000)
        masks = await c.walk(IP_ADDR_MASK, max_rows=2000)
        for ip, i in ifidx.items():
            if not isinstance(i, int):
                continue
            m = masks.get(ip)
            prefix = sum(bin(b).count('1') for b in m) if isinstance(m, bytes) and len(m) == 4 else None
            out['ips'].setdefault(i, []).append(f'{ip}/{prefix}' if prefix is not None else ip)
    except RuntimeError:
        pass
    if mikrotik:
        out['optics'] = await _walk_cols(c, MT_OPT, OPT_STATIC, rows=500)
    return out


async def collect_dynamic(c, mikrotik=False):
    out = {'discards': {}, 'casts': {}, 'optics': {}, 'stats': {}}
    for key, oid in (('in', IF_IN_DISCARDS), ('out', IF_OUT_DISCARDS)):
        try:
            for idx, v in (await c.walk(oid)).items():
                if idx.isdigit():
                    out['discards'].setdefault(int(idx), {})[key] = v
        except RuntimeError:
            pass
    if mikrotik:
        out['optics'] = await _walk_cols(c, MT_OPT, dict(OPT_DYNAMIC, name=OPT_STATIC['name']), rows=500)
        out['stats'] = await _walk_cols(c, MT_STATS, STAT_COLS)
    else:
        for key, oid in (('rx_multicast', IFX_IN_MCAST), ('rx_broadcast', IFX_IN_BCAST),
                         ('tx_multicast', IFX_OUT_MCAST), ('tx_broadcast', IFX_OUT_BCAST)):
            try:
                for idx, v in (await c.walk(oid)).items():
                    if idx.isdigit():
                        out['casts'].setdefault(int(idx), {})[key] = v
            except RuntimeError:
                pass
    return out


def _map_rows(rows, ports_by_idx, names):
    """Baris tabel vendor → ifIndex. Indeks MikroTik = ifIndex; cadangan: cocokkan nama."""
    res = {}
    for idx, r in rows.items():
        if idx in ports_by_idx:
            res[idx] = r
            continue
        nm = _text(r.get('name')).lower()
        if nm and nm in names:
            res[names[nm]] = r
    return res


def _names(ports_by_idx):
    out = {}
    for idx, p in ports_by_idx.items():
        for n in (getattr(p, 'name', None), getattr(p, 'descr', None)):
            if n:
                out.setdefault(n.lower(), idx)
    return out


def apply_static(ports_by_idx, data):
    """Tulis spesifikasi statis ke SnmpPort (dipanggil di apply_discovery)."""
    if not data:
        return
    names = _names(ports_by_idx)
    optics = _map_rows(data.get('optics') or {}, ports_by_idx, names)
    for idx, p in ports_by_idx.items():
        mtu = _int((data.get('mtu') or {}).get(idx))
        p.mtu = mtu if mtu and mtu > 0 else p.mtu
        dx = DUPLEX.get(_int((data.get('duplex') or {}).get(idx)))
        p.duplex = dx or p.duplex
        ips = (data.get('ips') or {}).get(idx)
        p.ip_addrs = json.dumps(ips) if ips else None
        o = optics.get(idx)
        if o and _int(o.get('present')) != 0 and (_text(o.get('vendor')) or _text(o.get('part')) or o.get('wavelength')):
            wl = _int(o.get('wavelength'))
            info = {
                'vendor': _text(o.get('vendor')), 'part': _text(o.get('part')), 'serial': _text(o.get('serial')),
                'type': OPT_TYPES.get(_int(o.get('type')), ''), 'connector': _int(o.get('connector')),
                'wavelength_nm': round(wl / 100, 2) if wl else None, 'link_m': _int(o.get('link_m')),
                'rates': _text(o.get('rates')),
            }
            p.sfp_info = json.dumps(info)
        elif o is not None:
            p.sfp_info = None   # slot SFP kosong


def error_counters(stats_row):
    """(rx_err, tx_err) total dari baris mtxrInterfaceStats; None bila tidak ada data."""
    if not stats_row:
        return None, None
    rx = [_int(stats_row.get(k)) for k in RX_ERROR_KEYS]
    tx = [_int(stats_row.get(k)) for k in TX_ERROR_KEYS]
    rx_t = sum(v for v in rx if v is not None) if any(v is not None for v in rx) else None
    tx_t = sum(v for v in tx if v is not None) if any(v is not None for v in tx) else None
    return rx_t, tx_t


def mikrotik_error_overrides(dyn, ports_by_idx):
    """{ifIndex: (rx_err, tx_err)} dari statistik MikroTik — dipakai menggantikan ifIn/OutErrors."""
    stats = _map_rows((dyn or {}).get('stats') or {}, ports_by_idx, _names(ports_by_idx))
    return {idx: error_counters(r) for idx, r in stats.items()}


def apply_dynamic(ports_by_idx, dyn, now, samples):
    """Tulis optik + statistik ke SnmpPort; tambah sampel grafik redaman (dom_rx/dom_tx/dom_temp)."""
    if not dyn:
        return
    names = _names(ports_by_idx)
    optics = _map_rows(dyn.get('optics') or {}, ports_by_idx, names)
    stats = _map_rows(dyn.get('stats') or {}, ports_by_idx, names)
    for idx, p in ports_by_idx.items():
        o = optics.get(idx)
        if o is not None:
            rx, tx = _signed32(o.get('rx')), _signed32(o.get('tx'))
            # 0 / nilai sangat kecil = modul tanpa DOM atau slot kosong → jangan dianggap -0 dBm
            has_dom = any(_int(o.get(k)) for k in ('temp', 'volt', 'bias')) or (rx not in (None, 0)) or (tx not in (None, 0))
            if has_dom:
                p.dom_rx_dbm = round(rx / 1000, 2) if rx is not None else None
                p.dom_tx_dbm = round(tx / 1000, 2) if tx is not None else None
                t = _signed32(o.get('temp'))
                p.dom_temp_c = float(t) if t is not None else None
                v = _int(o.get('volt'))
                p.dom_volt = round(v / 1000, 3) if v is not None else None
                b = _int(o.get('bias'))
                p.dom_bias_ma = float(b) if b is not None else None
                p.dom_rx_loss = bool(_int(o.get('rx_loss')))
                p.dom_tx_fault = bool(_int(o.get('tx_fault')))
                p.dom_at = now
                if not p.deleted:
                    for metric, val in (('dom_rx', p.dom_rx_dbm), ('dom_tx', p.dom_tx_dbm), ('dom_temp', p.dom_temp_c)):
                        if val is not None:
                            samples.append((p.id, metric, val))
            else:
                p.dom_rx_dbm = p.dom_tx_dbm = p.dom_temp_c = p.dom_volt = p.dom_bias_ma = None
                p.dom_rx_loss = p.dom_tx_fault = None
        totals = {}
        s = stats.get(idx)
        if s:
            totals.update({k: _int(v) for k, v in s.items() if k != 'name' and _int(v) is not None})
        cast = (dyn.get('casts') or {}).get(idx)
        if cast:
            totals.update({k: _int(v) for k, v in cast.items() if _int(v) is not None})
        d = (dyn.get('discards') or {}).get(idx)
        if d:
            if _int(d.get('in')) is not None:
                totals['in_discards'] = _int(d['in'])
            if _int(d.get('out')) is not None:
                totals['out_discards'] = _int(d['out'])
        if totals:
            p.ext_stats = json.dumps(totals)
            p.ext_at = now


def detail_dict(p):
    """Bagian detail port untuk API (spesifikasi, modul SFP, optik, statistik)."""
    def _j(s):
        try:
            return json.loads(s) if s else None
        except ValueError:
            return None
    return {
        'mtu': p.mtu, 'duplex': p.duplex or '', 'ip_addrs': _j(p.ip_addrs) or [],
        'sfp': _j(p.sfp_info),
        'optical': None if p.dom_at is None else {
            'rx_dbm': p.dom_rx_dbm, 'tx_dbm': p.dom_tx_dbm, 'temp_c': p.dom_temp_c, 'volt': p.dom_volt,
            'bias_ma': p.dom_bias_ma, 'rx_loss': p.dom_rx_loss, 'tx_fault': p.dom_tx_fault,
            'at': p.dom_at.isoformat() + 'Z' if p.dom_at else None,
        },
        'stats': _j(p.ext_stats) or {},
        'stats_at': p.ext_at.isoformat() + 'Z' if p.ext_at else None,
    }
