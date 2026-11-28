"""Ambang alert per grup (F2): override hanya untuk perangkat di grup itu, nilai dijepit LIMITS."""
from app import db
from models import SnmpDevice
from tests.test_snmp_topology import H, _client, _dev
from tests.test_link_state import ctx  # noqa: F401
import snmp_alerts


def test_override_dijepit_dan_dibersihkan(ctx):
    o = snmp_alerts.clean_overrides({'Backbone': {'snmp_cpu_threshold': 500, 'x': 1, 'snmp_temp_threshold': ''},
                                     '': {'snmp_cpu_threshold': 50}, 'Kosong': {}})
    assert o == {'Backbone': {'snmp_cpu_threshold': 100}}


def test_cfg_for_hanya_grup_terkait(ctx):
    a = _dev('A', '10.5.0.1', 'a', [('ether1', '')]); a.group_name = 'Backbone'
    b = _dev('B', '10.5.0.2', 'b', [('ether1', '')]); b.group_name = 'Akses'
    db.session.commit()
    cfg = snmp_alerts.get_settings()
    ovr = {'Backbone': {'snmp_cpu_threshold': 95}}
    assert snmp_alerts.cfg_for(a, cfg, ovr)['snmp_cpu_threshold'] == 95
    assert snmp_alerts.cfg_for(b, cfg, ovr)['snmp_cpu_threshold'] == cfg['snmp_cpu_threshold']
    assert snmp_alerts.cfg_for(a, cfg, ovr)['snmp_temp_threshold'] == cfg['snmp_temp_threshold']


def test_api_simpan_dan_baca(ctx):
    d = _dev('RB-O', '10.5.0.3', 'o', [('ether1', '')]); d.group_name = 'Backbone'
    db.session.commit()
    c = _client()
    r = c.put('/api/snmp/settings', json={'group_overrides': {'Backbone': {'snmp_cpu_threshold': 92}}}, headers=H)
    assert r.status_code == 200, r.get_data(as_text=True)
    j = c.get('/api/snmp/settings', headers=H).get_json()
    assert j['group_overrides'] == {'Backbone': {'snmp_cpu_threshold': 92}}
    assert 'Backbone' in j['groups']
    c.put('/api/snmp/settings', json={'group_overrides': {}}, headers=H)
    assert c.get('/api/snmp/settings', headers=H).get_json()['group_overrides'] == {}
