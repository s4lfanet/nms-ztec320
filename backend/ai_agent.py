"""AI agent NMS (baca-saja) — tanya jawab status jaringan lewat WhatsApp/Telegram/web.

Provider:
  * anthropic — Claude API (https://api.anthropic.com), kunci dari console.anthropic.com
  * openai    — endpoint OpenAI-compatible (OpenAI, Gemini, OpenRouter, Ollama, dll.)

Agent hanya punya tool BACA dari database NMS (tanpa perintah ke OLT, tanpa
mengubah data). Pengirim WhatsApp/Telegram wajib terdaftar (whitelist atau
nomor HP user aktif yang punya izin 'ai_agent').
"""
import json
import re
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
REQUEST_TIMEOUT = 90
TEST_TIMEOUT = 60
MODELS_TIMEOUT = 15  # tahap 1 tes koneksi: daftar model (cepat, tanpa generate)

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


# Model yang sudah dipensiunkan penyedia → penggantinya. Config lama yang
# tersimpan otomatis dipindahkan (sekali, lalu disimpan) supaya user tidak
# terjebak error 404 setelah update.
RETIRED_MODELS = {
    'generativelanguage.googleapis.com': {'gemini-2.5-flash': 'gemini-3.8-flash'},
}


def _upgrade_retired_model(cfg):
    for host, mapping in RETIRED_MODELS.items():
        if host in (cfg.get('ai_base_url') or '') and cfg.get('ai_model') in mapping:
            new = mapping[cfg['ai_model']]
            try:
                row = SystemConfig.query.filter_by(key='ai_model').first()
                if row:
                    row.value = new
                    db.session.commit()
            except Exception:
                db.session.rollback()
            cfg['ai_model'] = new
    return cfg


# ─────────────────────────────── konfigurasi ────────────────────────────────

def get_config(include_key=False):
    rows = {r.key: r.value for r in SystemConfig.query.filter(SystemConfig.key.like('ai_%')).all()}
    cfg = {k: rows.get(k, v) or v for k, v in DEFAULTS.items()}
    provider = cfg['ai_provider'] if cfg['ai_provider'] in DEFAULT_MODEL else 'anthropic'
    cfg['ai_provider'] = provider
    cfg['ai_model'] = cfg['ai_model'] or DEFAULT_MODEL[provider]
    cfg['ai_base_url'] = (cfg['ai_base_url'] or DEFAULT_BASE[provider]).rstrip('/')
    _upgrade_retired_model(cfg)
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
        'teknisi': (o.technician.full_name or o.technician.username) if o.technician else None,
        'odp': (f"{o.odp_port.odp.name} port {o.odp_port.port_number}"
                if getattr(o, 'odp_port', None) and getattr(o.odp_port, 'odp', None) else None),
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


# ── alat tambahan: FTTH, OLT, trafik, riwayat, MikroTik, TR069 (baca-saja) ──

_NODE_LABEL = {'otb': 'OTB', 'jc': 'JC', 'odc': 'ODC', 'odp': 'ODP'}


def _maps(lat, lng):
    return f'https://maps.google.com/?q={lat},{lng}' if lat is not None and lng is not None else None


def _node_brief(t, n):
    return {'type': _NODE_LABEL.get(t, t), 'id': n.id, 'name': n.name,
            'location': getattr(n, 'location', '') or None, 'maps': _maps(n.latitude, n.longitude)}


def _chain(t, node):
    """Jalur ke hulu: ODP → ODC/JC → OTB (urut dari yang terdekat)."""
    from ftth_topology import parents_of, get_node
    out, seen, cur = [], set(), (t, node)
    for _ in range(25):
        ps = parents_of(cur[0], cur[1])
        if not ps or ps[0] in seen:
            break
        seen.add(ps[0])
        n = get_node(*ps[0])
        if not n:
            break
        out.append(_node_brief(ps[0][0], n))
        cur = (ps[0][0], n)
    return out


