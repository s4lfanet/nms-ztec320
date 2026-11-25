"""Sensor kustom bergaya PRTG: ambang bertingkat OK/Warning/Down."""
import secrets
from datetime import timedelta

from app import app, db
from models import User, SnmpDevice, SnmpPort, SnmpSensor, SnmpSample, SnmpSensorRule, SnmpMaintenance, Notification
import snmp_monitor as sm
import snmp_rules
from snmp_alerts import check_snmp_thresholds
from tests.test_link_state import ctx  # noqa: F401

H = {'X-Requested-With': 'XMLHttpRequest'}


def _client():
    u = User(username='r' + secrets.token_hex(3), full_name='r', is_super_admin=True)
    u.set_password(secrets.token_hex(8))
    db.session.add(u); db.session.commit()
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['_user_id'] = str(u.id); sess['_fresh'] = True
    return c


def _dev(ip):
    d = SnmpDevice(name='R-' + ip, host=ip, snmp_version='2c', status='up', status_changed_at=sm._now())
    d.community = secrets.token_hex(4)
    db.session.add(d); db.session.commit()
    return d


def _samples(dev, metric, values, port_id=None, step=5):
    now = sm._now()
    for i, v in enumerate(reversed(values)):   # values[0] = terbaru
        db.session.add(SnmpSample(device_id=dev.id, port_id=port_id, metric=metric,
                                  ts=now - timedelta(minutes=i * step), value=v))
    db.session.commit()


def test_level_for_gt_and_lt():
    assert snmp_rules.level_for([90, 95, 99], 'gt', 80, 98) == 'warning'
    assert snmp_rules.level_for([99, 99, 99], 'gt', 80, 98) == 'down'
    assert snmp_rules.level_for([99, 10, 99], 'gt', 80, 98) == 'ok'          # satu sampel normal → bukan terus-menerus
    assert snmp_rules.level_for([10, 5], 'lt', 20, 8) == 'warning'           # trafik di bawah ambang
    assert snmp_rules.level_for([2, 5], 'lt', 20, 8) == 'down'
    assert snmp_rules.level_for([], 'gt', 1, 2) == 'ok'
    assert snmp_rules.needed_samples(10) == 2 and snmp_rules.needed_samples(30) == 5 and snmp_rules.needed_samples(1) == 1


def test_validation(ctx):
    d = _dev('10.60.0.1')
    db.session.add(SnmpSensor(device_id=d.id, kind='cpu', key='cpu', name='CPU', unit='%'))
    p = SnmpPort(device_id=d.id, if_index=1, name='ether1'); db.session.add(p); db.session.commit()
    ok, err = snmp_rules.validate(d.id, {'metric': 'cpu:cpu', 'warn': 70, 'crit': 90, 'minutes': 10})
    assert not err and ok['crit'] == 90
    assert snmp_rules.validate(d.id, {'metric': 'cpu:cpu', 'warn': 90, 'crit': 70})[1]            # Down lebih ringan dari Warning
    assert snmp_rules.validate(d.id, {'metric': 'cpu:cpu'})[1]                                     # tanpa ambang
    assert snmp_rules.validate(d.id, {'metric': 'nope:x', 'warn': 1})[1]                           # sensor tak ada
    assert snmp_rules.validate(d.id, {'metric': 'in', 'port_id': p.id, 'warn': 5e8, 'minutes': 5})[1] is None
    assert snmp_rules.validate(d.id, {'metric': 'cpu:cpu', 'port_id': p.id, 'warn': 1})[1]         # metrik port salah
    assert snmp_rules.validate(d.id, {'metric': 'cpu:cpu', 'warn': 1, 'minutes': 0})[1]
    assert snmp_rules.validate(d.id, {'metric': 'cpu:cpu', 'warn': 1, 'op': 'xx'})[1]


