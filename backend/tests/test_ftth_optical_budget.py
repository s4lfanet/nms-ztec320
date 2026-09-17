"""Automated tests for FTTH optical budget fields on ODC/ODP (splitter_ratio_type,
splitter_tap_loss_db, splitter_through_loss_db) — adopted from salfanet-radius's
fbtRatioType/fbtTapLoss/fbtThroughLoss, kept purely additive alongside the
existing free-text splitter_model field.

Run with: py -3 -m pytest tests/test_ftth_optical_budget.py -v
"""
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import User, Role, FTTHOTB, FTTHODC, FTTHODP

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


@pytest.fixture
def test_odc(auth_client, test_otb):
    with app.app_context():
        odc = FTTHODC(name='ODC-1', otb_id=test_otb, otb_core_number=1, total_cores=8)
        db.session.add(odc)
        db.session.commit()
        return odc.id


class TestOdcOpticalBudget:
    def test_create_with_optical_budget_fields(self, auth_client, test_otb):
        resp = auth_client.post('/api/ftth/odc', json={
            'name': 'ODC-Budget', 'otb_id': test_otb, 'feed_source': 'otb',
            'splitter_model': '1:8', 'splitter_ratio_type': 'uneven',
            'splitter_tap_loss_db': 10.5, 'splitter_through_loss_db': 1.2,
        }, headers=H)
        assert resp.status_code == 200
        item = resp.get_json()['item']
        assert item['splitter_ratio_type'] == 'uneven'
        assert item['splitter_tap_loss_db'] == 10.5
        assert item['splitter_through_loss_db'] == 1.2

    def test_create_without_optical_budget_defaults(self, auth_client, test_otb):
        resp = auth_client.post('/api/ftth/odc', json={
            'name': 'ODC-Default', 'otb_id': test_otb, 'feed_source': 'otb',
        }, headers=H)
        assert resp.status_code == 200
        item = resp.get_json()['item']
        assert item['splitter_ratio_type'] == 'even'
        assert item['splitter_tap_loss_db'] is None
        assert item['splitter_through_loss_db'] is None

    def test_update_optical_budget_round_trip(self, auth_client, test_odc):
        resp = auth_client.put(f'/api/ftth/odc/{test_odc}', json={
            'splitter_ratio_type': 'uneven',
            'splitter_tap_loss_db': 8.3, 'splitter_through_loss_db': 0.9,
        }, headers=H)
        assert resp.status_code == 200
        item = resp.get_json()['item']
        assert item['splitter_ratio_type'] == 'uneven'
        assert item['splitter_tap_loss_db'] == 8.3
        assert item['splitter_through_loss_db'] == 0.9

        # Fetch fresh via list to confirm it persisted, not just echoed back
        resp2 = auth_client.get('/api/ftth/odc', headers=H)
        item2 = next(i for i in resp2.get_json()['items'] if i['id'] == test_odc)
        assert item2['splitter_tap_loss_db'] == 8.3


class TestOdpOpticalBudget:
    def test_create_with_optical_budget_fields(self, auth_client, test_odc):
        resp = auth_client.post('/api/ftth/odp', json={
            'name': 'ODP-Budget', 'odc_id': test_odc, 'feed_source': 'odc',
            'splitter_model': '1:8', 'splitter_ratio_type': 'uneven',
            'splitter_tap_loss_db': 10.5, 'splitter_through_loss_db': 1.2,
        }, headers=H)
        assert resp.status_code == 200
        item = resp.get_json()['item']
        assert item['splitter_ratio_type'] == 'uneven'
        assert item['splitter_tap_loss_db'] == 10.5
        assert item['splitter_through_loss_db'] == 1.2

    def test_create_without_optical_budget_defaults(self, auth_client, test_odc):
        resp = auth_client.post('/api/ftth/odp', json={
            'name': 'ODP-Default', 'odc_id': test_odc, 'feed_source': 'odc',
        }, headers=H)
        assert resp.status_code == 200
        item = resp.get_json()['item']
        assert item['splitter_ratio_type'] == 'even'
        assert item['splitter_tap_loss_db'] is None
        assert item['splitter_through_loss_db'] is None

    def test_update_optical_budget_round_trip(self, auth_client, test_odc):
        with app.app_context():
            odp = FTTHODP(name='ODP-Upd', odc_id=test_odc, odc_core_number=1, total_ports=4)
            db.session.add(odp)
            db.session.commit()
            odp_id = odp.id

        resp = auth_client.put(f'/api/ftth/odp/{odp_id}', json={
            'splitter_ratio_type': 'uneven',
            'splitter_tap_loss_db': 7.1, 'splitter_through_loss_db': 0.5,
        }, headers=H)
        assert resp.status_code == 200
        item = resp.get_json()['item']
        assert item['splitter_ratio_type'] == 'uneven'
        assert item['splitter_tap_loss_db'] == 7.1
        assert item['splitter_through_loss_db'] == 0.5
