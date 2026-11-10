"""Browser bawaan web admin modem: validasi target, token, rewrite, proxy e2e."""
import http.server
import os
import secrets
import tempfile
import threading

import pytest
from sqlalchemy import create_engine

import modem_proxy as mp
from app import app, db
from models import User, Role, OLT, ONU, OnuLinkState

H = {'X-Requested-With': 'XMLHttpRequest'}
KEY = 'unit-test-key'
PW = 'Pw-' + secrets.token_urlsafe(12)


# ───────────────────────────── unit ─────────────────────────────

@pytest.mark.parametrize('ip,ok', [
    ('192.168.1.1', True), ('10.0.0.5', True), ('172.16.4.4', True),
    ('100.64.3.2', True), ('8.8.8.8', False), ('127.0.0.1', False),
    ('169.254.1.1', False), ('0.0.0.0', False), ('224.0.0.1', False),
    ('::1', False), ('evil.example.com', False), ('', False),
])
def test_is_allowed_ip(ip, ok):
    assert mp.is_allowed_ip(ip, public_ok=False) is ok


def test_public_allowed_only_with_flag():
    assert mp.is_allowed_ip('8.8.8.8', public_ok=True)
    assert not mp.is_allowed_ip('127.0.0.1', public_ok=True)


def test_token_roundtrip_and_tamper():
    t = mp.make_token(KEY, 1, 2, 'http', '192.168.1.1', 80)
    d = mp.read_token(KEY, t)
    assert d['h'] == '192.168.1.1' and d['p'] == 80 and d['o'] == 1
    assert mp.read_token('other-key', t) is None
    assert mp.read_token(KEY, t[:-2] + 'xx') is None


def test_token_with_disallowed_host_rejected():
    t = mp.make_token(KEY, 1, 2, 'http', '8.8.8.8', 80)
    assert mp.read_token(KEY, t) is None


def test_rewrite_html_root_paths_and_full_urls():
    html = ('<a href="/cgi-bin/x.cgi">a</a><img src="/img/a.png">'
            '<link href="//cdn.example/x.css"><a href="rel.html">r</a>'
            '<form action="http://192.168.1.1/login">'
            '<style>b{background:url(/bg.png)}</style>')
    out = mp.rewrite_text(html, '/webadmin/T', 'http', '192.168.1.1', 80, 'text/html')
    assert 'href="/webadmin/T/cgi-bin/x.cgi"' in out
    assert 'src="/webadmin/T/img/a.png"' in out
    assert '//cdn.example/x.css' in out and '/webadmin/T//cdn' not in out
    assert 'href="rel.html"' in out
    assert 'action="/webadmin/T/login"' in out
    assert 'url(/webadmin/T/bg.png)' in out


def test_rewrite_js_only_paths():
    js = 'var u="/cgi-bin/get.cgi"; var x="/"; var s="hello";'
    out = mp.rewrite_text(js, '/webadmin/T', 'http', '10.0.0.1', 80, 'application/javascript')
    assert '"/webadmin/T/cgi-bin/get.cgi"' in out and 'var x="/"' in out


def test_rewrite_location():
    r = mp.rewrite_location
    assert r('/login.html', '/webadmin/T', 'http', '10.0.0.1', 80) == '/webadmin/T/login.html'
    assert r('http://10.0.0.1/a?b=1', '/webadmin/T', 'http', '10.0.0.1', 80) == '/webadmin/T/a?b=1'
    assert r('http://evil.com/', '/webadmin/T', 'http', '10.0.0.1', 80) is None


def test_cookie_jar_set_and_delete():
    j = mp.CookieJar()
    j.update('k', ['sid=abc; Path=/; HttpOnly', 'x=1'])
    assert j.get('k') == {'sid': 'abc', 'x': '1'}
    j.update('k', ['sid=; Max-Age=0'])
    assert j.get('k') == {'x': '1'}


def test_upstream_headers_never_forward_nms_cookie():
    h = mp.build_upstream_headers({'cookie': 'session=' + KEY, 'accept': '*/*'},
                                  'http', '10.0.0.1', 80, {'sid': 'a', 'session': 'x'})
    assert 'session=' + KEY not in h.get('cookie', '') and 'session=x' not in h['cookie']
    assert h['cookie'] == 'sid=a'


# ───────────────────── e2e: modem palsu + Flask ─────────────────────

