"""Basic unit tests for FiberNMS API endpoints and sync logic.

Run with: py -3 -m pytest tests/ -v
Or: py -3 tests/test_basic.py
"""
import os
import sys
import json
import pytest

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import User, Role, OLT

# Save original production DB URI so we can restore it after tests
_orig_db_uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///instance/nms.db')


@pytest.fixture(autouse=True)
def clear_rate_limits():
    """Clear in-memory rate limiter before each test to prevent cross-test contamination."""
    from helpers import _login_attempts
    _login_attempts.clear()
    yield
    _login_attempts.clear()


@pytest.fixture
def client():
    """Create a test client with isolated temp database.

    CRITICAL: Flask-SQLAlchemy 3.x caches engines in db.engines keyed by
    bind name (None for default). We directly replace the cached engine
    with a new one pointing to a temp file, so db.create_all()/db.drop_all()
    and all queries use the temp DB, never production.
    """
    import tempfile, os
    from sqlalchemy import create_engine as _create_engine

    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False
    app.config['SESSION_COOKIE_DOMAIN'] = None
    _tmpdb = tempfile.NamedTemporaryFile(suffix='.db', delete=False, dir='/tmp')
    _tmpdb.close()
    _test_engine = _create_engine(f'sqlite:///{_tmpdb.name}')

    with app.app_context():
        # Save and replace the default engine in FSA's cache.
        # FSA 3.x keys engines by bind name (None = default bind).
        _orig_engine = db.engines.get(None)
        db.engines[None] = _test_engine
        db.create_all()
        from models import User, Role
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

    # Drop all tables from the temp DB (NOT production)
    with app.app_context():
        db.drop_all()
        # Restore original engine in cache
        if _orig_engine is not None:
            db.engines[None] = _orig_engine
        else:
            db.engines.pop(None, None)
    _test_engine.dispose()

    # Clean up temp file
    try:
        os.unlink(_tmpdb.name)
    except OSError:
        pass


