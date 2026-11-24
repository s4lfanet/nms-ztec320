"""Port ala Observium: paket/detik, grafik mini 24 jam, mode Live."""
from datetime import timedelta

from app import db
from models import SnmpDevice, SnmpPort, SnmpSample
import snmp_monitor as sm
import routes_snmp
from tests.test_link_state import ctx  # noqa: F401
from tests.test_snmp_monitor import DISC, _poll, _client, H


def _dev():
    d = SnmpDevice(name='Core', host='10.0.0.1', snmp_version='2c')
    d.community = 'x'
    db.session.add(d); db.session.commit()
    sm.apply_discovery(d, DISC); db.session.commit()
    return d


def test_pps_and_waiting_state(ctx):
    d = _dev()
    t0 = sm._now()
    p0 = _poll(1_000_000, 10_000, 20_000)
    p0['ports'][1].update(in_pkts=1_000, out_pkts=2_000)
    sm.apply_poll(d, p0, t0); db.session.commit()
    port = SnmpPort.query.filter_by(device_id=d.id, if_index=1).one()
    c = _client()
    row = next(x for x in c.get(f'/api/snmp/devices/{d.id}', headers=H).get_json()['ports'] if x['id'] == port.id)
    assert row['has_counters'] is True and row['in_bps'] is None  # poll pertama: belum ada laju
    p1 = _poll(1_030_000, 10_000 + 375_000_000, 20_000)
    p1['ports'][1].update(in_pkts=1_000 + 300 * 500, out_pkts=2_000 + 300 * 50)
    sm.apply_poll(d, p1, t0 + timedelta(seconds=300)); db.session.commit()
    assert port.in_pps == 500.0 and port.out_pps == 50.0 and port.in_bps == 10_000_000.0
    assert SnmpSample.query.filter_by(port_id=port.id, metric='pkt_in').count() == 1


def test_sparks_buckets(ctx):
    d = _dev()
    port = SnmpPort.query.filter_by(device_id=d.id, if_index=1).one()
    now = sm._now()
    for minutes, v in ((10, 100.0), (20, 300.0), (60 * 23, 50.0)):
        db.session.add(SnmpSample(device_id=d.id, port_id=port.id, metric='in', ts=now - timedelta(minutes=minutes), value=v))
    db.session.add(SnmpSample(device_id=d.id, port_id=port.id, metric='in', ts=now - timedelta(hours=30), value=999.0))
    db.session.commit()
    r = _client().get(f'/api/snmp/devices/{d.id}/sparks', headers=H).get_json()
    s = r['ports'][str(port.id)]['in']
    assert len(s) == 48 and s[-1] == 200.0 and 50.0 in s and 999.0 not in s
    assert all(v is None for v in r['ports'][str(port.id)]['out'])


def test_live_endpoint_throttle_and_errors(ctx, monkeypatch):
    d = _dev()
    port = SnmpPort.query.filter_by(device_id=d.id, if_index=1).one()
    routes_snmp._live_last.clear()
    calls = []
    monkeypatch.setattr(sm, 'read_port_live', lambda params, idx: calls.append(idx) or
                        {'in': 1, 'out': 2, 'pin': 3, 'pout': 4, 'in_err': 0, 'out_err': 0, 'oper': 'up', 'hc': True})
    c = _client()
    r = c.get(f'/api/snmp/ports/{port.id}/live', headers=H)
    assert r.status_code == 200 and r.get_json()['in'] == 1 and calls == [1]
    assert c.get(f'/api/snmp/ports/{port.id}/live', headers=H).status_code == 429  # < 1 detik
    routes_snmp._live_last.clear()
    monkeypatch.setattr(sm, 'read_port_live', lambda *a: (_ for _ in ()).throw(RuntimeError('timeout')))
    r = c.get(f'/api/snmp/ports/{port.id}/live', headers=H)
    assert r.status_code == 502 and 'timeout' in r.get_json()['message']
