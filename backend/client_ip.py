"""IP asli pengguna di belakang Cloudflare Tunnel / Nginx.

Jalur produksi: pengguna → Cloudflare → cloudflared (127.0.0.1) → Nginx → Flask.
`ProxyFix(x_for=1)` hanya mengambil hop terakhir `X-Forwarded-For`, yaitu
cloudflared di 127.0.0.1 — jadi log aktivitas dan batas percobaan login selama
ini melihat "127.0.0.1" untuk SEMUA orang.

Cloudflare menulis IP pengunjung di `CF-Connecting-IP` (nilai dari klien selalu
ditimpa di tepi Cloudflare). Header itu HANYA dipercaya bila permintaan memang
datang dari proxy di mesin yang sama: hop yang dilihat Nginx loopback DAN koneksi
TCP ke Flask juga dari loopback. Akses langsung dari LAN / internet ke Nginx atau
ke port Flask tidak bisa memalsukan IP lewat header ini.
"""
import ipaddress

from flask import request

TRUSTED_HEADER = 'CF-Connecting-IP'


def _ip(s):
    try:
        return ipaddress.ip_address((s or '').strip())
    except ValueError:
        return None


def _via_local_proxy():
    hop = _ip(request.remote_addr)
    orig = (request.environ.get('werkzeug.proxy_fix.orig') or {}).get('REMOTE_ADDR') or request.remote_addr
    peer = _ip(orig)
    return bool(hop and hop.is_loopback and peer and peer.is_loopback)


def client_ip():
    """→ IP pengguna (string). Aman dipanggil di luar request (→ '')."""
    try:
        ip = request.remote_addr or ''
    except RuntimeError:
        return ''
    # ProxyFix mempercayai X-Forwarded-For dari SIAPA PUN yang menghubungi Flask.
    # Bila koneksi TCP bukan dari mesin ini (bukan lewat Nginx lokal), pakai
    # alamat TCP aslinya — header proxy dari klien diabaikan.
    orig = (request.environ.get('werkzeug.proxy_fix.orig') or {}).get('REMOTE_ADDR')
    peer = _ip(orig) if orig else None
    if peer and not peer.is_loopback:
        return str(peer)
    if _via_local_proxy():
        cf = _ip(request.headers.get(TRUSTED_HEADER, ''))
        if cf:
            return str(cf)
    return ip


def client_meta():
    """→ (ip, kode negara dari Cloudflare atau '', user agent)."""
    try:
        ua = (request.headers.get('User-Agent') or '')[:300]
        country = ''
        if _via_local_proxy() and request.headers.get(TRUSTED_HEADER):
            cc = (request.headers.get('CF-IPCountry') or '').strip().upper()
            country = cc if len(cc) == 2 and cc.isalpha() and cc != 'XX' else ''
        return client_ip(), country, ua
    except RuntimeError:
        return '', '', ''
