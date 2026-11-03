"""Tests for Fase 14 Web Push (VAPID) channel.

Covers: VAPID key generation/endpoint, subscribe/unsubscribe upsert,
notify_push flag on alert rules, and test-push routing (pywebpush mocked).
"""
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import User, Role, PushSubscription, AlertRule, SystemConfig


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


ENDPOINT = 'https://push.example.com/sub/abc123'
KEYS = {'p256dh': 'BKx7f0dGhU5vN4cQz9YxF8kL0mPqRsTuVwXyZ1234567890ab', 'auth': 'dGVzdGF1dGhzZWNyZXQ='}


class TestPushEndpoints:
    def test_vapid_key_generated_and_returned(self, client):
        _login(client)
        resp = client.get('/api/push/vapid-key')
        assert resp.status_code == 200
        key = resp.get_json()['public_key']
        assert len(key) > 60  # 65-byte uncompressed point, base64url
        # Stored in SystemConfig, stable across calls
        assert client.get('/api/push/vapid-key').get_json()['public_key'] == key
        with app.app_context():
            assert SystemConfig.query.filter_by(key='vapid_private_key').first() is not None

    def test_subscribe_and_upsert(self, client):
        _login(client)
        resp = client.post('/api/push/subscribe',
                           json={'endpoint': ENDPOINT, 'keys': KEYS},
                           headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        # Re-subscribe same endpoint → still one row
        client.post('/api/push/subscribe',
                    json={'endpoint': ENDPOINT, 'keys': KEYS},
                    headers={'X-Requested-With': 'XMLHttpRequest'})
        with app.app_context():
            assert PushSubscription.query.filter_by(endpoint=ENDPOINT).count() == 1

    def test_subscribe_rejects_bad_payload(self, client):
        _login(client)
        resp = client.post('/api/push/subscribe', json={'endpoint': 'not-https'},
                           headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 400

    def test_unsubscribe(self, client):
        _login(client)
        client.post('/api/push/subscribe',
                    json={'endpoint': ENDPOINT, 'keys': KEYS},
                    headers={'X-Requested-With': 'XMLHttpRequest'})
        resp = client.post('/api/push/unsubscribe', json={'endpoint': ENDPOINT},
                           headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        with app.app_context():
            assert PushSubscription.query.filter_by(endpoint=ENDPOINT).count() == 0

    def test_requires_login(self, client):
        assert client.get('/api/push/vapid-key').status_code in (302, 401, 403)
        assert client.post('/api/push/subscribe', json={}).status_code in (302, 401, 403)


class TestPushRuleFlag:
    def test_alert_rule_notify_push_default_and_update(self, client):
        _login(client)
        with app.app_context():
            rule = AlertRule(name='Test Rule')
            db.session.add(rule)
            db.session.commit()
            assert rule.notify_push is False
            rid = rule.id
        # Serialized in GET rules
        rules = client.get('/api/alert-rules').get_json()['rules']
        assert any(r['id'] == rid and r.get('notify_push') is False for r in rules)
        # PUT whitelist accepts notify_push
        resp = client.put(f'/api/alert-rules/{rid}', json={'notify_push': True},
                          headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        with app.app_context():
            assert db.session.get(AlertRule, rid).notify_push is True
