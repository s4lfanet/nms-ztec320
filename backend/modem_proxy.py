"""Reverse proxy web admin modem ("browser bawaan" NMS).

Admin membuka UI web modem/ONU pelanggan lewat NMS, jadi server NMS yang
menjangkau IP modem di jaringan lokal (WAN/PPPoE atau TR-069/mgmt) — browser
admin tidak perlu satu jaringan dengan modem.

Keamanan (halaman modem = konten tak tepercaya yang dijalankan di origin NMS):
* Target dibatasi: hanya IP milik ONU itu sendiri (link-state PPPoE / WAN
  GenieACS), harus IP privat/CGNAT (kecuali WEBADMIN_ALLOW_PUBLIC=1), dan
  bukan IP OLT/MikroTik/ACS yang dikelola NMS.
* Akses lewat token bertanda tangan + kedaluwarsa (30 menit) di URL; host
  tujuan HANYA dari token, tidak pernah dari path/query/header → bukan SSRF.
* Respons diberi `Content-Security-Policy: sandbox` (origin buram) sehingga
  skrip modem tidak bisa membaca cookie/API NMS ataupun memanggil API NMS
  dengan sesi admin. Karena itu cookie modem disimpan di server (jar per
  token), bukan di browser.
* Cookie/header sesi NMS tidak pernah diteruskan ke modem.
"""
import hashlib
import ipaddress
import os
import re
import secrets
import threading
import time
from collections import OrderedDict
from urllib.parse import urlsplit

TOKEN_SALT = 'modem-webadmin-v1'
TOKEN_TTL = 1800            # detik
MAX_BODY_IN = 5 * 1024 * 1024
MAX_BODY_OUT = 20 * 1024 * 1024
MAX_REWRITE = 3 * 1024 * 1024
UPSTREAM_TIMEOUT = 15
ALLOWED_SCHEMES = ('http', 'https')

_CGNAT = ipaddress.ip_network('100.64.0.0/10')


# ───────────────────────────── validasi target ──────────────────────────────

def allow_public():
    return os.environ.get('WEBADMIN_ALLOW_PUBLIC', '').strip() in ('1', 'true', 'yes')


def parse_ip(value):
    try:
        return ipaddress.ip_address((value or '').strip())
    except ValueError:
        return None


def is_allowed_ip(value, public_ok=None):
    """True bila IP boleh dijadikan target proxy."""
    ip = parse_ip(value)
    if ip is None:
        return False
    if (ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_unspecified
            or ip.is_reserved):
        return False
    if public_ok is None:
        public_ok = allow_public()
    if ip.version == 4 and ip in _CGNAT:
        return True
    if ip.is_private:
        return True
    return bool(public_ok)


def valid_port(value):
    try:
        p = int(value)
    except (TypeError, ValueError):
        return None
    return p if 1 <= p <= 65535 else None


# ─────────────────────────────── token & jar ────────────────────────────────

def _serializer(secret_key):
    from itsdangerous import URLSafeTimedSerializer
    return URLSafeTimedSerializer(secret_key, salt=TOKEN_SALT)


def make_token(secret_key, onu_id, user_id, scheme, host, port, mode='frame'):
    """mode 'frame' = dimuat di iframe ber-sandbox viewer NMS;
    'tab' = dibuka langsung di tab baru (respons wajib CSP sandbox)."""
    return _serializer(secret_key).dumps(
        {'o': int(onu_id), 'u': int(user_id), 's': scheme, 'h': host,
         'p': int(port), 'n': secrets.token_hex(6),
         'm': 'tab' if mode == 'tab' else 'frame'})


def read_token(secret_key, token):
    """Payload dict atau None (tanda tangan salah / kedaluwarsa / target tak sah)."""
    from itsdangerous import BadSignature
    try:
        d = _serializer(secret_key).loads(token, max_age=TOKEN_TTL)
    except BadSignature:
        return None
    if (not isinstance(d, dict) or d.get('s') not in ALLOWED_SCHEMES
            or valid_port(d.get('p')) is None or not is_allowed_ip(d.get('h'))):
        return None
    return d


