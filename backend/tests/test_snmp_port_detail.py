"""Detail port ala Winbox: spesifikasi, SFP/redaman, statistik MikroTik, alert redaman."""
import copy
from datetime import timedelta

from app import db
from models import SystemConfig, SnmpDevice, SnmpPort, SnmpSample, Notification
import snmp_monitor as sm
import snmp_alerts as sa
from tests.test_link_state import ctx  # noqa: F401
from tests.test_snmp_monitor import DISC, _poll, _client, H

STATIC = {'mtu': {1: 1500}, 'duplex': {1: 3}, 'ips': {1: ['10.10.0.1/30']},
          'optics': {1: {'name': b'sfp-sfpplus1', 'wavelength': 131000, 'vendor': b'FS', 'serial': b'F23',
                         'present': 1, 'part': b'SFP-10GLR-31', 'type': 2, 'connector': 7, 'link_m': 10000,
                         'rates': b'10G'},
                     2: {'name': b'ether1', 'present': 0}}}


def _dyn(rx=-12500, fcs=17, extra=None):
    d = {'discards': {1: {'in': 7, 'out': 3}}, 'casts': {},
         'optics': {1: {'name': b'sfp-sfpplus1', 'rx_loss': 0, 'tx_fault': 0, 'temp': 41, 'volt': 3291, 'bias': 32,
                        'tx': -2150, 'rx': rx}},
         'stats': {1: {'name': b'sfp-sfpplus1', 'rx_fcs': fcs, 'rx_align': 2, 'rx_broadcast': 1200, 'tx_drop': 4,
                       'link_downs': 3}}}
    if extra:
        d.update(extra)
    return d


def _dev():
    d = SnmpDevice(name='Core', host='10.0.0.1', snmp_version='2c', status='up')
    d.community = 'x'
    db.session.add(d); db.session.commit()
    disc = copy.deepcopy(DISC); disc['portinfo'] = STATIC
    sm.apply_discovery(d, disc); db.session.commit()
    return d


def _poll_with(dyn, uptime, t):
    p = _poll(uptime, 10_000, 20_000)
    p['portinfo'] = dyn
    return p


def test_static_and_dynamic_detail_api(ctx):
    d = _dev()
    t0 = sm._now()
    sm.apply_poll(d, _poll_with(_dyn(), 1_000_000, t0), t0); db.session.commit()
    port = SnmpPort.query.filter_by(device_id=d.id, if_index=1).one()
    r = _client().get(f'/api/snmp/ports/{port.id}', headers=H).get_json()
    det = r['detail']
    assert det['mtu'] == 1500 and det['duplex'] == 'full' and det['ip_addrs'] == ['10.10.0.1/30']
    assert det['sfp']['type'] == 'SFP+' and det['sfp']['wavelength_nm'] == 1310.0 and det['sfp']['vendor'] == 'FS'
    assert det['optical']['rx_dbm'] == -12.5 and det['optical']['tx_dbm'] == -2.15 and det['optical']['volt'] == 3.291
    assert det['stats']['rx_fcs'] == 17 and det['stats']['in_discards'] == 7 and det['stats']['link_downs'] == 3
    assert r['port']['rx_dbm'] == -12.5 and r['port']['sfp_type'] == 'SFP+'
    assert SnmpSample.query.filter_by(port_id=port.id, metric='dom_rx').count() == 1
    eth = SnmpPort.query.filter_by(device_id=d.id, if_index=2).one()
    assert eth.sfp_info is None and eth.dom_at is None


def test_mikrotik_error_counters_no_false_spike(ctx):
    d = _dev()
    t0 = sm._now()
    sm.apply_poll(d, _poll_with(_dyn(fcs=5000), 1_000_000, t0), t0); db.session.commit()
    port = SnmpPort.query.filter_by(device_id=d.id, if_index=1).one()
    assert port.in_errors == 5002  # FCS + align dari mtxrInterfaceStats (IF-MIB 0 diabaikan)
    # poll kedua: counter error naik 300 dalam 300 dtk → 1/dtk; poll pertama tidak memberi lonjakan palsu
    t1 = t0 + timedelta(seconds=300)
    sm.apply_poll(d, _poll_with(_dyn(fcs=5300), 1_030_000, t1), t1); db.session.commit()
    assert port.in_err_rate == 1.0


def test_optical_alert_with_hysteresis(ctx):
    d = _dev()
    port = SnmpPort.query.filter_by(device_id=d.id, if_index=1).one()
    port.watched = True
    db.session.add(SystemConfig(key='snmp_hold_minutes', value='0'))  # tes ini memeriksa alert langsung
    db.session.commit()
    now = sm._now()

    def run(rx):
        sm.apply_poll(d, _poll_with(_dyn(rx=rx), 1_000_000, now), now); db.session.commit()
        notifs, alerts = [], []
        sa.check_snmp_thresholds(now, notifs, alerts)
        for n in notifs:
            db.session.add(Notification(**{k: v for k, v in n.items() if k != 'target_roles'}))
        db.session.commit()
        return [a['type'] for a in alerts if a['type'].startswith('snmp_optical')]

    assert run(-20000) == []
    assert run(-26500) == ['snmp_optical']
    assert run(-24500) == []                     # masih dalam histeresis 1 dB
    assert run(-22000) == ['snmp_optical_recovery']