def _resolve_onu(args):
    if args.get('onu_id'):
        return db.session.get(ONU, int(args['onu_id']))
    q = str(args.get('query') or '').strip()
    if len(q) >= 2:
        like = f'%{q}%'
        return ONU.query.filter(db.or_(ONU.name.ilike(like), ONU.pppoe.ilike(like),
                                       ONU.serial_number.ilike(like))).first()
    return None


def tool_onu_location(args):
    from ftth_topology import get_node
    o = _resolve_onu(args)
    if not o:
        return {'error': 'ONU tidak ditemukan (beri onu_id atau query)'}
    out = {'onu': _onu_brief(o),
           'teknisi': (o.technician.full_name or o.technician.username) if o.technician else None}
    port = getattr(o, 'odp_port', None)
    if not port:
        out['odp'] = 'ONU belum dipetakan ke port ODP mana pun di FTTH.'
        return out
    odp = get_node('odp', port.odp_id)
    out['odp'] = dict(_node_brief('odp', odp), port=port.port_number) if odp else None
    out['pelanggan'] = {'nama': port.customer_name or None, 'hp': port.customer_phone or None,
                        'kabel_drop_m': port.cable_length_meters}
    if odp:
        out['jalur_ke_hulu'] = _chain('odp', odp)
    return out


def tool_ftth_node(args):
    """Cari titik FTTH (OTB/JC/ODC/ODP) per nama; satu hasil → detail lengkap."""
    from ftth_topology import NODE_MODELS, collect_downstream_onus
    from models import FTTHODPPort, Incident
    q = str(args.get('name') or '').strip()
    types = [args['type'].lower()] if str(args.get('type') or '').lower() in NODE_MODELS else list(NODE_MODELS)
    if len(q) < 1:
        return {'error': 'isi name'}
    hits = []
    for t in types:
        m = NODE_MODELS[t]
        exact = m.query.filter(db.func.lower(m.name) == q.lower()).all()
        rows = exact or m.query.filter(db.or_(m.name.ilike(f'%{q}%'), m.location.ilike(f'%{q}%'))).limit(10).all()
        hits += [(t, n) for n in rows]
    if not hits:
        return {'error': f'titik FTTH "{q}" tidak ditemukan'}
    if len(hits) > 1:
        return {'count': len(hits), 'matches': [_node_brief(t, n) for t, n in hits[:15]],
                'hint': 'pilih satu nama lalu panggil lagi'}
    t, n = hits[0]
    onus = collect_downstream_onus(t, n.id)
    status = {}
    for o in onus:
        status[o.status or 'unknown'] = status.get(o.status or 'unknown', 0) + 1
    d = dict(_node_brief(t, n), model=getattr(n, 'model', '') or None,
             splitter=getattr(n, 'splitter_model', '') or None, description=n.description or None,
             jalur_ke_hulu=_chain(t, n), onu_hilir_total=len(onus), onu_hilir_status=status,
             onu_tidak_online=[_onu_brief(o) for o in onus if o.status != 'online'][:20])
    if t == 'odp':
        ports = FTTHODPPort.query.filter_by(odp_id=n.id).order_by(FTTHODPPort.port_number).all()
        d['port_total'] = n.total_ports
        d['port_terpakai'] = sum(1 for p in ports if p.onu_id or p.status == 'used')
        d['ports'] = [{'port': p.port_number, 'status': p.status, 'pelanggan': p.customer_name or None,
                       'onu': p.onu.name if p.onu else None, 'onu_status': p.onu.status if p.onu else None}
                      for p in ports]
    inc = Incident.query.filter_by(node_type=t, node_id=n.id).filter(
        Incident.status.in_(('open', 'acknowledged', 'en_route', 'on_site'))).first()
    d['insiden_aktif'] = {'id': inc.id, 'status': inc.status, 'terdampak': inc.affected_count} if inc else None
    return d


