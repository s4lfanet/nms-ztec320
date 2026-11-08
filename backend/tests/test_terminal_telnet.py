"""Browser terminal over telnet: IAC negotiation, echo, clean display.

Regression: the bridge piped raw bytes between the OLT and xterm.js and never
answered telnet negotiation, so a server that echoes only after the client
agrees (WILL ECHO -> DO ECHO) showed nothing for typed input, and IAC bytes
leaked onto the screen as garbage.
"""
import socket
import threading
import time
from types import SimpleNamespace

import pytest


IAC, DONT, DO, WONT, WILL, SB, SE = 255, 254, 253, 252, 251, 250, 240
ECHO, SGA, NAWS = 1, 3, 31


# ---------------------------------------------------------------- unit tests

def _stream():
    from api_async import _TelnetStream
    sent = []
    return _TelnetStream(sent.append), sent


def test_strips_iac_and_replies_do_echo_sga():
    st, sent = _stream()
    shown = st.feed(bytes([IAC, WILL, ECHO, IAC, WILL, SGA]) + b'Username:')
    assert shown == b'Username:'
    assert bytes([IAC, DO, ECHO]) in sent and bytes([IAC, DO, SGA]) in sent


def test_unknown_options_refused():
    st, sent = _stream()
    st.feed(bytes([IAC, WILL, 24, IAC, DO, 24]))
    assert sent == [bytes([IAC, DONT, 24]), bytes([IAC, WONT, 24])]


def test_no_negotiation_loop_on_repeat():
    st, sent = _stream()
    for _ in range(3):
        st.feed(bytes([IAC, WILL, ECHO]))
    assert len(sent) == 1


def test_sequences_split_across_reads():
    st, sent = _stream()
    assert st.feed(b'ab' + bytes([IAC])) == b'ab'
    assert st.feed(bytes([WILL])) == b''
    assert st.feed(bytes([ECHO]) + b'cd') == b'cd'
    assert sent == [bytes([IAC, DO, ECHO])]


def test_escaped_iac_is_literal_and_subnegotiation_skipped():
    st, _ = _stream()
    assert st.feed(b'x' + bytes([IAC, IAC]) + b'y') == b'x\xffy'
    assert st.feed(bytes([IAC, SB, 24, 1, IAC, SE]) + b'ok') == b'ok'


def test_naws_sent_after_do_and_on_resize():
    st, sent = _stream()
    st.feed(bytes([IAC, DO, NAWS]))
    assert sent[0] == bytes([IAC, WILL, NAWS])
    assert sent[1] == bytes([IAC, SB, NAWS, 0, 80, 0, 24, IAC, SE])
    st.set_size(255, 40)   # 255 must be doubled inside subnegotiation
    assert sent[-1] == bytes([IAC, SB, NAWS, 0, IAC, IAC, 0, 40, IAC, SE])


# ------------------------------------------------- end-to-end with fake server

class FakeTelnetServer:
    """Strict server: echoes typed bytes only after the client sent DO ECHO."""

    def __init__(self):
        self.srv = socket.socket()
        self.srv.bind(('127.0.0.1', 0))
        self.srv.listen(1)
        self.port = self.srv.getsockname()[1]
        self.got_do_echo = False
        self.naws = None
        self.typed = bytearray()
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        conn, _ = self.srv.accept()
        conn.sendall(bytes([IAC, WILL, ECHO, IAC, WILL, SGA, IAC, DO, NAWS]) + b'Username:')
        conn.settimeout(0.2)
        buf = b''
        end = time.time() + 6
        while time.time() < end:
            try:
                d = conn.recv(1024)
            except socket.timeout:
                continue
            except OSError:
                return
            if not d:
                return
            buf += d
            while buf:
                if buf[0] == IAC and len(buf) >= 3 and buf[1] in (DO, DONT, WILL, WONT):
                    if buf[1:3] == bytes([DO, ECHO]):
                        self.got_do_echo = True
                    buf = buf[3:]
                elif buf[0] == IAC and len(buf) >= 2 and buf[1] == SB:
                    e = buf.find(bytes([IAC, SE]))
                    if e < 0:
                        break
                    sb = buf[3:e]
                    if buf[2] == NAWS:
                        self.naws = (sb[0] * 256 + sb[1], sb[2] * 256 + sb[3])
                    buf = buf[e + 2:]
                elif buf[0] == IAC and len(buf) < 3:
                    break
                else:
                    ch = buf[:1]
                    buf = buf[1:]
                    self.typed += ch
                    if self.got_do_echo:
                        conn.sendall(ch)
        conn.close()

    def close(self):
        self.srv.close()


def _collect(r, seconds):
    out = bytearray()
    end = time.time() + seconds
    while time.time() < end:
        d = r()
        if d:
            out += d
    return bytes(out)


@pytest.fixture
def fake_server():
    s = FakeTelnetServer()
    yield s
    s.close()


def test_echo_visible_and_clean_display(fake_server):
    from api_async import _open_terminal_channel
    olt = SimpleNamespace(ip_address='127.0.0.1', cli_port=fake_server.port,
                          cli_username='u', cli_password='p')
    w, r, k, res, err = _open_terminal_channel(olt, 'telnet')
    assert not err
    try:
        banner = _collect(r, 1.0)
        assert banner == b'Username:'              # no IAC garbage on screen
        w(b'admin\r')
        echoed = _collect(r, 1.0)
        assert echoed == b'admin\r'                # server echo reaches the screen
        assert fake_server.got_do_echo
        assert fake_server.naws == (80, 24)
        res(120, 40)
        time.sleep(0.5)
        assert fake_server.naws == (120, 40)
        assert bytes(fake_server.typed) == b'admin\r'   # each key sent exactly once
    finally:
        k()