class CookieJar:
    """Jar cookie modem per token (di memori, dibatasi ukurannya)."""

    def __init__(self, max_entries=200):
        self._d = OrderedDict()
        self._lock = threading.Lock()
        self._max = max_entries

    def get(self, key):
        with self._lock:
            now = time.time()
            for k in [k for k, (exp, _) in self._d.items() if exp < now]:
                del self._d[k]
            ent = self._d.get(key)
            return dict(ent[1]) if ent else {}

    def update(self, key, set_cookie_headers):
        if not set_cookie_headers:
            return
        with self._lock:
            ent = self._d.get(key)
            cookies = ent[1] if ent else {}
            for line in set_cookie_headers:
                first = line.split(';', 1)[0]
                if '=' not in first:
                    continue
                name, val = first.split('=', 1)
                name = name.strip()
                low = line.lower()
                if (not val.strip() or 'max-age=0' in low
                        or 'expires=thu, 01 jan 1970' in low):
                    cookies.pop(name, None)
                else:
                    cookies[name] = val.strip()
            self._d[key] = (time.time() + TOKEN_TTL, cookies)
            self._d.move_to_end(key)
            while len(self._d) > self._max:
                self._d.popitem(last=False)


JAR = CookieJar()


def jar_key(payload):
    return hashlib.sha1(f"{payload['o']}|{payload['n']}".encode()).hexdigest()


# ───────────────────────────── penulisan ulang ──────────────────────────────

_ATTR = re.compile(
    r'''(?P<a>\b(?:href|src|action|data|poster|background|formaction)\s*=\s*)(?P<q>["'])/(?!/|webadmin/)(?P<p>[^"']*)(?P=q)''',
    re.I)
_CSS_URL = re.compile(r'''url\(\s*(?P<q>["']?)/(?!/|webadmin/)''', re.I)
_META_REFRESH = re.compile(r'''(?P<a>\burl\s*=\s*)/(?!/)''', re.I)
_JS_STR = re.compile(
    r'''(?P<q>["'])/(?!/|webadmin/)(?P<p>(?:cgi-bin/|[\w\-./]+\.(?:html?|cgi|asp|aspx|jsp|php|js|css|json|xml|png|gif|jpe?g|ico|svg|lua|do|action)\b)[^"'\s<>]*)(?P=q)''',
    re.I)


_HTTPS_STUB = re.compile(r"""window\.location\s*=\s*["']https://["']\s*\+\s*HostInfo""")
_SSLPORT = re.compile(r"""var\s+SSLPort\s*=\s*["'](\d{1,5})["']""")


def https_redirect_port(text):
    """Deteksi halaman stub redirect HTTPS (Huawei HG8145/HG8245, dll).

    Modem merakit `window.location = "https://" + HostInfo + ":" + SSLPort`
    dari location.host — di proxy itu jadi domain NMS sehingga keluar dari
    /webadmin. Kembalikan port HTTPS tujuan (int) atau None.
    """
    if not text or not _HTTPS_STUB.search(text):
        return None
    m = _SSLPORT.search(text)
    return valid_port(m.group(1)) if m else 443


def _is_text_type(ctype):
    c = (ctype or '').lower()
    return ('text/html' in c or 'text/css' in c or 'javascript' in c
            or 'ecmascript' in c or 'application/xhtml' in c)


