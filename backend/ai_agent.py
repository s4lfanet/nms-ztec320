"""AI agent NMS (baca-saja) — tanya jawab status jaringan lewat WhatsApp/Telegram/web.

Provider:
  * anthropic — Claude API (https://api.anthropic.com), kunci dari console.anthropic.com
  * openai    — endpoint OpenAI-compatible (OpenAI, Gemini, OpenRouter, Ollama, dll.)

Agent hanya punya tool BACA dari database NMS (tanpa perintah ke OLT, tanpa
mengubah data). Pengirim WhatsApp/Telegram wajib terdaftar (whitelist atau
nomor HP user aktif yang punya izin 'ai_agent').
"""
import json
import threading
import time
from collections import OrderedDict
from datetime import datetime, timezone, timedelta

import httpx

from extensions import logger
from models import db, SystemConfig, ONU, OLT, Notification, User, encrypt_field, decrypt_field

PERM = 'ai_agent'
MAX_TOOL_ROUNDS = 6
HISTORY_TURNS = 8
HISTORY_TTL = 30 * 60
REQUEST_TIMEOUT = 60

DEFAULTS = {
    'ai_enabled': '0',
    'ai_provider': 'anthropic',
    'ai_base_url': '',
    'ai_model': '',
    'ai_max_tokens': '1024',
    'ai_allowed_senders': '',   # nomor WA / chat id Telegram, pisah koma/baris
    'ai_channel_whatsapp': '1',
    'ai_channel_telegram': '0',
}
DEFAULT_MODEL = {'anthropic': 'claude-haiku-5-5', 'openai': 'gpt-4o-mini'}
DEFAULT_BASE = {'anthropic': 'https://api.anthropic.com', 'openai': 'https://api.openai.com/v1'}


# ─────────────────────────────── konfigurasi ────────────────────────────────

def get_config(include_key=False):
    rows = {r.key: r.value for r in SystemConfig.query.filter(SystemConfig.key.like('ai_%')).all()}
    cfg = {k: rows.get(k, v) or v for k, v in DEFAULTS.items()}
    provider = cfg['ai_provider'] if cfg['ai_provider'] in DEFAULT_MODEL else 'anthropic'
    cfg['ai_provider'] = provider
    cfg['ai_model'] = cfg['ai_model'] or DEFAULT_MODEL[provider]
    cfg['ai_base_url'] = (cfg['ai_base_url'] or DEFAULT_BASE[provider]).rstrip('/')
    key = decrypt_field(rows.get('ai_api_key_enc', '') or '')
    cfg['has_key'] = bool(key)
    if include_key:
        cfg['api_key'] = key
    return cfg


def save_config(data):
    def put(k, v):
        row = SystemConfig.query.filter_by(key=k).first()
        if row:
            row.value = v
        else:
            db.session.add(SystemConfig(key=k, value=v))
    for k in DEFAULTS:
        if k in data:
            v = data[k]
            if isinstance(v, bool):
                v = '1' if v else '0'
            put(k, str(v).strip()[:2000])
    if data.get('api_key'):
        put('ai_api_key_enc', encrypt_field(str(data['api_key']).strip()))
    if data.get('clear_api_key'):
        put('ai_api_key_enc', '')
    db.session.commit()


def _digits(s):
    return ''.join(ch for ch in str(s or '') if ch.isdigit())


def _norm_phone(s):
    d = _digits(s)
    if d.startswith('0'):
        d = '62' + d[1:]
    return d


def sender_allowed(channel, sender):
    """Pengirim boleh bertanya? WA: whitelist atau nomor HP user aktif ber-izin."""
    cfg = get_config()
    allowed = [x.strip() for x in cfg['ai_allowed_senders'].replace('\n', ',').split(',') if x.strip()]
    if channel == 'telegram':
        return str(sender).strip() in allowed
    phone = _norm_phone(sender)
    if not phone:
        return False
    if phone in {_norm_phone(a) for a in allowed}:
        return True
    for u in User.query.filter(User.phone.isnot(None), User.phone != '').all():
        if _norm_phone(u.phone) == phone and getattr(u, 'is_active', True) and \
                (u.is_super_admin or u.has_permission(PERM)):
            return True
    return False


# ─────────────────────────────────── tools ──────────────────────────────────

def _iso(dt):
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone(timedelta(hours=7))).strftime('%Y-%m-%d %H:%M WIB')


