"""Penemuan otomatis (E): usulan tetangga, validasi CIDR, scan, tambah usulan."""
import time

from app import db
from models import SnmpDevice, SnmpNeighbor, SystemConfig
import snmp_discovery as sd
import snmp_monitor as sm
from tests.test_snmp_topology import H, _client, _dev
from tests.test_link_state import ctx  # noqa: F401


def test_parse_cidr():
    assert sd.parse_cidr('10.10.1.0/24')[0].num_addresses == 256
    assert sd.parse_cidr('8.8.8.0/24')[1]                 # publik ditolak
    assert sd.parse_cidr('10.0.0.0/8')[1]                 # terlalu besar
    assert sd.parse_cidr('abc')[1] and sd.parse_cidr('fe80::/64')[1]
    assert sd.parse_cidr('192.168.5.7/24')[1] is None     # non-strict


def test_neighbor_candidates_dan_add(ctx):
    a = _dev('Core', '10.9.0.1', 'core', [('e1', '')])
    _dev('Sudah', '10.9.0.9', 'sudah', [('e1', '')])
    db.session.add(SnmpNeighbor(device_id=a.id, remote_ip='10.9.0.5', remote_name='SW-Baru', remote_platform='Cisco', protocol='lldp'))
    db.session.add(SnmpNeighbor(device_id=a.id, remote_ip='10.9.0.9', remote_name='Sudah'))        # sudah terdaftar
    db.session.add(SnmpNeighbor(device_id=a.id, remote_ip='10.9.0.6', remote_device_id=a.id))      # sudah cocok
    db.session.add(SnmpNeighbor(device_id=a.id, remote_ip='', remote_name='tanpa ip'))
    db.session.commit()
    c = _client()
    j = c.get('/api/snmp/discovery', headers=H).get_json()
    assert [n['ip'] for n in j['neighbors']] == ['10.9.0.5'] and j['neighbors'][0]['seen_from'] == 'Core'
    # tanpa community bawaan → ditolak; scan publik ditolak
    assert c.post('/api/snmp/discovery/scan', json={'cidr': '10.9.0.0/24'}, headers=H).status_code == 400
    assert c.post('/api/snmp/discovery/add', json={'ip': '10.9.0.5'}, headers=H).status_code == 400   # community bawaan belum ada
    sm.save_general({'snmp_default_community': 'public'}); db.session.commit()
    r = c.post('/api/snmp/discovery/add', json={'ip': '10.9.0.5', 'name': 'SW-Baru'}, headers=H)
    assert r.status_code == 200, r.get_data(as_text=True)
    assert SnmpDevice.query.filter_by(host='10.9.0.5').count() == 1
    assert c.post('/api/snmp/discovery/add', json={'ip': '10.9.0.5'}, headers=H).status_code == 400   # ganda
    assert c.get('/api/snmp/discovery', headers=H).get_json()['neighbors'] == []


def test_scan_menemukan_perangkat(ctx, monkeypatch):
    from app import app
    _dev('Ada', '10.20.0.2', 'ada', [('e1', '')])
    db.session.commit()
    monkeypatch.setattr(sm, 'test_connection', lambda p: {'ok': True, 'sys_name': 'AP-' + p['host'][-1], 'vendor': 'MikroTik', 'os': 'RouterOS', 'sys_descr': 'x'}
                        if p['host'] in ('10.20.0.3', '10.20.0.4') else {'ok': False, 'error': 'timeout'})
    ok, msg = sd.start_scan('10.20.0.0/29', {'version': '2c', 'community': 'x', 'port': 161}, app)
    assert ok, msg
    for _ in range(100):
        if not sd.status()['running']:
            break
        time.sleep(0.05)
    st = sd.status()
    assert st['total'] == 5 and st['done'] == 5          # 6 host usable, 1 sudah terdaftar tidak dipindai
    assert sorted(f['ip'] for f in st['found']) == ['10.20.0.3', '10.20.0.4']
    assert sd.start_scan('8.8.8.0/24', {}, app)[0] is False
