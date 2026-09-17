"""Tests for FTTH cable length/attenuation tracking (cable_length_meters,
cable_attenuation_per_km) on FTTHOTB/FTTHODC/FTTHODP/FTTHODPPort/FTTHJC, and
the cumulative total_attenuation_db computed by /api/ftth/trace/onu/<id> —
Phase 2 of the salfanet-radius structure adoption.

Run with: py -3 -m pytest tests/test_ftth_cable_attenuation.py -v
"""
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import User, Role, OLT, ONU, FTTHOTB, FTTHODC, FTTHODP, FTTHODPPort, FTTHJC, FTTHJCSplice, FTTHPonPort

app.config['TESTING'] = True
app.config['WTF_CSRF_ENABLED'] = False
app.config['SESSION_COOKIE_DOMAIN'] = None

H = {'X-Requested-With': 'XMLHttpRequest'}


@pytest.fixture(autouse=True)
def clear_rate_limits():
    from helpers import _login_attempts
    _login_attempts.clear()
    yield
    _login_attempts.clear()


@pytest.fixture
def client():
    import tempfile
    from sqlalchemy import create_engine as _create_engine

    _tmpdb = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
    _tmpdb.close()
    _test_engine = _create_engine(f'sqlite:///{_tmpdb.name}')

    with app.app_context():
        _orig_engine = db.engines.get(None)
        db.engines[None] = _test_engine
        db.create_all()
        if not User.query.filter_by(username='admin').first():
            role = Role.query.filter_by(name='Full Access').first()
            if not role:
                role = Role(name='Full Access', description='Full admin access',
                            permissions='all_olt', is_system=True)
                db.session.add(role)
                db.session.flush()
            admin = User(username='admin', full_name='Administrator',
                         is_super_admin=True, role_id=role.id)
            admin.set_password('admin123')
            db.session.add(admin)
            db.session.commit()

    with app.test_client() as client:
        yield client

    with app.app_context():
        db.drop_all()
        if _orig_engine is not None:
            db.engines[None] = _orig_engine
        else:
            db.engines.pop(None, None)
    try:
        os.unlink(_tmpdb.name)
    except (OSError, PermissionError):
        pass


@pytest.fixture
def auth_client(client):
    client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin123'})
    return client


@pytest.fixture
def test_otb(auth_client):
    with app.app_context():
        otb = FTTHOTB(name='OTB-1', total_cores=12)
        db.session.add(otb)
        db.session.commit()
        return otb.id


class TestCableFieldsRoundTrip:
    def test_otb_save_load(self, auth_client, test_otb):
        resp = auth_client.put(f'/api/ftth/otb/{test_otb}', json={
            'cable_length_meters': 850.0, 'cable_attenuation_per_km': 0.35,
        }, headers=H)
        assert resp.status_code == 200
        item = resp.get_json()['item']
        assert item['cable_length_meters'] == 850.0
        assert item['cable_attenuation_per_km'] == 0.35
        # 850m = 0.85km * 0.35 dB/km = 0.2975 dB
        assert item['cable_attenuation_db'] == pytest.approx(0.2975, abs=1e-6)

    def test_default_attenuation_per_km_when_not_set(self, auth_client, test_otb):
        resp = auth_client.get('/api/ftth/otb', headers=H)
        item = resp.get_json()['items'][0]
        assert item['cable_attenuation_per_km'] == 0.35  # model default
        assert item['cable_length_meters'] is None
        assert item['cable_attenuation_db'] is None  # no length -> can't compute

    def test_jc_save_load(self, auth_client, test_otb):
        resp = auth_client.post('/api/ftth/jc', json={
            'name': 'JC-A', 'parent_type': 'otb', 'parent_id': test_otb,
            'cable_length_meters': 120.0, 'cable_attenuation_per_km': 0.4,
        }, headers=H)
        assert resp.status_code == 200
        item = resp.get_json()['item']
        assert item['cable_length_meters'] == 120.0
        assert item['cable_attenuation_db'] == pytest.approx(0.048, abs=1e-6)


