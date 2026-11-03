"""Fase 3 — GenieACS TR-069 bridge: client matching logic + endpoint tests."""
import json
import pytest
from app import app, db
from models import OLT, ONU, SystemConfig, GenieacsDeviceMap


@pytest.fixture
def client():
    import tempfile, os
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
        if not User.query.filter_by(username='admin').first():
            role = Role(name='Full Access', description='Full admin access',
                        permissions='all_olt', is_system=True)
            db.session.add(role); db.session.flush()
            admin = User(username='admin', full_name='Administrator',
                         is_super_admin=True, role_id=role.id)
            admin.set_password('admin123')
            db.session.add(admin); db.session.commit()
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
    resp = client.post('/api/auth/login',
        data=json.dumps({'username': 'admin', 'password': 'admin123'}),
        content_type='application/json')
    assert resp.status_code == 200


class TestMatchLogic:
    def test_match_by_serial_exact(self, client):
        from genieacs_client import match_onu_to_device
        with app.app_context():
            onu = ONU(olt_id=1, name='c1', serial_number='ZTEG12345678', status='online')
            db.session.add(onu); db.session.commit()
            devices = [{'_id': 'dev1', 'serial': 'ZTEG12345678', 'mac': '', 'model': '', 'vendor': ''}]
            dev_id, method = match_onu_to_device(onu, devices)
            assert dev_id == 'dev1'
            assert method == 'serial'

    def test_match_by_mac_exact(self, client):
        from genieacs_client import match_onu_to_device
        with app.app_context():
            onu = ONU(olt_id=1, name='c2', serial_number='AABBCCDDEE01', status='online')
            db.session.add(onu); db.session.commit()
            devices = [{'_id': 'dev2', 'serial': '', 'mac': 'AA:BB:CC:DD:EE:01', 'model': '', 'vendor': ''}]
            dev_id, method = match_onu_to_device(onu, devices)
            assert dev_id == 'dev2'
            assert method == 'mac'

    def test_match_by_mac_plus1(self, client):
        from genieacs_client import match_onu_to_device
        with app.app_context():
            onu = ONU(olt_id=1, name='c3', serial_number='AABBCCDDEE01', status='online')
            db.session.add(onu); db.session.commit()
            devices = [{'_id': 'dev3', 'serial': '', 'mac': 'AABBCCDDEE02', 'model': '', 'vendor': ''}]
            dev_id, method = match_onu_to_device(onu, devices)
            assert dev_id == 'dev3'
            assert method == 'mac'

    def test_no_match_when_off_by_2(self, client):
        from genieacs_client import match_onu_to_device
        with app.app_context():
            onu = ONU(olt_id=1, name='c4', serial_number='AABBCCDDEE01', status='online')
            db.session.add(onu); db.session.commit()
            devices = [{'_id': 'dev4', 'serial': '', 'mac': 'AABBCCDDEE03', 'model': '', 'vendor': ''}]
            dev_id, method = match_onu_to_device(onu, devices)
            assert dev_id is None


class TestSettingsEndpoint:
    def test_get_settings_empty(self, client):
        _login(client)
        resp = client.get('/api/genieacs/settings',
                          headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['nbi_url'] == ''
        assert data['has_password'] is False

    def test_save_and_get_settings(self, client):
        _login(client)
        resp = client.post('/api/genieacs/settings',
            data=json.dumps({'nbi_url': 'http://acs.test:7557', 'nbi_user': 'admin', 'nbi_password': 'secret'}),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        resp = client.get('/api/genieacs/settings',
                          headers={'X-Requested-With': 'XMLHttpRequest'})
        data = resp.get_json()
        assert data['nbi_url'] == 'http://acs.test:7557'
        assert data['nbi_user'] == 'admin'
        assert data['has_password'] is True


class TestTr069Endpoint:
    def test_no_mapping_returns_not_connected(self, client):
        _login(client)
        with app.app_context():
            olt = OLT(name='T', ip_address='10.0.0.1', vendor='zte')
            db.session.add(olt); db.session.flush()
            onu = ONU(olt_id=olt.id, name='c', serial_number='ZTEG1', status='online')
            db.session.add(onu); db.session.commit()
            onuid = onu.id
        resp = client.get(f'/api/onu/{onuid}/tr069',
                          headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['connected'] is False
        assert data['params'] is None

    def test_404_for_missing_onu(self, client):
        _login(client)
        resp = client.get('/api/onu/99999/tr069',
                          headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 404
