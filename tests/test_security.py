"""Security regression tests — Phases 1-10.

Tests:
  A. Internal API key isolation (SECRET_KEY vs INTERNAL_API_KEY)
  B. WebSocket authentication (missing/invalid/expired/valid token)
  C. WebSocket authorization (permission, inactive user, unknown user, OLT access)
  D. Dashboard WebSocket (authorized/unauthorized)
  E. /broadcast endpoint (no key, wrong key, external source, valid localhost)

Run with: py -3 -m pytest tests/test_security.py -v
"""
import os
import sys
import json
import time
import hmac
import hashlib
import tempfile
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import User, Role, OLT


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def setup_db():
    """Create isolated temp database with test users and OLTs."""
    from sqlalchemy import create_engine as _create_engine

    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False
    app.config['SESSION_COOKIE_DOMAIN'] = None
    _tmpdb = tempfile.NamedTemporaryFile(suffix='.db', delete=False, dir='/tmp')
    _tmpdb.close()
    _test_engine = _create_engine(f'sqlite:///{_tmpdb.name}')

    with app.app_context():
        _orig_engine = db.engines.get(None)
        db.engines[None] = _test_engine
        db.create_all()

        # Roles
        admin_role = Role(name='Full Access', description='Full admin',
                          permissions='all_olt', is_system=True)
        db.session.add(admin_role)
        db.session.flush()

        viewer_role = Role(name='Viewer', description='View only',
                           permissions='view_dashboard,view_onus', is_system=False)
        db.session.add(viewer_role)
        db.session.flush()

        limited_role = Role(name='Limited', description='No OLT access',
                           permissions='', is_system=False)
        db.session.add(limited_role)
        db.session.flush()

        # Users
        admin = User(username='admin', full_name='Admin', is_super_admin=True,
                     role_id=admin_role.id)
        admin.set_password('admin123')
        db.session.add(admin)

        viewer = User(username='viewer', full_name='Viewer', is_super_admin=False,
                      role_id=viewer_role.id)
        viewer.set_password('viewer123')
        db.session.add(viewer)

        limited = User(username='limited', full_name='Limited', is_super_admin=False,
                       role_id=limited_role.id)
        limited.set_password('limited123')
        db.session.add(limited)

        # OLTs
        olt1 = OLT(name='OLT-1', ip_address='10.0.0.1')
        db.session.add(olt1)
        olt2 = OLT(name='OLT-2', ip_address='10.0.0.2')
        db.session.add(olt2)
        db.session.commit()

        admin_id = admin.id
        viewer_id = viewer.id
        limited_id = limited.id
        olt1_id = olt1.id
        olt2_id = olt2.id

    yield {
        'admin_id': admin_id,
        'viewer_id': viewer_id,
        'limited_id': limited_id,
        'olt1_id': olt1_id,
        'olt2_id': olt2_id,
    }

    with app.app_context():
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


def _make_ws_token(user_id: int, secret: str, expiry: int = None) -> str:
    """Create a WebSocket auth token for testing."""
    if expiry is None:
        expiry = int(time.time()) + 60
    payload = f"{user_id}.{expiry}"
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


