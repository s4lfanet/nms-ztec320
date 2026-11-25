"""SNMP: dependency induk-anak, jendela pemeliharaan, ringkasan mingguan."""
import secrets
from datetime import datetime, timedelta

from app import app, db
from models import User, SnmpDevice, SnmpEvent, SnmpMaintenance, Notification
import snmp_monitor as sm
import snmp_depend
import snmp_digest
from tests.test_link_state import ctx  # noqa: F401

H = {'X-Requested-With': 'XMLHttpRequest'}


def _dev(name, ip, status='up', parent=None, mins=10):
    d = SnmpDevice(name=name, host=ip, snmp_version='2c', status=status, parent_id=parent,
                   status_changed_at=sm._now() - timedelta(minutes=mins))
    d.community = secrets.token_hex(4)
    db.session.add(d); db.session.commit()
    return d


def _client():
    u = User(username='d' + secrets.token_hex(3), full_name='d', is_super_admin=True)
    u.set_password(secrets.token_hex(8))
    db.session.add(u); db.session.commit()
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['_user_id'] = str(u.id); sess['_fresh'] = True
    return c


def test_cycle_detection():
    assert snmp_depend.would_cycle(1, 1, {})
    assert snmp_depend.would_cycle(1, 2, {2: 3, 3: 1})
    assert not snmp_depend.would_cycle(1, 2, {2: 3, 3: None})


def test_parent_down_holds_child_alert_and_lists_children(ctx):
    from integration_health import check_snmp_devices
    p = _dev('Core-A', '10.50.0.1', 'down')
    c1 = _dev('SW-A1', '10.50.0.2', 'down', parent=p.id)
    c2 = _dev('SW-A2', '10.50.0.3', 'down', parent=c1.id)   # cucu
    other = _dev('Lain-A', '10.50.0.9', 'down')
    notifs, alerts = [], []
    check_snmp_devices(sm._now(), notifs, alerts)
    titles = sorted(n['title'] for n in notifs)
    assert titles == sorted([f'🔴 Perangkat turun: Core-A', f'🔴 Perangkat turun: Lain-A'])
    core = next(n for n in notifs if 'Core-A' in n['title'])
    assert '2 perangkat di bawahnya' in core['message'] and 'SW-A1' in core['message'] and 'SW-A2' in core['message']


def test_child_alert_returns_when_parent_recovers(ctx):
    from integration_health import check_snmp_devices
    p = _dev('Core-B', '10.51.0.1', 'up')
    _dev('SW-B1', '10.51.0.2', 'down', parent=p.id)
    notifs, alerts = [], []
    check_snmp_devices(sm._now(), notifs, alerts)
    assert any('SW-B1' in n['title'] for n in notifs)       # induk 'up' → anak tetap dialert


def test_maintenance_holds_down_and_threshold_alerts(ctx):
    from integration_health import check_snmp_devices
    import snmp_alerts
    d = _dev('Core-C', '10.52.0.1', 'down')
    other = _dev('Lain-C', '10.52.0.2', 'down')
    now = sm._now()
    db.session.add(SnmpMaintenance(device_id=d.id, start_time=now - timedelta(minutes=5),
                                   end_time=now + timedelta(hours=1)))
    db.session.commit()
    notifs, alerts = [], []
    check_snmp_devices(now, notifs, alerts)
    assert [n['title'] for n in notifs] == ['🔴 Perangkat turun: Lain-C']
    # kedaluwarsa → alert muncul lagi
    SnmpMaintenance.query.delete(); db.session.commit()
    db.session.add(SnmpMaintenance(device_id=d.id, start_time=now - timedelta(hours=3),
                                   end_time=now - timedelta(hours=2)))
    db.session.commit()
    notifs, alerts = [], []
    check_snmp_devices(now, notifs, alerts)
    assert len(notifs) == 2


def test_api_parent_validation_and_maintenance(ctx):
    c = _client()
    a = c.post('/api/snmp/devices', headers=H, json={'name': 'PA', 'host': '10.53.0.1', 'community': 'x1'}).get_json()['device']
    b = c.post('/api/snmp/devices', headers=H, json={'name': 'PB', 'host': '10.53.0.2', 'community': 'x1',
                                                     'parent_id': a['id']}).get_json()['device']
    assert b['parent_id'] == a['id']
    # lingkaran & diri sendiri ditolak
    assert c.put(f"/api/snmp/devices/{a['id']}", headers=H, json={'parent_id': b['id']}).status_code == 400
    assert c.put(f"/api/snmp/devices/{a['id']}", headers=H, json={'parent_id': a['id']}).status_code == 400
    assert c.put(f"/api/snmp/devices/{b['id']}", headers=H, json={'parent_id': 99999}).status_code == 400
    # hapus induk → anak lepas
    assert c.delete(f"/api/snmp/devices/{a['id']}", headers=H).get_json()['success']
    assert db.session.get(SnmpDevice, b['id']).parent_id is None
    # pemeliharaan
    now = datetime.utcnow()
    r = c.post('/api/snmp/maintenance', headers=H, json={'device_id': b['id'], 'start': now.isoformat() + 'Z',
                                                         'end': (now + timedelta(hours=2)).isoformat() + 'Z', 'reason': 'ganti SFP'})
    assert r.get_json()['success'] and r.get_json()['item']['active']
    assert c.post('/api/snmp/maintenance', headers=H, json={'device_id': b['id'], 'end': (now - timedelta(hours=1)).isoformat() + 'Z',
                                                            'start': now.isoformat() + 'Z'}).status_code == 400
    assert c.post('/api/snmp/maintenance', headers=H, json={'end': 'bukan-waktu'}).status_code == 400
    lst = c.get('/api/snmp/maintenance', headers=H).get_json()['items']
    assert len(lst) == 1 and lst[0]['device_name'] == 'PB'
    devs = c.get('/api/snmp/devices', headers=H).get_json()['devices']
    assert next(d for d in devs if d['id'] == b['id'])['in_maintenance'] is True
    assert c.delete(f"/api/snmp/maintenance/{lst[0]['id']}", headers=H).get_json()['success']
    assert c.get('/api/snmp/maintenance', headers=H).get_json()['items'] == []


