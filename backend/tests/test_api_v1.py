"""Fase 5 — REST API v1: token auth, rate limit, OLT access control, endpoints."""
import json
import pytest
from app import app, db
from models import OLT, ONU, ApiToken, User, Role


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
        role = Role(name='Full Access', description='Full admin access',
                    permissions='all_olt', is_system=True)
        db.session.add(role); db.session.flush()
        admin = User(username='admin', full_name='Administrator',
                     is_super_admin=True, role_id=role.id)
        admin.set_password('admin123')
        db.session.add(admin)
        # Seed OLT + ONU
        olt = OLT(name='T', ip_address='10.0.0.1', vendor='zte')
        db.session.add(olt); db.session.flush()
        for i in range(5):
            db.session.add(ONU(olt_id=olt.id, name=f'c{i}', serial_number=f'ZTEG{i:08d}',
                              status='online' if i % 2 == 0 else 'offline'))
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
    resp = client.post('/api/auth/login',
        data=json.dumps({'username': 'admin', 'password': 'admin123'}),
        content_type='application/json')
    assert resp.status_code == 200


def _create_token(client, name='test', abilities='*', expires_days=None):
    _login(client)
    resp = client.post('/api/v1/tokens',
        data=json.dumps({'name': name, 'abilities': abilities, 'expires_days': expires_days}),
        content_type='application/json',
        headers={'X-Requested-With': 'XMLHttpRequest'})
    assert resp.status_code == 200
    return resp.get_json()['data']['token']


class TestTokenAuth:
    def test_no_auth_returns_401(self, client):
        resp = client.get('/api/v1/onus')
        assert resp.status_code == 401

    def test_invalid_token_returns_401(self, client):
        resp = client.get('/api/v1/onus', headers={'Authorization': 'Bearer invalid_token'})
        assert resp.status_code == 401

    def test_valid_token_returns_200(self, client):
        token = _create_token(client)
        resp = client.get('/api/v1/onus', headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert len(data['data']) == 5

    def test_revoked_token_returns_401(self, client):
        token = _create_token(client)
        _login(client)
        # Get token id
        resp = client.get('/api/v1/tokens', headers={'X-Requested-With': 'XMLHttpRequest'})
        token_id = resp.get_json()['data'][0]['id']
        # Revoke
        client.post(f'/api/v1/tokens/{token_id}/revoke',
                    headers={'X-Requested-With': 'XMLHttpRequest'})
        # Use revoked token
        resp = client.get('/api/v1/onus', headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 401


class TestAbilities:
    def test_ability_check_blocks_unauthorized(self, client):
        token = _create_token(client, abilities='olts:read')
        # Should work for olts
        resp = client.get('/api/v1/olts', headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        # Should fail for onus
        resp = client.get('/api/v1/onus', headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 403

    def test_wildcard_ability_allows_all(self, client):
        token = _create_token(client, abilities='*')
        for endpoint in ['/onus', '/olts', '/alerts', '/link-states']:
            resp = client.get(f'/api/v1{endpoint}', headers={'Authorization': f'Bearer {token}'})
            assert resp.status_code == 200, f'{endpoint} failed'


class TestEndpoints:
    def test_list_onus_pagination(self, client):
        token = _create_token(client)
        resp = client.get('/api/v1/onus?per_page=2&page=1',
                          headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data['data']) == 2
        assert data['meta']['total'] == 5

    def test_filter_by_status(self, client):
        token = _create_token(client)
        resp = client.get('/api/v1/onus?status=online',
                          headers={'Authorization': f'Bearer {token}'})
        data = resp.get_json()
        assert all(o['status'] == 'online' for o in data['data'])

    def test_search(self, client):
        token = _create_token(client)
        resp = client.get('/api/v1/onus?search=c2',
                          headers={'Authorization': f'Bearer {token}'})
        data = resp.get_json()
        assert len(data['data']) == 1
        assert data['data'][0]['name'] == 'c2'

    def test_get_single_onu(self, client):
        token = _create_token(client)
        resp = client.get('/api/v1/onus/1', headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        assert resp.get_json()['data']['id'] == 1

    def test_onu_404(self, client):
        token = _create_token(client)
        resp = client.get('/api/v1/onus/99999', headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 404

    def test_list_olts(self, client):
        token = _create_token(client)
        resp = client.get('/api/v1/olts', headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        assert len(resp.get_json()['data']) == 1
        assert resp.get_json()['data'][0]['onu_count'] == 5

    def test_alerts(self, client):
        token = _create_token(client)
        resp = client.get('/api/v1/alerts', headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200

    def test_link_states(self, client):
        token = _create_token(client)
        resp = client.get('/api/v1/link-states', headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200


class TestTokenManagement:
    def test_create_and_list_tokens(self, client):
        _login(client)
        resp = client.post('/api/v1/tokens',
            data=json.dumps({'name': 'my-bot', 'abilities': 'onus:read'}),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        raw = resp.get_json()['data']['token']
        assert raw.startswith('snms_')
        # List
        resp = client.get('/api/v1/tokens', headers={'X-Requested-With': 'XMLHttpRequest'})
        data = resp.get_json()['data']
        assert len(data) == 1
        assert data[0]['name'] == 'my-bot'
        assert data[0]['prefix'] == raw[:12]
        # Token hash should NOT be in response
        assert 'token_hash' not in data[0]
        assert 'token' not in data[0]

    def test_revoke_token(self, client):
        _login(client)
        client.post('/api/v1/tokens',
            data=json.dumps({'name': 'revoke-me'}),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        resp = client.get('/api/v1/tokens', headers={'X-Requested-With': 'XMLHttpRequest'})
        tid = resp.get_json()['data'][0]['id']
        resp = client.post(f'/api/v1/tokens/{tid}/revoke',
                           headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        assert resp.get_json()['data']['revoked'] is True