class _Modem(http.server.BaseHTTPRequestHandler):
    seen = {}

    def log_message(self, *a):
        pass

    def do_GET(self):
        _Modem.seen['path'] = self.path
        _Modem.seen['cookie'] = self.headers.get('Cookie', '')
        _Modem.seen['host'] = self.headers.get('Host')
        if self.path == '/':
            body = b'<html><a href="/cgi-bin/s.cgi">x</a></html>'
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.send_header('Set-Cookie', 'sid=abc; Path=/')
        elif self.path == '/redir':
            body = b''
            self.send_response(302)
            self.send_header('Location', '/home.html')
        elif self.path == '/evil':
            body = b''
            self.send_response(302)
            self.send_header('Location', 'http://evil.example/')
        else:
            body = b'ok'
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@pytest.fixture
def modem():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), _Modem)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield srv.server_address[1]
    srv.shutdown()


@pytest.fixture
def client(monkeypatch):
    app.config['TESTING'] = True
    app.config['SESSION_COOKIE_SECURE'] = False
    tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
    tmp.close()
    eng = create_engine(f'sqlite:///{tmp.name}')
    with app.app_context():
        orig = db.engines.get(None)
        db.engines[None] = eng
        db.create_all()
        full = Role(name='Full', description='x', permissions='all_olt', is_system=True)
        basic = Role(name='Basic', description='x', permissions='add_onu')
        db.session.add_all([full, basic])
        db.session.flush()
        for name, role in (('boss', full), ('basic', basic)):
            u = User(username=name, full_name=name, role_id=role.id)
            u.set_password(PW)
            db.session.add(u)
        olt = OLT(name='o', ip_address='10.9.9.9')
        db.session.add(olt)
        db.session.flush()
        onu = ONU(olt_id=olt.id, name='n', serial_number='ZTEG00000001')
        db.session.add(onu)
        db.session.flush()
        db.session.add(OnuLinkState(onu_id=onu.id, pppoe_ip='192.168.77.5'))
        db.session.commit()
        onu_id = onu.id
    with app.test_client() as c:
        c.onu_id = onu_id
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
    assert c.post('/api/auth/login', json={'username': user, 'password': PW},
                  headers=H).status_code == 200


def test_session_requires_permission(client):
    _login(client, 'basic')
    r = client.post(f'/api/onu/{client.onu_id}/webadmin/session', json={'ip': '192.168.77.5'}, headers=H)
    assert r.status_code == 403


def test_targets_lists_onu_ip(client):
    _login(client, 'boss')
    r = client.get(f'/api/onu/{client.onu_id}/webadmin/targets')
    assert [t['ip'] for t in r.get_json()['targets']] == ['192.168.77.5']


def test_session_rejects_foreign_and_olt_ip(client):
    _login(client, 'boss')
    for ip in ('192.168.77.6', '10.9.9.9', '127.0.0.1', '8.8.8.8'):
        r = client.post(f'/api/onu/{client.onu_id}/webadmin/session', json={'ip': ip}, headers=H)
        assert r.status_code == 403, ip


def test_session_ok_returns_token_url(client):
    _login(client, 'boss')
    r = client.post(f'/api/onu/{client.onu_id}/webadmin/session',
                    json={'ip': '192.168.77.5', 'port': 8080}, headers=H)
    assert r.status_code == 200
    url = r.get_json()['url']
    assert r.get_json()['tab_url'] != url
    assert url.startswith('/webadmin/') and url.endswith('/')
    d = mp.read_token(app.config['SECRET_KEY'], url.split('/')[2])
    assert d['h'] == '192.168.77.5' and d['p'] == 8080


def test_proxy_invalid_token(client):
    assert client.get('/webadmin/bogus/').status_code == 403


def _token(client, port, user='boss'):
    with app.app_context():
        uid = User.query.filter_by(username=user).first().id
    return mp.make_token(app.config['SECRET_KEY'], client.onu_id, uid, 'http', '127.0.0.1', port)


