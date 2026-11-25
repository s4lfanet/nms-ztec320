"""Pengaturan Monitoring SNMP: interval, timeout/retry, retensi, community bawaan."""
import secrets
from datetime import timedelta

from app import db
from models import SystemConfig, SnmpDevice, SnmpEvent, SnmpSample
import snmp_monitor as sm
from tests.test_link_state import ctx  # noqa: F401
from tests.test_viewer_permissions import _user, _client

H = {'X-Requested-With': 'XMLHttpRequest'}


def test_general_settings_clamped_and_applied(ctx):
    admin = _client(_user('view_dashboard', super_admin=True))
    r = admin.put('/api/snmp/settings', json={
        'snmp_poll_interval': 10, 'snmp_timeout': 99, 'snmp_retries': 2,
        'snmp_raw_hours': 6, 'snmp_event_days': 30, 'snmp_util_threshold': 80}, headers=H).get_json()
    g = r['general']
    assert g['snmp_poll_interval'] == 60          # dijepit ke minimum
    assert g['snmp_timeout'] == 15                # dijepit ke maksimum
    assert g['snmp_raw_hours'] == 24              # grafik 24 jam butuh data mentah 24 jam
    assert g['snmp_event_days'] == 30 and g['snmp_retries'] == 2
    assert r['settings']['snmp_util_threshold'] == 80  # ambang alert tetap tersimpan lewat endpoint yang sama
    assert sm._RUNTIME == {'timeout': 15, 'retries': 2}


def test_default_community_secret_only_for_managers(ctx):
    comm = secrets.token_hex(5)
    admin = _client(_user('view_dashboard', super_admin=True))
    admin.put('/api/snmp/settings', json={'snmp_default_version': '1', 'snmp_default_community': comm}, headers=H)
    row = SystemConfig.query.filter_by(key='snmp_default_community').first()
    assert row.value and comm not in row.value     # tersimpan terenkripsi
    nd = admin.get('/api/snmp/settings', headers=H).get_json()['new_device']
    assert nd == {'snmp_version': '1', 'has_community': True, 'community': comm}

    viewer = _client(_user('view_dashboard'))
    body = viewer.get('/api/snmp/settings', headers=H).get_json()
    assert 'community' not in body['new_device'] and body['new_device']['has_community'] is True
    assert body['volume'] is None
    assert viewer.put('/api/snmp/settings', json={'snmp_timeout': 5}, headers=H).status_code == 403


def test_prune_uses_retention_settings(ctx):
    now = sm._now()
    d = SnmpDevice(name='R', host='10.9.9.9', snmp_version='2c')
    db.session.add(d); db.session.commit()
    db.session.add_all([
        SnmpEvent(device_id=d.id, kind='x', message='old', created_at=now - timedelta(days=20)),
        SnmpEvent(device_id=d.id, kind='x', message='new', created_at=now - timedelta(days=5)),
        SnmpSample(device_id=d.id, metric='cpu:cpu', value=1, ts=now - timedelta(hours=30)),
        SnmpSample(device_id=d.id, metric='cpu:cpu', value=1, ts=now - timedelta(hours=1)),
    ])
    db.session.commit()
    sm.save_general({'snmp_event_days': 7, 'snmp_raw_hours': 24})
    db.session.commit()
    sm.prune_events()
    assert [e.message for e in SnmpEvent.query.filter_by(device_id=d.id)] == ['new']
    assert SnmpSample.query.filter_by(device_id=d.id).count() == 1


def test_last_cycle_round_trip(ctx):
    now = sm._now()
    sm.LAST_CYCLE.update(at=now, secs=4.2, devices=3, failed=1)
    sm._save_last_cycle()
    lc = sm.last_cycle()
    assert lc['secs'] == 4.2 and lc['devices'] == 3 and lc['failed'] == 1 and lc['at'] == now