@pytest.fixture
def full_chain_with_cable(auth_client):
    """Same shape as test_ftth_trace.py's full_chain, but with cable_length_meters
    set on every segment so total_attenuation_db can be computed end to end."""
    with app.app_context():
        olt = OLT(name='OLT-1', ip_address='10.0.0.1', vendor='zte', model='C320')
        db.session.add(olt)
        db.session.flush()
        otb = FTTHOTB(name='OTB-1', olt_id=olt.id, total_cores=12,
                       cable_length_meters=1000, cable_attenuation_per_km=0.35)
        db.session.add(otb)
        db.session.flush()
        pon = FTTHPonPort(olt_id=olt.id, olt_name='OLT-1', frame=1, slot=1, port=3,
                           pon_name='gpon-olt_1/1/3', otb_id=otb.id, otb_core_number=5)
        db.session.add(pon)
        jc1 = FTTHJC(name='JC-1', parent_type='otb', parent_id=otb.id,
                      cable_length_meters=200, cable_attenuation_per_km=0.35)
        db.session.add(jc1)
        db.session.flush()
        db.session.add(FTTHJCSplice(jc_id=jc1.id, core_in=5, core_out=3))
        odc = FTTHODC(name='ODC-1', feed_source='jc', jc_id=jc1.id, jc_core_number=3, total_cores=8,
                       cable_length_meters=300, cable_attenuation_per_km=0.35)
        db.session.add(odc)
        db.session.flush()
        jc2 = FTTHJC(name='JC-2', parent_type='odc', parent_id=odc.id,
                      cable_length_meters=150, cable_attenuation_per_km=0.35)
        db.session.add(jc2)
        db.session.flush()
        db.session.add(FTTHJCSplice(jc_id=jc2.id, core_in=2, core_out=7))
        odp = FTTHODP(name='ODP-1', feed_source='jc', jc_id=jc2.id, jc_core_number=7, total_ports=4,
                       cable_length_meters=100, cable_attenuation_per_km=0.35)
        db.session.add(odp)
        db.session.flush()
        for i in range(1, 5):
            db.session.add(FTTHODPPort(odp_id=odp.id, port_number=i, status='available',
                                        cable_length_meters=50, cable_attenuation_per_km=0.35))
        db.session.commit()
        onu = ONU(name='Customer 1', serial_number='ZTEGCABLE1', olt_id=olt.id, status='online', frame=1, slot=1, port=3, onu_id=1)
        db.session.add(onu)
        db.session.commit()
        port1 = FTTHODPPort.query.filter_by(odp_id=odp.id, port_number=1).first()
        port1.onu_id = onu.id
        port1.status = 'used'
        db.session.commit()
        return {'onu_id': onu.id, 'odp_id': odp.id}


class TestTraceTotalAttenuation:
    def test_total_attenuation_computed_when_all_segments_have_length(self, auth_client, full_chain_with_cable):
        resp = auth_client.get(f'/api/ftth/trace/onu/{full_chain_with_cable["onu_id"]}', headers=H)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['complete'] is True
        # otb 1000m + jc1 200m + odc 300m + jc2 150m + odp 100m + port drop 50m
        # = 1800m total, all @ 0.35 dB/km -> 0.63 dB
        assert data['total_attenuation_db'] == pytest.approx(0.63, abs=1e-6)

    def test_total_attenuation_none_when_one_segment_missing_length(self, auth_client, full_chain_with_cable):
        # Clear the length on the ODC in the middle of the chain
        with app.app_context():
            odc = FTTHODC.query.filter_by(name='ODC-1').first()
            odc.cable_length_meters = None
            db.session.commit()
        resp = auth_client.get(f'/api/ftth/trace/onu/{full_chain_with_cable["onu_id"]}', headers=H)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['complete'] is True  # missing cable length is not a connectivity "gap"
        assert data['total_attenuation_db'] is None
