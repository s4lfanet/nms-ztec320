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


@pytest.fixture(autouse=True)
def clear_rate_limits():
    """Clear in-memory rate limiter before each test to prevent cross-test contamination."""
    from helpers import _login_attempts
    _login_attempts.clear()
    yield
    _login_attempts.clear()


@pytest.fixture
def client():
    """Create a test client with in-memory database."""
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['WTF_CSRF_ENABLED'] = False
    app.config['SESSION_COOKIE_DOMAIN'] = None

    with app.app_context():
        db.create_all()
        # Re-seed admin user each time because db.drop_all() in teardown removes it.
        # seed_initial_data() only runs once on first import.
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

    with app.app_context():
        db.drop_all()


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
        resp = client.post('/api/auth/logout')
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
            content_type='application/json')
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
        client.post('/api/auth/logout')
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

            db.session.delete(olt)
            db.session.commit()

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

            db.session.delete(olt)
            db.session.commit()

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

            db.session.delete(olt)
            db.session.commit()


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
