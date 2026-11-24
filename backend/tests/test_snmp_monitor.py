"""Pemantauan perangkat SNMP: identifikasi, discovery, poll (laju/rebooot/port),
status & event, API, alert. Jaringan dipalsukan — tanpa SNMP sungguhan."""
import secrets
from datetime import timedelta

from app import app, db
from models import User, SnmpDevice, SnmpPort, SnmpSensor, SnmpEvent, Notification
import snmp_monitor as sm
from tests.test_link_state import ctx  # noqa: F401

H = {'X-Requested-With': 'XMLHttpRequest'}
SECRET = secrets.token_hex(6)


def _client():
    u = User(username='s' + secrets.token_hex(3), full_name='s', is_super_admin=True)
    u.set_password(secrets.token_hex(8))
    db.session.add(u); db.session.commit()
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['_user_id'] = str(u.id); sess['_fresh'] = True
    return c


DISC = {
    'descr': b'RouterOS CCR1072-1G-8S+', 'object_id': '1.3.6.1.4.1.14988.1', 'name': b'core-router',
    'location': b'POP Pusat', 'contact': b'noc', 'uptime': 100,
    'ports': {1: {'descr': b'sfp-sfpplus1', 'name': b'sfp-sfpplus1', 'alias': b'UPLINK-ISP', 'type': 6,
                  'hspeed': 10000, 'mac': b'\x00\x0c\x29\x01\x02\x03', 'admin': 1, 'oper': 1},
              2: {'descr': b'ether1', 'name': b'ether1', 'alias': b'', 'type': 6, 'hspeed': 1000, 'admin': 1, 'oper': 1}},
    'entity': {'model': '', 'serial': '', 'sw': ''},
    'mikrotik': {'serial': 'HE1234', 'firmware': '7.14', 'version': '7.14.3'},
}


def _poll(uptime, in1, out1, oper2=1, cpu=12):
    return {'uptime': uptime, 'hc': True, 'cpu': cpu, 'cpu_cores': 72,
            'ports': {1: {'admin': 1, 'oper': 1, 'in64': in1, 'out64': out1, 'in_err': 0, 'out_err': 0},
                      2: {'admin': 1, 'oper': oper2, 'in64': 0, 'out64': 0, 'in_err': 5, 'out_err': 0}},
            'storage': {'65536': {'2': '1.3.6.1.2.1.25.2.1.2', '3': b'main memory', '4': 1024, '5': 1000, '6': 250}},
            'sensors': [{'kind': 'temperature', 'key': 'mtg.17', 'name': 'cpu-temperature', 'value': 48.0, 'unit': 'C'}]}


def test_identify():
    assert sm.identify('RouterOS RB4011iGS+', '1.3.6.1.4.1.14988.1')[:3] == ('MikroTik', 'routeros', 'RB4011iGS+')
    assert sm.identify('Linux nms 6.1.0-18-amd64 #1 SMP', '1.3.6.1.4.1.8072.3.2.10')[1] == 'linux'
    assert sm.identify('Cisco IOS Software, Version 15.2(4)E10', '1.3.6.1.4.1.9.1.1')[3] == '15.2(4)E10'
    assert sm.identify('', '')[0] == 'Generic'


