"""Mikrotik RouterOS client — PPPoE session query + ping.

Two transports:
  - 'api'  : classic binary API (default port 8728, SSL 8729). Works on
             RouterOS v6.43+ and v7 with plain-text /login. Implemented on
             raw sockets — no third-party dependency.
  - 'rest' : RouterOS v7 REST API over httpx (already a project dependency).

A single client object is short-lived per poll cycle (connect → query → close).
"""
import socket
import ssl as _ssl
import struct

import logging
logger = logging.getLogger(__name__)


class RouterOSError(Exception):
    pass


# ---------------------------------------------------------------------------
# Classic binary API (port 8728 / 8729)
# ---------------------------------------------------------------------------
class _ApiConn:
    """Minimal RouterOS binary-API connection (post-v6.43 plain login)."""

    def __init__(self, host, port=8728, use_ssl=False, timeout=10):
        self.timeout = timeout
        raw = socket.create_connection((host, port), timeout=timeout)
        raw.settimeout(timeout)
        if use_ssl:
            ctx = _ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = _ssl.CERT_NONE
            self.sock = ctx.wrap_socket(raw, server_hostname=host)
        else:
            self.sock = raw

    # ---- word protocol -----------------------------------------------------
    @staticmethod
    def _enc_len(n):
        if n < 0x80:
            return bytes([n])
        if n < 0x4000:
            return struct.pack('>H', n | 0x8000)
        if n < 0x200000:
            return bytes([(n >> 16) | 0xC0, (n >> 8) & 0xFF, n & 0xFF])
        if n < 0x10000000:
            return struct.pack('>I', n | 0xE0000000)
        return b'\xf0' + struct.pack('>I', n)

    def _send_word(self, w):
        b = w.encode('utf-8')
        self.sock.sendall(self._enc_len(len(b)) + b)

    def _read_exact(self, n):
        buf = b''
        while len(buf) < n:
            chunk = self.sock.recv(n - len(buf))
            if not chunk:
                raise RouterOSError('Connection closed by router')
            buf += chunk
        return buf

    def _read_len(self):
        b = self._read_exact(1)[0]
        if b < 0x80:
            return b
        if b < 0xC0:
            return ((b & 0x3F) << 8) | self._read_exact(1)[0]
        if b < 0xE0:
            hi, lo = self._read_exact(2)
            return ((b & 0x1F) << 16) | (hi << 8) | lo
        if b < 0xF0:
            b1, b2, b3 = self._read_exact(3)
            return ((b & 0x0F) << 24) | (b1 << 16) | (b2 << 8) | b3
        return struct.unpack('>I', self._read_exact(4))[0]

    def _read_word(self):
        n = self._read_len()
        return self._read_exact(n).decode('utf-8', errors='replace') if n else ''

    def talk(self, *words):
        """Send a command sentence, return list of reply dicts."""
        for w in words:
            self._send_word(w)
        self._send_word('')  # sentence terminator
        out, cur, trap, trap_pending = [], {}, [], False
        while True:
            w = self._read_word()
            if not w:
                continue
            if w == '!done':
                if cur:
                    out.append(cur)
                if trap:
                    raise RouterOSError('; '.join(trap) or 'API trap')
                return out
            if w == '!re':
                if cur:
                    out.append(cur)
                cur = {}
                continue
            if w == '!trap':
                trap_pending = True
                continue
            if w == '!fatal':
                raise RouterOSError(f'API fatal: {self._read_word()}')
            if w.startswith('='):
                k, _, v = w[1:].partition('=')
                if trap_pending and k in ('message', 'category'):
                    trap.append(v)
                    trap_pending = k != 'message'
                    continue
                trap_pending = False
                cur[k] = v
                continue
            raise RouterOSError(f'Unexpected API word: {w}')

    def login(self, user, password):
        res = self.talk('/login', f'=name={user}', f'=password={password}')
        # Newer RouterOS returns !done + ret=<challenge> only for pre-6.43
        # style login — if a ret challenge comes back, do MD5 login.
        ret = res[0].get('ret') if res else None
        if ret:
            import hashlib
            chall = bytes.fromhex(ret)
            md5 = hashlib.md5(b'\x00' + password.encode() + chall).hexdigest()
            self.talk('/login', f'=name={user}', f'=response=00{md5}')
        return True

    def close(self):
        try:
            self.sock.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Public client
