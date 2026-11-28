"""SNMP: wireless MikroTik (radio + klien terhubung)."""
from app import db
from models import SnmpWifiClient, SnmpWifiRadio
import snmp_monitor as sm
import snmp_tables as stb
from tests.test_snmp_topology import H, _client, _dev
from tests.test_link_state import ctx  # noqa: F401

# indeks Rtab = mac6.ifIndex  → 76.94.12.170.187.1 = 4c:5e:0c:aa:bb:01 di ifIndex 5
IDX_A = '76.94.12.170.187.1.5'
IDX_B = '0.26.43.60.77.94.5'


def _raw():
    return {
        'wl_signal': {IDX_A: -58, IDX_B: -81, 'bad.idx': -50},
        'wl_tx': {IDX_A: 144000000, IDX_B: 6500000}, 'wl_rx': {IDX_A: 130000000},
        'wl_uptime': {IDX_A: 360000, IDX_B: 100}, 'wl_snr': {IDX_A: 38, IDX_B: 0},
        'wl_ssid': {'5': b'SALFANET-AP1'}, 'wl_freq': {'5': 5180}, 'wl_noise': {'5': -95}, 'wl_ccq': {'5': 91},
    }


def test_parse_wireless():
    r = stb.parse(_raw())
    assert r['wifi_radios'] == [(5, 'SALFANET-AP1', 5180, None, -95, 91)]
    a = next(c for c in r['wifi_clients'] if c[1] == '4c:5e:0c:aa:bb:01')
    assert a == (5, '4c:5e:0c:aa:bb:01', -58, 38, 144000000, 130000000, 3600)
    b = next(c for c in r['wifi_clients'] if c[1] == '00:1a:2b:3c:4d:5e')
    assert b[3] is None and b[6] == 1       # SNR 0 = tidak ada
    assert len(r['wifi_clients']) == 2


def test_apply_dan_api_wireless(ctx):
    d = _dev('AP-1', '10.8.0.1', 'ap1', [('e1', ''), ('e2', ''), ('e3', ''), ('e4', ''), ('wlan1', '')])
    db.session.commit()
    stb.apply(d, stb.parse(_raw()), sm._now())
    db.session.commit()
    assert SnmpWifiRadio.query.filter_by(device_id=d.id).count() == 1
    j = _client().get(f'/api/snmp/devices/{d.id}/wireless', headers=H).get_json()
    assert j['radios'][0]['name'] == 'wlan1' and j['radios'][0]['clients'] == 2   # dihitung dari tabel klien
    assert [c['signal'] for c in j['clients']] == [-81, -58]                      # terlemah dulu
    stb.apply(d, {'arp': [], 'fdb': []}, sm._now())
    db.session.commit()
    assert SnmpWifiClient.query.filter_by(device_id=d.id).count() == 0
