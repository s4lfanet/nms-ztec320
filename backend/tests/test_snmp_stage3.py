"""SNMP tahap 3: alert ambang batas (port dipantau, CPU, suhu), ringkasan, laporan bulanan."""
import secrets
from datetime import timedelta

from app import app, db
from models import User, SnmpDevice, SnmpPort, SnmpEvent, SnmpSample, SnmpSampleHourly, Notification
import snmp_monitor as sm
import snmp_alerts as sa
from routes_snmp import build_report
from tests.test_link_state import ctx  # noqa: F401

H = {'X-Requested-With': 'XMLHttpRequest'}


def _client():
    u = User(username='s' + secrets.token_hex(3), full_name='s', is_super_admin=True)
    u.set_password(secrets.token_hex(8))
    db.session.add(u); db.session.commit()
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['_user_id'] = str(u.id); sess['_fresh'] = True
    return c


def _setup(now):
    d = SnmpDevice(name='Core', host='10.0.0.1', snmp_version='2c', status='up', status_changed_at=now - timedelta(hours=5))
    d.community = secrets.token_hex(4)
    db.session.add(d); db.session.commit()
    up = SnmpPort(device_id=d.id, if_index=1, name='sfp1', alias='UPLINK', speed_mbps=1000, admin_status='up',
                  oper_status='up', watched=True)
    acc = SnmpPort(device_id=d.id, if_index=2, name='ether2', speed_mbps=1000, admin_status='up', oper_status='down',
                   status_changed_at=now - timedelta(hours=1))
    db.session.add_all([up, acc]); db.session.commit()
    return d, up, acc


def _run(now):
    notifs, alerts = [], []
    sa.check_snmp_thresholds(now, notifs, alerts)
    for n in notifs:
        db.session.add(Notification(**{k: v for k, v in n.items() if k != 'target_roles'}))
    db.session.commit()
    return notifs, alerts


def test_port_down_only_watched_and_recovery(ctx):
    now = sm._now()
    d, up, acc = _setup(now)
    notifs, _ = _run(now)
    assert notifs == []  # ether2 turun tapi tidak dipantau
    up.oper_status, up.status_changed_at = 'down', now - timedelta(minutes=10)
    db.session.commit()
    notifs, alerts = _run(now)
    assert [n['category'] for n in notifs] == ['snmp_port_down'] and notifs[0]['target_id'] == up.id
    assert _run(now)[0] == []  # dedupe
    up.oper_status = 'up'; db.session.commit()
    _, alerts = _run(now)
    assert alerts[0]['type'] == 'snmp_port_down_recovery'
    assert Notification.query.filter_by(category='snmp_port_down', resolved=False).count() == 0


def test_util_cpu_temp_flap_err_with_hysteresis(ctx):
    now = sm._now()
    d, up, _ = _setup(now)
    for i in range(3):
        ts = now - timedelta(minutes=5 * i)
        db.session.add(SnmpSample(device_id=d.id, port_id=up.id, metric='in', ts=ts, value=950e6))
        db.session.add(SnmpSample(device_id=d.id, port_id=None, metric='cpu:cpu', ts=ts, value=92))
        db.session.add(SnmpEvent(device_id=d.id, port_id=up.id, kind='port_down', created_at=ts))
        db.session.add(SnmpEvent(device_id=d.id, port_id=up.id, kind='port_down', created_at=ts - timedelta(minutes=1)))
    d.temperature = 75
    up.in_bps, up.in_err_rate = 950e6, 3.0
    db.session.commit()
    notifs, _ = _run(now)
    assert {n['category'] for n in notifs} == {'snmp_port_util', 'snmp_cpu', 'snmp_temp', 'snmp_port_flap', 'snmp_port_err'}
    # Sedikit di bawah batas → tetap aktif (histeresis)
    db.session.add(SnmpSample(device_id=d.id, port_id=up.id, metric='in', ts=now + timedelta(seconds=1), value=850e6))
    db.session.add(SnmpSample(device_id=d.id, port_id=None, metric='cpu:cpu', ts=now + timedelta(seconds=1), value=80))
    d.temperature = 68
    up.in_err_rate = 1.0
    db.session.commit()
    _, alerts = _run(now)
    assert alerts == []
    # Jauh di bawah → pulih
    db.session.add(SnmpSample(device_id=d.id, port_id=up.id, metric='in', ts=now + timedelta(seconds=2), value=100e6))
    db.session.add(SnmpSample(device_id=d.id, port_id=None, metric='cpu:cpu', ts=now + timedelta(seconds=2), value=20))
    d.temperature = 50
    up.in_err_rate = 0
    db.session.commit()
    _, alerts = _run(now)
    assert {a['type'] for a in alerts} == {'snmp_port_util_recovery', 'snmp_cpu_recovery', 'snmp_temp_recovery',
                                           'snmp_port_err_recovery'}


