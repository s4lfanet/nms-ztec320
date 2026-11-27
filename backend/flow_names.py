"""Trafik Aplikasi: IP tujuan → nama → layanan (Google, YouTube, Meta, TikTok, …).

Sumber nama (berurutan, yang pertama menang):
  1. DNS cache router MikroTik (`/ip/dns/cache`) — nama yang benar-benar diminta pelanggan, termasuk
     rantai CNAME (www.youtube.com → … → IP). Hanya berguna bila pelanggan memakai router sebagai DNS.
  2. Reverse DNS (PTR) untuk IP yang belum dikenal, dibatasi per siklus.
Nama → layanan lewat aturan sufiks domain (`RULES`); nama yang tidak ada di aturan dipakai sebagai
domain induknya (mis. detik.com). IP tanpa nama = "Lainnya". Hasil di-cache di tabel FlowIpName.
"""
import logging
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

OTHER = 'Lainnya'
TTL_NAMED = timedelta(days=7)
TTL_NONE = timedelta(days=1)

RULES = {
    'YouTube': ['youtube.com', 'googlevideo.com', 'ytimg.com', 'youtu.be', 'youtube-nocookie.com'],
    'Google': ['google.com', 'gstatic.com', 'googleapis.com', '1e100.net', 'googleusercontent.com', 'ggpht.com',
               'google.co.id', 'gvt1.com', 'gvt2.com', 'googleadservices.com', 'doubleclick.net',
               'googlesyndication.com', 'googletagmanager.com', 'google-analytics.com', 'withgoogle.com',
               'android.com', 'app-measurement.com', 'goog'],
    'WhatsApp': ['whatsapp.net', 'whatsapp.com', 'wa.me'],
    'Instagram': ['instagram.com', 'cdninstagram.com'],
    'Facebook/Meta': ['facebook.com', 'fbcdn.net', 'fbsbx.com', 'facebook.net', 'fb.com', 'fbpigeon.com',
                      'meta.com', 'threads.net', 'oculus.com', 'tfbnw.net'],
    'TikTok': ['tiktok.com', 'tiktokcdn.com', 'tiktokv.com', 'byteoversea.com', 'ibytedtos.com',
               'bytedance.com', 'musical.ly', 'tiktokcdn-us.com', 'byteimg.com', 'ibyteimg.com'],
    'Netflix': ['netflix.com', 'nflxvideo.net', 'nflximg.net', 'nflxext.com', 'nflxso.net'],
    'Disney+': ['disneyplus.com', 'bamgrid.com', 'disney-plus.net', 'dssott.com', 'hotstar.com'],
    'Vidio': ['vidio.com'],
    'Telegram': ['telegram.org', 't.me', 'telegram.me', 'telesco.pe', 'cdn-telegram.org'],
    'Twitter/X': ['twitter.com', 'twimg.com', 'x.com', 't.co'],
    'Spotify': ['spotify.com', 'scdn.co', 'spotifycdn.com'],
    'Twitch': ['twitch.tv', 'ttvnw.net', 'jtvnw.net'],
    'Discord': ['discord.com', 'discordapp.com', 'discord.gg', 'discordapp.net'],
    'Zoom': ['zoom.us', 'zoom.com', 'zoomgov.com'],
    'Microsoft': ['microsoft.com', 'windows.com', 'windowsupdate.com', 'msftconnecttest.com', 'live.com',
                  'office.com', 'office365.com', 'azure.com', 'bing.com', 'msedge.net', 'skype.com',
                  'xboxlive.com', 'microsoftonline.com', 'msn.com', 'azureedge.net', 'office.net',
                  'sharepoint.com', 'linkedin.com', 'visualstudio.com', 'trafficmanager.net', 'akadns.net'],
    'Apple': ['apple.com', 'icloud.com', 'mzstatic.com', 'apple-dns.net', 'aaplimg.com', 'cdn-apple.com',
              'icloud-content.com', 'apple.news'],
    'Amazon/AWS': ['amazonaws.com', 'amazon.com', 'cloudfront.net', 'amazonvideo.com', 'primevideo.com',
                   'media-amazon.com', 'a2z.com', 'amazon.dev', 'awsstatic.com'],
    'Cloudflare': ['cloudflare.com', 'cloudflare.net', 'cloudflare-dns.com', 'cloudflarestream.com',
                   'workers.dev', 'pages.dev', 'one.one.one.one'],
    'Akamai': ['akamai.net', 'akamaiedge.net', 'akamaitechnologies.com', 'akamaihd.net', 'edgekey.net',
               'edgesuite.net', 'akamaized.net', 'akadns.net.akamai'],
    'Fastly': ['fastly.net', 'fastlylb.net', 'fastly.com'],
    'Shopee': ['shopee.co.id', 'shopee.com', 'shopeemobile.com', 'susercontent.com', 'shopee.io', 'shp.ee'],
    'Tokopedia': ['tokopedia.com', 'tokopedia.net', 'tokopedia.link'],
    'Lazada': ['lazada.co.id', 'lazada.com', 'lazcdn.com'],
    'Steam': ['steampowered.com', 'steamcontent.com', 'steamstatic.com', 'valvesoftware.com',
              'steamserver.net', 'steamcommunity.com'],
    'Mobile Legends': ['moonton.com', 'mobilelegends.com', 'mlbb.com'],
    'Free Fire / Garena': ['garena.com', 'freefiremobile.com', 'garenanow.com', 'garena.co.id', 'ff.garena.com'],
    'PUBG / Krafton': ['pubgmobile.com', 'krafton.com', 'proximabeta.com', 'igamecj.com'],
    'Roblox': ['roblox.com', 'rbxcdn.com'],
    'Speedtest': ['speedtest.net', 'ookla.com', 'ooklaserver.net'],
    'OpenAI': ['openai.com', 'chatgpt.com', 'oaistatic.com', 'oaiusercontent.com'],
    'GitHub': ['github.com', 'githubusercontent.com', 'github.io', 'githubassets.com'],
    'Dropbox': ['dropbox.com', 'dropboxstatic.com', 'dropboxusercontent.com'],
    'Alibaba': ['alicdn.com', 'aliyuncs.com', 'alibaba.com', 'aliexpress.com', 'alibabacloud.com'],
    'Tencent': ['qq.com', 'tencent.com', 'tencent-cloud.com', 'qcloud.com', 'myqcloud.com', 'weixin.qq.com'],
    'Oracle': ['oraclecloud.com', 'oracle.com', 'oraclecdn.com'],
    'Telkom/Indihome': ['telkom.co.id', 'indihome.co.id', 'telkomsel.com', 'telkom.net.id', 'myindihome.co.id'],
    'Canva': ['canva.com'],
    'Wikipedia': ['wikipedia.org', 'wikimedia.org'],
    'Yahoo': ['yahoo.com', 'yimg.com', 'yahoodns.net'],
}
_SUFFIX = {}
for _svc, _doms in RULES.items():
    for _d in _doms:
        _SUFFIX[_d] = _svc

