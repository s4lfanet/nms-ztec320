"""FTTH tahap 2: anggaran redaman lengkap & perbandingan dengan RX terukur."""
import secrets

from app import app, db
from models import User, OLT, ONU, OLTPort, FTTHOTB, FTTHODC, FTTHODP, FTTHODPPort, FTTHPonPort, SystemConfig
import ftth_budget
from tests.test_link_state import ctx  # noqa: F401

H = {'X-Requested-With': 'XMLHttpRequest'}


def _client():
    u = User(username='b' + secrets.token_hex(3), full_name='b', is_super_admin=True)
    u.set_password(secrets.token_hex(8))
    db.session.add(u); db.session.commit()
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['_user_id'] = str(u.id); sess['_fresh'] = True
    return c


def _path(rx=-22.0, odp_split='1:8', tx_sfp=None, drop_m=150):
    olt = OLT(name='OLT-B', ip_address='10.8.0.1', vendor='zte', model='C320')
    db.session.add(olt); db.session.flush()
    if tx_sfp is not None:
        db.session.add(OLTPort(olt_id=olt.id, port_number=1, port_name='gpon-olt_1/1/1', sfp_tx_power=tx_sfp))
    otb = FTTHOTB(name='OTB', total_cores=12)
    db.session.add(otb); db.session.flush()
    db.session.add(FTTHPonPort(olt_id=olt.id, frame=1, slot=1, port=1, pon_name='gpon-olt_1/1/1', otb_id=otb.id, otb_core_number=1))
    odc = FTTHODC(name='ODC', otb_id=otb.id, otb_core_number=1, total_cores=8, splitter_model='1:4',
                  cable_length_meters=2000, cable_attenuation_per_km=0.35)
    db.session.add(odc); db.session.flush()
    odp = FTTHODP(name='ODP', odc_id=odc.id, odc_core_number=1, total_ports=8, splitter_model=odp_split,
                  cable_length_meters=1000, cable_attenuation_per_km=0.35)
    db.session.add(odp); db.session.flush()
    onu = ONU(olt_id=olt.id, frame=1, slot=1, port=1, onu_id=1, serial_number='ZTEGB0000001', name='p', status='online', onu_rx_power=rx)
    db.session.add(onu); db.session.flush()
    db.session.add(FTTHODPPort(odp_id=odp.id, port_number=1, onu_id=onu.id, status='used', cable_length_meters=drop_m))
    db.session.commit()
    return onu


def test_full_budget_sums_all_components(ctx):
    onu = _path()
    b = _client().get(f'/api/ftth/trace/onu/{onu.id}', headers=H).get_json()['budget']
    kinds = [i['kind'] for i in b['items']]
    assert kinds.count('splitter') == 2 and kinds.count('connector') == 4
    # kabel 0.7 + 0.35 + drop 0.0525 ; splitter 7.3 + 10.5 ; konektor 4×0.5
    assert abs(b['total_db'] - (0.7 + 0.35 + 0.05 + 7.3 + 10.5 + 2.0)) < 0.05
    assert b['olt_tx_assumed'] is True and b['olt_tx_dbm'] == 3.0
    assert abs(b['expected_rx_dbm'] - (3.0 - b['total_db'])) < 0.01
    # terukur -22 vs perkiraan ≈ -17.9 → lebih buruk dari toleransi 3 dB
    assert b['verdict'] == 'worse' and b['delta_db'] > 3


def test_uses_measured_sfp_tx_and_ok_verdict(ctx):
    onu = _path(rx=-16.5, tx_sfp='4.10')
    b = _client().get(f'/api/ftth/trace/onu/{onu.id}', headers=H).get_json()['budget']
    assert b['olt_tx_assumed'] is False and b['olt_tx_dbm'] == 4.1
    assert b['verdict'] == 'ok'


def test_missing_data_is_incomplete(ctx):
    onu = _path(rx=-8.0, odp_split='', drop_m=None)
    b = _client().get(f'/api/ftth/trace/onu/{onu.id}', headers=H).get_json()['budget']
    assert any('Splitter ODP' in m for m in b['missing'])
    assert any('drop' in m for m in b['missing'])
    assert b['verdict'] == 'incomplete'


def test_better_than_expected(ctx):
    onu = _path(rx=-11.0)
    b = _client().get(f'/api/ftth/trace/onu/{onu.id}', headers=H).get_json()['budget']
    assert b['verdict'] == 'better' and b['delta_db'] < -3


def test_offline_onu_has_no_measurement(ctx):
    onu = _path()
    onu.status = 'los'; db.session.commit()
    b = _client().get(f'/api/ftth/trace/onu/{onu.id}', headers=H).get_json()['budget']
    assert b['verdict'] == 'unknown' and b['measured_rx_dbm'] is None


def test_uneven_cascade_uses_through_loss(ctx):
    node = FTTHODP(name='X', splitter_ratio_type='uneven', splitter_tap_loss_db=13.0, splitter_through_loss_db=0.6)
    assert ftth_budget.splitter_loss(node, 'through')[0] == 0.6
    assert ftth_budget.splitter_loss(node, 'tap')[0] == 13.0
    assert ftth_budget.splitter_ratio('PLC 1x16') == 16


def test_settings_validate_and_persist(ctx):
    c = _client()
    assert c.put('/api/ftth/budget-settings', headers=H, json={'ftth_connector_loss_db': 9}).status_code == 400
    r = c.put('/api/ftth/budget-settings', headers=H, json={'ftth_olt_tx_dbm': 5.5}).get_json()
    assert r['success'] and r['settings']['ftth_olt_tx_dbm'] == 5.5
    assert SystemConfig.query.filter_by(key='ftth_olt_tx_dbm').first().value == '5.5'
