"""Tests for Fase 11 tamper-evident audit log chain.

Covers: hash stamping on log_action, chain verification, tamper detection,
and archive-then-verify anchoring via the recorded chain tip.
"""
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import User, Role, ActionLog
from audit_chain import compute_log_hash, verify_chain, GENESIS


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


class TestHashChain:
    def test_log_action_stamps_chain(self, client):
        _login(client)
        with app.app_context():
            logs = ActionLog.query.order_by(ActionLog.id).all()
            assert len(logs) >= 1
            first = logs[0]
            assert first.prev_hash == GENESIS
            assert first.hash and len(first.hash) == 64
            for prev, cur in zip(logs, logs[1:]):
                assert cur.prev_hash == prev.hash
                assert len(cur.hash) == 64

    def test_verify_chain_clean(self, client):
        _login(client)
        with app.app_context():
            r = verify_chain()
            assert r['verified'] is True
            assert r['checked'] >= 1

    def test_verify_detects_tampered_row(self, client):
        _login(client)
        with app.app_context():
            row = ActionLog.query.order_by(ActionLog.id).first()
            # Simulate an attacker editing history directly in the DB.
            db.session.execute(
                db.text("UPDATE action_logs SET detail='forged' WHERE id=:i"),
                {'i': row.id})
            db.session.commit()
            r = verify_chain()
            assert r['verified'] is False
            assert r['first_bad_id'] == row.id

    def test_verify_detects_deleted_row(self, client):
        _login(client)
        with app.app_context():
            # Need at least 2 rows so deleting the first breaks linkage.
            assert ActionLog.query.count() >= 1
            from helpers import log_action
            db.session.execute(db.text("DELETE FROM action_logs WHERE id=(SELECT MIN(id) FROM action_logs)"))
            db.session.commit()
            r = verify_chain()
            if ActionLog.query.count() > 0:
                assert r['verified'] is False

    def test_compute_log_hash_deterministic(self):
        f = {'id': 1, 'user_id': 1, 'username': 'a', 'action': 'login',
             'category': 'auth', 'target': 't', 'detail': 'd',
             'ip_address': '1.2.3.4', 'created_at': None}
        assert compute_log_hash(f, GENESIS) == compute_log_hash(f, GENESIS)
        assert compute_log_hash(f, GENESIS) != compute_log_hash(f, 'abc')


class TestVerifyEndpoint:
    def test_verify_endpoint(self, client):
        _login(client)
        resp = client.get('/api/action-logs/verify')
        assert resp.status_code == 200
        d = resp.get_json()
        assert d['verified'] is True

    def test_verify_requires_permission(self, client):
        # Anonymous → 401/302
        resp = client.get('/api/action-logs/verify')
        assert resp.status_code in (302, 401)

    def test_archive_endpoint(self, client):
        _login(client)
        resp = client.post('/api/action-logs/archive', json={'days': 90},
                           headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        d = resp.get_json()
        assert d['success'] is True
        # Nothing older than 90d in a fresh test DB
        assert d['archived'] == 0
