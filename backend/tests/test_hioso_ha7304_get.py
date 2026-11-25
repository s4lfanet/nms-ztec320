"""HIOSO HA7304 (4 PON) / 2-PON: SNMP GET-per-OID collector, NUL-terminated names,
SNMP SET (name/reboot/enable). No walks — HA7304 agents time out on them."""
from unittest.mock import patch

from app import app
from models import db, OLT
from olt_adapters import RackAdapterRegistry
from olt_adapters.hioso_adapter import (
    calc_ha7304_distance_m, clean_snmp_text, HA7304_ONU, HA7304_DDM)

B = HA7304_ONU.lstrip('.')
D = HA7304_DDM.lstrip('.')


def _fake_batch(table):
    def fn(self_sc, oids):
        out = {}
        for o in oids:
            v = table.get(o.lstrip('.'))
            if v is not None:
                out[o] = v
        return out
    return fn


def _olt(model='HA7304', name='HA7304-T'):
    olt = OLT(name=name, ip_address='10.20.30.40', vendor='hioso', model=model,
              snmp_enabled=True, telnet_enabled=False)
    db.session.add(olt)
    db.session.commit()
    return olt


def test_distance_and_nul_name():
    assert calc_ha7304_distance_m(100) == 150
    assert calc_ha7304_distance_m(0) is None
    assert clean_snmp_text(b'RUMAH-ANDI\x00\x13\xff') == 'RUMAH-ANDI'
    assert clean_snmp_text(b'\x00\x00\x00') == ''


def test_get_collector_batches_and_skips_empty_onu():
    table = {
        f'{B}.39.1.3.21': 1, f'{B}.39.1.1.1': 2, f'{B}.39.1.2.5': 1,
        f'{B}.11.1.3.21': 'a4f33b4c9bdb', f'{B}.11.1.1.1': 'f83e9545d7f8',
        f'{B}.11.1.2.5': '000000000000',  # deleted/empty ONU
        f'{B}.37.1.3.21': b'PAK-BUDI\x00', f'{B}.37.1.1.1': b'\x00\x00\x00',
        f'{B}.15.1.3.21': '6301', f'{B}.15.1.1.1': '6301',
        f'{B}.25.1.3.21': 1000, f'{B}.25.1.1.1': 200,
        f'{D}.8.1.3.21': '-19.51', f'{D}.4.1.3.21': '2.64',
    }
    calls = []
    orig = _fake_batch(table)

    def fn(self_sc, oids):
        calls.append(len(oids))
        return orig(self_sc, oids)

    with app.app_context():
        olt = _olt()
        ad = RackAdapterRegistry.get_adapter(olt)
        assert ad._is_ha7304_get_model()
        with patch('snmp_core.SNMPCollector.batch_get', new=fn), \
             patch('snmp_core.SNMPCollector._walk_async', side_effect=AssertionError('no walk')):
            from snmp_core import SNMPCollector
            onus = ad._collect_from_mib_get(SNMPCollector('10.20.30.40', 'public', 161), {})
        assert max(calls) <= 16
        by = {(o['port'], o['onu_id']): o for o in onus}
        assert set(by) == {(3, 21), (1, 1)}  # empty MAC dropped
        a = by[(3, 21)]
        assert a['status'] == 'online' and a['name'] == 'PAK-BUDI'
        assert a['serial_number'] == 'A4:F3:3B:4C:9B:DB'
        assert a['rx_power'] == -19.51 and a['tx_power'] == 2.64
        assert a['distance'] == 1496
        b = by[(1, 1)]
        assert b['status'] == 'los' and b['name'] == 'NA' and b['rx_power'] is None


def test_two_pon_scans_128_onu():
    with app.app_context():
        olt = _olt('HA7302CS', 'HA7302-T')
        ad = RackAdapterRegistry.get_adapter(olt)
        assert ad._default_pon_count() == 2 and ad._max_onu_per_pon() == 128
        assert ad._is_ha7304_get_model()


def test_set_name_reboot_enable_oids():
    sent = []

    def fake_set(self_sc, pairs, write_community=None):
        sent.append((pairs, write_community))
        return True, None

    with app.app_context():
        olt = _olt(name='HA7304-W')
        olt.snmp_community_write = 'wcommunity'
        ad = RackAdapterRegistry.get_adapter(olt)
        with patch('snmp_core.SNMPCollector.snmp_set', new=fake_set):
            assert ad.set_onu_name_snmp(3, 21, 'Pak Budi')[0]
            assert ad.reboot_onu_snmp(3, 21)[0]
            assert ad.set_onu_enabled_snmp(3, 21, False)[0]
            assert ad.set_onu_name_snmp(1, 1, 'x' * 40)[0]
        (n, wc) = sent[0]
        assert n == [(f'{HA7304_ONU}.37.1.3.21', b'Pak Budi\x00', 'x')] and wc == 'wcommunity'
        assert sent[1][0] == [(f'{HA7304_ONU}.22.1.3.21', 1, 'i')]
        assert sent[2][0] == [(f'{HA7304_ONU}.35.1.3.21', 2, 'i')]
        assert sent[3][0][0][1] == b'x' * 30  # 30 chars: no NUL


def test_other_models_not_get_mode():
    with app.app_context():
        for m in ('HA7304C', 'HA7304V', 'HA7404'):
            olt = _olt(m, f'X-{m}')
            assert not RackAdapterRegistry.get_adapter(olt)._is_ha7304_get_model()
