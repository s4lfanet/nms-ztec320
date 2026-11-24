"""SNMP tahap 4: tetangga LLDP/CDP/MNDP, pencocokan ke perangkat terdaftar, graf topologi."""
import secrets

from app import app, db
from models import User, SnmpDevice, SnmpPort, SnmpNeighbor
import snmp_monitor as sm
import snmp_topology as st
from tests.test_link_state import ctx  # noqa: F401

H = {'X-Requested-With': 'XMLHttpRequest'}
L = '1.0.8802.1.1.2.1'


def _client():
    u = User(username='t' + secrets.token_hex(3), full_name='t', is_super_admin=True)
    u.set_password(secrets.token_hex(8))
    db.session.add(u); db.session.commit()
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['_user_id'] = str(u.id); sess['_fresh'] = True
    return c


def _lldp(local_port, name, chassis, rport, ip=None):
    idx = f'0.{local_port}.1'
    d = {'chassis': {idx: chassis}, 'port': {idx: rport}, 'port_desc': {idx: b''}, 'sys_name': {idx: name},
         'sys_desc': {idx: b'RouterOS'}, 'loc_port_id': {str(local_port): b'ether1'}, 'loc_port_desc': {},
         'man': {}}
    if ip:
        d['man'][f'{idx}.1.4.{ip}'] = 2
    return d


def test_parse_lldp_cdp_mndp_and_dedupe():
    ports = {1: {'name': 'sfp1', 'descr': 'sfp1'}, 2: {'name': 'ether1', 'descr': 'ether1'}}
    data = {
        'lldp': _lldp(7, b'sw-a', b'\x00\x0c\x29\xaa\xbb\xcc', b'sfp1', '10.0.0.2'),
        'cdp': {'addr_type': {'1.3': 1}, 'addr': {'1.3': b'\x0a\x00\x00\x03'}, 'device_id': {'1.3': b'cisco-sw'},
                'port': {'1.3': b'Gi0/1'}, 'platform': {'1.3': b'cisco WS-C2960'}},
        'mt': {'identity': {'5': b'sw-a', '6': b'gw'}, 'mac': {'5': b'\x00\x0c\x29\xaa\xbb\xcc', '6': b'\x4c\x5e\x0c\x11\x22\x33'},
               'if_index': {'5': 2, '6': 1}, 'ip': {'6': b'\x0a\x00\x00\x09'}, 'platform': {'6': b'MikroTik'}, 'version': {}},
    }
    res = st.parse(data, ports)
    by = {(n['protocol'], n['remote_name']): n for n in res}
    assert by[('lldp', 'sw-a')]['local_if_index'] == 2  # lldpLocPortNum 7 → ifName ether1
    assert by[('lldp', 'sw-a')]['remote_ip'] == '10.0.0.2' and by[('lldp', 'sw-a')]['remote_chassis'] == '00:0c:29:aa:bb:cc'
    assert by[('cdp', 'cisco-sw')]['remote_ip'] == '10.0.0.3' and by[('cdp', 'cisco-sw')]['local_if_index'] == 1
    assert ('mndp', 'sw-a') not in by  # duplikat LLDP di port yang sama dibuang
    assert by[('mndp', 'gw')]['remote_ip'] == '10.0.0.9'


def _dev(name, host, sys_name, ports):
    d = SnmpDevice(name=name, host=host, snmp_version='2c', sys_name=sys_name, status='up')
    d.community = secrets.token_hex(4)
    db.session.add(d); db.session.flush()
    for idx, (pn, mac) in enumerate(ports, start=1):
        db.session.add(SnmpPort(device_id=d.id, if_index=idx, name=pn, descr=pn, mac=mac, speed_mbps=10000,
                                admin_status='up', oper_status='up', in_bps=2e9, out_bps=5e8))
    db.session.commit()
    return d


def test_apply_link_and_build_graph(ctx):
    core = _dev('Core', '10.0.0.1', 'core-pusat', [('sfp1', '00:0c:29:00:00:01'), ('ether2', '')])
    sw = _dev('Switch A', '10.0.0.2', 'sw-a', [('sfp-sfpplus1', '00:0c:29:aa:bb:cc')])
    now = sm._now()
    # Core melihat sw-a di sfp1 (via IP manajemen) + tetangga tak terdaftar di ether2
    st.apply(core, st.parse({'lldp': _lldp(1, b'sw-a', b'\x00\x0c\x29\xaa\xbb\xcc', b'sfp-sfpplus1', '10.0.0.2'),
                             'mt': {'identity': {'9': b'cpe-x'}, 'mac': {'9': b'\x01\x02\x03\x04\x05\x06'},
                                    'if_index': {'9': 2}, 'ip': {}, 'platform': {}, 'version': {}}},
                            {1: {'name': 'sfp1'}, 2: {'name': 'ether2'}}), now)
    # Switch melihat core di sfp-sfpplus1 (via sysName)
    st.apply(sw, st.parse({'lldp': _lldp(1, b'core-pusat', b'\x00\x0c\x29\x00\x00\x01', b'sfp1')},
                          {1: {'name': 'sfp-sfpplus1'}}), now)
    db.session.commit()
    st.link_all(); db.session.commit()
    n = SnmpNeighbor.query.filter_by(device_id=core.id, protocol='lldp').one()
    assert n.remote_device_id == sw.id and n.remote_port_id is not None
    nodes, links = st.build()
    assert {x['id'] for x in nodes} == {f'd{core.id}', f'd{sw.id}', 'x:01:02:03:04:05:06'}
    core_sw = [lk for lk in links if {lk['source'], lk['target']} == {f'd{core.id}', f'd{sw.id}'}]
    assert len(core_sw) == 1  # terlihat dari dua sisi → satu link
    assert core_sw[0]['util_pct'] == 20.0
    # Discovery ulang tanpa tetangga → baris lama dihapus
    st.apply(core, [], now); db.session.commit()
    assert SnmpNeighbor.query.filter_by(device_id=core.id).count() == 0


def test_topology_api_and_device_neighbors(ctx):
    core = _dev('Core', '10.0.0.1', 'core-pusat', [('sfp1', '')])
    st.apply(core, [{'protocol': 'lldp', 'local_if_index': 1, 'remote_name': 'olt-x', 'remote_chassis': '',
                     'remote_port': 'gei_1/3/1', 'remote_port_descr': '', 'remote_platform': 'ZTE', 'remote_ip': '10.0.0.50'}],
             sm._now())
    db.session.commit()
    c = _client()
    t = c.get('/api/snmp/topology', headers=H).get_json()
    assert len(t['nodes']) == 2 and t['links'][0]['target_port']['port'] == 'gei_1/3/1'
    d = c.get(f'/api/snmp/devices/{core.id}', headers=H).get_json()
    assert d['neighbors'][0]['remote_name'] == 'olt-x' and d['neighbors'][0]['local_port'] == 'sfp1'
    assert c.delete(f'/api/snmp/devices/{core.id}', headers=H).status_code == 200
    assert SnmpNeighbor.query.count() == 0