def rewrite_text(text, prefix, scheme, host, port, ctype):
    """Arahkan URL root-absolute & URL penuh ke modem menjadi lewat proxy.

    Heuristik: cukup untuk UI modem umum (ZTE/Huawei/Fiberhome). URL yang
    dirakit dinamis lewat penggabungan string di JS tidak bisa terdeteksi.
    """
    c = (ctype or '').lower()
    is_html = 'html' in c
    is_css = 'css' in c
    is_js = 'javascript' in c or 'ecmascript' in c

    if is_html:
        text = _ATTR.sub(
            lambda m: f"{m.group('a')}{m.group('q')}{prefix}/{m.group('p')}{m.group('q')}", text)
        text = _META_REFRESH.sub(lambda m: f"{m.group('a')}{prefix}/", text)
    if is_html or is_css:
        text = _CSS_URL.sub(lambda m: f"url({m.group('q')}{prefix}/", text)
    if is_html or is_js:
        text = _JS_STR.sub(
            lambda m: f"{m.group('q')}{prefix}/{m.group('p')}{m.group('q')}", text)

    # URL penuh ke modem itu sendiri (setelah path root, agar tidak diproses dua kali)
    netloc = re.escape(host) + (r'(?::%d)?' % port)
    text = re.sub(r'(?i)\b%s://%s(?=[/"\'\s?#)])/?' % (scheme, netloc), prefix + '/', text)
    return text


def rewrite_location(loc, prefix, scheme, host, port):
    """Location: ke modem → lewat proxy; ke host lain → None (ditolak)."""
    if not loc:
        return loc
    parts = urlsplit(loc)
    if parts.scheme or parts.netloc:
        same = (parts.hostname == host
                and (parts.port or (443 if parts.scheme == 'https' else 80)) == port)
        if not same:
            return None
        path = parts.path or '/'
        return prefix + path + (f'?{parts.query}' if parts.query else '') + \
            (f'#{parts.fragment}' if parts.fragment else '')
    if loc.startswith('/'):
        return prefix + loc
    return loc


# ───────────────────────────── header & cookie ──────────────────────────────

_NMS_COOKIES = {'session', 'remember_token', 'nms-admin-session', 'nms-tenant-session'}

REQ_PASS = ('user-agent', 'accept', 'accept-language', 'content-type',
            'x-requested-with', 'authorization', 'if-none-match', 'if-modified-since')
RESP_PASS = ('content-type', 'content-disposition', 'last-modified', 'etag',
             'content-language', 'content-range', 'accept-ranges')


def build_upstream_headers(req_headers, scheme, host, port, jar_cookies):
    h = {}
    for k in REQ_PASS:
        v = req_headers.get(k)
        if v:
            h[k] = v
    base = f'{scheme}://{host}:{port}'
    h['origin'] = base
    h['referer'] = base + '/'
    h['accept-encoding'] = 'identity'
    if jar_cookies:
        h['cookie'] = '; '.join(f'{k}={v}' for k, v in jar_cookies.items()
                                if k not in _NMS_COOKIES)
    return h


SANDBOX_CSP = ("sandbox allow-scripts allow-forms allow-popups allow-modals "
               "allow-downloads")


def security_headers(mode, sec_fetch_dest=None):
    """Header keamanan respons modem.

    Mode ditentukan dari token, BUKAN dari Sec-Fetch-Dest: browser tidak
    mengirim header Sec-Fetch-* bila NMS dibuka lewat http:// (bukan https),
    sehingga deteksi lama gagal dan iframe tetap dapat `CSP: sandbox` →
    Chrome menampilkan "Konten ini diblokir".

    * 'frame': iframe di viewer sudah ber-atribut sandbox → tanpa CSP sandbox.
      Bila token frame dibuka sebagai dokumen teratas (terdeteksi saat
      Sec-Fetch-Dest=document tersedia), tetap dikunci dengan CSP sandbox.
    * 'tab': selalu CSP sandbox.
    """
    h = {'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'}
    dest = (sec_fetch_dest or '').lower()
    if mode == 'tab' or dest == 'document':
        h['Content-Security-Policy'] = SANDBOX_CSP
    return h


CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, HEAD, OPTIONS',
    'Access-Control-Max-Age': '600',
}
