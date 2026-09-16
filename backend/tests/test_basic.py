"""Basic unit tests for FiberNMS API endpoints and sync logic.

Run with: py -3 -m pytest tests/ -v
Or: py -3 tests/test_basic.py
"""
import os
import sys
import io
import json
import pytest
from unittest.mock import patch

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
    _tmpdb = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
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

    def test_login_response_includes_custom_branding(self, client):
        """Regression: after logout/login, the sidebar name & logo must not
        revert to default until a hard refresh — the login response itself
        has to carry them, not just /api/auth/me (which is only re-fetched
        on a full page load, not on the client-side navigation after login).
        """
        with app.app_context():
            from models import SystemConfig, db
            db.session.add(SystemConfig(key='nms_name', value='Acme Fiber'))
            db.session.add(SystemConfig(key='nms_logo_url', value='/static/uploads/company-logo.png?v=123'))
            db.session.commit()

        resp = client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['user']['sidebar_name'] == 'Acme Fiber'
        assert data['user']['logo_url'] == '/static/uploads/company-logo.png?v=123'

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
        # Create an OLT (auto-triggers a real sync in prod — mocked here so the
        # test doesn't spawn a background thread that outlives this test's DB)
        with patch('routes_olt_settings.start_single_sync'):
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


class TestTrustedClientIP:
    """Audit finding 3: routes_auth.py and helpers.py used to read
    X-Forwarded-For directly, taking its FIRST (client-supplied, spoofable)
    value. app.py already installs ProxyFix(x_for=1, ...), which correctly
    trusts only the LAST hop of X-Forwarded-For (the value the one real
    reverse proxy in front of the app appends) — request.remote_addr should
    be used instead so a caller can't fake a fresh rate-limit bucket or a
    bogus audit-log IP by simply prepending an arbitrary first value."""

    def test_rate_limit_keys_by_trusted_hop_not_spoofed_header(self, client):
        """X-Forwarded-For: <attacker-value>, <what-the-proxy-actually-saw>
        — the rate limiter must bucket by the trusted last hop, not the
        attacker-controlled first one."""
        from helpers import _login_attempts
        client.post('/api/auth/login',
            data=json.dumps({'username': 'nonexistent', 'password': 'wrong'}),
            content_type='application/json',
            headers={'X-Forwarded-For': '9.9.9.9, 127.0.0.1'})
        assert '127.0.0.1' in _login_attempts
        assert '9.9.9.9' not in _login_attempts

    def test_spoofed_forwarded_for_cannot_reset_rate_limit_bucket(self, client):
        """A caller can't evade the 5-attempt lockout by varying only the
        spoofable first X-Forwarded-For value while the trusted last hop
        (the real connecting IP) stays the same."""
        for _ in range(5):
            client.post('/api/auth/login',
                data=json.dumps({'username': 'nonexistent', 'password': 'wrong'}),
                content_type='application/json',
                headers={'X-Forwarded-For': f'{__import__("random").randint(1, 999)}.1.1.1, 127.0.0.1'})
        resp = client.post('/api/auth/login',
            data=json.dumps({'username': 'nonexistent', 'password': 'wrong'}),
            content_type='application/json',
            headers={'X-Forwarded-For': '111.1.1.1, 127.0.0.1'})
        assert resp.status_code == 429

    def test_action_log_records_trusted_hop_not_spoofed_header(self, client):
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json',
            headers={'X-Forwarded-For': '8.8.8.8, 127.0.0.1'})
        with app.app_context():
            from models import ActionLog
            entry = ActionLog.query.filter_by(action='login').order_by(ActionLog.id.desc()).first()
            assert entry is not None
            assert entry.ip_address == '127.0.0.1'
            assert entry.ip_address != '8.8.8.8'


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


