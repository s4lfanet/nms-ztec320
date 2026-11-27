"""Sensor perangkat non-MikroTik (tahap A roadmap): ENTITY-SENSOR-MIB (RFC 3433, standar: Cisco, Huawei,
Juniper, Arista, banyak switch) + CISCO-ENVMON-MIB / CISCO-PROCESS-MIB sebagai cadangan IOS lama.

Murni baca (SNMP WALK/GET). `collect(c)` dipanggil dari `snmp_monitor.collect_poll` untuk perangkat
yang bukan MikroTik dan mengembalikan daftar sensor berformat sama dengan sensor MikroTik
({'kind','key','name','value','unit'}), sehingga grafik, alert suhu/status, laporan, dan AI ikut otomatis.
"""
ENT_SENSOR = '1.3.6.1.2.1.99.1.1.1'          # entPhySensorTable: .1 type .2 scale .3 precision .4 value .5 operStatus
ENT_NAME = '1.3.6.1.2.1.47.1.1.1.1.7'        # entPhysicalName
ENT_DESCR = '1.3.6.1.2.1.47.1.1.1.1.2'       # entPhysicalDescr
CISCO_TEMP = '1.3.6.1.4.1.9.9.13.1.3.1'      # ciscoEnvMonTemperatureStatusTable: .2 descr .3 value(C)
CISCO_FAN = '1.3.6.1.4.1.9.9.13.1.4.1'       # ciscoEnvMonFanStatusTable: .2 descr .3 state
CISCO_PSU = '1.3.6.1.4.1.9.9.13.1.5.1'       # ciscoEnvMonSupplyStatusTable: .2 descr .3 state
CISCO_CPU5M = '1.3.6.1.4.1.9.9.109.1.1.1.1.8'  # cpmCPUTotal5minRev (%)

# entPhySensorType → (kind, unit); jenis lain (hertz, other, truthvalue, …) tidak dibaca
ENT_TYPE = {3: ('voltage', 'V'), 4: ('voltage', 'V'), 5: ('current', 'A'), 6: ('power', 'W'),
            8: ('temperature', 'C'), 10: ('fan', 'rpm'), 14: ('optical', 'dBm')}
MAX_ROWS = 400


def scale_exponent(n):
    """entPhySensorScale (1=yocto … 9=units … 17=yotta) → eksponen 10."""
    return (n - 9) * 3 if isinstance(n, int) and 1 <= n <= 17 else 0


def ent_value(raw, scale, precision):
    """Nilai sebenarnya = raw × 10^(−precision) × 10^(eksponen skala)."""
    if not isinstance(raw, int):
        return None
    p = precision if isinstance(precision, int) and -8 <= precision <= 9 else 0
    return raw * (10 ** scale_exponent(scale)) / (10 ** p)


def _text(b):
    if isinstance(b, bytes):
        return b.decode('utf-8', 'replace').replace('\x00', '').strip()
    return str(b or '').strip()


def parse_entity(cols, names):
    """cols = {kolom: {indeks: nilai}}, names = {indeks: nama fisik} → daftar sensor."""
    out = []
    for idx, typ in (cols.get('1') or {}).items():
        kind_unit = ENT_TYPE.get(typ)
        if not kind_unit:
            continue
        status = (cols.get('5') or {}).get(idx)
        if status not in (None, 1):                 # 1 = ok; 2 tidak tersedia, 3 tidak beroperasi
            continue
        v = ent_value((cols.get('4') or {}).get(idx), (cols.get('2') or {}).get(idx), (cols.get('3') or {}).get(idx))
        if v is None:
            continue
        kind, unit = kind_unit
        if kind == 'temperature' and not -60 <= v <= 250:
            continue
        if kind == 'optical' and v <= -40:           # tanpa modul / tidak ada sinyal
            continue
        out.append({'kind': kind, 'key': f'ent.{idx}', 'name': (names.get(idx) or kind)[:150],
                    'value': round(v, 3), 'unit': unit})
    return out


def parse_cisco(temp, fan, psu):
    """Cadangan CISCO-ENVMON: suhu (°C) + status kipas/PSU (state 1 normal → ok=1, selain itu 0;
    5 notPresent dan 6 notFunctioning: 5 dilewati karena slot kosong)."""
    out = []
    for idx, v in (temp.get('3') or {}).items():
        if isinstance(v, int) and -60 <= v <= 250:
            out.append({'kind': 'temperature', 'key': f'cvt.{idx}', 'name': _text((temp.get('2') or {}).get(idx)) or 'Suhu',
                        'value': float(v), 'unit': 'C'})
    for pre, tbl in (('cvf', fan), ('cvp', psu)):
        for idx, v in (tbl.get('3') or {}).items():
            if not isinstance(v, int) or v == 5:
                continue
            out.append({'kind': 'status', 'key': f'{pre}.{idx}', 'name': _text((tbl.get('2') or {}).get(idx)) or pre,
                        'value': 1 if v == 1 else 0, 'unit': ''})
    return out


async def _walk(c, oid, rows=MAX_ROWS):
    try:
        return await c.walk(oid, max_rows=rows)
    except RuntimeError:
        return {}


async def _table(c, base, cols):
    return {col: await _walk(c, f'{base}.{col}') for col in cols}


async def collect(c):
    """→ (sensors, cisco_cpu_pct|None). Tabel yang tidak didukung perangkat = kosong (satu permintaan saja)."""
    sensors, cpu = [], None
    types = await _walk(c, f'{ENT_SENSOR}.1')
    if types:
        cols = {'1': types}
        for col in ('2', '3', '4', '5'):
            cols[col] = await _walk(c, f'{ENT_SENSOR}.{col}')
        names = {k: _text(v) for k, v in (await _walk(c, ENT_NAME, 1500)).items()}
        descr = {k: _text(v) for k, v in (await _walk(c, ENT_DESCR, 1500)).items()} if not any(names.values()) else {}
        sensors = parse_entity(cols, {k: names.get(k) or descr.get(k, '') for k in types})
    if not sensors:
        t = await _table(c, CISCO_TEMP, ('2', '3'))
        if t['3']:
            sensors = parse_cisco(t, await _table(c, CISCO_FAN, ('2', '3')), await _table(c, CISCO_PSU, ('2', '3')))
    loads = [v for v in (await _walk(c, CISCO_CPU5M, 50)).values() if isinstance(v, int) and 0 <= v <= 100]
    if loads:
        cpu = round(sum(loads) / len(loads), 1)
    return sensors, cpu
