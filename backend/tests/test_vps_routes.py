"""Rute server NMS → pelanggan PPPoE: helper root (aturan keamanan) + API web."""
import importlib.machinery
import importlib.util
import ipaddress
import os
import secrets

import pytest

from app import app, db
from tests.test_link_state import ctx, _mk_olt_onu, _mk_dev  # noqa: F401
import vps_routes as vr

H = {'X-Requested-With': 'XMLHttpRequest'}
HELPER_SRC = os.path.join(os.path.dirname(__file__), '..', '..', 'deploy', 'salfanet-route')


@pytest.fixture
def helper(monkeypatch):
    loader = importlib.machinery.SourceFileLoader('salfanet_route', HELPER_SRC)
    mod = importlib.util.module_from_spec(importlib.util.spec_from_loader('salfanet_route', loader))
    loader.exec_module(mod)
    # server: 192.168.54.131/24 (LAN) + loopback
    monkeypatch.setattr(mod, 'connected', lambda: (
        {ipaddress.ip_address('192.168.54.131'), ipaddress.ip_address('127.0.0.1')},
        [ipaddress.ip_network('192.168.54.0/24')]))
    return mod


def _rejected(mod, cidr, gw):
    with pytest.raises(SystemExit) as e:
        mod.parse(cidr, gw)
    return e.value.code == 2


def test_helper_safety_rules(helper):
    assert helper.parse('10.10.5.0/16', '192.168.54.1') == ('10.10.0.0/16', '192.168.54.1')
    assert helper.parse('100.64.0.0/10', '192.168.54.1') == ('100.64.0.0/10', '192.168.54.1')
    assert _rejected(helper, '0.0.0.0/0', '192.168.54.1')          # default route
    assert _rejected(helper, '8.8.8.0/24', '192.168.54.1')         # publik
    assert _rejected(helper, '192.168.0.0/16', '192.168.54.1')     # beririsan LAN server
    assert _rejected(helper, '192.168.54.0/24', '192.168.54.1')
    assert _rejected(helper, '10.0.0.0/16', '192.168.55.1')        # gateway tidak on-link
    assert _rejected(helper, '10.0.0.0/16', '192.168.54.131')      # gateway = server sendiri
    assert _rejected(helper, '10.0.0.0/7', '192.168.54.1')         # prefix terlalu lebar
    assert _rejected(helper, 'abc', '192.168.54.1')


def test_validate_web():
    assert vr.validate('10.20.30.40/16', '192.168.54.1')[:2] == ('10.20.0.0/16', '192.168.54.1')
    assert vr.validate('8.8.8.0/24', '192.168.54.1')[2]
    assert vr.validate('10.0.0.0/16', '10.0.0.1')[2]
    assert vr.validate('x', 'y')[2]


def _admin(client):
    from models import User
    u = User(username='rt', full_name='r', is_super_admin=True)
    u.set_password(secrets.token_hex(8))
    db.session.add(u); db.session.commit()
    with client.session_transaction() as sess:
        sess['_user_id'] = str(u.id); sess['_fresh'] = True


def test_routes_api_flow(ctx, monkeypatch):
    from models import VpsRoute, OnuLinkState
    _, onu = _mk_olt_onu()
    dev = _mk_dev(host='192.168.54.1', name='CCR')
    db.session.add(OnuLinkState(onu_id=onu.id, mikrotik_id=dev.id, pppoe_ip='10.10.3.7', session_up=True))
    db.session.commit()
    calls, kernel = [], []

    def fake_sudo(*args, timeout=15):
        calls.append(args)
        if args[0] == 'check':
            return True, 'ok'
        if args[0] == 'list':
            import json
            return True, json.dumps(kernel)
        if args[0] == 'add':
            if args[1].startswith('10.99.'):
                return False, 'gateway tidak berada di jaringan yang terhubung langsung ke server'
            kernel.append({'cidr': args[1], 'gateway': args[2]})
        return True, 'ok'
    monkeypatch.setattr(vr, '_sudo', fake_sudo)
    monkeypatch.setattr(vr.os.path, 'exists', lambda p: True)
    with app.test_client() as c:
        _admin(c)
        r = c.get('/api/vps-routes', headers=H).get_json()
        assert r['helper'] == 'ok'
        sug = r['suggestions'][0]
        assert sug == {'cidr': '10.10.0.0/16', 'gateway': '192.168.54.1', 'mikrotik_id': dev.id,
                       'router': 'CCR', 'clients': 1, 'covered': False}
        r = c.post('/api/vps-routes', headers=H, json={'cidr': sug['cidr'], 'gateway': sug['gateway']}).get_json()
        assert r['success'] and r['route']['status'] == 'ok'
        assert c.post('/api/vps-routes', headers=H, json={'cidr': '10.10.0.0/16', 'gateway': '192.168.54.1'}).status_code == 409
        bad = c.post('/api/vps-routes', headers=H, json={'cidr': '10.99.0.0/16', 'gateway': '192.168.54.1'})
        assert bad.status_code == 400 and 'ditolak' in bad.get_json()['message']
        assert VpsRoute.query.count() == 1      # rute yang ditolak tidak disimpan
        lst = c.get('/api/vps-routes', headers=H).get_json()
        assert lst['routes'][0]['active'] is True and lst['suggestions'][0]['covered'] is True
        rid = lst['routes'][0]['id']
        assert c.delete(f'/api/vps-routes/{rid}', headers=H).get_json()['success']
        assert ('del', '10.10.0.0/16', '192.168.54.1') in calls
    # helper belum dipasang → 412 dengan perintah setup
    monkeypatch.setattr(vr.os.path, 'exists', lambda p: False)
    with app.test_client() as c:
        from models import User
        u = User.query.filter_by(username='rt').first()
        with c.session_transaction() as sess:
            sess['_user_id'] = str(u.id); sess['_fresh'] = True
        r = c.post('/api/vps-routes', headers=H, json={'cidr': '10.11.0.0/16', 'gateway': '192.168.54.1'})
        assert r.status_code == 412 and 'setup_routes.sh' in r.get_json()['message']


def test_apply_all_on_start(ctx, monkeypatch):
    from models import VpsRoute
    db.session.add_all([VpsRoute(cidr='10.10.0.0/16', gateway='192.168.54.1'),
                        VpsRoute(cidr='10.20.0.0/16', gateway='192.168.54.1', enabled=False)])
    db.session.commit()
    added = []
    monkeypatch.setattr(vr, 'helper_status', lambda: 'ok')
    monkeypatch.setattr(vr, '_sudo', lambda *a, timeout=15: (added.append(a) or True, 'ok'))
    assert vr.apply_all() == 1 and added == [('add', '10.10.0.0/16', '192.168.54.1')]