def _onu_brief(o):
    prefix = 'epon-onu' if o.card == 'epon' else 'gpon-onu'
    return {
        'id': o.id, 'name': o.name, 'pppoe': o.pppoe or None,
        'olt': o.olt.name if o.olt else o.olt_id,
        'interface': f'{prefix}_{o.frame}/{o.slot}/{o.port}:{o.onu_id}',
        'status': o.status, 'rx_power_dbm': o.rx_power,
        'serial': o.serial_number,
    }


def tool_summary(_args):
    out = []
    for olt in OLT.query.order_by(OLT.name).all():
        out.append({
            'olt': olt.name, 'vendor': olt.vendor, 'online': bool(olt.is_online),
            'connection': olt.connection_status, 'temperature_c': olt.temperature,
            'onu_total': olt.total_onu, 'onu_online': olt.online_onu,
            'onu_offline': olt.offline_onu, 'onu_los': olt.los_onu,
            'onu_dying_gasp': olt.dyinggasp_onu, 'last_sync': _iso(olt.last_sync),
        })
    return {'olts': out}


def tool_search_onu(args):
    q = str(args.get('query') or '').strip()
    limit = max(1, min(int(args.get('limit') or 10), 25))
    if len(q) < 2:
        return {'error': 'query minimal 2 karakter'}
    like = f'%{q}%'
    rows = ONU.query.filter(db.or_(
        ONU.name.ilike(like), ONU.pppoe.ilike(like), ONU.serial_number.ilike(like),
        ONU.description.ilike(like))).limit(limit).all()
    return {'count': len(rows), 'onus': [_onu_brief(o) for o in rows]}


def tool_onu_detail(args):
    o = db.session.get(ONU, int(args.get('onu_id') or 0))
    if not o:
        return {'error': 'ONU tidak ditemukan'}
    d = _onu_brief(o)
    d.update({
        'description': o.description, 'tx_power_dbm': o.tx_power,
        'onu_rx_power_dbm': o.onu_rx_power, 'distance_m': o.distance,
        'last_down_reason': o.last_dereg_reason, 'model': o.actual_type or o.onu_type,
        'last_online': _iso(o.last_online), 'last_offline': _iso(o.last_offline),
        'last_seen': _iso(o.last_seen),
    })
    return d


def tool_problem_onus(args):
    limit = max(1, min(int(args.get('limit') or 15), 40))
    q = ONU.query.filter(ONU.status != 'online')
    if args.get('olt'):
        q = q.join(OLT, ONU.olt_id == OLT.id).filter(OLT.name.ilike(f"%{args['olt']}%"))
    rows = q.order_by(ONU.last_offline.desc().nullslast()).limit(limit).all()
    weak = []
    if args.get('include_weak_signal', True):
        weak = ONU.query.filter(ONU.status == 'online', ONU.rx_power.isnot(None),
                                ONU.rx_power < -27).order_by(ONU.rx_power).limit(limit).all()
    return {
        'not_online': [dict(_onu_brief(o), last_offline=_iso(o.last_offline),
                            reason=o.last_dereg_reason) for o in rows],
        'weak_signal_below_-27dbm': [_onu_brief(o) for o in weak],
    }


def tool_recent_alerts(args):
    hours = max(1, min(int(args.get('hours') or 24), 168))
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows = (Notification.query.filter(Notification.created_at >= since)
            .order_by(Notification.created_at.desc()).limit(25).all())
    return {'hours': hours, 'alerts': [
        {'time': _iso(n.created_at), 'severity': n.severity, 'category': n.category,
         'title': n.title, 'message': (n.message or '')[:300]} for n in rows]}


def tool_incidents(args):
    """Insiden gangguan massal (ODP/ODC/JC/OTB) — aktif, atau yang baru selesai."""
    import json as _json
    from models import Incident, User
    status = str(args.get('status') or 'active')
    q = Incident.query
    if status == 'active':
        q = q.filter(Incident.status.in_(('open', 'acknowledged', 'en_route', 'on_site')))
    rows = q.order_by(Incident.opened_at.desc()).limit(max(1, min(int(args.get('limit') or 10), 25))).all()
    out = []
    for i in rows:
        names = []
        for part in (i.assigned_user_ids or '').split(','):
            if part.strip().isdigit():
                u = db.session.get(User, int(part))
                if u:
                    names.append(u.full_name or u.username)
        out.append({'id': i.id, 'titik': f'{i.node_type.upper()} {i.node_name}', 'status': i.status,
                    'dugaan_penyebab': {'power': 'listrik padam', 'fiber': 'kabel putus'}.get(i.cause, 'campuran'),
                    'terdampak': i.affected_count, 'dibuka': _iso(i.opened_at),
                    'diterima_oleh': i.acknowledged_by or None, 'penanggung_jawab': names or None,
                    'selesai': _iso(i.resolved_at), 'penyebab_akhir': i.resolution_note or None,
                    'jumlah_onu_tercatat': len(_json.loads(i.affected_onu_ids or '[]'))})
    return {'incidents': out}