def test_proxy_e2e(client, modem, monkeypatch):
    monkeypatch.setattr(mp, 'is_allowed_ip', lambda ip, public_ok=None: ip == '127.0.0.1')
    t = _token(client, modem)
    nms_cookie = 'nms-' + secrets.token_hex(4)
    r = client.get(f'/webadmin/{t}/', headers={'Cookie': 'session=' + nms_cookie})
    assert r.status_code == 200
    assert f'/webadmin/{t}/cgi-bin/s.cgi'.encode() in r.data
    # token frame tanpa Sec-Fetch-* (NMS via http://) → tidak boleh CSP sandbox
    assert 'Content-Security-Policy' not in r.headers
    assert 'X-Frame-Options' not in r.headers
    # token frame dibuka sebagai dokumen teratas (https) → dikunci
    d = client.get(f'/webadmin/{t}/', headers={'Sec-Fetch-Dest': 'document'})
    assert d.headers['Content-Security-Policy'].startswith('sandbox')
    # token tab selalu dikunci
    with app.app_context():
        uid = User.query.filter_by(username='boss').first().id
    tt = mp.make_token(app.config['SECRET_KEY'], client.onu_id, uid, 'http', '127.0.0.1', modem, mode='tab')
    assert client.get(f'/webadmin/{tt}/').headers['Content-Security-Policy'].startswith('sandbox')
    assert 'Set-Cookie' not in r.headers
    assert nms_cookie not in _Modem.seen['cookie']
    # cookie modem dipakai ulang dari jar server-side
    client.get(f'/webadmin/{t}/other')
    assert _Modem.seen['cookie'] == 'sid=abc'
    assert client.get(f'/webadmin/{t}/redir').headers['Location'] == f'/webadmin/{t}/home.html'
    assert client.get(f'/webadmin/{t}/evil').status_code == 502


def test_proxy_denied_for_user_without_permission(client, modem, monkeypatch):
    monkeypatch.setattr(mp, 'is_allowed_ip', lambda ip, public_ok=None: True)
    t = _token(client, modem, user='basic')
    assert client.get(f'/webadmin/{t}/').status_code == 403


# ───────────── pencarian IP: sesi MikroTik langsung ─────────────

SESS = [
    {'name': 'yoga@rw04', 'caller_id': 'AA:BB:CC:00:00:10', 'address': '10.20.0.7',
     'uptime': '1h', 'device': 'ccr'},
    {'name': 'lain@rw01', 'caller_id': 'AA:BB:CC:00:00:99', 'address': '10.20.0.8',
     'uptime': '1h', 'device': 'ccr'},
    {'name': 'pub@x', 'caller_id': '', 'address': '8.8.4.4', 'uptime': '', 'device': 'ccr'},
]


@pytest.fixture
def live(monkeypatch):
    import routes_webadmin as rw
    monkeypatch.setattr(rw, '_live_sessions', lambda force=False: (SESS, [], 1))
    return rw


def _set_onu(client, **kw):
    with app.app_context():
        o = db.session.get(ONU, client.onu_id)
        for k, v in kw.items():
            setattr(o, k, v)
        db.session.commit()


def test_live_match_by_name_variant(client, live):
    _set_onu(client, name='yoga@rw04-1')          # suffix -1 dibuang saat match
    _login(client, 'boss')
    ips = [t['ip'] for t in client.get(f'/api/onu/{client.onu_id}/webadmin/targets').get_json()['targets']]
    assert '10.20.0.7' in ips and '10.20.0.8' not in ips and '8.8.4.4' not in ips


def test_live_match_by_pppoe_column(client, live):
    _set_onu(client, name='NA', pppoe='lain@rw01')
    _login(client, 'boss')
    ips = [t['ip'] for t in client.get(f'/api/onu/{client.onu_id}/webadmin/targets').get_json()['targets']]
    assert '10.20.0.8' in ips


def test_live_match_by_mac_offset(client, live):
    _set_onu(client, name='NA', serial_number='AA:BB:CC:00:00:0E')   # sesi = ONU + 2
    _login(client, 'boss')
    ips = [t['ip'] for t in client.get(f'/api/onu/{client.onu_id}/webadmin/targets').get_json()['targets']]
    assert '10.20.0.7' in ips


def test_manual_session_pick_allowed_only_from_live_sessions(client, live):
    _login(client, 'boss')
    url = f'/api/onu/{client.onu_id}/webadmin/session'
    assert client.post(url, json={'ip': '10.20.0.8'}, headers=H).status_code == 403
    assert client.post(url, json={'ip': '10.20.0.8', 'from_session': True}, headers=H).status_code == 200
    assert client.post(url, json={'ip': '10.99.9.9', 'from_session': True}, headers=H).status_code == 403
    assert client.post(url, json={'ip': '8.8.4.4', 'from_session': True}, headers=H).status_code == 403