# domain 2-tingkat umum (co.id, dst.) → domain induk memakai 3 label
_SLD2 = {'co.id', 'or.id', 'web.id', 'go.id', 'ac.id', 'sch.id', 'net.id', 'my.id', 'biz.id', 'com.au',
         'co.uk', 'co.jp', 'com.sg', 'com.my', 'co.in', 'com.cn', 'com.br'}


def _norm(name):
    return (name or '').strip().strip('.').lower()


def service_for_name(name):
    """Nama host → layanan. Aturan sufiks dulu; selain itu domain induk. '' → None."""
    n = _norm(name)
    if not n or n.replace('.', '').isdigit():
        return None
    labels = n.split('.')
    for i in range(len(labels)):
        svc = _SUFFIX.get('.'.join(labels[i:]))
        if svc:
            return svc
    if len(labels) >= 3 and '.'.join(labels[-2:]) in _SLD2:
        return '.'.join(labels[-3:])
    if len(labels) >= 2:
        return '.'.join(labels[-2:])
    return n


def rule_service(name):
    """Seperti service_for_name tetapi hanya bila cocok aturan (untuk memilih nama terbaik)."""
    labels = _norm(name).split('.')
    for i in range(len(labels)):
        svc = _SUFFIX.get('.'.join(labels[i:]))
        if svc:
            return svc
    return None


def best_service(names):
    """Dari beberapa nama (alias CNAME dulu): utamakan yang cocok aturan, lalu nama pertama."""
    for n in names:
        s = rule_service(n)
        if s:
            return s
    for n in names:
        s = service_for_name(n)
        if s:
            return s
    return None


# ─────────────────────────── cache ───────────────────────────

_cache = {}          # ip → layanan (str)  atau OTHER bila sudah dicoba & tak ketemu
_cache_lock = threading.Lock()


def lookup(ip):
    """Dipakai kolektor (cepat, tanpa I/O). None = belum dikenal → masuk antrean resolver."""
    s = _cache.get(ip)
    if s is None or s == OTHER:
        return None if s is None else OTHER
    return s


def load_cache():
    from models import FlowIpName
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    with _cache_lock:
        _cache.clear()
        for r in FlowIpName.query.all():
            ttl = TTL_NAMED if r.service else TTL_NONE
            if r.resolved_at and now - r.resolved_at < ttl:
                _cache[r.ip] = r.service or OTHER


