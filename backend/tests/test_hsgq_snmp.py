"""HSGQ: pemilihan tabel/kolom status SNMP + jumlah PON model 2 PON."""
import types

import pytest

from olt_adapters.standalone_epon_adapter import StandaloneEponAdapter

P1 = 0x01000000 | (1 << 8)
P2 = 0x01000000 | (2 << 8)


def _fake(data):
    class SC:
        def __init__(self, *a, **k): pass
        def _walk_async(self, oid): return oid
        def _run(self, oid): return dict(data.get(oid, {}))
        def close(self): pass
    return SC


def _adapter(model='HSGQ-E02'):
    olt = types.SimpleNamespace(vendor='hsgq', name='hs', model=model, ip_address='10.0.0.9',
                                snmp_community='public', snmp_port=161)
    a = StandaloneEponAdapter.__new__(StandaloneEponAdapter)
    a.olt = olt
    return a


def _keys():
    return [str(P1 + 1), str(P1 + 2), str(P2 + 1)]


def test_picks_status_column_matching_olt_counter(monkeypatch):
    k = _keys()
    data = {
        # kolom 8 (lama): semua "1" → 3 online (salah)
        '.50224.3.3.2.1.8': {k[0]: 1, k[1]: 1, k[2]: 1},
        # kolom 9: 2 online (benar)
        '.50224.3.3.2.1.9': {k[0]: 1, k[1]: 2, k[2]: 1},
        '.50224.3.2.3.1.4': {'1': 1, '2': 1},
        '.50224.3.3.2.1.2': {k[0]: 'budi@rw01', k[1]: 'ani', k[2]: 'cici'},
        '.50224.3.3.3.1.4': {k[0]: -2387, k[1]: -2500, k[2]: -1900},
        '.50224.3.3.3.1.5': {k[0]: 250, k[2]: 210},
    }
    import snmp_core
    monkeypatch.setattr(snmp_core, 'SNMPCollector', _fake(data))
    onus = _adapter().collect_onus()
    by = {(o['port'], o['onu_id']): o for o in onus}
    assert by[(1, 1)]['status'] == 'online' and by[(1, 2)]['status'] == 'offline'
    assert by[(2, 1)]['status'] == 'online'
    assert by[(1, 1)]['rx_power'] == -23.87 and by[(1, 1)]['tx_power'] == 2.5
    assert by[(1, 1)]['name'] == 'budi@rw01'


def test_id_table_used_when_old_table_empty(monkeypatch):
    k = _keys()
    data = {
        '.50224.3.12.2.1.3': {k[0]: 1, k[1]: 1, k[2]: 2},
        '.50224.3.12.2.1.5': {k[0]: 2, k[1]: 2, k[2]: 2},
        '.50224.3.2.3.1.4': {'1': 2, '2': 0},
        '.50224.3.12.2.1.2': {k[0]: 'a', k[1]: 'b', k[2]: 'c'},
    }
    import snmp_core
    monkeypatch.setattr(snmp_core, 'SNMPCollector', _fake(data))
    onus = _adapter().collect_onus()
    assert sum(o['status'] == 'online' for o in onus) == 2 and len(onus) == 3


def test_falls_back_to_legacy_mapping_without_counter(monkeypatch):
    k = _keys()
    data = {'.50224.3.3.2.1.8': {k[0]: 1, k[1]: 2, k[2]: 1}}
    import snmp_core
    monkeypatch.setattr(snmp_core, 'SNMPCollector', _fake(data))
    onus = _adapter().collect_onus()
    assert sum(o['status'] == 'online' for o in onus) == 2


@pytest.mark.parametrize('model,n', [('HSGQ-E02', 2), ('HSGQ-G04', 4), ('HSGQ-E08', 8),
                                     ('EPON 2P', 2), ('OLT', 4), ('HSGQ-E16', 16)])
def test_default_pon_count(model, n):
    assert _adapter(model)._default_pon_count() == n


def test_optic_index_with_zero_suffix_and_centi_scale(monkeypatch):
    k = _keys()
    data = {
        '.50224.3.12.2.1.3': {k[0]: 1, k[1]: 1, k[2]: 1},
        '.50224.3.2.3.1.4': {'1': 2, '2': 1},
        '.50224.3.12.2.1.2': {k[0]: 'a', k[1]: 'b', k[2]: 'c'},
        '.50224.3.12.2.1.19': {k[0]: 1200},
        # RX ber-ekor .0.0 (laporan lapangan)
        '.50224.3.12.3.1.4': {k[0] + '.0.0': -2122, k[1] + '.0.0': -2350, k[2] + '.0.0': -1999},
        # kolom .5 bukan TX (nilai seperti RX), TX sebenarnya di .3
        '.50224.3.12.3.1.5': {k[0] + '.0.0': -2600},
        '.50224.3.12.3.1.3': {k[0] + '.0.0': 95, k[1] + '.0.0': 210, k[2] + '.0.0': 180},
    }
    import snmp_core
    monkeypatch.setattr(snmp_core, 'SNMPCollector', _fake(data))
    by = {(o['port'], o['onu_id']): o for o in _adapter().collect_onus()}
    assert by[(1, 1)]['rx_power'] == -21.22
    assert by[(1, 1)]['tx_power'] == 0.95          # bukan 9.5 (skala /100)
    assert by[(2, 1)]['rx_power'] == -19.99
    assert by[(1, 1)]['distance'] == 1200
