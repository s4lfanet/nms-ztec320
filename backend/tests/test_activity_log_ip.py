"""Log Aktivitas: IP asli di belakang Cloudflare Tunnel, login gagal, info ISP (cache), izin."""
import secrets
from datetime import timedelta
from unittest import mock

from app import app, db
from models import ActionLog, IpInfo, User, Role
import ip_info
from tests.test_link_state import ctx  # noqa: F401
from tests.test_viewer_permissions import _user, _client

H = {'X-Requested-With': 'XMLHttpRequest'}


def _env(peer):
    return {'REMOTE_ADDR': peer}


def _login_payload(u, pw):
    return {'username': u, 'password': pw}


def _mk_user():
    role = Role.query.filter_by(name='ip-test').first()
    if not role:
        role = Role(name='ip-test', permissions='view_dashboard')
        db.session.add(role); db.session.flush()
    pw = secrets.token_hex(8)
    u = User(username='ipu' + secrets.token_hex(3), full_name='IP Test', role_id=role.id)
    u.set_password(pw)
    db.session.add(u); db.session.commit()
    return u.username, pw


def _last(action):
    return ActionLog.query.filter_by(action=action).order_by(ActionLog.id.desc()).first()


def test_tunnel_request_uses_cf_connecting_ip(ctx):
    name, pw = _mk_user()
    c = app.test_client()
    # cloudflared → nginx (XFF menambah 127.0.0.1) → Flask dari loopback
    r = c.post('/api/auth/login', json=_login_payload(name, pw), environ_base=_env('127.0.0.1'),
               headers={**H, 'X-Forwarded-For': '36.68.10.20, 127.0.0.1', 'CF-Connecting-IP': '36.68.10.20',
                        'CF-IPCountry': 'ID', 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/131.0'})
    assert r.status_code == 200
    log = _last('login')
    assert log.ip_address == '36.68.10.20' and log.ip_country == 'ID' and 'Android' in log.user_agent


def test_spoofed_header_from_lan_is_ignored(ctx):
    name, pw = _mk_user()
    c = app.test_client()
    # klien LAN langsung ke Flask/Nginx: header CF palsu TIDAK dipercaya
    c.post('/api/auth/login', json=_login_payload(name, pw), environ_base=_env('192.168.54.77'),
           headers={**H, 'CF-Connecting-IP': '8.8.8.8', 'CF-IPCountry': 'US'})
    log = _last('login')
    assert log.ip_address == '192.168.54.77' and log.ip_country == ''
    # XFF berisi 127.0.0.1 dari klien yang bukan loopback juga tidak membuka kepercayaan
    c2 = app.test_client()
    c2.post('/api/auth/login', json=_login_payload(name, pw), environ_base=_env('203.0.113.9'),
            headers={**H, 'X-Forwarded-For': '127.0.0.1', 'CF-Connecting-IP': '8.8.4.4'})
    assert _last('login').ip_address == '203.0.113.9'  # bukan 127.0.0.1 palsu, bukan 8.8.4.4


def test_failed_login_logged_with_real_ip_and_rate_limit_per_ip(ctx):
    name, _pw = _mk_user()
    bad = secrets.token_hex(6)
    c = app.test_client()
    hdr = {**H, 'X-Forwarded-For': '114.10.1.1, 127.0.0.1', 'CF-Connecting-IP': '114.10.1.1'}
    for _ in range(5):
        r = c.post('/api/auth/login', json=_login_payload(name, bad), environ_base=_env('127.0.0.1'), headers=hdr)
        assert r.status_code == 401
    f = _last('login_failed')
    assert f.ip_address == '114.10.1.1' and f.username == name and f.detail == 'Password salah'
    r = c.post('/api/auth/login', json=_login_payload(name, bad), environ_base=_env('127.0.0.1'), headers=hdr)
    assert r.status_code == 429 and _last('login_blocked').ip_address == '114.10.1.1'
    # pengguna lain (IP lain) lewat tunnel yang sama tidak ikut terblokir
    other = {**H, 'X-Forwarded-For': '182.1.2.3, 127.0.0.1', 'CF-Connecting-IP': '182.1.2.3'}
    r = c.post('/api/auth/login', json=_login_payload(name, bad), environ_base=_env('127.0.0.1'), headers=other)
    assert r.status_code == 401


def test_action_logs_api_enriches_and_filters_by_ip(ctx):
    admin = _client(_user('view_dashboard', super_admin=True))
    now = ip_info._now()
    db.session.add(IpInfo(ip='36.68.10.21', asn='AS7713', as_name='PT Telekomunikasi Indonesia',
                          country_code='ID', country='Indonesia', provider='ipinfo', fetched_at=now))
    db.session.add(ActionLog(username='x', action='login', category='auth', ip_address='36.68.10.21',
                             ip_country='ID', user_agent='UA'))
    db.session.add(ActionLog(username='y', action='login', category='auth', ip_address='192.168.1.5'))
    db.session.commit()
    d = admin.get('/api/action-logs?ip=36.68.10.21', headers=H).get_json()
    assert d['total'] >= 1 and all(l['ip_address'] == '36.68.10.21' for l in d['logs'])
    assert d['logs'][0]['ip_info']['as_name'] == 'PT Telekomunikasi Indonesia'
    d = admin.get('/api/action-logs?ip=192.168.1.5', headers=H).get_json()
    assert d['logs'][0]['ip_info'] == {'scope': 'private'}
    assert d['ip_lookup']['can_edit'] is True


def test_lookup_providers_and_settings(ctx):
    admin = _client(_user('view_dashboard', super_admin=True))
    viewer = _client(_user('view_dashboard,manage_users'))
    assert viewer.put('/api/ip-lookup/settings', json={'provider': 'ip-api'}, headers=H).status_code == 403
    tok = secrets.token_hex(8)
    r = admin.put('/api/ip-lookup/settings', json={'provider': 'ipinfo', 'token': tok}, headers=H).get_json()
    assert r == {'success': True, 'provider': 'ipinfo', 'has_token': True}
    fake = {'ip': '36.68.10.99', 'asn': 'AS7713', 'as_name': 'PT Telekomunikasi Indonesia',
            'as_domain': 'telkom.co.id', 'country_code': 'ID', 'country': 'Indonesia'}
    with mock.patch.object(ip_info, '_get_json', return_value=fake) as g:
        assert ip_info.lookup_now(['36.68.10.99', '10.0.0.1', '127.0.0.1']) == 1  # privat tidak dikirim
        url = g.call_args[0][0]
        assert url.endswith('/lite/36.68.10.99') and tok in g.call_args[1]['headers']['Authorization']
    row = db.session.get(IpInfo, '36.68.10.99')
    assert row.as_name == 'PT Telekomunikasi Indonesia' and row.provider == 'ipinfo'
    _, missing = ip_info.cached(['36.68.10.99'])
    assert missing == []
    # ip-api batch
    admin.put('/api/ip-lookup/settings', json={'provider': 'ip-api'}, headers=H)
    rows = [{'status': 'success', 'query': '114.4.5.6', 'country': 'Indonesia', 'countryCode': 'ID',
             'regionName': 'Jawa Timur', 'city': 'Surabaya', 'isp': 'PT Indosat', 'as': 'AS4761 INDOSAT'}]
    with mock.patch.object(ip_info, '_get_json', return_value=rows):
        ip_info.lookup_now(['114.4.5.6'])
    r = db.session.get(IpInfo, '114.4.5.6')
    assert (r.asn, r.as_name, r.city) == ('AS4761', 'PT Indosat', 'Surabaya')
    # off → tidak ada permintaan keluar
    admin.put('/api/ip-lookup/settings', json={'provider': 'off'}, headers=H)
    with mock.patch.object(ip_info, '_get_json') as g:
        assert ip_info.lookup_now(['1.1.1.1']) == 0 and not g.called


def test_failed_lookup_retried_after_ttl(ctx):
    db.session.add(IpInfo(ip='45.1.2.3', error='timeout', fetched_at=ip_info._now() - timedelta(minutes=10)))
    db.session.add(IpInfo(ip='45.1.2.4', error='timeout', fetched_at=ip_info._now() - timedelta(hours=2)))
    db.session.commit()
    _, missing = ip_info.cached(['45.1.2.3', '45.1.2.4'])
    assert missing == ['45.1.2.4']