TOOLS = [
    ('nms_summary', 'Ringkasan semua OLT: status OLT, suhu, jumlah ONU online/offline/LOS/dying-gasp.',
     {'type': 'object', 'properties': {}}, tool_summary),
    ('search_onu', 'Cari ONU/pelanggan berdasarkan nama, username PPPoE, serial/MAC, atau deskripsi.',
     {'type': 'object', 'properties': {'query': {'type': 'string'}, 'limit': {'type': 'integer'}},
      'required': ['query']}, tool_search_onu),
    ('onu_detail', 'Detail satu ONU (redaman RX/TX, jarak, alasan putus terakhir, waktu online/offline).',
     {'type': 'object', 'properties': {'onu_id': {'type': 'integer'}}, 'required': ['onu_id']},
     tool_onu_detail),
    ('problem_onus', 'Daftar ONU yang tidak online (offline/LOS/dying gasp) dan ONU dengan redaman lemah.',
     {'type': 'object', 'properties': {'olt': {'type': 'string'}, 'limit': {'type': 'integer'},
                                       'include_weak_signal': {'type': 'boolean'}}}, tool_problem_onus),
    ('recent_alerts', 'Alert/gangguan terbaru dalam N jam terakhir (default 24).',
     {'type': 'object', 'properties': {'hours': {'type': 'integer'}}}, tool_recent_alerts),
    ('incidents', 'Insiden gangguan massal (ODP/ODC/JC/OTB): titik, status penanganan, dugaan penyebab, '
                  'jumlah pelanggan terdampak, teknisi. status=active (default) atau all.',
     {'type': 'object', 'properties': {'status': {'type': 'string', 'enum': ['active', 'all']},
                                       'limit': {'type': 'integer'}}}, tool_incidents),
]
_TOOL_FN = {t[0]: t[3] for t in TOOLS}


def _strip_empty(v):
    if isinstance(v, dict):
        return {k: _strip_empty(x) for k, x in v.items() if x not in (None, '', [], {})}
    if isinstance(v, list):
        return [_strip_empty(x) for x in v]
    return v


def _compact(result):
    """JSON hasil tool sehemat mungkin (tanpa spasi, tanpa field kosong) → hemat token."""
    return json.dumps(_strip_empty(result), ensure_ascii=False, default=str, separators=(',', ':'))


def run_tool(name, args):
    fn = _TOOL_FN.get(name)
    if not fn:
        return {'error': f'tool tidak dikenal: {name}'}
    try:
        return fn(args or {})
    except Exception as e:
        logger.warning(f'[AI] tool {name} error: {e}')
        return {'error': f'{type(e).__name__}: {str(e)[:200]}'}


SYSTEM_PROMPT = (
    "Kamu asisten NOC untuk {nms}. Jawab dalam Bahasa Indonesia, singkat dan jelas "
    "(cocok dibaca di WhatsApp: tanpa tabel markdown, pakai daftar pendek bila perlu). "
    "Selalu ambil data lewat tool sebelum menyebut angka atau status — jangan menebak. "
    "Kamu hanya bisa MEMBACA data NMS; jika diminta reboot/ubah konfigurasi, jelaskan "
    "bahwa itu harus dilakukan lewat aplikasi NMS. Redaman RX normal -8 s/d -27 dBm. "
    "Waktu sekarang: {now}."
)


def _system_prompt():
    name = 'Salfanet NMS'
    try:
        row = SystemConfig.query.filter_by(key='nms_name').first()
        if row and row.value:
            name = row.value
    except Exception:
        pass
    now = datetime.now(timezone(timedelta(hours=7))).strftime('%Y-%m-%d %H:%M WIB')
    return SYSTEM_PROMPT.format(nms=name, now=now)


# ───────────────────────────── klien provider ───────────────────────────────