def tool_ftth_free_ports(args):
    """ODP yang masih punya port kosong (untuk pasang baru)."""
    from models import FTTHODP, FTTHODPPort
    q = str(args.get('query') or '').strip()
    limit = max(1, min(int(args.get('limit') or 10), 30))
    odps = FTTHODP.query
    if q:
        odps = odps.filter(db.or_(FTTHODP.name.ilike(f'%{q}%'), FTTHODP.location.ilike(f'%{q}%')))
    out = []
    for odp in odps.all():
        ports = FTTHODPPort.query.filter_by(odp_id=odp.id).all()
        used = {p.port_number for p in ports if p.onu_id or p.status == 'used'}
        free = [i for i in range(1, (odp.total_ports or 0) + 1) if i not in used]
        if free:
            out.append(dict(_node_brief('odp', odp), port_kosong=free, jumlah_kosong=len(free)))
    out.sort(key=lambda x: -x['jumlah_kosong'])
    return {'count': len(out), 'odps': out[:limit]}


def _find_olt(name):
    if not name:
        return None
    return OLT.query.filter(OLT.name.ilike(f'%{name}%')).first()


def tool_olt_detail(args):
    """Port PON (jumlah ONU), uplink (status, utilisasi, error), kipas, suhu."""
    from models import OLTPort, OLTUplink, Fan
    olt = _find_olt(args.get('olt'))
    if not olt:
        return {'error': 'OLT tidak ditemukan', 'olts': [o.name for o in OLT.query.all()]}
    pons = OLTPort.query.filter_by(olt_id=olt.id).order_by(OLTPort.port_number).all()
    ups = OLTUplink.query.filter_by(olt_id=olt.id).order_by(OLTUplink.port_number).all()
    fans = Fan.query.filter_by(olt_id=olt.id).order_by(Fan.fan_number).all()
    return {
        'olt': olt.name, 'ip': olt.ip_address, 'vendor': olt.vendor, 'model': olt.model,
        'firmware': olt.firmware_version, 'temperature_c': olt.temperature,
        'online': bool(olt.is_online), 'last_sync': _iso(olt.last_sync),
        'pon_ports': [{'port': p.port_name or p.port_interface, 'nama': p.name or None,
                       'admin': p.admin_status, 'onu': p.onu_count, 'online': p.onu_online,
                       'offline': p.onu_offline, 'sfp_tx': p.sfp_tx_power or None,
                       'sfp_temp': p.sfp_temperature or None} for p in pons],
        'uplinks': [{'port': u.port_name, 'speed': u.speed, 'admin': u.admin_status, 'oper': u.oper_status,
                     'desc': u.description or None, 'in': u.input_rate, 'out': u.output_rate,
                     'util_in': u.input_utilization, 'util_out': u.output_utilization,
                     'crc_errors': u.crc_errors, 'dropped': u.dropped} for u in ups],
        'fans': [{'fan': f.fan_number, 'status': f.status, 'rpm': f.rpm} for f in fans],
    }


