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


# ─────────────────────────── origin terpisah ────────────────────────────
_ORIGIN_RE = re.compile(r'^(https?)://([a-z0-9.-]+)(?::(\d{1,5}))?/?$', re.I)
_origin_cache = {'ts': 0.0, 'v': ''}


def normalize_origin(value):
    """'https://modem.contoh.id/' → 'https://modem.contoh.id' ('' bila tak valid)."""
    m = _ORIGIN_RE.match((value or '').strip())
    if not m:
        return ''
    port = f':{m.group(3)}' if m.group(3) else ''
    return f'{m.group(1).lower()}://{m.group(2).lower()}{port}'


def webadmin_origin():
    """Origin khusus browser modem (mis. https://modem.salfa.my.id) atau ''.

    Bila diset, halaman modem dimuat dari origin itu sehingga iframe boleh
    `allow-same-origin` (frame/iframe modem bisa saling memanggil — wajib untuk
    UI Huawei/ZTE yang memakai frame) tanpa memberi akses ke origin/sesi NMS.
    Sumber: env WEBADMIN_ORIGIN, lalu SystemConfig 'webadmin_origin' (cache 30 dtk)."""
    env = normalize_origin(os.environ.get('WEBADMIN_ORIGIN', ''))
    if env:
        return env
    if time.time() - _origin_cache['ts'] < 30:
        return _origin_cache['v']
    v = ''
    try:
        from models import SystemConfig
        row = SystemConfig.query.filter_by(key='webadmin_origin').first()
        v = normalize_origin(row.value if row else '')
    except Exception:
        v = ''
    _origin_cache.update(ts=time.time(), v=v)
    return v


def reset_origin_cache():
    _origin_cache['ts'] = 0.0


def webadmin_host():
    o = webadmin_origin()
    return urlsplit(o).netloc.lower() if o else ''


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
    r'''(?<!\+)(?<!\+ )(?<!\+  )(?P<q>["'])/(?!/|webadmin/)(?P<p>(?:cgi-bin/|[\w\-./]+\.(?:html?|cgi|asp|aspx|jsp|php|js|css|json|xml|png|gif|jpe?g|ico|svg|lua|do|action)\b)[^"'\s<>]*)(?P=q)''',
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


_EXT_TYPES = {'.css': 'text/css', '.js': 'application/javascript',
              '.html': 'text/html', '.htm': 'text/html', '.asp': 'text/html',
              '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'}


def fix_content_type(path, ctype):
    """Perbaiki Content-Type yang salah/kosong dari modem berdasarkan ekstensi.

    Respons /webadmin memakai nosniff; modem (mis. Huawei) kerap mengirim CSS/JS
    sebagai text/html atau tanpa tipe sehingga Chrome menolak memuatnya
    (halaman login tampil polos tanpa gaya dan skrip tidak jalan)."""
    p = (path or '').split('?', 1)[0].lower()
    ext = p[p.rfind('.'):] if '.' in p.rsplit('/', 1)[-1] else ''
    want = _EXT_TYPES.get(ext)
    if not want:
        return ctype
    if want.split('/')[0] in (ctype or '').lower() and want.split('/')[1] in (ctype or '').lower():
        return ctype
    charset = '; charset=utf-8' if want.startswith('text/') or 'javascript' in want else ''
    return want + charset


def cookie_shim(prefix, cookies):
    """Skrip pengganti document.cookie untuk iframe ber-sandbox (origin buram).

    Di origin buram, document.cookie melempar SecurityError sehingga login
    modem yang menyetel cookie lewat JS (Huawei: "Cookie=body:Language:...")
    gagal. Shim menyimpan cookie di memori halaman dan menyinkronkannya ke jar
    server lewat POST {prefix}/__nms_cookie agar ikut terkirim ke modem."""
    import json
    init = json.dumps(dict(cookies or {})).replace('</', '<\\/')
    pre = json.dumps(prefix)
    return ('<script>(function(){var P=%s,c=%s;function s(){var a=[];for(var k in c)'
            'a.push(k+"="+c[k]);return a.join("; ")}try{Object.defineProperty(document,'
            '"cookie",{configurable:true,get:s,set:function(v){v=String(v);var f=v.split(";")[0],'
            'i=f.indexOf("=");if(i<1)return;var n=f.slice(0,i).trim(),x=f.slice(i+1).trim(),'
            'l=v.toLowerCase();if(!x||l.indexOf("max-age=0")>=0||l.indexOf("1970")>=0)delete c[n];'
            'else c[n]=x;try{var r=new XMLHttpRequest();r.open("POST",P+"/__nms_cookie",false);'
            'r.setRequestHeader("Content-Type","text/plain");r.send(v)}catch(e){}}})}catch(e){}'
            '})();</script>') % (pre, init)


def is_html_document(text):
    """True hanya untuk dokumen HTML sungguhan.

    Respons ajax modem sering ber-Content-Type text/html padahal isinya data
    (Huawei /asp/GetRandCount.asp = token login). Menyisipkan shim ke sana
    merusak token → login modem selalu gagal."""
    head = (text or '')[:2048].lower()
    return '<html' in head or '<head' in head or '<!doctype' in head or '<body' in head


def inject_head(html, snippet):
    m = re.search(r'<head[^>]*>', html, re.I)
    if m:
        return html[:m.end()] + snippet + html[m.end():]
    return snippet + html


# Kepala URL rakitan: "/frameaspdes/" + Language + "/x.js" → hanya potongan
# PERTAMA yang diberi prefix; potongan setelah '+' dibiarkan (lihat _JS_STR).
_JS_CONCAT_HEAD = re.compile(
    r'''(?<![+\w])(?P<s>\s*)(?P<q>["'])/(?!/|webadmin/)(?P<p>[\w\-./]*)(?P=q)(?=\s*\+)''')
# Variabel tujuan halaman: var pageName = '/'; top.location.replace(pageName)
_JS_PAGEVAR = re.compile(
    r'''(?P<a>\b\w*(?:page|url|href|path|link|dest|target|redirect)\w*\s*=\s*)(?P<q>["'])/(?!/|webadmin/)''',
    re.I)

# Navigasi/submit JS ke path root ("/", "/" + x, "/index.asp"): location=,
# location.href=, location.replace/assign(, .action=, setAction(, $.post/ajax url.
_JS_NAV = re.compile(
    r"""(?P<a>(?:\blocation(?:\.href)?\s*=\s*|\blocation\.(?:replace|assign)\(\s*|"""
    r"""\.action\s*=\s*|\bsetAction\(\s*|\burl\s*:\s*|\.(?:open|post|get)\(\s*(?:["'][A-Z]+["']\s*,\s*)?))"""
    r"""(?P<q>["'])/(?!/|webadmin/)""")


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
        text = _JS_CONCAT_HEAD.sub(
            lambda m: f"{m.group('s')}{m.group('q')}{prefix}/{m.group('p')}{m.group('q')}", text)
        text = _JS_NAV.sub(lambda m: f"{m.group('a')}{m.group('q')}{prefix}/", text)
        text = _JS_PAGEVAR.sub(lambda m: f"{m.group('a')}{m.group('q')}{prefix}/", text)
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


def security_headers(mode, sec_fetch_dest=None, separate=False):
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
    if separate:
        # Origin khusus modem: sudah terisolasi dari origin NMS, tak perlu sandbox.
        return h
    dest = (sec_fetch_dest or '').lower()
    if mode == 'tab' or dest == 'document':
        h['Content-Security-Policy'] = SANDBOX_CSP
    return h


CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, HEAD, OPTIONS',
    'Access-Control-Max-Age': '600',
}
