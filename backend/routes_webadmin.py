"""Browser bawaan: reverse proxy web admin modem/ONU lewat NMS.

Lihat modem_proxy.py untuk model keamanan. Hanya IP milik ONU itu sendiri
(PPPoE link-state + WAN GenieACS) yang bisa dibuka.
"""
from urllib.parse import urlsplit

import httpx
from flask import Blueprint, Response, current_app, jsonify, request
from flask_login import login_required, current_user

import modem_proxy as mp
from models import db, ONU, OLT, OnuLinkState, GenieacsDeviceMap, MikrotikDevice, User
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


def collect_targets(onu_id):
    """Daftar IP kandidat milik ONU: [{ip, source, label}] (sudah divalidasi)."""
    cand = []
    ls = OnuLinkState.query.filter_by(onu_id=onu_id).first()
    if ls and ls.pppoe_ip:
        cand.append((ls.pppoe_ip, 'pppoe', 'PPPoE'))
    mapping = GenieacsDeviceMap.query.filter_by(onu_id=onu_id).first()
    if mapping:
        params = genieacs_client.get_device_params(mapping.device_id) or {}
        if params.get('wan_ip'):
            cand.append((params['wan_ip'], 'tr069', 'WAN (TR-069)'))
        for c in params.get('wan_conns') or []:
            if c.get('ip'):
                cand.append((c['ip'], 'tr069', f"{c.get('service') or c.get('type') or 'WAN'} (TR-069)"))
    managed = _managed_ips()
    seen, out = set(), []
    for ip, src, label in cand:
        ip = (ip or '').strip()
        if ip in seen or ip in managed or not mp.is_allowed_ip(ip):
            continue
        seen.add(ip)
        out.append({'ip': ip, 'source': src, 'label': label})
    return out


@bp.route('/api/onu/<int:onu_id>/webadmin/targets', methods=['GET'])
@permission_required(_PERM)
def targets(onu_id):
    if not db.session.get(ONU, onu_id):
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    return jsonify({'success': True, 'targets': collect_targets(onu_id)})


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
    if host not in {t['ip'] for t in collect_targets(onu_id)}:
        log_action('webadmin_denied', 'security', target=str(onu_id), detail=f'ip={host}')
        return jsonify({'success': False,
                        'message': 'IP bukan milik ONU ini atau tidak diizinkan'}), 403
    token = mp.make_token(current_app.config['SECRET_KEY'], onu_id, current_user.id,
                          scheme, host, port)
    log_action('webadmin_open', 'onu', target=str(onu_id), detail=f'{scheme}://{host}:{port}')
    return jsonify({'success': True, 'url': f'/webadmin/{token}/', 'ttl': mp.TOKEN_TTL})


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
    resp.headers['Content-Security-Policy'] = mp.SANDBOX_CSP
    resp.headers['X-Frame-Options'] = 'SAMEORIGIN'
    resp.headers['Cache-Control'] = 'no-store'
    resp.headers['Referrer-Policy'] = 'no-referrer'
    return _cors(resp)
