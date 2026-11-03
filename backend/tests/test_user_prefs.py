"""Tests for per-user theme/language preferences (Fase 10).

Covers: /api/auth/me exposes theme+language, /api/profile accepts and
validates both fields, login error_code is present for i18n translation.
"""
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import User, Role


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

    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False
    app.config['SESSION_COOKIE_DOMAIN'] = None
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


def _login(client):
    return client.post('/api/auth/login',
                       json={'username': 'admin', 'password': 'admin123'},
                       headers={'X-Requested-With': 'XMLHttpRequest'})


class TestUserPreferences:
    def test_me_returns_theme_and_language_defaults(self, client):
        _login(client)
        resp = client.get('/api/auth/me')
        assert resp.status_code == 200
        u = resp.get_json()['user']
        assert u['theme'] == 'system'
        assert u['language'] == 'id'

    def test_login_returns_theme_and_language(self, client):
        resp = _login(client)
        assert resp.status_code == 200
        u = resp.get_json()['user']
        assert 'theme' in u and 'language' in u

    def test_profile_update_theme_and_language(self, client):
        _login(client)
        resp = client.post('/api/profile',
                           json={'theme': 'light', 'language': 'en'},
                           headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True
        u = client.get('/api/auth/me').get_json()['user']
        assert u['theme'] == 'light'
        assert u['language'] == 'en'

    def test_profile_rejects_invalid_theme(self, client):
        _login(client)
        resp = client.post('/api/profile',
                           json={'theme': 'purple'},
                           headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 400
        assert resp.get_json()['error_code'] == 'invalid_theme'

    def test_profile_rejects_invalid_language(self, client):
        _login(client)
        resp = client.post('/api/profile',
                           json={'language': 'fr'},
                           headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 400
        assert resp.get_json()['error_code'] == 'invalid_language'

    def test_profile_system_theme_accepted(self, client):
        _login(client)
        resp = client.post('/api/profile',
                           json={'theme': 'system'},
                           headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200


class TestErrorCodes:
    def test_login_invalid_credentials_has_error_code(self, client):
        resp = client.post('/api/auth/login',
                           json={'username': 'admin', 'password': 'wrong'},
                           headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 401
        assert resp.get_json()['error_code'] == 'invalid_credentials'