class TestCompanyLogoUpload:
    """Regression tests for the custom company logo (branding) upload feature."""

    _PNG_BYTES = b'\x89PNG\r\n\x1a\n' + b'\x00' * 32
    _FAKE_BYTES = b'not a real image, just plain text padding' * 4

    def _create_viewer(self):
        with app.app_context():
            from models import Role, User, db
            viewer_role = Role(name='LogoViewerTest', permissions='')
            db.session.add(viewer_role)
            viewer = User(username='logoviewertest', full_name='Viewer', role=viewer_role)
            viewer.set_password('viewer123')
            db.session.add(viewer)
            db.session.commit()

    def _login_admin(self, client):
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')

    def _login_viewer(self, client):
        self._create_viewer()
        client.post('/api/auth/login',
            data=json.dumps({'username': 'logoviewertest', 'password': 'viewer123'}),
            content_type='application/json')

    def teardown_method(self):
        """Remove any logo file written to disk by a test, so runs stay isolated."""
        import glob
        for f in glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static', 'uploads', 'company-logo.*')):
            try:
                os.remove(f)
            except OSError:
                pass

    def test_non_super_admin_cannot_upload_logo(self, client):
        """Only a super admin may change the company logo."""
        self._login_viewer(client)
        resp = client.post('/api/profile/logo',
            data={'logo': (io.BytesIO(self._PNG_BYTES), 'logo.png')},
            content_type='multipart/form-data',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 403

    def test_super_admin_can_upload_and_it_appears_in_branding(self, client):
        """A valid PNG upload is saved and served back via public branding + /api/auth/me."""
        self._login_admin(client)
        resp = client.post('/api/profile/logo',
            data={'logo': (io.BytesIO(self._PNG_BYTES), 'logo.png')},
            content_type='multipart/form-data',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert '/static/uploads/company-logo.png' in data['logo_url']

        branding = client.get('/api/public/branding').get_json()
        assert branding['logo_url'] == data['logo_url']

        me = client.get('/api/auth/me').get_json()
        assert me['user']['logo_url'] == data['logo_url']

    def test_upload_rejects_disguised_non_image_file(self, client):
        """A .png-named file whose bytes don't match the PNG signature is rejected."""
        self._login_admin(client)
        resp = client.post('/api/profile/logo',
            data={'logo': (io.BytesIO(self._FAKE_BYTES), 'logo.png')},
            content_type='multipart/form-data',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 400
        assert resp.get_json()['success'] is False

    def test_upload_rejects_disallowed_extension(self, client):
        """Non-image extensions (e.g. .svg, .exe) are rejected outright."""
        self._login_admin(client)
        resp = client.post('/api/profile/logo',
            data={'logo': (io.BytesIO(self._PNG_BYTES), 'logo.svg')},
            content_type='multipart/form-data',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 400

    def test_reset_removes_logo(self, client):
        """Resetting deletes the file and clears the branding override."""
        self._login_admin(client)
        client.post('/api/profile/logo',
            data={'logo': (io.BytesIO(self._PNG_BYTES), 'logo.png')},
            content_type='multipart/form-data',
            headers={'X-Requested-With': 'XMLHttpRequest'})

        resp = client.delete('/api/profile/logo', headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

        branding = client.get('/api/public/branding').get_json()
        assert branding['logo_url'] is None


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
        with patch('routes_olt_settings.start_single_sync'):
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
        with patch('routes_olt_settings.start_single_sync'):
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

    @pytest.mark.skipif(os.name != 'posix', reason='file lock (fcntl) only used on POSIX; Windows dev falls back to a single-process lock')
    def test_lock_blocks_across_separate_processes(self):
        """Regression test for a bug found live in production: without Redis,
        the sync lock fell back to a threading.Lock, which only serializes
        within ONE process. auto_sync.py's cron and the Flask app's own
        manual-sync route are two separate OS processes, so they never saw
        each other's lock — a manual "Sync" click could race a running
        auto-sync cycle undetected and hit the same OLT concurrently.
        The flock()-based file lock must actually block a second process."""
        import multiprocessing
        from sync_lock import acquire_sync_lock, release_sync_lock

        olt_id = 88888
        token = acquire_sync_lock(olt_id, timeout=0)
        assert token is not None
        try:
            ctx = multiprocessing.get_context('fork')
            q = ctx.Queue()
            p = ctx.Process(target=_child_try_acquire_lock, args=(olt_id, q))
            p.start()
            p.join(timeout=5)
            acquired_in_child = q.get(timeout=1)
            assert acquired_in_child is False, 'a separate process acquired a lock this process already holds'
        finally:
            release_sync_lock(olt_id, token)

    @pytest.mark.skipif(os.name != 'posix', reason='file lock (fcntl) only used on POSIX')
    def test_lock_file_is_world_writable(self):
        """auto_sync.py's cron and the Flask app can run as different Unix
        users (found live: root cron vs a 'salfanet' service user). A lock
        file created with the default umask-restricted mode (e.g. 0644)
        locks out whichever user didn't create it with a permission error,
        silently defeating the cross-process lock the same way the missing
        Redis case did. The file must end up 0o666 (rw for everyone) no
        matter which user's process creates it first."""
        import stat
        from sync_lock import acquire_sync_lock, release_sync_lock, _lock_file_path

        olt_id = 88887
        token = acquire_sync_lock(olt_id, timeout=0)
        assert token is not None
        try:
            mode = stat.S_IMODE(os.stat(_lock_file_path(olt_id)).st_mode)
            assert mode == 0o666, f'lock file mode was {oct(mode)}, expected 0o666'
        finally:
            release_sync_lock(olt_id, token)


def _child_try_acquire_lock(olt_id, result_queue):
    """Module-level (picklable) worker for test_lock_blocks_across_separate_processes."""
    from sync_lock import acquire_sync_lock
    token = acquire_sync_lock(olt_id, timeout=0)
    result_queue.put(token is not None)


class TestNewOltAutoSync:
    """A newly-created OLT should get an immediate full sync instead of
    sitting empty until the next auto-sync cron tick (up to 5 min away)."""

    def test_create_olt_triggers_immediate_full_sync(self, client):
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        with patch('routes_olt_settings.start_single_sync') as mock_sync:
            resp = client.post('/api/olt',
                data=json.dumps({'name': 'Fresh OLT', 'ip_address': '10.0.0.50'}),
                content_type='application/json',
                headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        olt_id = resp.get_json()['id']
        mock_sync.assert_called_once()
        args, kwargs = mock_sync.call_args
        assert args[1] == olt_id  # (app, olt_id, light=False)
        assert kwargs.get('light') is False

    def test_sync_trigger_failure_does_not_break_olt_creation(self, client):
        """If start_single_sync itself raises, OLT creation must still succeed —
        the initial sync is a convenience, not a precondition."""
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        with patch('routes_olt_settings.start_single_sync', side_effect=RuntimeError('boom')):
            resp = client.post('/api/olt',
                data=json.dumps({'name': 'Flaky Sync OLT', 'ip_address': '10.0.0.51'}),
                content_type='application/json',
                headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True


class TestSyncStalenessAlert:
    """Regression tests for alerts.py's auto-sync staleness check — catches
    the cron job dying/hanging/getting stuck, which auto_sync.py can never
    detect about its own absence (a dead cron job can't report itself)."""

    def _make_olt(self, name='Stale Test OLT', ip='10.0.0.60', snmp_enabled=True):
        from models import db, OLT
        olt = OLT(name=name, ip_address=ip, snmp_enabled=snmp_enabled)
        db.session.add(olt)
        db.session.commit()
        return olt

    def test_no_alert_when_recently_synced(self, client):
        from datetime import datetime, timedelta
        from alerts import _check_sync_staleness
        from models import db, OLTSyncStatus
        with app.app_context():
            olt = self._make_olt()
            db.session.add(OLTSyncStatus(olt_id=olt.id, status='completed',
                                          completed_at=datetime.utcnow() - timedelta(minutes=2)))
            db.session.commit()

            notifications, alerts_out = [], []
            _check_sync_staleness(olt, datetime.utcnow(), notifications, alerts_out)
            assert notifications == []
            assert alerts_out == []

    def test_no_alert_for_olt_never_synced(self, client):
        """A brand-new OLT with no OLTSyncStatus row yet must not be flagged —
        it just hasn't had its first cron tick, that's normal, not stale."""
        from datetime import datetime
        from alerts import _check_sync_staleness
        with app.app_context():
            olt = self._make_olt(name='Brand New OLT', ip='10.0.0.61')
            notifications, alerts_out = [], []
            _check_sync_staleness(olt, datetime.utcnow(), notifications, alerts_out)
            assert notifications == []

    def test_alerts_when_sync_stale(self, client):
        from datetime import datetime, timedelta
        from alerts import _check_sync_staleness
        from models import db, OLTSyncStatus
        with app.app_context():
            olt = self._make_olt(name='Stuck OLT', ip='10.0.0.62')
            db.session.add(OLTSyncStatus(olt_id=olt.id, status='running',
                                          completed_at=datetime.utcnow() - timedelta(minutes=45)))
            db.session.commit()

            notifications, alerts_out = [], []
            _check_sync_staleness(olt, datetime.utcnow(), notifications, alerts_out)
            assert len(notifications) == 1
            assert notifications[0]['category'] == 'sync_stale'
            assert notifications[0]['severity'] == 'warning'
            assert notifications[0]['olt_id'] == olt.id
            assert len(alerts_out) == 1

    def test_skips_olt_with_snmp_disabled(self, client):
        """auto_sync.py never syncs an SNMP-disabled OLT, so a stale
        completed_at there would be a false positive."""
        from datetime import datetime, timedelta
        from alerts import _check_sync_staleness
        from models import db, OLTSyncStatus
        with app.app_context():
            olt = self._make_olt(name='No SNMP OLT', ip='10.0.0.63', snmp_enabled=False)
            db.session.add(OLTSyncStatus(olt_id=olt.id, status='error',
                                          completed_at=datetime.utcnow() - timedelta(hours=5)))
            db.session.commit()

            notifications, alerts_out = [], []
            _check_sync_staleness(olt, datetime.utcnow(), notifications, alerts_out)
            assert notifications == []

    def test_auto_resolves_when_sync_recovers(self, client):
        """An open sync_stale notification must auto-resolve once a fresh
        sync completes — mirrors the existing olt_recovery pattern."""
        from datetime import datetime, timedelta
        from alerts import _check_sync_staleness
        from models import db, Notification, OLTSyncStatus
        with app.app_context():
            olt = self._make_olt(name='Recovering OLT', ip='10.0.0.64')
            sync = OLTSyncStatus(olt_id=olt.id, status='error',
                                  completed_at=datetime.utcnow() - timedelta(minutes=45))
            db.session.add(sync)
            db.session.commit()

            notifications, alerts_out = [], []
            _check_sync_staleness(olt, datetime.utcnow(), notifications, alerts_out)
            for n in notifications:
                db.session.add(Notification(**n))
            db.session.commit()

            open_notif = Notification.query.filter_by(olt_id=olt.id, category='sync_stale', resolved=False).first()
            assert open_notif is not None

            # Sync completes successfully now — staleness clears.
            sync.completed_at = datetime.utcnow()
            db.session.commit()
            _check_sync_staleness(olt, datetime.utcnow(), [], [])
            db.session.commit()

            db.session.refresh(open_notif)
            assert open_notif.resolved is True


class TestSyncJob:
    """Tests for sync job lifecycle (Phase 3)."""

    @pytest.fixture(autouse=True)
    def _setup_db(self):
        """Set up isolated temp DB for tests that use app.app_context() directly."""
        import tempfile, os
        from sqlalchemy import create_engine as _create_engine
        _tmpdb = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
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


class TestDatabaseBackup:
    """Test database backup endpoint."""

    def test_backup_db_requires_super_admin(self, client):
        """Non-super-admin cannot trigger database backup."""
        # Login as viewer
        from models import Role, User, db
        with app.app_context():
            viewer_role = Role(name='BackupTest', permissions='')
            db.session.add(viewer_role)
            viewer = User(username='backuptest', full_name='Backup', role=viewer_role)
            viewer.set_password('test123')
            db.session.add(viewer)
            db.session.commit()
        client.post('/api/auth/login',
            data=json.dumps({'username': 'backuptest', 'password': 'test123'}),
            content_type='application/json')
        resp = client.post('/api/system/backup-db',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 403

    def test_backup_db_creates_backup(self, client):
        """Super admin can create a database backup with integrity check."""
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        resp = client.post('/api/system/backup-db',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert data['size_bytes'] > 0
        assert data['integrity_check'] == 'ok'
        assert 'filename' in data

    def test_restore_db_requires_super_admin(self, client):
        """Non-super-admin cannot restore database."""
        from models import Role, User, db
        with app.app_context():
            viewer_role = Role(name='RestoreTest', permissions='')
            db.session.add(viewer_role)
            viewer = User(username='restoretest', full_name='Restore', role=viewer_role)
            viewer.set_password('test123')
            db.session.add(viewer)
            db.session.commit()
        client.post('/api/auth/login',
            data=json.dumps({'username': 'restoretest', 'password': 'test123'}),
            content_type='application/json')
        resp = client.post('/api/system/restore-db',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 403

    def test_restore_db_rejects_no_file(self, client):
        """Restore without backup file should return 400."""
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        resp = client.post('/api/system/restore-db',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 400

    def test_backup_restore_round_trip(self, client):
        """Backup then restore should preserve data integrity."""
        import io
        import sqlite3
        import tempfile

        # Login as admin
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')

        # Create a backup via the API
        resp = client.post('/api/system/backup-db',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        backup_data = resp.get_json()
        assert backup_data['integrity_check'] == 'ok'

        # Manually create a valid SQLite backup file to upload for restore test
        # (we can't download the API backup since it's deleted after creation)
        db_uri = str(db.engine.url)
        db_path = db_uri.replace('sqlite:///', '')
        tmp_backup = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        tmp_backup.close()
        src = sqlite3.connect(db_path)
        dst = sqlite3.connect(tmp_backup.name)
        src.backup(dst)
        dst.close()
        src.close()

        # Upload the backup file for restore
        with open(tmp_backup.name, 'rb') as f:
            resp = client.post('/api/system/restore-db',
                data={'backup_file': (f, 'test_backup.db')},
                content_type='multipart/form-data',
                headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        restore_data = resp.get_json()
        assert restore_data['success'] is True
        assert restore_data['integrity_check'] == 'ok'
        assert 'pre_restore_backup' in restore_data

        # Clean up
        os.remove(tmp_backup.name)

    def test_backup_restore_data_equivalence(self, client):
        """Verify row counts match across all tables after backup→restore."""
        import sqlite3
        import tempfile
        from models import db as _db

        # Login as admin and add test data
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')

        # Insert a test ONU and OLT to have data to verify
        with app.app_context():
            olt = OLT(name='EquivalenceTest', ip_address='10.99.99.99')
            _db.session.add(olt)
            _db.session.commit()
            olt_id = olt.id

        # Get row counts for all tables before backup
        db_uri = str(db.engine.url)
        db_path = db_uri.replace('sqlite:///', '')

        def get_row_counts(path):
            conn = sqlite3.connect(path)
            tables = [r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            ).fetchall()]
            counts = {}
            for t in tables:
                counts[t] = conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
            conn.close()
            return counts

        before_counts = get_row_counts(db_path)

        # Create a backup file
        tmp_backup = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        tmp_backup.close()
        src = sqlite3.connect(db_path)
        dst = sqlite3.connect(tmp_backup.name)
        src.backup(dst)
        dst.close()
        src.close()

        # Verify backup has same row counts
        backup_counts = get_row_counts(tmp_backup.name)
        assert before_counts == backup_counts, f"Backup row counts mismatch: {before_counts} vs {backup_counts}"

        # Restore via API
        with open(tmp_backup.name, 'rb') as f:
            resp = client.post('/api/system/restore-db',
                data={'backup_file': (f, 'equiv_test.db')},
                content_type='multipart/form-data',
                headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        assert resp.get_json()['integrity_check'] == 'ok'

        # Verify row counts after restore (exclude action_logs which gets a new
        # entry from the restore operation itself via log_action)
        after_counts = get_row_counts(db_path)
        for table in before_counts:
            if table == 'action_logs':
                continue
            assert before_counts[table] == after_counts[table], \
                f"Table {table}: {before_counts[table]} vs {after_counts[table]}"

        # Clean up
        os.remove(tmp_backup.name)

    def test_restore_rejects_schema_mismatch(self, client):
        """Restore with a backup missing tables should return 400."""
        import sqlite3
        import tempfile
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
        # Create an empty SQLite file (no tables = schema mismatch)
        tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        tmp.close()
        conn = sqlite3.connect(tmp.name)
        conn.execute('CREATE TABLE _dummy (id INTEGER)')
        conn.commit()
        conn.close()
        with open(tmp.name, 'rb') as f:
            resp = client.post('/api/system/restore-db',
                data={'backup_file': (f, 'empty_backup.db')},
                content_type='multipart/form-data',
                headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 400
        data = resp.get_json()
        assert 'Schema mismatch' in data['message']
        os.remove(tmp.name)


class TestFastAPIDocsSecurity:
    """Test FastAPI docs are disabled in production."""

    def test_docs_disabled_in_production(self):
        """FastAPI docs_url should be None when FLASK_ENV=production."""
        orig = os.environ.get('FLASK_ENV', '')
        os.environ['FLASK_ENV'] = 'production'
        try:
            # Re-import to pick up env change
            import importlib
            import api_async
            importlib.reload(api_async)
            assert api_async.fastapi_app.docs_url is None
            assert api_async.fastapi_app.redoc_url is None
            assert api_async.fastapi_app.openapi_url is None
        finally:
            if orig:
                os.environ['FLASK_ENV'] = orig
            else:
                os.environ.pop('FLASK_ENV', None)

    def test_docs_enabled_in_development(self):
        """FastAPI docs_url should be /docs when FLASK_ENV=development."""
        orig = os.environ.get('FLASK_ENV', '')
        os.environ['FLASK_ENV'] = 'development'
        try:
            import importlib
            import api_async
            importlib.reload(api_async)
            assert api_async.fastapi_app.docs_url == '/docs'
            assert api_async.fastapi_app.redoc_url == '/redoc'
        finally:
            if orig:
                os.environ['FLASK_ENV'] = orig
            else:
                os.environ.pop('FLASK_ENV', None)


class TestRedisRateLimitWarning:
    """Audit finding 4: warn loudly at startup when the login rate limiter
    will silently be less effective than it looks — REDIS_URL unset means
    helpers.py falls back to an in-memory, per-process attempt counter, so
    with N gunicorn/uvicorn workers the real lockout is 5*N attempts, not 5."""

    def _reload_config(self):
        import importlib
        import config
        importlib.reload(config)
        return config

    def test_warns_in_production_without_redis(self, caplog):
        orig_env = os.environ.get('FLASK_ENV', '')
        orig_redis = os.environ.get('REDIS_URL', '')
        os.environ['FLASK_ENV'] = 'production'
        os.environ.pop('REDIS_URL', None)
        try:
            with caplog.at_level('ERROR'):
                self._reload_config()
            assert any('REDIS_URL' in r.message and 'rate limiter' in r.message for r in caplog.records)
        finally:
            if orig_env:
                os.environ['FLASK_ENV'] = orig_env
            else:
                os.environ.pop('FLASK_ENV', None)
            if orig_redis:
                os.environ['REDIS_URL'] = orig_redis
            else:
                os.environ.pop('REDIS_URL', None)
            self._reload_config()

    def test_no_warning_in_production_with_redis(self, caplog):
        orig_env = os.environ.get('FLASK_ENV', '')
        orig_redis = os.environ.get('REDIS_URL', '')
        os.environ['FLASK_ENV'] = 'production'
        os.environ['REDIS_URL'] = 'redis://localhost:6379/0'
        try:
            with caplog.at_level('ERROR'):
                self._reload_config()
            assert not any('rate limiter' in r.message for r in caplog.records)
        finally:
            if orig_env:
                os.environ['FLASK_ENV'] = orig_env
            else:
                os.environ.pop('FLASK_ENV', None)
            if orig_redis:
                os.environ['REDIS_URL'] = orig_redis
            else:
                os.environ.pop('REDIS_URL', None)
            self._reload_config()

    def test_no_warning_in_development_without_redis(self, caplog):
        """The in-memory fallback is fine for a single-process dev server —
        only production (implying multi-worker) needs the warning."""
        orig_env = os.environ.get('FLASK_ENV', '')
        orig_redis = os.environ.get('REDIS_URL', '')
        os.environ['FLASK_ENV'] = 'development'
        os.environ.pop('REDIS_URL', None)
        try:
            with caplog.at_level('ERROR'):
                self._reload_config()
            assert not any('rate limiter' in r.message for r in caplog.records)
        finally:
            if orig_env:
                os.environ['FLASK_ENV'] = orig_env
            else:
                os.environ.pop('FLASK_ENV', None)
            if orig_redis:
                os.environ['REDIS_URL'] = orig_redis
            else:
                os.environ.pop('REDIS_URL', None)
            self._reload_config()


class TestForcedPasswordChange:
    """Audit finding 2: the seeded admin/admin123 account must be forced to
    change its password before the rest of the app is usable — admin123 is
    a well-known default credential with no expiry mechanism otherwise."""

    def test_fresh_install_seeds_admin_with_must_change_password(self, client):
        """Simulate a truly fresh install (no roles/users yet) and confirm
        seed_initial_data() flags the admin it creates."""
        with app.app_context():
            from models import db, User, Role
            User.query.delete()
            Role.query.delete()
            db.session.commit()

            from app import seed_initial_data
            seed_initial_data()

            admin = User.query.filter_by(username='admin').first()
            assert admin is not None
            assert admin.must_change_password is True

    def test_login_response_includes_must_change_password_flag(self, client):
        with app.app_context():
            from models import db, Role
            role = Role.query.filter_by(name='Full Access').first()
            flagged = User(username='flagged_admin', full_name='Flagged Admin',
                            role_id=role.id, is_super_admin=True, must_change_password=True)
            flagged.set_password('admin123')
            db.session.add(flagged)
            db.session.commit()

        resp = client.post('/api/auth/login',
            data=json.dumps({'username': 'flagged_admin', 'password': 'admin123'}),
            content_type='application/json')
        assert resp.status_code == 200
        assert resp.get_json()['user']['must_change_password'] is True

    def test_ordinary_user_has_flag_false(self, client):
        """A user created through the normal UI flow (not the initial seed)
        must never be forced to change their password."""
        with app.app_context():
            from models import db, Role
            role = Role.query.filter_by(name='Full Access').first()
            regular = User(username='regular_user', full_name='Regular User', role_id=role.id)
            regular.set_password('SomePass123')
            db.session.add(regular)
            db.session.commit()

        resp = client.post('/api/auth/login',
            data=json.dumps({'username': 'regular_user', 'password': 'SomePass123'}),
            content_type='application/json')
        assert resp.status_code == 200
        assert resp.get_json()['user']['must_change_password'] is False

    def test_changing_password_clears_the_flag(self, client):
        with app.app_context():
            from models import db, Role
            role = Role.query.filter_by(name='Full Access').first()
            flagged = User(username='changeme_admin', full_name='Changeme Admin',
                            role_id=role.id, is_super_admin=True, must_change_password=True)
            flagged.set_password('admin123')
            db.session.add(flagged)
            db.session.commit()

        client.post('/api/auth/login',
            data=json.dumps({'username': 'changeme_admin', 'password': 'admin123'}),
            content_type='application/json')

        resp = client.post('/api/profile',
            data=json.dumps({'password': 'BrandNewStrongPass1'}),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        assert resp.get_json()['must_change_password'] is False

        client.post('/api/auth/logout', headers={'X-Requested-With': 'XMLHttpRequest'})
        resp = client.post('/api/auth/login',
            data=json.dumps({'username': 'changeme_admin', 'password': 'BrandNewStrongPass1'}),
            content_type='application/json')
        assert resp.status_code == 200
        assert resp.get_json()['user']['must_change_password'] is False

    def test_existing_admin_not_retroactively_flagged_by_migration(self, client):
        """add_col()'s server-side default (0/False) must apply to every
        pre-existing row — an admin who already changed their password in
        the past must not suddenly be forced to change it again just
        because this column showed up in a schema migration."""
        with app.app_context():
            admin = User.query.filter_by(username='admin').first()
            assert admin is not None
            assert admin.must_change_password in (False, None)


class TestVendorTemplateCommandSequences:
    """Golden-snapshot regression tests for register_vendor_template()'s
    per-template CLI command sequences — the safety net for audit finding 5
    (refactoring the template if/elif into separate per-vendor methods).

    Each expected list was captured by RUNNING the pre-refactor code with a
    mocked Telnet connection (recording every command _send_command was
    asked to send) — it is not hand-derived from reading the code, so it
    reflects actual behavior, warts and all. The refactor's one job is to
    make these still pass unchanged: same templates, same inputs, same
    exact command sequence out. If a future change to provisioning logic
    is intentional, update the expected list deliberately — a silent diff
    here means the refactor (or any later edit) changed real behavior.
    """

    def _capture(self, template, extra=None):
        from unittest.mock import patch, MagicMock
        from telnet_client import TelnetCollector

        tc = TelnetCollector('10.0.0.1', 'admin', 'admin')
        commands = []

        def fake_send_command(self, tn, command, timeout=15):
            commands.append(command)
            return ''

        with patch.object(TelnetCollector, '_connect', lambda self: MagicMock()), \
             patch.object(TelnetCollector, '_send_command', fake_send_command), \
             patch('time.sleep', lambda *a, **k: None):
            ok, msg = tc.register_vendor_template(
                frame=1, slot=1, port=1, onu_id=1, serial='ZTEGC1234567',
                template=template, onu_type='All', tcont_profile='1G', vlan=100,
                name='TestName', description='TestDesc',
                extra=extra if extra is not None else self._default_extra(),
                is_epon=False,
            )
        return ok, msg, commands

    @staticmethod
    def _default_extra():
        return {
            'acs_url': 'http://192.168.54.254:7547', 'acs_user': 'acs', 'acs_pass': 'acs',
            'tr069_vlan': '200', 'tr069_vlan_mode': 'tag',
            'pppoe_user': 'user1', 'pppoe_pass': 'pass1',
            'vlan_profile': 'default', 'firewall_level': 'low',
            'internet_vlan': '100', 'voip_vlan': '300',
            'primary_vlan': '100', 'secondary_vlan': '200',
            'ssid1_name': 'HomeWifi', 'ssid1_pass': 'StrongPass1',
            'ssid2_name': 'GuestWifi', 'ssid2_pass': 'StrongPass2',
            'ssid_name': 'SoloWifi', 'ssid_pass': 'SoloPass1',
            'traffic_profile': '100M',
        }

    def test_bridge_template(self):
        ok, msg, commands = self._capture('bridge')
        assert ok is True
        assert commands == [
            'end', 'configure terminal', 'interface gpon-olt_1/1/1',
            'onu 1 type All sn ZTEGC1234567', 'exit', 'interface gpon-onu_1/1/1:1',
            'name TestName', 'description TestDesc',
            'tcont 1 name VLAN0100 profile 1G', 'gemport 1 tcont 1',
            'service-port 1 vport 1 user-vlan 100 vlan 100',
            'end', 'enable', 'show gpon onu state gpon-olt_1/1/1',
        ]

    def test_pppoe_template(self):
        ok, msg, commands = self._capture('pppoe')
        assert ok is True
        assert commands == [
            'end', 'configure terminal', 'interface gpon-olt_1/1/1',
            'onu 1 type All sn ZTEGC1234567', 'exit', 'interface gpon-onu_1/1/1:1',
            'name TestName', 'description TestDesc',
            'tcont 1 name VLAN0100 profile 1G', 'gemport 1 tcont 1',
            'service-port 1 vport 1 user-vlan 100 vlan 100',
            'exit', 'pon-onu-mng gpon-onu_1/1/1:1',
            'service INTERNET gemport 1 vlan 100',
            'vlan port eth_0/1 mode hybrid def-vlan 100',
            'vlan port eth_0/2 mode hybrid def-vlan 100',
            'vlan port eth_0/3 mode hybrid def-vlan 100',
            'vlan port eth_0/4 mode hybrid def-vlan 100',
            'wan-ip 1 mode pppoe username user1 password pass1 vlan-profile default host 1',
            'end', 'enable', 'show gpon onu state gpon-olt_1/1/1',
        ]

    def test_fiberhome_veip_template(self):
        ok, msg, commands = self._capture('fiberhome_veip')
        assert ok is True
        assert commands == [
            'end', 'configure terminal', 'interface gpon-olt_1/1/1',
            'onu 1 type All sn ZTEGC1234567', 'exit', 'interface gpon-onu_1/1/1:1',
            'name TestName', 'description TestDesc', 'sn-bind enable sn',
            'tcont 1 name  profile 1G', 'gemport 1 tcont 1',
            'gemport 1 traffic-limit downstream 100M',
            'tcont 2 name  profile 1G', 'gemport 2 tcont 2',
            'tcont 3 name  profile 1G', 'gemport 3 tcont 3',
            'service-port 1 vport 1 user-vlan 200 vlan 200',
            'service-port 2 vport 2 user-vlan 100 vlan 100',
            'service-port 3 vport 3 user-vlan 300 vlan 300',
            'exit', 'pon-onu-mng gpon-onu_1/1/1:1',
            'no service service1', 'no service service2', 'no service service3',
            'no wan 1 service', 'no wan-ip 1', 'no pppoe 1',
            'no wan 2 service', 'no wan-ip 2', 'no pppoe 2',
            'no wan 3 service', 'no wan-ip 3', 'no pppoe 3',
            'service service1 gemport 1 vlan 200',
            'service 2 gemport 2 vlan 100',
            'service 3 gemport 3 vlan 300',
            'vlan port veip_1 mode hybrid',
            'vlan port eth_0/1 mode tag vlan 100',
            'vlan port eth_0/2 mode tag vlan 100',
            'vlan port eth_0/3 mode tag vlan 100',
            'vlan port eth_0/4 mode tag vlan 100',
            'vlan port wifi_0/1 mode tag vlan 100',
            'tr069-mgmt 1 state unlock',
            'tr069-mgmt 1 acs http://192.168.54.254:7547 validate basic username acs password acs',
            'tr069-mgmt 1 tag pri 0 vlan 200',
            'end', 'enable', 'show gpon onu state gpon-olt_1/1/1',
        ]

    def test_zte_full_template(self):
        ok, msg, commands = self._capture('zte_full')
        assert ok is True
        assert commands == [
            'end', 'configure terminal', 'interface gpon-olt_1/1/1',
            'onu 1 type All sn ZTEGC1234567', 'exit',
            'pon', 'onu-type-if All wifi_0/1', 'onu-type-if All wifi_0/2',
            'onu-type-if All wifi_0/5', 'onu-type-if All wifi_0/6', 'exit',
            'interface gpon-onu_1/1/1:1', 'name TestName', 'description TestDesc',
            'tcont 1 name VLAN0100 profile 1G', 'gemport 1 tcont 1',
            'gemport 1 traffic-limit downstream 100M',
            'tcont 2 name VLAN200 profile 1G', 'gemport 2 tcont 2',
            'gemport 2 traffic-limit downstream 100M',
            'service-port 1 vport 1 user-vlan 100 vlan 100',
            'service-port 2 vport 2 user-vlan 200 vlan 200',
            'exit', 'pon-onu-mng gpon-onu_1/1/1:1',
            'no service VLAN0001', 'no service service1', 'no wan 1 service', 'no wan-ip 1', 'no pppoe 1',
            'no service VLAN0002', 'no service service2', 'no wan 2 service', 'no wan-ip 2', 'no pppoe 2',
            'service VLAN0100 gemport 1 iphost 1 vlan 100',
            'service VLAN200 gemport 2 vlan 200',
            'wan 1 service internet host 1',
            'vlan port eth_0/1 mode tag vlan 100',
            'vlan port eth_0/2 mode tag vlan 100',
            'vlan port eth_0/3 mode tag vlan 100',
            'vlan port eth_0/4 mode tag vlan 100',
            'vlan port wifi_0/1 mode tag vlan 100',
            'vlan port wifi_0/5 mode tag vlan 100',
            'vlan port wifi_0/2 mode tag vlan 200',
            'security-mgmt 1 state enable mode forward protocol web ftp telnet ssh https snmp tr069',
            'end', 'configure terminal', 'pon-onu-mng gpon-onu_1/1/1:1',
            'interface wifi wifi_0/1 state unlock',
            'ssid ctrl wifi_0/1 name HomeWifi hide disable',
            'ssid auth wpa wifi_0/1 wpa2-psk', 'ssid auth wpa wifi_0/1 encrypt aes',
            'ssid auth wpa wifi_0/1 key StrongPass1',
            'interface wifi wifi_0/5 state unlock',
            'ssid ctrl wifi_0/5 name GuestWifi hide disable',
            'ssid auth wpa wifi_0/5 wpa2-psk', 'ssid auth wpa wifi_0/5 encrypt aes',
            'ssid auth wpa wifi_0/5 key StrongPass2',
            'end', 'enable', 'show gpon onu state gpon-olt_1/1/wifi_0/5',
        ]

    def test_zte_single_template(self):
        ok, msg, commands = self._capture('zte_single')
        assert ok is True
        assert commands == [
            'end', 'configure terminal', 'interface gpon-olt_1/1/1',
            'onu 1 type All sn ZTEGC1234567', 'exit',
            'pon', 'onu-type-if All wifi_0/1', 'onu-type-if All wifi_0/2', 'exit',
            'interface gpon-onu_1/1/1:1', 'name TestName', 'description TestDesc',
            'tcont 1 name VLAN0100 profile 1G', 'gemport 1 tcont 1',
            'gemport 1 traffic-limit downstream 100M',
            'service-port 1 vport 1 user-vlan 100 vlan 100',
            'exit', 'pon-onu-mng gpon-onu_1/1/1:1',
            'no service INTERNET', 'no service service1', 'no wan 1 service', 'no wan-ip 1', 'no pppoe 1',
            'service INTERNET gemport 1 iphost 1 vlan 100',
            'wan 1 service internet host 1',
            'vlan port eth_0/1 mode hybrid def-vlan 100',
            'vlan port eth_0/2 mode hybrid def-vlan 100',
            'vlan port eth_0/3 mode hybrid def-vlan 100',
            'vlan port eth_0/4 mode hybrid def-vlan 100',
            'vlan port wifi_0/1 mode tag vlan 100',
            'security-mgmt 1 state enable mode forward protocol web ftp telnet ssh https snmp tr069',
            'end', 'configure terminal', 'pon-onu-mng gpon-onu_1/1/1:1',
            'interface wifi wifi_0/1 state unlock',
            'ssid ctrl wifi_0/1 name SoloWifi hide disable',
            'ssid auth wpa wifi_0/1 wpa2-psk', 'ssid auth wpa wifi_0/1 encrypt aes',
            'ssid auth wpa wifi_0/1 key SoloPass1',
            'end', 'enable', 'show gpon onu state gpon-olt_1/1/wifi_0/1',
        ]

    def test_huawei_full_template(self):
        ok, msg, commands = self._capture('huawei_full')
        assert ok is True
        assert commands == [
            'end', 'configure terminal', 'interface gpon-olt_1/1/1',
            'onu 1 type All sn ZTEGC1234567', 'exit', 'interface gpon-onu_1/1/1:1',
            'name TestName', 'description TestDesc', 'sn-bind enable sn',
            'tcont 1 name  profile 1G', 'gemport 1 tcont 1',
            'service-port 1 vport 1 user-vlan 1010 vlan 1010',
            'service-port 2 vport 1 user-vlan 100 vlan 100',
            'service-port 3 vport 1 user-vlan 300 vlan 300',
            'exit', 'pon-onu-mng gpon-onu_1/1/1:1',
            'service ServiceONU1 gemport 1',
            'wan-ip 1 mode dhcp vlan-profile default host 1',
            'end', 'enable', 'show gpon onu state gpon-olt_1/1/1',
        ]

    def test_zte_multi_template(self):
        ok, msg, commands = self._capture('zte_multi')
        assert ok is True
        assert commands == [
            'end', 'configure terminal', 'interface gpon-olt_1/1/1',
            'onu 1 type All sn ZTEGC1234567', 'exit',
            'pon', 'onu-type-if All wifi_0/1', 'onu-type-if All wifi_0/2',
            'onu-type-if All wifi_0/5', 'onu-type-if All wifi_0/6', 'exit',
            'interface gpon-onu_1/1/1:1', 'name TestName', 'description TestDesc',
            'exit', 'pon-onu-mng gpon-onu_1/1/1:1',
            'end', 'configure terminal', 'pon-onu-mng gpon-onu_1/1/1:1',
            'interface wifi wifi_0/1 state unlock',
            'ssid ctrl wifi_0/1 name HomeWifi hide disable',
            'ssid auth wpa wifi_0/1 wpa2-psk', 'ssid auth wpa wifi_0/1 encrypt aes',
            'ssid auth wpa wifi_0/1 key StrongPass1',
            'interface wifi wifi_0/5 state unlock',
            'ssid ctrl wifi_0/5 name GuestWifi hide disable',
            'ssid auth wpa wifi_0/5 wpa2-psk', 'ssid auth wpa wifi_0/5 encrypt aes',
            'ssid auth wpa wifi_0/5 key StrongPass2',
            'end', 'enable', 'show gpon onu state gpon-olt_1/1/wifi_0/5',
        ]

    def test_zte_multi_does_not_crash_when_traffic_profile_missing(self):
        """Regression: _provision_zte_multi's `global_download = extra.get(
        'traffic_profile', '') or traffic_profile` referenced a bare
        `traffic_profile` name that was never defined in this method's
        scope — a NameError waiting to happen whenever a caller's extra
        dict omits (or empties) traffic_profile. The golden-snapshot tests
        above never caught it because their shared default extra always
        supplies a truthy traffic_profile, short-circuiting the `or`
        before it touched the undefined name."""
        extra = self._default_extra()
        extra.pop('traffic_profile', None)  # exactly the condition that used to crash
        ok, msg, commands = self._capture('zte_multi', extra=extra)
        assert ok is True, f'expected success, got: {msg}'


class TestCliSanitize:
    """Unit tests for cli_sanitize.py — the choke point every free-text
    field passes through before being interpolated into a ZTE OLT CLI
    command over Telnet. Each CLI command is exactly one line, so a
    newline/CR smuggled through a field like SSID name or description lets
    an attacker with only add_onu permission inject a second, arbitrary
    command into the same Telnet session."""

    def test_rejects_newline_injection(self):
        from cli_sanitize import sanitize_cli_text, CliValidationError
        with pytest.raises(CliValidationError):
            sanitize_cli_text('MySSID\nreboot', 'ssid_name')

    def test_rejects_carriage_return_injection(self):
        from cli_sanitize import sanitize_cli_text, CliValidationError
        with pytest.raises(CliValidationError):
            sanitize_cli_text('MySSID\rno onu 1', 'ssid_name')

    def test_rejects_tab_and_other_control_chars(self):
        from cli_sanitize import sanitize_cli_text, CliValidationError
        for bad in ('a\tb', 'a\x00b', 'a\x1fb', 'a\x7fb'):
            with pytest.raises(CliValidationError):
                sanitize_cli_text(bad, 'field')

    def test_rejects_shell_cli_metacharacters(self):
        from cli_sanitize import sanitize_cli_text, CliValidationError
        for bad in ('a;b', 'a|b', 'a&b', 'a`b', 'a$b', 'a<b', 'a>b', 'a"b', "a'b", 'a\\b'):
            with pytest.raises(CliValidationError):
                sanitize_cli_text(bad, 'field')

    def test_valid_alphanumeric_passes_unchanged(self):
        from cli_sanitize import sanitize_cli_text
        assert sanitize_cli_text('HomeWifi123', 'ssid_name') == 'HomeWifi123'
        assert sanitize_cli_text('Strong-Pass_99.', 'ssid_pass') == 'Strong-Pass_99.'

    def test_space_collapsed_to_underscore(self):
        """A raw space breaks ZTE's space-delimited CLI syntax — not a
        security issue by itself (dangerous chars are already rejected
        above), so it's collapsed rather than rejected, matching the
        pre-existing SSID-name convention."""
        from cli_sanitize import sanitize_cli_text
        assert sanitize_cli_text('My Home SSID', 'ssid_name') == 'My_Home_SSID'

    def test_rejects_over_length(self):
        from cli_sanitize import sanitize_cli_text, CliValidationError
        with pytest.raises(CliValidationError):
            sanitize_cli_text('A' * 33, 'ssid_name', max_len=32)
        # exactly at the limit is fine
        assert sanitize_cli_text('A' * 32, 'ssid_name', max_len=32) == 'A' * 32

    def test_empty_allowed_by_default_rejected_when_required(self):
        from cli_sanitize import sanitize_cli_text, CliValidationError
        assert sanitize_cli_text('', 'description') == ''
        assert sanitize_cli_text(None, 'description') == ''
        with pytest.raises(CliValidationError):
            sanitize_cli_text('', 'serial', allow_empty=False)

    def test_rejects_non_string_type(self):
        from cli_sanitize import sanitize_cli_text, CliValidationError
        with pytest.raises(CliValidationError):
            sanitize_cli_text(['a', 'b'], 'field')

    def test_sanitize_cli_int_valid_and_invalid(self):
        from cli_sanitize import sanitize_cli_int, CliValidationError
        assert sanitize_cli_int('100', 'vlan') == 100
        assert sanitize_cli_int(100, 'vlan') == 100
        with pytest.raises(CliValidationError):
            sanitize_cli_int('100; reboot', 'vlan')
        with pytest.raises(CliValidationError):
            sanitize_cli_int('abc', 'vlan')
        with pytest.raises(CliValidationError):
            sanitize_cli_int(5000, 'vlan', min_val=1, max_val=4094)
        assert sanitize_cli_int(None, 'vlan', default=100) == 100

    def test_sanitize_cli_dict_recursive_and_reports_path(self):
        from cli_sanitize import sanitize_cli_dict, CliValidationError
        clean = sanitize_cli_dict({
            'ssids': [
                {'name': 'Home Wifi', 'pass': 'GoodPass1'},
            ],
            'acs_url': 'http://192.168.1.1:7547',
        })
        assert clean['ssids'][0]['name'] == 'Home_Wifi'
        assert clean['acs_url'] == 'http://192.168.1.1:7547'

        with pytest.raises(CliValidationError) as exc_info:
            sanitize_cli_dict({'ssids': [{'name': 'Evil\nreboot'}]})
        assert 'ssids[0].name' in str(exc_info.value)


class TestProvisioningInputSanitization:
    """HTTP-level regression tests: the /api/provision/unified and
    /api/pre-register endpoints must reject a CLI-injection attempt with a
    clean 400 — before any Telnet connection is even attempted — and must
    keep accepting ordinary, well-formed provisioning requests."""

    def _login_admin(self, client):
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')

    def _make_olt(self, name='Injection Test OLT', ip='10.0.0.70'):
        olt = OLT(name=name, ip_address=ip, cli_username='admin', cli_password='pw')
        db.session.add(olt)
        db.session.commit()
        return olt

    def test_ssid_name_newline_injection_rejected(self, client):
        """A newline in wifi_config.ssids[].name must never reach
        telnet_client.py — the request is rejected outright with 400."""
        self._login_admin(client)
        with app.app_context():
            olt = self._make_olt()
            olt_id = olt.id

        resp = client.post('/api/provision/unified',
            data=json.dumps({
                'olt_id': olt_id, 'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 1,
                'serial': 'ZTEGCTEST01', 'onu_type': 'All',
                'services': [{'service_type': 'internet', 'vlan': 100}],
                'wifi_config': {'ssids': [{'port': 'wifi_0/1', 'name': 'Evil\nno onu 1', 'pass': ''}]},
            }),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 400
        data = resp.get_json()
        assert data['success'] is False
        assert 'wifi_config' in data['message'] or 'ssid' in data['message'].lower()

    def test_acs_password_newline_injection_rejected(self, client):
        """Same for tr069_config.acs_pass — a newline there would let a
        caller smuggle a command into the TR069/ACS provisioning step."""
        self._login_admin(client)
        with app.app_context():
            olt = self._make_olt(name='TR069 Injection OLT', ip='10.0.0.71')
            olt_id = olt.id

        resp = client.post('/api/provision/unified',
            data=json.dumps({
                'olt_id': olt_id, 'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 1,
                'serial': 'ZTEGCTEST02', 'onu_type': 'All',
                'services': [{'service_type': 'internet', 'vlan': 100}],
                'tr069_config': {'acs_url': 'http://x', 'acs_user': 'a', 'acs_pass': 'pw\nreboot'},
            }),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 400
        assert resp.get_json()['success'] is False

    def test_ssid_name_too_long_rejected(self, client):
        self._login_admin(client)
        with app.app_context():
            olt = self._make_olt(name='Length Test OLT', ip='10.0.0.72')
            olt_id = olt.id

        resp = client.post('/api/provision/unified',
            data=json.dumps({
                'olt_id': olt_id, 'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 1,
                'serial': 'ZTEGCTEST03', 'onu_type': 'All',
                'services': [{'service_type': 'internet', 'vlan': 100}],
                'wifi_config': {'ssids': [{'port': 'wifi_0/1', 'name': 'A' * 40, 'pass': ''}]},
            }),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 400
        assert resp.get_json()['success'] is False

    def test_valid_ssid_name_still_provisions_successfully(self, client):
        """No-regression check: a normal alphanumeric SSID name must still
        reach telnet_client.py and provision successfully. The actual
        Telnet I/O is mocked out — this only proves validation doesn't
        block legitimate input."""
        from unittest.mock import MagicMock
        self._login_admin(client)
        with app.app_context():
            olt = self._make_olt(name='Valid Provision OLT', ip='10.0.0.73')
            olt_id = olt.id

        mock_tc = MagicMock()
        mock_tc.register_unified.return_value = (True, 'ONU registered')
        with patch('snmp_collector.create_cli_collector', return_value=mock_tc):
            resp = client.post('/api/provision/unified',
                data=json.dumps({
                    'olt_id': olt_id, 'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 1,
                    'serial': 'ZTEGCTEST04', 'onu_type': 'All',
                    'services': [{'service_type': 'internet', 'vlan': 100}],
                    'wifi_config': {'ssids': [{'port': 'wifi_0/1', 'name': 'HomeWifi123', 'pass': 'StrongPass1'}]},
                }),
                content_type='application/json',
                headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        # The sanitized (unchanged, since it was already clean) SSID name
        # must be what actually reached telnet_client.py.
        _, kwargs = mock_tc.register_unified.call_args
        assert kwargs['wifi_config']['ssids'][0]['name'] == 'HomeWifi123'

    def test_pre_register_extra_ssid_newline_rejected(self, client):
        """The legacy /api/pre-register endpoint (extra.ssid_name) must be
        covered by the same sanitization as /api/provision/unified."""
        self._login_admin(client)
        with app.app_context():
            olt = self._make_olt(name='Legacy Injection OLT', ip='10.0.0.74')
            olt_id = olt.id

        resp = client.post('/api/pre-register',
            data=json.dumps({
                'olt_id': olt_id, 'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 1,
                'serial': 'ZTEGCTEST05', 'onu_type': 'All', 'vlan': 100,
                'template': 'zte_single',
                'extra': {'ssid_name': 'Evil\nno onu 1'},
            }),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 400
        assert resp.get_json()['success'] is False

    def test_json_stringified_services_field_not_wrongly_rejected(self, client):
        """Regression: extra['services'] arrives as a JSON-ENCODED STRING
        (RegisterWizard.tsx does `services: JSON.stringify(next)`) for the
        zte_multi template. Sanitizing it like an ordinary free-text field
        rejected every real multi-service request — the quote characters
        JSON requires tripped the dangerous-character check, and any
        non-trivial payload blew past the 64-char generic cap. It must be
        parsed and validated as a JSON container instead."""
        self._login_admin(client)
        with app.app_context():
            olt = self._make_olt(name='JSON Container OLT', ip='10.0.0.75')
            olt_id = olt.id

        services_json = json.dumps([
            {'enabled': True, 'service_type': 'internet', 'vlans': [100],
             'wan_mode': 'nat', 'username': 'user1', 'password': 'pass1'},
            {'enabled': True, 'service_type': 'iptv', 'vlans': [200], 'mvlan': 200},
        ])
        resp = client.post('/api/pre-register',
            data=json.dumps({
                'olt_id': olt_id, 'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 1,
                'serial': 'ZTEGCTEST06', 'onu_type': 'All', 'vlan': 100,
                'template': 'zte_multi',
                'extra': {'services': services_json},
            }),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        # Must get past sanitization (a Telnet-connect failure to the fake
        # OLT IP is fine and expected here — a 400 from our own validation
        # is the regression this test guards against).
        assert resp.status_code == 200
        assert resp.get_json()['message'] != 'Input tidak valid'

    def test_injection_inside_json_stringified_services_still_rejected(self, client):
        """The JSON-container carve-out above must not become a bypass —
        a newline smuggled inside one of the JSON array's own string
        fields (e.g. a per-service PPPoE username) must still be caught,
        since it flows into an f-string CLI command once parsed."""
        self._login_admin(client)
        with app.app_context():
            olt = self._make_olt(name='JSON Container Injection OLT', ip='10.0.0.76')
            olt_id = olt.id

        services_json = json.dumps([
            {'enabled': True, 'service_type': 'internet', 'vlans': [100],
             'wan_mode': 'nat', 'username': 'evil\nreboot', 'password': 'pass1'},
        ])
        resp = client.post('/api/pre-register',
            data=json.dumps({
                'olt_id': olt_id, 'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 1,
                'serial': 'ZTEGCTEST07', 'onu_type': 'All', 'vlan': 100,
                'template': 'zte_multi',
                'extra': {'services': services_json},
            }),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 400
        assert resp.get_json()['success'] is False


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
