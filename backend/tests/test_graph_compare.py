"""Grafik SNMP: perbandingan dengan periode sebelumnya (waktu digeser maju agar bisa ditumpuk)."""
from datetime import timedelta

import snmp_monitor
from app import db
from models import SnmpDevice, SnmpPort, SnmpSample
from routes_snmp import build_graph
from tests.test_link_state import ctx  # noqa: F401


def test_compare_previous_period(ctx):
    d = SnmpDevice(name='RB-CMP', host='10.5.5.1', snmp_version='2c')
    db.session.add(d); db.session.flush()
    p = SnmpPort(device_id=d.id, if_index=1, name='ether1', admin_status='up', oper_status='up')
    db.session.add(p); db.session.flush()
    now = snmp_monitor._now()
    db.session.add(SnmpSample(device_id=d.id, port_id=p.id, metric='in', ts=now - timedelta(hours=2), value=1000))
    db.session.add(SnmpSample(device_id=d.id, port_id=p.id, metric='in', ts=now - timedelta(hours=26), value=5000))
    db.session.commit()
    cur = build_graph(d.id, p.id, ['in'], '24h')
    prev = build_graph(d.id, p.id, ['in'], '24h', prev=True)
    assert [x['avg'] for x in cur['series']['in']] == [1000]
    assert [x['avg'] for x in prev['series']['in']] == [5000]
    # waktu periode lalu digeser +24 jam → jatuh di dalam jendela grafik sekarang (≈ 2 jam lalu)
    from datetime import datetime
    t = datetime.fromisoformat(prev['series']['in'][0]['t'].replace('Z', '+00:00')).replace(tzinfo=None)
    assert abs((now - timedelta(hours=2)) - t) < timedelta(minutes=1)