def _call_anthropic(cfg, messages):
    tools = [{'name': n, 'description': d, 'input_schema': s} for n, d, s, _ in TOOLS]
    msgs = list(messages)
    for _ in range(MAX_TOOL_ROUNDS):
        r = httpx.post(f"{cfg['ai_base_url']}/v1/messages", timeout=REQUEST_TIMEOUT, json={
            'model': cfg['ai_model'], 'max_tokens': int(cfg['ai_max_tokens'] or 1024),
            'system': _system_prompt(), 'tools': tools, 'messages': msgs,
        }, headers={'x-api-key': cfg['api_key'], 'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'})
        if r.status_code >= 400:
            raise RuntimeError(f'Claude API {r.status_code}: {r.text[:300]}')
        data = r.json()
        content = data.get('content') or []
        msgs.append({'role': 'assistant', 'content': content})
        calls = [c for c in content if c.get('type') == 'tool_use']
        if data.get('stop_reason') != 'tool_use' or not calls:
            return '\n'.join(c.get('text', '') for c in content if c.get('type') == 'text').strip()
        msgs.append({'role': 'user', 'content': [
            {'type': 'tool_result', 'tool_use_id': c['id'],
             'content': _compact(run_tool(c['name'], c.get('input')))}
            for c in calls]})
    return 'Maaf, pertanyaan ini butuh terlalu banyak langkah. Coba persempit pertanyaannya.'


def test_connection():
    """Panggilan kecil tanpa tool untuk mengecek API key, base URL, dan model
    yang TERSIMPAN. Return (ok, pesan)."""
    cfg = get_config(include_key=True)
    if cfg['ai_provider'] == 'anthropic' and not cfg.get('api_key'):
        return False, 'API key belum diisi.'
    try:
        if cfg['ai_provider'] == 'anthropic':
            r = httpx.post(f"{cfg['ai_base_url']}/v1/messages", timeout=30, json={
                'model': cfg['ai_model'], 'max_tokens': 16,
                'messages': [{'role': 'user', 'content': 'Balas satu kata: OK'}],
            }, headers={'x-api-key': cfg['api_key'], 'anthropic-version': '2023-06-01',
                        'content-type': 'application/json'})
            if r.status_code >= 400:
                return False, f'Claude API {r.status_code}: {r.text[:200]}'
            text = ''.join(c.get('text', '') for c in r.json().get('content') or [])
        else:
            headers = {'content-type': 'application/json'}
            if cfg.get('api_key'):
                headers['authorization'] = f"Bearer {cfg['api_key']}"
            r = httpx.post(f"{cfg['ai_base_url']}/chat/completions", timeout=30, json={
                'model': cfg['ai_model'], 'max_tokens': 16,
                'messages': [{'role': 'user', 'content': 'Balas satu kata: OK'}],
            }, headers=headers)
            if r.status_code >= 400:
                return False, f'AI API {r.status_code}: {r.text[:200]}'
            text = ((r.json().get('choices') or [{}])[0].get('message') or {}).get('content') or ''
        return True, f"Terhubung ke {cfg['ai_model']} — balasan: {text.strip()[:60] or '(kosong)'}"
    except httpx.HTTPError as e:
        return False, f'Tidak bisa terhubung ke {cfg["ai_base_url"]}: {e}'


def _call_openai(cfg, messages):
    tools = [{'type': 'function', 'function': {'name': n, 'description': d, 'parameters': s}}
             for n, d, s, _ in TOOLS]
    msgs = [{'role': 'system', 'content': _system_prompt()}] + [
        {'role': m['role'], 'content': m['content']} for m in messages]
    headers = {'content-type': 'application/json'}
    if cfg.get('api_key'):
        headers['authorization'] = f"Bearer {cfg['api_key']}"
    for _ in range(MAX_TOOL_ROUNDS):
        r = httpx.post(f"{cfg['ai_base_url']}/chat/completions", timeout=REQUEST_TIMEOUT, json={
            'model': cfg['ai_model'], 'max_tokens': int(cfg['ai_max_tokens'] or 1024),
            'messages': msgs, 'tools': tools,
        }, headers=headers)
        if r.status_code >= 400:
            raise RuntimeError(f'AI API {r.status_code}: {r.text[:300]}')
        msg = (r.json().get('choices') or [{}])[0].get('message') or {}
        calls = msg.get('tool_calls') or []
        msgs.append({k: v for k, v in msg.items() if k in ('role', 'content', 'tool_calls')})
        if not calls:
            return (msg.get('content') or '').strip()
        for c in calls:
            fn = c.get('function') or {}
            try:
                args = json.loads(fn.get('arguments') or '{}')
            except ValueError:
                args = {}
            msgs.append({'role': 'tool', 'tool_call_id': c.get('id'),
                         'content': _compact(run_tool(fn.get('name'), args))})
    return 'Maaf, pertanyaan ini butuh terlalu banyak langkah. Coba persempit pertanyaannya.'


