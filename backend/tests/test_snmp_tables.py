"""SNMP: tabel ARP & MAC (FDB), riwayat terakhir terlihat, pencarian MAC/IP."""
import secrets
from datetime import timedelta

from app import db
from models import SnmpDevice, SnmpPort, SnmpArp, SnmpFdb
import snmp_monitor as sm
import snmp_tables as stb
from tests.test_link_state import ctx  # noqa: F401
from tests.test_viewer_permissions import _user, _client

H = {'X-Requested-With': 'XMLHttpRequest'}
M1 = b'\x4c\x5e\x0c\xaa\xbb\x01'
M2 = b'\x00\x1a\x2b\x3c\x4d\x5e'


def _raw_q():
    return {
        'arp_media': {'3.10.0.0.5': M1, '3.10.0.0.6': M2, '3.10.0.0.7': b'\x00' * 6, '4.10.0.0.8': M2},
        'arp_media_type': {'3.10.0.0.6': 3, '4.10.0.0.8': 2},          # .8 invalid → dibuang
        # fdbId 1 → VLAN 100 lewat dot1qVlanFdbId; bridge port 2 → ifIndex 3
        'q_fdb': {'1.76.94.12.170.187.1': 2, '1.0.26.43.60.77.94': 2, '1.1.2.3.4.5.6': 1},
        'q_fdb_status': {'1.76.94.12.170.187.1': 3, '1.0.26.43.60.77.94': 3, '1.1.2.3.4.5.6': 4},  # self dibuang
        'q_vlan_fdb': {'0.100': 1},
        'base_port': {'1': 2, '2': 3},
    }


def test_parse_arp_and_qbridge_fdb():
    res = stb.parse(_raw_q())
    assert sorted(res['arp']) == [(3, '10.0.0.5', '4c:5e:0c:aa:bb:01'), (3, '10.0.0.6', '00:1a:2b:3c:4d:5e')]
    assert sorted(res['fdb']) == [(3, 100, '00:1a:2b:3c:4d:5e'), (3, 100, '4c:5e:0c:aa:bb:01')]


def test_parse_fallback_tables():
    raw = {'arp_media': {}, 'arp_phys': {'7.1.4.192.168.1.9': M1, '7.2.16.254.128.0.0.0.0.0.0.0.0.0.0.0.0.0.1': M2},
           'arp_phys_type': {}, 'q_fdb': {}, 'd_fdb': {'0.26.43.60.77.94': 5}, 'd_fdb_status': {},
           'base_port': {'5': 12}}
    res = stb.parse(raw)
    assert res['arp'] == [(7, '192.168.1.9', '4c:5e:0c:aa:bb:01')]     # IPv6 dilewati
    assert res['fdb'] == [(12, None, '00:1a:2b:3c:4d:5e')]


def test_norm_query():
    assert stb.norm_query('4C-5E-0C') == ('mac', '4c5e0c')
    assert stb.norm_query('4c5e.0caa.bb01') == ('mac', '4c5e0caabb01')
    assert stb.norm_query('10.0.0') == ('ip', '10.0.0')
    assert stb.norm_query('1234')[0] == 'ip'


def _device():
    d = SnmpDevice(name='SW-' + secrets.token_hex(2), host='10.1.1.' + str(secrets.randbelow(200) + 2), snmp_version='2c', status='up')
    d.community = secrets.token_hex(4)
    db.session.add(d); db.session.flush()
    p = SnmpPort(device_id=d.id, if_index=3, name='ether3', alias='PELANGGAN-A', admin_status='up', oper_status='up')
    db.session.add(p); db.session.commit()
    return d, p


def test_apply_history_and_move(ctx):
    d, p = _device()
    t0 = sm._now() - timedelta(hours=2)
    stb.apply(d, stb.parse(_raw_q()), t0)
    db.session.commit()
    assert SnmpFdb.query.filter_by(device_id=d.id, port_id=p.id).count() == 2
    # pembacaan berikutnya: satu MAC hilang, satu pindah port (ifIndex 9)
    t1 = sm._now()
    stb.apply(d, {'arp': [(3, '10.0.0.5', '4c:5e:0c:aa:bb:01')], 'fdb': [(9, 100, '4c:5e:0c:aa:bb:01')]}, t1)
    db.session.commit()
    moved = SnmpFdb.query.filter_by(device_id=d.id, mac='4c:5e:0c:aa:bb:01').one()
    assert moved.if_index == 9 and moved.port_id is None and moved.first_seen == t1
    gone = SnmpFdb.query.filter_by(device_id=d.id, mac='00:1a:2b:3c:4d:5e').one()
    assert gone.last_seen == t0  # riwayat disimpan, tidak langsung dihapus
    sm.save_general({'snmp_tables_keep_hours': 1}); db.session.commit()
    sm.prune_events()
    assert SnmpFdb.query.filter_by(device_id=d.id, mac='00:1a:2b:3c:4d:5e').count() == 0


def test_tables_search_and_port_macs_api(ctx):
    d, p = _device()
    now = sm._now()
    stb.apply(d, stb.parse(_raw_q()), now)
    db.session.commit()
    c = _client(_user('view_dashboard'))
    t = c.get(f'/api/snmp/devices/{d.id}/tables', headers=H).get_json()
    assert len(t['arp']) == 2 and all(r['active'] for r in t['fdb']) and t['fdb'][0]['vlan'] == 100
    assert t['arp'][0]['port_alias'] == 'PELANGGAN-A'
    assert {r['ip'] for r in t['fdb']} == {'10.0.0.5', '10.0.0.6'}  # IP dari ARP ikut di baris MAC

    r = c.get('/api/snmp/search?q=4C-5E-0C-AA', headers=H).get_json()
    assert r['kind'] == 'mac'
    fdb = [x for x in r['results'] if x['type'] == 'fdb']
    assert fdb and fdb[0]['device'] == d.name and fdb[0]['port'] == 'ether3' and fdb[0]['ip'] == '10.0.0.5'

    r = c.get('/api/snmp/search?q=10.0.0.6', headers=H).get_json()
    types = {x['type'] for x in r['results']}
    assert r['kind'] == 'ip' and types == {'fdb'}  # IP → MAC → port switch; ARP di perangkat sama digabung
    assert r['results'][0]['ip'] == '10.0.0.6'

    macs = c.get(f'/api/snmp/ports/{p.id}', headers=H).get_json()['macs']
    assert {m['mac'] for m in macs} == {'4c:5e:0c:aa:bb:01', '00:1a:2b:3c:4d:5e'}
    assert {m['ip'] for m in macs} == {'10.0.0.5', '10.0.0.6'}

    # refresh manual hanya untuk pengelola
    assert c.post(f'/api/snmp/devices/{d.id}/tables/refresh', headers=H).status_code == 403


def test_delete_device_removes_tables(ctx):
    d, _p = _device()
    stb.apply(d, stb.parse(_raw_q()), sm._now())
    db.session.commit()
    admin = _client(_user('view_dashboard', super_admin=True))
    assert admin.delete(f'/api/snmp/devices/{d.id}', headers=H).get_json()['success']
    assert SnmpArp.query.filter_by(device_id=d.id).count() == 0 and SnmpFdb.query.filter_by(device_id=d.id).count() == 0
