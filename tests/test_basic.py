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


@pytest.fixture
def client():
    """Create a test client with in-memory database."""
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['WTF_CSRF_ENABLED'] = False
    app.config['SESSION_COOKIE_DOMAIN'] = None

    with app.app_context():
        db.create_all()
        # seed_initial_data() already ran on import — admin user exists

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
        # Login first
        client.post('/api/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'admin123'}),
            content_type='application/json')
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


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
