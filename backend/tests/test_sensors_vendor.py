"""Sensor non-MikroTik: ENTITY-SENSOR-MIB + CISCO-ENVMON (tahap A)."""
import asyncio

import snmp_sensors_vendor as sv


def test_ent_value_scale_precision():
    assert sv.ent_value(425, 9, 1) == 42.5            # units, 1 desimal → 42,5
    assert sv.ent_value(12100, 8, 0) == 12.1          # milli → 12,1 V
    assert sv.ent_value(-2315, 9, 2) == -23.15        # dBm dengan presisi 2
    assert sv.ent_value('x', 9, 0) is None


def test_parse_entity_filters_and_maps():
    cols = {'1': {'10': 8, '11': 10, '12': 14, '13': 14, '14': 8, '15': 4, '16': 7},
            '2': {k: 9 for k in '10 11 12 13 14 15 16'.split()}, '3': {'10': 0, '11': 0, '12': 2, '13': 2, '14': 0, '15': 0, '16': 0},
            '4': {'10': 41, '11': 5400, '12': -523, '13': -4000, '14': 41, '15': 12, '16': 50},
            '5': {'10': 1, '11': 1, '12': 1, '13': 1, '14': 2, '15': 1, '16': 1}}
    names = {'10': 'CPU temp', '11': 'Fan1', '12': 'SFP Rx', '13': 'SFP kosong', '14': 'Mati', '15': 'PSU V'}
    got = {s['name']: s for s in sv.parse_entity(cols, names)}
    assert got['CPU temp'] == {'kind': 'temperature', 'key': 'ent.10', 'name': 'CPU temp', 'value': 41.0, 'unit': 'C'}
    assert got['Fan1']['kind'] == 'fan' and got['Fan1']['value'] == 5400
    assert got['SFP Rx']['kind'] == 'optical' and got['SFP Rx']['value'] == -5.23
    assert 'SFP kosong' not in got and 'Mati' not in got       # -40 dBm = tak ada sinyal; status 2 = tak tersedia
    assert got['PSU V']['kind'] == 'voltage' and 'ent.16' not in {s['key'] for s in got.values()}   # hertz dilewati


def test_parse_cisco_status():
    r = sv.parse_cisco({'2': {'1': b'Inlet'}, '3': {'1': 38}}, {'2': {'1': b'Fan1', '2': b'Fan2'}, '3': {'1': 1, '2': 5}},
                       {'2': {'1': b'PS1', '2': b'PS2'}, '3': {'1': 1, '2': 2}})
    by = {x['name']: x for x in r}
    assert by['Inlet']['value'] == 38.0 and by['Fan1']['value'] == 1 and 'Fan2' not in by   # 5 = slot kosong
    assert by['PS1']['value'] == 1 and by['PS2']['value'] == 0 and by['PS2']['kind'] == 'status'


class _Fake:
    def __init__(self, tables):
        self.t = tables

    async def walk(self, oid, max_rows=0):
        return self.t.get(oid, {})


def test_collect_entity_and_cisco_cpu_and_empty():
    t = {f'{sv.ENT_SENSOR}.1': {'5': 8}, f'{sv.ENT_SENSOR}.2': {'5': 9}, f'{sv.ENT_SENSOR}.3': {'5': 0},
         f'{sv.ENT_SENSOR}.4': {'5': 47}, f'{sv.ENT_SENSOR}.5': {'5': 1}, sv.ENT_NAME: {'5': b'Chassis temp'},
         sv.CISCO_CPU5M: {'1': 12, '2': 20}}
    sensors, cpu = asyncio.run(sv.collect(_Fake(t)))
    assert sensors[0]['name'] == 'Chassis temp' and sensors[0]['value'] == 47.0 and cpu == 16.0
    assert asyncio.run(sv.collect(_Fake({}))) == ([], None)


def test_parse_huawei_dan_collect():
    r = sv.parse_huawei({'17': 41, '18': 0, '19': 2147483647}, {'17.1': 55, '17.2': 255}, {'17': 'Board 0', '18': 'x'})
    by = {x['key']: x for x in r}
    assert by['hwt.17']['value'] == 41.0 and by['hwt.17']['name'] == 'Board 0'
    assert 'hwt.18' not in by and 'hwt.19' not in by           # 0 dan nilai tak masuk akal dilewati
    assert by['hwf.17.1']['unit'] == '%' and 'hwf.17.2' not in by
    t = {sv.HW_TEMP: {'17': 44}, sv.HW_FAN: {'17.1': 60}, sv.ENT_NAME: {'17': b'MPU'}}
    sensors, _ = asyncio.run(sv.collect(_Fake(t)))
    assert {s['key'] for s in sensors} == {'hwt.17', 'hwf.17.1'}
