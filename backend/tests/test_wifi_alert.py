"""Alert sinyal wireless lemah (satu alert per perangkat, ambang bawaan −80 dBm)."""
from datetime import datetime, timezone

import snmp_alerts
from app import db
from models import SnmpDevice, SnmpWifiClient, SystemConfig
from tests.test_link_state import ctx  # noqa: F401


def _dev(now):
    db.session.add(SystemConfig(key='snmp_hold_minutes', value='0'))
    d = SnmpDevice(name='AP-W', host='10.9.9.1', snmp_version='2c', status='up', enabled=True,
                   tables_at=now.replace(tzinfo=None))
    db.session.add(d); db.session.flush()
    for mac, sig in (('aa:00:00:00:00:01', -84), ('aa:00:00:00:00:02', -60), ('aa:00:00:00:00:03', -80)):
        db.session.add(SnmpWifiClient(device_id=d.id, if_index=3, mac=mac, signal=sig))
    db.session.commit()
    return d


def test_alert_klien_lemah_dan_pulih(ctx):
    now = datetime.now(timezone.utc)
    d = _dev(now)
    notifs, alerts = [], []
    snmp_alerts.check_snmp_thresholds(now, notifs, alerts)
    w = [a for a in alerts if a['type'] == 'snmp_wifi']
    assert len(w) == 1 and '1 klien' in w[0]['title'] and 'aa:00:00:00:00:01' in w[0]['message']   # −80 tepat tidak dihitung
    SnmpWifiClient.query.filter_by(device_id=d.id).delete()
    db.session.commit()
    notifs2, alerts2 = [], []
    snmp_alerts.check_snmp_thresholds(now, notifs2, alerts2)
    assert not [a for a in alerts2 if a['type'] == 'snmp_wifi' and a.get('severity') == 'warning' and 'lemah' in a['title']]


def test_data_basi_tidak_dinilai(ctx):
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    d = _dev(now)
    d.tables_at = (now - timedelta(hours=5)).replace(tzinfo=None)
    db.session.commit()
    alerts = []
    snmp_alerts.check_snmp_thresholds(now, [], alerts)
    assert not [a for a in alerts if a['type'] == 'snmp_wifi']