# ──────────────────────── perintah cepat (tanpa AI) ─────────────────────────
# Template /perintah dijawab langsung dari database — 0 token, instan, tetap
# jalan walau API key belum diisi. Teks bebas (bukan '/…') diteruskan ke AI.

def _fmt_rx(v):
    return f'{v:.2f} dBm' if isinstance(v, (int, float)) else '-'


def _fmt_onu_line(o):
    extra = f" ({o['reason']})" if o.get('reason') else ''
    rx = f" | RX {_fmt_rx(o.get('rx_power_dbm'))}" if o.get('status') == 'online' else ''
    return f"- {o.get('name') or '-'} | {o['olt']} {o['interface']} | {o['status']}{rx}{extra}"


def _cmd_menu(_arg):
    return ('*Perintah cepat NMS* (tanpa AI, gratis):\n'
            '/ringkasan — status semua OLT\n'
            '/cari <nama/PPPoE/SN> — cari pelanggan\n'
            '/onu <ID atau nama> — detail satu ONU\n'
            '/gangguan [nama OLT] — ONU offline/LOS/dying gasp\n'
            '/redaman [nama OLT] — ONU online dengan RX < -27 dBm\n'
            '/alert [jam] — alert terbaru (default 6 jam)\n'
            '/insiden — gangguan massal yang sedang ditangani\n'
            '/reset — mulai percakapan AI baru\n\n'
            'Pertanyaan bebas (tanpa /) dijawab oleh AI.')


def _cmd_summary(_arg):
    rows = tool_summary({})['olts']
    if not rows:
        return 'Belum ada OLT.'
    out = ['*Ringkasan OLT*']
    tot = {'t': 0, 'on': 0, 'off': 0, 'los': 0, 'dg': 0}
    for o in rows:
        st = 'ONLINE' if o['online'] else 'OFFLINE'
        temp = f", {o['temperature_c']}°C" if o.get('temperature_c') else ''
        out.append(f"- {o['olt']} [{st}{temp}]: {o['onu_online'] or 0}/{o['onu_total'] or 0} online, "
                   f"LOS {o['onu_los'] or 0}, DG {o['onu_dying_gasp'] or 0}, offline {o['onu_offline'] or 0}")
        tot['t'] += o['onu_total'] or 0; tot['on'] += o['onu_online'] or 0
        tot['los'] += o['onu_los'] or 0; tot['dg'] += o['onu_dying_gasp'] or 0
    out.append(f"Total: {tot['on']}/{tot['t']} online, LOS {tot['los']}, DG {tot['dg']}")
    return '\n'.join(out)


def _cmd_search(arg):
    if len(arg) < 2:
        return 'Format: /cari <nama/PPPoE/SN>, contoh: /cari budi'
    r = tool_search_onu({'query': arg, 'limit': 10})
    if not r.get('onus'):
        return f'Tidak ada ONU yang cocok dengan "{arg}".'
    lines = [f"*{r['count']} ONU cocok \"{arg}\"*"] + [
        _fmt_onu_line(o) + f" | ID {o['id']}" for o in r['onus']]
    if r['count'] == 10:
        lines.append('(maks 10 — persempit kata kunci)')
    return '\n'.join(lines)


