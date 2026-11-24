"""Akun lihat-saja (viewer/demo) & pembatasan pengelola akun."""
import json
import secrets

from app import app, db
from models import User, Role, OLT, ONU, Notification, BotConfig
from tests.test_link_state import ctx  # noqa: F401

H = {'X-Requested-With': 'XMLHttpRequest'}


def _user(perms, super_admin=False, name=None):
    r = Role(name='r' + secrets.token_hex(4), permissions=perms)
    db.session.add(r); db.session.flush()
    u = User(username=name or 'u' + secrets.token_hex(3), full_name='u', role_id=r.id, is_super_admin=super_admin)
    u.set_password(secrets.token_hex(8))
    db.session.add(u); db.session.commit()
    return u


class _C:
    """Test client yang membuang user Flask-Login tersimpan di `g` sebelum tiap permintaan
    (fixture ctx memakai satu app context bersama, jadi tanpa ini user permintaan sebelumnya terbawa)."""
    def __init__(self, c):
        self.c = c

    def __getattr__(self, name):
        fn = getattr(self.c, name)
        if name not in ('get', 'post', 'put', 'delete'):
            return fn

        def call(*a, **k):
            from flask import g
            g.pop('_login_user', None)
            return fn(*a, **k)
        return call


def _client(u):
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['_user_id'] = str(u.id); sess['_fresh'] = True
    return _C(c)


def _onu():
    olt = OLT(name='C320', ip_address='10.0.0.9')
    db.session.add(olt); db.session.flush()
    secret = secrets.token_hex(6)
    onu = ONU(olt_id=olt.id, frame=1, slot=1, port=1, onu_id=1, name='pel-1', status='online',
              wifi_config=json.dumps({'ssids': [{'ssid_num': 1, 'ssid_name': 'Rumah', 'ssid_password': secret}]}))
    db.session.add(onu); db.session.commit()
    return olt, onu, secret


def test_viewer_blocked_from_olt_touching_and_team_actions(ctx):
    olt, onu, _ = _onu()
    n = Notification(severity='critical', category='olt_down', title='x', message='x')
    db.session.add(n); db.session.add(BotConfig(bot_type='whatsapp_native', bot_token=secrets.token_hex(8))); db.session.commit()
    c = _client(_user('view_dashboard'))
    for path in (f'/api/onu/{onu.id}/get-status', f'/api/onu/{onu.id}/refresh-status', f'/api/onu/{onu.id}/ping',
                 f'/api/olt/{olt.id}/refresh-signal', f'/api/notifications/{n.id}/acknowledge'):
        assert c.post(path, headers=H).status_code == 403, path
    assert c.get(f'/api/onu/{onu.id}/live-detail', headers=H).status_code == 403
    assert c.get('/api/bot-config', headers=H).status_code == 403
    assert db.session.get(Notification, n.id).acknowledged is not True


def test_wifi_password_masked_without_configure_onu(ctx):
    _, onu, secret = _onu()
    viewer = _client(_user('view_dashboard,view_onus'))
    d = viewer.get(f'/api/onu/{onu.id}/detail', headers=H).get_json()
    assert secret not in json.dumps(d) and '***' in d['onu']['wifi_config']
    admin = _client(_user('view_onus,configure_onu'))
    assert secret in admin.get(f'/api/onu/{onu.id}/detail', headers=H).get_json()['onu']['wifi_config']


def test_user_manager_cannot_escalate(ctx):
    sa = _user('', super_admin=True)
    full = Role.query.filter_by(name='Full Access').first() or Role(name='FA' + secrets.token_hex(3),
                                                                     permissions='all_olt,manage_users,configure_onu')
    db.session.add(full); db.session.commit()
    mgr = _user('manage_users,view_dashboard')
    viewer_role = Role(name='Demo' + secrets.token_hex(3), permissions='view_dashboard')
    db.session.add(viewer_role); db.session.commit()
    c = _client(mgr)
    pw = secrets.token_hex(6) + 'Aa1!'
    # boleh: buat akun demo dengan role lebih sempit
    r = c.post('/api/user', json={'username': 'demo' + secrets.token_hex(2), 'full_name': 'Demo', 'password': pw,
                                  'role_id': viewer_role.id}, headers=H)
    assert r.get_json()['success'] is True
    # tidak boleh: role Full Access, ubah super admin, naikkan role sendiri, buat/ubah role lebih kuat
    assert c.post('/api/user', json={'username': 'x' + secrets.token_hex(2), 'full_name': 'x', 'password': pw,
                                     'role_id': full.id}, headers=H).status_code == 403
    assert c.put(f'/api/user/{sa.id}', json={'password': pw}, headers=H).status_code == 403
    assert c.delete(f'/api/user/{sa.id}', headers=H).status_code == 403
    assert c.put(f'/api/user/{mgr.id}', json={'role_id': full.id}, headers=H).status_code == 403
    assert c.post('/api/role', json={'name': 'z', 'permissions': ['all_olt']}, headers=H).status_code == 403
    assert c.put(f'/api/role/{mgr.role_id}', json={'permissions': ['manage_users', 'configure_onu']}, headers=H).status_code == 403
    assert c.put(f'/api/role/{full.id}', json={'name': 'dirusak'}, headers=H).status_code == 403
    # super admin tetap bebas
    assert _client(sa).put(f'/api/user/{mgr.id}', json={'role_id': full.id}, headers=H).get_json()['success'] is True