def test_discovery_poll_rates_reboot_events(ctx):
    d = SnmpDevice(name='Core', host='10.0.0.1', snmp_version='2c')
    d.community = SECRET
    db.session.add(d); db.session.commit()
    sm.apply_discovery(d, DISC); db.session.commit()
    assert d.vendor == 'MikroTik' and d.hardware == 'CCR1072-1G-8S+' and d.os_version == '7.14.3' and d.serial == 'HE1234'
    up = SnmpPort.query.filter_by(device_id=d.id, if_index=1).first()
    assert up.alias == 'UPLINK-ISP' and up.speed_mbps == 10000 and up.mac == '00:0c:29:01:02:03'
    t0 = sm._now()
    sm.apply_poll(d, _poll(1_000_000, 10_000, 20_000), t0); sm.set_status(d, 'up', '', t0); db.session.commit()
    t1 = t0 + timedelta(seconds=300)
    # +375 MB masuk dalam 300 dtk = 10 Mbps
    sm.apply_poll(d, _poll(1_030_000, 10_000 + 375_000_000, 20_000 + 750_000_000, oper2=2), t1); db.session.commit()
    up = SnmpPort.query.filter_by(device_id=d.id, if_index=1).first()
    assert abs(up.in_bps - 10_000_000) < 1 and abs(up.out_bps - 20_000_000) < 1
    e2 = SnmpPort.query.filter_by(device_id=d.id, if_index=2).first()
    assert e2.oper_status == 'down'
    assert SnmpEvent.query.filter_by(device_id=d.id, kind='port_down').count() == 1
    assert d.cpu_pct == 12 and d.mem_pct == 25.0 and d.temperature == 48.0
    assert SnmpSensor.query.filter_by(device_id=d.id, kind='memory').count() == 1
    # reboot: uptime turun → event, laju tidak dihitung dari counter yang ter-reset
    t2 = t1 + timedelta(seconds=300)
    sm.apply_poll(d, _poll(500, 100, 100), t2); db.session.commit()
    assert SnmpEvent.query.filter_by(device_id=d.id, kind='reboot').count() == 1
    # status turun/naik tercatat
    sm.set_status(d, 'down', 'timeout'); sm.set_status(d, 'up'); db.session.commit()
    kinds = [e.kind for e in SnmpEvent.query.filter_by(device_id=d.id).all()]
    assert 'device_down' in kinds and 'device_up' in kinds


def test_32bit_counter_wrap():
    assert sm._rate(100, 2 ** 32 - 100, 10, False) == 20.0
    assert sm._rate(100, 2 ** 40, 10, True) is None


def test_poll_all_marks_down_or_warn(ctx, monkeypatch):
    d = SnmpDevice(name='SW', host='10.0.0.9', snmp_version='2c', discovered_at=sm._now())
    d.community = SECRET
    db.session.add(d); db.session.commit()
    monkeypatch.setattr(sm, 'collect_poll', lambda p, m=False: (_ for _ in ()).throw(RuntimeError('No SNMP response received before timeout')))
    monkeypatch.setattr(sm, 'ping', lambda h: None)
    sm.poll_all([d])
    assert d.status == 'down' and 'timeout' in d.status_reason
    monkeypatch.setattr(sm, 'ping', lambda h: {'received': 2, 'avg_rtt_ms': 1.2})
    sm.poll_all([d])
    assert d.status == 'warn'


def test_api_crud_test_and_secret_not_leaked(ctx, monkeypatch):
    monkeypatch.setattr('routes_snmp._kick', lambda *a, **k: None)
    monkeypatch.setattr(sm, 'test_connection', lambda p: {'ok': True, 'sys_name': 'x', 'vendor': 'MikroTik', 'ms': 5}
                        if p['community'] == SECRET else {'ok': False, 'error': 'timeout'})
    c = _client()
    assert c.post('/api/snmp/devices', headers=H, json={'name': 'A', 'host': '10.1.1.1'}).status_code == 400  # tanpa community
    r = c.post('/api/snmp/devices', headers=H, json={'name': 'A', 'host': '10.1.1.1', 'community': SECRET}).get_json()
    # Community v1/v2c ditampilkan ke pengelola perangkat (super admin di sini); v3 tidak pernah
    assert r['success'] and r['device']['has_community'] and r['device']['community'] == SECRET
    did = r['device']['id']
    assert db.session.get(SnmpDevice, did)._community_enc != SECRET  # terenkripsi
    assert c.post('/api/snmp/test', headers=H, json={'device_id': did}).get_json()['ok'] is True
    assert c.post('/api/snmp/test', headers=H, json={'host': '10.1.1.2', 'community': 'salah'}).get_json()['ok'] is False
    v3 = c.post('/api/snmp/devices', headers=H, json={'name': 'B', 'host': '10.1.1.3', 'snmp_version': '3', 'v3_user': 'nms',
                                                     'v3_auth_pass': 'pendek'})
    assert v3.status_code == 400
    lst = c.get('/api/snmp/devices', headers=H).get_json()
    assert lst['devices'][0]['name'] == 'A' and 'summary' in lst
    assert c.put(f'/api/snmp/devices/{did}', headers=H, json={'location': 'POP 2'}).get_json()['device']['location'] == 'POP 2'
    det = c.get(f'/api/snmp/devices/{did}', headers=H).get_json()
    assert det['ports'] == [] and det['events'] == []
    assert c.delete(f'/api/snmp/devices/{did}', headers=H).get_json()['success']


