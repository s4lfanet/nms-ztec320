"""Fase 7 — OLT terminal: permission, audit masking, channel open."""
import json
import pytest
from app import app, db
from models import OLT, ONU, SystemConfig, ActionLog


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
        role = Role(name='Full Access', description='Full admin access',
                    permissions='all_olt', is_system=True)
        db.session.add(role); db.session.flush()
        admin = User(username='admin', full_name='Administrator',
                     is_super_admin=True, role_id=role.id)
        admin.set_password('admin123')
        db.session.add(admin)
        db.session.add(OLT(name='T', ip_address='10.0.0.1', vendor='zte',
                          telnet_enabled=True, cli_username='admin', cli_password='secret'))
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


class TestTerminalPermission:
    def test_olt_terminal_in_permissions(self, client):
        from models import AVAILABLE_PERMISSIONS
        assert 'olt_terminal' in AVAILABLE_PERMISSIONS


class TestAuditMasking:
    def test_password_masked_in_audit(self, client):
        from api_async import _audit_terminal_command
        with app.app_context():
            olt = OLT.query.first()
            _audit_terminal_command(1, olt, 'secret123', password_expected=True)
            log = ActionLog.query.filter_by(action='olt_terminal_cmd').first()
            assert log is not None
            assert 'secret123' not in log.detail
            assert 'password hidden' in log.detail

    def test_normal_command_logged(self, client):
        from api_async import _audit_terminal_command
        with app.app_context():
            olt = OLT.query.first()
            _audit_terminal_command(1, olt, 'show gpon onu state', password_expected=False)
            log = ActionLog.query.filter_by(action='olt_terminal_cmd').first()
            assert 'show gpon onu state' in log.detail


class TestWsToken:
    def test_ws_token_endpoint(self, client):
        _login(client)
        resp = client.get('/api/ws-token',
                          headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        data = resp.get_json()
        token = data['token']
        assert '.' in token
        parts = token.split('.')
        assert len(parts) == 3  # user_id.expiry.sig
