"""Sensor status MikroTik (PSU/kipas): 1 = ok, 0 = gagal → alert kritis."""
from datetime import datetime, timezone

import snmp_alerts
from app import db
from models import SnmpDevice, SnmpSensor, SystemConfig
from tests.test_link_state import ctx  # noqa: F401


def test_psu_fail_memicu_alert_dan_ok_tidak(ctx):
    db.session.add(SystemConfig(key='snmp_hold_minutes', value='0'))
    d = SnmpDevice(name='CRS-PSU', host='10.6.6.1', snmp_version='2c', status='up', enabled=True)
    db.session.add(d); db.session.flush()
    now = datetime.now(timezone.utc)
    n = now.replace(tzinfo=None)
    db.session.add(SnmpSensor(device_id=d.id, kind='status', key='mtg.20', name='psu1-state', value=0, unit='', updated_at=n))
    db.session.add(SnmpSensor(device_id=d.id, kind='status', key='mtg.21', name='psu2-state', value=1, unit='', updated_at=n))
    db.session.commit()
    notifs, alerts = [], []
    snmp_alerts.check_snmp_thresholds(now, notifs, alerts)
    st = [a for a in alerts if a['type'] == 'snmp_status']
    assert len(st) == 1 and 'psu1-state' in st[0]['title'] and st[0]['severity'] == 'critical'