def test_down_alert_and_recovery(ctx):
    from integration_health import check_snmp_devices
    d = SnmpDevice(name='POP-2', host='10.2.0.1', snmp_version='2c', status='down',
                   status_changed_at=sm._now() - timedelta(minutes=10), status_reason='timeout')
    d.community = SECRET
    db.session.add(d); db.session.commit()
    notifs, alerts = [], []
    check_snmp_devices(sm._now(), notifs, alerts)
    assert len(notifs) == 1 and alerts[0]['type'] == 'snmp_down'
    db.session.add(Notification(title='x', message='x', category='snmp_down', severity='critical',
                                target_type='snmp', target_id=d.id, resolved=False))
    d.status = 'up'; db.session.commit()
    notifs, alerts = [], []
    check_snmp_devices(sm._now(), notifs, alerts)
    assert alerts and alerts[0]['type'] == 'snmp_down_recovery'


def test_samples_hourly_graph_and_prune(ctx):
    from models import SnmpSample, SnmpSampleHourly
    d = SnmpDevice(name='G', host='10.3.0.1', snmp_version='2c')
    d.community = SECRET
    db.session.add(d); db.session.commit()
    sm.apply_discovery(d, DISC); db.session.commit()
    base = sm._now().replace(minute=0, second=0, microsecond=0) - timedelta(hours=3)
    # 3 jam × 12 poll; uplink naik 1 Mbps/5 menit (counter disesuaikan)
    octets = 0
    for i in range(36):
        ts = base + timedelta(minutes=5 * i)
        octets += int((i + 1) * 1_000_000 / 8 * 300)
        sm.apply_poll(d, _poll(1_000_000 + i * 300 * 100, octets, octets // 2), ts)
        db.session.commit()
    port = SnmpPort.query.filter_by(device_id=d.id, if_index=1).first()
    assert SnmpSample.query.filter_by(port_id=port.id, metric='in').count() == 35  # poll pertama belum punya laju
    hrs = SnmpSampleHourly.query.filter_by(port_id=port.id, metric='in').all()
    assert len(hrs) == 3 and sum(h.count for h in hrs) == 35
    c = _client()
    g = c.get(f'/api/snmp/graph?device_id={d.id}&port_id={port.id}&metrics=in,out&range=24h', headers=H).get_json()
    assert g['source'] == 'raw' and len(g['series']['in']) == 35
    st = g['stats']['in']
    assert abs(st['max'] - 36_000_000) < 1 and st['p95'] <= st['max'] and st['current'] == st['max']
    g7 = c.get(f'/api/snmp/graph?device_id={d.id}&port_id={port.id}&metrics=in&range=7d', headers=H).get_json()
    assert g7['source'] == 'hourly' and len(g7['series']['in']) == 3 and abs(g7['stats']['in']['max'] - 36_000_000) < 1
    gd = c.get(f'/api/snmp/graph?device_id={d.id}&metrics=cpu:cpu,temperature:mtg.17&range=24h', headers=H).get_json()
    assert len(gd['series']['cpu:cpu']) == 36 and gd['stats']['temperature:mtg.17']['current'] == 48.0
    assert c.get(f'/api/snmp/graph?device_id={d.id}&metrics=in&range=2y', headers=H).status_code == 400
    ms = c.get(f'/api/snmp/devices/{d.id}/metrics', headers=H).get_json()['metrics']
    assert {'metric': 'temperature:mtg.17', 'name': 'cpu-temperature'} in ms
    # prune: sampel mentah > 48 jam dibuang, ringkasan jam tetap
    db.session.add(SnmpSample(device_id=d.id, port_id=port.id, metric='in', ts=sm._now() - timedelta(hours=60), value=1))
    db.session.commit()
    sm.prune_events()
    assert SnmpSample.query.filter(SnmpSample.ts < sm._now() - timedelta(hours=48)).count() == 0
    assert SnmpSampleHourly.query.filter_by(port_id=port.id, metric='in').count() == 3