# ---------------------------------------------------------------------------
# A. Internal API Key Isolation
# ---------------------------------------------------------------------------
class TestInternalAPIKey:
    """Verify INTERNAL_API_KEY is never derived from SECRET_KEY."""

    def test_secret_key_does_not_authenticate_internal_api(self, setup_db):
        """SECRET_KEY alone MUST NOT authenticate internal API."""
        from api_async import _get_internal_api_key
        internal_key = _get_internal_api_key()
        secret_key = app.config.get('SECRET_KEY', '')
        # They must not be the same
        assert internal_key != secret_key, \
            "INTERNAL_API_KEY must not equal SECRET_KEY"

    def test_internal_key_not_empty(self):
        """INTERNAL_API_KEY must be set (by run_server.py or env)."""
        from api_async import _get_internal_api_key
        assert _get_internal_api_key(), "INTERNAL_API_KEY must not be empty"

    def test_valid_internal_key_allowed(self, setup_db):
        """Valid INTERNAL_API_KEY → /broadcast allowed (from localhost)."""
        from api_async import _get_internal_api_key
        from fastapi.testclient import TestClient
        from api_async import fastapi_app
        client = TestClient(fastapi_app)
        resp = client.post(
            "/broadcast",
            json={"channel": "test", "event": "test", "data": {}},
            headers={"X-Internal-Key": _get_internal_api_key()},
        )
        assert resp.status_code == 200

    def test_invalid_internal_key_denied(self, setup_db):
        """Invalid INTERNAL_API_KEY → /broadcast denied."""
        from fastapi.testclient import TestClient
        from api_async import fastapi_app
        client = TestClient(fastapi_app)
        resp = client.post(
            "/broadcast",
            json={"channel": "test", "event": "test", "data": {}},
            headers={"X-Internal-Key": "wrong-key-12345"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# B. WebSocket Authentication
# ---------------------------------------------------------------------------
class TestWSAuthentication:
    """Test WebSocket token verification — _verify_ws_token()."""

    def test_missing_token(self):
        """Missing token → invalid."""
        from api_async import _verify_ws_token
        valid, uid = _verify_ws_token(None)
        assert valid is False
        assert uid is None

    def test_empty_token(self):
        """Empty token → invalid."""
        from api_async import _verify_ws_token
        valid, uid = _verify_ws_token("")
        assert valid is False
        assert uid is None

    def test_invalid_token_format(self):
        """Malformed token → invalid."""
        from api_async import _verify_ws_token
        valid, uid = _verify_ws_token("garbage")
        assert valid is False
        assert uid is None

    def test_invalid_signature(self, setup_db):
        """Token with wrong signature → invalid."""
        from api_async import _verify_ws_token
        token = _make_ws_token(setup_db['admin_id'], "wrong-secret")
        valid, uid = _verify_ws_token(token)
        assert valid is False
        assert uid is None

    def test_expired_token(self, setup_db):
        """Expired token → invalid."""
        from api_async import _verify_ws_token
        from api_async import _get_internal_api_key
        past_expiry = int(time.time()) - 10
        token = _make_ws_token(setup_db['admin_id'], _get_internal_api_key(), expiry=past_expiry)
        valid, uid = _verify_ws_token(token)
        assert valid is False
        assert uid is None

    def test_valid_token(self, setup_db):
        """Valid token → valid with correct user_id."""
        from api_async import _verify_ws_token, _get_internal_api_key
        token = _make_ws_token(setup_db['admin_id'], _get_internal_api_key())
        valid, uid = _verify_ws_token(token)
        assert valid is True
        assert uid == setup_db['admin_id']


# ---------------------------------------------------------------------------
# C. WebSocket Authorization
# ---------------------------------------------------------------------------
class TestWSAuthorization:
    """Test _authorize_ws_user() — user existence, active, permission, OLT access."""

    def test_admin_with_authorized_olt(self, setup_db):
        """Admin (all_olt perm) + existing OLT → allowed."""
        from api_async import _authorize_ws_user
        with app.app_context():
            ok, reason = _authorize_ws_user(setup_db['admin_id'], 'settings_ip_olts',
                                            olt_id=setup_db['olt1_id'])
            assert ok is True

    def test_viewer_without_olt_permission(self, setup_db):
        """Viewer (no settings_ip_olts) + OLT → denied."""
        from api_async import _authorize_ws_user
        with app.app_context():
            ok, reason = _authorize_ws_user(setup_db['viewer_id'], 'settings_ip_olts',
                                            olt_id=setup_db['olt1_id'])
            assert ok is False
            assert 'permission' in reason.lower() or 'insufficient' in reason.lower()

    def test_viewer_with_view_onus_permission(self, setup_db):
        """Viewer (has view_onus) + existing OLT → allowed for view_onus."""
        from api_async import _authorize_ws_user
        with app.app_context():
            ok, reason = _authorize_ws_user(setup_db['viewer_id'], 'view_onus',
                                            olt_id=setup_db['olt1_id'])
            assert ok is True

    def test_nonexistent_olt(self, setup_db):
        """Valid user + non-existent OLT → denied."""
        from api_async import _authorize_ws_user
        with app.app_context():
            ok, reason = _authorize_ws_user(setup_db['admin_id'], 'settings_ip_olts',
                                            olt_id=99999)
            assert ok is False
            assert 'not found' in reason.lower()

    def test_unknown_user(self, setup_db):
        """Unknown user_id → denied."""
        from api_async import _authorize_ws_user
        with app.app_context():
            ok, reason = _authorize_ws_user(99999, 'settings_ip_olts')
            assert ok is False
            assert 'not found' in reason.lower()

    def test_user_without_required_permission(self, setup_db):
        """Limited user (no permissions) → denied."""
        from api_async import _authorize_ws_user
        with app.app_context():
            ok, reason = _authorize_ws_user(setup_db['limited_id'], 'settings_ip_olts')
            assert ok is False
            assert 'permission' in reason.lower() or 'insufficient' in reason.lower()

    def test_dashboard_permission_admin(self, setup_db):
        """Admin → has view_dashboard → allowed."""
        from api_async import _authorize_ws_user
        with app.app_context():
            ok, reason = _authorize_ws_user(setup_db['admin_id'], 'view_dashboard')
            assert ok is True

    def test_dashboard_permission_viewer(self, setup_db):
        """Viewer → has view_dashboard → allowed."""
        from api_async import _authorize_ws_user
        with app.app_context():
            ok, reason = _authorize_ws_user(setup_db['viewer_id'], 'view_dashboard')
            assert ok is True

    def test_dashboard_permission_limited(self, setup_db):
        """Limited user → no view_dashboard → denied."""
        from api_async import _authorize_ws_user
        with app.app_context():
            ok, reason = _authorize_ws_user(setup_db['limited_id'], 'view_dashboard')
            assert ok is False


# ---------------------------------------------------------------------------
# D. Dashboard WebSocket
# ---------------------------------------------------------------------------
class TestDashboardWS:
    """Test /ws/dashboard authorization."""

    def test_authorized_user_dashboard(self, setup_db):
        """User with view_dashboard → allowed."""
        from api_async import _authorize_ws_user
        with app.app_context():
            ok, _ = _authorize_ws_user(setup_db['admin_id'], 'view_dashboard')
            assert ok is True

    def test_unauthorized_user_dashboard(self, setup_db):
        """User without view_dashboard → denied."""
        from api_async import _authorize_ws_user
        with app.app_context():
            ok, reason = _authorize_ws_user(setup_db['limited_id'], 'view_dashboard')
            assert ok is False


# ---------------------------------------------------------------------------
# E. /broadcast Endpoint
# ---------------------------------------------------------------------------
class TestBroadcast:
    """Test /broadcast security — internal key + localhost restriction."""

    def test_no_internal_key_denied(self, setup_db):
        """No X-Internal-Key → denied."""
        from fastapi.testclient import TestClient
        from api_async import fastapi_app
        client = TestClient(fastapi_app)
        resp = client.post(
            "/broadcast",
            json={"channel": "test", "event": "test", "data": {}},
        )
        assert resp.status_code == 403

    def test_wrong_key_denied(self, setup_db):
        """Wrong X-Internal-Key → denied."""
        from fastapi.testclient import TestClient
        from api_async import fastapi_app
        client = TestClient(fastapi_app)
        resp = client.post(
            "/broadcast",
            json={"channel": "test", "event": "test", "data": {}},
            headers={"X-Internal-Key": "definitely-wrong"},
        )
        assert resp.status_code == 403

    def test_valid_key_external_source_denied(self, setup_db):
        """Valid key + external source (X-Forwarded-For) → denied."""
        from api_async import _get_internal_api_key
        from fastapi.testclient import TestClient
        from api_async import fastapi_app
        client = TestClient(fastapi_app)
        resp = client.post(
            "/broadcast",
            json={"channel": "test", "event": "test", "data": {}},
            headers={
                "X-Internal-Key": _get_internal_api_key(),
                "X-Forwarded-For": "203.0.113.1",
            },
        )
        assert resp.status_code == 403

    def test_valid_key_localhost_allowed(self, setup_db):
        """Valid key + localhost → allowed."""
        from api_async import _get_internal_api_key
        from fastapi.testclient import TestClient
        from api_async import fastapi_app
        client = TestClient(fastapi_app)
        resp = client.post(
            "/broadcast",
            json={"channel": "test", "event": "test", "data": {}},
            headers={"X-Internal-Key": _get_internal_api_key()},
        )
        assert resp.status_code == 200

    def test_secret_key_does_not_authenticate_broadcast(self, setup_db):
        """SECRET_KEY used as X-Internal-Key → denied (must not work)."""
        from fastapi.testclient import TestClient
        from api_async import fastapi_app
        secret_key = app.config.get('SECRET_KEY', '')
        client = TestClient(fastapi_app)
        resp = client.post(
            "/broadcast",
            json={"channel": "test", "event": "test", "data": {}},
            headers={"X-Internal-Key": secret_key},
        )
        # If SECRET_KEY == INTERNAL_API_KEY this would pass — it must NOT
        from api_async import _get_internal_api_key
        if secret_key != _get_internal_api_key():
            assert resp.status_code == 403
        else:
            pytest.fail("SECRET_KEY equals INTERNAL_API_KEY — key isolation broken")


# ---------------------------------------------------------------------------
# F. CORS Hardening
# ---------------------------------------------------------------------------
class TestCORS:
    """Test CORS configuration — no wildcard in production."""

    def test_no_wildcard_in_origins(self):
        """Wildcard * must never appear in allowed origins."""
        from api_async import _get_allowed_origins
        origins = _get_allowed_origins()
        assert '*' not in origins, "Wildcard must never be in allowed origins"

    def test_production_excludes_localhost(self):
        """Production mode must not include localhost origins."""
        from api_async import _get_allowed_origins
        orig_env = os.environ.get('FLASK_ENV', '')
        os.environ['FLASK_ENV'] = 'production'
        try:
            origins = _get_allowed_origins()
            for o in origins:
                assert 'localhost' not in o, f"Production must not allow localhost: {o}"
                assert '127.0.0.1' not in o, f"Production must not allow 127.0.0.1: {o}"
        finally:
            if orig_env:
                os.environ['FLASK_ENV'] = orig_env
            else:
                os.environ.pop('FLASK_ENV', None)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
