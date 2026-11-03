"""Fase 6 — Reports: CSV/PDF endpoints."""
import pytest
from app import app, db
from models import OLT, ONU, AlertHistory


@pytest.fixture
def client():
    import tempfile, os, json
    from sqlalchemy import create_engine as _create_engine
    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False
    app.config['SESSION_COOKIE_DOMAIN'] = None
    _tmpdb = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
    _tmpdb.close()
    _test_engine = _create_engine(f'sqlite:///{_tmpdb.name}')
    with app.app_context():
        _orig = db.engines.get(None)
        db.engines[None] = _test_engine
        db.create_all()
        from models import User, Role
        role = Role(name='Full Access', description='Full admin access',
                    permissions='all_olt', is_system=True)
        db.session.add(role); db.session.flush()
        admin = User(username='admin', full_name='Administrator',
                     is_super_admin=True, role_id=role.id)
        admin.set_password('admin123')
        db.session.add(admin)
        olt = OLT(name='T', ip_address='10.0.0.1', vendor='zte', is_online=True)
        db.session.add(olt); db.session.flush()
        db.session.add(ONU(olt_id=olt.id, name='ok', serial_number='Z1', status='online', rx_power=-20.0))
        db.session.add(ONU(olt_id=olt.id, name='bad', serial_number='Z2', status='online', rx_power=-30.0))
        db.session.add(ONU(olt_id=olt.id, name='off', serial_number='Z3', status='offline'))
        db.session.commit()
    with app.test_client() as client:
        yield client
    with app.app_context():
        db.drop_all()
        if _orig is not None: db.engines[None] = _orig
        else: db.engines.pop(None, None)
    _test_engine.dispose()
    try: os.unlink(_tmpdb.name)
    except OSError: pass


def _login(client):
    client.post('/api/auth/login',
        data='{"username":"admin","password":"admin123"}',
        content_type='application/json')


class TestReports:
    def test_inventory_csv(self, client):
        _login(client)
        resp = client.get('/api/reports/inventory.csv',
                          headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        assert 'text/csv' in resp.content_type
        assert b'OLT' in resp.data
        assert b'ok' in resp.data
        assert b'bad' in resp.data

    def test_inventory_pdf(self, client):
        _login(client)
        resp = client.get('/api/reports/inventory.pdf',
                          headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        assert 'application/pdf' in resp.content_type
        assert resp.data[:4] == b'%PDF'

    def test_poor_rx_csv(self, client):
        _login(client)
        resp = client.get('/api/reports/poor-rx.csv?threshold=-25',
                          headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        assert b'bad' in resp.data
        assert b'ok' not in resp.data  # -20 > -25, excluded

    def test_long_offline_csv(self, client):
        _login(client)
        resp = client.get('/api/reports/long-offline.csv?days=0',
                          headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        assert b'off' in resp.data

    def test_alarms_csv(self, client):
        _login(client)
        resp = client.get('/api/reports/alarms.csv?days=30',
                          headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200

    def test_olt_sla_csv(self, client):
        _login(client)
        resp = client.get('/api/reports/olt-sla.csv',
                          headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        assert b'T' in resp.data
        assert b'zte' in resp.data

    def test_olt_sla_pdf(self, client):
        _login(client)
        resp = client.get('/api/reports/olt-sla.pdf',
                          headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        assert resp.data[:4] == b'%PDF'

    def test_no_auth_401(self, client):
        resp = client.get('/api/reports/inventory.csv')
        assert resp.status_code in (401, 302)
