"""Tests for Fase 13 C-Data GPON adapter (SNMP read-only monitoring).

Covers: name/serial/centi-dBm parsing, status + down-cause mapping,
collect_onus merge across NSCRTV tables (mocked walks), and CDataAdapter
model-based dispatch.
"""
import os
import sys
import pytest
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from olt_adapters.cdata_gpon_adapter import (
    parse_gpon_onu_name, decode_gpon_serial, parse_centi_dbm,
    CDataAdapter, CDataGponAdapter,
    OID_ONU_NAME, OID_ONU_SERIAL, OID_ONU_STATUS, OID_ONU_RX,
    OID_ONU_EQUIP, OID_ONU_DOWN_CAUSE, OID_ONU_MAC,
)
from olt_adapters.standalone_epon_adapter import StandaloneEponAdapter


class TestParsers:
    def test_name_basic(self):
        assert parse_gpon_onu_name('gpon 0/0/1 onu 5 pelanggan A') == (1, 1, 1, 5, 'pelanggan A')

    def test_name_no_label(self):
        assert parse_gpon_onu_name('gpon 0/0/3 onu 12') == (1, 1, 3, 12, '')

    def test_name_bytes_with_nul(self):
        # Hex-STRING berpadding NUL (quirk FD1608S)
        raw = b'gpon 0/0/1 onu 2 Amanah\x00\x00\x00'
        assert parse_gpon_onu_name(raw) == (1, 1, 1, 2, 'Amanah')

    def test_name_unparseable(self):
        assert parse_gpon_onu_name('garbage') == (0, 0, 0, 0, 'garbage')

    def test_serial_8_bytes(self):
        # 'ZTEG' + 0x1A2B3C4D → ZTEG1A2B3C4D
        assert decode_gpon_serial(b'ZTEG\x1a\x2b\x3c\x4d') == 'ZTEG1A2B3C4D'
        assert decode_gpon_serial(b'CDTC\x00\x11\x22\x33') == 'CDTC00112233'

    def test_serial_hex_string(self):
        assert decode_gpon_serial('0x5a544547aabbccdd') == 'ZTEGAABBCCDD'

    def test_serial_plain(self):
        assert decode_gpon_serial('HWTC12345678') == 'HWTC12345678'
        assert decode_gpon_serial('--') == ''

    def test_centi_dbm(self):
        assert parse_centi_dbm(-2495) == -24.95
        assert parse_centi_dbm('-1980') == -19.8
        assert parse_centi_dbm(-1) is None      # offline marker
        assert parse_centi_dbm(0) is None
        assert parse_centi_dbm(None) is None
        assert parse_centi_dbm('bad') is None


class _FakeSC:
    """SNMPCollector stand-in returning canned walk dicts."""
    WALKS = {}
    def __init__(self, *a, **kw): pass
    def _run(self, coro):
        import asyncio
        return asyncio.run(coro)
    async def _walk_async(self, oid, max_rows=None): return dict(self.WALKS.get(oid, {}))
    def close(self): pass


def _make_olt(model='FD1608S-B1'):
    return SimpleNamespace(vendor='cdata', name='TestCData', model=model,
                           ip_address='10.0.0.1', snmp_community='public', snmp_port=161)


class TestCollectOnus:
    WALKS = {
        OID_ONU_NAME: {
            '4718593': 'gpon 0/0/1 onu 1 pelanggan-A',
            '4718594': 'gpon 0/0/1 onu 2 pelanggan-B',
            '4718595': 'gpon 0/0/2 onu 1 pelanggan-C',
        },
        OID_ONU_SERIAL: {
            '4718593': b'ZTEG\x1a\x2b\x3c\x4d',
            '4718594': b'CDTC\x00\x11\x22\x33',
            '4718595': b'HWTC\xde\xad\xbe\xef',
        },
        OID_ONU_STATUS: {'4718593': 1, '4718594': 2, '4718595': 2},
        OID_ONU_DOWN_CAUSE: {'4718594': 'dying-gasp', '4718595': 'LOS'},
        OID_ONU_EQUIP: {'4718593': 'F609V5.3', '4718594': 'F660', '4718595': 'HG8245H'},
        OID_ONU_RX: {'4718593.0.0': -2495, '4718594.0.0': -1, '4718595.0.0': -1900},
        OID_ONU_MAC: {'4718595.1': b'\xaa\xbb\xcc\xdd\xee\xff'},
    }

    def test_collect_onus_merges_tables(self, monkeypatch):
        _FakeSC.WALKS = self.WALKS
        monkeypatch.setattr('snmp_core.SNMPCollector', _FakeSC)
        adapter = CDataGponAdapter(_make_olt())
        onus = {o['serial_number']: o for o in adapter.collect_onus()}

        assert len(onus) == 3

        a = onus['ZTEG1A2B3C4D']
        assert a['status'] == 'online' and a['rx_power'] == -24.95
        assert a['slot'] == 1 and a['port'] == 1 and a['onu_id'] == 1
        assert a['name'] == 'pelanggan-A' and a['actual_type'] == 'F609V5.3'

        b = onus['CDTC00112233']
        assert b['status'] == 'dyinggasp' and b['rx_power'] is None
        assert b['last_dereg_reason'] == 'dying-gasp'

        c = onus['HWTC' + 'DEADBEEF']
        assert c['status'] == 'los' and c['port'] == 2

    def test_empty_name_table_returns_empty(self, monkeypatch):
        _FakeSC.WALKS = {}
        monkeypatch.setattr('snmp_core.SNMPCollector', _FakeSC)
        assert CDataGponAdapter(_make_olt()).collect_onus() == []


class TestDispatch:
    def test_gpon_models_route_to_gpon_adapter(self):
        for model in ('FD1608S-B1', 'FD1601S-B1', 'GPON-16', 'FD1216S'):
            a = CDataAdapter(_make_olt(model))
            assert type(a) is CDataGponAdapter, model

    def test_epon_models_stay_standalone(self):
        # CDataAdapter mewarisi jalur EPON StandaloneEponAdapter — cukup pastikan
        # dispatch tidak melempar ke GPON.
        for model in ('FD1304E', 'EPON-8', 'FD1108S'):
            a = CDataAdapter(_make_olt(model))
            assert not isinstance(a, CDataGponAdapter), model
            assert isinstance(a, StandaloneEponAdapter), model

    def test_pon_port_prefix(self):
        assert CDataGponAdapter(_make_olt()).pon_port_prefix.startswith('gpon')
        assert StandaloneEponAdapter(_make_olt()).pon_port_prefix.startswith('epon')
