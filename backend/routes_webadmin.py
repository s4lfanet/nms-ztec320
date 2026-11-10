"""Browser bawaan: reverse proxy web admin modem/ONU lewat NMS.

Lihat modem_proxy.py untuk model keamanan. Hanya IP milik ONU itu sendiri
(PPPoE link-state + WAN GenieACS) yang bisa dibuka.
"""
from urllib.parse import urlsplit

import threading
import time

import httpx
from flask import Blueprint, Response, current_app, jsonify, request
from flask_login import login_required, current_user

import modem_proxy as mp
from models import db, ONU, OLT, OnuLinkState, GenieacsDeviceMap, MikrotikDevice, User
from routeros_client import RouterOSClient
import link_state_poller as lsp
from mac_match import match_sessions
from helpers import permission_required, log_action
from extensions import logger
import genieacs_client

bp = Blueprint('webadmin', __name__)

_PERM = 'modem_webadmin'


def _managed_ips():
    """IP perangkat yang dikelola NMS — tidak boleh jadi target proxy."""
    ips = set()
    try:
        ips.update(o.ip_address.strip() for o in OLT.query.all() if o.ip_address)
        ips.update(m.host.strip() for m in MikrotikDevice.query.all() if m.host)
        nbi = genieacs_client._nbi_config()[0] or ''
        h = urlsplit(nbi).hostname
        if h:
            ips.add(h)
    except Exception:
        logger.exception('webadmin: gagal baca IP terkelola')
    return ips


_SESS_TTL = 20
_sess_cache = {'ts': 0.0, 'data': ([], [], 0)}
_sess_lock = threading.Lock()


def _live_sessions(force=False):
    """Sesi PPPoE aktif dari semua MikroTik aktif: (sessions, errors, n_device).

    Di-cache 20 detik agar membuka dialog berulang tidak membebani router."""
    with _sess_lock:
        if not force and time.time() - _sess_cache['ts'] < _SESS_TTL:
            return _sess_cache['data']
        sessions, errors, n = [], [], 0
        for dev in MikrotikDevice.query.filter_by(enabled=True).all():
            n += 1
            try:
                with RouterOSClient(dev.host, dev.api_mode, dev.api_port, dev.api_ssl,
                                    dev.api_user, dev.api_password, timeout=8) as cli:
                    for r in cli.get_pppoe_active() or []:
                        if r.get('address'):
                            sessions.append({'name': r.get('name', ''),
                                             'caller_id': r.get('caller-id', ''),
                                             'address': r.get('address', ''),
                                             'uptime': r.get('uptime', ''),
                                             'device': dev.name})
            except Exception as e:
                errors.append(f'{dev.name}: {str(e)[:100]}')
        _sess_cache.update(ts=time.time(), data=(sessions, errors, n))
        return _sess_cache['data']


def _onu_names(onu, ls, tr069):
    """Semua nama yang mungkin sama dengan username PPPoE ONU ini."""
    names = []
    for v in (onu.pppoe, onu.name, onu.description,
              ls.pppoe_user if ls else '', (tr069 or {}).get('pppoe_username')):
        v = (v or '').strip()
        if v and (v == onu.pppoe or v == (tr069 or {}).get('pppoe_username')
                  or lsp._name_is_usable(v)):
            names.append(v)
    out = []
    for n in names:
        for k in lsp._session_variants(n):
            if k.lower() not in out:
                out.append(k.lower())
    return out


def _match_live(onu, ls, tr069, sessions):
    """Sesi MikroTik milik ONU: via username (semua sumber), lalu MAC."""
    names = set(_onu_names(onu, ls, tr069))
    found = []
    for s in sessions:
        sn = (s['name'] or '').lower()
        if sn and any(k in names for k in lsp._session_variants(sn)):
            found.append((s, 'username'))
    if found:
        return found
    # MAC caller-id ↔ serial/MAC ONU: exact, lalu offset (CPE MAC = ONU MAC + n)
    for kw, label in (({'strip': 0, 'offset': 0}, 'MAC'), ({'strip': 0, 'offset': 64}, 'MAC±')):
        res, _coll = match_sessions(sessions, [(onu.id, onu.serial_number)], **kw)
        ok = [m for m in res if not m['collision']]
        if ok:
            return [(sessions[m['session_idx']], label) for m in ok]
    return []


