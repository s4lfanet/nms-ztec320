"""AI agent membaca VLAN, wireless, dan billing per port."""
from datetime import timedelta

import ai_agent
import snmp_monitor as sm
import snmp_tables as stb
from app import app, db
from models import SnmpDevice, SnmpPort, SnmpSampleHourly
from tests.test_link_state import ctx  # noqa: F401
from tests.test_alert_correlation import client  # noqa: F401


def _mk():
    d = SnmpDevice(name='SW-AI', host='10.88.0.1', snmp_version='2c', status='up')
    db.session.add(d); db.session.flush()
    for i, n in enumerate(('ether1', 'ether2', 'wlan1'), start=1):
        db.session.add(SnmpPort(device_id=d.id, if_index=i, name=n, admin_status='up', oper_status='up'))
    db.session.commit()
    return d


def test_ai_vlan_wireless_billing(client):
    with app.app_context():
        d = _mk()
        raw = {'vlan_egress': {'100': b'\xc0'}, 'vlan_untag': {'100': b'\x40'}, 'vlan_name': {'100': b'PELANGGAN'},
               'base_port': {'1': 1, '2': 2},
               'wl_signal': {'76.94.12.170.187.1.3': -82}, 'wl_ssid': {'3': b'AP1'}}
        stb.apply(d, stb.parse(raw), sm._now())
        # billing
        p = SnmpPort.query.filter_by(device_id=d.id, if_index=1).first()
        p.customer, p.commit_mbps, p.overage_rate = 'PT Maju', 50, 20000
        first = sm._now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        start = (first - timedelta(days=1)).replace(day=1)
        for h in range(20):
            db.session.add(SnmpSampleHourly(device_id=d.id, port_id=p.id, metric='in', hour=start + timedelta(hours=h),
                                            total=100e6 * 12, count=12, vmax=100e6))
        db.session.commit()

        v = ai_agent.run_tool('snmp_vlans', {'device': 'SW-AI'})
        assert v['vlan'][0]['vlan'] == 100 and v['vlan'][0]['untagged'] == ['ether2'] and v['vlan'][0]['tagged'] == ['ether1']
        w = ai_agent.run_tool('snmp_wireless', {'device': 'SW-AI'})
        assert w['total_klien'] == 1 and w['klien_sinyal_buruk'] == 1 and w['radio'][0]['ssid'] == 'AP1'
        b = ai_agent.run_tool('snmp_billing', {'month': start.strftime('%Y-%m'), 'customer': 'PT Maju'})
        assert b['port'][0]['p95_mbps'] == 100.0 and b['total_biaya_kelebihan'] == 1000000
        assert 'error' in ai_agent.run_tool('snmp_vlans', {'device': 'tidak-ada'})
        assert 'catatan' in ai_agent.run_tool('snmp_billing', {'month': '2001-01'})