def _store(entries):
    """entries = {ip: (name, service, source)} → DB + cache memori."""
    from models import db, FlowIpName
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for ip, (name, svc, src) in entries.items():
        row = db.session.get(FlowIpName, ip) or FlowIpName(ip=ip)
        # nama dari DNS cache router tidak ditimpa oleh hasil reverse DNS / "tak ada"
        if row.source == 'dns' and src != 'dns' and row.resolved_at and now - row.resolved_at < TTL_NAMED:
            continue
        row.name, row.service, row.source, row.resolved_at = (name or '')[:255], svc or '', src, now
        db.session.add(row)
        _cache[ip] = svc or OTHER
    db.session.commit()


# ─────────────────────────── DNS cache MikroTik ───────────────────────────

def dns_map_from_rows(rows):
    """Baris `/ip/dns/cache` → {ip: (nama_terbaik, layanan)}. Menelusuri rantai CNAME ke belakang."""
    aliases = {}                     # target → [nama yang CNAME ke target]
    addrs = []                       # (nama, ip)
    for r in rows or []:
        typ = str(r.get('type', '')).upper()
        name, data = _norm(r.get('name')), (r.get('data') or '').strip()
        if not name or not data:
            continue
        if typ == 'CNAME':
            aliases.setdefault(_norm(data), []).append(name)
        elif typ in ('A', 'AAAA'):
            addrs.append((name, data))

    def chain(n, depth=0, seen=None):
        seen = seen or set()
        out = []
        for a in aliases.get(n, []):
            if a not in seen and depth < 6:
                seen.add(a)
                out.append(a)
                out.extend(chain(a, depth + 1, seen))
        return out

    out = {}
    for name, ip in addrs:
        names = chain(name) + [name]
        svc = best_service(names)
        if svc:
            out[ip] = (names[0], svc)
    return out


def refresh_dns_from_routers():
    """Baca DNS cache semua MikroTik aktif (baca-saja). → jumlah IP yang dipelajari."""
    from models import MikrotikDevice
    from routeros_client import RouterOSClient
    learned = {}
    for dev in MikrotikDevice.query.filter_by(enabled=True).all():
        try:
            with RouterOSClient(dev.host, dev.api_mode, dev.api_port, dev.api_ssl, dev.api_user,
                                dev.api_password, timeout=15) as cli:
                rows = cli.read('ip/dns/cache', props='name,data,type')
            for ip, (name, svc) in dns_map_from_rows(rows).items():
                learned[ip] = (name, svc, 'dns')
        except Exception as e:
            logger.info('flow dns cache %s: %s', dev.name, e)
    if learned:
        _store(learned)
    return len(learned)


# ─────────────────────────── reverse DNS ───────────────────────────

def _rdns(ip):
    try:
        return ip, socket.gethostbyaddr(ip)[0]
    except Exception:
        return ip, ''


def resolve_pending(ips, timeout=8):
    """Reverse DNS paralel dengan batas waktu total. Yang gagal/lambat ditandai 'tak dikenal' sementara."""
    if not ips:
        return 0
    entries, done = {}, set()
    ex = ThreadPoolExecutor(max_workers=16, thread_name_prefix='flow-rdns')
    try:
        futs = [ex.submit(_rdns, ip) for ip in ips]
        finished, _ = wait(futs, timeout=timeout)
        for f in finished:
            ip, name = f.result()
            done.add(ip)
            svc = service_for_name(name) if name else None
            entries[ip] = (name, svc, 'rdns' if svc else 'none')
    finally:
        ex.shutdown(wait=False, cancel_futures=True)
    for ip in ips:
        if ip not in done:
            entries[ip] = ('', None, 'none')
    _store(entries)
    return len(entries)


def run_resolver(app, agg):
    """Thread latar: tiap menit selesaikan IP yang belum dikenal; tiap `flow_dns_minutes` baca DNS cache router."""
    from models import db
    import flow_collector
    with app.app_context():
        try:
            load_cache()
        except Exception as e:
            logger.warning('flow cache load failed: %s', e)
        agg.resolve = lookup
        last_dns = 0.0
        while True:
            try:
                cfg = flow_collector.get_settings()
                if cfg['flow_enabled']:
                    if time.time() - last_dns >= cfg['flow_dns_minutes'] * 60:
                        last_dns = time.time()
                        refresh_dns_from_routers()
                    pend = agg.take_pending(60)
                    pend = [ip for ip in pend if lookup(ip) is None]
                    if pend:
                        resolve_pending(pend)
            except Exception as e:
                db.session.rollback()
                logger.warning('flow resolver error: %s', e)
            time.sleep(60)