def collect_targets_info(onu_id):
    """({targets}, info): IP kandidat milik ONU + keterangan hasil pencarian."""
    onu = db.session.get(ONU, onu_id)
    ls = OnuLinkState.query.filter_by(onu_id=onu_id).first()
    cand = []
    if ls and ls.pppoe_ip:
        cand.append((ls.pppoe_ip, 'pppoe', 'PPPoE'))
    tr069 = None
    mapping = GenieacsDeviceMap.query.filter_by(onu_id=onu_id).first()
    if mapping:
        tr069 = genieacs_client.get_device_params(mapping.device_id) or {}
        if tr069.get('wan_ip'):
            cand.append((tr069['wan_ip'], 'tr069', 'WAN (TR-069)'))
        for c in tr069.get('wan_conns') or []:
            if c.get('ip'):
                cand.append((c['ip'], 'tr069', f"{c.get('service') or c.get('type') or 'WAN'} (TR-069)"))
    sessions, errors, n_dev = _live_sessions()
    live_matches = _match_live(onu, ls, tr069, sessions) if onu else []
    for s, how in live_matches:
        cand.append((s['address'], 'mikrotik', f"PPPoE {s['name']} ({how}, {s['device']})"))
    managed = _managed_ips()
    seen, out = set(), []
    for ip, src, label in cand:
        ip = (ip or '').strip()
        if ip in seen or ip in managed or not mp.is_allowed_ip(ip):
            continue
        seen.add(ip)
        out.append({'ip': ip, 'source': src, 'label': label})
    info = {'mikrotik_devices': n_dev, 'sessions': len(sessions), 'errors': errors,
            'tr069': bool(mapping), 'names': _onu_names(onu, ls, tr069) if onu else []}
    return out, info


def collect_targets(onu_id):
    return collect_targets_info(onu_id)[0]


def _session_ip_ok(ip):
    """IP sesi PPPoE MikroTik yang boleh dipilih manual (bukan IP terkelola)."""
    sessions = _live_sessions()[0]
    return (ip in {s['address'] for s in sessions} and ip not in _managed_ips()
            and mp.is_allowed_ip(ip))


@bp.route('/api/webadmin/pppoe-sessions', methods=['GET'])
@permission_required(_PERM)
def pppoe_sessions():
    """Cari sesi PPPoE aktif di MikroTik (untuk memilih IP modem manual)."""
    q = (request.args.get('q') or '').strip().lower()
    sessions, errors, _n = _live_sessions(force=request.args.get('refresh') == '1')
    managed = _managed_ips()
    rows = [s for s in sessions
            if mp.is_allowed_ip(s['address']) and s['address'] not in managed
            and (not q or q in s['name'].lower() or q in s['address']
                 or q in (s['caller_id'] or '').lower())]
    return jsonify({'success': True, 'total': len(sessions), 'errors': errors,
                    'sessions': rows[:50]})


@bp.route('/api/onu/<int:onu_id>/webadmin/targets', methods=['GET'])
@permission_required(_PERM)
def targets(onu_id):
    if not db.session.get(ONU, onu_id):
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    targets, info = collect_targets_info(onu_id)
    return jsonify({'success': True, 'targets': targets, 'info': info})


@bp.route('/api/onu/<int:onu_id>/webadmin/session', methods=['POST'])
@permission_required(_PERM)
def create_session(onu_id):
    if not db.session.get(ONU, onu_id):
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    data = request.get_json(silent=True) or {}
    host = (data.get('ip') or '').strip()
    scheme = (data.get('scheme') or 'http').lower()
    if scheme not in mp.ALLOWED_SCHEMES:
        return jsonify({'success': False, 'message': 'Skema tidak valid'}), 400
    port = mp.valid_port(data.get('port') or (443 if scheme == 'https' else 80))
    if port is None:
        return jsonify({'success': False, 'message': 'Port tidak valid'}), 400
    if host not in {t['ip'] for t in collect_targets(onu_id)} and not (
            data.get('from_session') and _session_ip_ok(host)):
        log_action('webadmin_denied', 'security', target=str(onu_id), detail=f'ip={host}')
        return jsonify({'success': False,
                        'message': 'IP bukan milik ONU ini atau tidak diizinkan'}), 403
    key = current_app.config['SECRET_KEY']
    token = mp.make_token(key, onu_id, current_user.id, scheme, host, port, mode='frame')
    tab_token = mp.make_token(key, onu_id, current_user.id, scheme, host, port, mode='tab')
    log_action('webadmin_open', 'onu', target=str(onu_id), detail=f'{scheme}://{host}:{port}'
               + (' (sesi PPPoE manual)' if data.get('from_session') else ''))
    return jsonify({'success': True, 'url': f'/webadmin/{token}/',
                    'tab_url': f'/webadmin/{tab_token}/', 'ttl': mp.TOKEN_TTL})