def _cmd_onu(arg):
    if not arg:
        return 'Format: /onu <ID atau nama>, contoh: /onu 125 atau /onu budi'
    if arg.isdigit():
        d = tool_onu_detail({'onu_id': int(arg)})
    else:
        r = tool_search_onu({'query': arg, 'limit': 5})
        if not r.get('onus'):
            return f'Tidak ada ONU yang cocok dengan "{arg}".'
        if r['count'] > 1:
            return _cmd_search(arg) + '\nKetik /onu <ID> untuk detail.'
        d = tool_onu_detail({'onu_id': r['onus'][0]['id']})
    if d.get('error'):
        return d['error']
    online = d['status'] == 'online'
    lines = [f"*{d.get('name') or '-'}* (ID {d['id']})",
             f"OLT: {d['olt']} {d['interface']}",
             f"Status: {d['status']}" + (f" — {d['last_down_reason']}" if not online and d.get('last_down_reason') else ''),
             f"PPPoE: {d.get('pppoe') or '-'} | SN: {d.get('serial') or '-'}",
             f"Model: {d.get('model') or '-'}"]
    if online:
        lines.append(f"RX ONU: {_fmt_rx(d.get('onu_rx_power_dbm') or d.get('rx_power_dbm'))} | "
                     f"RX OLT: {_fmt_rx(d.get('rx_power_dbm'))} | TX: {_fmt_rx(d.get('tx_power_dbm'))}")
    if d.get('distance_m'):
        lines.append(f"Jarak: {d['distance_m']} m")
    lines.append(f"Online terakhir: {d.get('last_online') or '-'} | Offline terakhir: {d.get('last_offline') or '-'}")
    return '\n'.join(lines)


def _cmd_problems(arg):
    r = tool_problem_onus({'olt': arg or None, 'limit': 20, 'include_weak_signal': False})
    rows = r['not_online']
    if not rows:
        return 'Tidak ada ONU yang bermasalah' + (f' di OLT "{arg}".' if arg else '. Semua online.')
    head = f"*{len(rows)} ONU tidak online*" + (f' (OLT "{arg}")' if arg else '') + (' — 20 terbaru' if len(rows) == 20 else '')
    return '\n'.join([head] + [_fmt_onu_line(o) for o in rows])


def _cmd_weak(arg):
    q = ONU.query.filter(ONU.status == 'online', ONU.rx_power.isnot(None), ONU.rx_power < -27)
    if arg:
        q = q.join(OLT, ONU.olt_id == OLT.id).filter(OLT.name.ilike(f'%{arg}%'))
    rows = q.order_by(ONU.rx_power).limit(20).all()
    if not rows:
        return 'Tidak ada ONU online dengan redaman di bawah -27 dBm.'
    return '\n'.join([f'*{len(rows)} ONU redaman lemah (< -27 dBm)*'] + [_fmt_onu_line(_onu_brief(o)) for o in rows])


def _cmd_alerts(arg):
    hours = int(arg) if arg.isdigit() else 6
    r = tool_recent_alerts({'hours': hours})
    if not r['alerts']:
        return f'Tidak ada alert dalam {r["hours"]} jam terakhir.'
    return '\n'.join([f"*Alert {r['hours']} jam terakhir* ({len(r['alerts'])})"] + [
        f"- {a['time']} [{a['severity']}] {a['title']}" for a in r['alerts'][:15]])


def _cmd_incidents(_arg):
    rows = tool_incidents({'status': 'active', 'limit': 15})['incidents']
    if not rows:
        return 'Tidak ada insiden gangguan aktif.'
    label = {'open': 'belum diterima', 'acknowledged': 'diterima', 'en_route': 'menuju lokasi',
             'on_site': 'di lokasi'}
    out = [f'*{len(rows)} insiden aktif*']
    for i in rows:
        who = i.get('diterima_oleh') or ', '.join(i.get('penanggung_jawab') or []) or '-'
        out.append(f"#{i['id']} {i['titik']} — {i['terdampak']} plg, {i['dugaan_penyebab']}, "
                   f"{label.get(i['status'], i['status'])} ({who})")
    return '\n'.join(out)


QUICK_COMMANDS = {
    'menu': _cmd_menu, 'bantuan': _cmd_menu, 'help': _cmd_menu, 'start': _cmd_menu,
    'ringkasan': _cmd_summary, 'status': _cmd_summary,
    'cari': _cmd_search,
    'onu': _cmd_onu, 'detail': _cmd_onu,
    'gangguan': _cmd_problems, 'down': _cmd_problems, 'los': _cmd_problems,
    'redaman': _cmd_weak,
    'alert': _cmd_alerts,
    'insiden': _cmd_incidents, 'incident': _cmd_incidents,
}


def quick_command(text):
    """Jawaban perintah /… atau None bila bukan perintah cepat."""
    if not text.startswith('/'):
        return None
    head, _, arg = text[1:].partition(' ')
    fn = QUICK_COMMANDS.get(head.lower().split('@')[0])   # '/ringkasan@namabot' (grup Telegram)
    if not fn:
        return None
    try:
        return fn(arg.strip())[:3500]
    except Exception as e:
        logger.warning(f'[AI] quick command {head}: {e}')
        return f'Gagal menjalankan /{head}: {str(e)[:120]}'