class TestAuthEndpoints:
    """Test authentication API endpoints."""

    def test_login_success(self, client):
        """Test successful login with valid credentials."""
        resp = client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert data['user']['username'] == 'admin'
        assert data['user']['is_super_admin'] is True

    def test_login_invalid_credentials(self, client):
        """Test login with wrong password."""
        resp = client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'wrong'}),
            content_type='application/json')
        assert resp.status_code == 401
        data = resp.get_json()
        assert data['success'] is False

    def test_login_missing_fields(self, client):
        """Test login with missing fields."""
        resp = client.post('/api/auth/login',
            data=json.dumps({}),
            content_type='application/json')
        assert resp.status_code == 401

    def test_logout(self, client):
        """Test logout endpoint."""
        # Login first to establish session
        login_resp = client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        assert login_resp.status_code == 200, f"Login failed: {login_resp.get_json()}"
        # Logout using the same session (session cookie is retained in test client)
        resp = client.post('/api/auth/logout',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True


class TestPublicEndpoints:
    """Test public API endpoints (no auth required)."""

    def test_public_branding(self, client):
        """Test public branding endpoint."""
        resp = client.get('/api/public/branding')
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'nms_name' in data or 'name' in data


class TestSecurityHeaders:
    """Test security headers are present."""

    def test_security_headers(self, client):
        """Verify all security headers are set."""
        resp = client.get('/api/public/branding')
        assert resp.headers.get('X-Frame-Options') == 'DENY'
        assert resp.headers.get('X-Content-Type-Options') == 'nosniff'
        assert resp.headers.get('Referrer-Policy') == 'strict-origin-when-cross-origin'


class TestHelpers:
    """Test helper functions."""

    def test_utc_iso_none(self):
        from helpers import utc_iso
        assert utc_iso(None) is None

    def test_utc_iso_with_tz(self):
        from helpers import utc_iso
        from datetime import datetime, timezone
        dt = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        result = utc_iso(dt)
        assert '+00:00' in result or 'Z' in result

    def test_utc_iso_naive(self):
        from helpers import utc_iso
        from datetime import datetime
        dt = datetime(2024, 1, 1, 12, 0, 0)
        result = utc_iso(dt)
        assert result.endswith('+00:00')

    def test_rate_limiting(self):
        from helpers import check_rate_limit, record_failed_login, clear_failed_logins
        ip = '1.2.3.4'
        clear_failed_logins(ip)
        # First 5 attempts should be allowed
        for i in range(5):
            allowed, _ = check_rate_limit(ip)
            assert allowed is True
            record_failed_login(ip)
        # 6th should be blocked
        allowed, retry = check_rate_limit(ip)
        assert allowed is False
        assert retry > 0
        clear_failed_logins(ip)


class TestModels:
    """Test database models."""

    def test_user_password(self):
        """Test user password hashing."""
        with app.app_context():
            user = User(username='testuser', full_name='Test')
            user.set_password('mypassword')
            assert user.check_password('mypassword') is True
            assert user.check_password('wrong') is False

    def test_encrypt_decrypt_field(self):
        """Test encrypt_field/decrypt_field round-trip."""
        from models import encrypt_field, decrypt_field
        original = 'my-secret-password'
        encrypted = encrypt_field(original)
        assert encrypted != original  # Should be encrypted
        assert decrypt_field(encrypted) == original  # Round-trip works

    def test_decrypt_field_plaintext_fallback(self):
        """Test decrypt_field returns plaintext for unencrypted legacy data."""
        from models import decrypt_field
        assert decrypt_field('plain-text-value') == 'plain-text-value'
        assert decrypt_field('') == ''

    def test_encrypt_field_empty(self):
        """Test encrypt_field returns empty string for empty input."""
        from models import encrypt_field
        assert encrypt_field('') == ''
        assert encrypt_field(None) == ''


class TestSecurityPhase1:
    """Regression tests for Phase 1 security hardening."""

    def test_olt_get_masks_snmp_community_for_non_admin(self, client):
        """GET /api/olt/<id> should mask SNMP community for users without settings_ip_olts."""
        # Login as admin first to create an OLT
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        # Create an OLT
        resp = client.post('/api/olt',
            data=json.dumps({'name': 'Test OLT', 'ip_address': '192.168.1.1', 'snmp_community': 'private'}),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        olt_id = resp.get_json()['id']

        # Admin (has settings_ip_olts) should see real community
        resp = client.get(f'/api/olt/{olt_id}')
        data = resp.get_json()
        assert data['snmp_community'] == 'private'

        # Create a Viewer user without settings_ip_olts
        with app.app_context():
            from models import Role, User, db
            viewer_role = Role(name='Viewer', permissions='')
            db.session.add(viewer_role)
            viewer = User(username='viewer', full_name='Viewer', role=viewer_role)
            viewer.set_password('viewer123')
            db.session.add(viewer)
            db.session.commit()

        # Logout admin, login as viewer
        client.post('/api/auth/logout',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        client.post('/api/auth/login',
            data=json.dumps({'username': 'viewer', 'password': 'viewer123'}),
            content_type='application/json')

        # Viewer should see masked SNMP community
        resp = client.get(f'/api/olt/{olt_id}')
        data = resp.get_json()
        assert data['snmp_community'] == '***'
        assert data['snmp_community_write'] == ''
        assert data['cli_username'] == ''

    def test_onu_replace_requires_permission(self, client):
        """POST /api/onu/<id>/replace should require configure_onu permission."""
        # Login as viewer (no configure_onu permission)
        client.post('/api/auth/login',
            data=json.dumps({'username': 'viewer', 'password': 'viewer123'}),
            content_type='application/json')
        # Should get 403, not 200
        resp = client.post('/api/onu/1/replace',
            data=json.dumps({'new_serial': 'ZTE12345678'}),
            content_type='application/json')
        assert resp.status_code == 403

    def test_ws_token_requires_auth(self, client):
        """GET /api/ws-token should require authentication."""
        resp = client.get('/api/ws-token')
        assert resp.status_code == 401

    def test_ws_token_returns_token_when_authed(self, client):
        """GET /api/ws-token should return token for authenticated users."""
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        resp = client.get('/api/ws-token')
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'token' in data
        assert len(data['token']) > 0


class TestCSRFProtection:
    """Regression tests for CSRF protection (S9)."""

    def test_post_without_x_requested_with_rejected(self, client):
        """POST without X-Requested-With header should be 403."""
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        resp = client.post('/api/olt/sync-all',
            data=json.dumps({}),
            content_type='application/json')
        assert resp.status_code == 403

    def test_post_with_x_requested_with_allowed(self, client):
        """POST with X-Requested-With header should pass CSRF check."""
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        resp = client.post('/api/olt/sync-all',
            data=json.dumps({}),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        # Should not be 403 (may be 200 or 500 depending on OLTs)
        assert resp.status_code != 403

    def test_login_exempt_from_csrf(self, client):
        """Login endpoint should work without X-Requested-With."""
        resp = client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        assert resp.status_code == 200

    def test_get_not_affected_by_csrf(self, client):
        """GET requests should not require X-Requested-With."""
        resp = client.get('/api/public/branding')
        assert resp.status_code == 200

    def test_delete_without_x_requested_with_rejected(self, client):
        """DELETE without X-Requested-With should be 403."""
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        resp = client.delete('/api/olt/999')
        assert resp.status_code == 403


class TestRBAC:
    """Regression tests for Role-Based Access Control."""

    def _create_viewer(self):
        """Create a viewer user with no permissions."""
        with app.app_context():
            from models import Role, User, db
            viewer_role = Role(name='ViewerTest', permissions='')
            db.session.add(viewer_role)
            viewer = User(username='viewertest', full_name='Viewer', role=viewer_role)
            viewer.set_password('viewer123')
            db.session.add(viewer)
            db.session.commit()

    def _login_viewer(self, client):
        self._create_viewer()
        client.post('/api/auth/login',
            data=json.dumps({'username': 'viewertest', 'password': 'viewer123'}),
            content_type='application/json')

    def test_viewer_cannot_delete_olt(self, client):
        """Viewer without settings_ip_olts cannot delete OLT."""
        self._login_viewer(client)
        resp = client.delete('/api/olt/1',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 403

    def test_viewer_cannot_create_olt(self, client):
        """Viewer without settings_ip_olts cannot create OLT."""
        self._login_viewer(client)
        resp = client.post('/api/olt',
            data=json.dumps({'name': 'Test', 'ip_address': '1.2.3.4'}),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 403

    def test_viewer_cannot_manage_users(self, client):
        """Viewer without manage_users cannot access user management."""
        self._login_viewer(client)
        resp = client.get('/api/users')
        assert resp.status_code == 403

    def test_viewer_cannot_update_bot_config(self, client):
        """Viewer without customization cannot update bot config."""
        self._login_viewer(client)
        resp = client.put('/api/bot-config/telegram',
            data=json.dumps({'enabled': True}),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 403

    def test_admin_can_access_all(self, client):
        """Admin with all_olt can access protected endpoints."""
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        resp = client.get('/api/users')
        assert resp.status_code == 200


class TestWebSocketTokenSecurity:
    """Regression tests for WebSocket token security (P0-a)."""

    def test_ws_token_does_not_leak_secret_key(self, client):
        """ws-token endpoint must not return the raw SECRET_KEY."""
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        resp = client.get('/api/ws-token')
        data = resp.get_json()
        token = data['token']
        # Token should be in format: user_id.expiry.signature (3 parts)
        parts = token.split('.')
        assert len(parts) == 3, f"Token should have 3 parts, got {len(parts)}"
        # Token should NOT be the SECRET_KEY
        secret = os.environ.get('SECRET_KEY', '')
        assert token != secret, "ws-token must not return raw SECRET_KEY"

    def test_ws_token_has_expiry(self, client):
        """ws-token should contain a valid expiry timestamp."""
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        resp = client.get('/api/ws-token')
        data = resp.get_json()
        parts = data['token'].split('.')
        assert len(parts) == 3
        # Second part should be a future timestamp
        expiry = int(parts[1])
        import time as _time
        assert expiry > _time.time(), "Token expiry should be in the future"
        assert expiry <= _time.time() + 120, "Token TTL should be <= 120s"

    def test_ws_token_user_id_matches(self, client):
        """ws-token should contain the authenticated user's ID."""
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        resp = client.get('/api/ws-token')
        data = resp.get_json()
        parts = data['token'].split('.')
        # First part should be user ID (admin = 1)
        assert parts[0] == '1', f"Expected user_id=1, got {parts[0]}"

    def test_ws_token_changes_each_request(self, client):
        """Each ws-token request should produce a different token (ephemeral)."""
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        import time as _time
        token1 = client.get('/api/ws-token').get_json()['token']
        _time.sleep(1.1)  # Ensure different expiry timestamp
        token2 = client.get('/api/ws-token').get_json()['token']
        # Tokens should differ (different expiry timestamps)
        assert token1 != token2, 'Ephemeral tokens should differ across requests'


class TestWebSocketAuthHardening:
    """Regression tests for WebSocket auth + internal key hardening (P0/P1)."""

    def test_verify_ws_token_returns_user_id(self):
        """_verify_ws_token should return (True, user_id) for valid token."""
        import os, time, hmac, hashlib
        os.environ['INTERNAL_API_KEY'] = 'test-key-for-unit-test'
        from api_async import _verify_ws_token
        user_id = 42
        expiry = int(time.time()) + 60
        payload = f"{user_id}.{expiry}"
        secret = os.environ['INTERNAL_API_KEY']
        sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
        token = f"{payload}.{sig}"
        valid, returned_uid = _verify_ws_token(token)
        assert valid is True
        assert returned_uid == 42

    def test_verify_ws_token_rejects_expired(self):
        """Expired tokens should be rejected."""
        import os, time, hmac, hashlib
        os.environ['INTERNAL_API_KEY'] = 'test-key-for-unit-test'
        from api_async import _verify_ws_token
        user_id = 1
        expiry = int(time.time()) - 10  # Expired 10s ago
        payload = f"{user_id}.{expiry}"
        secret = os.environ['INTERNAL_API_KEY']
        sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
        token = f"{payload}.{sig}"
        valid, returned_uid = _verify_ws_token(token)
        assert valid is False
        assert returned_uid is None

    def test_verify_ws_token_rejects_wrong_key(self):
        """Token signed with wrong key should be rejected."""
        import os, time, hmac, hashlib
        os.environ['INTERNAL_API_KEY'] = 'correct-key'
        from api_async import _verify_ws_token
        user_id = 1
        expiry = int(time.time()) + 60
        payload = f"{user_id}.{expiry}"
        sig = hmac.new(b'wrong-key', payload.encode(), hashlib.sha256).hexdigest()
        token = f"{payload}.{sig}"
        valid, returned_uid = _verify_ws_token(token)
        assert valid is False

    def test_internal_key_no_secret_key_fallback(self):
        """_get_internal_api_key must not fall back to SECRET_KEY."""
        import os
        # Ensure INTERNAL_API_KEY is set (from previous test)
        os.environ['INTERNAL_API_KEY'] = 'test-key-for-unit-test'
        os.environ['SECRET_KEY'] = 'should-not-be-used'
        from api_async import _get_internal_api_key
        key = _get_internal_api_key()
        assert key == 'test-key-for-unit-test'
        assert key != 'should-not-be-used'

    def test_cors_not_wildcard(self):
        """CORS allowed_origins must not include '*'."""
        from api_async import _get_allowed_origins
        # Force development mode for this test so localhost is included
        orig_env = os.environ.get('FLASK_ENV', '')
        os.environ['FLASK_ENV'] = 'development'
        try:
            origins = _get_allowed_origins()
        finally:
            if orig_env:
                os.environ['FLASK_ENV'] = orig_env
            else:
                os.environ.pop('FLASK_ENV', None)
        assert '*' not in origins, "CORS must not allow wildcard origins"
        # Should include localhost for dev
        assert any('localhost' in o for o in origins), "Should allow localhost for dev"

    def test_ws_token_rejects_no_token(self):
        """_verify_ws_token should reject None/empty tokens."""
        from api_async import _verify_ws_token
        valid, uid = _verify_ws_token(None)
        assert valid is False
        assert uid is None
        valid, uid = _verify_ws_token('')
        assert valid is False
        assert uid is None


class TestCredentialExposure:
    """Regression tests for credential exposure to frontend (P0-c)."""

    def test_olt_get_masks_cli_password(self, client):
        """GET /api/olt/<id> should never return actual CLI password."""
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        # Create OLT with CLI password
        resp = client.post('/api/olt',
            data=json.dumps({'name': 'Cred Test', 'ip_address': '10.0.0.99',
                             'cli_password': 'supersecret'}),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        olt_id = resp.get_json()['id']
        resp = client.get(f'/api/olt/{olt_id}')
        data = resp.get_json()
        # CLI password should be masked or empty, never the real value
        assert data['cli_password'] != 'supersecret'
        assert data['cli_password'] in ('***', '')

    def test_bot_config_masks_token(self, client):
        """GET /api/bot-config should truncate bot tokens."""
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        resp = client.get('/api/bot-config')
        if resp.get_json().get('configs'):
            for cfg in resp.get_json()['configs']:
                if cfg.get('bot_token'):
                    # Should contain '...' (truncated)
                    assert '...' in cfg['bot_token'], "Bot token should be truncated"

    def test_olt_update_skips_masked_snmp(self, client):
        """PUT /api/olt/<id> should not overwrite SNMP community with '***'."""
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        # Create OLT
        resp = client.post('/api/olt',
            data=json.dumps({'name': 'Mask Test', 'ip_address': '10.0.0.98',
                             'snmp_community': 'original'}),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        olt_id = resp.get_json()['id']
        # Update with masked value
        client.put(f'/api/olt/{olt_id}',
            data=json.dumps({'snmp_community': '***'}),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        # Verify original value preserved
        resp = client.get(f'/api/olt/{olt_id}')
        data = resp.get_json()
        assert data['snmp_community'] == 'original', "Masked SNMP community should not overwrite real value"


class TestSyncLock:
    """Tests for per-OLT sync lock (Phase 2)."""

    def test_acquire_release(self):
        """Lock can be acquired and released."""
        from sync_lock import acquire_sync_lock, release_sync_lock
        token = acquire_sync_lock(999, timeout=0)
        assert token is not None
        assert release_sync_lock(999, token) is True

    def test_double_acquire_prevented(self):
        """Second acquire on same OLT returns None."""
        from sync_lock import acquire_sync_lock, release_sync_lock
        token1 = acquire_sync_lock(998, timeout=0)
        assert token1 is not None
        token2 = acquire_sync_lock(998, timeout=0)
        assert token2 is None
        release_sync_lock(998, token1)

    def test_wrong_token_release(self):
        """Releasing with wrong token returns False."""
        from sync_lock import acquire_sync_lock, release_sync_lock
        token = acquire_sync_lock(997, timeout=0)
        assert token is not None
        assert release_sync_lock(997, "wrong-token") is False
        # Clean up with correct token
        assert release_sync_lock(997, token) is True

    def test_is_sync_locked(self):
        """is_sync_locked correctly reports lock state."""
        from sync_lock import acquire_sync_lock, release_sync_lock, is_sync_locked
        assert is_sync_locked(996) is False
        token = acquire_sync_lock(996, timeout=0)
        assert is_sync_locked(996) is True
        release_sync_lock(996, token)
        assert is_sync_locked(996) is False


class TestSyncJob:
    """Tests for sync job lifecycle (Phase 3)."""

    @pytest.fixture(autouse=True)
    def _setup_db(self):
        """Set up isolated temp DB for tests that use app.app_context() directly."""
        import tempfile, os
        from sqlalchemy import create_engine as _create_engine
        _tmpdb = tempfile.NamedTemporaryFile(suffix='.db', delete=False, dir='/tmp')
        _tmpdb.close()
        _test_engine = _create_engine(f'sqlite:///{_tmpdb.name}')
        with app.app_context():
            _orig_engine = db.engines.get(None)
            db.engines[None] = _test_engine
            db.create_all()
            yield
            db.drop_all()
            if _orig_engine is not None:
                db.engines[None] = _orig_engine
            else:
                db.engines.pop(None, None)
        _test_engine.dispose()
        try:
            os.unlink(_tmpdb.name)
        except OSError:
            pass

    def test_start_and_complete_job(self):
        """SyncJob can be started and completed."""
        with app.app_context():
            from models import db, OLT, SyncJob
            from sync_job import start_sync_job, complete_sync_job
            # Create a test OLT
            olt = OLT(name='Test OLT', ip_address='10.0.0.1')
            db.session.add(olt)
            db.session.commit()

            job = start_sync_job(olt.id, sync_type='full', triggered_by='manual')
            assert job.status == 'running'
            assert job.job_id is not None
            assert job.sync_type == 'full'

            complete_sync_job(job, success=True, onu_count=10, message='Synced 10 ONUs')
            assert job.status == 'completed'
            assert job.onu_count == 10
            assert job.duration_seconds is not None
            assert job.completed_at is not None

            # Verify OLTSyncStatus was updated
            from models import OLTSyncStatus
            sync = OLTSyncStatus.query.filter_by(olt_id=olt.id).first()
            assert sync.status == 'completed'
            assert sync.job_id == job.job_id
            assert sync.sync_type == 'full'

    def test_skip_job(self):
        """Skip job creates a SyncJob with status='skipped'."""
        with app.app_context():
            from models import db, OLT
            from sync_job import skip_sync_job
            olt = OLT(name='Test OLT 2', ip_address='10.0.0.2')
            db.session.add(olt)
            db.session.commit()

            job = skip_sync_job(olt.id, sync_type='auto', triggered_by='auto')
            assert job.status == 'skipped'
            assert job.duration_seconds == 0

    def test_sync_history(self):
        """get_sync_history returns recent jobs."""
        with app.app_context():
            from models import db, OLT
            from sync_job import start_sync_job, complete_sync_job, get_sync_history
            olt = OLT(name='Test OLT 3', ip_address='10.0.0.3')
            db.session.add(olt)
            db.session.commit()

            job = start_sync_job(olt.id, sync_type='light', triggered_by='action')
            complete_sync_job(job, success=True, onu_count=5, message='OK')

            history = get_sync_history(olt.id, limit=10)
            assert len(history) >= 1
            assert history[0].status == 'completed'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