def tool_traffic(args):
    """Trafik per port (Mbps) dari log yang sudah tersimpan: rata-rata & puncak."""
    from models import TrafficLog, TrafficLogHourly
    hours = max(1, min(int(args.get('hours') or 24), 24 * 30))
    olt = _find_olt(args.get('olt'))
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    ptype = args.get('port_type') if args.get('port_type') in ('uplink', 'pon') else None
    agg = {}
    if hours <= 3:
        q = TrafficLog.query.filter(TrafficLog.recorded_at >= since)
        if olt:
            q = q.filter(TrafficLog.olt_id == olt.id)
        if ptype:
            q = q.filter(TrafficLog.port_type == ptype)
        for r in q.all():
            a = agg.setdefault((r.olt_id, r.port_name), {'rx': [], 'tx': [], 'rxp': 0, 'txp': 0, 'type': r.port_type})
            a['rx'].append(r.rx_mbps or 0); a['tx'].append(r.tx_mbps or 0)
            a['rxp'] = max(a['rxp'], r.rx_mbps or 0); a['txp'] = max(a['txp'], r.tx_mbps or 0)
    else:
        q = TrafficLogHourly.query.filter(TrafficLogHourly.hour_start >= since)
        if olt:
            q = q.filter(TrafficLogHourly.olt_id == olt.id)
        if ptype:
            q = q.filter(TrafficLogHourly.port_type == ptype)
        for r in q.all():
            a = agg.setdefault((r.olt_id, r.port_name), {'rx': [], 'tx': [], 'rxp': 0, 'txp': 0, 'type': r.port_type})
            a['rx'].append(r.rx_mbps_avg or 0); a['tx'].append(r.tx_mbps_avg or 0)
            a['rxp'] = max(a['rxp'], r.rx_mbps_peak or 0); a['txp'] = max(a['txp'], r.tx_mbps_peak or 0)
    names = {o.id: o.name for o in OLT.query.all()}
    rows = [{'olt': names.get(k[0], k[0]), 'port': k[1], 'type': a['type'],
             'rx_avg_mbps': round(sum(a['rx']) / len(a['rx']), 1), 'tx_avg_mbps': round(sum(a['tx']) / len(a['tx']), 1),
             'rx_peak_mbps': round(a['rxp'], 1), 'tx_peak_mbps': round(a['txp'], 1)}
            for k, a in agg.items() if a['rx']]
    rows.sort(key=lambda r: -(r['rx_peak_mbps'] + r['tx_peak_mbps']))
    if not rows:
        return {'hours': hours, 'ports': [], 'note': 'belum ada data trafik pada rentang ini'}
    return {'hours': hours, 'ports': rows[:30]}


def tool_onu_history(args):
    """Riwayat status ONU (putus/nyambung) dan tren redaman harian."""
    from models import OnuStatusHistory, OnuRxHourly
    o = _resolve_onu(args)
    if not o:
        return {'error': 'ONU tidak ditemukan (beri onu_id atau query)'}
    days = max(1, min(int(args.get('days') or 7), 30))
    since = datetime.now(timezone.utc) - timedelta(days=days)
    hist = (OnuStatusHistory.query.filter(OnuStatusHistory.onu_id == o.id, OnuStatusHistory.created_at >= since)
            .order_by(OnuStatusHistory.created_at.desc()).limit(30).all())
    daily = {}
    for r in OnuRxHourly.query.filter(OnuRxHourly.onu_id == o.id, OnuRxHourly.hour >= since).all():
        dkey = _iso(r.hour)[:10]
        d = daily.setdefault(dkey, {'min': None, 'max': None, 'sum': 0.0, 'n': 0})
        if r.rx_min is not None:
            d['min'] = r.rx_min if d['min'] is None else min(d['min'], r.rx_min)
        if r.rx_max is not None:
            d['max'] = r.rx_max if d['max'] is None else max(d['max'], r.rx_max)
        if r.rx_avg is not None:
            d['sum'] += r.rx_avg; d['n'] += 1
    return {
        'onu': _onu_brief(o), 'days': days,
        'jumlah_putus': sum(1 for h in hist if h.new_status != 'online'),
        'perubahan_status': [{'waktu': _iso(h.created_at), 'dari': h.old_status, 'ke': h.new_status,
                              'alasan': h.dereg_reason or None, 'rx': h.rx_power} for h in hist],
        'rx_harian_dbm': [{'tanggal': k, 'min': v['min'], 'max': v['max'],
                           'avg': round(v['sum'] / v['n'], 2) if v['n'] else None}
                          for k, v in sorted(daily.items())],
    }


