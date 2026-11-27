"""Deteksi anomali Trafik Aplikasi."""
from datetime import datetime, timedelta, timezone

import flow_anomaly as fa
from app import db
from models import FlowClientHour, SystemConfig
from tests.test_link_state import ctx  # noqa: F401


def _add(ip, hour, up, down=0, exp='10.8.0.1'):
    db.session.add(FlowClientHour(ts=hour, exporter=exp, client_ip=ip, service='Google', down_bytes=down, up_bytes=up))


def test_anomaly_detected_and_filtered(ctx):
    now = datetime.now(timezone.utc)
    hour = now.replace(minute=0, second=0, microsecond=0, tzinfo=None)
    for h in range(1, 9):                       # riwayat 8 jam: ±100 MB unggah/jam
        _add('10.0.0.5', hour - timedelta(hours=h), 100_000_000)
        _add('10.0.0.6', hour - timedelta(hours=h), 100_000_000)
    _add('10.0.0.5', hour, 3_000_000_000)       # melonjak 30× dan > 2 GB → anomali
    _add('10.0.0.6', hour, 300_000_000)         # naik 3× tapi di bawah batas volume → aman
    _add('10.0.0.9', hour, 5_000_000_000)       # pelanggan baru tanpa riwayat → tidak dinilai
    db.session.commit()
    notifs, alerts = [], []
    fa.check_flow_anomalies(now, notifs, alerts)
    assert len(alerts) == 1 and '10.0.0.5' in alerts[0]['title'] and alerts[0]['type'] == 'flow_anomaly'
    assert 'unggah' in alerts[0]['title'] and notifs[0]['category'] == 'flow_anomaly'


def test_disabled(ctx):
    now = datetime.now(timezone.utc)
    hour = now.replace(minute=0, second=0, microsecond=0, tzinfo=None)
    for h in range(1, 9):
        _add('10.0.1.5', hour - timedelta(hours=h), 100_000_000, 100_000_000)
    _add('10.0.1.5', hour, 9_000_000_000, 9_000_000_000)
    db.session.add(SystemConfig(key='flow_anomaly_enabled', value='0'))
    db.session.commit()
    notifs, alerts = [], []
    fa.check_flow_anomalies(now, notifs, alerts)
    assert alerts == []
