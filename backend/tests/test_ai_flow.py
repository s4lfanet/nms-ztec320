"""AI agent bisa membaca data Trafik Aplikasi (NetFlow)."""
from datetime import datetime

import ai_agent
from app import app, db
from models import FlowBucket, FlowClientHour, SnmpDevice
from tests.test_link_state import ctx  # noqa: F401
from tests.test_alert_correlation import client  # noqa: F401


def test_ai_reads_traffic_flow(client):
    with app.app_context():
        dev = SnmpDevice(name='RB-AI', host='10.77.0.1', snmp_version='2c')
        db.session.add(dev)
        now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
        db.session.add(FlowBucket(ts=now, exporter='10.77.0.1', if_index=2, service='YouTube', down_bytes=5_000_000, up_bytes=10))
        db.session.add(FlowClientHour(ts=now, exporter='10.77.0.1', client_ip='10.7.7.7', service='YouTube',
                                      down_bytes=5_000_000, up_bytes=10))
        db.session.commit()
        r = ai_agent.run_tool('traffic_flow', {'device': 'RB-AI', 'range': '24h'})
        assert r['layanan_teratas'][0]['layanan'] == 'YouTube'
        assert r['pelanggan_teratas'][0]['ip'] == '10.7.7.7'
        c = ai_agent.run_tool('traffic_flow_client', {'query': '10.7.7.7', 'device': 'RB-AI'})
        assert c['layanan'][0]['layanan'] == 'YouTube'
        assert 'error' in ai_agent.run_tool('traffic_flow', {'device': 'tidak-ada'})
        assert 'catatan' in ai_agent.run_tool('traffic_flow_client', {'query': '10.9.9.9'})