def test_pppoe_sessions_search_filters_and_permission(client, live):
    _login(client, 'basic')
    assert client.get('/api/webadmin/pppoe-sessions').status_code == 403
    client.post('/api/auth/logout', headers=H)
    _login(client, 'boss')
    rows = client.get('/api/webadmin/pppoe-sessions?q=lain').get_json()['sessions']
    assert [r['address'] for r in rows] == ['10.20.0.8']
    all_rows = client.get('/api/webadmin/pppoe-sessions').get_json()['sessions']
    assert '8.8.4.4' not in [r['address'] for r in all_rows]


HUAWEI_STUB = """<script>var SSLPort ='80';
var HostInfo = window.location.host;
window.location="https://" + HostInfo + ":" + SSLPort;</script>"""


def test_https_redirect_port_detect():
    assert mp.https_redirect_port(HUAWEI_STUB) == 80
    assert mp.https_redirect_port('<a href="https://x">') is None


def test_huawei_stub_switches_to_https_token(client, monkeypatch):
    import routes_webadmin as rw
    monkeypatch.setattr(mp, 'is_allowed_ip', lambda ip, public_ok=None: True)

    class R:
        status_code = 200
        encoding = 'utf-8'
        headers = __import__('httpx').Headers({'content-type': 'text/html'})
        def iter_bytes(self):
            yield HUAWEI_STUB.encode()
        def __enter__(self): return self
        def __exit__(self, *a): return False

    class C:
        def __init__(self, *a, **k): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def stream(self, *a, **k): return R()

    monkeypatch.setattr(rw.httpx, 'Client', C)
    with app.app_context():
        uid = User.query.filter_by(username='boss').first().id
    t = mp.make_token(app.config['SECRET_KEY'], client.onu_id, uid, 'http', '192.168.30.106', 80)
    r = client.get(f'/webadmin/{t}/')
    assert r.status_code == 302
    nt = r.headers['Location'].split('/')[2]
    d = mp.read_token(app.config['SECRET_KEY'], nt)
    assert d['s'] == 'https' and d['p'] == 80 and d['h'] == '192.168.30.106'


def test_fix_content_type():
    assert mp.fix_content_type('Cuscss/login.css', 'text/html') == 'text/css; charset=utf-8'
    assert mp.fix_content_type('a/md5.js?1', '') == 'application/javascript; charset=utf-8'
    assert mp.fix_content_type('x.css', 'text/css') == 'text/css'
    assert mp.fix_content_type('login.cgi', 'text/html') == 'text/html'


def test_cookie_shim_injected_and_sync(client, modem, monkeypatch):
    monkeypatch.setattr(mp, 'is_allowed_ip', lambda ip, public_ok=None: ip == '127.0.0.1')
    t = _token(client, modem)
    r = client.get(f'/webadmin/{t}/')
    assert b'Object.defineProperty(document' in r.data and b'__nms_cookie' in r.data
    # shim menyinkron cookie JS → dipakai ke modem
    assert client.post(f'/webadmin/{t}/__nms_cookie',
                       data='Cookie=body:Language:english:id=-1;path=/').status_code == 204
    client.get(f'/webadmin/{t}/other')
    assert 'Cookie=body:Language:english:id=-1' in _Modem.seen['cookie']


def test_query_string_forwarded_raw(client, modem, monkeypatch):
    monkeypatch.setattr(mp, 'is_allowed_ip', lambda ip, public_ok=None: ip == '127.0.0.1')
    t = _token(client, modem)
    client.get(f'/webadmin/{t}/Cuscss/login.css?202304251725030553184798')
    assert _Modem.seen['path'] == '/Cuscss/login.css?202304251725030553184798'
    client.get(f'/webadmin/{t}/x.asp?a=1&b=2')
    assert _Modem.seen['path'] == '/x.asp?a=1&b=2'


@pytest.mark.parametrize('src,exp', [
    ('window.location="/";', 'window.location="/webadmin/T/";'),
    ("top.location.href = '/' + page;", "top.location.href = '/webadmin/T/' + page;"),
    ('location.replace("/index.asp")', 'location.replace("/webadmin/T/index.asp")'),
    ('Form.setAction("/login.cgi")', 'Form.setAction("/webadmin/T/login.cgi")'),
    ('f.action = "/login.cgi";', 'f.action = "/webadmin/T/login.cgi";'),
    ('$.ajax({url : "/asp/GetRandCount.asp", type:"POST"})', '$.ajax({url : "/webadmin/T/asp/GetRandCount.asp", type:"POST"})'),
    ('xhr.open("POST", "/getajax.cgi?x")', 'xhr.open("POST", "/webadmin/T/getajax.cgi?x")'),
    ('var a = s.split("/");', 'var a = s.split("/");'),
    ('location.href="//cdn/x"', 'location.href="//cdn/x"'),
])
def test_rewrite_js_navigation(src, exp):
    assert mp.rewrite_text(src, '/webadmin/T', 'https', '10.0.0.1', 80, 'application/javascript') == exp