def tool_mikrotik(args):
    """Status PPPoE & ping pelanggan dari MikroTik (data poller tersimpan).
    Tanpa onu_id/query → ringkasan per router."""
    from models import MikrotikDevice, OnuLinkState
    routers = {m.id: m for m in MikrotikDevice.query.all()}
    if args.get('onu_id') or args.get('query'):
        o = _resolve_onu(args)
        if not o:
            return {'error': 'ONU tidak ditemukan'}
        s = OnuLinkState.query.filter_by(onu_id=o.id).first()
        if not s:
            return {'onu': _onu_brief(o), 'pppoe': 'belum ada data PPPoE untuk ONU ini (belum terhubung ke MikroTik)'}
        r = routers.get(s.mikrotik_id)
        return {'onu': _onu_brief(o), 'router': r.name if r else None,
                'pppoe_user': s.pppoe_user or None, 'ip': s.pppoe_ip or None,
                'sesi_aktif': bool(s.session_up), 'uptime': s.session_uptime or None,
                'mac': s.caller_id or None, 'ping_ms': s.rtt_ms, 'loss_pct': s.loss_pct,
                'kondisi_link': s.link_state, 'dicek': _iso(s.checked_at)}
    out = []
    for r in routers.values():
        q = OnuLinkState.query.filter_by(mikrotik_id=r.id)
        out.append({'router': r.name, 'host': r.host, 'aktif': bool(r.enabled), 'terhubung': bool(r.last_ok),
                    'error': r.last_error or None, 'dicek': _iso(r.last_polled_at),
                    'pppoe_up': q.filter_by(session_up=True).count(),
                    'pppoe_down': q.filter_by(session_up=False).count()})
    down = (OnuLinkState.query.filter_by(session_up=False).join(ONU, OnuLinkState.onu_id == ONU.id)
            .filter(ONU.status == 'online').limit(15).all())
    return {'routers': out,
            'onu_online_tapi_pppoe_putus': [dict(_onu_brief(db.session.get(ONU, s.onu_id)),
                                                 pppoe_user=s.pppoe_user or None) for s in down]}


