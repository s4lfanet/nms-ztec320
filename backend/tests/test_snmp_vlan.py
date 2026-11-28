"""SNMP: VLAN per port (Q-BRIDGE): parse bitmap, simpan, API."""
from app import db
from models import SnmpPort, SnmpVlan, SnmpFdb
import snmp_monitor as sm
import snmp_tables as stb
from tests.test_snmp_topology import H, _client, _dev
from tests.test_link_state import ctx  # noqa: F401


def _raw():
    return {
        'vlan_egress': {'100': b'\xe0', '200': b'\x20', '5000': b'\x80'},   # 100: port 1,2,3 ; 200: port 3 ; 5000 tidak valid
        'vlan_untag': {'100': b'\x60', '200': b'\x00'},                      # 100 untagged: port 2,3
        'vlan_name': {'100': b'PELANGGAN', '200': b'MGMT'},
        'pvid': {'2': 100, '3': 0},
        'base_port': {'1': 1, '2': 2, '3': 3},
    }


def test_parse_bitmap_vlan_dan_pvid():
    r = stb.parse(_raw())
    assert r['vlans'] == [(100, 'PELANGGAN', [1, 2, 3], [2, 3]), (200, 'MGMT', [3], [])]
    assert r['pvid'] == {2: 100}
    assert stb.parse({})['vlans'] == []


def test_apply_dan_api_vlan(ctx):
    d = _dev('SW-V', '10.7.0.1', 'swv', [('sfp1', ''), ('ether2', ''), ('ether3', '')])
    db.session.commit()
    stb.apply(d, stb.parse(_raw()), sm._now())
    db.session.add(SnmpFdb(device_id=d.id, port_id=SnmpPort.query.filter_by(device_id=d.id, if_index=3).first().id,
                           if_index=3, vlan=300, mac='aa:bb:cc:00:00:01'))
    db.session.commit()
    assert SnmpVlan.query.filter_by(device_id=d.id).count() == 2
    assert SnmpPort.query.filter_by(device_id=d.id, if_index=2).first().pvid == 100
    j = _client().get(f'/api/snmp/devices/{d.id}/vlans', headers=H).get_json()
    v100 = next(v for v in j['vlans'] if v['vlan'] == 100)
    assert v100['name'] == 'PELANGGAN' and v100['tagged'] == ['sfp1'] and v100['untagged'] == ['ether2', 'ether3']
    p3 = next(p for p in j['ports'] if p['port'] == 'ether3')
    assert {m['vlan'] for m in p3['member']} == {100, 200} and p3['seen'] == [300]
    # pembacaan berikutnya tanpa VLAN membersihkan konfigurasi lama
    stb.apply(d, {'arp': [], 'fdb': []}, sm._now())
    db.session.commit()
    assert SnmpVlan.query.filter_by(device_id=d.id).count() == 0
