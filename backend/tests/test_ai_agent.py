"""AI agent NMS: konfigurasi, whitelist pengirim, loop tool Claude/OpenAI, endpoint."""
import json
import os
import secrets
import tempfile

import pytest
from sqlalchemy import create_engine

from app import app, db
from models import User, Role, OLT, ONU
import ai_agent

H = {'X-Requested-With': 'XMLHttpRequest'}
PW = 'Pw-' + secrets.token_urlsafe(10)
FAKE_KEY = 'k-' + secrets.token_hex(8)


@pytest.fixture
def client(monkeypatch):
    app.config['TESTING'] = True
    app.config['SESSION_COOKIE_SECURE'] = False
    monkeypatch.setenv('INTERNAL_API_KEY', FAKE_KEY)
    tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
    tmp.close()
    eng = create_engine(f'sqlite:///{tmp.name}')
    with app.app_context():
        orig = db.engines.get(None)
        db.engines[None] = eng
        db.create_all()
        basic = Role(name='Basic', description='x', permissions='add_onu')
        db.session.add(basic)
        db.session.flush()
        boss = User(username='boss', full_name='boss', is_super_admin=True, phone='081200000001')
        tech = User(username='tech', full_name='tech', role_id=basic.id, phone='081200000002')
        for u in (boss, tech):
            u.set_password(PW)
            db.session.add(u)
        olt = OLT(name='C320-A', ip_address='10.9.9.9', total_onu=2, online_onu=1, los_onu=1)
        db.session.add(olt)
        db.session.flush()
        db.session.add_all([
            ONU(olt_id=olt.id, frame=1, slot=1, port=1, onu_id=1, name='budi@rw01', pppoe='budi@rw01',
                serial_number='ZTEG00000001', status='online', rx_power=-21.5),
            ONU(olt_id=olt.id, frame=1, slot=1, port=1, onu_id=2, name='ani@rw02',
                serial_number='ZTEG00000002', status='los'),
        ])
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
    os.unlink(tmp.name)


def _login(c, u):
    assert c.post('/api/auth/login', json={'username': u, 'password': PW}, headers=H).status_code == 200


class _Resp:
    def __init__(self, data, status=200):
        self._d, self.status_code, self.text = data, status, json.dumps(data)

    def json(self):
        return self._d


def _enable(provider='anthropic', **extra):
    with app.app_context():
        ai_agent.save_config(dict({'ai_enabled': '1', 'ai_provider': provider,
                                   'api_key': 'sk-' + secrets.token_hex(6)}, **extra))


def test_tools_read_db(client):
    with app.app_context():
        s = ai_agent.run_tool('nms_summary', {})
        assert s['olts'][0]['onu_los'] == 1
        r = ai_agent.run_tool('search_onu', {'query': 'budi'})
        assert r['count'] == 1 and r['onus'][0]['interface'] == 'gpon-onu_1/1/1:1'
        p = ai_agent.run_tool('problem_onus', {})
        assert [o['name'] for o in p['not_online']] == ['ani@rw02']
        assert 'error' in ai_agent.run_tool('nope', {})


def test_sender_allowed(client):
    with app.app_context():
        ai_agent.save_config({'ai_allowed_senders': '6281299999999, 12345'})
        assert ai_agent.sender_allowed('whatsapp', '6281299999999')
        assert ai_agent.sender_allowed('whatsapp', '6281200000001')       # nomor super admin
        assert not ai_agent.sender_allowed('whatsapp', '6281200000002')   # user tanpa izin
        assert not ai_agent.sender_allowed('whatsapp', '6280000000000')
        assert ai_agent.sender_allowed('telegram', '12345')
        assert not ai_agent.sender_allowed('telegram', '999')


def test_anthropic_tool_loop(client, monkeypatch):
    _enable('anthropic')
    calls = []

    def fake_post(url, json=None, headers=None, timeout=None):
        calls.append(json)
        if len(calls) == 1:
            return _Resp({'stop_reason': 'tool_use', 'content': [
                {'type': 'tool_use', 'id': 't1', 'name': 'search_onu', 'input': {'query': 'ani'}}]})
        tool_result = json['messages'][-1]['content'][0]
        assert tool_result['type'] == 'tool_result' and 'ani@rw02' in tool_result['content']
        return _Resp({'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': 'ani@rw02 LOS'}]})

    monkeypatch.setattr(ai_agent.httpx, 'post', fake_post)
    with app.app_context():
        assert ai_agent.ask('t', 'status ani?') == 'ani@rw02 LOS'
        assert len(ai_agent.HISTORY.get('t')) == 2


def test_openai_tool_loop(client, monkeypatch):
    _enable('openai', ai_base_url='http://llm.local/v1', ai_model='m')
    n = {'i': 0}

    def fake_post(url, json=None, headers=None, timeout=None):
        assert url == 'http://llm.local/v1/chat/completions'
        n['i'] += 1
        if n['i'] == 1:
            return _Resp({'choices': [{'message': {'role': 'assistant', 'content': None, 'tool_calls': [
                {'id': 'c1', 'type': 'function', 'function': {'name': 'nms_summary', 'arguments': '{}'}}]}}]})
        assert json['messages'][-1]['role'] == 'tool'
        return _Resp({'choices': [{'message': {'role': 'assistant', 'content': '1 LOS'}}]})

    monkeypatch.setattr(ai_agent.httpx, 'post', fake_post)
    with app.app_context():
        assert ai_agent.ask('o', 'ringkasan') == '1 LOS'


def test_disabled_and_api_error(client, monkeypatch):
    with app.app_context():
        assert 'belum diaktifkan' in ai_agent.ask('x', 'hi')
    _enable('anthropic')
    monkeypatch.setattr(ai_agent.httpx, 'post', lambda *a, **k: _Resp({'error': 'x'}, 401))
    with app.app_context():
        assert 'tidak bisa dihubungi' in ai_agent.ask('x', 'hi')


def test_wa_inbound_auth_and_whitelist(client, monkeypatch):
    _enable('anthropic')
    monkeypatch.setattr(ai_agent, 'ask', lambda k, q: 'jawab:' + q)
    url = '/api/internal/ai/wa-inbound'
    body = {'sender': '6281200000001', 'text': 'halo'}
    assert client.post(url, json=body, headers=H).status_code == 403
    assert client.post(url, json=body, headers=dict(H, **{'X-Internal-Key': 'salah'})).status_code == 403
    ok = dict(H, **{'X-Internal-Key': FAKE_KEY})
    assert client.post(url, json=body, headers=ok).get_json()['reply'] == 'jawab:halo'
    assert client.post(url, json={'sender': '6280000000000', 'text': 'x'}, headers=ok).get_json()['reply'] is None


def test_web_ask_permission_and_settings(client, monkeypatch):
    _enable('anthropic')
    monkeypatch.setattr(ai_agent, 'ask', lambda k, q: 'ok')
    _login(client, 'tech')
    assert client.post('/api/ai/ask', json={'question': 'x'}, headers=H).status_code == 403
    assert client.get('/api/ai/settings').status_code == 403
    client.post('/api/auth/logout', headers=H)
    _login(client, 'boss')
    assert client.post('/api/ai/ask', json={'question': 'x'}, headers=H).get_json()['answer'] == 'ok'
    cfg = client.get('/api/ai/settings').get_json()['config']
    assert cfg['has_key'] and 'api_key' not in cfg
