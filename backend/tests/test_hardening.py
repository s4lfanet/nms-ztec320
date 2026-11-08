"""Password policy and server-side forced password change."""
import os
import tempfile

import pytest
from sqlalchemy import create_engine

from app import app, db
from models import User, Role

H = {'X-Requested-With': 'XMLHttpRequest'}


@pytest.fixture
def client():
    app.config['TESTING'] = True
    app.config['SESSION_COOKIE_SECURE'] = False
    tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
    tmp.close()
    eng = create_engine(f'sqlite:///{tmp.name}')
    with app.app_context():
        orig = db.engines.get(None)
        db.engines[None] = eng
        db.create_all()
        role = Role(name='Full Access', description='x', permissions='all_olt,manage_users', is_system=True)
        db.session.add(role)
        db.session.flush()
        for name, must in (('boss', False), ('newadmin', True)):
            u = User(username=name, full_name=name, is_super_admin=True,
                     role_id=role.id, must_change_password=must)
            u.set_password('Str0ng-pass!')
            db.session.add(u)
        db.session.commit()
    with app.test_client() as c:
        yield c
    with app.app_context():
        db.drop_all()
        if orig is not None:
            db.engines[None] = orig
        else:
            db.engines.pop(None, None)
    eng.dispose()
    try:
        os.unlink(tmp.name)
    except OSError:
        pass


def _login(c, user):
    r = c.post('/api/auth/login', json={'username': user, 'password': 'Str0ng-pass!'}, headers=H)
    assert r.status_code == 200


def test_create_user_rejects_empty_and_short_password(client):
    _login(client, 'boss')
    for pw in ('', 'short', 'admin123'):
        r = client.post('/api/user', json={'username': 'u1', 'full_name': 'U', 'password': pw}, headers=H)
        assert r.status_code == 400
        assert r.get_json()['error_code'] == 'weak_password'


def test_create_user_accepts_good_password(client):
    _login(client, 'boss')
    r = client.post('/api/user', json={'username': 'u2', 'full_name': 'U', 'password': 'Another-Good-1'}, headers=H)
    assert r.status_code == 200 and r.get_json()['success']


def test_profile_rejects_weak_password(client):
    _login(client, 'boss')
    r = client.post('/api/profile', json={'password': 'admin123', 'current_password': 'Str0ng-pass!'}, headers=H)
    assert r.status_code == 400 and r.get_json()['error_code'] == 'weak_password'


def test_profile_requires_current_password(client):
    _login(client, 'boss')
    r = client.post('/api/profile', json={'password': 'Brand-New-Pass1'}, headers=H)
    assert r.status_code == 400 and r.get_json()['error_code'] == 'current_password_required'
    r = client.post('/api/profile', json={'password': 'Brand-New-Pass1', 'current_password': 'wrong'}, headers=H)
    assert r.status_code == 400 and r.get_json()['error_code'] == 'current_password_invalid'
    # password unchanged: old one still logs in
    client.post('/api/auth/logout', headers=H)
    assert client.post('/api/auth/login', json={'username': 'boss', 'password': 'Str0ng-pass!'}, headers=H).status_code == 200
    r = client.post('/api/profile', json={'password': 'Brand-New-Pass1', 'current_password': 'Str0ng-pass!'}, headers=H)
    assert r.status_code == 200


def test_profile_without_password_needs_no_current_password(client):
    _login(client, 'boss')
    r = client.post('/api/profile', json={'full_name': 'Boss Baru'}, headers=H)
    assert r.status_code == 200


def test_must_change_blocks_api_but_allows_profile(client):
    _login(client, 'newadmin')
    assert client.get('/api/auth/me').status_code == 200
    r = client.get('/api/users', headers=H)
    assert r.status_code == 403 and r.get_json()['error_code'] == 'password_change_required'
    r = client.post('/api/profile', json={'password': 'Brand-New-Pass1', 'current_password': 'Str0ng-pass!'}, headers=H)
    assert r.status_code == 200 and r.get_json()['must_change_password'] is False
    assert client.get('/api/users', headers=H).status_code != 403


def test_normal_user_not_blocked(client):
    _login(client, 'boss')
    assert client.get('/api/users', headers=H).status_code != 403