def test_unwatch_closes_alert_and_device_down_skips(ctx):
    now = sm._now()
    d, up, _ = _setup(now)
    d.temperature = 90
    up.oper_status, up.status_changed_at = 'down', now - timedelta(minutes=30)
    db.session.commit()
    assert len(_run(now)[0]) == 2
    d.status = 'down'; up.watched = False; db.session.commit()
    notifs, alerts = _run(now)
    assert notifs == [] and alerts == []
    assert Notification.query.filter_by(category='snmp_port_down', resolved=False).count() == 0
    assert Notification.query.filter_by(category='snmp_temp', resolved=False).count() == 1  # perangkat turun: biarkan


def test_settings_api_clamps(ctx):
    c = _client()
    r = c.put('/api/snmp/settings', json={'snmp_util_threshold': 250, 'snmp_cpu_cycles': 5, 'snmp_err_threshold': 0.5}, headers=H)
    s = r.get_json()['settings']
    assert s['snmp_util_threshold'] == 100 and s['snmp_cpu_cycles'] == 5 and s['snmp_err_threshold'] == 0.5


def test_summary_and_watch_toggle(ctx):
    now = sm._now()
    d, up, acc = _setup(now)
    up.in_bps, up.out_bps = 400e6, 100e6
    db.session.commit()
    c = _client()
    r = c.put(f'/api/snmp/ports/{acc.id}', json={'watched': True}, headers=H).get_json()
    assert r['port']['watched'] is True
    s = c.get('/api/snmp/summary', headers=H).get_json()
    assert s['counts']['up'] == 1
    assert s['top_ports'][0]['port_id'] == up.id and s['top_ports'][0]['util_pct'] == 40.0
    assert {p['port_id'] for p in s['watched_ports']} == {up.id, acc.id}


def test_monthly_report(ctx):
    now = sm._now()
    d, up, _ = _setup(now)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    for h in range(20):
        hour = month_start + timedelta(hours=h)
        if hour >= now:
            break
        v = 100e6 if h < 19 else 900e6
        db.session.add(SnmpSampleHourly(device_id=d.id, port_id=up.id, metric='in', hour=hour, total=v * 12, count=12, vmax=v * 1.1))
    db.session.add(SnmpEvent(device_id=d.id, kind='device_down', created_at=month_start + timedelta(minutes=1)))
    db.session.add(SnmpEvent(device_id=d.id, kind='device_up', created_at=month_start + timedelta(minutes=31)))
    db.session.commit()
    rep = build_report(month_start.strftime('%Y-%m'))
    row = rep['ports'][0]
    assert row['port_id'] == up.id and row['in']['max_bps'] >= 100e6 * 1.1
    if now - month_start > timedelta(hours=20):
        assert row['in']['p95_bps'] == 100e6 and round(row['in']['volume_bytes']) == round(19 * 100e6 * 450 + 900e6 * 450)
        assert row['peak_util_pct'] == 99.0
    dev = rep['devices'][0]
    if now - month_start > timedelta(minutes=31):
        assert dev['downtime_min'] == 30 and dev['availability_pct'] < 100
    c = _client()
    csv_r = c.get(f"/api/snmp/report?month={month_start.strftime('%Y-%m')}&format=csv", headers=H)
    assert csv_r.status_code == 200 and 'UPLINK' in csv_r.get_data(as_text=True)
    assert c.get('/api/snmp/report?month=bad', headers=H).status_code == 400