def tool_tr069(args):
    """Info perangkat TR069 dari GenieACS (live, baca-saja): firmware, uptime,
    WAN/PPPoE, SSID, jumlah klien WiFi, terakhir lapor. Tidak menampilkan password."""
    from models import GenieacsDeviceMap
    o = _resolve_onu(args)
    if not o:
        return {'error': 'ONU tidak ditemukan (beri onu_id atau query)'}
    m = GenieacsDeviceMap.query.filter_by(onu_id=o.id).first()
    if not m:
        return {'onu': _onu_brief(o), 'tr069': 'ONU belum terpetakan ke perangkat GenieACS'}
    import genieacs_client
    p = genieacs_client.get_device_params(m.device_id)
    if not p:
        return {'onu': _onu_brief(o), 'error': 'GenieACS tidak bisa dihubungi atau perangkat tidak ditemukan'}
    return {'onu': _onu_brief(o), 'model': p.get('model'), 'vendor': p.get('vendor'),
            'firmware': p.get('software_version'), 'uptime_detik': p.get('uptime'),
            'terakhir_lapor': p.get('last_inform'), 'wan_ip': p.get('wan_ip'),
            'pppoe_user': p.get('pppoe_username'), 'klien_wifi': p.get('wifi_clients'),
            'ssid': [{'ssid': s['ssid'], 'band': s['band'], 'aktif': s['active']} for s in p.get('ssids') or []],
            'wan': [{'tipe': w['type'], 'user': w['username'] or None, 'ip': w['ip'] or None,
                     'status': w['status'] or None} for w in p.get('wan_conns') or []]}


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
    ('onu_location', 'Lokasi fisik pelanggan/ONU: ODP & nomor port, nama/HP pelanggan, jalur ke hulu '
                     '(ODC/JC/OTB) dengan link Google Maps, teknisi. Beri onu_id atau query (nama/PPPoE/SN).',
     {'type': 'object', 'properties': {'onu_id': {'type': 'integer'}, 'query': {'type': 'string'}}}, tool_onu_location),
    ('ftth_node', 'Detail titik FTTH (OTB/JC/ODC/ODP) per nama: lokasi+Maps, jalur hulu, isi port ODP, '
                  'jumlah ONU hilir per status, ONU hilir yang mati, insiden aktif.',
     {'type': 'object', 'properties': {'name': {'type': 'string'},
       'type': {'type': 'string', 'enum': ['otb', 'jc', 'odc', 'odp']}}, 'required': ['name']}, tool_ftth_node),
    ('ftth_free_ports', 'ODP yang masih punya port kosong untuk pasang baru (filter nama/lokasi opsional).',
     {'type': 'object', 'properties': {'query': {'type': 'string'}, 'limit': {'type': 'integer'}}},
     tool_ftth_free_ports),
    ('olt_detail', 'Detail satu OLT: port PON (jumlah ONU online/offline, SFP), uplink (status, '
                   'utilisasi, CRC error), kipas, suhu, firmware.',
     {'type': 'object', 'properties': {'olt': {'type': 'string'}}, 'required': ['olt']}, tool_olt_detail),
    ('traffic', 'Trafik port OLT (uplink/PON) dalam N jam terakhir: rata-rata & puncak Mbps.',
     {'type': 'object', 'properties': {'olt': {'type': 'string'}, 'hours': {'type': 'integer'},
       'port_type': {'type': 'string', 'enum': ['uplink', 'pon']}}}, tool_traffic),
    ('onu_history', 'Riwayat ONU N hari: kapan putus/nyambung & alasannya, tren redaman RX harian.',
     {'type': 'object', 'properties': {'onu_id': {'type': 'integer'}, 'query': {'type': 'string'},
       'days': {'type': 'integer'}}}, tool_onu_history),
    ('mikrotik', 'Status PPPoE pelanggan dari MikroTik: sesi aktif, IP, uptime, ping/loss. Tanpa ONU → '
                 'ringkasan router & ONU yang online tapi PPPoE putus.',
     {'type': 'object', 'properties': {'onu_id': {'type': 'integer'}, 'query': {'type': 'string'}}}, tool_mikrotik),
    ('tr069', 'Info modem dari GenieACS/TR069 (live): firmware, uptime, WAN IP, PPPoE, SSID, jumlah '
              'klien WiFi, terakhir lapor.',
     {'type': 'object', 'properties': {'onu_id': {'type': 'integer'}, 'query': {'type': 'string'}}}, tool_tr069),
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


def wa_format(text):
    """Ubah markdown umum (yang sering dipakai Gemini/GPT) ke format WhatsApp:
    butir '* ' → '- ', **tebal** → *tebal*, judul '#' → *judul*, backtick dibuang.
    Dipakai untuk jawaban WA/Telegram/web supaya tidak tampil simbol mentah."""
    if not text:
        return text
    t = re.sub(r'```[a-zA-Z]*\n?', '', text)
    t = t.replace('`', '')
    t = re.sub(r'^(\s*)[*+•]\s+', r'\1- ', t, flags=re.M)
    t = re.sub(r'^\s*#{1,6}\s*(.+?)\s*#*\s*$', r'*\1*', t, flags=re.M)
    t = re.sub(r'\*\*(.+?)\*\*', r'*\1*', t)
    t = re.sub(r'__(.+?)__', r'_\1_', t)
    t = re.sub(r'\*{2,}', '*', t)
    return t.strip()


