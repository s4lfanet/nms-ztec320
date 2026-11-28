"""Sesi routing BGP/OSPF: parse state + alert saat sesi tidak established/full."""
from datetime import datetime, timezone

import snmp_alerts
import snmp_routing as sr
from app import db
from models import SnmpDevice, SnmpSensor, SystemConfig
from tests.test_link_state import ctx  # noqa: F401


def test_parse_bgp_ospf():
    out = sr.parse({'10.0.0.2': 6, '10.0.0.6': 3, 'x': 6}, {'10.0.0.2': 65001, '10.0.0.6': 65002},
                   {'10.1.1.1.0': 8, '10.1.1.2.0': 3})
    by = {s['key']: s for s in out}
    assert by['bgp.10.0.0.2']['value'] == 1 and by['bgp.10.0.0.2']['unit'] == 'estab' and by['bgp.10.0.0.2']['name'] == 'BGP 10.0.0.2 (AS65001)'
    assert by['bgp.10.0.0.6']['value'] == 0 and by['bgp.10.0.0.6']['unit'] == 'active'
    assert by['ospf.10.1.1.1.0']['value'] == 1 and by['ospf.10.1.1.2.0']['unit'] == 'init'
    assert len(out) == 4 and sr.parse({}, {}, {}) == []


def test_sesi_turun_memicu_alert(ctx):
    db.session.add(SystemConfig(key='snmp_hold_minutes', value='0'))
    d = SnmpDevice(name='CCR-BGP', host='10.6.7.1', snmp_version='2c', status='up', enabled=True)
    db.session.add(d); db.session.flush()
    now = datetime.now(timezone.utc)
    n = now.replace(tzinfo=None)
    db.session.add(SnmpSensor(device_id=d.id, kind='routing', key='bgp.10.0.0.6', name='BGP 10.0.0.6 (AS65002)', value=0, unit='active', updated_at=n))
    db.session.add(SnmpSensor(device_id=d.id, kind='routing', key='bgp.10.0.0.2', name='BGP 10.0.0.2 (AS65001)', value=1, unit='estab', updated_at=n))
    db.session.commit()
    notifs, alerts = [], []
    snmp_alerts.check_snmp_thresholds(now, notifs, alerts)
    rt = [a for a in alerts if a['type'] == 'snmp_routing']
    assert len(rt) == 1 and '10.0.0.6' in rt[0]['title'] and rt[0]['severity'] == 'critical'