def _cors(resp):
    for k, v in mp.CORS_HEADERS.items():
        resp.headers[k] = v
    resp.headers['Access-Control-Allow-Headers'] = \
        request.headers.get('Access-Control-Request-Headers', '*')
    return resp


@bp.route('/webadmin/<token>/', defaults={'path': ''},
          methods=['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'])
@bp.route('/webadmin/<token>/<path:path>',
          methods=['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'])
def proxy(token, path):
    if request.method == 'OPTIONS':
        return _cors(Response(status=204))
    payload = mp.read_token(current_app.config['SECRET_KEY'], token)
    if not payload:
        return Response('Token tidak valid atau kedaluwarsa', 403, mimetype='text/plain')
    user = db.session.get(User, payload['u'])
    if not user or not getattr(user, 'is_active', True) or not user.has_permission(_PERM):
        return Response('Akses ditolak', 403, mimetype='text/plain')

    scheme, host, port = payload['s'], payload['h'], payload['p']
    prefix = f'/webadmin/{token}'
    url = f'{scheme}://{host}:{port}/{path}'
    key = mp.jar_key(payload)
    body = request.get_data() if request.method in ('POST', 'PUT', 'DELETE') else None
    if body is not None and len(body) > mp.MAX_BODY_IN:
        return Response('Body terlalu besar', 413, mimetype='text/plain')

    headers = mp.build_upstream_headers(
        {k.lower(): v for k, v in request.headers.items()}, scheme, host, port, mp.JAR.get(key))
    try:
        with httpx.Client(verify=False, follow_redirects=False,
                          timeout=mp.UPSTREAM_TIMEOUT) as c:
            with c.stream(request.method, url, params=list(request.args.items(multi=True)),
                          content=body, headers=headers) as r:
                chunks, size = [], 0
                for ch in r.iter_bytes():
                    size += len(ch)
                    if size > mp.MAX_BODY_OUT:
                        return Response('Respons modem terlalu besar', 502, mimetype='text/plain')
                    chunks.append(ch)
                status, rheaders = r.status_code, r.headers
                set_cookies = rheaders.get_list('set-cookie')
                content = b''.join(chunks)
    except httpx.HTTPError as e:
        return Response(f'Gagal menghubungi modem: {type(e).__name__}', 502, mimetype='text/plain')

    mp.JAR.update(key, set_cookies)
    ctype = rheaders.get('content-type', '')
    if mp._is_text_type(ctype) and len(content) <= mp.MAX_REWRITE:
        enc = r.encoding or 'utf-8'
        try:
            text = content.decode(enc, errors='replace')
        except LookupError:
            text = content.decode('utf-8', errors='replace')
            enc = 'utf-8'
        # Stub redirect HTTPS modem (Huawei): pindah sendiri ke https://IP:SSLPort
        # lewat token baru, agar tetap di dalam proxy.
        if scheme == 'http' and 'html' in ctype.lower() and path in ('', 'index.html', 'index.asp'):
            sport = mp.https_redirect_port(text)
            if sport:
                new_tok = mp.make_token(current_app.config['SECRET_KEY'], payload['o'], payload['u'],
                                        'https', host, sport, mode=payload.get('m', 'frame'))
                resp = Response('', 302)
                resp.headers['Location'] = f'/webadmin/{new_tok}/'
                for k, v in mp.security_headers(payload.get('m', 'frame'),
                                                request.headers.get('Sec-Fetch-Dest')).items():
                    resp.headers[k] = v
                return _cors(resp)
        content = mp.rewrite_text(text, prefix, scheme, host, port, ctype).encode(enc, errors='replace')

    resp = Response(content, status)
    for k in mp.RESP_PASS:
        if k in rheaders:
            resp.headers[k] = rheaders[k]
    loc = rheaders.get('location')
    if loc:
        new = mp.rewrite_location(loc, prefix, scheme, host, port)
        if new is None:
            return Response('Redirect ke host lain diblokir', 502, mimetype='text/plain')
        resp.headers['Location'] = new
    for k, v in mp.security_headers(payload.get('m', 'frame'), request.headers.get('Sec-Fetch-Dest')).items():
        resp.headers[k] = v
    return _cors(resp)
