"""OLT terminal WebSocket: keystrokes must reach the channel exactly once.

Regression: ws_terminal_handler called chan_write() twice per message, so
"show card" reached the OLT as "sshhooww  ccaarrdd".
"""
import json
import os
import tempfile
import time

import pytest
from sqlalchemy import create_engine
from starlette.testclient import TestClient

from app import app, db
from models import OLT


@pytest.fixture
def ws_env(monkeypatch):
    import api_async
    tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
    tmp.close()
    eng = create_engine(f'sqlite:///{tmp.name}', connect_args={'check_same_thread': False})
    with app.app_context():
        orig = db.engines.get(None)
        db.engines[None] = eng
        db.create_all()
        db.session.add(OLT(name='T', ip_address='10.0.0.1', vendor='zte',
                           telnet_enabled=True, cli_username='admin', cli_password='x'))
        db.session.commit()

    received = bytearray()

    def fake_open(olt, proto):
        def w(d):
            received.extend(d)

        def r():
            time.sleep(0.05)
            return None
        return w, r, (lambda: None), (lambda c, rows: None), ''

    monkeypatch.setattr(api_async, '_open_terminal_channel', fake_open)
    monkeypatch.setattr(api_async, '_verify_ws_token', lambda t: (True, 1))
    monkeypatch.setattr(api_async, '_authorize_ws_user', lambda *a, **k: (True, ''))
    yield api_async.fastapi_app, received
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


def _drain_until(ws, received, want, timeout=3.0):
    end = time.time() + timeout
    while time.time() < end and bytes(received) != want:
        time.sleep(0.05)


def test_keystrokes_written_once(ws_env):
    fastapi_app, received = ws_env
    with TestClient(fastapi_app) as c:
        with c.websocket_connect('/ws/terminal/1?token=t&proto=telnet') as ws:
            ws.send_text('\x01' + json.dumps({'cols': 80, 'rows': 24}))  # resize, not input
            for ch in 'show card\r':
                ws.send_text(ch)
            _drain_until(ws, received, b'show card\r')
    assert bytes(received) == b'show card\r'