def test_escalation_alerts_and_recovery(ctx):
    d = _dev('10.61.0.1')
    r = SnmpSensorRule(device_id=d.id, metric='cpu:cpu', name='CPU core', op='gt', warn=70, crit=90, minutes=10)
    db.session.add(r); db.session.commit()
    now = sm._now()
    # Warning
    _samples(d, 'cpu:cpu', [75, 80, 78])
    notifs, alerts = [], []
    check_snmp_thresholds(now, notifs, alerts); db.session.commit()
    assert [n['severity'] for n in notifs] == ['warning'] and 'WARNING' in notifs[0]['title']
    assert db.session.get(SnmpSensorRule, r.id).status == 'warning'
    for n in notifs:
        db.session.add(Notification(title=n['title'], message=n['message'], category=n['category'], severity=n['severity'],
                                    target_type=n['target_type'], target_id=n['target_id'], resolved=False))
    db.session.commit()
    # Eskalasi ke Down: warning ditutup TANPA pesan "pulih", alert Down baru
    SnmpSample.query.delete(); db.session.commit()
    _samples(d, 'cpu:cpu', [95, 96, 97])
    notifs, alerts = [], []
    check_snmp_thresholds(now, notifs, alerts); db.session.commit()
    notifs = [n for n in notifs if n['category'] == 'snmp_rule']   # alert CPU bawaan (>85%) terpisah
    assert [n['severity'] for n in notifs] == ['critical']
    assert not any(a.get('is_recovery') and a['type'].startswith('snmp_rule') for a in alerts)
    assert db.session.get(SnmpSensorRule, r.id).status == 'down'
    for n in notifs:
        db.session.add(Notification(title=n['title'], message=n['message'], category=n['category'], severity=n['severity'],
                                    target_type=n['target_type'], target_id=n['target_id'], resolved=False))
    db.session.commit()
    # Pulih
    SnmpSample.query.delete(); db.session.commit()
    _samples(d, 'cpu:cpu', [10, 12, 11])
    notifs, alerts = [], []
    check_snmp_thresholds(now, notifs, alerts); db.session.commit()
    assert not [n for n in notifs if n['category'] == 'snmp_rule'] and any(a.get('is_recovery') and a['type'].startswith('snmp_rule') for a in alerts)
    assert db.session.get(SnmpSensorRule, r.id).status == 'ok'


def test_not_enough_data_keeps_status_and_maintenance_holds(ctx):
    d = _dev('10.62.0.1')
    r = SnmpSensorRule(device_id=d.id, metric='cpu:cpu', name='C', op='gt', warn=50, minutes=30)
    db.session.add(r); db.session.commit()
    now = sm._now()
    _samples(d, 'cpu:cpu', [99])                      # 30 mnt butuh ≥5 sampel
    notifs, alerts = [], []
    check_snmp_thresholds(now, notifs, alerts)
    assert not notifs and db.session.get(SnmpSensorRule, r.id).status == 'unknown'
    r.minutes = 5; db.session.commit()
    db.session.add(SnmpMaintenance(device_id=d.id, start_time=now - timedelta(minutes=1), end_time=now + timedelta(hours=1)))
    db.session.commit()
    check_snmp_thresholds(now, notifs, alerts)
    assert not notifs                                   # pemeliharaan menahan


def test_api_crud_and_delete_closes_alert(ctx):
    c = _client()
    d = _dev('10.63.0.1')
    db.session.add(SnmpSensor(device_id=d.id, kind='cpu', key='cpu', name='CPU', unit='%')); db.session.commit()
    r = c.post(f'/api/snmp/devices/{d.id}/rules', headers=H, json={'metric': 'cpu:cpu', 'name': 'CPU', 'warn': 70, 'crit': 90}).get_json()
    assert r['success'] and r['rule']['status'] == 'unknown'
    rid = r['rule']['id']
    assert c.post(f'/api/snmp/devices/{d.id}/rules', headers=H, json={'metric': 'zzz', 'warn': 1}).status_code == 400
    lst = c.get(f'/api/snmp/devices/{d.id}/rules', headers=H).get_json()
    assert len(lst['rules']) == 1 and lst['sensors'][0]['metric'] == 'cpu:cpu'
    assert c.put(f'/api/snmp/rules/{rid}', headers=H, json={'warn': 60}).get_json()['rule']['warn'] == 60
    db.session.add(Notification(title='x', message='x', category='snmp_rule', severity='warning',
                                target_type='snmp_rule_w', target_id=rid, resolved=False)); db.session.commit()
    assert c.delete(f'/api/snmp/rules/{rid}', headers=H).get_json()['success']
    check_snmp_thresholds(sm._now(), [], []); db.session.commit()
    assert Notification.query.filter_by(category='snmp_rule', resolved=False).count() == 0