@pytest.mark.parametrize('src,exp', [
    ('src="/frameaspdes/" + Language + "/ssmpdes.js"', 'src="/webadmin/T/frameaspdes/" + Language + "/ssmpdes.js"'),
    ("var u = '/html/' + p + '.asp';", "var u = '/webadmin/T/html/' + p + '.asp';"),
    ("var pageName = '/';\ntop.location.replace(pageName);", "var pageName = '/webadmin/T/';\ntop.location.replace(pageName);"),
    ('var Url = "/index.asp";', 'var Url = "/webadmin/T/index.asp";'),
    ('x = a + "/y.js";', 'x = a + "/y.js";'),
])
def test_rewrite_js_concat_and_pagevar(src, exp):
    assert mp.rewrite_text(src, '/webadmin/T', 'https', '10.0.0.1', 80, 'application/javascript') == exp


def test_shim_not_injected_into_ajax_token(client, monkeypatch):
    import routes_webadmin as rw
    monkeypatch.setattr(mp, 'is_allowed_ip', lambda ip, public_ok=None: True)
    token_body = '\ufeff3c9a1b2d4e5f60718293a4b5c6d7e8f9'

    class R:
        status_code = 200
        encoding = 'utf-8'
        headers = __import__('httpx').Headers({'content-type': 'text/html; charset=UTF-8'})
        def iter_bytes(self):
            yield token_body.encode()
        def __enter__(self): return self
        def __exit__(self, *a): return False

    class C:
        def __init__(self, *a, **k): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def stream(self, *a, **k): return R()

    monkeypatch.setattr(rw.httpx, 'Client', C)
    with app.app_context():
        uid = User.query.filter_by(username='boss').first().id
    t = mp.make_token(app.config['SECRET_KEY'], client.onu_id, uid, 'https', '192.168.30.106', 80)
    r = client.post(f'/webadmin/{t}/asp/GetRandCount.asp', data='')
    assert r.data.decode() == token_body


# ───────────── origin terpisah ─────────────

def test_normalize_origin():
    assert mp.normalize_origin('https://Modem.Salfa.my.id/') == 'https://modem.salfa.my.id'
    assert mp.normalize_origin('http://10.0.0.1:8081') == 'http://10.0.0.1:8081'
    assert mp.normalize_origin('javascript:alert(1)') == ''
    assert mp.normalize_origin('https://a.b/c') == ''


def test_separate_origin_flow(client, modem, monkeypatch):
    monkeypatch.setenv('WEBADMIN_ORIGIN', 'https://modem.example.test')
    _login(client, 'boss')
    r = client.post(f'/api/onu/{client.onu_id}/webadmin/session', json={'ip': '192.168.77.5'}, headers=H)
    j = r.get_json()
    assert j['url'].startswith('https://modem.example.test/webadmin/') and j['separate_origin']
    # halaman NMS mengizinkan frame dari origin modem
    assert "frame-src 'self' https://modem.example.test" in client.get('/api/onu/1/link-state').headers['Content-Security-Policy']
    monkeypatch.setattr(mp, 'is_allowed_ip', lambda ip, public_ok=None: ip == '127.0.0.1')
    # di host modem: tanpa CSP sandbox; selain /webadmin ditolak
    t = _token(client, modem)
    pr = client.get(f'/webadmin/{t}/', base_url='https://modem.example.test')
    assert pr.status_code == 200 and 'Content-Security-Policy' not in pr.headers
    assert client.get('/api/auth/me', base_url='https://modem.example.test').status_code == 404
    assert client.get('/', base_url='https://modem.example.test').status_code == 404


def test_settings_save_super_admin_only(client):
    _login(client, 'boss')          # bukan super admin
    r = client.post('/api/webadmin/settings', json={'origin': 'https://m.example.test'}, headers=H)
    assert r.status_code == 403