SYSTEM_PROMPT = (
    "Kamu asisten NOC untuk {nms}. Jawab dalam Bahasa Indonesia, singkat dan jelas "
    "(cocok dibaca di WhatsApp: tanpa tabel markdown, pakai daftar pendek bila perlu). "
    "Format WhatsApp: tebal pakai *satu bintang*, butir daftar pakai '- ', tanpa backtick, "
    "tanpa judul '#'. "
    "Pilih tool yang tepat: lokasi/ODP pelanggan → onu_location; titik FTTH → ftth_node; port kosong → "
    "ftth_free_ports; port/uplink OLT → olt_detail; trafik → traffic; sering putus/riwayat → onu_history; "
    "PPPoE/internet pelanggan → mikrotik; modem/SSID/WiFi → tr069. Untuk keluhan pelanggan, gabungkan "
    "beberapa tool (status ONU, PPPoE, lokasi) lalu beri kesimpulan singkat. "
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
            raise RuntimeError(_api_error('Claude API', r))
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


def _extra_params(cfg):
    """Parameter tambahan per penyedia. Gemini (model 'thinking') dibatasi
    reasoning_effort=low supaya cepat membalas — tanpa ini Gemini 3.x bisa
    berpikir lama hingga koneksi timeout. Penyedia lain tidak diberi
    parameter ini (model non-reasoning OpenAI menolaknya)."""
    if 'generativelanguage.googleapis.com' in (cfg.get('ai_base_url') or ''):
        return {'reasoning_effort': 'low'}
    return {}


def _timeout_message(cfg, seconds):
    return (f"{cfg['ai_model']} tidak membalas dalam {seconds} detik. Penyedia mungkin sedang sibuk atau "
            f"model berpikir terlalu lama — coba lagi, atau pakai model yang lebih ringan "
            f"(mis. gemini-3.5-flash-lite). Pastikan juga server NMS bisa mengakses internet.")


def _api_error(label, r):
    """Pesan error penyedia yang ringkas & bisa ditindaklanjuti (bukan JSON mentah)."""
    msg = ''
    try:
        data = r.json()
        if isinstance(data, list) and data:
            data = data[0]
        err = data.get('error') if isinstance(data, dict) else None
        if isinstance(err, dict):
            msg = err.get('message') or ''
        elif isinstance(err, str):
            msg = err
    except Exception:
        pass
    msg = (msg or r.text or '').strip().replace('\n', ' ')[:220]
    hint = ''
    if r.status_code == 404 and 'model' in msg.lower():
        hint = ' → nama model tidak tersedia; ganti kolom Model di halaman AI Agent.'
    elif r.status_code in (401, 403):
        hint = ' → API key salah/tidak berlaku.'
    elif r.status_code == 429:
        hint = ' → batas pemakaian/kuota penyedia tercapai; coba lagi nanti.'
    return f'{label} {r.status_code}: {msg}{hint}'


def _auth_headers(cfg):
    if cfg['ai_provider'] == 'anthropic':
        return {'x-api-key': cfg.get('api_key') or '', 'anthropic-version': '2023-06-01',
                'content-type': 'application/json'}
    h = {'content-type': 'application/json'}
    if cfg.get('api_key'):
        h['authorization'] = f"Bearer {cfg['api_key']}"
    return h


def _suggest_models(ids, model):
    """Pilih beberapa model dari daftar untuk disarankan (utamakan 'flash')."""
    fam = (model or '').split('-')[0]
    same = [i for i in ids if fam and i.startswith(fam)] or list(ids)
    flash = [i for i in same if 'flash' in i] or same
    return sorted(flash, key=lambda i: ('lite' not in i, i))[:4]


def _check_models(cfg):
    """Tahap 1 tes koneksi: GET daftar model (cepat). Memisahkan masalah
    jaringan VPS, API key, dan nama model SEBELUM panggilan chat yang lama.
    Return (ok, pesan_error_atau_None, detik). Endpoint yang tidak mendukung
    daftar model (status selain 401/403) dilewati — tidak dianggap gagal."""
    base = cfg['ai_base_url']
    url = f"{base}/v1/models" if cfg['ai_provider'] == 'anthropic' else f"{base}/models"
    host = httpx.URL(base).host or base
    t0 = time.monotonic()
    try:
        r = httpx.get(url, timeout=MODELS_TIMEOUT, headers=_auth_headers(cfg))
    except httpx.TimeoutException:
        return False, (f'Server NMS tidak mendapat jawaban dari {host} dalam {MODELS_TIMEOUT} detik '
                       f'(bahkan untuk daftar model). Masalahnya di jaringan VPS → cek DNS, firewall, '
                       f'atau proxy keluar; bukan di API key/model.'), 0
    except httpx.HTTPError as e:
        return False, f'Server NMS tidak bisa menjangkau {host}: {e}. Cek DNS/internet VPS.', 0
    secs = time.monotonic() - t0
    if r.status_code in (401, 403):
        return False, _api_error('AI API', r), secs
    if r.status_code >= 400:
        return True, None, secs
    try:
        data = r.json()
        items = data.get('data') if isinstance(data, dict) else None
        ids = [str(m.get('id') or '').removeprefix('models/') for m in items or [] if isinstance(m, dict)]
        ids = [i for i in ids if i]
    except Exception:
        ids = []
    model = (cfg.get('ai_model') or '').removeprefix('models/')
    if ids and model not in ids:
        sug = ', '.join(_suggest_models(ids, model))
        return False, (f'API key valid, tetapi model "{model}" tidak tersedia untuk key ini. '
                       f'Ganti kolom Model, mis.: {sug}.'), secs
    return True, None, secs


def test_connection():
    """Tes 2 tahap untuk konfigurasi yang TERSIMPAN: (1) daftar model — cepat,
    mengecek jaringan, API key, dan nama model; (2) panggilan chat kecil tanpa
    tool. Return (ok, pesan)."""
    cfg = get_config(include_key=True)
    if cfg['ai_provider'] == 'anthropic' and not cfg.get('api_key'):
        return False, 'API key belum diisi.'
    ok, err, list_secs = _check_models(cfg)
    if not ok:
        return False, err
    t0 = time.monotonic()
    try:
        if cfg['ai_provider'] == 'anthropic':
            r = httpx.post(f"{cfg['ai_base_url']}/v1/messages", timeout=TEST_TIMEOUT, json={
                'model': cfg['ai_model'], 'max_tokens': 64,
                'messages': [{'role': 'user', 'content': 'Balas satu kata: OK'}],
            }, headers=_auth_headers(cfg))
            if r.status_code >= 400:
                return False, _api_error('Claude API', r)
            text = ''.join(c.get('text', '') for c in r.json().get('content') or [])
        else:
            r = httpx.post(f"{cfg['ai_base_url']}/chat/completions", timeout=TEST_TIMEOUT, json={
                **_extra_params(cfg),
                'model': cfg['ai_model'], 'max_tokens': 256,
                'messages': [{'role': 'user', 'content': 'Balas satu kata: OK'}],
            }, headers=_auth_headers(cfg))
            if r.status_code >= 400:
                return False, _api_error('AI API', r)
            text = ((r.json().get('choices') or [{}])[0].get('message') or {}).get('content') or ''
        secs = time.monotonic() - t0
        return True, (f"Terhubung ke {cfg['ai_model']} — balasan: {text.strip()[:60] or '(kosong)'} "
                      f"({secs:.1f} dtk)")
    except httpx.TimeoutException:
        return False, (f"Jaringan & API key OK (daftar model terjawab dalam {list_secs:.1f} dtk), tetapi "
                       + _timeout_message(cfg, TEST_TIMEOUT))
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
            **_extra_params(cfg),
            'model': cfg['ai_model'], 'max_tokens': int(cfg['ai_max_tokens'] or 1024),
            'messages': msgs, 'tools': tools,
        }, headers=headers)
        if r.status_code >= 400:
            raise RuntimeError(_api_error('AI API', r))
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
    except httpx.TimeoutException:
        return 'Maaf, AI sedang tidak bisa dihubungi — ' + _timeout_message(cfg, REQUEST_TIMEOUT)
    except Exception as e:
        logger.warning(f'[AI] {cfg["ai_provider"]} error: {e}')
        return f'Maaf, AI sedang tidak bisa dihubungi — {str(e)[:320]}'
    answer = wa_format(answer) or '(tidak ada jawaban)'
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
