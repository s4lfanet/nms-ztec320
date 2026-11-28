"""Billing per port (G): komitmen vs 95% bulanan, kelebihan, biaya, CSV per pelanggan."""
from datetime import timedelta

from app import db
from models import SnmpSampleHourly, SnmpPort
from tests.test_snmp_topology import H, _client, _dev
from tests.test_link_state import ctx  # noqa: F401
import snmp_monitor as sm


def _prev_month_start():
    first = sm._now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return (first - timedelta(days=1)).replace(day=1)


def _seed(d, port, start, vals):
    for h, v in enumerate(vals):
        db.session.add(SnmpSampleHourly(device_id=d.id, port_id=port.id, metric='in', hour=start + timedelta(hours=h),
                                        total=v * 12, count=12, vmax=v))


def test_billing_kelebihan_dan_csv(ctx):
    d = _dev('RB-B', '10.6.0.1', 'b', [('ether1', ''), ('ether2', '')])
    db.session.commit()
    p1, p2 = SnmpPort.query.filter_by(device_id=d.id).order_by(SnmpPort.id).all()
    c = _client()
    r = c.put(f'/api/snmp/ports/{p1.id}', json={'customer': 'PT Maju', 'commit_mbps': 50, 'overage_rate': 20000}, headers=H)
    assert r.status_code == 200 and r.get_json()['port']['commit_mbps'] == 50
    c.put(f'/api/snmp/ports/{p2.id}', json={'customer': 'CV Lain', 'commit_mbps': 500, 'overage_rate': 1000}, headers=H)
    start = _prev_month_start()
    _seed(d, p1, start, [100e6] * 19 + [900e6])
    _seed(d, p2, start, [100e6] * 20)
    db.session.commit()
    month = start.strftime('%Y-%m')
    j = c.get(f'/api/snmp/billing?month={month}', headers=H).get_json()
    rows = {x['customer']: x for x in j['ports']}
    assert rows['PT Maju']['billing_p95_mbps'] == 100.0 and rows['PT Maju']['overage_mbps'] == 50.0
    assert rows['PT Maju']['overage_cost'] == 1000000
    assert rows['CV Lain']['overage_mbps'] == 0 and rows['CV Lain']['overage_cost'] == 0
    assert j['customers'] == ['CV Lain', 'PT Maju']
    csv_r = c.get(f'/api/snmp/billing?month={month}&customer=PT Maju&format=csv', headers=H)
    txt = csv_r.get_data(as_text=True)
    assert 'PT Maju' in txt and 'CV Lain' not in txt and '1000000' in txt
    assert 'billing-PT_Maju' in csv_r.headers['Content-Disposition']


def test_port_tanpa_billing_tidak_masuk_dan_input_valid(ctx):
    d = _dev('RB-C', '10.6.0.2', 'c', [('ether1', '')])
    db.session.commit()
    c = _client()
    assert c.get('/api/snmp/billing', headers=H).get_json()['ports'] == []
    assert c.put(f'/api/snmp/ports/{SnmpPort.query.filter_by(device_id=d.id).first().id}', json={'commit_mbps': 'abc'}, headers=H).status_code == 400
    c.put(f'/api/snmp/ports/{SnmpPort.query.filter_by(device_id=d.id).first().id}', json={'commit_mbps': -5}, headers=H)
    assert SnmpPort.query.filter_by(device_id=d.id).first().commit_mbps == 0