# ─────────────────────────────── percakapan ─────────────────────────────────

class _History:
    def __init__(self, max_conv=200):
        self._d = OrderedDict()
        self._lock = threading.Lock()
        self._max = max_conv

    def get(self, key):
        with self._lock:
            ent = self._d.get(key)
            if not ent or time.time() - ent[0] > HISTORY_TTL:
                return []
            return list(ent[1])

    def put(self, key, turns):
        with self._lock:
            self._d[key] = (time.time(), turns[-HISTORY_TURNS * 2:])
            self._d.move_to_end(key)
            while len(self._d) > self._max:
                self._d.popitem(last=False)

    def clear(self, key):
        with self._lock:
            self._d.pop(key, None)


HISTORY = _History()


def ask(conv_key, question):
    """Jawab pertanyaan. Mengembalikan teks balasan (tidak pernah raise)."""
    question = (question or '').strip()[:2000]
    if not question:
        return 'Pertanyaannya kosong.'
    if question.lower() in ('/reset', 'reset', '/baru'):
        HISTORY.clear(conv_key)
        return 'Percakapan direset.'
    cfg = get_config(include_key=True)
    if cfg['ai_enabled'] != '1':
        return 'AI agent NMS belum diaktifkan.'
    quick = quick_command(question)
    if quick is not None:
        return quick
    if question.startswith('/'):
        return 'Perintah tidak dikenal. Ketik /menu untuk daftar perintah.'
    if cfg['ai_provider'] == 'anthropic' and not cfg['api_key']:
        return 'Kunci API AI belum diisi di pengaturan NMS.'
    history = HISTORY.get(conv_key)
    messages = history + [{'role': 'user', 'content': question}]
    try:
        if cfg['ai_provider'] == 'anthropic':
            answer = _call_anthropic(cfg, messages)
        else:
            answer = _call_openai(cfg, messages)
    except Exception as e:
        logger.warning(f'[AI] {cfg["ai_provider"]} error: {e}')
        return f'Maaf, AI sedang tidak bisa dihubungi ({str(e)[:160]}).'
    answer = answer or '(tidak ada jawaban)'
    HISTORY.put(conv_key, messages + [{'role': 'assistant', 'content': answer}])
    return answer[:3500]


# ───────────────────────────── Telegram polling ─────────────────────────────

_tg_thread = None


def start_telegram_poller(app):
    """Long-poll getUpdates bot Telegram yang dipakai alert; balas chat ber-whitelist."""
    global _tg_thread
    if _tg_thread and _tg_thread.is_alive():
        return

    def loop():
        offset = None
        while True:
            try:
                with app.app_context():
                    cfg = get_config()
                    from models import BotConfig
                    bot = BotConfig.query.filter_by(bot_type='telegram').first()
                    token = bot.bot_token if bot else ''
                    active = cfg['ai_enabled'] == '1' and cfg['ai_channel_telegram'] == '1' and token
                if not active:
                    time.sleep(30)
                    continue
                params = {'timeout': 25, 'allowed_updates': '["message"]'}
                if offset is not None:
                    params['offset'] = offset
                r = httpx.get(f'https://api.telegram.org/bot{token}/getUpdates', params=params, timeout=35)
                for upd in (r.json().get('result') or []):
                    offset = upd['update_id'] + 1
                    msg = upd.get('message') or {}
                    text = msg.get('text') or ''
                    chat_id = str((msg.get('chat') or {}).get('id', ''))
                    if not text or not chat_id:
                        continue
                    with app.app_context():
                        if not sender_allowed('telegram', chat_id):
                            continue
                        from helpers import log_action
                        reply = ask(f'tg:{chat_id}', text)
                        try:
                            log_action('ai_question', 'ai', target=f'telegram:{chat_id}', detail=text[:200])
                        except Exception:
                            pass
                    httpx.post(f'https://api.telegram.org/bot{token}/sendMessage', timeout=15,
                               json={'chat_id': chat_id, 'text': reply})
            except Exception as e:
                logger.warning(f'[AI] telegram poller: {e}')
                time.sleep(10)

    _tg_thread = threading.Thread(target=loop, name='ai-telegram-poller', daemon=True)
    _tg_thread.start()
