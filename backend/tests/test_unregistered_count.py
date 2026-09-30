"""Tests for GET /api/unregistered-count caching — the frontend polls this
endpoint every 60s per open tab, and each call used to telnet every
CLI-enabled OLT. The handler now caches the scan per OLT
(`olt:{id}:unregistered`, 120s TTL) and skips the telnet entirely while the
OLT's sync lock is held.

Run with: py -3 -m pytest tests/test_unregistered_count.py -v
"""
import os
import sys
import json
import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import User, Role, OLT

app.config['TESTING'] = True
app.config['WTF_CSRF_ENABLED'] = False
app.config['SESSION_COOKIE_DOMAIN'] = None


@pytest.fixture(autouse=True)
def clear_caches():
    """Clear the (in-memory) cache and login rate limits between tests."""
    from cache import cache_clear
    from helpers import _login_attempts
    cache_clear('*')
    _login_attempts.clear()
    yield
    cache_clear('*')
    _login_attempts.clear()


@pytest.fixture
def client():
    import tempfile
    from sqlalchemy import create_engine as _create_engine

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
        else:
            db.engines.pop(None, None)
    try:
        os.unlink(_tmpdb.name)
    except (OSError, PermissionError):
        pass


def _login_admin(client):
    client.post('/api/auth/login',
                data=json.dumps({'username': 'admin', 'password': 'admin123'}),
                content_type='application/json')


def _make_olt():
    with app.app_context():
        olt = OLT(name='Unreg-OLT', ip_address='10.9.9.50', vendor='ZTE', model='C320',
                  telnet_enabled=True, cli_username='admin', monitoring_enabled=True)
        db.session.add(olt)
        db.session.commit()
        return olt.id


class _FakeCollector:
    def __init__(self):
        self.calls = 0

    def collect_unregistered_onus(self):
        self.calls += 1
        return [{'sn': 'ZTEGC40DF35B', 'pon_port': '1/1/2'},
                {'sn': 'ALCLB45A69A0', 'pon_port': '1/1/2'}]


class TestUnregisteredCountCache:
    def test_second_call_uses_cache(self, client, monkeypatch):
        """Two consecutive GETs → one telnet scan; clearing the cache → rescan."""
        import snmp_collector
        _login_admin(client)
        _make_olt()
        fake = _FakeCollector()
        monkeypatch.setattr(snmp_collector, 'create_cli_collector', lambda olt: fake)

        r1 = client.get('/api/unregistered-count')
        r2 = client.get('/api/unregistered-count')
        assert r1.status_code == 200
        assert r1.get_json()['unregistered'] == 2
        assert r2.get_json()['unregistered'] == 2
        assert fake.calls == 1

        from cache import cache_clear
        cache_clear('olt:*')
        r3 = client.get('/api/unregistered-count')
        assert r3.get_json()['unregistered'] == 2
        assert fake.calls == 2

    def test_sync_locked_skips_telnet(self, client, monkeypatch):
        """While the OLT's sync lock is held and the cache is empty, no telnet
        session is opened; the endpoint still answers 200."""
        import snmp_collector
        import routes_notifications
        _login_admin(client)
        _make_olt()
        fake = _FakeCollector()
        monkeypatch.setattr(snmp_collector, 'create_cli_collector', lambda olt: fake)
        monkeypatch.setattr('sync_lock.is_sync_locked', lambda olt_id: True)

        r = client.get('/api/unregistered-count')
        assert r.status_code == 200
        data = r.get_json()
        assert data['unregistered'] == 0
        assert data['breakdown'] == []
        assert fake.calls == 0