# ---------------------------------------------------------------------------
class RouterOSClient:
    """Unified client — api_mode 'api' (binary) or 'rest' (v7 REST)."""

    def __init__(self, host, api_mode='api', api_port=8728, api_ssl=False,
                 api_user='', api_password='', timeout=10):
        self.host = host
        self.api_mode = (api_mode or 'api').lower()
        self.api_port = api_port or (8728 if self.api_mode == 'api' else (443 if api_ssl else 80))
        self.api_ssl = api_ssl
        self.api_user = api_user
        self.api_password = api_password
        self.timeout = timeout
        self._conn = None

    # -- lifecycle ---------------------------------------------------------
    def connect(self):
        if self.api_mode == 'rest':
            return self  # httpx is stateless per call
        self._conn = _ApiConn(self.host, self.api_port, self.api_ssl, self.timeout)
        self._conn.login(self.api_user, self.api_password)
        return self

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None

    def __enter__(self):
        return self.connect()

    def __exit__(self, *exc):
        self.close()

    # -- REST helper --------------------------------------------------------
    def _rest(self, method, path, **kw):
        import httpx
        scheme = 'https' if self.api_ssl else 'http'
        url = f'{scheme}://{self.host}:{self.api_port}/rest/{path.lstrip("/")}'
        r = httpx.request(method, url, auth=(self.api_user, self.api_password) if self.api_user else None,
                          verify=False, timeout=self.timeout, **kw)
        if r.status_code >= 400:
            raise RouterOSError(f'REST {r.status_code}: {r.text[:200]}')
        return r.json()

    # -- operations ---------------------------------------------------------
    def get_pppoe_active(self):
        """Return list of active PPPoE sessions:
        [{'name': user, 'address': client_ip, 'uptime': '..', 'caller-id': '..',
          'service': 'pppoe', 'interface': '<pppoe-x>'}]"""
        if self.api_mode == 'rest':
            return self._rest('GET', 'ppp/active')
        return self._conn.talk('/ppp/active/print')

    def get_identity(self):
        if self.api_mode == 'rest':
            d = self._rest('GET', 'system/identity')
            return d.get('name', '') if isinstance(d, dict) else ''
        res = self._conn.talk('/system/identity/print')
        return res[0].get('name', '') if res else ''

    def ping(self, address, count=3, timeout=None):
        """Ping `address` from the Mikrotik. Returns
        {'sent': int, 'received': int, 'loss_pct': float, 'avg_rtt_ms': float|None}
        """
        count = max(1, int(count))
        if self.api_mode == 'rest':
            rows = self._rest('POST', 'ping', json={'address': address, 'count': str(count)})
            return _parse_ping_rows(rows)
        res = self._conn.talk('/ping', f'=address={address}', f'=count={count}')
        return _parse_ping_rows(res)


def _parse_ping_rows(rows):
    """Parse RouterOS ping result rows into a summary dict."""
    sent = received = 0
    avg_rtt = None
    loss = None
    if isinstance(rows, dict):
        rows = [rows]
    for r in rows or []:
        if not isinstance(r, dict):
            continue
        if 'avg-rtt' in r or 'packet-loss' in r:
            try:
                loss = float(str(r.get('packet-loss', '0')).replace('%', ''))
            except (ValueError, TypeError):
                pass
            avg_rtt = _rtt_to_ms(r.get('avg-rtt'))
            try:
                sent = int(r.get('sent', sent) or sent)
                received = int(r.get('received', received) or received)
            except (ValueError, TypeError):
                pass
        if r.get('time') and r.get('status') not in ('timeout',):
            received += 1
        sent = max(sent, int(r.get('seq', -1) or -1) + 1) if str(r.get('seq', '')).isdigit() else sent
    if loss is None:
        loss = round((1 - received / sent) * 100, 1) if sent else 100.0
    return {'sent': sent, 'received': received,
            'loss_pct': loss if loss is not None else 100.0,
            'avg_rtt_ms': avg_rtt}


def _rtt_to_ms(v):
    """Convert RouterOS RTT strings ('1ms 250us', '1.5', '250us') to ms float."""
    if v is None or v == '':
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    total = 0.0
    try:
        return float(s)
    except ValueError:
        pass
    import re
    for num, unit in re.findall(r'([\d.]+)\s*(ms|us|s)', s):
        f = float(num)
        total += f * {'s': 1000.0, 'ms': 1.0, 'us': 0.001}[unit]
    return total if total else None