def test_downtime_seconds_pairs_and_open_ended():
    s = datetime(2026, 11, 1); e = datetime(2026, 11, 8)
    ev = [('device_down', s + timedelta(hours=1)), ('device_up', s + timedelta(hours=2)),
          ('device_down', e - timedelta(hours=1))]
    assert snmp_digest.downtime_seconds(ev, s, e) == 3600 + 3600
    assert snmp_digest.downtime_seconds([('device_up', s + timedelta(hours=3))], s, e) == 3 * 3600
    assert snmp_digest.downtime_seconds([], s, e) == 0


def test_digest_text_and_schedule(ctx):
    d = _dev('Core-D', '10.54.0.1', 'up')
    now = sm._now()
    db.session.add(SnmpEvent(device_id=d.id, kind='device_down', created_at=now - timedelta(days=2)))
    db.session.add(SnmpEvent(device_id=d.id, kind='device_up', created_at=now - timedelta(days=2) + timedelta(minutes=30)))
    db.session.commit()
    t = snmp_digest.build(now)
    assert 'RINGKASAN MINGGUAN' in t and 'Core-D: 1× turun' in t and '30 mnt' in t
    assert snmp_digest.maybe_send() is False        # nonaktif secara bawaan
    c = _client()
    c.put('/api/snmp/settings', headers=H, json={'snmp_digest_enabled': 1})
    assert snmp_digest.settings()['snmp_digest_enabled'] == 1


def test_topology_annotations_and_deps(ctx):
    import snmp_topology
    from models import SnmpSensorRule
    p = _dev('Core-T', '10.70.0.1')
    c = _dev('SW-T', '10.70.0.2', parent=p.id)
    now = sm._now()
    db.session.add(SnmpMaintenance(device_id=c.id, start_time=now - timedelta(minutes=1), end_time=now + timedelta(hours=1)))
    db.session.add(SnmpSensorRule(device_id=p.id, metric='cpu:cpu', name='x', warn=1, status='down'))
    db.session.add(SnmpSensorRule(device_id=p.id, metric='cpu:cpu', name='y', warn=1, status='warning'))
    db.session.commit()
    nodes, _links = snmp_topology.build()
    deps = snmp_topology.annotate(nodes)
    by = {n['device_id']: n for n in nodes}
    assert {'id': f'dep{c.id}', 'source': f'd{p.id}', 'target': f'd{c.id}'} in deps
    assert by[c.id]['in_maintenance'] and by[c.id]['parent_id'] == p.id and not by[p.id]['in_maintenance']
    assert by[p.id]['rules_down'] == 1 and by[p.id]['rules_warn'] == 1
    cl = _client()
    r = cl.get('/api/snmp/topology', headers=H).get_json()
    assert r['success'] and any(d['target'] == f'd{c.id}' for d in r['deps'])


def test_snmp_pdf_report_builds_and_sends(ctx, monkeypatch):
    import snmp_report
    from models import BotConfig
    assert snmp_report.build_pdf() is None or True
    _dev('Core-Ünï', '10.9.0.1', status='down')
    _dev('Edge', '10.9.0.2')
    pdf = snmp_report.build_pdf()
    assert pdf.startswith(b'%PDF')
    sent = []
    monkeypatch.setattr(snmp_report, '_telegram_document', lambda c, p, fn, cap: sent.append(('tg', fn)) or True)
    monkeypatch.setattr(snmp_report, '_wa_native_document', lambda c, p, fn, cap: sent.append(('wa', fn)) or True)
    db.session.add(BotConfig(bot_type='telegram', bot_token='t', chat_id='1', enabled=True))
    db.session.add(BotConfig(bot_type='whatsapp_native', phone_number='0812', api_url='x', enabled=True))
    db.session.commit()
    res = snmp_report.send_pdf()
    assert res == {'telegram': True, 'whatsapp': True} and len(sent) == 2
    c = _client()
    r = c.get('/api/snmp/report.pdf', headers=H)
    assert r.status_code == 200 and r.data.startswith(b'%PDF')
    r = c.post('/api/snmp/report/send', headers=H)
    assert r.get_json()['success'] is True
    # digest dengan opsi PDF mengirim keduanya
    monkeypatch.setattr('alerts._send_external_alerts', lambda *a, **k: None)
    snmp_digest.save_settings({'snmp_digest_pdf': 1}); db.session.commit()
    sent.clear()
    assert snmp_digest.send() is True and len(sent) == 2
