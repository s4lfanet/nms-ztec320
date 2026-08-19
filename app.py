from flask import Flask, redirect, request, jsonify, g, session
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.middleware.proxy_fix import ProxyFix
from models import db, User, Role, OLT, ONU, Template, TR069Profile, ONUCustomColumn, Fan, OLTSyncStatus, OLTCard, OLTUplink, ONUVlan, ONUType, SpeedProfile, WanIpProfile, OLTPort, AVAILABLE_PERMISSIONS, Notification, AlertRule, AlertHistory, BotConfig, FTTHOTB, FTTHODC, FTTHODP, FTTHODPPort, FTTHPonPort, FTTHFiberPath, SystemConfig, ActionLog, MetricHistory, TrafficLog, TrafficLogHourly, OLTConfigBackup
from datetime import datetime, timezone, timedelta
from functools import wraps
import logging
import re
import threading
import os
import json
import time
import hashlib
import hmac


from sqlalchemy import or_
from sqlalchemy.orm import joinedload

# --- Refactored modules (extracted from monolithic app.py) ---
from extensions import db as _ext_db, login_manager, migrate, logger
from helpers import (
    utc_iso, log_action, permission_required, super_admin_required,
    check_rate_limit as _check_rate_limit,
    record_failed_login as _record_failed_login,
    clear_failed_logins as _clear_failed_logins,
)
from services_wa import (
    get_nms_branding as _get_nms_branding,
)
from services_sync import (
    start_single_sync, start_sync_all,
)
from routes_auth import bp as auth_bp
from metrics_service import (
    metrics_response, track_http_request, track_snmp_poll, track_sync,
    update_olt_gauge, update_onu_gauge, track_cache_hit, track_cache_miss,
    set_ws_connections, set_active_users, _ENABLED as METRICS_ENABLED,
)

from config import ActiveConfig

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
app.config.from_object(ActiveConfig)

# Rate limiting moved to helpers.py (check_rate_limit, record_failed_login, clear_failed_logins)

db.init_app(app)
migrate.init_app(app, db)
login_manager.init_app(app)
login_manager.login_message = 'Please login to access this page.'

app.register_blueprint(auth_bp)


@app.before_request
def _metrics_before_request():
    """Record request start time for Prometheus timing."""
    g._req_start = time.time()


@app.before_request
def _csrf_protection():
    """CSRF protection: reject state-changing requests without custom header.

    Browsers won't send X-Requested-With on cross-site form submissions,
    so requiring it blocks CSRF attacks. SPA fetch calls include it.
    Login endpoint is exempted to allow initial form login.
    """
    if request.method in ('POST', 'PUT', 'DELETE', 'PATCH'):
        if not request.headers.get('X-Requested-With'):
            _csrf_exempt = (
                '/api/auth/login', '/login',
                '/api/public/forgot-password',
                '/api/public/register', '/api/public/register/pay',
            )
            if request.path not in _csrf_exempt:
                return jsonify({'error': 'Missing X-Requested-With header'}), 403


@app.after_request
def add_security_headers(response):
    """Add security headers to all responses."""
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'geolocation=(self), microphone=(), camera=()'
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' https://static.cloudflareinsights.com https://unpkg.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "img-src 'self' data: blob: https:; "
        "connect-src 'self' ws: wss: https:; "
        "frame-ancestors 'none';"
    )
    if request.is_secure or request.headers.get('X-Forwarded-Proto') == 'https':
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    # Prevent Cloudflare/browser from caching API responses (especially 401s)
    if request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['CDN-Cache-Control'] = 'no-cache, no-store, must-revalidate'
    # Prometheus metrics
    if METRICS_ENABLED and hasattr(g, '_req_start') and not request.path.startswith('/metrics'):
        duration = time.time() - g._req_start
        track_http_request(request.method, request.path, response.status_code, duration)
    return response


# Rate limiting functions moved to helpers.py


@app.route('/metrics')
def prometheus_metrics():
    """Prometheus metrics endpoint for monitoring."""
    data, content_type = metrics_response()
    from flask import Response
    return Response(data, content_type=content_type)


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))



@login_manager.unauthorized_handler
def unauthorized():
    if request.path.startswith('/api/'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    return redirect('/login')


@app.errorhandler(500)
def handle_500(e):
    logger.error(f"HTTP 500: {request.method} {request.path} - {e}", exc_info=True)
    if request.path.startswith('/api/'):
        return jsonify({'success': False, 'message': 'Internal server error'}), 500
    return ('Internal Server Error', 500)


@app.errorhandler(404)
def handle_404(e):
    if request.path.startswith('/api/'):
        return jsonify({'success': False, 'message': 'Not found'}), 404
    return redirect('/')


@app.errorhandler(Exception)
def handle_unexpected(e):
    logger.error(f"Unhandled exception: {request.method} {request.path} - {e}", exc_info=True)
    if request.path.startswith('/api/'):
        return jsonify({'success': False, 'message': 'Internal server error'}), 500
    return ('Internal Server Error', 500)


# ==================== SPA API ENDPOINTS ====================
# Auth routes (login, logout, api/auth/*) moved to routes_auth.py blueprint

@app.route('/api/dashboard')
@login_required
def api_dashboard():
    nocache = request.args.get('nocache', '0') == '1'
    # Try Redis cache (15s TTL — dashboard auto-refreshes every 15-30s)
    from cache import cache_get, cache_set
    cache_key = "dashboard:global"
    if not nocache:
        cached = cache_get(cache_key)
        if cached is not None:
            return jsonify(cached)

    olts = OLT.query.all()
    olt_ids = [o.id for o in olts]

    # Batch-load related data to avoid N+1 queries
    from collections import defaultdict
    fans_by_olt = defaultdict(list)
    for f in Fan.query.filter(Fan.olt_id.in_(olt_ids)).all():
        fans_by_olt[f.olt_id].append(f)

    cards_by_olt = defaultdict(list)
    for c in OLTCard.query.filter(OLTCard.olt_id.in_(olt_ids)).all():
        cards_by_olt[c.olt_id].append(c)

    uplink_counts = defaultdict(int)
    for u in OLTUplink.query.filter(OLTUplink.olt_id.in_(olt_ids)).all():
        uplink_counts[u.olt_id] += 1

    total_onu = sum(o.total_onu for o in olts)
    online_onu = sum(o.online_onu for o in olts)
    los_onu = sum(o.los_onu for o in olts)
    dyinggasp_onu = sum(o.dyinggasp_onu for o in olts)
    offline_onu = sum(o.offline_onu for o in olts)
    other_onu = sum(o.other_onu for o in olts)
    t = max(total_onu, 1)
    stats = {
        'total_olts': len(olts), 'total_onu': total_onu,
        'online': online_onu, 'online_pct': round(online_onu / t * 100, 2),
        'los': los_onu, 'los_pct': round(los_onu / t * 100, 2),
        'dyinggasp': dyinggasp_onu, 'dyinggasp_pct': round(dyinggasp_onu / t * 100, 2),
        'offline': offline_onu, 'offline_pct': round(offline_onu / t * 100, 2),
        'other': other_onu,
    }
    olt_list = [{
        'id': o.id, 'name': o.name, 'ip_address': o.ip_address, 'model': o.model,
        'firmware_version': o.firmware_version, 'is_online': o.is_online,
        'total_onu': o.total_onu, 'online_onu': o.online_onu, 'los_onu': o.los_onu,
        'dyinggasp_onu': o.dyinggasp_onu, 'offline_onu': o.offline_onu,
        'temperature': o.temperature, 'last_sync': utc_iso(o.last_sync),
        'connection_status': o.connection_status,
        'fans': [{'number': f.fan_number, 'status': f.status, 'rpm': f.rpm, 'speed_level': f.speed_level} for f in fans_by_olt.get(o.id, [])],
        'ip': o.ip_address,
        'vendor': o.vendor or 'zte',
        'cards': [{'slot': c.slot, 'card_type': c.card_type, 'status': c.status, 'total_ports': c.total_ports, 'ports_up': c.ports_up, 'ports_down': c.ports_down} for c in cards_by_olt.get(o.id, [])],
        'uplink_count': uplink_counts.get(o.id, 0),
        'uptime': o.uptime or 0,
        'snmp_status': o.snmp_status or 'disconnected',
        'telnet_status': o.telnet_status or 'disconnected',
        'polling_interval': o.polling_interval or 300,
        'total_fan': o.total_fan or 0,
    } for o in olts]
    result = {'stats': stats, 'olts': olt_list}
    try:
        cache_set(cache_key, result, ttl=15)
        logger.info(f"Dashboard cache SET: {cache_key}")
    except Exception as e:
        logger.warning(f"Dashboard cache SET failed: {e}")
    return jsonify(result)


@app.route('/api/all-onus')
@login_required
def api_all_onus():
    olt_filter = request.args.get('olt', 'all')
    status_filter = request.args.get('status', 'all')
    pon_filter = request.args.get('pon', 'all')
    search = request.args.get('search', '').strip()
    page = max(int(request.args.get('page', 1)), 1)
    page_size = min(max(int(request.args.get('page_size', 20)), 1), 200)
    sort_by = request.args.get('sort_by', '')
    sort_dir = 'desc' if request.args.get('sort_dir', 'asc') == 'desc' else 'asc'

    # Build base query with eager loading to avoid N+1
    query = ONU.query.options(joinedload(ONU.odp_port).joinedload(FTTHODPPort.odp))
    if olt_filter != 'all':
        query = query.filter_by(olt_id=int(olt_filter))
    if status_filter != 'all':
        query = query.filter_by(status=status_filter)
    if pon_filter != 'all' and olt_filter != 'all':
        try:
            parts = pon_filter.split('/')
            if len(parts) == 3:
                query = query.filter_by(frame=int(parts[0]), slot=int(parts[1]), port=int(parts[2]))
            elif len(parts) == 2 and parts[0] == 'slot':
                query = query.filter_by(slot=int(parts[1]))
        except (ValueError, IndexError):
            pass

    # SQL-side search (replaces Python filtering)
    if search:
        q = f'%{search}%'
        olt_ids = [o.id for o in OLT.query.filter(OLT.name.ilike(q)).all()]
        conditions = [
            ONU.name.ilike(q),
            ONU.serial_number.ilike(q),
            ONU.description.ilike(q),
            ONU.pppoe.ilike(q),
            ONU.actual_type.ilike(q),
        ]
        if olt_ids:
            conditions.append(ONU.olt_id.in_(olt_ids))
        query = query.filter(or_(*conditions))

    # Sorting
    sort_map = {
        'olt': ONU.olt_id,
        'name': ONU.name,
        'description': ONU.description,
        'pppoe': ONU.pppoe,
        'onu_id': ONU.onu_id,
        'status': ONU.status,
        'rx_olt': ONU.rx_power,
        'rx_onu': ONU.onu_rx_power,
        'sn': ONU.serial_number,
        'type': ONU.actual_type,
        'distance': ONU.distance,
    }
    sort_col = sort_map.get(sort_by)
    if sort_col is not None:
        query = query.order_by(sort_col.desc() if sort_dir == 'desc' else sort_col.asc())
    else:
        query = query.order_by(ONU.id.asc())

    # Signal stats — single lightweight query (no ONU objects loaded)
    total = query.count()
    stats_rows = query.with_entities(ONU.rx_power, ONU.onu_rx_power, ONU.status).all()

    # Read RX color ranges from SystemConfig (customization)
    import json as _json_stats
    rx_ranges = [
        {'min': -25, 'max': 0, 'color': 'green', 'label': 'Good'},
        {'min': -28, 'max': -25, 'color': 'yellow', 'label': 'Warning'},
        {'min': -99, 'max': -28, 'color': 'red', 'label': 'Critical'},
    ]
    rx_cfg = SystemConfig.query.filter_by(key='rx_color_ranges').first()
    if rx_cfg and rx_cfg.value:
        try:
            rx_ranges = _json_stats.loads(rx_cfg.value)
        except Exception:
            pass

    # Sort ranges by min descending so we match the highest (best) range first
    sorted_ranges = sorted(rx_ranges, key=lambda r: r['min'], reverse=True)

    def classify_rx(val):
        if val is None:
            return 'na'
        for r in sorted_ranges:
            if r['min'] <= val < r['max']:
                return r.get('color', 'gray')
        # Below all ranges → use the lowest range's color
        if sorted_ranges:
            return sorted_ranges[-1].get('color', 'red')
        return 'red'

    # RX ONU (onu_rx_power) stats — using customized ranges
    onu_counts = {}
    for r in rx_ranges:
        color = r.get('color', 'gray')
        onu_counts[color] = 0
    onu_na = 0
    for r in stats_rows:
        cat = classify_rx(r[1])  # r[1] = onu_rx_power
        if cat == 'na':
            onu_na += 1
        elif cat in onu_counts:
            onu_counts[cat] += 1

    # Also compute RX OLT (rx_power) stats
    olt_counts = {}
    for r in rx_ranges:
        color = r.get('color', 'gray')
        olt_counts[color] = 0
    olt_na = 0
    for r in stats_rows:
        cat = classify_rx(r[0])  # r[0] = rx_power
        if cat == 'na':
            olt_na += 1
        elif cat in olt_counts:
            olt_counts[cat] += 1

    # Status counts
    los_count = sum(1 for r in stats_rows if r[2] == 'los')
    online_count = sum(1 for r in stats_rows if r[2] == 'online')
    offline_count = sum(1 for r in stats_rows if r[2] == 'offline')
    dyinggasp_count = sum(1 for r in stats_rows if r[2] == 'dyinggasp')
    na_count = sum(1 for r in stats_rows if r[1] is None)  # Based on onu_rx_power
    stats_total = max(len(stats_rows), 1)

    # Build signal_stats dynamically from rx_ranges
    signal_stats = {}
    for r in rx_ranges:
        color = r.get('color', 'gray')
        label = r.get('label', color.capitalize())
        cnt = onu_counts.get(color, 0)
        signal_stats[color] = {
            'count': cnt,
            'pct': round(cnt / stats_total * 100, 1),
            'label': label,
            'min': r['min'],
            'max': r['max'],
            'rx_olt': olt_counts.get(color, 0),
            'rx_onu': cnt,
        }
    signal_stats['los'] = los_count
    signal_stats['na'] = na_count
    signal_stats['na_pct'] = round(na_count / stats_total * 100, 1)
    signal_stats['online'] = online_count
    signal_stats['offline'] = offline_count
    signal_stats['dyinggasp'] = dyinggasp_count
    signal_stats['total'] = len(stats_rows)

    # Paginated results
    paginated = query.limit(page_size).offset((page - 1) * page_size).all()

    olts = OLT.query.all()
    olt_list = [{'id': o.id, 'name': o.name} for o in olts]
    olt_map = {o.id: o.name for o in olts}
    olt_vendor_map = {o.id: (o.vendor or '').lower() for o in olts}

    # Build PON port list per OLT grouped by slot/card (for frontend filter dropdowns)
    pon_ports = []
    if olt_filter != 'all':
        try:
            olt_id_int = int(olt_filter)
            # 1. Get service cards (GTG/GTC/ETG) from OLTCard table
            cards = OLTCard.query.filter_by(olt_id=olt_id_int).order_by(OLTCard.slot).all()
            service_cards = [c for c in cards if (c.card_type or '').upper().startswith(('GTG', 'GTC', 'ETG'))]
            # 2. Get all OLTPort entries for this OLT
            oltp_rows = OLTPort.query.filter_by(olt_id=olt_id_int).all()
            # 3. Get distinct frame/slot/port from ONU table (fallback for ports not in OLTPort)
            onu_ports = ONU.query.filter_by(olt_id=olt_id_int).with_entities(
                ONU.frame, ONU.slot, ONU.port
            ).distinct().all()
            onu_slot_ports = {}
            for r in onu_ports:
                onu_slot_ports.setdefault(r[1], set()).add(r[2])

            if service_cards:
                # Build from OLTCard + OLTPort + ONU fallback
                for card in service_cards:
                    slot = card.slot
                    ct = (card.card_type or '').upper()
                    is_epon = ct.startswith('ETG')
                    olt_pfx = 'epon-olt' if is_epon else 'gpon-olt'
                    frame = 1  # ZTE C320 frame is always 1
                    # Collect ports for this slot from OLTPort
                    slot_ports = []
                    port_nums_seen = set()
                    for p in oltp_rows:
                        pparts = (p.port_name or '').replace('gpon-olt_', '').replace('epon-olt_', '').split('/')
                        if len(pparts) >= 3:
                            try:
                                pframe, pslot, pport = int(pparts[0]), int(pparts[1]), int(pparts[2])
                                if pslot == slot:
                                    port_nums_seen.add(pport)
                                    slot_ports.append({
                                        'value': f'{pframe}/{pslot}/{pport}',
                                        'label': f'PON {pport}',
                                        'port': pport,
                                    })
                            except (ValueError, IndexError):
                                pass
                    # Add placeholder ports from card total_ports if not in OLTPort
                    total_ports = card.total_ports or 0
                    for pn in range(1, total_ports + 1):
                        if pn not in port_nums_seen:
                            slot_ports.append({
                                'value': f'{frame}/{slot}/{pn}',
                                'label': f'PON {pn}',
                                'port': pn,
                            })
                    # Add ports from ONU table that aren't in OLTPort or placeholders
                    for pn in sorted(onu_slot_ports.get(slot, [])):
                        if pn not in port_nums_seen:
                            slot_ports.append({
                                'value': f'{frame}/{slot}/{pn}',
                                'label': f'PON {pn}',
                                'port': pn,
                            })
                    slot_ports.sort(key=lambda x: x['port'])
                    if slot_ports:
                        pon_ports.append({
                            'slot': slot,
                            'card_type': card.card_type or '',
                            'card_status': card.status or '',
                            'ports': slot_ports,
                        })
            else:
                # No OLTCard data — fall back to ONU table only
                onu_slot_map = {}
                for r in onu_ports:
                    frame, slot, port = r[0], r[1], r[2]
                    onu_slot_map.setdefault(slot, []).append({
                        'value': f'{frame}/{slot}/{port}',
                        'label': f'PON {port}',
                        'port': port,
                    })
                for slot in sorted(onu_slot_map.keys()):
                    ports = sorted(onu_slot_map[slot], key=lambda x: x['port'])
                    pon_ports.append({
                        'slot': slot,
                        'card_type': '',
                        'card_status': '',
                        'ports': ports,
                    })
        except (ValueError, TypeError):
            pass
    onu_list = [{
        'id': o.id, 'olt_id': o.olt_id, 'olt_name': olt_map.get(o.olt_id, ''),
        'olt_vendor': olt_vendor_map.get(o.olt_id, ''),
        'name': o.name, 'description': o.description, 'pppoe': o.pppoe,
        'onu_id_str': o.onu_id_str, 'status': o.status,
        'rx_power': o.rx_power, 'onu_rx_power': o.onu_rx_power, 'tx_power': o.tx_power,
        'serial_number': o.serial_number, 'actual_type': o.actual_type,
        'frame': o.frame, 'slot': o.slot, 'port': o.port, 'onu_id': o.onu_id,
        'card': o.card or '',
        'distance': o.distance,
        'technician_id': o.technician_id,
        'technician_name': o.technician.full_name if o.technician else '',
        'technician_phone': o.technician.phone if o.technician else '',
        'odp_name': o.odp_port.odp.name if o.odp_port and o.odp_port.odp else '',
        'odp_port_number': o.odp_port.port_number if o.odp_port else None,
        'odp_port_id': o.odp_port.id if o.odp_port else None,
        'customer_name': o.odp_port.customer_name if o.odp_port else '',
        'customer_phone': o.odp_port.customer_phone if o.odp_port else '',
        'latitude': o.latitude,
        'longitude': o.longitude,
        'last_seen': utc_iso(o.last_seen),
        'last_online': utc_iso(o.last_online),
        'last_offline': utc_iso(o.last_offline),
    } for o in paginated]
    return jsonify({
        'onus': onu_list, 'signal_stats': signal_stats,
        'olts': olt_list, 'pon_ports': pon_ports, 'total': total,
        'page': page, 'page_size': page_size,
        'total_pages': max(1, (total + page_size - 1) // page_size),
    })


@app.route('/api/onu/lookup/<int:olt_id>/<int:frame>/<int:port>/<int:onu_num>')
@login_required
def onu_lookup(olt_id, frame, port, onu_num):
    """Look up ONU DB id by R-Config URL: /gpon/{olt_id}/{frame}/{pon_port}/{onu_id}
    Matches R-Config format: gpon_olt-{frame}/{slot}/{port}:{onu_id}
    URL maps: 3rd segment = PON port, 4th segment = ONU ID (1-128)"""
    onu = ONU.query.filter_by(olt_id=olt_id, frame=frame, port=port, onu_id=onu_num).first()
    if not onu:
        # Fallback: try slot=port for backwards compatibility
        onu = ONU.query.filter_by(olt_id=olt_id, frame=frame, slot=port, onu_id=onu_num).first()
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    return jsonify({'success': True, 'id': onu.id})


@app.route('/api/onu/<int:onu_id>/detail')
@login_required
def api_onu_detail(onu_id):
    """Return ONU data from DB only — instant response, no Telnet."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt_map = {o.id: o.name for o in OLT.query.all()}
    olt_vendor_map = {o.id: (o.vendor or '').lower() for o in OLT.query.all()}
    return jsonify({
        'onu': {
            'id': onu.id, 'olt_id': onu.olt_id, 'olt_name': olt_map.get(onu.olt_id, ''),
            'olt_vendor': olt_vendor_map.get(onu.olt_id, ''),
            'name': onu.name, 'description': onu.description, 'pppoe': onu.pppoe,
            'onu_id_str': onu.onu_id_str, 'status': onu.status,
            'rx_power': onu.rx_power, 'onu_rx_power': onu.onu_rx_power, 'tx_power': onu.tx_power,
            'serial_number': onu.serial_number, 'actual_type': onu.actual_type,
            'onu_type': onu.onu_type,
            'frame': onu.frame, 'slot': onu.slot, 'port': onu.port, 'onu_id': onu.onu_id,
            'card': onu.card or '',
            'distance': onu.distance,
            'latitude': onu.latitude,
            'longitude': onu.longitude,
            'last_seen': utc_iso(onu.last_seen),
            'last_online': utc_iso(onu.last_online),
            'last_offline': utc_iso(onu.last_offline),
            'wifi_config': onu.wifi_config or '',
        },
        'live_detail': None,
        'history': [],
        'wan_services_json': '{}',
    })


@app.route('/api/onu/<int:onu_id>/live-detail')
@login_required
def api_onu_live_detail(onu_id):
    """Fetch live ONU data from OLT via Telnet (ZTE only)."""
    import json as _json
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    live_detail = None
    history = []

    if olt and olt.cli_username:
        # ZTE: Telnet-based live detail
        from snmp_collector import TelnetCollector, create_cli_collector
        try:
            tc = create_cli_collector(olt)
            is_epon = (onu.card or '').lower() == 'epon'
            live_detail = tc.collect_onu_detail(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
            if live_detail and live_detail.get('history_raw'):
                history = live_detail['history_raw']
            # Update DB with live signal values
            if live_detail:
                updated = False
                if live_detail.get('rx_power') is not None:
                    onu.rx_power = live_detail['rx_power']; updated = True
                if live_detail.get('onu_rx_power') is not None:
                    onu.onu_rx_power = live_detail['onu_rx_power']; updated = True
                if live_detail.get('tx_power') is not None:
                    onu.tx_power = live_detail['tx_power']; updated = True
                if live_detail.get('onu_type') and not onu.onu_type:
                    onu.onu_type = live_detail['onu_type']; updated = True
                # Read-back WiFi config from ONU running-config
                wifi_entries = live_detail.get('wifi_entries', [])
                if wifi_entries:
                    import json as _json_wb
                    # Preserve existing passwords and newly-added SSIDs from DB
                    # (ZTE doesn't expose WPA keys in read-back, and newly added
                    # SSIDs may not appear in OLT running-config immediately)
                    existing_ssids = {}
                    if onu.wifi_config:
                        try:
                            _prev = _json_wb.loads(onu.wifi_config)
                            for s in _prev.get('ssids', []):
                                existing_ssids[int(s.get('ssid_num', 0))] = s
                        except Exception:
                            pass
                    ssids = []
                    readback_nums = set()
                    for w in wifi_entries:
                        num = int(w.get('wifi_num', 0))
                        readback_nums.add(num)
                        rb_pw = w.get('ssid_password', '')
                        ssids.append({
                            'ssid_num': num,
                            'ssid_name': w.get('ssid_name', ''),
                            'ssid_auth_type': w.get('ssid_auth_type', ''),
                            'ssid_password': rb_pw if rb_pw and rb_pw != '--' else existing_ssids.get(num, {}).get('ssid_password', ''),
                            'wifi_mode': w.get('mode', ''),
                            'wifi_status': w.get('status', 'up'),
                            'vlan': w.get('vlan', ''),
                        })
                    # Preserve DB entries not in read-back (newly added, OLT may not have applied yet)
                    for num, s in existing_ssids.items():
                        if num not in readback_nums:
                            ssids.append(s)
                    onu.wifi_config = _json_wb.dumps({'ssids': ssids})
                    updated = True
                if updated: db.session.commit()
        except Exception as e:
            logger.warning(f"Failed to collect ONU detail: {e}")

    # Seed traffic cache from Total Bytes collected during collect_onu_detail
    if live_detail and live_detail.get('input_bytes') and live_detail.get('output_bytes'):
        import time as _t
        cache_key = f'traffic_{onu_id}'
        _traffic_cache[cache_key] = {'ts': _t.time(), 'in': live_detail['input_bytes'], 'out': live_detail['output_bytes']}
    return jsonify({
        'success': True,
        'live_detail': live_detail,
        'history': history,
        'wan_services_json': _json.dumps(live_detail.get('wan_services', {}), separators=(',', ':')) if live_detail else '{}',
    })


@app.route('/api/users')
@permission_required('manage_users')
def api_users():
    users = User.query.all()
    roles = Role.query.all()
    return jsonify({
        'users': [{
            'id': u.id, 'full_name': u.full_name, 'username': u.username,
            'role': u.role.name if u.role else 'User', 'role_id': u.role_id or 0,
            'phone': u.phone or '',
        } for u in users],
        'roles': [{
            'id': r.id, 'name': r.name, 'description': r.description,
            'permissions': r.permissions, 'is_system': r.is_system,
        } for r in roles],
    })


@app.route('/api/technicians')
@login_required
def api_technicians():
    """List users with receive_alerts permission (technicians) for dropdown selection."""
    users = User.query.filter_by(is_super_admin=False).all()
    technicians = [{
        'id': u.id, 'full_name': u.full_name, 'username': u.username,
        'phone': u.phone or '',
    } for u in users if u.role and u.role.has_permission('receive_alerts')]
    return jsonify({'technicians': technicians})


@app.route('/api/customization/columns')
@login_required
def api_customization_columns():
    q = ONUCustomColumn.query
    columns = q.order_by(ONUCustomColumn.sort_order).all()
    if not columns:
        defaults = [
            ('OLT', 'olt_name'), ('Name', 'name'), ('Description', 'description'),
            ('PPPoE', 'pppoe'), ('ONU ID', 'onu_id_str'), ('Status', 'status'),
            ('RX OLT', 'rx_power'), ('RX ONU', 'onu_rx_power'), ('SN / MAC', 'serial_number'),
            ('Actual Type', 'actual_type'),
        ]
        for i, (name, key) in enumerate(defaults):
            col = ONUCustomColumn(column_name=name, column_key=key, sort_order=i,
                                  visible_desktop=True, visible_mobile=(i < 4))
            db.session.add(col)
        db.session.commit()
        columns = q.order_by(ONUCustomColumn.sort_order).all()
    return jsonify({
        'columns': [{
            'id': str(c.id), 'column_name': c.column_name, 'column_key': c.column_key,
            'visible_desktop': c.visible_desktop, 'visible_mobile': c.visible_mobile,
            'sort_order': c.sort_order,
        } for c in columns]
    })


# Removed insecure /api/user/<id>/delete endpoint — use DELETE /api/user/<id> instead


# ==================== ONU ROUTES ====================


@app.route('/api/olt/<int:olt_id>/refresh-signal', methods=['POST'])
@login_required
def refresh_onu_signal(olt_id):
    """Fast SNMP-only refresh of RX/TX power and status for all ONUs (ZTE)."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})
    try:
        from snmp_collector import SNMPCollector, TelnetCollector, decode_rx_power
        import asyncio
        from pysnmp.hlapi.v1arch.asyncio import Slim, ObjectType, ObjectIdentity

        OID_OPER = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.6'
        OID_RX = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.10'
        OID_TX = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.11'
        OID_SN = '1.3.6.1.4.1.3902.1012.3.28.1.1.5'

        async def _refresh():
            slim = Slim(1)
            try:
                async def walk(oid):
                    results = []
                    s = Slim(1)
                    cur = oid
                    errs = 0
                    try:
                        while True:
                            try:
                                ei, es, eidx, vb = await s.next('public', olt.ip_address, 161, ObjectType(ObjectIdentity(cur)), timeout=5, retries=2)
                            except: break
                            if ei: errs += 1; continue
                            if es: break
                            roid = str(vb[0][0])
                            if not roid.startswith(oid): break
                            results.append((roid, vb[0][1]))
                            cur = roid; errs = 0
                    finally:
                        s.close()
                    return results

                sn_raw = await walk(OID_SN)
                rx_raw = await walk(OID_RX)

                def parse_key(oid_str, base):
                    suffix = oid_str[len(base):]
                    parts = suffix.lstrip('.').split('.')
                    if len(parts) >= 2:
                        return (int(parts[0]), int(parts[1]))
                    return None

                sn_by_key = {}
                for oid, val in sn_raw:
                    k = parse_key(oid, OID_SN)
                    if k:
                        from snmp_collector import parse_serial
                        sn_by_key[k] = parse_serial(val)

                onu_rx_by_sn = {}
                for oid, val in rx_raw:
                    k = parse_key(oid, OID_RX)
                    if k and k in sn_by_key:
                        onu_rx_by_sn[sn_by_key[k]] = decode_rx_power(int(val))

                return onu_rx_by_sn
            finally:
                slim.close()

        onu_rx_map = asyncio.run(_refresh())

        onus = ONU.query.filter_by(olt_id=olt_id).all()
        updated = 0
        for o in onus:
            sn = o.serial_number or ''
            if sn in onu_rx_map and onu_rx_map[sn] is not None:
                o.onu_rx_power = onu_rx_map[sn]
                updated += 1
        db.session.commit()
        # Invalidate cache
        try:
            from cache import cache_clear
            cache_clear("dashboard:*")
            cache_clear(f"olt:{olt_id}:*")
        except Exception:
            pass
        return jsonify({'success': True, 'updated': updated, 'total': len(onus)})
    except Exception as e:
        logger.error(f"refresh-signal OLT {olt_id} failed: {e}")
        return jsonify({'success': False, 'message': str(e)})




@app.route('/api/onu/<int:onu_id>/update', methods=['POST'])
@login_required
def update_onu(onu_id):
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    data = request.get_json()
    logger.info(f"[update_onu] ONU {onu_id} payload={data} by user={current_user.username}")
    olt = db.session.get(OLT, onu.olt_id) if onu.olt_id else None
    cli_cmds = []  # Collect CLI commands to send to OLT after DB save
    if 'name' in data:
        if not current_user.has_permission('edit_onu_name'):
            return jsonify({'success': False, 'message': 'Permission denied: edit_onu_name'}), 403
        onu.name = data['name']
        cli_cmds.append(f'name {data["name"]}')
    if 'description' in data:
        if not current_user.has_permission('edit_onu_description'):
            return jsonify({'success': False, 'message': 'Permission denied: edit_onu_description'}), 403
        onu.description = data['description']
        cli_cmds.append(f'description {data["description"]}')
    if 'pppoe' in data:
        if not current_user.has_permission('configure_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403
        onu.pppoe = data['pppoe']
    if 'actual_type' in data:
        if not current_user.has_permission('edit_onu_name'):
            return jsonify({'success': False, 'message': 'Permission denied: edit_onu_name'}), 403
        onu.actual_type = data['actual_type'].strip()
    if 'onu_type' in data:
        if not current_user.has_permission('configure_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403
        onu.onu_type = data['onu_type'].strip()
        # Re-register ONU with new type on OLT (preserves existing config)
        if olt and olt.telnet_enabled and olt.cli_username and onu.serial_number:
            try:
                from snmp_collector import create_cli_collector
                tc = create_cli_collector(olt)
                tn = tc._connect()
                if tn:
                    is_epon = (onu.card or '').lower() == 'epon'
                    olt_pfx = 'epon-olt' if is_epon else 'gpon-olt'
                    pon_if = f'{olt_pfx}_{onu.frame}/{onu.slot}/{onu.port}'
                    tc._send_command(tn, 'end')
                    tc._send_command(tn, 'configure terminal')
                    tc._send_command(tn, f'interface {pon_if}')
                    if is_epon:
                        from telnet_client import _format_epon_mac
                        tc._send_command(tn, f'onu {onu.onu_id} type {data["onu_type"].strip()} mac {_format_epon_mac(onu.serial_number)}')
                    else:
                        tc._send_command(tn, f'onu {onu.onu_id} type {data["onu_type"].strip()} sn {onu.serial_number}')
                    tc._send_command(tn, 'end')
                    tn.close()
                    logger.info(f"[update_onu] CLI: re-registered ONU {onu.onu_id} type={data['onu_type'].strip()}")
            except Exception as e:
                logger.warning(f"[update_onu] onu_type CLI failed: {e}")
    if 'serial_number' in data:
        if not current_user.has_permission('configure_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403
        onu.serial_number = data['serial_number'].strip()
    if 'onu_id' in data:
        if not current_user.has_permission('configure_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403
        try:
            new_oid = int(data['onu_id'])
            if 1 <= new_oid <= 128:
                onu.onu_id = new_oid
        except (ValueError, TypeError):
            pass
    if 'technician_id' in data:
        if not current_user.has_permission('configure_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403
        onu.technician_id = data['technician_id'] or None
    if 'latitude' in data:
        if not current_user.has_permission('configure_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403
        onu.latitude = float(data['latitude']) if data['latitude'] else None
    if 'longitude' in data:
        if not current_user.has_permission('configure_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403
        onu.longitude = float(data['longitude']) if data['longitude'] else None
    if 'odp_port_id' in data:
        if not current_user.has_permission('configure_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403
        from models import FTTHODPPort
        # Unlink old ODP port if any
        if onu.odp_port:
            old_port = onu.odp_port
            old_port.onu_id = None
            old_port.status = 'available'
        # Link new ODP port
        new_port_id = data['odp_port_id']
        if new_port_id:
            new_port = db.session.get(FTTHODPPort, int(new_port_id))
            if new_port:
                # Free up the ONU currently on this port (if any)
                if new_port.onu_id and new_port.onu_id != onu.id:
                    new_port.onu_id = None
                new_port.onu_id = onu.id
                new_port.status = 'used'
        db.session.flush()
    db.session.commit()
    logger.info(f"[update_onu] DB committed for ONU {onu_id}, fields: {list(data.keys())}")
    if cli_cmds and olt and olt.telnet_enabled and olt.cli_username:
        try:
            from snmp_collector import create_cli_collector
            tc = create_cli_collector(olt)
            tn = tc._connect()
            if tn:
                is_epon = (onu.card or '').lower() == 'epon'
                onu_pfx = 'epon-onu' if is_epon else 'gpon-onu'
                onu_if = f'{onu_pfx}_{onu.frame}/{onu.slot}/{onu.port}:{onu.onu_id}'
                tc._send_command(tn, 'end')
                tc._send_command(tn, 'configure terminal')
                tc._send_command(tn, f'interface {onu_if}')
                for cmd in cli_cmds:
                    tc._send_command(tn, cmd)
                tc._send_command(tn, 'end')
                tn.close()
                logger.info(f"[update_onu] CLI: {cli_cmds} on {onu_if}")
            else:
                logger.warning(f"[update_onu] Telnet connect failed to {olt.ip_address}, DB saved but OLT not updated")
        except Exception as e:
            logger.warning(f"[update_onu] CLI failed: {e}")

    # Invalidate caches so frontend sees fresh data
    try:
        from cache import cache_clear
        cache_clear("dashboard:*")
        if onu.olt_id:
            cache_clear(f"olt:{onu.olt_id}:*")
    except Exception:
        pass

    log_action('onu_update', 'onu', target=onu.onu_id_str or str(onu.id), detail=f'Updated {onu.name} — fields: {list(data.keys())}')
    # Auto-save config to startup-config if CLI commands were sent to OLT
    if cli_cmds:
        _auto_write_config(onu.olt_id)
    return jsonify({'success': True})


@app.route('/api/olt/<int:olt_id>/discover-slots', methods=['POST'])
@permission_required('settings_ip_olts')
def discover_olt_slots(olt_id):
    """Real-time slot discovery via CLI 'show card' — no full sync needed.
    Connects to OLT, collects chassis info, saves cards to DB, returns result."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    if not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})
    try:
        from snmp_collector import create_cli_collector
        tc = create_cli_collector(olt)
        chassis = tc.collect_chassis_info()
        cards = chassis.get('cards', [])
        if not cards:
            return jsonify({'success': False, 'message': 'No cards discovered. Check CLI connection.'})
        # Save discovered cards to DB
        OLTCard.query.filter_by(olt_id=olt_id).delete()
        for cd in cards:
            card = OLTCard(
                olt_id=olt_id, slot=cd.get('slot', 0),
                card_type=cd.get('type', ''), status=cd.get('status', ''),
                total_ports=cd.get('port_count', 0),
            )
            db.session.add(card)
        # Save fans if available
        if chassis.get('fans'):
            Fan.query.filter_by(olt_id=olt_id).delete()
            for f in chassis['fans']:
                fan = Fan(
                    olt_id=olt_id, fan_number=f.get('number', 0),
                    status=f.get('status', ''), rpm=f.get('rpm', 0),
                    speed_level=f.get('speed_level', ''),
                )
                db.session.add(fan)
        db.session.commit()
        log_action('olt_discover_slots', 'olt', target=olt.name,
                   detail=f'Discovered {len(cards)} cards via CLI')
        try:
            from cache import cache_clear
            cache_clear("dashboard:*")
            cache_clear(f"olt:{olt_id}:chassis")
            cache_clear(f"olt:{olt_id}:pon-structure")
        except Exception:
            pass
        return jsonify({
            'success': True,
            'message': f'Discovered {len(cards)} card(s) from OLT',
            'cards': cards,
            'fans': chassis.get('fans', []),
            'temperature': chassis.get('temperature'),
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Discovery failed: {str(e)[:200]}'})


@app.route('/api/olt/<int:olt_id>/pon-structure', methods=['GET'])
@login_required
def olt_pon_structure(olt_id):
    """Return card/PON structure for Move ONU modal dropdowns."""
    import re as _re
    ports = OLTPort.query.filter_by(olt_id=olt_id).all()
    structure = {}
    for p in ports:
        m = _re.match(r'(?:gpon|epon)-olt_(\d+)/(\d+)/(\d+)', p.port_name or '')
        if m:
            slot = int(m.group(2))
            port = int(m.group(3))
            structure.setdefault(slot, [])
            if port not in structure[slot]:
                structure[slot].append(port)
    result = [{'card': k, 'ports': sorted(v)} for k, v in sorted(structure.items())]
    # Fallback: derive from existing ONU records if no PON ports in DB
    if not result:
        onus = ONU.query.filter_by(olt_id=olt_id).all()
        for o in onus:
            structure.setdefault(o.slot, [])
            if o.port not in structure[o.slot]:
                structure[o.slot].append(o.port)
        result = [{'card': k, 'ports': sorted(v)} for k, v in sorted(structure.items())]
    return jsonify({'success': True, 'structure': result})


@app.route('/api/onu/<int:onu_id>/move', methods=['POST'])
@permission_required('configure_onu')
def move_onu(onu_id):
    """Move ONU to a different card/PON/ID (DB update only — sync will reconcile with OLT)."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    data = request.get_json()
    new_card = int(data.get('card', onu.slot))
    new_pon = int(data.get('pon', onu.port))
    onu_id_mode = data.get('onu_id_mode', 'auto')
    if onu_id_mode == 'auto':
        used_ids = {o.onu_id for o in ONU.query.filter_by(
            olt_id=onu.olt_id, frame=onu.frame, slot=new_card, port=new_pon
        ).filter(ONU.id != onu_id).all()}
        new_oid = next((i for i in range(1, 129) if i not in used_ids), None)
        if new_oid is None:
            return jsonify({'success': False, 'message': 'No available ONU IDs on target PON (all 128 used)'})
    else:
        try:
            new_oid = int(data.get('onu_id_value', onu.onu_id))
        except (TypeError, ValueError):
            return jsonify({'success': False, 'message': 'Invalid ONU ID'})
        if not (1 <= new_oid <= 128):
            return jsonify({'success': False, 'message': 'ONU ID must be 1–128'})
    onu.slot = new_card
    onu.port = new_pon
    onu.onu_id = new_oid
    db.session.commit()
    log_action('onu_move', 'onu', target=onu.onu_id_str or str(onu.id), detail=f'Moved to {onu.frame}/{new_card}/{new_pon}:{new_oid}')
    return jsonify({'success': True, 'message': f'ONU moved to {onu.frame}/{new_card}/{new_pon}:{new_oid}'})


@app.route('/api/onu/<int:onu_id>/migrate', methods=['POST'])
@permission_required('configure_onu')
def migrate_onu(onu_id):
    """Migrate ONU from one PON to another: deregister old, register new, update DB.

    Flow:
    1. Get ONU current info (serial, type, name, description)
    2. Deregister from old PON (no onu N on old interface)
    3. Register on new PON (onu N type TYPE sn SERIAL)
    4. Update DB (slot, port, onu_id)
    5. Optionally re-apply name/description and basic config
    """
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    data = request.get_json()
    new_card = int(data.get('card', onu.slot))
    new_pon = int(data.get('pon', onu.port))
    onu_id_mode = data.get('onu_id_mode', 'auto')

    olt = onu.olt
    if not olt or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})

    # Calculate new ONU ID
    if onu_id_mode == 'auto':
        used_ids = {o.onu_id for o in ONU.query.filter_by(
            olt_id=onu.olt_id, frame=onu.frame, slot=new_card, port=new_pon
        ).filter(ONU.id != onu_id).all()}
        new_oid = next((i for i in range(1, 129) if i not in used_ids), None)
        if new_oid is None:
            return jsonify({'success': False, 'message': 'No available ONU IDs on target PON (all 128 used)'})
    else:
        try:
            new_oid = int(data.get('onu_id_value', onu.onu_id))
        except (TypeError, ValueError):
            return jsonify({'success': False, 'message': 'Invalid ONU ID'})
        if not (1 <= new_oid <= 128):
            return jsonify({'success': False, 'message': 'ONU ID must be 1–128'})

    old_frame, old_slot, old_port, old_id = onu.frame, onu.slot, onu.port, onu.onu_id
    serial = onu.serial_number or ''
    onu_type = onu.onu_type or 'ZTE-F609'
    onu_name = onu.name or ''
    onu_desc = onu.description or ''

    if not serial:
        return jsonify({'success': False, 'message': 'ONU has no serial number — cannot re-register'})

    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    is_epon = (onu.card or '').lower() == 'epon'

    # Step 1: Deregister from old PON
    ok1, msg1 = tc.deregister_onu(old_frame, old_slot, old_port, old_id, is_epon=is_epon)
    if not ok1:
        return jsonify({'success': False, 'message': f'Deregister failed: {msg1}'})

    # Step 2: Register on new PON
    ok2, msg2 = tc.register_onu(onu.frame, new_card, new_pon, new_oid, onu_type, serial, is_epon=is_epon)
    if not ok2:
        # Try to re-register on old PON as rollback
        tc.register_onu(old_frame, old_slot, old_port, old_id, onu_type, serial, is_epon=is_epon)
        return jsonify({'success': False, 'message': f'Register on new PON failed: {msg2}. Rolled back to old PON.'})

    # Step 3: Re-apply name and description if set
    if onu_name or onu_desc:
        try:
            tc.configure_onu_profile(onu.frame, new_card, new_pon, new_oid,
                                     name=onu_name, description=onu_desc, is_epon=is_epon)
        except Exception:
            pass  # Non-fatal: ONU is registered, just without name/desc

    # Step 4: Update DB
    onu.slot = new_card
    onu.port = new_pon
    onu.onu_id = new_oid
    onu.onu_id_str = f'gpon-onu_{onu.frame}/{new_card}/{new_pon}:{new_oid}'
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'ONU migrated from {old_frame}/{old_slot}/{old_port}:{old_id} to {onu.frame}/{new_card}/{new_pon}:{new_oid}'
    })


@app.route('/api/olt/<int:olt_id>/migrate-batch', methods=['POST'])
@permission_required('configure_onu')
def migrate_onu_batch(olt_id):
    """Batch migrate multiple ONUs to the same target PON.

    Body: { onu_ids: [1,2,3], card: 1, pon: 3, onu_id_mode: 'auto' }
    Returns: { success, migrated, failed, details: [...] }
    """
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    data = request.get_json()
    onu_ids = data.get('onu_ids', [])
    new_card = int(data.get('card', 0))
    new_pon = int(data.get('pon', 0))
    onu_id_mode = data.get('onu_id_mode', 'auto')

    if not onu_ids or not new_card or not new_pon:
        return jsonify({'success': False, 'message': 'Missing onu_ids, card, or pon'})

    if not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})

    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)

    # Pre-calculate used ONU IDs on target PON (for auto mode)
    used_ids = {o.onu_id for o in ONU.query.filter_by(
        olt_id=olt_id, frame=1, slot=new_card, port=new_pon
    ).all()}

    results = []
    migrated = 0
    failed = 0

    for oid in onu_ids:
        onu = db.session.get(ONU, oid)
        if not onu:
            results.append({'id': oid, 'success': False, 'message': 'ONU not found'})
            failed += 1
            continue

        serial = onu.serial_number or ''
        onu_type = onu.onu_type or 'ZTE-F609'
        onu_name = onu.name or ''
        onu_desc = onu.description or ''

        if not serial:
            results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': 'No serial number'})
            failed += 1
            continue

        # Calculate new ONU ID
        if onu_id_mode == 'auto':
            new_oid = next((i for i in range(1, 129) if i not in used_ids), None)
            if new_oid is None:
                results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': 'No available ONU IDs'})
                failed += 1
                continue
        else:
            try:
                new_oid = int(data.get('onu_id_value', onu.onu_id))
            except (TypeError, ValueError):
                results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': 'Invalid ONU ID'})
                failed += 1
                continue
            if not (1 <= new_oid <= 128):
                results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': 'ONU ID must be 1-128'})
                failed += 1
                continue
            if new_oid in used_ids:
                results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': f'ONU ID {new_oid} already used'})
                failed += 1
                continue

        old_frame, old_slot, old_port, old_id = onu.frame, onu.slot, onu.port, onu.onu_id
        is_epon = (onu.card or '').lower() == 'epon'

        # Step 1: Deregister from old PON
        ok1, msg1 = tc.deregister_onu(old_frame, old_slot, old_port, old_id, is_epon=is_epon)
        if not ok1:
            results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': f'Deregister failed: {msg1}'})
            failed += 1
            continue

        # Step 2: Register on new PON
        ok2, msg2 = tc.register_onu(onu.frame, new_card, new_pon, new_oid, onu_type, serial, is_epon=is_epon)
        if not ok2:
            # Rollback: re-register on old PON
            tc.register_onu(old_frame, old_slot, old_port, old_id, onu_type, serial, is_epon=is_epon)
            results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': f'Register failed: {msg2}'})
            failed += 1
            continue

        # Step 3: Re-apply name and description
        if onu_name or onu_desc:
            try:
                tc.configure_onu_profile(onu.frame, new_card, new_pon, new_oid,
                                         name=onu_name, description=onu_desc, is_epon=is_epon)
            except Exception:
                pass

        # Step 4: Update DB
        onu.slot = new_card
        onu.port = new_pon
        onu.onu_id = new_oid
        db.session.commit()

        used_ids.add(new_oid)
        migrated += 1
        new_str = f'{onu.frame}/{new_card}/{new_pon}:{new_oid}'
        results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': True,
                        'message': f'Migrated to {new_str}', 'new_onu_id_str': new_str})

    return jsonify({
        'success': migrated > 0,
        'migrated': migrated,
        'failed': failed,
        'total': len(onu_ids),
        'details': results,
    })


@app.route('/api/onu/<int:onu_id>/delete', methods=['POST'])
@permission_required('delete_onu')
def delete_onu(onu_id):
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    olt_id = onu.olt_id
    # Deregister from OLT via Telnet if CLI is configured
    if olt and olt.telnet_enabled:
        from snmp_collector import TelnetCollector, create_cli_collector
        tc = create_cli_collector(olt)
        is_epon = (onu.card or '').lower() == 'epon'
        tc.deregister_onu(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
    db.session.delete(onu)
    db.session.commit()
    # Auto-sync OLT after delete
    _auto_sync_olt(olt_id)
    log_action('onu_delete', 'onu', target=onu.onu_id_str or str(onu.id), detail=f'Deleted {onu.name} ({onu.serial_number}) from {olt.name if olt else "unknown"}')
    return jsonify({'success': True, 'message': 'ONU deleted. Auto-syncing OLT...'})


def _auto_sync_olt(olt_id):
    """Trigger a background sync for an OLT after ONU actions (clear-config, delete, etc.).
    Non-blocking — runs in a thread so the API response is not delayed.
    Uses LIGHT sync (SNMP-only) to minimize OLT CPU load."""
    import threading
    from flask import current_app
    from sync_lock import acquire_sync_lock, release_sync_lock

    app = current_app._get_current_object()

    def _do_sync():
        with app.app_context():
            # Acquire per-OLT sync lock
            lock_token = acquire_sync_lock(olt_id, timeout=0)
            if lock_token is None:
                logger.info(f"Auto-sync skipped for OLT {olt_id} — already syncing")
                return

            try:
                olt = db.session.get(OLT, olt_id)
                if not olt:
                    return
                sync = OLTSyncStatus.query.filter_by(olt_id=olt_id).first()
                if not sync:
                    sync = OLTSyncStatus(olt_id=olt_id)
                    db.session.add(sync)
                sync.status = 'running'
                sync.progress = 0
                sync.message = 'Auto-sync (light) after ONU action...'
                sync.started_at = datetime.now(timezone.utc)
                sync.completed_at = None
                db.session.commit()

                def update_progress(pct, msg):
                    sync.progress = pct
                    sync.message = msg
                    db.session.commit()

                from snmp_collector import poll_olt
                result = poll_olt(olt, progress_cb=update_progress, light=True)

                if result.get('success'):
                    from sync_helper import save_sync_result, check_unregistered_onus
                    onu_count, stale_count = save_sync_result(olt, result, sync, light=True)
                    sync.progress = 100
                    sync.status = 'completed'
                    sync.message = f'Auto-sync OK: {onu_count} ONUs'
                    sync.completed_at = datetime.now(timezone.utc)
                    db.session.commit()
                    try:
                        from ws_bridge import ws_broadcast_sync, ws_broadcast_dashboard
                        ws_broadcast_sync(olt_id, 100, "Sync complete", "done")
                        ws_broadcast_dashboard("onu_change", {"olt_id": olt_id, "action": "sync_complete"})
                    except Exception:
                        pass
                else:
                    olt.is_online = False
                    olt.connection_status = 'error'
                    sync.status = 'error'
                    sync.message = result.get('error', result.get('message', 'Auto-sync failed'))
                    sync.completed_at = datetime.now(timezone.utc)
                    db.session.commit()
            except Exception as e:
                try:
                    sync = OLTSyncStatus.query.filter_by(olt_id=olt_id).first()
                    if sync:
                        sync.status = 'error'
                        sync.message = str(e)[:200]
                        db.session.commit()
                except:
                    pass
            finally:
                release_sync_lock(olt_id, lock_token)

    thread = threading.Thread(target=_do_sync, daemon=True)
    thread.start()


def _auto_write_config(olt_id):
    """Auto-save OLT running-config to startup-config via 'write' command.
    Non-blocking — runs in a background thread so API response is not delayed.
    Called after provisioning ONU, config changes, etc. to ensure config persists across reboots."""
    import threading
    from flask import current_app

    app = current_app._get_current_object()

    def _do_write():
        with app.app_context():
            try:
                olt = db.session.get(OLT, olt_id)
                if not olt or not olt.cli_username:
                    return
                from snmp_collector import create_cli_collector
                tc = create_cli_collector(olt)
                tn = tc._connect()
                if not tn:
                    logger.warning(f"Auto-write: Telnet connect failed for OLT {olt_id}")
                    return
                out = tc._send_command(tn, 'write', timeout=30)
                tn.close()
                low = out.lower()
                if '%error' in low or '% invalid' in low or '%code' in low or 'incomplete command' in low or 'ambiguous command' in low or 'return error' in low:
                    logger.warning(f"Auto-write: write command failed for OLT {olt_id}: {out.strip()[:200]}")
                else:
                    logger.info(f"Auto-write: Config saved to startup-config for OLT {olt_id}")
                    log_action('olt_auto_write', 'olt', target=olt.name, detail='Auto-saved running-config to startup after provisioning')
            except Exception as e:
                logger.warning(f"Auto-write: Failed for OLT {olt_id}: {e}")

    thread = threading.Thread(target=_do_write, daemon=True)
    thread.start()


@app.route('/api/onu/<int:onu_id>/action', methods=['POST'])
@login_required
def onu_action(onu_id):
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    data = request.get_json()
    action = data.get('action')
    olt = onu.olt

    if not olt or not olt.telnet_enabled:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})

    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    is_epon = (onu.card or '').lower() == 'epon'
    device_type = 'EPON' if is_epon else 'GPON'
    logger.info(f"[onu-action] ONU {onu_id} action='{action}' device={device_type} card='{onu.card}' by user={current_user.username}")

    if action == 'reboot':
        if not current_user.has_permission('reboot_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: reboot_onu'}), 403
        success, msg = tc.reset_onu(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon, serial_number=onu.serial_number or '')
        logger.info(f"[onu-action] reboot ONU {onu_id} ({device_type}): success={success} msg={msg}")
        if success:
            _auto_sync_olt(onu.olt_id)
    elif action == 'reset':
        if not current_user.has_permission('reboot_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: reboot_onu'}), 403
        success, msg = tc.reset_onu(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon, serial_number=onu.serial_number or '')
        logger.info(f"[onu-action] reset ONU {onu_id} ({device_type}): success={success} msg={msg}")
        if success:
            _auto_sync_olt(onu.olt_id)
    elif action == 'delete':
        if not current_user.has_permission('delete_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: delete_onu'}), 403
        olt_id_for_sync = onu.olt_id
        success, msg = tc.deregister_onu(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
        if success:
            db.session.delete(onu)
            db.session.commit()
            # Auto-trigger OLT sync after delete
            _auto_sync_olt(olt_id_for_sync)
            # Auto-save config to startup-config
            _auto_write_config(olt_id_for_sync)
    elif action == 'clear-config':
        if not current_user.has_permission('clear_config_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: clear_config_onu'}), 403
        success, msg = tc.clear_onu_config(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
        logger.info(f"[onu-action] clear-config ONU {onu_id} ({device_type}): success={success} msg={msg}")
        if success:
            # Clear service-related fields in DB
            onu.pppoe = ''
            db.session.commit()
            _auto_sync_olt(onu.olt_id)
            # Auto-save config to startup-config
            _auto_write_config(onu.olt_id)
    elif action == 'disable':
        if not current_user.has_permission('disable_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: disable_onu'}), 403
        success, msg = tc.disable_onu(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
        logger.info(f"[onu-action] disable ONU {onu_id} ({device_type}): success={success} msg={msg}")
        if success:
            onu.status = 'offline'
            db.session.commit()
    elif action == 'enable':
        if not current_user.has_permission('disable_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: disable_onu'}), 403
        success, msg = tc.enable_onu(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
        logger.info(f"[onu-action] enable ONU {onu_id} ({device_type}): success={success} msg={msg}")
        if success:
            onu.status = 'online'
            db.session.commit()
    elif action == 'resync':
        success, msg = (True, 'OK')
        logger.info(f"[onu-action] resync ONU {onu_id} ({device_type}): collecting from OLT...")
        data = tc.collect_onu_detail(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
        if data:
            if data.get('name') and not onu.name: onu.name = data['name']
            if data.get('description') and not onu.description: onu.description = data['description']
            if data.get('serial'): onu.serial_number = data['serial']
            if data.get('distance_m') is not None: onu.distance = data['distance_m']
            if data.get('rx_power') is not None: onu.rx_power = data['rx_power']
            if data.get('onu_rx_power') is not None: onu.onu_rx_power = data['onu_rx_power']
            if data.get('tx_power') is not None: onu.tx_power = data['tx_power']
            if data.get('state'):
                state = data['state'].lower()
                if state == 'ready': onu.status = 'online'
                elif state == 'dyinggasp': onu.status = 'dyinggasp'
                elif state == 'los': onu.status = 'los'
                else: onu.status = state
            db.session.commit()
            success, msg = True, 'Config resynced from OLT'
            logger.info(f"[onu-action] resync ONU {onu_id} ({device_type}): success — state={data.get('state','?')} rx={data.get('rx_power','?')}")
        else:
            success, msg = False, 'Failed to collect ONU data from OLT'
            logger.warning(f"[onu-action] resync ONU {onu_id} ({device_type}): failed — no data from OLT")
    elif action == 'restore-factory':
        if not current_user.has_permission('reset_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: reset_onu'}), 403
        success, msg = tc.restore_factory_onu(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
        logger.info(f"[onu-action] restore-factory ONU {onu_id} ({device_type}): success={success} msg={msg}")
        if success:
            # Clear service-related fields in DB — factory reset wipes all ONU config
            onu.pppoe = ''
            db.session.commit()
            _auto_sync_olt(onu.olt_id)
            # Auto-save config to startup-config
            _auto_write_config(onu.olt_id)
    elif action == 'restore-wifi':
        if not current_user.has_permission('configure_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403
        success, msg = tc.restore_wifi_onu(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
        logger.info(f"[onu-action] restore-wifi ONU {onu_id} ({device_type}): success={success} msg={msg}")
        if success:
            # Clear WiFi config in DB
            onu.wifi_config = ''
            db.session.commit()
            _auto_sync_olt(onu.olt_id)
    else:
        return jsonify({'success': False, 'message': f'Unknown action: {action}'})
    logger.info(f"[onu-action] ONU {onu_id} action='{action}' ({device_type}): final success={success} msg={msg}")
    if success:
        log_action(f'onu_{action}', 'onu', target=onu.onu_id_str or str(onu.id), detail=f'{action} on {onu.name} ({onu.serial_number}) — {msg}')
    return jsonify({'success': success, 'message': msg})


@app.route('/api/onu/<int:onu_id>/live-info', methods=['GET'])
@login_required
def onu_live_info(onu_id):
    """Fetch live ONU data from OLT: detail-info, remote-onu equip, running-config."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    if not olt or not olt.telnet_enabled:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})

    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    is_epon = (onu.card or '').lower() == 'epon'
    data = tc.get_onu_live_data(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
    if data.get('error') and not data.get('equip') and not data.get('running_config', {}).get('service_ports'):
        return jsonify({'success': False, 'message': data['error']})
    return jsonify({'success': True, 'data': data})



@app.route('/api/onu/<int:onu_id>/get-status', methods=['POST'])
@login_required
def onu_get_status(onu_id):
    """Get detailed ONU status matching R-Config Get Status output.
    Returns: interface info, optical status (OLT/ONU RX/TX + attenuation), history, MAC table."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    if not olt or not olt.telnet_enabled:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})

    from snmp_collector import TelnetCollector, create_cli_collector
    import re as _re
    tc = create_cli_collector(olt)
    tn = tc._connect()
    if not tn:
        return jsonify({'success': False, 'message': 'Telnet connection failed'})

    is_epon = (onu.card or '').lower() == 'epon'
    prefix = 'epon-onu' if is_epon else 'gpon-onu'
    iface = f'{prefix}_{onu.frame}/{onu.slot}/{onu.port}:{onu.onu_id}'
    device_type = 'EPON' if is_epon else 'GPON'
    logger.info(f"[get-status] ONU {onu_id} ({device_type}) iface={iface} by user={current_user.username}")
    status_data = {
        'interface': {},
        'optical': {'up': {}, 'down': {}},
        'history': [],
        'macs': [],
    }

    if is_epon:
        # EPON: running-config for name/desc + power attenuation for optical
        try:
            raw_cfg = tc._send_command(tn, f'show running-config interface {iface}', timeout=12)
            info = {}
            for line in raw_cfg.split('\n'):
                ls = line.strip()
                if ls.startswith('property description'):
                    desc_raw = ls.split('description', 1)[1].strip() if 'description' in ls else ''
                    if desc_raw:
                        parts = desc_raw.split('$$')
                        parts = [p.strip() for p in parts if p.strip()]
                        if len(parts) >= 1: info['Name'] = parts[0]
                        if len(parts) >= 2: info['Description'] = parts[1]
                elif ls.startswith('name '):
                    info['Name'] = ls.split(' ', 1)[1] if ' ' in ls else ''
            status_data['interface'] = info

            # Power attenuation — same command works for EPON with epon-onu_ prefix
            try:
                att_out = tc._send_command(tn, f'show pon power attenuation {iface}', timeout=10)
                if att_out and 'Error' not in att_out and 'Incomplete' not in att_out:
                    for line in att_out.split('\n'):
                        ls = line.strip()
                        if not ls or '---' in ls or ls.lower().startswith('olt') or 'attenuation' in ls.lower():
                            continue
                        ll = ls.lower()
                        if ll.startswith('up'):
                            rx_m = _re.search(r'Rx\s*:\s*([-]?\d+\.?\d*)', ls)
                            tx_m = _re.search(r'Tx\s*:\s*([-]?\d+\.?\d*)', ls)
                            att_m = _re.findall(r'([-]?\d+\.?\d*)\s*\(dB\)', ls)
                            if rx_m:
                                val = f'{float(rx_m.group(1)):.3f} dBm'
                                status_data['optical']['up']['rx'] = val
                                status_data['optical']['up']['olt_rx'] = val
                            if tx_m:
                                val = f'{float(tx_m.group(1)):.3f} dBm'
                                status_data['optical']['up']['tx'] = val
                                status_data['optical']['up']['onu_tx'] = val
                            if att_m:
                                status_data['optical']['up']['attenuation'] = f'{float(att_m[-1]):.3f} dB'
                        elif ll.startswith('down'):
                            rx_m = _re.search(r'Rx\s*:\s*([-]?\d+\.?\d*)', ls)
                            tx_m = _re.search(r'Tx\s*:\s*([-]?\d+\.?\d*)', ls)
                            att_m = _re.findall(r'([-]?\d+\.?\d*)\s*\(dB\)', ls)
                            if tx_m:
                                val = f'{float(tx_m.group(1)):.3f} dBm'
                                status_data['optical']['down']['tx'] = val
                                status_data['optical']['down']['olt_tx'] = val
                            if rx_m:
                                val = f'{float(rx_m.group(1)):.3f} dBm'
                                status_data['optical']['down']['rx'] = val
                                status_data['optical']['down']['onu_rx'] = val
                            if att_m:
                                status_data['optical']['down']['attenuation'] = f'{float(att_m[-1]):.3f} dB'
            except Exception:
                pass

            # Update DB with live optical values
            try:
                up_rx = status_data['optical']['up'].get('olt_rx')
                down_rx = status_data['optical']['down'].get('onu_rx')
                up_tx = status_data['optical']['up'].get('onu_tx')
                if up_rx:
                    onu.rx_power = float(_re.search(r'[-]?\d+\.?\d*', up_rx).group())
                if down_rx:
                    onu.onu_rx_power = float(_re.search(r'[-]?\d+\.?\d*', down_rx).group())
                if up_tx:
                    onu.tx_power = float(_re.search(r'[-]?\d+\.?\d*', up_tx).group())
                db.session.commit()
            except Exception as e:
                logger.debug(f"EPON DB optical update failed: {e}")

            tn.write('exit\n'); tn.close()
        except Exception as e:
            try: tn.close()
            except: pass
        return jsonify({'success': True, 'status': status_data})

    # GPON path

    try:
        # 1. detail-info for interface info
        raw = tc._send_command(tn, f'show gpon onu detail-info {iface}', timeout=15)
        info = {}
        in_history = False
        for line in raw.split('\n'):
            ls = line.strip()
            if '------' in ls:
                in_history = True
                continue
            if in_history:
                hm = _re.match(r'\s*\d+\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*(.*)', ls)
                if hm:
                    authpass = hm.group(1).strip()
                    offline = hm.group(2).strip()
                    cause = hm.group(3).strip()
                    status_data['history'].append({
                        'authpass_time': authpass,
                        'offline_time': offline,
                        'cause': cause,
                    })
                continue
            if ':' in ls and not in_history:
                k = ls.split(':', 1)[0].strip()
                v = ls.split(':', 1)[1].strip()
                info[k] = v
        status_data['interface'] = info

        # 2. Optical status — try Telnet first (has ONU TX), SNMP fallback
        # ZTE C320 V2.1.0: SNMP OID .11 (ONU TX) returns 0, so Telnet is needed

        # 2a. Telnet: show pon power attenuation
        # ZTE C320 V2.1.0 output format:
        #           OLT                  ONU              Attenuation
        # --------------------------------------------------------------------------
        #  up      Rx :-22.204(dbm)      Tx:2.170(dbm)        24.374(dB)
        #
        #  down    Tx :9.604(dbm)        Rx:-14.070(dbm)      23.674(dB)
        try:
            att_out = tc._send_command(tn, f'show pon power attenuation {iface}', timeout=10)
            if att_out and 'Error' not in att_out and 'Incomplete' not in att_out:
                for line in att_out.split('\n'):
                    ls = line.strip()
                    if not ls or '---' in ls or ls.lower().startswith('olt') or 'attenuation' in ls.lower():
                        continue
                    ll = ls.lower()
                    # Lines start with 'up' or 'down' followed by data on the SAME line
                    if ll.startswith('up'):
                        # Extract Rx (OLT side) and Tx (ONU side) and attenuation
                        rx_m = _re.search(r'Rx\s*:\s*([-]?\d+\.?\d*)', ls)
                        tx_m = _re.search(r'Tx\s*:\s*([-]?\d+\.?\d*)', ls)
                        # Attenuation is the last number followed by (dB)
                        att_m = _re.findall(r'([-]?\d+\.?\d*)\s*\(dB\)', ls)
                        if rx_m:
                            val = f'{float(rx_m.group(1)):.3f} dBm'
                            status_data['optical']['up']['rx'] = val
                            status_data['optical']['up']['olt_rx'] = val
                        if tx_m:
                            val = f'{float(tx_m.group(1)):.3f} dBm'
                            status_data['optical']['up']['tx'] = val
                            status_data['optical']['up']['onu_tx'] = val
                        if att_m:
                            status_data['optical']['up']['attenuation'] = f'{float(att_m[-1]):.3f} dB'
                    elif ll.startswith('down'):
                        rx_m = _re.search(r'Rx\s*:\s*([-]?\d+\.?\d*)', ls)
                        tx_m = _re.search(r'Tx\s*:\s*([-]?\d+\.?\d*)', ls)
                        att_m = _re.findall(r'([-]?\d+\.?\d*)\s*\(dB\)', ls)
                        if tx_m:
                            val = f'{float(tx_m.group(1)):.3f} dBm'
                            status_data['optical']['down']['tx'] = val
                            status_data['optical']['down']['olt_tx'] = val
                        if rx_m:
                            val = f'{float(rx_m.group(1)):.3f} dBm'
                            status_data['optical']['down']['rx'] = val
                            status_data['optical']['down']['onu_rx'] = val
                        if att_m:
                            status_data['optical']['down']['attenuation'] = f'{float(att_m[-1]):.3f} dB'
        except:
            pass

        # 2b. SNMP fallback for any missing optical values
        try:
            import asyncio as _aio
            from pysnmp.hlapi.v1arch.asyncio import Slim as _Slim, ObjectType as _OT, ObjectIdentity as _OI
            BOARD1_BASE = 268500992
            PON_INCREMENT = 256
            pon_index = BOARD1_BASE + onu.port * PON_INCREMENT
            oid_onu_rx = f'1.3.6.1.4.1.3902.1012.3.50.12.1.1.10.{pon_index}.{onu.onu_id}.1'
            oid_olt_tx = f'1.3.6.1.4.1.3902.1012.3.50.12.1.1.14.{pon_index}.{onu.onu_id}.1'
            oid_olt_rx = f'1.3.6.1.4.1.3902.1012.3.50.12.1.1.18.{pon_index}.{onu.onu_id}.1'
            async def _get_optical():
                slim = _Slim(1)
                try:
                    ei, es, eidx, vb = await slim.get(
                        str(olt.snmp_community), str(olt.ip_address), int(olt.snmp_port),
                        _OT(_OI(oid_onu_rx)), _OT(_OI(oid_olt_tx)), _OT(_OI(oid_olt_rx)),
                        timeout=5, retries=2)
                    if not ei and not es:
                        from snmp_collector import decode_rx_power
                        return (decode_rx_power(int(vb[0][1])), decode_rx_power(int(vb[1][1])), decode_rx_power(int(vb[2][1])))
                except: pass
                finally: slim.close()
                return (None, None, None)
            loop = _aio.new_event_loop()
            onu_rx, olt_tx, olt_rx = loop.run_until_complete(_get_optical())
            loop.close()

            # Fill missing Up values: OLT Rx, attenuation
            if olt_rx is not None:
                if 'rx' not in status_data['optical']['up']:
                    status_data['optical']['up']['rx'] = f'{olt_rx:.3f} dBm'
                    status_data['optical']['up']['olt_rx'] = f'{olt_rx:.3f} dBm'
                    status_data['optical']['up']['olt_rx_snmp_fallback'] = True  # OID .18 — inaccurate on V2.1.0
                # Compute up attenuation if we now have both ONU TX and OLT RX
                onu_tx_str = status_data['optical']['up'].get('onu_tx', '')
                if 'attenuation' not in status_data['optical']['up'] and onu_tx_str:
                    onu_tx_val = float(_re.search(r'[-]?\d+\.?\d*', onu_tx_str).group())
                    status_data['optical']['up']['attenuation'] = f'{round(onu_tx_val - olt_rx, 3):.3f} dB'

            # Fill missing Down values: OLT Tx, ONU Rx, attenuation
            if olt_tx is not None:
                if 'tx' not in status_data['optical']['down']:
                    status_data['optical']['down']['tx'] = f'{olt_tx:.3f} dBm'
                    status_data['optical']['down']['olt_tx'] = f'{olt_tx:.3f} dBm'
            if onu_rx is not None:
                if 'rx' not in status_data['optical']['down']:
                    status_data['optical']['down']['rx'] = f'{onu_rx:.3f} dBm'
                    status_data['optical']['down']['onu_rx'] = f'{onu_rx:.3f} dBm'
            if olt_tx is not None and onu_rx is not None:
                if 'attenuation' not in status_data['optical']['down']:
                    status_data['optical']['down']['attenuation'] = f'{round(olt_tx - onu_rx, 3):.3f} dB'
        except Exception as e:
            logger.debug(f"Optical SNMP failed: {e}")

        # 2c. ONU optical module info via Telnet: show gpon remote-onu interface
        try:
            opt_out = tc._send_command(tn, f'show gpon remote-onu interface {iface}', timeout=10)
            if opt_out and 'Error' not in opt_out and 'Incomplete' not in opt_out:
                onu_opt = {}
                for line in opt_out.split('\n'):
                    ls = line.strip()
                    if ':' in ls:
                        k = ls.split(':', 1)[0].strip().lower()
                        v = ls.split(':', 1)[1].strip()
                        if 'temperature' in k:
                            onu_opt['temperature'] = v
                        elif 'voltage' in k or 'supply' in k:
                            onu_opt['voltage'] = v
                        elif 'bias' in k or 'current' in k:
                            onu_opt['bias_current'] = v
                        elif 'txpower' in k or 'tx power' in k:
                            onu_opt['tx_power'] = v
                        elif 'rxpower' in k or 'rx power' in k or 'rxoptical' in k:
                            onu_opt['rx_power'] = v
                        elif 'wavelength' in k:
                            onu_opt['wavelength'] = v
                        elif 'vendor' in k:
                            onu_opt['vendor'] = v
                        elif 'type' in k and 'module' in k:
                            onu_opt['module_type'] = v
                if onu_opt:
                    status_data['optical']['onu_module'] = onu_opt
        except:
            pass

        # 3. MAC address table (may not be supported on all firmware versions)
        try:
            mac_out = tc._send_command(tn, f'show mac gpon-onu {iface}', timeout=10)
            if mac_out and 'Error' not in mac_out and 'Invalid' not in mac_out and 'Incomplete' not in mac_out:
                for line in mac_out.split('\n'):
                    ls = line.strip()
                    if not ls or '---' in ls or ls.lower().startswith('mac') or ls.lower().startswith('total'):
                        continue
                    parts = ls.split()
                    if len(parts) >= 4 and _re.match(r'^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$', parts[0].lower()):
                        status_data['macs'].append({
                            'mac': parts[0],
                            'vlan': parts[1] if len(parts) > 1 else '',
                            'type': parts[2] if len(parts) > 2 else '',
                            'port': parts[3] if len(parts) > 3 else '',
                            'vport': parts[4] if len(parts) > 4 else '',
                        })
        except:
            pass

        tn.write('exit\n'); tn.close()

        # Update DB with live optical values for consistency
        try:
            up_rx = status_data['optical']['up'].get('olt_rx')
            down_rx = status_data['optical']['down'].get('onu_rx')
            up_tx = status_data['optical']['up'].get('onu_tx')
            # Only update rx_power (OLT RX) in DB if from Telnet, not SNMP OID .18 fallback
            if up_rx and not status_data['optical']['up'].get('olt_rx_snmp_fallback'):
                onu.rx_power = float(_re.search(r'[-]?\d+\.?\d*', up_rx).group())
            if down_rx:
                onu.onu_rx_power = float(_re.search(r'[-]?\d+\.?\d*', down_rx).group())
            if up_tx:
                onu.tx_power = float(_re.search(r'[-]?\d+\.?\d*', up_tx).group())
            db.session.commit()
        except Exception as e:
            logger.debug(f"DB optical update failed: {e}")

        return jsonify({'success': True, 'status': status_data})
    except Exception as e:
        logger.error(f"get-status failed: {e}")
        try: tn.close()
        except: pass
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/onu/<int:onu_id>/refresh-status', methods=['POST'])
@login_required
def onu_refresh_status(onu_id):
    """Re-fetch ONU status from OLT and update DB (ZTE via Telnet)."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt

    if not olt or not olt.telnet_enabled:
        return jsonify({'success': False, 'message': 'OLT not configured'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    is_epon = (onu.card or '').lower() == 'epon'
    data = tc.collect_onu_detail(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
    state_val = data.get('state', '').lower()
    if state_val in ('ready', 'online'):
        onu.status = 'online'
    elif state_val in ('offline', 'los', 'dyinggasp'):
        onu.status = state_val
    if data.get('distance_m') is not None:
        onu.distance = data['distance_m']
    if data.get('rx_power') is not None:
        onu.rx_power = data['rx_power']
    if data.get('onu_rx_power') is not None:
        onu.onu_rx_power = data['onu_rx_power']
    if data.get('tx_power') is not None:
        onu.tx_power = data['tx_power']
    db.session.commit()
    return jsonify({'success': True, 'data': data})


@app.route('/api/onu/<int:onu_id>/running-config', methods=['GET'])
@login_required
def onu_running_config(onu_id):
    """Get ONU running-config from OLT (interface + pon-onu-mng sections)."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    if not olt or not olt.telnet_enabled:
        return jsonify({'success': False, 'message': 'OLT not configured'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    is_epon = (onu.card or '').lower() == 'epon'
    data = tc.collect_onu_detail(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
    config = data.get('running_config_raw', '')
    return jsonify({'success': True, 'config': config or 'No config available'})


@app.route('/api/onu/<int:onu_id>/save-config', methods=['POST'])
@permission_required('configure_onu')
def onu_save_config(onu_id):
    """Save OLT running-config to startup-config by running 'write' command."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    if not olt or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    try:
        tn = tc._connect()
        if not tn:
            return jsonify({'success': False, 'message': 'Telnet connection failed'})
        out = tc._send_command(tn, 'write', timeout=30)
        tn.close()
        if 'error' in out.lower() or '%' in out:
            return jsonify({'success': False, 'message': f'Save failed: {out.strip()}'})
        return jsonify({'success': True, 'message': 'Config saved to startup-config'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/onu/<int:onu_id>/resync-config', methods=['POST'])
@permission_required('configure_onu')
def onu_resync_config(onu_id):
    """Re-collect ONU detail from OLT and update DB (ZTE via Telnet).
    This is a READ-ONLY operation — does NOT modify OLT config.
    """
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt

    if not olt or not olt.telnet_enabled:
        return jsonify({'success': False, 'message': 'OLT not configured'})
    try:
        from snmp_collector import TelnetCollector, create_cli_collector
        tc = create_cli_collector(olt)
        is_epon = (onu.card or '').lower() == 'epon'
        device_type = 'EPON' if is_epon else 'GPON'
        logger.info(f"[resync-config] ONU {onu_id} ({device_type}) by user={current_user.username}")
        data = tc.collect_onu_detail(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
        if not data:
            logger.warning(f"[resync-config] ONU {onu_id} ({device_type}): no data from OLT")
            return jsonify({'success': False, 'message': 'Failed to collect ONU data from OLT'})
        updated = False
        if data.get('name') and not onu.name: onu.name = data['name']; updated = True
        if data.get('description') and not onu.description: onu.description = data['description']; updated = True
        if data.get('serial'): onu.serial_number = data['serial']; updated = True
        if data.get('distance_m') is not None: onu.distance = data['distance_m']; updated = True
        if data.get('state'):
            state = data['state'].lower()
            if state == 'ready': onu.status = 'online'
            elif state == 'dyinggasp': onu.status = 'dyinggasp'
            elif state == 'los': onu.status = 'los'
            else: onu.status = state
            updated = True
        # Read-back WiFi config from ONU running-config
        wifi_entries = data.get('wifi_entries', [])
        if wifi_entries:
            import json as _json_rc
            # Preserve existing passwords and DB-only SSIDs from DB
            # (ZTE doesn't expose WPA keys in read-back, and newly added
            # SSIDs may not appear in OLT running-config immediately)
            existing_ssids = {}
            if onu.wifi_config:
                try:
                    _prev = _json_rc.loads(onu.wifi_config)
                    for s in _prev.get('ssids', []):
                        existing_ssids[int(s.get('ssid_num', 0))] = s
                except Exception:
                    pass
            ssids = []
            readback_nums = set()
            for w in wifi_entries:
                num = int(w.get('wifi_num', 0))
                readback_nums.add(num)
                rb_pw = w.get('ssid_password', '')
                ssids.append({
                    'ssid_num': num,
                    'ssid_name': w.get('ssid_name', ''),
                    'ssid_auth_type': w.get('ssid_auth_type', ''),
                    'ssid_password': rb_pw if rb_pw and rb_pw != '--' else existing_ssids.get(num, {}).get('ssid_password', ''),
                    'wifi_mode': w.get('mode', ''),
                    'wifi_status': w.get('status', 'up'),
                    'vlan': w.get('vlan', ''),
                })
            # Preserve DB entries not in read-back (newly added, OLT may not have applied yet)
            for num, s in existing_ssids.items():
                if num not in readback_nums:
                    ssids.append(s)
            onu.wifi_config = _json_rc.dumps({'ssids': ssids})
            updated = True
        if updated: db.session.commit()
        return jsonify({'success': True, 'message': 'Config resynced from OLT'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Resync failed: {str(e)}'})


@app.route('/api/onu/<int:onu_id>/replace', methods=['POST'])
@permission_required('configure_onu')
def onu_replace(onu_id):
    """Replace ONU with new SN/MAC — preserves all config (service, VLAN, profiles, etc).
    Validates vendor match, backs up config, deletes old ONU, registers new, re-applies config."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404

    data = request.get_json()
    new_serial = (data.get('new_serial') or '').strip().upper()
    if not new_serial:
        return jsonify({'success': False, 'message': 'New serial number is required'})

    olt = onu.olt
    if not olt or not olt.telnet_enabled:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})

    if not current_user.has_permission('configure_onu'):
        return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403

    old_serial = onu.serial_number or ''
    is_epon = (onu.card or '').lower() == 'epon'
    device_type = 'EPON' if is_epon else 'GPON'

    # Vendor validation from serial prefix
    def get_vendor(sn):
        sn = (sn or '').upper()
        if sn.startswith('ZTE'): return 'ZTE'
        if sn.startswith('FHT'): return 'FiberHome'
        if sn.startswith('HW'): return 'Huawei'
        if sn.startswith('GPON'): return 'GPON'
        return 'Unknown'

    old_vendor = get_vendor(old_serial)
    new_vendor = get_vendor(new_serial)

    logger.info(f"[replace-onu] ONU {onu_id} ({device_type}): old SN={old_serial} ({old_vendor}) -> new SN={new_serial} ({new_vendor}) by user={current_user.username}")

    if old_vendor != new_vendor and old_vendor != 'Unknown' and new_vendor != 'Unknown':
        return jsonify({'success': False, 'message': f'Vendor mismatch: old ONU is {old_vendor} ({old_serial}), new SN is {new_vendor} ({new_serial}). ONU vendor must match.'})

    from snmp_collector import create_cli_collector
    tc = create_cli_collector(olt)
    onu_type = onu.onu_type or 'All'

    def progress_cb(step, msg):
        logger.info(f"[replace-onu] ONU {onu_id} step={step}: {msg}")

    success, msg = tc.replace_onu(
        onu.frame, onu.slot, onu.port, onu.onu_id,
        new_serial, old_serial=old_serial,
        is_epon=is_epon, onu_type=onu_type,
        progress_cb=progress_cb
    )

    logger.info(f"[replace-onu] ONU {onu_id} ({device_type}): final success={success} msg={msg}")

    if success:
        onu.serial_number = new_serial
        onu.status = 'offline'
        db.session.commit()
        _auto_sync_olt(onu.olt_id)
        _auto_write_config(onu.olt_id)
        log_action('onu_replace', 'onu', target=onu.onu_id_str or str(onu.id),
                   detail=f'Replaced ONU: {old_serial} -> {new_serial} — {msg}')

    return jsonify({'success': success, 'message': msg})


@app.route('/api/onu-types', methods=['GET'])
@login_required
def get_onu_types():
    """Get ONU types list from OLT for dropdown selection."""
    olt_id = request.args.get('olt_id')
    if not olt_id:
        # Use first OLT
        olt = OLT.query.first()
    else:
        olt = db.session.get(OLT, int(olt_id))
    if not olt:
        return jsonify({'success': False, 'types': []})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    types = tc.collect_onu_types()
    type_names = [t.get('type_name', '') for t in types if t.get('type_name')]
    type_names.sort()
    return jsonify({'success': True, 'types': type_names})


@app.route('/api/onu/<int:onu_id>/wan-service/<int:svc_idx>', methods=['POST'])
@permission_required('configure_onu')
def onu_wan_service_edit(onu_id, svc_idx):
    """Edit WAN service configuration via Telnet.
    Matches R-Config modal: Status, VLAN, CoS, Download/Upload profiles,
    Mode (PPPoE NAT / Wan-IP / Bridge), with sub-options."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    if not olt or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured'})
    data = request.get_json()
    logger.info(f"[wan-service] ONU {onu_id} svc={svc_idx} data={data} by user={current_user.username}")
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    try:
        tn = tc._connect()
        if not tn:
            return jsonify({'success': False, 'message': 'Telnet connection failed'})
        is_epon = (onu.card or '').lower() == 'epon'
        onu_pfx = 'epon-onu' if is_epon else 'gpon-onu'
        onu_path = f'{onu_pfx}_{onu.frame}/{onu.slot}/{onu.port}:{onu.onu_id}'
        tc._send_command(tn, 'configure terminal', timeout=10)
        import time as _t

        mode = data.get('mode', 'Bridge / ONU Webpage')
        vlan = str(data.get('vlan', '')).strip()
        service_name = data.get('service_name', f'service{svc_idx}')
        download = data.get('download_profile', '')
        upload = data.get('upload_profile', '')
        status = data.get('status', 'enable')
        last_err = None

        # ── EPON: only service-port applies, skip GPON OMCI commands ──
        if is_epon:
            tc._send_command(tn, f'interface {onu_path}', timeout=10)
            # Remove old service-port (ignore errors — may not exist)
            tc._send_command(tn, f'no service-port {svc_idx}', timeout=10)
            if status == 'enable' and vlan:
                _, err = tc._send_cmd_check(tn, f'service-port {svc_idx} vport {svc_idx} user-vlan {vlan} vlan {vlan}', timeout=10)
                if err:
                    last_err = err
            tc._send_command(tn, 'end', timeout=5)
            tn.close()
            if last_err:
                return jsonify({'success': False, 'message': f'CLI error: {last_err}'})
            logger.info(f"[wan-service] EPON ONU {onu_id} svc={svc_idx} vlan={vlan} status={status} — service-port only")
            return jsonify({'success': True, 'message': f'WAN Service {svc_idx} updated (EPON mode: service-port only)'})

        def sc(cmd):
            nonlocal last_err
            _, err = tc._send_cmd_check(tn, cmd, timeout=10)
            if err:
                low = err.lower()
                # Ignore: "does not exist", ONU firmware limitation codes
                if 'does not exist' in low or '%code 63990' in low or 'ont return error' in low:
                    logger.debug(f"Ignored CLI: {cmd[:60]} -> {err[:80]}")
                # Handle 63869 "Record already exists" — force delete and retry once
                elif '63869' in low or 'already exists' in low:
                    logger.warning(f"Record exists, force-replacing: {cmd[:60]}")
                    # Extract pppoe/wan-ip index from command
                    if cmd.startswith('pppoe '):
                        idx = cmd.split()[1]
                        tc._send_command(tn, f'no wan {idx} service', timeout=10)
                        tc._send_command(tn, f'no pppoe {idx}', timeout=10)
                        _t.sleep(0.5)
                        _, err2 = tc._send_cmd_check(tn, cmd, timeout=10)
                        if err2 and ('63869' in err2.lower() or 'already exists' in err2.lower()):
                            last_err = err2  # Still fails after retry
                        elif err2:
                            last_err = err2
                    elif cmd.startswith('wan-ip '):
                        idx = cmd.split()[1]
                        tc._send_command(tn, f'no wan-ip {idx}', timeout=10)
                        _t.sleep(0.5)
                        _, err2 = tc._send_cmd_check(tn, cmd, timeout=10)
                        if err2:
                            last_err = err2
                    elif cmd.startswith('service '):
                        # Service record exists — delete and retry
                        tc._send_command(tn, f'no {cmd}', timeout=10)
                        _t.sleep(0.5)
                        _, err2 = tc._send_cmd_check(tn, cmd, timeout=10)
                        if err2:
                            last_err = err2
                    else:
                        last_err = err
                else:
                    last_err = err

        # ── Step 1: interface context ────────────────────────────────────────
        # Must create TCONT + gemport BEFORE pon-onu-mng service command,
        # otherwise ZTE returns %Code 62397-GPONSRV: The entry is not existed.
        tc._send_command(tn, f'interface {onu_path}', timeout=10)

        # Remove old service-port (ignore errors — may not exist)
        tc._send_command(tn, f'no service-port {svc_idx}', timeout=10)

        if status == 'enable':
            # TCONT: assign upload profile (idempotent — ignore error if tcont already configured)
            if upload:
                tc._send_command(tn, f'tcont {svc_idx} profile {upload}', timeout=10)

            # gemport: bind to TCONT (idempotent — ignore error if gemport already exists)
            tc._send_command(tn, f'gemport {svc_idx} tcont {svc_idx}', timeout=10)

            # service-port: OLT-side VLAN mapping (idempotent — ignore error)
            if vlan:
                tc._send_command(tn, f'service-port {svc_idx} vport {svc_idx} user-vlan {vlan} vlan {vlan}', timeout=10)

            # downstream traffic profile (idempotent — ignore if profile unchanged)
            if download and download != 'default':
                tc._send_command(tn, f'gemport {svc_idx} traffic-limit downstream {download}', timeout=10)

        tc._send_command(tn, 'exit', timeout=5)

        # ── Step 2: pon-onu-mng context ──────────────────────────────────────
        tc._send_command(tn, f'pon-onu-mng {onu_path}', timeout=10)

        # Clean up old ONU-side service entries — order matters on ZTE!
        # Must remove WAN service binding BEFORE pppoe/wan-ip, else "Record already exists" (63869)
        tc._send_command(tn, f'no service {service_name}', timeout=10)
        tc._send_command(tn, f'no service {svc_idx}', timeout=10)
        tc._send_command(tn, f'no wan {svc_idx} service', timeout=10)
        tc._send_command(tn, f'no wan-ip {svc_idx}', timeout=10)
        tc._send_command(tn, f'no pppoe {svc_idx}', timeout=10)
        # Brief pause for OLT to process OMCI deletions before re-creating
        import time as _t; _t.sleep(1)

        # PPPoE NAT and Wan-IP use iphost — must remove VEIP (mutually exclusive on ZTE C320)
        if status == 'enable' and mode in ('PPPoE NAT', 'Wan-IP'):
            tc._send_command(tn, 'no vlan port veip_1 mode hybrid', timeout=10)
            tc._send_command(tn, 'no vlan port veip_1 vlan 1', timeout=10)

        if status == 'enable':
            if mode == 'Bridge / ONU Webpage':
                cmd = f'service {service_name} gemport {svc_idx}'
                if vlan:
                    cmd += f' vlan {vlan}'
                sc(cmd)

            elif mode == 'PPPoE NAT':
                cmd = f'service {service_name} gemport {svc_idx} iphost {svc_idx}'
                if vlan:
                    cmd += f' vlan {vlan}'
                sc(cmd)
                username = data.get('pppoe_username', '')
                password = data.get('pppoe_password', '')
                if username:
                    sc(f'pppoe {svc_idx} nat enable user {username} password {password}')
                    sc(f'wan {svc_idx} service internet host {svc_idx}')

            elif mode == 'Wan-IP':
                # Wan-IP requires iphost (same as PPPoE NAT) for ONU-side IP routing
                cmd = f'service {service_name} gemport {svc_idx} iphost {svc_idx}'
                if vlan:
                    cmd += f' vlan {vlan}'
                sc(cmd)
                wan_ip_mode = data.get('wan_ip_mode', 'dhcp').lower()
                vlan_profile = data.get('vlan_profile', '')
                if wan_ip_mode == 'dhcp':
                    if vlan_profile:
                        cmd = f'wan-ip {svc_idx} mode dhcp vlan-profile {vlan_profile} host {svc_idx}'
                        sc(cmd)
                    else:
                        # vlan-profile optional on some firmware — soft-fail if not supported
                        tc._send_command(tn, f'wan-ip {svc_idx} mode dhcp host {svc_idx}', timeout=10)
                    if data.get('ping_response'):
                        tc._send_command(tn, f'wan-ip {svc_idx} ping-response enable', timeout=10)
                    if data.get('traceroute_response'):
                        tc._send_command(tn, f'wan-ip {svc_idx} traceroute-response enable', timeout=10)
                elif wan_ip_mode == 'pppoe':
                    vlan_profile = vlan_profile or 'pppoe'
                    sc(f'wan-ip {svc_idx} mode pppoe vlan-profile {vlan_profile} host {svc_idx}')
                elif wan_ip_mode == 'static':
                    ip = data.get('wan_ip', '')
                    mask = data.get('wan_netmask', '')
                    gw = data.get('wan_gateway', '')
                    dns1 = data.get('wan_dns1', '')
                    cmd = f'wan-ip {svc_idx} mode static'
                    if vlan_profile:
                        cmd += f' vlan-profile {vlan_profile}'
                    cmd += f' host {svc_idx}'
                    if ip: cmd += f' ipaddress {ip}'
                    if mask: cmd += f' netmask {mask}'
                    if gw: cmd += f' gateway {gw}'
                    if dns1: cmd += f' dns {dns1}'
                    sc(cmd)

        tc._send_command(tn, 'end', timeout=10)
        tn.close()
        if last_err:
            return jsonify({'success': False, 'message': f'CLI error: {last_err}'})
        return jsonify({'success': True, 'message': f'WAN Service {svc_idx} updated'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/olt/<int:olt_id>/onu-types', methods=['GET'])
@login_required
def get_olt_onu_types(olt_id):
    """Get ONU types — try Telnet first, fallback to DB. Cached 5 min (static config)."""
    from cache import cache_get, cache_set
    cache_key = f"olt:{olt_id}:onu-types"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'types': []})

    types = []
    try:
        from snmp_collector import TelnetCollector, create_cli_collector
        tc = create_cli_collector(olt)
        types = tc.collect_onu_types()
    except Exception as e:
        logger.debug(f"Telnet onu-types failed: {e}")

    if types:
        type_names = [t.get('type_name', '') for t in types if t.get('type_name')]
        type_names.sort()
        result = {'success': True, 'types': type_names, 'source': 'telnet'}
    else:
        db_types = ONUType.query.filter_by(olt_id=olt_id).order_by(ONUType.type_name).all()
        type_names = [t.type_name for t in db_types if t.type_name]
        result = {'success': True, 'types': type_names, 'source': 'database'}
    cache_set(cache_key, result, ttl=300)
    return jsonify(result)


@app.route('/api/olt/<int:olt_id>/onu-types-full', methods=['GET'])
@login_required
def get_olt_onu_types_full(olt_id):
    """Get full ONU types from DB with all fields. Cached 60s."""
    from cache import cache_get, cache_set
    cache_key = f"olt:{olt_id}:onu-types-full"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)
    db_types = ONUType.query.filter_by(olt_id=olt_id).order_by(ONUType.type_name).all()
    result = {'success': True, 'onu_types': [{
        'id': t.id, 'type_name': t.type_name, 'pon_type': t.pon_type or 'gpon',
        'description': t.description or '', 'max_tcont': t.max_tcont or 0,
        'max_gem': t.max_gem or 0, 'max_switch': t.max_switch or 0,
        'max_flow': t.max_flow or 0, 'max_ip_host': t.max_ip_host or 0,
        'max_veip': t.max_veip or 0, 'interfaces': t.interfaces or '',
    } for t in db_types]}
    cache_set(cache_key, result, ttl=60)
    return jsonify(result)


@app.route('/api/onu/<int:onu_id>/update-field', methods=['POST'])
@login_required
def update_onu_field(onu_id):
    """Update a single ONU field with confirmation message."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = db.session.get(OLT, onu.olt_id) if onu.olt_id else None
    data = request.get_json()
    field = data.get('field')
    value = data.get('value', '').strip()
    logger.info(f"[update-field] ONU {onu_id} field='{field}' value='{value}' by user={current_user.username}")

    field_perms = {
        'name': 'edit_onu_name',
        'description': 'edit_onu_description',
        'actual_type': 'edit_onu_name',
        'onu_type': 'configure_onu',
        'serial_number': 'configure_onu',
        'onu_id': 'configure_onu',
    }
    required_perm = field_perms.get(field, 'configure_onu')
    if not current_user.has_permission(required_perm):
        return jsonify({'success': False, 'message': f'Permission denied: {required_perm}'}), 403

    def _send_onu_cli(olt, onu, cmd):
        """Helper: send CLI command to ONU interface on OLT (ZTE only)."""
        if not olt or not olt.telnet_enabled or not olt.cli_username:
            return
        try:
            from snmp_collector import create_cli_collector
            tc = create_cli_collector(olt)
            tn = tc._connect()
            if tn:
                is_epon = (onu.card or '').lower() == 'epon'
                onu_pfx = 'epon-onu' if is_epon else 'gpon-onu'
                onu_if = f'{onu_pfx}_{onu.frame}/{onu.slot}/{onu.port}:{onu.onu_id}'
                tc._send_command(tn, 'end')
                tc._send_command(tn, 'configure terminal')
                tc._send_command(tn, f'interface {onu_if}')
                tc._send_command(tn, cmd)
                tc._send_command(tn, 'end')
                tn.close()
                logger.info(f"[update_onu_field] CLI: '{cmd}' on {onu_if}")
        except Exception as e:
            logger.warning(f"[update_onu_field] CLI failed: {e}")

    if field == 'name':
        onu.name = value
        is_epon = (onu.card or '').lower() == 'epon'
        if is_epon:
            _send_onu_cli(olt, onu, f'property description $${value}$${onu.description or ""}')
        else:
            _send_onu_cli(olt, onu, f'name {value}')
    elif field == 'description':
        onu.description = value
        is_epon = (onu.card or '').lower() == 'epon'
        if is_epon:
            _send_onu_cli(olt, onu, f'property description $${onu.name or ""}$${value}')
        else:
            _send_onu_cli(olt, onu, f'description {value}')
    elif field == 'actual_type':
        onu.actual_type = value
    elif field == 'onu_type':
        onu.onu_type = value
        # Send CLI to OLT — re-register ONU with new type (preserves existing config)
        if olt and olt.telnet_enabled and olt.cli_username:
            try:
                from snmp_collector import create_cli_collector
                tc = create_cli_collector(olt)
                tn = tc._connect()
                if tn:
                    is_epon = (onu.card or '').lower() == 'epon'
                    olt_pfx = 'epon-olt' if is_epon else 'gpon-olt'
                    pon_if = f'{olt_pfx}_{onu.frame}/{onu.slot}/{onu.port}'
                    tc._send_command(tn, 'end')
                    tc._send_command(tn, 'configure terminal')
                    tc._send_command(tn, f'interface {pon_if}')
                    # Re-register with new type WITHOUT removing first — preserves config
                    # EPON uses 'mac' keyword, GPON uses 'sn' keyword
                    if is_epon:
                        from telnet_client import _format_epon_mac
                        tc._send_command(tn, f'onu {onu.onu_id} type {value} mac {_format_epon_mac(onu.serial_number)}')
                    else:
                        tc._send_command(tn, f'onu {onu.onu_id} type {value} sn {onu.serial_number}')
                    tc._send_command(tn, 'end')
                    tn.close()
                    logger.info(f"[update_onu_type] CLI: re-registered ONU {onu.onu_id} type={value}")
            except Exception as e:
                logger.warning(f"[update_onu_type] CLI failed: {e}")
    elif field == 'serial_number':
        onu.serial_number = value
    elif field == 'onu_id':
        try:
            new_oid = int(value)
            if 1 <= new_oid <= 128:
                onu.onu_id = new_oid
            else:
                return jsonify({'success': False, 'message': 'ONU ID must be 1–128'})
        except (ValueError, TypeError):
            return jsonify({'success': False, 'message': 'Invalid ONU ID'})
    else:
        return jsonify({'success': False, 'message': f'Unknown field: {field}'})
    db.session.commit()
    logger.info(f"[update-field] DB committed: ONU {onu_id} {field}='{value}' (verified: {getattr(onu, field, 'N/A')})")
    try:
        from cache import cache_clear
        cache_clear("dashboard:*")
        if onu.olt_id:
            cache_clear(f"olt:{onu.olt_id}:*")
    except Exception:
        pass

    log_action('onu_field_update', 'onu', target=onu.onu_id_str or str(onu.id), detail=f'{field}="{value}"')
    # Auto-save config to startup-config for fields that modify OLT running-config
    if field in ('name', 'description', 'onu_type'):
        _auto_write_config(onu.olt_id)
    return jsonify({'success': True, 'message': f'{field} updated to "{value}"'})


# Duplicate removed — using onu_wan_service_edit above


@app.route('/api/olt/<int:olt_id>/write-config', methods=['POST'])
@permission_required('settings_ip_olts')
def olt_write_config(olt_id):
    """Save OLT running-config to startup-config (write command)."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    if not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    try:
        tn = tc._connect()
        if not tn:
            return jsonify({'success': False, 'message': 'Telnet connection failed'})
        out = tc._send_command(tn, 'write', timeout=30)
        tn.close()
        if 'error' in out.lower() or '%' in out:
            return jsonify({'success': False, 'message': f'Save failed: {out.strip()[:200]}'})
        log_action('olt_write_config', 'olt', target=olt.name, detail='Saved running-config to startup')
        return jsonify({'success': True, 'message': 'Configuration saved to startup-config'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/olt/<int:olt_id>/backup-config', methods=['POST'])
@permission_required('settings_ip_olts')
def backup_olt_config(olt_id):
    """Backup OLT running configuration via Telnet."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    if not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    try:
        tn = tc._connect()
        if not tn:
            return jsonify({'success': False, 'message': 'Telnet connection failed'})
        tc._send_command(tn, 'write memory', timeout=30)
        config = tc._send_command(tn, 'show running-config', timeout=60)
        tn.close()
        if config and len(config) > 10:
            from flask import Response
            filename = f'{olt.name}_backup_{__import__("datetime").datetime.now().strftime("%Y%m%d_%H%M%S")}.cfg'
            return Response(config, mimetype='text/plain',
                          headers={'Content-Disposition': f'attachment;filename={filename}'})
        return jsonify({'success': False, 'message': 'Failed to retrieve config'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/olt/<int:olt_id>/backups', methods=['GET'])
@login_required
def list_olt_backups(olt_id):
    """List config backups for an OLT."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    backups = OLTConfigBackup.query.filter_by(olt_id=olt_id).order_by(
        OLTConfigBackup.created_at.desc()
    ).limit(50).all()
    return jsonify({
        'success': True,
        'auto_backup_enabled': olt.auto_backup_enabled,
        'auto_backup_interval': olt.auto_backup_interval,
        'auto_backup_unit': olt.auto_backup_unit,
        'auto_backup_time': olt.auto_backup_time,
        'last_backup_at': utc_iso(olt.last_backup_at),
        'backups': [{
            'id': b.id,
            'backup_type': b.backup_type,
            'status': b.status,
            'config_size': b.config_size,
            'error_message': b.error_message,
            'created_at': utc_iso(b.created_at),
        } for b in backups],
    })


@app.route('/api/olt/<int:olt_id>/backup-save', methods=['POST'])
@permission_required('settings_ip_olts')
def backup_olt_config_to_db(olt_id):
    """Backup OLT running-config and save to DB."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    if not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})
    from snmp_collector import create_cli_collector
    tc = create_cli_collector(olt)
    try:
        tn = tc._connect()
        if not tn:
            return jsonify({'success': False, 'message': 'Telnet connection failed'})
        # Save running config to startup (NVRAM) before backup
        tc._send_command(tn, 'write memory', timeout=30)
        config = tc._send_command(tn, 'show running-config', timeout=60)
        tn.close()
        if not config or len(config) < 50:
            return jsonify({'success': False, 'message': 'Failed to retrieve config'})
        backup = OLTConfigBackup(
            olt_id=olt_id,
            config_text=config,
            config_size=len(config),
            backup_type='manual',
            status='success',
        )
        db.session.add(backup)
        olt.last_backup_at = datetime.now(timezone.utc)
        db.session.commit()
        log_action('backup_olt_config', 'olt', target=olt.name, detail=f'Manual backup saved ({len(config)} bytes)')
        return jsonify({'success': True, 'message': f'Backup saved ({len(config)} bytes)', 'backup_id': backup.id})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/olt/<int:olt_id>/backup/<int:backup_id>/download', methods=['GET'])
@login_required
def download_olt_backup(olt_id, backup_id):
    """Download a specific config backup."""
    backup = db.session.get(OLTConfigBackup, backup_id)
    if not backup or backup.olt_id != olt_id:
        return jsonify({'success': False, 'message': 'Backup not found'}), 404
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    from flask import Response
    filename = f'{olt.name}_backup_{backup.created_at.strftime("%Y%m%d_%H%M%S")}.cfg'
    return Response(
        backup.config_text,
        mimetype='text/plain',
        headers={'Content-Disposition': f'attachment;filename={filename}'},
    )


@app.route('/api/olt/<int:olt_id>/backup/<int:backup_id>', methods=['DELETE'])
@permission_required('settings_ip_olts')
def delete_olt_backup(olt_id, backup_id):
    """Delete a config backup."""
    backup = db.session.get(OLTConfigBackup, backup_id)
    if not backup or backup.olt_id != olt_id:
        return jsonify({'success': False, 'message': 'Backup not found'}), 404
    db.session.delete(backup)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Backup deleted'})


@app.route('/api/olt/<int:olt_id>/auto-backup', methods=['PUT'])
@permission_required('settings_ip_olts')
def toggle_auto_backup(olt_id):
    """Toggle auto-backup settings for an OLT."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    data = request.get_json() or {}
    if 'enabled' in data:
        olt.auto_backup_enabled = bool(data['enabled'])
    if 'interval' in data:
        interval = int(data['interval'])
        if interval < 1:
            interval = 1
        olt.auto_backup_interval = interval
    if 'unit' in data:
        unit = data['unit']
        if unit not in ('hours', 'days'):
            unit = 'hours'
        olt.auto_backup_unit = unit
    if 'time' in data:
        t = str(data['time']).strip()
        if t and ':' in t:
            parts = t.split(':')
            try:
                h, m = int(parts[0]), int(parts[1])
                if 0 <= h <= 23 and 0 <= m <= 59:
                    olt.auto_backup_time = f'{h:02d}:{m:02d}'
                else:
                    olt.auto_backup_time = ''
            except (ValueError, IndexError):
                olt.auto_backup_time = ''
        else:
            olt.auto_backup_time = ''
    db.session.commit()
    detail = f'Auto-backup {"enabled" if olt.auto_backup_enabled else "disabled"}, interval={olt.auto_backup_interval}{olt.auto_backup_unit[:1]}'
    if olt.auto_backup_time:
        detail += f', time={olt.auto_backup_time}'
    log_action('toggle_auto_backup', 'olt', target=olt.name, detail=detail)
    return jsonify({
        'success': True,
        'message': f'Auto-backup {"enabled" if olt.auto_backup_enabled else "disabled"}',
        'auto_backup_enabled': olt.auto_backup_enabled,
        'auto_backup_interval': olt.auto_backup_interval,
        'auto_backup_unit': olt.auto_backup_unit,
        'auto_backup_time': olt.auto_backup_time,
    })


# ─── Cloudflare Tunnel Management ───

def _cf_config(key=None, value=None):
    """Get or set Cloudflare config in SystemConfig."""
    if key is None:
        configs = SystemConfig.query.filter(SystemConfig.key.like('cf_%')).all()
        return {c.key: c.value for c in configs}
    cfg = SystemConfig.query.filter_by(key=f'cf_{key}').first()
    if value is not None:
        if cfg:
            cfg.value = value
        else:
            cfg = SystemConfig(key=f'cf_{key}', value=value)
            db.session.add(cfg)
        db.session.commit()
    return cfg.value if cfg else ''


@app.route('/api/cloudflare/status', methods=['GET'])
@super_admin_required
def cf_status():
    """Check cloudflared installation and tunnel status."""
    import subprocess as sp
    result = {'installed': False, 'version': '', 'tunnel_running': False,
              'tunnel_id': '', 'tunnel_name': '', 'domain': '', 'configured': False}
    # Check if cloudflared is installed
    try:
        ver = sp.run(['/usr/local/bin/cloudflared', 'version'], capture_output=True, text=True, timeout=5)
        if ver.returncode != 0:
            ver = sp.run(['/usr/bin/cloudflared', 'version'], capture_output=True, text=True, timeout=5)
        if ver.returncode == 0:
            result['installed'] = True
            result['version'] = ver.stdout.strip().split('\n')[0]
    except (FileNotFoundError, sp.TimeoutExpired):
        pass
    # Check if tunnel service is running
    try:
        svc = sp.run(['/bin/bash', '-c', '/usr/bin/sudo systemctl is-active cloudflared'], capture_output=True, text=True, timeout=5)
        result['tunnel_running'] = svc.stdout.strip() == 'active'
    except (FileNotFoundError, sp.TimeoutExpired):
        pass
    # Get config from DB
    result['tunnel_id'] = _cf_config('tunnel_id')
    result['tunnel_name'] = _cf_config('tunnel_name')
    result['domain'] = _cf_config('domain')
    result['configured'] = bool(result['tunnel_id'] and result['domain'])
    return jsonify({'success': True, **result})


@app.route('/api/cloudflare/install', methods=['POST'])
@super_admin_required
def cf_install():
    """Install cloudflared on the VPS."""
    import subprocess as sp
    import os
    try:
        # Check if already installed
        cf_path = None
        for p in ['/usr/local/bin/cloudflared', '/usr/bin/cloudflared']:
            if os.path.isfile(p) and os.access(p, os.X_OK):
                cf_path = p
                break
        if cf_path:
            ver = sp.run([cf_path, 'version'], capture_output=True, text=True, timeout=5)
            return jsonify({'success': True, 'message': 'cloudflared already installed',
                            'version': ver.stdout.strip().split('\n')[0] if ver.returncode == 0 else ''})
        # Download and install
        result = sp.run(['/bin/bash', '-c',
                'curl -L --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && '
                '/usr/bin/sudo dpkg -i /tmp/cloudflared.deb && rm -f /tmp/cloudflared.deb'],
               capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            logger.error(f'cloudflared install failed: rc={result.returncode} stderr={result.stderr[:300]}')
            return jsonify({'success': False, 'message': f'Install failed: {result.stderr[:200] or result.stdout[:200]}'}), 500
        ver = sp.run(['/usr/bin/cloudflared', 'version'], capture_output=True, text=True, timeout=5)
        if ver.returncode == 0:
            return jsonify({'success': True, 'message': 'cloudflared installed successfully',
                            'version': ver.stdout.strip().split('\n')[0]})
        return jsonify({'success': False, 'message': 'Installation completed but version check failed'})
    except sp.TimeoutExpired:
        logger.error('cloudflared install timed out (120s)')
        return jsonify({'success': False, 'message': 'Install timed out — download took too long. Try again.'}), 500
    except Exception as e:
        logger.error(f'cloudflared install error: {e}')
        return jsonify({'success': False, 'message': f'Install failed: {str(e)[:200]}'}), 500


@app.route('/api/cloudflare/configure', methods=['POST'])
@super_admin_required
def cf_configure():
    """Configure Cloudflare Tunnel with token from Zero Trust dashboard."""
    data = request.get_json()
    tunnel_token = (data or {}).get('tunnel_token', '').strip()
    domain = (data or {}).get('domain', '').strip()
    tunnel_name = (data or {}).get('tunnel_name', 'salfanet-nms').strip() or 'salfanet-nms'
    if not tunnel_token:
        return jsonify({'success': False, 'message': 'Tunnel token is required'}), 400
    if not domain:
        return jsonify({'success': False, 'message': 'Domain is required'}), 400
    import subprocess as sp
    # Save config to DB
    _cf_config('tunnel_token', tunnel_token)
    _cf_config('domain', domain)
    _cf_config('tunnel_name', tunnel_name)
    # Create systemd service for cloudflared tunnel
    service_content = f"""[Unit]
Description=Cloudflare Tunnel for Salfanet NMS
After=network.target

[Service]
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate run --token {tunnel_token}
Restart=on-failure
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
"""
    try:
        # Write service file to temp (Flask runs as non-root), then sudo mv
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.service', delete=False, dir='/tmp') as tf:
            tf.write(service_content)
            tmp_path = tf.name
        sp.run(['/bin/bash', '-c', f'/usr/bin/sudo mv {tmp_path} /etc/systemd/system/cloudflared.service && /usr/bin/sudo chmod 644 /etc/systemd/system/cloudflared.service'], capture_output=True, text=True, timeout=10)
        sp.run(['/bin/bash', '-c', '/usr/bin/sudo systemctl daemon-reload'], capture_output=True, text=True, timeout=10)
        enable_r = sp.run(['/bin/bash', '-c', '/usr/bin/sudo systemctl enable cloudflared'], capture_output=True, text=True, timeout=10)
        start_r = sp.run(['/bin/bash', '-c', '/usr/bin/sudo systemctl start cloudflared'], capture_output=True, text=True, timeout=15)
        if start_r.returncode != 0:
            logger.error(f'cloudflared start failed: {start_r.stderr[:300]}')
            return jsonify({'success': False, 'message': f'Tunnel service failed to start: {start_r.stderr[:200]}'}), 500
        log_action('cf_tunnel_configure', 'system', detail=f'Tunnel configured for domain {domain}')
        return jsonify({'success': True, 'message': f'Tunnel configured and started for {domain}',
                        'domain': domain, 'tunnel_name': tunnel_name})
    except Exception as e:
        logger.error(f'cf_configure error: {e}')
        return jsonify({'success': False, 'message': f'Configuration failed: {str(e)[:200]}'}), 500


@app.route('/api/cloudflare/start', methods=['POST'])
@super_admin_required
def cf_start():
    """Start cloudflared tunnel service."""
    import subprocess as sp
    try:
        sp.run(['/bin/bash', '-c', '/usr/bin/sudo systemctl start cloudflared'], capture_output=True, text=True, timeout=15)
        log_action('cf_tunnel_start', 'system')
        return jsonify({'success': True, 'message': 'Tunnel started'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)[:200]}), 500


@app.route('/api/cloudflare/stop', methods=['POST'])
@super_admin_required
def cf_stop():
    """Stop cloudflared tunnel service."""
    import subprocess as sp
    try:
        sp.run(['/bin/bash', '-c', '/usr/bin/sudo systemctl stop cloudflared'], capture_output=True, text=True, timeout=15)
        log_action('cf_tunnel_stop', 'system')
        return jsonify({'success': True, 'message': 'Tunnel stopped'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)[:200]}), 500


@app.route('/api/cloudflare/logs', methods=['GET'])
@super_admin_required
def cf_logs():
    """Get recent cloudflared logs."""
    import subprocess as sp
    try:
        logs = sp.run(['/bin/bash', '-c', '/usr/bin/sudo journalctl -u cloudflared --no-pager -n 50'],
                      capture_output=True, text=True, timeout=10)
        return jsonify({'success': True, 'logs': logs.stdout})
    except Exception as e:
        return jsonify({'success': False, 'logs': '', 'message': str(e)[:200]})


@app.route('/api/onu/<int:onu_id>/section-config', methods=['POST'])
@permission_required('configure_onu')
def onu_section_config(onu_id):
    """Update section config (WiFi/LAN/VEIP/TR069) on OLT via Telnet.
    Uses correct ZTE C320 pon-onu-mng context commands."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    if not olt or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})
    # Every command below is ZTE C320 pon-onu-mng syntax. Running it against
    # another vendor produces confusing CLI syntax errors, so refuse up front.
    vendor = (olt.vendor or 'zte').lower()
    if vendor != 'zte':
        return jsonify({
            'success': False,
            'message': f'Section config is not supported for {vendor.upper()} OLTs. '
                       f'This feature uses ZTE C320 CLI commands.',
        }), 400
    data = request.get_json()
    section = data.get('section')
    # CLI indices are always 1-based. Frontend sends 0-based array index.
    # R-Config hardcodes tr069-mgmt index to 1, ACL starts at 1 and auto-increments.
    raw_idx = data.get('index', 0)
    action = data.get('action', 'save')
    cfg_data = data.get('data', {})
    logger.info(f"[section-config] ONU {onu_id} section='{section}' action='{action}' idx={raw_idx} data={cfg_data} by user={current_user.username}")

    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)

    try:
        tn = tc._connect()
        if not tn:
            return jsonify({'success': False, 'message': 'Telnet connection failed'})

        is_epon = (onu.card or '').lower() == 'epon'
        onu_pfx = 'epon-onu' if is_epon else 'gpon-onu'
        onu_path = f'{onu_pfx}_{onu.frame}/{onu.slot}/{onu.port}:{onu.onu_id}'
        msg = ''
        ok = False
        last_err = None

        # Errors meaning "the ONU/firmware cannot do this" rather than
        # "the operation failed" — always tolerated.
        firmware_limit_errors = ('%code 63990', 'ont return error', '%error 20202')
        # Syntax rejections — the keyword does not exist on this firmware build.
        syntax_errors = ('%error 20201', 'invalid input', 'invalid command')

        def sc(cmd, optional=False):
            """Send a command; return the error string, or None on success.

            optional=True marks firmware-dependent command variants, where a
            syntax rejection means "not supported on this build" and must not
            fail the whole request.
            """
            nonlocal last_err
            _, err = tc._send_cmd_check(tn, cmd, timeout=10)
            if not err or 'does not exist' in err.lower():
                return None
            low = err.lower()
            if any(e in low for e in firmware_limit_errors):
                logger.debug(f"ONU firmware limitation: {cmd[:60]} -> {err[:80]}")
                return err
            if optional and any(e in low for e in syntax_errors):
                logger.debug(f"Command unsupported on this firmware: {cmd[:60]} -> {err[:80]}")
                return err
            last_err = err
            return err

        if section == 'wifi':
            # Use ssid_num from payload if provided (actual SSID 1-8), else fall back to index+1
            cli_idx = int(cfg_data.get('ssid_num', raw_idx + 1))
            tc._send_command(tn, 'configure terminal', timeout=10)
            tc._send_command(tn, f'pon-onu-mng {onu_path}', timeout=10)

            if action == 'delete':
                # Remove SSID from OLT: clear name, auth, and VLAN config
                sc(f'no ssid ctrl wifi_0/{cli_idx} name', optional=True)
                sc(f'ssid auth wpa wifi_0/{cli_idx} no-auth', optional=True)
                sc(f'ssid auth wpa wifi_0/{cli_idx} encrypt none', optional=True)
                sc(f'ssid auth wpa wifi_0/{cli_idx} no-key', optional=True)
                tc._send_command(tn, f'no vlan port wifi_0/{cli_idx} mode', timeout=10)
                logger.info(f"[section-config] WiFi delete: ONU {onu_id} SSID {cli_idx} — CLI commands sent")

                # Remove SSID from DB wifi_config
                import json as _json_wdel
                existing_wifi = {}
                if onu.wifi_config:
                    try:
                        existing_wifi = _json_wdel.loads(onu.wifi_config)
                    except Exception:
                        existing_wifi = {}
                ssids_list = existing_wifi.get('ssids', [])
                ssids_list = [s for s in ssids_list if int(s.get('ssid_num', 0)) != cli_idx]
                existing_wifi['ssids'] = ssids_list
                onu.wifi_config = _json_wdel.dumps(existing_wifi)
                db.session.commit()
                logger.info(f"[section-config] WiFi delete: DB updated — {len(ssids_list)} SSIDs remaining")

                ok, msg = True, f'WiFi SSID {cli_idx} deleted'
            else:
                mode = cfg_data.get('wifiMode', 'N/A')
                status = cfg_data.get('wifiStatus', 'enable')
                new_vlan = cfg_data.get('vlan', '')
                new_priority = cfg_data.get('priority', '')

                # Enable/disable WiFi radio interface (lock = disable, unlock = enable)
                if status == 'disable':
                    sc(f'interface wifi_0/{cli_idx} state lock')
                else:
                    sc(f'interface wifi_0/{cli_idx} state unlock', optional=True)

                # Set VLAN config (only when enabled and mode is not N/A)
                if status == 'enable' and mode != 'N/A':
                    tc._send_command(tn, f'no vlan port wifi_0/{cli_idx} mode', timeout=10)
                    if mode == 'Access' and new_vlan:
                        sc(f'vlan port wifi_0/{cli_idx} mode tag vlan {new_vlan}')
                    elif mode == 'Hybrid' and new_vlan:
                        sc(f'vlan port wifi_0/{cli_idx} mode hybrid def-vlan {new_vlan}')
                    elif mode == 'Trunk':
                        sc(f'vlan port wifi_0/{cli_idx} mode trunk')
                    # Try priority as separate optional command (not all firmware supports it)
                    if new_priority and str(new_priority) != '0':
                        err = sc(f'vlan port wifi_0/{cli_idx} priority {new_priority}', optional=True)
                        logger.info(f'[WIFI] priority {new_priority} for wifi_0/{cli_idx}: {"unsupported" if err else "ok"}')
                elif mode == 'N/A' or status == 'disable':
                    tc._send_command(tn, f'no vlan port wifi_0/{cli_idx} mode', timeout=10)
                # SSID broadcast name — correct ZTE C320 pon-onu-mng syntax: 'ssid ctrl wifi_0/N name'
                ssid_name = cfg_data.get('ssid_name', '').strip().replace(' ', '_')
                if ssid_name:
                    sc(f'ssid ctrl wifi_0/{cli_idx} name {ssid_name}')

                # SSID authentication — correct ZTE C320 syntax: 'ssid auth wpa wifi_0/N ...'
                ssid_auth = cfg_data.get('ssid_auth_type', '').strip()  # 'wpa2-psk', 'wpa-psk', 'wpa-wpa2-psk', or 'open'
                ssid_pass = cfg_data.get('ssid_password', '').strip()
                if ssid_auth in ('wpa2-psk', 'wpa-psk', 'wpa-wpa2-psk') and ssid_pass:
                    sc(f'ssid auth wpa wifi_0/{cli_idx} {ssid_auth}')
                    sc(f'ssid auth wpa wifi_0/{cli_idx} encrypt aes')
                    sc(f'ssid auth wpa wifi_0/{cli_idx} key {ssid_pass}')
                elif ssid_auth == 'open':
                    # Firmware builds express "open" auth differently and reject the
                    # variants they don't implement with %Error 20201. Try them all
                    # and treat the SSID as configured if any one is accepted.
                    open_cmds = (
                        f'ssid auth wpa wifi_0/{cli_idx} no-auth',
                        f'ssid auth wpa wifi_0/{cli_idx} encrypt none',
                        f'ssid auth wpa wifi_0/{cli_idx} no-key',
                        f'ssid auth wep wifi_0/{cli_idx} open-system',
                    )
                    accepted = [c for c in open_cmds if sc(c, optional=True) is None]
                    if accepted:
                        logger.info(f'[WIFI] Open auth set for wifi_0/{cli_idx} via: {"; ".join(accepted)}')
                    else:
                        last_err = f'ONU firmware rejected all open-auth commands for wifi_0/{cli_idx}'
                        logger.warning(last_err)

                ok, msg = True, f'WiFi SSID {cli_idx} config updated'

                # Save WiFi config to database
                import json as _json_wifi
                existing_wifi = {}
                if onu.wifi_config:
                    try:
                        existing_wifi = _json_wifi.loads(onu.wifi_config)
                    except Exception:
                        existing_wifi = {}
                ssids_list = existing_wifi.get('ssids', [])
                ssid_entry = {
                    'ssid_num': cli_idx,
                    'ssid_name': ssid_name,
                    'ssid_auth_type': ssid_auth,
                    'ssid_password': ssid_pass,
                    'wifi_mode': mode,
                    'wifi_status': status,
                    'vlan': new_vlan,
                }
                found = False
                for i, s in enumerate(ssids_list):
                    if s.get('ssid_num') == cli_idx:
                        ssids_list[i] = ssid_entry
                        found = True
                        break
                if not found:
                    ssids_list.append(ssid_entry)
                existing_wifi['ssids'] = ssids_list
                onu.wifi_config = _json_wifi.dumps(existing_wifi)
                db.session.commit()
                logger.info(f"[section-config] WiFi DB saved: ONU {onu_id} SSID {cli_idx} '{ssid_name}' auth={ssid_auth} — {len(ssids_list)} SSIDs total")

        elif section == 'lan':
            cli_idx = raw_idx + 1
            tc._send_command(tn, 'configure terminal', timeout=10)
            tc._send_command(tn, f'pon-onu-mng {onu_path}', timeout=10)
            mode = cfg_data.get('lanMode', 'Access')
            status = cfg_data.get('lanStatus', 'enable')
            new_vlan = cfg_data.get('access_vlan', '')

            # ZTE C320: 'interface eth eth_0/N state lock/unlock' enters a sub-context.
            # The pon-onu-mng parser must NOT treat 'interface eth' as a section boundary.
            # VLAN config is preserved through lock/unlock — no re-apply needed.

            # Step 1: Set VLAN config if provided
            if new_vlan:
                tc._send_command(tn, f'no vlan port eth_0/{cli_idx} mode', timeout=10)
                if mode == 'Access':
                    sc(f'vlan port eth_0/{cli_idx} mode tag vlan {new_vlan}')
                elif mode == 'Trunk':
                    sc(f'vlan port eth_0/{cli_idx} mode trunk')
                elif mode == 'Hybrid':
                    sc(f'vlan port eth_0/{cli_idx} mode hybrid def-vlan {new_vlan}')

            # Step 2: Lock/Unlock (enters sub-context, exits back automatically)
            state = 'unlock' if status == 'enable' else 'lock'
            sc(f'interface eth eth_0/{cli_idx} state {state}')

            ok, msg = True, 'LAN config updated'

        elif section == 'veip':
            cli_idx = raw_idx + 1
            tc._send_command(tn, 'configure terminal', timeout=10)
            tc._send_command(tn, f'pon-onu-mng {onu_path}', timeout=10)
            mode = cfg_data.get('mode', 'hybrid').lower()
            sc(f'vlan port veip_{cli_idx} mode {mode}')
            ok, msg = True, 'VEIP config updated'

        elif section == 'tr069':
            # R-Config ALWAYS uses tr069-mgmt index 1 (hardcoded)
            cli_idx = 1
            tc._send_command(tn, 'configure terminal', timeout=10)
            tc._send_command(tn, f'pon-onu-mng {onu_path}', timeout=10)
            status = cfg_data.get('tr069Status', 'enable')
            acs_url = cfg_data.get('acs_url', '')
            username = cfg_data.get('username', '')
            password = cfg_data.get('password', '')
            vlan = cfg_data.get('vlan', '')
            priority = cfg_data.get('priority', '0')
            if status == 'disable':
                # R-Config: lock/disable TR069
                sc(f'tr069-mgmt {cli_idx} state lock')
            else:
                # R-Config: unlock → acs → tag (separate commands)
                # Note: 'state enable' is NOT valid on some ONU firmwares, only unlock/lock/disable
                sc(f'tr069-mgmt {cli_idx} state unlock')
                if acs_url:
                    acs_cmd = f'tr069-mgmt {cli_idx} acs {acs_url} validate basic'
                    if username:
                        acs_cmd += f' username {username}'
                    if password:
                        acs_cmd += f' password {password}'
                    sc(acs_cmd)
                if vlan and vlan.lower() not in ('untag', 'none', '0', ''):
                    sc(f'tr069-mgmt {cli_idx} tag pri {priority} vlan {vlan}')
                else:
                    # Remove existing tag when switching to untag mode
                    sc(f'tr069-mgmt {cli_idx} untag')
            ok, msg = True, 'TR069 config updated'

        elif section == 'acl':
            tc._send_command(tn, 'configure terminal', timeout=10)
            tc._send_command(tn, f'pon-onu-mng {onu_path}', timeout=10)
            if action == 'delete':
                # raw_idx is already 1-based acl_id from frontend
                acl_idx = raw_idx if raw_idx > 0 else 1
                tc._send_command(tn, f'no security-mgmt {acl_idx}', timeout=10)
                ok, msg = True, 'ACL rule deleted'
            else:
                # raw_idx is already 1-based acl_id from frontend
                acl_idx = raw_idx if raw_idx > 0 else 1
                # Normalize mode: frontend may send 'forward'/'block'/'allow'/'block'
                acl_mode_raw = cfg_data.get('mode', 'forward').lower()
                acl_mode = 'forward' if acl_mode_raw in ('forward', 'allow', 'permit') else 'block'
                services = cfg_data.get('service_list', 'HTTP').upper()
                svc_map = {
                    'HTTP': 'web', 'WEB': 'web', 'HTTPS': 'https',
                    'SNMP': 'snmp', 'SSH': 'ssh', 'TELNET': 'telnet',
                    'FTP': 'ftp', 'TR069': 'tr069'
                }
                protocol_parts = []
                for svc in services.split(','):
                    svc = svc.strip()
                    proto = svc_map.get(svc, svc.lower())
                    if proto:
                        protocol_parts.append(proto)
                # Build protocol string: all protocols in one command
                if not protocol_parts:
                    protocol_parts = ['web']
                proto_str = ' '.join(protocol_parts)
                cmd = f'security-mgmt {acl_idx} state enable mode {acl_mode} protocol {proto_str}'
                _, err = tc._send_cmd_check(tn, cmd, timeout=10)
                if err and ('return error' in err.lower() or '%code' in err.lower() or '%error' in err.lower()):
                    # ONU firmware doesn't support protocol parameter
                    # Fallback: simple mode without protocol
                    _, fallback_err = tc._send_cmd_check(tn, f'security-mgmt {acl_idx} state enable mode {acl_mode}', timeout=10)
                    if fallback_err and ('return error' in fallback_err.lower() or '%code' in fallback_err.lower() or '%error' in fallback_err.lower()):
                        last_err = 'ONU firmware does not support ACL/Remote Access (security-mgmt)'
                    elif fallback_err:
                        last_err = fallback_err
                elif err:
                    last_err = err
            ok, msg = True, 'ACL config updated'

        else:
            return jsonify({'success': False, 'message': f'Unknown section: {section}'})

        # Properly exit from any context back to exec mode
        # (interface wifi/eth may have entered a sub-context)
        tc._send_command(tn, 'end', timeout=10)
        tn.close()
        if last_err:
            return jsonify({'success': False, 'message': f'CLI error: {last_err}'})
        if ok:
            log_action('onu_section_config', 'onu', target=onu.onu_id_str or str(onu.id), detail=f'{section} {action}')
            # Auto-sync OLT after config change (light, SNMP-only)
            if section in ('wifi', 'lan', 'veip', 'tr069'):
                _auto_sync_olt(onu.olt_id)
        return jsonify({'success': ok, 'message': msg})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/onu/<int:onu_id>/history', methods=['GET'])
@login_required
def onu_history(onu_id):
    """Get ONU event history (last 10 events)."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    if not olt or not olt.telnet_enabled:
        return jsonify({'success': True, 'events': []})
    # EPON ONUs don't support 'show gpon onu history' — return empty
    if (onu.card or '').lower() == 'epon':
        return jsonify({'success': True, 'events': []})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    events = tc.collect_onu_history(onu.frame, onu.slot, onu.port, onu.onu_id)
    return jsonify({'success': True, 'events': events})


# ==================== TRAFFIC COUNTER CACHE ====================
# Stores previous SNMP counter readings for delta-based bandwidth calculation (fallback)
_traffic_cache = {}  # onu_id -> {'ts': timestamp, 'down': bytes, 'up': bytes}


@app.route('/api/onu/<int:onu_id>/traffic', methods=['GET'])
@login_required
def onu_traffic(onu_id):
    """Get live ONU traffic bandwidth using Total Bytes delta method (matching R-Config).

    Method: Read 'Total statistic: Input/Output: Bytes:XXX' from 'show interface gpon-onu_X/Y/Z:N',
    store previous reading, calculate delta_bytes / delta_time.

    Direction mapping for ZTE C320 GPON interface:
      - Download (user receives) = OLT Output = Output Bytes
      - Upload (user sends)     = OLT Input  = Input Bytes
    """
    import time as _time

    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    if not olt:
        return jsonify({'success': True, 'traffic': {'downstream_kbps': '0 Kbps', 'upstream_kbps': '0 Kbps'}})

    traffic = {'downstream_kbps': '0 Kbps', 'upstream_kbps': '0 Kbps'}

    if olt.telnet_enabled and olt.cli_username:
        try:
            from snmp_collector import TelnetCollector, create_cli_collector
            tc = create_cli_collector(olt)
            tn = tc._connect()
            if tn:
                is_epon = (onu.card or '').lower() == 'epon'
                onu_pfx = 'epon-onu' if is_epon else 'gpon-onu'
                iface = f'{onu_pfx}_{onu.frame}/{onu.slot}/{onu.port}:{onu.onu_id}'
                output = tc._send_command(tn, f'show interface {iface}', timeout=10)
                tn.write('exit\n')
                tn.close()

                # Parse Total Bytes: "Bytes:11028174968" (GPON) or "Bytes        :11028174968" (EPON)
                input_bytes = None
                output_bytes = None
                in_total = False
                out_total = False
                for line in output.split('\n'):
                    ls = line.strip()
                    if 'Input:' in ls and 'Total' not in ls:
                        in_total = True; out_total = False
                    elif 'Output:' in ls:
                        in_total = False; out_total = True
                    elif ls.startswith('Bytes') and ':' in ls:
                        val_str = ls.split(':', 1)[1].strip().split()[0]
                        try:
                            val = int(val_str)
                            if in_total: input_bytes = val
                            elif out_total: output_bytes = val
                        except ValueError:
                            pass

                if input_bytes is not None and output_bytes is not None:
                    now = _time.time()
                    cache_key = f'traffic_{onu_id}'
                    prev = _traffic_cache.get(cache_key)

                    if prev and prev.get('in') is not None:
                        dt = now - prev['ts']
                        if dt > 0.5:
                            delta_in = input_bytes - prev['in']
                            delta_out = output_bytes - prev['out']
                            if delta_in < 0: delta_in += 2**32
                            if delta_out < 0: delta_out += 2**32

                            in_bps = (delta_in * 8) / dt
                            out_bps = (delta_out * 8) / dt
                            traffic['upstream_kbps'] = format_speed(in_bps)
                            traffic['downstream_kbps'] = format_speed(out_bps)

                    _traffic_cache[cache_key] = {'ts': now, 'in': input_bytes, 'out': output_bytes}

                    # If no previous data, try rate lines as fallback for first reading
                    if not prev:
                        for line in output.split('\n'):
                            ls = line.strip().lower()
                            if 'input rate' in ls and 'bps' in ls:
                                m = re.search(r'input\s+rate\s*:\s*([\d.]+)\s*(bps|kbps|mbps|gbps)', ls, re.IGNORECASE)
                                if m:
                                    val = float(m.group(1)); unit = m.group(2).lower()
                                    traffic['upstream_kbps'] = format_speed(_to_bps(val, unit))
                            elif 'output rate' in ls and 'bps' in ls:
                                m = re.search(r'output\s+rate\s*:\s*([\d.]+)\s*(bps|kbps|mbps|gbps)', ls, re.IGNORECASE)
                                if m:
                                    val = float(m.group(1)); unit = m.group(2).lower()
                                    traffic['downstream_kbps'] = format_speed(_to_bps(val, unit))
        except Exception as e:
            logger.debug(f"Traffic poll failed for ONU {onu_id}: {e}")

    return jsonify({'success': True, 'traffic': traffic})


def _to_bps(val, unit):
    """Convert a value with unit to bits-per-second."""
    if unit == 'gbps':
        return val * 1_000_000_000
    elif unit == 'mbps':
        return val * 1_000_000
    elif unit == 'kbps':
        return val * 1_000
    else:  # bps = bytes per second on ZTE
        return val * 8  # convert Bytes to bits


def format_speed(bps):
    """Format bits-per-second into human-readable string."""
    if bps >= 1_000_000_000:
        return f'{bps / 1_000_000_000:.1f} Gbps'
    elif bps >= 1_000_000:
        return f'{bps / 1_000_000:.1f} Mbps'
    elif bps >= 1_000:
        return f'{bps / 1_000:.1f} Kbps'
    else:
        return f'{bps:.0f} bps'


@app.route('/api/provision/unified', methods=['POST'])
@permission_required('add_onu')
def provision_unified():
    """Unified ONU provisioning — works for all vendors with dynamic services."""
    data = request.get_json() or {}
    olt_id = data.get('olt_id')
    olt = db.session.get(OLT, olt_id) if olt_id else None
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})
    if not olt.telnet_enabled or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT CLI access not configured'})

    from snmp_collector import create_cli_collector
    tc = create_cli_collector(olt)

    frame = data.get('frame', 1)
    slot = data.get('slot', 1)
    port = data.get('port', 1)
    onu_id = data.get('onu_id', 1)
    serial = data.get('serial', '')
    onu_type = data.get('onu_type', 'All')
    tcont_profile = data.get('tcont_profile', '1G')
    traffic_profile = data.get('traffic_profile', '')
    name = data.get('name', '')
    description = data.get('description', '')
    services = data.get('services', [])
    use_veip = data.get('use_veip')  # None = auto-detect
    wifi_config = data.get('wifi_config')  # None = no wifi
    tr069_config = data.get('tr069_config')  # None = no tr069
    sla_profile = data.get('sla_profile', '')  # EPON SLA profile for speed limiting
    technician_id = data.get('technician_id')

    if wifi_config and isinstance(wifi_config, dict):
        ssids_log = wifi_config.get('ssids', [])
        logger.info(f"[provision_unified] WiFi config received: {len(ssids_log)} SSIDs")
        for s in ssids_log:
            logger.info(f"[provision_unified]   SSID {s.get('port','?')}: name='{s.get('name','')}' auth='{s.get('auth','')}' pass={'***' if s.get('pass') else '(empty)'} enabled={s.get('enabled',True)}")
    else:
        logger.info(f"[provision_unified] No WiFi config received (wifi_config={type(wifi_config).__name__})")

    if not serial:
        return jsonify({'success': False, 'message': 'Serial number required'})
    if not services:
        return jsonify({'success': False, 'message': 'At least one service required'})

    # Detect EPON from pon_port prefix or explicit is_epon flag
    pon_port = data.get('pon_port', '')
    is_epon = data.get('is_epon', False) or 'epon-olt' in pon_port or 'epon_olt' in pon_port
    # ZTE EPON universal onu-type is named 'ALL-EPON', not 'All' (GPON)
    if is_epon and onu_type.strip().upper() == 'ALL':
        onu_type = 'ALL-EPON'

    success, msg = tc.register_unified(
        frame=frame, slot=slot, port=port, onu_id=onu_id,
        serial=serial, onu_type=onu_type, tcont_profile=tcont_profile,
        services=services, use_veip=use_veip, traffic_profile=traffic_profile,
        sla_profile=sla_profile,
        wifi_config=wifi_config, tr069_config=tr069_config,
        name=name, description=description, is_epon=is_epon,
    )

    # Save to DB on success
    if success:
        # Compute onu_index matching sync format: frame*100000 + slot*10000 + port*100 + onu_id
        computed_index = frame * 100000 + slot * 10000 + port * 100 + onu_id
        existing = ONU.query.filter_by(
            olt_id=olt_id, frame=frame, slot=slot, port=port, onu_id=onu_id
        ).first()
        if not existing:
            onu = ONU(
                olt_id=olt_id, frame=frame, slot=slot, port=port,
                onu_id=onu_id, serial_number=serial,
                onu_index=computed_index,
                name=name or 'Unnamed', description=description or '',
                status='offline', actual_type=onu_type, onu_type=onu_type,
                technician_id=technician_id or None,
                card='epon' if is_epon else '',
            )
            db.session.add(onu)
            db.session.commit()

        # Trigger background sync to update status from OLT
        _auto_sync_olt(olt_id)
        # Auto-save config to startup-config so changes persist across reboots
        _auto_write_config(olt_id)
        prefix = 'epon-onu' if is_epon else 'gpon-onu'
        log_action('onu_provision', 'onu', target=f'{prefix}_{frame}/{slot}/{port}:{onu_id}', detail=f'Provisioned SN={serial} on {olt.name} as {onu_type}')

    return jsonify({'success': success, 'message': msg})


@app.route('/api/pre-register', methods=['POST'])
@permission_required('add_onu')
def pre_register_onu():
    data = request.get_json()
    olt_id = data.get('olt_id')
    olt = db.session.get(OLT, olt_id) if olt_id else None
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})

    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)

    frame = data.get('frame', 1)
    slot = data.get('slot', 1)
    port = data.get('port', 1)
    onu_id = data.get('onu_id', 1)
    onu_type = data.get('onu_type', 'All')  # Default 'All' per oltc320 reference (universal type)
    serial = data.get('serial', '')
    vlan = data.get('vlan', 100)
    tcont_profile = data.get('tcont_profile', '1G')
    name = data.get('name', '')
    description = data.get('description', '')
    configure = data.get('configure', True)
    template = data.get('template', 'bridge')  # bridge|pppoe|fiberhome_veip|zte_full|zte_single|huawei_full|zte_multi
    extra = data.get('extra', {})  # Template-specific extra config
    traffic_profile = data.get('traffic_profile', '')
    sla_profile = data.get('sla_profile', '') or extra.get('sla_profile', '')
    if traffic_profile and 'traffic_profile' not in extra:
        extra['traffic_profile'] = traffic_profile

    # Log WiFi config from extra.ssids for debugging
    ssids_raw = extra.get('ssids', [])
    if ssids_raw:
        if isinstance(ssids_raw, str):
            import json as _json_dbg
            try: ssids_dbg = _json_dbg.loads(ssids_raw)
            except: ssids_dbg = []
        else:
            ssids_dbg = ssids_raw
        logger.info(f"[pre_register] WiFi config received: {len(ssids_dbg)} SSIDs (template={template})")
        for s in ssids_dbg:
            logger.info(f"[pre_register]   SSID {s.get('port','?')}: name='{s.get('name','')}' auth='{s.get('auth','')}' pass={'***' if s.get('pass') else '(empty)'} enabled={s.get('enabled',True)}")
    else:
        logger.info(f"[pre_register] No WiFi SSIDs in extra (template={template})")
    # Detect EPON from pon_port prefix or explicit is_epon flag
    pon_port = data.get('pon_port', '')
    is_epon = data.get('is_epon', False) or 'epon-olt' in pon_port or 'epon_olt' in pon_port
    # ZTE EPON universal onu-type is named 'ALL-EPON', not 'All' (GPON)
    if is_epon and onu_type.strip().upper() == 'ALL':
        onu_type = 'ALL-EPON'

    if template and template != 'bridge':
        success, msg = tc.register_vendor_template(
            frame=frame, slot=slot, port=port, onu_id=onu_id,
            serial=serial, template=template, onu_type=onu_type,
            tcont_profile=tcont_profile, vlan=vlan,
            name=name, description=description, extra=extra, is_epon=is_epon
        )
    elif configure:
        success, msg = tc.register_and_configure(
            frame=frame, slot=slot, port=port, onu_id=onu_id,
            onu_type=onu_type, serial=serial, vlan=vlan,
            tcont_profile=tcont_profile, name=name, description=description, is_epon=is_epon,
            sla_profile=sla_profile
        )
    else:
        success, msg = tc.register_onu(
            frame=frame, slot=slot, port=port, onu_id=onu_id,
            onu_type=onu_type, serial=serial, vlan=vlan, is_epon=is_epon
        )
        if success and (name or description):
            tc.configure_onu_profile(
                frame=frame, slot=slot, port=port, onu_id=onu_id,
                tcont_profile=tcont_profile, user_vlan=vlan, service_vlan=vlan,
                name=name, description=description, is_epon=is_epon,
                sla_profile=sla_profile
            )

    if success:
        prefix = 'epon-onu' if is_epon else 'gpon-onu'
        log_action('onu_register', 'onu', target=f'{prefix}_{frame}/{slot}/{port}:{onu_id}', detail=f'Registered SN={serial} on {olt.name} as {onu_type}')
        # Save technician_id to the ONU record if provided
        technician_id = data.get('technician_id')
        if technician_id:
            onu = ONU.query.filter_by(olt_id=olt_id, frame=frame, slot=slot, port=port, onu_id=onu_id).first()
            if onu:
                onu.technician_id = technician_id
                db.session.commit()
        # Auto-save config to startup-config so changes persist across reboots
        _auto_write_config(olt_id)
    return jsonify({'success': success, 'message': msg})


@app.route('/api/scan-unconfigured', methods=['POST'])
@permission_required('add_onu')
def scan_unconfigured():
    data = request.get_json()
    olt_id = data.get('olt_id')
    olt = db.session.get(OLT, olt_id) if olt_id else None
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})

    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    unconfigured = tc.collect_unregistered_onus()

    # Get registered ONU types for matching
    reg_types = []
    try:
        reg_types_raw = tc.collect_onu_types()
        reg_types = [t.get('type_name', '') for t in reg_types_raw if t.get('type_name')]
    except Exception:
        reg_types = [t.type_name for t in ONUType.query.filter_by(olt_id=olt_id).all() if t.type_name]

    def match_onu_type(model):
        """Match scanned model to a registered ONU type.
        F670LV9.0 → F670L, HG8245H5 → HG8245H5 or HG8145V5, etc."""
        if not model or not reg_types:
            return ''
        ml = model.upper()
        # Exact match first
        for rt in reg_types:
            if rt.upper() == ml:
                return rt
        # Prefix match: F670LV9.0 → F670L (registered type is prefix of model)
        for rt in reg_types:
            if ml.startswith(rt.upper()):
                return rt
        # Suffix/partial: model contains registered type
        for rt in reg_types:
            if rt.upper() in ml:
                return rt
        # Strip version suffix: F670LV9.0 → F670LV9 → F670LV → F670L
        base = re.split(r'[V.]\d', ml)[0]
        if base and base != ml:
            for rt in reg_types:
                if rt.upper() == base or base.startswith(rt.upper()):
                    return rt
        # Fallback to 'All' (universal)
        if 'ALL' in [rt.upper() for rt in reg_types]:
            return 'All'
        return ''

    # Enrich with next available onu_id per port (oltc320 reference: get_next_available_onu_id)
    port_onu_ids = {}  # cache per port
    for onu in unconfigured:
        if 'onu_id' not in onu or not onu['onu_id']:
            pon_port = onu.get('pon_port', '')
            is_epon = onu.get('is_epon', False)
            if pon_port not in port_onu_ids:
                # Parse port: "1/1/5" → frame=1, slot=1, port=5
                parts = pon_port.split('/')
                if len(parts) == 3:
                    try:
                        next_id = tc.get_next_available_onu_id(int(parts[0]), int(parts[1]), int(parts[2]), is_epon=is_epon)
                        port_onu_ids[pon_port] = next_id or 1
                    except Exception:
                        port_onu_ids[pon_port] = 1
                else:
                    port_onu_ids[pon_port] = 1
            onu['onu_id'] = port_onu_ids[pon_port]
            port_onu_ids[pon_port] = onu['onu_id'] + 1  # next ONU on same port gets next ID

        # Match model to registered ONU type
        model = onu.get('model', '')
        onu['matched_type'] = match_onu_type(model)

    return jsonify({'success': True, 'onus': unconfigured, 'registered_types': reg_types})


# ==================== ONT PROVISIONING ====================

@app.route('/api/provision/vendors', methods=['GET'])
@login_required
def get_provision_vendors():
    """Get list of supported vendor templates for provisioning."""
    from ont_provisioner import get_available_vendors
    return jsonify({'success': True, 'vendors': get_available_vendors()})


@app.route('/api/provision/ont', methods=['POST'])
@permission_required('add_onu')
def provision_ont():
    """Provision a new ONT on OLT (cross-vendor support)."""
    data = request.get_json() or {}
    olt_id = data.get('olt_id')
    olt = db.session.get(OLT, olt_id) if olt_id else None
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})
    if not olt.telnet_enabled or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})

    from snmp_collector import TelnetCollector, create_cli_collector
    from ont_provisioner import ProvisioningConfig, provision_ont as do_provision

    tc = create_cli_collector(olt)

    config = ProvisioningConfig(
        olt_id=olt_id,
        frame=data.get('frame', 1),
        slot=data.get('slot', 1),
        port=data.get('port', 1),
        onu_id=data.get('onu_id', 0),
        serial_number=data.get('serial_number', ''),
        vendor=data.get('vendor', 'universal'),
        onu_type=data.get('onu_type', 'All'),
        name=data.get('name', ''),
        description=data.get('description', ''),
        tcont_profile=data.get('tcont_profile', '1G'),
        traffic_profile=data.get('traffic_profile', ''),
        service_vlan=data.get('service_vlan', 100),
        wan_mode=data.get('wan_mode', 'bridge'),
        wan_ip_profile=data.get('wan_ip_profile', ''),
        pppoe_username=data.get('pppoe_username', ''),
        pppoe_password=data.get('pppoe_password', ''),
        tr069_enabled=data.get('tr069_enabled', False),
        acs_url=data.get('acs_url', ''),
        acs_username=data.get('acs_username', ''),
        acs_password=data.get('acs_password', ''),
        tr069_vlan=data.get('tr069_vlan', 0),
        dry_run=data.get('dry_run', False),
    )

    result = do_provision(tc, config)

    # If successful and not dry-run, save to DB
    if result.success and not config.dry_run and result.onu_id:
        existing = ONU.query.filter_by(
            olt_id=olt_id, frame=config.frame, slot=config.slot,
            port=config.port, onu_id=result.onu_id
        ).first()
        if not existing:
            onu = ONU(
                olt_id=olt_id,
                frame=config.frame, slot=config.slot,
                port=config.port, onu_id=result.onu_id,
                serial_number=config.serial_number,
                name=config.name or 'Unnamed',
                description=config.description or '',
                status='offline',
                actual_type=config.onu_type,
                onu_type=config.onu_type,
                technician_id=data.get('technician_id') or None,
            )
            db.session.add(onu)
            db.session.commit()

    return jsonify(result.to_dict())


@app.route('/api/provision/status/<int:olt_id>/<int:frame>/<int:slot>/<int:port>/<int:onu_id>', methods=['GET'])
@login_required
def check_ont_provision_status(olt_id, frame, slot, port, onu_id):
    """Check ONT provisioning status and TR069 configuration."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})

    from snmp_collector import TelnetCollector, create_cli_collector
    from ont_provisioner import check_ont_status

    tc = create_cli_collector(olt)
    status = check_ont_status(tc, frame, slot, port, onu_id)
    return jsonify({'success': True, 'status': status})


# ==================== OLT SYNC ====================

@app.route('/api/olt/<int:olt_id>/sync', methods=['POST'])
@permission_required('settings_ip_olts')
def sync_olt(olt_id):
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})
    from sync_lock import is_sync_locked
    if is_sync_locked(olt.id):
        return jsonify({'success': False, 'message': 'Sync already in progress for this OLT'}), 409
    start_single_sync(app, olt.id)
    log_action('olt_sync', 'olt', target=olt.name, detail='Manual sync triggered')
    return jsonify({'success': True, 'message': 'Synchronization started'})


@app.route('/api/olt/sync-all', methods=['POST'])
@permission_required('settings_ip_olts')
def sync_all_olts():
    """Sync all OLTs sequentially in a background thread."""
    olts = OLT.query.all()
    if not olts:
        return jsonify({'success': False, 'message': 'No OLTs found'})

    olt_ids = [olt.id for olt in olts if olt.snmp_enabled or olt.cli_username]
    if not olt_ids:
        return jsonify({'success': False, 'message': 'No OLTs with SNMP or CLI access configured'})

    start_sync_all(app, olt_ids)
    log_action('olt_sync_all', 'olt', target='all', detail=f'Synced {len(olt_ids)} OLTs')
    return jsonify({'success': True, 'message': f'Syncing {len(olt_ids)} OLT(s)'})


@app.route('/api/olt/<int:olt_id>/sync-status', methods=['GET'])
@login_required
def sync_status(olt_id):
    sync = OLTSyncStatus.query.filter_by(olt_id=olt_id).first()
    if not sync:
        return jsonify({'status': 'idle', 'progress': 0, 'message': ''})
    return jsonify({
        'status': sync.status,
        'progress': sync.progress,
        'message': sync.message,
        'onu_count': sync.onu_count,
        'started_at': utc_iso(sync.started_at),
        'completed_at': utc_iso(sync.completed_at),
        'job_id': sync.job_id,
        'sync_type': sync.sync_type,
        'triggered_by': sync.triggered_by,
        'duration_seconds': sync.duration_seconds,
        'error_detail': sync.error_detail,
    })


@app.route('/api/olt/<int:olt_id>/sync-history', methods=['GET'])
@login_required
def sync_history(olt_id):
    """Get sync job history for an OLT."""
    from sync_job import get_sync_history
    jobs = get_sync_history(olt_id, limit=20)
    return jsonify({'jobs': [{
        'job_id': j.job_id,
        'status': j.status,
        'sync_type': j.sync_type,
        'triggered_by': j.triggered_by,
        'progress': j.progress,
        'message': j.message,
        'onu_count': j.onu_count,
        'error_detail': j.error_detail,
        'started_at': utc_iso(j.started_at),
        'completed_at': utc_iso(j.completed_at),
        'duration_seconds': j.duration_seconds,
    } for j in jobs]})


@app.route('/api/olt/<int:olt_id>/test-connection', methods=['POST'])
@permission_required('settings_ip_olts')
def test_olt_connection(olt_id):
    """Test SNMP and Telnet connections to OLT"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})

    data = request.get_json() or {}
    results = {'snmp': {'ok': False, 'message': ''}, 'telnet': {'ok': False, 'message': ''}, 'web': {'ok': False, 'message': ''}}
    both_ok = True

    ip = data.get('ip_address', olt.ip_address)

    # Test SNMP
    try:
        from snmp_collector import SNMPCollector
        collector = SNMPCollector(
            ip,
            data.get('snmp_community', olt.snmp_community),
            int(data.get('snmp_port', olt.snmp_port))
        )
        info = collector.collect_system_info()
        if info.get('description'):
            results['snmp'] = {'ok': True, 'message': f'Connected - {info["description"][:60]}'}
            import re
            ver_match = re.search(r'Version\s+([\w.]+)', info['description'])
            olt.firmware_version = ver_match.group(1) if ver_match else info['description'][:30]
            olt.snmp_status = 'connected'
        else:
            results['snmp'] = {'ok': False, 'message': 'No response from SNMP'}
            olt.snmp_status = 'disconnected'
            both_ok = False
    except Exception as e:
        results['snmp'] = {'ok': False, 'message': f'SNMP Error: {str(e)[:80]}'}
        olt.snmp_status = 'disconnected'
        both_ok = False

    # Test Telnet
    cli_user = data.get('cli_username', olt.cli_username)
    cli_pass = data.get('cli_password', olt.cli_password)
    # If password is masked ('***'), use stored password from DB
    if cli_pass and cli_pass.startswith('***'):
        cli_pass = olt.cli_password
    if cli_user and cli_pass:
        try:
            from snmp_collector import TelnetCollector, create_cli_collector
            tc = TelnetCollector(
                ip, cli_user, cli_pass,
                int(data.get('telnet_port', olt.telnet_port))
            )
            tn = tc._connect()
            if tn:
                tn.write('exit\n')
                tn.close()
                results['telnet'] = {'ok': True, 'message': 'Connected'}
                olt.telnet_status = 'connected'
            else:
                results['telnet'] = {'ok': False, 'message': 'Connection failed'}
                olt.telnet_status = 'disconnected'
                both_ok = False
        except Exception as e:
            results['telnet'] = {'ok': False, 'message': f'Telnet Error: {str(e)[:80]}'}
            olt.telnet_status = 'disconnected'
            both_ok = False
    else:
        both_ok = False

    # Test Web (HTTP Basic Auth)
    web_port = int(data.get('web_port', olt.web_port or 80))
    if cli_user and cli_pass:
        try:
            import urllib.request, base64
            url = f'http://{ip}:{web_port}/'
            req = urllib.request.Request(url, method='GET')
            cred = base64.b64encode(f'{cli_user}:{cli_pass}'.encode()).decode()
            req.add_header('Authorization', f'Basic {cred}')
            req.add_header('User-Agent', 'Mozilla/5.0')
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    results['web'] = {'ok': True, 'message': f'Connected (HTTP {resp.status})'}
                else:
                    results['web'] = {'ok': False, 'message': f'HTTP {resp.status}'}
        except urllib.error.HTTPError as e:
            if e.code == 401:
                results['web'] = {'ok': False, 'message': 'Auth failed (401)'}
            else:
                results['web'] = {'ok': False, 'message': f'HTTP {e.code}'}
        except Exception as e:
            results['web'] = {'ok': False, 'message': f'Web Error: {str(e)[:80]}'}

    # Update connection status
    if both_ok:
        olt.is_online = True
        olt.connection_status = 'connected'
    db.session.commit()
    return jsonify({'success': True, 'results': results})


@app.route('/api/olt/test-connection', methods=['POST'])
@permission_required('settings_ip_olts')
def test_new_olt_connection():
    """Test connection for a new OLT (no ID yet)"""
    data = request.get_json() or {}
    results = {'snmp': {'ok': False, 'message': ''}, 'telnet': {'ok': False, 'message': ''}, 'web': {'ok': False, 'message': ''}}

    ip = data.get('ip_address', '')
    if not ip:
        return jsonify({'success': False, 'message': 'IP address required'})

    # Test SNMP
    try:
        from snmp_collector import SNMPCollector
        collector = SNMPCollector(
            ip, data.get('snmp_community', 'public'), int(data.get('snmp_port', 161))
        )
        info = collector.collect_system_info()
        if info.get('description'):
            results['snmp'] = {'ok': True, 'message': f'Connected - {info["description"][:60]}'}
        else:
            results['snmp'] = {'ok': False, 'message': 'No response from SNMP'}
    except Exception as e:
        results['snmp'] = {'ok': False, 'message': f'SNMP Error: {str(e)[:80]}'}

    # Test Telnet
    cli_user = data.get('cli_username', '')
    cli_pass = data.get('cli_password', '')
    # Ignore masked password placeholder
    if cli_pass and cli_pass.startswith('***'):
        cli_pass = ''
    if cli_user and cli_pass:
        try:
            from snmp_collector import TelnetCollector, create_cli_collector
            tc = TelnetCollector(ip, cli_user, cli_pass, int(data.get('telnet_port', 23)))
            tn = tc._connect()
            if tn:
                tn.write('exit\n')
                tn.close()
                results['telnet'] = {'ok': True, 'message': 'Connected'}
            else:
                results['telnet'] = {'ok': False, 'message': 'Connection failed'}
        except Exception as e:
            results['telnet'] = {'ok': False, 'message': f'Telnet Error: {str(e)[:80]}'}

    # Test Web (HTTP Basic Auth)
    web_port = int(data.get('web_port', 80))
    if cli_user and cli_pass:
        try:
            import urllib.request, base64
            url = f'http://{ip}:{web_port}/'
            req = urllib.request.Request(url, method='GET')
            cred = base64.b64encode(f'{cli_user}:{cli_pass}'.encode()).decode()
            req.add_header('Authorization', f'Basic {cred}')
            req.add_header('User-Agent', 'Mozilla/5.0')
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    results['web'] = {'ok': True, 'message': f'Connected (HTTP {resp.status})'}
                else:
                    results['web'] = {'ok': False, 'message': f'HTTP {resp.status}'}
        except urllib.error.HTTPError as e:
            if e.code == 401:
                results['web'] = {'ok': False, 'message': 'Auth failed (401)'}
            else:
                results['web'] = {'ok': False, 'message': f'HTTP {e.code}'}
        except Exception as e:
            results['web'] = {'ok': False, 'message': f'Web Error: {str(e)[:80]}'}

    return jsonify({'success': True, 'results': results})




# ==================== PORT MANAGEMENT APIs ====================

@app.route('/api/olt/<int:olt_id>/uplink/<int:uplink_id>/toggle', methods=['POST'])
@permission_required('settings_ip_olts')
def toggle_uplink_port(olt_id, uplink_id):
    """Enable or disable an uplink port"""
    olt = db.session.get(OLT, olt_id)
    uplink = db.session.get(OLTUplink, uplink_id)
    if not olt or not uplink:
        return jsonify({'success': False, 'message': 'Port not found'}), 404
    data = request.get_json() or {}
    action = data.get('action', 'enable')  # 'enable' or 'disable'
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    if action == 'enable':
        success, msg = tc.enable_port(uplink.port_name)
        if success:
            uplink.admin_status = 'up'
    else:
        success, msg = tc.disable_port(uplink.port_name)
        if success:
            uplink.admin_status = 'down'
    if success:
        db.session.commit()
        log_action('uplink_toggle', 'olt', target=olt.name, detail=f'{uplink.port_name} {action}d')
    return jsonify({'success': success, 'message': msg, 'admin_status': uplink.admin_status})


@app.route('/api/olt/<int:olt_id>/uplink/<int:uplink_id>/description', methods=['POST'])
@permission_required('settings_ip_olts')
def set_uplink_description(olt_id, uplink_id):
    """Set uplink port description"""
    olt = db.session.get(OLT, olt_id)
    uplink = db.session.get(OLTUplink, uplink_id)
    if not olt or not uplink:
        return jsonify({'success': False, 'message': 'Port not found'}), 404
    data = request.get_json() or {}
    description = data.get('description', '')
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.set_port_description(uplink.port_name, description)
    if success:
        uplink.description = description
        db.session.commit()
    return jsonify({'success': success, 'message': msg})


@app.route('/api/olt/<int:olt_id>/uplinks', methods=['GET'])
@login_required
def get_uplinks(olt_id):
    """Get stored uplink port data"""
    uplinks = OLTUplink.query.filter_by(olt_id=olt_id).order_by(OLTUplink.port_number).all()
    return jsonify({'success': True, 'uplinks': [{
        'id': u.id, 'port_number': u.port_number, 'port_name': u.port_name,
        'speed': u.speed, 'duplex': u.duplex, 'medium': u.medium,
        'admin_status': u.admin_status, 'oper_status': u.oper_status,
        'line_protocol': u.line_protocol, 'description': u.description,
        'negotiation': u.negotiation, 'flowcontrol': u.flowcontrol,
        'switchport_mode': u.switchport_mode, 'vlans_tagged': u.vlans_tagged,
        'input_rate': u.input_rate, 'output_rate': u.output_rate,
        'input_utilization': u.input_utilization, 'output_utilization': u.output_utilization,
        'input_packets': u.input_packets, 'output_packets': u.output_packets,
        'input_bytes': u.input_bytes, 'output_bytes': u.output_bytes,
        'crc_errors': u.crc_errors, 'dropped': u.dropped,
        'sfp_vendor': u.sfp_vendor or '', 'sfp_serial': u.sfp_serial or '',
        'sfp_type': u.sfp_type or '', 'sfp_wavelength': u.sfp_wavelength or '',
        'sfp_connector': u.sfp_connector or '',
        'sfp_distance': u.sfp_distance or '', 'sfp_rx_power': u.sfp_rx_power or '',
        'sfp_tx_power': u.sfp_tx_power or '',
        'sfp_temperature': u.sfp_temperature or '',
        'sfp_voltage': u.sfp_voltage or '',
        'sfp_bias_current': u.sfp_bias_current or '',
        'phy_attribute': u.phy_attribute or '', 'linktrap': u.linktrap or 'enable',
        'port_protect': u.port_protect or 'disable', 'uplink_isolate': u.uplink_isolate or 'disable',
        'port_type': u.port_type or '',
        'ip_vlan_id': u.ip_vlan_id or 0,
        'ip_address': u.ip_address or '', 'ip_mask': u.ip_mask or '', 'ip_gateway': u.ip_gateway or '',
    } for u in uplinks]})


@app.route('/api/olt/<int:olt_id>/uplinks/live-traffic', methods=['GET'])
@login_required
def uplinks_live_traffic(olt_id):
    """Real-time traffic rates for all uplink ports via Telnet (called every 3s by frontend)."""
    import time as _time
    olt = db.session.get(OLT, olt_id)
    if not olt or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI'})
    uplinks = OLTUplink.query.filter_by(olt_id=olt_id).order_by(OLTUplink.port_number).all()
    if not uplinks:
        return jsonify({'success': True, 'uplinks': [], 'ts': int(_time.time())})
    port_ids = [(u.id, u.port_name) for u in uplinks if u.port_name]
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    data = tc.get_uplinks_live_traffic(port_ids)
    return jsonify({'success': True, 'uplinks': data, 'ts': int(_time.time())})


@app.route('/api/olt/<int:olt_id>/uplink/refresh', methods=['POST'])
@permission_required('settings_ip_olts')
def refresh_uplinks(olt_id):
    """Re-collect uplink port data from OLT"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    uplinks = tc.collect_uplinks()
    if not uplinks:
        return jsonify({'success': False, 'message': 'Failed to collect uplinks (Telnet connection error)'}), 500
    # Save existing IP configs before delete (keyed by port_name)
    existing = OLTUplink.query.filter_by(olt_id=olt.id).all()
    saved_ips = {}
    for u in existing:
        if u.ip_address:
            saved_ips[u.port_name] = {
                'ip_vlan_id': u.ip_vlan_id,
                'ip_address': u.ip_address,
                'ip_mask': u.ip_mask,
                'ip_gateway': u.ip_gateway,
            }
    OLTUplink.query.filter_by(olt_id=olt.id).delete()
    for i, up in enumerate(uplinks):
        port_name = up.get('port_name', '')
        # Use collected IP, or restore from saved if collect didn't detect it
        ip_vlan_id = up.get('ip_vlan_id', 0)
        ip_address = up.get('ip_address', '')
        ip_mask = up.get('ip_mask', '')
        ip_gateway = up.get('ip_gateway', '')
        if not ip_address and port_name in saved_ips:
            ip_vlan_id = saved_ips[port_name]['ip_vlan_id']
            ip_address = saved_ips[port_name]['ip_address']
            ip_mask = saved_ips[port_name]['ip_mask']
            ip_gateway = saved_ips[port_name]['ip_gateway']
        uplink = OLTUplink(olt_id=olt.id, port_number=i+1,
                           port_name=port_name,
                           speed=up.get('speed', ''),
                           duplex=up.get('duplex', 'full'),
                           medium=up.get('medium', ''),
                           admin_status=up.get('admin_status', 'up'),
                           oper_status=up.get('oper_status', 'down'),
                           line_protocol=up.get('line_protocol', 'down'),
                           description=up.get('description', ''),
                           negotiation=up.get('negotiation', 'disable'),
                           flowcontrol=up.get('flowcontrol', 'disable'),
                           switchport_mode=up.get('switchport_mode', 'trunk'),
                           vlans_tagged=up.get('vlans_tagged', ''),
                           input_rate=up.get('input_rate', '0 Bps'),
                           output_rate=up.get('output_rate', '0 Bps'),
                           input_utilization=up.get('input_utilization', '0%'),
                           output_utilization=up.get('output_utilization', '0%'),
                           input_packets=up.get('input_packets', 0),
                           output_packets=up.get('output_packets', 0),
                           input_bytes=up.get('input_bytes', 0),
                           output_bytes=up.get('output_bytes', 0),
                           crc_errors=up.get('crc_errors', 0),
                           dropped=up.get('dropped', 0),
                           sfp_vendor=up.get('sfp_vendor', ''),
                           sfp_serial=up.get('sfp_serial', ''),
                           sfp_type=up.get('sfp_type', ''),
                           sfp_wavelength=up.get('sfp_wavelength', ''),
                           sfp_connector=up.get('sfp_connector', ''),
                           sfp_distance=up.get('sfp_distance', ''),
                           sfp_rx_power=up.get('sfp_rx_power', ''),
                           sfp_tx_power=up.get('sfp_tx_power', ''),
                           sfp_temperature=up.get('sfp_temperature', ''),
                           sfp_voltage=up.get('sfp_voltage', ''),
                           sfp_bias_current=up.get('sfp_bias_current', ''),
                           phy_attribute=up.get('phy_attribute', ''),
                           linktrap=up.get('linktrap', 'enable'),
                           port_protect=up.get('port_protect', 'disable'),
                           uplink_isolate=up.get('uplink_isolate', 'disable'),
                           port_type=up.get('port_type', ''),
                           ip_vlan_id=ip_vlan_id,
                           ip_address=ip_address,
                           ip_mask=ip_mask,
                           ip_gateway=ip_gateway)
        db.session.add(uplink)
    db.session.commit()
    return jsonify({'success': True, 'count': len(uplinks)})


@app.route('/api/olt/<int:olt_id>/pon-stats/<int:slot>', methods=['GET'])
@login_required
def get_pon_port_stats(olt_id, slot):
    """Get per-port ONU stats for a PON card slot. Cached 30s."""
    from cache import cache_get, cache_set
    cache_key = f"olt:{olt_id}:pon-stats:{slot}"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    ports = tc.collect_pon_port_stats(slot)
    result = {'success': True, 'ports': ports}
    cache_set(cache_key, result, ttl=30)
    return jsonify(result)


@app.route('/api/olt/<int:olt_id>/chassis', methods=['GET'])
@login_required
def get_olt_chassis(olt_id):
    """Return chassis slot/card/port data for rack diagram visualization. Cached 30s."""
    from cache import cache_get
    cached = cache_get(f"olt:{olt_id}:chassis")
    if cached is not None:
        return jsonify(cached)
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404

    cards = OLTCard.query.filter_by(olt_id=olt_id).all()
    uplinks = OLTUplink.query.filter_by(olt_id=olt_id).all()
    onus = ONU.query.filter_by(olt_id=olt_id).all()
    fans = Fan.query.filter_by(olt_id=olt_id).all()
    pon_ports_db = OLTPort.query.filter_by(olt_id=olt_id).all()

    # Build per-port stats from ONU table (key = "slot/port", port is 1-indexed on ZTE)
    port_stats = {}
    for onu in onus:
        key = f"{onu.slot}/{onu.port}"
        if key not in port_stats:
            port_stats[key] = {'total': 0, 'online': 0, 'los': 0, 'dyinggasp': 0, 'unregistered': 0, 'rxPowers': []}
        port_stats[key]['total'] += 1
        st = (onu.status or '').lower()
        if st == 'online':
            port_stats[key]['online'] += 1
        elif st == 'los':
            port_stats[key]['los'] += 1
        elif st == 'dyinggasp':
            port_stats[key]['dyinggasp'] += 1
        if onu.rx_power is not None:
            port_stats[key]['rxPowers'].append(onu.rx_power)

    # Build olt_pon_ports lookup: {slot_idx: {port_num: {...}}}
    # port_name format: "gpon-olt_1/1/2" → slot=1, port=2 (1-indexed)
    pon_by_slot = {}
    for pp in pon_ports_db:
        parts = (pp.port_name or '').replace('gpon-olt_', '').split('/')
        try:
            sidx_p = int(parts[1]) if len(parts) >= 3 else 0
            pidx_p = int(parts[2]) if len(parts) >= 3 else pp.port_number
        except (ValueError, IndexError):
            sidx_p, pidx_p = 0, pp.port_number
        if sidx_p not in pon_by_slot:
            pon_by_slot[sidx_p] = {}
        pon_by_slot[sidx_p][pidx_p] = {
            'id': pp.id,
            'port_name': pp.port_name,
            'name': pp.name or '',
            'description': pp.description or '',
            'admin_status': pp.admin_status or 'up',
            'onu_count': pp.onu_count,
            'onu_online': pp.onu_online,
        }

    # Group uplinks by slot index (port_name like "gei_1/3/4" or "xgei_1/3/1")
    # Also build full uplink lookup by port_name for the detail panel
    uplink_by_slot = {}
    uplink_detail = {}
    for ul in uplinks:
        name = ul.port_name or ''
        stripped = name.replace('xgei_1/', '').replace('gei_1/', '')
        parts = stripped.split('/')
        if len(parts) >= 2:
            try:
                slot_idx = int(parts[0])
                port_idx = int(parts[1])
            except ValueError:
                continue
            if slot_idx not in uplink_by_slot:
                uplink_by_slot[slot_idx] = []
            is_xge = name.startswith('xgei')
            entry = {
                'id': ul.id,
                'port': port_idx,
                'iface': name,
                'onuCount': 0,
                'onlineCount': 0,
                'hasOnus': False,
                'adminStatus': ul.admin_status,
                'linkStatus': ul.oper_status,
                'speed': ul.speed,
                'duplex': ul.duplex,
                'medium': ul.medium,
                'description': ul.description or '',
                'physicalType': 'xge' if is_xge else 'ge',
                'isEnabled': (ul.admin_status or '').lower() == 'up',
                'isLinked': (ul.oper_status or '').lower() == 'up',
                'vlansTagged': ul.vlans_tagged or '',
                'inputRate': ul.input_rate or '0 Bps',
                'outputRate': ul.output_rate or '0 Bps',
                'inputUtil': ul.input_utilization or '0%',
                'outputUtil': ul.output_utilization or '0%',
                'inputBytes': ul.input_bytes or 0,
                'outputBytes': ul.output_bytes or 0,
                'sfpVendor': ul.sfp_vendor or '',
                'sfpType': ul.sfp_type or '',
                'sfpRxPower': ul.sfp_rx_power or '',
                'sfpTxPower': ul.sfp_tx_power or '',
                'sfpTemp': ul.sfp_temperature or '',
                'sfpWavelength': ul.sfp_wavelength or '',
            }
            uplink_by_slot[slot_idx].append(entry)
            uplink_detail[name] = entry

    def slot_type_for(card_type):
        ct = (card_type or '').upper()
        if ct.startswith('GTG') or ct.startswith('GTC') or ct.startswith('ETG'):
            return 'service'
        # C320 uplink: SMXA, GICF, GISF  |  C300 uplink/control: SCXN, SCXM, SCXO, HUVQ
        if ct.startswith('SMXA') or ct in ('GICF', 'GISF', 'SMXA-A', 'SMXA-B') or ct.startswith('SCX') or ct.startswith('HUVQ'):
            return 'uplink'
        if ct.startswith('MCUD') or ct.startswith('PRWH'):
            return 'mcud'
        return 'service'

    chassis = []
    for card in cards:
        stype = slot_type_for(card.card_type)
        sidx = card.slot
        if stype == 'service':
            port_count = card.total_ports or 16
            is_epon_card = (card.card_type or '').upper().startswith('ETG')
            olt_pfx = 'epon-olt' if is_epon_card else 'gpon-olt'
            # Collect actual port numbers (1-indexed on ZTE C320)
            slot_pon = pon_by_slot.get(sidx, {})
            stat_ports = {int(k.split('/')[1]) for k in port_stats if k.split('/')[0] == str(sidx)}
            db_ports = sorted(p for p in set(list(slot_pon.keys()) + list(stat_ports)) if p != 0)
            # Always include all physical ports 1..port_count, merge with any extra DB ports
            all_port_nums = sorted(set(list(range(1, port_count + 1)) + db_ports))
            ports = []
            for p in all_port_nums:
                s = port_stats.get(f"{sidx}/{p}", {})
                rx = s.get('rxPowers', [])
                meta = slot_pon.get(p, {})
                ports.append({
                    'port': p,
                    'portId': meta.get('id'),
                    'portName': meta.get('port_name', f'{olt_pfx}_1/{sidx}/{p}'),
                    'name': meta.get('name', ''),
                    'description': meta.get('description', ''),
                    'adminStatus': meta.get('admin_status', 'up'),
                    'iface': None,
                    'onuCount': s.get('total', meta.get('onu_count', 0)),
                    'onlineCount': s.get('online', meta.get('onu_online', 0)),
                    'losCount': s.get('los', 0),
                    'dyingGaspCount': s.get('dyinggasp', 0),
                    'unregisteredCount': s.get('unregistered', 0),
                    'hasOnus': s.get('total', meta.get('onu_count', 0)) > 0,
                    'avgRxPower': round(sum(rx) / len(rx), 1) if rx else None,
                })
            chassis.append({
                'index': sidx,
                'label': str(sidx),
                'type': stype,
                'present': True,
                'cardType': card.card_type,
                'cardStatus': card.status,
                'portCount': len(ports),
                'ports': ports,
                'temperature': card.temperature,
                'cpuUsage': card.cpu_usage or 0,
                'memoryUsage': card.memory_usage or 0,
            })
        elif stype == 'uplink':
            ports = sorted(uplink_by_slot.get(sidx, []), key=lambda p: p['port'])
            chassis.append({
                'index': sidx,
                'label': str(sidx),
                'type': stype,
                'present': True,
                'cardType': card.card_type,
                'cardStatus': card.status,
                'portCount': len(ports),
                'ports': ports,
                'temperature': card.temperature,
                'cpuUsage': card.cpu_usage or 0,
                'memoryUsage': card.memory_usage or 0,
            })
        else:
            chassis.append({
                'index': sidx,
                'label': str(sidx),
                'type': stype,
                'present': True,
                'cardType': card.card_type,
                'cardStatus': card.status,
                'portCount': 0,
                'ports': [],
                'temperature': card.temperature,
                'cpuUsage': card.cpu_usage or 0,
                'memoryUsage': card.memory_usage or 0,
            })

    chassis.sort(key=lambda s: s['index'])

    # Add empty slot placeholders for ZTE C320 (4 physical slots) if not in DB
    # Slots 1-2 = service (GPON), Slots 3-4 = uplink (SMXA)
    existing_indices = {s['index'] for s in chassis}
    for i in range(1, 5):
        if i not in existing_indices:
            chassis.append({
                'index': i,
                'label': str(i),
                'type': 'uplink' if i >= 3 else 'service',
                'present': False,
                'cardType': '',
                'cardStatus': '',
                'portCount': 0,
                'ports': [],
                'temperature': None,
                'cpuUsage': 0,
                'memoryUsage': 0,
            })
    chassis.sort(key=lambda s: s['index'])

    fan_list = [{'number': f.fan_number, 'status': f.status, 'rpm': f.rpm} for f in fans]
    online_fans = sum(1 for f in fans if (f.status or '').lower() in ('online', 'normal', 'running'))

    result = {
        'success': True,
        'chassis': chassis,
        'fans': fan_list,
        'fanSummary': f"{online_fans}/{len(fans)}",
    }
    from cache import cache_set
    cache_set(f"olt:{olt_id}:chassis", result, ttl=30)
    return jsonify(result)


@app.route('/api/olt/<int:olt_id>/rack', methods=['GET'])
@login_required
def get_olt_rack(olt_id):
    """Return normalized rack data for any supported OLT vendor.

    Dispatches to the appropriate vendor adapter via RackAdapterRegistry.
    Returns normalized RackData JSON that all frontend rack diagram components consume.
    """
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'supported': False, 'message': 'OLT not found'}), 404

    try:
        from olt_adapters import RackAdapterRegistry
        adapter = RackAdapterRegistry.get_adapter(olt)
        if not adapter:
            return jsonify({
                'supported': False,
                'brand': (olt.vendor or 'unknown').upper(),
                'model': olt.model,
                'message': f"Vendor '{olt.vendor}' belum didukung rack diagram",
            })

        refresh = request.args.get('refresh', 'false').lower() == 'true'
        rack_data = adapter.get_rack_data(refresh=refresh)
        return jsonify(rack_data.to_dict())

    except Exception as e:
        logger.error(f"Rack data for OLT {olt_id}: {e}")
        return jsonify({
            'supported': False,
            'brand': (olt.vendor or 'unknown').upper(),
            'model': olt.model,
            'message': str(e),
        }), 500


@app.route('/api/olt/<int:olt_id>/pon-port/<int:port_id>/toggle', methods=['POST'])
@permission_required('settings_ip_olts')
def toggle_pon_port(olt_id, port_id):
    """Enable or disable a PON port"""
    olt = db.session.get(OLT, olt_id)
    port = db.session.get(OLTPort, port_id)
    if not olt or not port:
        return jsonify({'success': False, 'message': 'Port not found'}), 404
    data = request.get_json() or {}
    enable = data.get('action', 'enable') == 'enable'
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.toggle_pon_port(port.port_name, enable)
    if success:
        port.admin_status = 'up' if enable else 'down'
        db.session.commit()
    return jsonify({'success': success, 'message': msg, 'admin_status': port.admin_status})


@app.route('/api/olt/<int:olt_id>/pon-port/<int:port_id>/edit', methods=['POST'])
@permission_required('settings_ip_olts')
def edit_pon_port(olt_id, port_id):
    """Edit PON port name and description"""
    olt = db.session.get(OLT, olt_id)
    port = db.session.get(OLTPort, port_id)
    if not olt or not port:
        return jsonify({'success': False, 'message': 'Port not found'}), 404
    data = request.get_json() or {}
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    if 'name' in data:
        success, msg = tc.set_pon_port_name(port.port_name, data['name'])
        if success:
            port.name = data['name']
    if 'description' in data:
        success, msg = tc.set_pon_port_description(port.port_name, data['description'])
        if success:
            port.description = data['description']
    db.session.commit()
    return jsonify({'success': True, 'message': 'PON port updated'})


@app.route('/api/olt/<int:olt_id>/pon-port/<int:port_id>/optical', methods=['GET'])
@login_required
def get_pon_port_optical(olt_id, port_id):
    """Get optical module info for a single PON port via Telnet (live data)."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    port = db.session.get(OLTPort, port_id)
    if not port or port.olt_id != olt_id:
        return jsonify({'success': False, 'message': 'Port not found'}), 404

    sfp = {}
    try:
        from snmp_collector import TelnetCollector, create_cli_collector
        tc = create_cli_collector(olt)
        tn = tc._connect()
        if tn:
            try:
                opt_out = tc._send_command(tn, f'show interface optical-module-info {port.port_name}', timeout=10)
                if opt_out and '%Error' not in opt_out and 'Optical module' in opt_out:
                    import re as _re
                    def _clean_sfp(v):
                        v = _re.sub(r'\s*\([^)]*\)\s*', '', v).strip()
                        v = _re.sub(r'\(dbm\)', '', v, flags=_re.IGNORECASE).strip()
                        v = _re.sub(r'\(km\)', '', v, flags=_re.IGNORECASE).strip()
                        v = _re.sub(r'\(v\)', '', v, flags=_re.IGNORECASE).strip()
                        v = _re.sub(r'\(ma\)', '', v, flags=_re.IGNORECASE).strip()
                        v = _re.sub(r'\(c\)', '', v, flags=_re.IGNORECASE).strip()
                        v = _re.sub(r'\(nm\)', '', v, flags=_re.IGNORECASE).strip()
                        return v.strip()
                    for line in opt_out.split('\n'):
                        ls = line.strip()
                        if not ls:
                            continue
                        pairs = _re.findall(r'(\S+(?:-\S+)*)\s*:\s*(.+?)(?:\s{2,}|\s*$)', ls)
                        for key, val in pairs:
                            key = key.strip().lower()
                            val = _clean_sfp(val.strip())
                            if not val or val == 'N/A':
                                continue
                            if 'vendor-name' in key: sfp['vendor'] = val
                            elif 'vendor-pn' in key: sfp['type'] = val
                            elif 'vendor-sn' in key: sfp['serial'] = val
                            elif 'wavelength' in key: sfp['wavelength'] = val
                            elif 'connector' in key: sfp['connector'] = val
                            elif 'trans-distance' in key: sfp['distance'] = val
                            elif 'rxpower' in key and 'upper' not in key and 'lower' not in key: sfp['rx_power'] = val
                            elif 'txpower' in key and 'upper' not in key and 'lower' not in key: sfp['tx_power'] = val
                            elif 'txbias' in key: sfp['bias_current'] = val
                            elif 'temperature' in key and 'upper' not in key and 'lower' not in key: sfp['temperature'] = val
                            elif 'supply-vol' in key: sfp['voltage'] = val
            finally:
                tn.write('exit\n'); tn.close()
    except Exception as e:
        logger.debug(f'PON port optical {port.port_name}: {e}')

    return jsonify({'success': True, 'optical': sfp})


@app.route('/api/olt/<int:olt_id>/pon-ports', methods=['GET'])
@login_required
def get_pon_ports(olt_id):
    """Get all PON ports for an OLT with optical module data via Telnet.
    Generates placeholder entries from OLTCard table for service cards
    (GTG/ETG) that have no OLTPort entries yet."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'ports': []})
    ports = OLTPort.query.filter_by(olt_id=olt_id).order_by(OLTPort.port_number).all()

    # Build placeholder ports from OLTCard table for service cards without OLTPort entries
    existing_names = {p.port_name for p in ports}
    cards = OLTCard.query.filter_by(olt_id=olt_id).all()
    placeholder_ports = []
    for card in cards:
        ct = (card.card_type or '').upper()
        if ct.startswith('GTG') or ct.startswith('GTC') or ct.startswith('ETG'):
            is_epon = ct.startswith('ETG')
            olt_pfx = 'epon-olt' if is_epon else 'gpon-olt'
            port_count = card.total_ports or 16
            for pnum in range(1, port_count + 1):
                pname = f'{olt_pfx}_1/{card.slot}/{pnum}'
                if pname not in existing_names:
                    placeholder_ports.append({
                        'id': None,
                        'port_number': pnum,
                        'port_name': pname,
                        'admin_status': 'up',
                        'name': '',
                        'description': '',
                        'linktrap': 'disable',
                        'onu_count': 0,
                        'onu_online': 0,
                        'onu_offline': 0,
                        'card_type': card.card_type,
                        'card_slot': card.slot,
                        'is_placeholder': True,
                    })

    # Sort placeholder ports by slot then port number
    placeholder_ports.sort(key=lambda p: (p.get('card_slot', 0), p['port_number']))

    # Collect optical module info via Telnet for all ports (DB + placeholders)
    optical_data = {}
    all_port_names = [p.port_name for p in ports] + [pp['port_name'] for pp in placeholder_ports]
    try:
        from snmp_collector import TelnetCollector, create_cli_collector
        tc = create_cli_collector(olt)
        tn = tc._connect()
        if tn:
            for pname in all_port_names:
                try:
                    opt_out = tc._send_command(tn, f'show interface optical-module-info {pname}', timeout=10)
                    if '%Error' not in opt_out and 'Optical module' in opt_out:
                        sfp = {}
                        import re as _re3
                        def _clean_sfp(v):
                            v = _re3.sub(r'\s*\([^)]*\)\s*', '', v).strip()
                            v = _re3.sub(r'\(dbm\)', '', v, flags=_re3.IGNORECASE).strip()
                            v = _re3.sub(r'\(km\)', '', v, flags=_re3.IGNORECASE).strip()
                            v = _re3.sub(r'\(v\)', '', v, flags=_re3.IGNORECASE).strip()
                            v = _re3.sub(r'\(ma\)', '', v, flags=_re3.IGNORECASE).strip()
                            v = _re3.sub(r'\(c\)', '', v, flags=_re3.IGNORECASE).strip()
                            v = _re3.sub(r'\(nm\)', '', v, flags=_re3.IGNORECASE).strip()
                            return v.strip()
                        for line in opt_out.split('\n'):
                            ls = line.strip()
                            if not ls: continue
                            pairs = _re3.findall(r'(\S+(?:-\S+)*)\s*:\s*(.+?)(?:\s{2,}|\s*$)', ls)
                            for key, val in pairs:
                                key = key.strip().lower()
                                val = _clean_sfp(val.strip())
                                if not val or val == 'N/A': continue
                                if 'vendor-name' in key: sfp['vendor'] = val
                                elif 'vendor-pn' in key: sfp['type'] = val
                                elif 'vendor-sn' in key: sfp['serial'] = val
                                elif 'wavelength' in key: sfp['wavelength'] = val
                                elif 'connector' in key: sfp['connector'] = val
                                elif 'trans-distance' in key: sfp['distance'] = val
                                elif 'rxpower' in key and 'upper' not in key and 'lower' not in key: sfp['rx_power'] = val
                                elif 'txpower' in key and 'upper' not in key and 'lower' not in key: sfp['tx_power'] = val
                                elif 'txbias' in key: sfp['bias_current'] = val
                                elif 'temperature' in key and 'upper' not in key and 'lower' not in key: sfp['temperature'] = val
                                elif 'supply-vol' in key: sfp['voltage'] = val
                        if sfp:
                            optical_data[pname] = sfp
                except Exception as e:
                    logger.debug(f'PON optical {pname}: {e}')
            if not placeholder_ports:
                tn.write('exit\n'); tn.close()
                tn = None
    except Exception as e:
        logger.debug(f'PON optical Telnet: {e}')
        tn = None

    # Also collect ONU state counts for placeholder ports via Telnet
    placeholder_onu_counts = {}
    if placeholder_ports:
        try:
            if not tn:
                tn = tc._connect()
            if tn:
                for pp in placeholder_ports:
                    pname = pp['port_name']
                    is_epon = pname.startswith('epon-olt')
                    onu_cmd = 'show epon onu state' if is_epon else 'show gpon onu state'
                    try:
                        out = tc._send_command(tn, f'{onu_cmd} {pname}', timeout=10)
                        total = online = offline = 0
                        for line in out.split('\n'):
                            line = line.strip()
                            if not line or '---' in line or line.startswith('OnuIndex') or line.startswith('ONU'): continue
                            parts = line.split()
                            if len(parts) < 4 or '/' not in parts[0] or ':' not in parts[0]: continue
                            if is_epon:
                                import re as _re4
                                if not _re4.match(r'^epon-onu_\d+/\d+/\d+:\d+$', parts[0]): continue
                                total += 1
                                status_word = parts[1].lower() if len(parts) > 1 else ''
                                if 'online' in status_word: online += 1
                                else: offline += 1
                            else:
                                import re as _re4
                                if not _re4.match(r'^\d+/\d+/\d+:\d+$', parts[0]): continue
                                total += 1
                                phase = parts[3].lower() if len(parts) > 3 else ''
                                if 'working' in phase: online += 1
                                else: offline += 1
                        placeholder_onu_counts[pname] = {'onu_count': total, 'onu_online': online, 'onu_offline': offline}
                    except Exception as e:
                        logger.debug(f'Placeholder ONU state {pname}: {e}')
                try: tn.write('exit\n'); tn.close()
                except: pass
        except Exception as e:
            logger.debug(f'Placeholder ONU state Telnet: {e}')

    # Merge ONU counts into placeholder ports
    for pp in placeholder_ports:
        counts = placeholder_onu_counts.get(pp['port_name'])
        if counts:
            pp['onu_count'] = counts['onu_count']
            pp['onu_online'] = counts['onu_online']
            pp['onu_offline'] = counts['onu_offline']

    return jsonify({
        'success': True,
        'ports': [{
            'id': p.id, 'port_number': p.port_number, 'port_name': p.port_name,
            'admin_status': p.admin_status, 'name': p.name, 'description': p.description,
            'linktrap': p.linktrap, 'onu_count': p.onu_count,
            'onu_online': p.onu_online, 'onu_offline': p.onu_offline,
            'card_type': '',
            'is_placeholder': False,
            **optical_data.get(p.port_name, {}),
        } for p in ports] + [
            {**pp, **optical_data.get(pp['port_name'], {})}
            for pp in placeholder_ports
        ]
    })


@app.route('/api/olt/<int:olt_id>/uplink/<int:uplink_id>/configure', methods=['POST'])
@permission_required('settings_ip_olts')
def configure_uplink_port(olt_id, uplink_id):
    """Apply port configuration changes (speed, duplex, negotiation, flowcontrol, description)"""
    olt = db.session.get(OLT, olt_id)
    uplink = db.session.get(OLTUplink, uplink_id)
    if not olt or not uplink:
        return jsonify({'success': False, 'message': 'Port not found'}), 404
    data = request.get_json() or {}
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.configure_port(
        uplink.port_name,
        speed=data.get('speed'),
        duplex=data.get('duplex'),
        negotiation=data.get('negotiation'),
        flowcontrol=data.get('flowcontrol'),
        description=data.get('description'),
    )
    if success:
        if 'speed' in data and data['speed']:
            spd = data['speed']
            if spd == '10000': uplink.speed = '10G'
            elif spd == '1000': uplink.speed = '1G'
            elif spd == '100': uplink.speed = '100M'
            else: uplink.speed = spd
        if 'duplex' in data and data['duplex']:
            uplink.duplex = data['duplex']
        if 'negotiation' in data and data['negotiation']:
            uplink.negotiation = data['negotiation']
        if 'flowcontrol' in data and data['flowcontrol']:
            uplink.flowcontrol = data['flowcontrol']
        if 'description' in data:
            uplink.description = data.get('description', '')
        db.session.commit()
    return jsonify({'success': success, 'message': msg})


@app.route('/api/olt/<int:olt_id>/uplink/<int:uplink_id>/ip', methods=['POST'])
@permission_required('settings_ip_olts')
def set_uplink_ip(olt_id, uplink_id):
    """Set or remove IP address on a VLAN interface (SVI) tagged on an uplink port."""
    olt = db.session.get(OLT, olt_id)
    uplink = db.session.get(OLTUplink, uplink_id)
    if not olt or not uplink:
        return jsonify({'success': False, 'message': 'Port not found'}), 404
    data = request.get_json() or {}
    vlan_id = data.get('ip_vlan_id', 0)
    ip_address = data.get('ip_address', '').strip()
    ip_mask = data.get('ip_mask', '').strip()
    gateway = data.get('ip_gateway', '').strip() or None
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.set_uplink_ip(uplink.port_name, vlan_id, ip_address, ip_mask, gateway)
    if success:
        uplink.ip_vlan_id = vlan_id if ip_address else 0
        uplink.ip_address = ip_address
        uplink.ip_mask = ip_mask
        uplink.ip_gateway = gateway or ''
        db.session.commit()
    return jsonify({'success': success, 'message': msg})


@app.route('/api/olt/<int:olt_id>/vlans', methods=['GET'])
@login_required
def get_olt_vlans(olt_id):
    """Get VLAN list from OLT for dropdown selection. Cached 5 min (static config)."""
    from cache import cache_get, cache_set
    cache_key = f"olt:{olt_id}:vlans"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'vlans': []})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    vlans = tc.collect_vlans()
    result = {'success': True, 'vlans': vlans}
    cache_set(cache_key, result, ttl=300)
    return jsonify(result)


@app.route('/api/olt/<int:olt_id>/speed-profiles', methods=['GET'])
@login_required
def get_olt_speed_profiles(olt_id):
    """Get TCONT, Traffic, and WAN IP profile names from DB. Cached 60s."""
    from cache import cache_get, cache_set
    cache_key = f"olt:{olt_id}:speed-profiles"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)
    tcont = [p.name for p in SpeedProfile.query.filter_by(olt_id=olt_id, profile_type='tcont').order_by(SpeedProfile.name).all()]
    traffic = [p.name for p in SpeedProfile.query.filter_by(olt_id=olt_id, profile_type='traffic').order_by(SpeedProfile.name).all()]
    wan_ip = []
    for p in WanIpProfile.query.filter_by(olt_id=olt_id).order_by(WanIpProfile.name).all():
        cvlan = ''
        if p.dns1 and p.dns1.startswith('cvlan:'):
            cvlan = p.dns1.replace('cvlan:', '')
        wan_ip.append({'name': p.name, 'ip_address': p.ip_address or '', 'cvlan': cvlan})
    result = {'success': True, 'tcont': tcont, 'traffic': traffic, 'wan_ip_profiles': wan_ip}
    cache_set(cache_key, result, ttl=60)
    return jsonify(result)


@app.route('/api/olt/<int:olt_id>/speed-profiles-full', methods=['GET'])
@login_required
def get_olt_speed_profiles_full(olt_id):
    """Get full speed profiles from DB with all fields. Cached 60s.
    Also auto-syncs EPON SLA profiles from OLT if CLI is enabled."""
    # --- AUTO-SYNC EPON SLA PROFILES ---
    olt = db.session.get(OLT, olt_id) if olt_id else None
    if olt and olt.telnet_enabled and olt.cli_username:
        try:
            from snmp_collector import create_cli_collector
            tc = create_cli_collector(olt)
            tn = tc._connect()
            if tn:
                tc._send_command(tn, 'configure terminal', timeout=5)
                tc._send_command(tn, 'epon', timeout=5)
                out = tc._send_command(tn, 'show onu-profile sla', timeout=10)
                tc._send_command(tn, 'end', timeout=5)
                tn.close()

                import re
                if 'Profile name' in out:
                    SpeedProfile.query.filter_by(olt_id=olt_id, profile_type='sla').delete()

                    blocks = re.split(r'Profile name:\s*', out, flags=re.IGNORECASE)
                    for block in blocks[1:]:
                        lines = block.strip().split('\n')
                        if not lines: continue

                        name = lines[0].strip()
                        up_cir = '0'; up_pir = '0'
                        down_cir = '0'; down_pir = '0'

                        for line in lines[1:]:
                            line_lower = line.lower()
                            if 'upstream' in line_lower:
                                cm = re.search(r'cir:\s*(\d+)', line_lower)
                                pm = re.search(r'pir:\s*(\d+)', line_lower)
                                if cm: up_cir = cm.group(1)
                                if pm: up_pir = pm.group(1)
                            elif 'downstream' in line_lower:
                                cm = re.search(r'cir:\s*(\d+)', line_lower)
                                pm = re.search(r'pir:\s*(\d+)', line_lower)
                                if cm: down_cir = cm.group(1)
                                if pm: down_pir = pm.group(1)

                        db.session.add(SpeedProfile(
                            olt_id=olt_id, profile_type='sla', name=name,
                            sir=up_cir, pir=up_pir, assured_bandwidth=down_cir, max_bandwidth=down_pir
                        ))
                    db.session.commit()
        except Exception as e:
            db.session.rollback()
    # --- END: AUTO-SYNC EPON SLA PROFILES ---

    from cache import cache_get, cache_set
    cache_key = f"olt:{olt_id}:speed-profiles-full"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)
    profiles = SpeedProfile.query.filter_by(olt_id=olt_id).order_by(SpeedProfile.profile_type, SpeedProfile.name).all()
    result = {'success': True, 'speed_profiles': [{
        'id': p.id, 'profile_type': p.profile_type, 'name': p.name,
        'type_val': p.type_val or '', 'fixed_bandwidth': p.fixed_bandwidth or '0',
        'assured_bandwidth': p.assured_bandwidth or '0', 'max_bandwidth': p.max_bandwidth or '0',
        'sir': p.sir or '', 'pir': p.pir or '',
    } for p in profiles]}
    cache_set(cache_key, result, ttl=60)
    return jsonify(result)

@app.route('/api/olt/<int:olt_id>/uplink/<int:uplink_id>/vlan', methods=['POST'])
@permission_required('settings_ip_olts')
def set_uplink_vlan(olt_id, uplink_id):
    """Set VLAN trunk configuration on a port"""
    olt = db.session.get(OLT, olt_id)
    uplink = db.session.get(OLTUplink, uplink_id)
    if not olt or not uplink:
        return jsonify({'success': False, 'message': 'Port not found'}), 404
    data = request.get_json() or {}
    vlan_ids = data.get('vlan_ids', [])
    mode = data.get('mode', 'trunk')
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.set_vlan_trunk(uplink.port_name, vlan_ids, mode)
    if success:
        uplink.switchport_mode = mode
        uplink.vlans_tagged = ','.join(vlan_ids)
        db.session.commit()
    return jsonify({'success': success, 'message': msg})


@app.route('/api/olt/<int:olt_id>/uplink/<int:uplink_id>/vlan/remove', methods=['POST'])
@permission_required('settings_ip_olts')
def remove_uplink_vlan(olt_id, uplink_id):
    """Remove specific VLAN IDs from a port trunk"""
    olt = db.session.get(OLT, olt_id)
    uplink = db.session.get(OLTUplink, uplink_id)
    if not olt or not uplink:
        return jsonify({'success': False, 'message': 'Port not found'}), 404
    data = request.get_json() or {}
    vlan_ids = data.get('vlan_ids', [])
    if not vlan_ids:
        return jsonify({'success': False, 'message': 'No VLAN IDs specified'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.remove_vlan_from_port(uplink.port_name, vlan_ids)
    if success:
        # Update local DB: remove those VLANs from vlans_tagged
        current = uplink.vlans_tagged.split(',') if uplink.vlans_tagged else []
        remaining = [v.strip() for v in current if v.strip() and v.strip() not in vlan_ids]
        uplink.vlans_tagged = ','.join(remaining)
        db.session.commit()
    return jsonify({'success': success, 'message': msg})


# ==================== VLAN & ONU TYPE MANAGEMENT APIs ====================

@app.route('/api/olt/<int:olt_id>/vlan/create', methods=['POST'])
@permission_required('settings_ip_olts')
def create_vlan(olt_id):
    """Create a new VLAN"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    data = request.get_json() or {}
    vlan_id = data.get('vlan_id')
    vlan_name = data.get('name', '')
    if not vlan_id:
        return jsonify({'success': False, 'message': 'VLAN ID is required'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.create_vlan(int(vlan_id), vlan_name)
    if success:
        existing = ONUVlan.query.filter_by(olt_id=olt_id, vlan_id=int(vlan_id)).first()
        if not existing:
            vlan = ONUVlan(olt_id=olt_id, vlan_id=int(vlan_id), vlan_name=vlan_name or f'VLAN{vlan_id}', vlan_type='L2')
            db.session.add(vlan)
            db.session.commit()
    if success:
        log_action('vlan_create', 'olt', target=olt.name, detail=f'VLAN {vlan_id} ({vlan_name})')
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:vlans")
            cache_clear(f"olt:{olt_id}:vlans-db")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


@app.route('/api/olt/<int:olt_id>/vlan/<int:vlan_id>/rename', methods=['POST'])
@permission_required('settings_ip_olts')
def rename_vlan(olt_id, vlan_id):
    """Rename a VLAN"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    data = request.get_json() or {}
    new_name = data.get('name', '')
    if not new_name:
        return jsonify({'success': False, 'message': 'Name is required'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.rename_vlan(vlan_id, new_name)
    if success:
        vlan = ONUVlan.query.filter_by(olt_id=olt_id, vlan_id=vlan_id).first()
        if vlan:
            vlan.vlan_name = new_name
            db.session.commit()
        log_action('vlan_rename', 'olt', target=olt.name, detail=f'VLAN {vlan_id} -> {new_name}')
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:vlans")
            cache_clear(f"olt:{olt_id}:vlans-db")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


@app.route('/api/olt/<int:olt_id>/vlan/<int:vlan_id>/delete', methods=['POST'])
@permission_required('settings_ip_olts')
def delete_vlan(olt_id, vlan_id):
    """Delete a VLAN"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.delete_vlan(vlan_id)
    if success:
        vlan = ONUVlan.query.filter_by(olt_id=olt_id, vlan_id=vlan_id).first()
        if vlan:
            db.session.delete(vlan)
            db.session.commit()
        log_action('vlan_delete', 'olt', target=olt.name, detail=f'VLAN {vlan_id}')
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:vlans")
            cache_clear(f"olt:{olt_id}:vlans-db")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


@app.route('/api/olt/<int:olt_id>/onu-type/add', methods=['POST'])
@permission_required('settings_ip_olts')
def add_onu_type(olt_id):
    """Add a new ONU type"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    data = request.get_json() or {}
    type_name = data.get('type_name', '')
    if not type_name:
        return jsonify({'success': False, 'message': 'Type name is required'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    interfaces = data.get('interfaces', [])
    if isinstance(interfaces, str):
        interfaces = [i.strip() for i in interfaces.split(',') if i.strip()]
    success, msg = tc.add_onu_type(
        type_name,
        pon_type=data.get('pon_type', 'gpon'),
        description=data.get('description', ''),
        max_tcont=int(data.get('max_tcont', 8) or 8),
        max_gem=int(data.get('max_gem', 32) or 32),
        max_switch=int(data.get('max_switch', 8) or 8),
        max_flow=int(data.get('max_flow', 32) or 32),
        max_ip_host=int(data.get('max_ip_host', 5) or 5),
        interfaces=interfaces,
    )
    if success:
        otype = ONUType(
            olt_id=olt_id, type_name=type_name,
            pon_type=data.get('pon_type', 'gpon'),
            description=data.get('description', ''),
            max_tcont=int(data.get('max_tcont', 8) or 8),
            max_gem=int(data.get('max_gem', 32) or 32),
            max_switch=int(data.get('max_switch', 8) or 8),
            max_flow=int(data.get('max_flow', 32) or 32),
            max_ip_host=int(data.get('max_ip_host', 5) or 5),
            max_veip=int(data.get('max_veip', 0) or 0),
            interfaces=','.join(interfaces) if interfaces else '',
        )
        db.session.add(otype)
        db.session.commit()
        log_action('onu_type_create', 'olt', target=olt.name, detail=f'Type {type_name}')
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:onu-types")
            cache_clear(f"olt:{olt_id}:onu-types-full")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


@app.route('/api/olt/<int:olt_id>/onu-type/<int:type_id>/delete', methods=['POST'])
@permission_required('settings_ip_olts')
def delete_onu_type(olt_id, type_id):
    """Delete an ONU type"""
    olt = db.session.get(OLT, olt_id)
    otype = db.session.get(ONUType, type_id)
    if not olt or not otype:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.delete_onu_type(otype.type_name)
    if success:
        db.session.delete(otype)
        db.session.commit()
        log_action('onu_type_delete', 'olt', target=olt.name, detail=f'Type {otype.type_name}')
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:onu-types")
            cache_clear(f"olt:{olt_id}:onu-types-full")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


# ==================== SPEED PROFILE & WAN IP MANAGEMENT APIs ====================

@app.route('/api/olt/<int:olt_id>/tcont/add', methods=['POST'])
@permission_required('settings_ip_olts')
def add_tcont_profile(olt_id):
    """Add a new TCONT profile"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'Profile name is required'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.create_tcont_profile(
        name,
        tcont_type=data.get('type_val', '4'),
        max_bw=data.get('max_bandwidth', '0'),
    )
    if success:
        profile = SpeedProfile(
            olt_id=olt_id, profile_type='tcont', name=name,
            type_val=data.get('type_val', '4'),
            fixed_bandwidth=data.get('fixed_bandwidth', '0'),
            assured_bandwidth=data.get('assured_bandwidth', '0'),
            max_bandwidth=data.get('max_bandwidth', '0'),
        )
        db.session.add(profile)
        db.session.commit()
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:speed-profiles")
            cache_clear(f"olt:{olt_id}:speed-profiles-full")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


@app.route('/api/olt/<int:olt_id>/tcont/<int:profile_id>/delete', methods=['POST'])
@permission_required('settings_ip_olts')
def delete_tcont_profile(olt_id, profile_id):
    """Delete a TCONT profile"""
    olt = db.session.get(OLT, olt_id)
    profile = db.session.get(SpeedProfile, profile_id)
    if not olt or not profile:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.delete_tcont_profile(profile.name)
    if success:
        db.session.delete(profile)
        db.session.commit()
        log_action('tcont_delete', 'olt', target=olt.name, detail=f'Profile {profile.name}')
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:speed-profiles")
            cache_clear(f"olt:{olt_id}:speed-profiles-full")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


@app.route('/api/olt/<int:olt_id>/traffic/add', methods=['POST'])
@permission_required('settings_ip_olts')
def add_traffic_profile(olt_id):
    """Add a new Traffic profile"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'Profile name is required'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.create_traffic_profile(
        name,
        sir=data.get('sir', '0'),
        pir=data.get('pir', '0'),
    )
    if success:
        profile = SpeedProfile(
            olt_id=olt_id, profile_type='traffic', name=name,
            sir=data.get('sir', '0'),
            pir=data.get('pir', '0'),
        )
        db.session.add(profile)
        db.session.commit()
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:speed-profiles")
            cache_clear(f"olt:{olt_id}:speed-profiles-full")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


@app.route('/api/olt/<int:olt_id>/traffic/<int:profile_id>/delete', methods=['POST'])
@permission_required('settings_ip_olts')
def delete_traffic_profile(olt_id, profile_id):
    """Delete a Traffic profile"""
    olt = db.session.get(OLT, olt_id)
    profile = db.session.get(SpeedProfile, profile_id)
    if not olt or not profile:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.delete_traffic_profile(profile.name)
    if success:
        db.session.delete(profile)
        db.session.commit()
        log_action('traffic_profile_delete', 'olt', target=olt.name, detail=f'Profile {profile.name}')
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:speed-profiles")
            cache_clear(f"olt:{olt_id}:speed-profiles-full")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


@app.route('/api/olt/<int:olt_id>/wan-ip/add', methods=['POST'])
@permission_required('settings_ip_olts')
def add_wan_ip_profile(olt_id):
    """Add a new WAN IP profile"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'Profile name is required'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.create_wan_ip_profile(
        name,
        ip_address=data.get('ip_address', ''),
        netmask=data.get('netmask', ''),
        gateway=data.get('gateway', ''),
        dns1=data.get('dns1', ''),
        dns2=data.get('dns2', ''),
    )
    if success:
        profile = WanIpProfile(
            olt_id=olt_id, name=name,
            ip_address=data.get('ip_address', ''),
            netmask=data.get('netmask', ''),
            gateway=data.get('gateway', ''),
            dns1=data.get('dns1', ''),
            dns2=data.get('dns2', ''),
        )
        db.session.add(profile)
        db.session.commit()
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:speed-profiles")
            cache_clear(f"olt:{olt_id}:wan-ip-profiles")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


@app.route('/api/olt/<int:olt_id>/wan-ip/<int:profile_id>/delete', methods=['POST'])
@permission_required('settings_ip_olts')
def delete_wan_ip_profile(olt_id, profile_id):
    """Delete a WAN IP profile"""
    olt = db.session.get(OLT, olt_id)
    profile = db.session.get(WanIpProfile, profile_id)
    if not olt or not profile:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.delete_wan_ip_profile(profile.name)
    if success:
        db.session.delete(profile)
        db.session.commit()
        log_action('wan_ip_delete', 'olt', target=olt.name, detail=f'Profile {profile.name}')
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:speed-profiles")
            cache_clear(f"olt:{olt_id}:wan-ip-profiles")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


# ==================== EPON SLA PROFILE MANAGEMENT ====================

@app.route('/api/olt/<int:olt_id>/sla/add', methods=['POST'])
@permission_required('settings_ip_olts')
def add_sla_profile(olt_id):
    """Add a new EPON SLA profile"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'Profile name is required'})

    up_cir = data.get('up_cir', '0')
    up_pir = data.get('up_pir', '1000000')
    down_cir = data.get('down_cir', '0')
    down_pir = data.get('down_pir', '1000000')

    from snmp_collector import create_cli_collector
    tc = create_cli_collector(olt)

    try:
        tn = tc._connect()
        if not tn:
            return jsonify({'success': False, 'message': 'Telnet connection failed'})

        tc._send_command(tn, 'configure terminal', timeout=10)
        tc._send_command(tn, 'epon', timeout=10)
        tc._send_command(tn, f'onu-profile sla {name}', timeout=10)

        tc._send_command(tn, f'upstream pir {up_pir} cir {up_cir}', timeout=10)
        tc._send_command(tn, f'downstream pir {down_pir} cir {down_cir}', timeout=10)

        out = tc._send_command(tn, 'end', timeout=10)
        tn.close()

        if '%Error' in out or 'Invalid' in out or 'Incomplete' in out:
            return jsonify({'success': False, 'message': f'Failed to create SLA profile: {out.strip()}'})

        profile = SpeedProfile(
            olt_id=olt_id,
            profile_type='sla',
            name=name,
            sir=str(up_cir),
            pir=str(up_pir),
            assured_bandwidth=str(down_cir),
            max_bandwidth=str(down_pir)
        )
        db.session.add(profile)
        db.session.commit()

        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:speed-profiles")
            cache_clear(f"olt:{olt_id}:speed-profiles-full")
        except Exception:
            pass

        return jsonify({'success': True, 'message': f'EPON SLA Profile {name} created successfully'})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/olt/<int:olt_id>/sla/<int:profile_id>/delete', methods=['POST'])
@permission_required('settings_ip_olts')
def delete_sla_profile(olt_id, profile_id):
    """Delete an EPON SLA profile"""
    olt = db.session.get(OLT, olt_id)
    profile = db.session.get(SpeedProfile, profile_id)
    if not olt or not profile:
        return jsonify({'success': False, 'message': 'Not found'}), 404

    from snmp_collector import create_cli_collector
    tc = create_cli_collector(olt)

    try:
        tn = tc._connect()
        if not tn:
            return jsonify({'success': False, 'message': 'Telnet connection failed'})

        tc._send_command(tn, 'configure terminal', timeout=10)
        tc._send_command(tn, 'epon', timeout=10)
        out = tc._send_command(tn, f'no onu-profile sla {profile.name}', timeout=10)
        tc._send_command(tn, 'end', timeout=10)
        tn.close()

        if '%Error' in out or 'Invalid' in out or 'used' in out.lower():
            return jsonify({'success': False, 'message': f'Failed to delete SLA profile (it might be in use): {out.strip()}'})

        db.session.delete(profile)
        db.session.commit()

        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:speed-profiles")
            cache_clear(f"olt:{olt_id}:speed-profiles-full")
        except Exception:
            pass

        return jsonify({'success': True, 'message': f'EPON SLA Profile {profile.name} deleted successfully'})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


# ==================== DB-BACKED ENDPOINTS FOR SPA ====================

# In-memory cache for live traffic rate calculation
_traffic_cache = {}

@app.route('/api/olt/<int:olt_id>/uplinks/live-traffic', methods=['GET'])
@login_required
def get_uplinks_live_traffic(olt_id):
    """Get live traffic rates via SNMP polling with rate calculation."""
    import time as _time
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404

    import asyncio as _aio
    from pysnmp.hlapi.v1arch.asyncio import Slim as _Slim, ObjectType as _OT, ObjectIdentity as _OI

    async def _snmp_walk_next(oid, as_int=True):
        results = {}
        slim = _Slim(1)
        cur = oid
        errors = 0
        try:
            while True:
                try:
                    ei, es, eidx, vb = await slim.next(
                        olt.snmp_community or 'public', olt.ip_address, olt.snmp_port or 161,
                        _OT(_OI(cur)), timeout=3, retries=1)
                except Exception:
                    break
                if ei:
                    errors += 1
                    if errors > 2: break
                    continue
                if es: break
                roid = str(vb[0][0])
                if not roid.startswith(oid): break
                val = vb[0][1]
                if 'noSuch' in str(val): break
                idx = roid.split('.')[-1]
                if as_int:
                    try: results[idx] = int(val)
                    except (ValueError, TypeError): results[idx] = 0
                else:
                    results[idx] = str(val).strip()
                cur = roid
                errors = 0
        finally:
            slim.close()
        return results

    try:
        loop = _aio.new_event_loop()
        in_oct = loop.run_until_complete(_snmp_walk_next('1.3.6.1.2.1.2.2.1.10'))    # ifInOctets (int)
        out_oct = loop.run_until_complete(_snmp_walk_next('1.3.6.1.2.1.2.2.1.16'))   # ifOutOctets (int)
        if_descr = loop.run_until_complete(_snmp_walk_next('1.3.6.1.2.1.2.2.1.2', as_int=False))  # ifDescr (str)
        if_oper = loop.run_until_complete(_snmp_walk_next('1.3.6.1.2.1.2.2.1.8'))     # ifOperStatus (int)
        if_speed = loop.run_until_complete(_snmp_walk_next('1.3.6.1.2.1.2.2.1.5'))    # ifSpeed (int)
        loop.close()
    except Exception as e:
        logger.error(f"Live traffic SNMP walk failed: {e}")
        return jsonify({'success': False, 'message': str(e)})

    # Build ordered list of non-PON SNMP interfaces (uplink range: >= 285278977)
    uplink_snmp = []
    for idx in sorted(in_oct.keys(), key=lambda x: int(x)):
        ival = int(idx)
        if ival >= 285278977 and ival < 285290000:
            uplink_snmp.append(idx)

    now = _time.time()
    cache_key = f'olt_{olt_id}'
    prev = _traffic_cache.get(cache_key, {})
    dt = now - prev.get('_t', now)
    if dt < 0.5:
        dt = 0.5

    uplinks = OLTUplink.query.filter_by(olt_id=olt_id).order_by(OLTUplink.port_number).all()
    result = []
    new_cache = {'_t': now}

    for i, u in enumerate(uplinks):
        port = u.port_name
        # Match by ifDescr containing port name, or by position in uplink SNMP list
        matched_idx = None
        for idx in uplink_snmp:
            descr = if_descr.get(idx, '')
            if port.lower() in descr.lower():
                matched_idx = idx
                break
        if not matched_idx and i < len(uplink_snmp):
            matched_idx = uplink_snmp[i]

        cur_in = in_oct.get(matched_idx, 0) if matched_idx else 0
        cur_out = out_oct.get(matched_idx, 0) if matched_idx else 0
        new_cache[f'{port}_in'] = cur_in
        new_cache[f'{port}_out'] = cur_out

        prev_in = prev.get(f'{port}_in', cur_in)
        prev_out = prev.get(f'{port}_out', cur_out)
        in_rate = max(0, (cur_in - prev_in) / dt) if dt > 0 else 0
        out_rate = max(0, (cur_out - prev_out) / dt) if dt > 0 else 0

        def _fmt_rate(bytes_per_sec):
            bps = bytes_per_sec * 8
            if bps >= 1000000000: return f'{bps / 1000000000:.2f} Gbps'
            if bps >= 1000000: return f'{bps / 1000000:.2f} Mbps'
            if bps >= 1000: return f'{bps / 1000:.1f} Kbps'
            return f'{round(bps)} bps'

        result.append({
            'id': u.id, 'port_name': port,
            'in_rate_str': _fmt_rate(in_rate),
            'out_rate_str': _fmt_rate(out_rate),
            'total_in': cur_in,
            'total_out': cur_out,
        })

    _traffic_cache[cache_key] = new_cache
    return jsonify({'success': True, 'uplinks': result, 'ts': now})

@app.route('/api/olt/<int:olt_id>/wan-ip-profiles', methods=['GET'])
@login_required
def get_wan_ip_profiles_db(olt_id):
    """Get full WAN IP profiles from DB. Cached 60s."""
    from cache import cache_get, cache_set
    cache_key = f"olt:{olt_id}:wan-ip-profiles"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)
    profiles = WanIpProfile.query.filter_by(olt_id=olt_id).order_by(WanIpProfile.name).all()
    result = []
    for p in profiles:
        vlan = ''
        priority = ''
        ip_mode = 'dhcp'
        if p.dns1 and p.dns1.startswith('cvlan:'):
            vlan = p.dns1.replace('cvlan:', '')
        elif p.netmask:
            vlan = p.netmask
        if p.dns2 and p.dns2.startswith('pri:'):
            priority = p.dns2.replace('pri:', '')
        elif p.dns2:
            priority = p.dns2
        if p.ip_address and p.ip_address.lower() != 'dhcp':
            ip_mode = 'static'
        result.append({
            'id': p.id, 'name': p.name, 'ip_address': p.ip_address or '',
            'netmask': p.netmask or '', 'gateway': p.gateway or '',
            'dns1': p.dns1 or '', 'dns2': p.dns2 or '',
            'vlan': vlan, 'priority': priority, 'ip_mode': ip_mode,
        })
    result_json = {'success': True, 'wan_ip_profiles': result}
    cache_set(cache_key, result_json, ttl=60)
    return jsonify(result_json)


@app.route('/api/olt/<int:olt_id>/vlans/db', methods=['GET'])
@login_required
def get_olt_vlans_db(olt_id):
    """Get VLANs from DB. Cached 60s."""
    from cache import cache_get, cache_set
    cache_key = f"olt:{olt_id}:vlans-db"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)
    vlans = ONUVlan.query.filter_by(olt_id=olt_id).order_by(ONUVlan.vlan_id).all()
    result = {'success': True, 'vlans': [{
        'vlan_id': v.vlan_id, 'vlan_name': v.vlan_name or '',
        'vlan_type': v.vlan_type or 'L2', 'onu_profiles': v.onu_profiles or '',
    } for v in vlans]}
    cache_set(cache_key, result, ttl=60)
    return jsonify(result)


@app.route('/api/olt/<int:olt_id>/pon-port/<int:port_id>/onus', methods=['GET'])
@login_required
def get_pon_port_onus(olt_id, port_id):
    """Get ONU list for a specific PON port from DB"""
    port = db.session.get(OLTPort, port_id)
    if not port or port.olt_id != olt_id:
        return jsonify({'success': False, 'message': 'Port not found'}), 404
    # Extract frame/slot/port from port_name like gpon-olt_1/1/1 or epon-olt_1/1/1
    parts = port.port_name.replace('gpon-olt_', '').replace('gpon-onu_', '').replace('epon-olt_', '').replace('epon-onu_', '').split('/')
    if len(parts) >= 3:
        frame, slot, pon_port = int(parts[0]), int(parts[1]), int(parts[2])
        onus = ONU.query.filter_by(olt_id=olt_id, frame=frame, slot=slot, port=pon_port).order_by(ONU.onu_id).all()
    else:
        onus = []
    return jsonify({
        'success': True,
        'onus': [{
            'id': o.id, 'onu_id': o.onu_id, 'onu_id_str': f'{o.frame}/{o.slot}/{o.port}:{o.onu_id}',
            'serial_number': o.serial_number or '',
            'name': o.name or '', 'status': o.status or 'offline',
            'rx_power': o.rx_power, 'onu_rx_power': o.onu_rx_power,
            'onu_type': o.onu_type or '', 'distance': o.distance or '',
            'slot': o.slot, 'port': o.port, 'frame': o.frame,
        } for o in onus]
    })


@app.route('/api/olt/<int:olt_id>/pon-port-by-name/<path:port_name>/onus', methods=['GET'])
@login_required
def get_pon_port_onus_by_name(olt_id, port_name):
    """Get ONU list for a PON port by port_name (for placeholder ports without DB id)"""
    parts = port_name.replace('gpon-olt_', '').replace('gpon-onu_', '').replace('epon-olt_', '').replace('epon-onu_', '').split('/')
    if len(parts) >= 3:
        try:
            frame, slot, pon_port = int(parts[0]), int(parts[1]), int(parts[2])
            onus = ONU.query.filter_by(olt_id=olt_id, frame=frame, slot=slot, port=pon_port).order_by(ONU.onu_id).all()
        except (ValueError, IndexError):
            onus = []
    else:
        onus = []
    return jsonify({
        'success': True,
        'onus': [{
            'id': o.id, 'onu_id': o.onu_id, 'onu_id_str': f'{o.frame}/{o.slot}/{o.port}:{o.onu_id}',
            'serial_number': o.serial_number or '',
            'name': o.name or '', 'status': o.status or 'offline',
            'rx_power': o.rx_power, 'onu_rx_power': o.onu_rx_power,
            'onu_type': o.onu_type or '', 'distance': o.distance or '',
            'slot': o.slot, 'port': o.port, 'frame': o.frame,
        } for o in onus]
    })


# ==================== TEMPLATES ====================

@app.route('/api/template', methods=['POST'])
@permission_required('manage_templates')
def create_template():
    data = request.get_json()
    t = Template(
        name=data.get('name', ''), vendor=data.get('vendor', ''),
        model=data.get('model', ''), onu_type=data.get('onu_type', ''),
        tcont_profile=data.get('tcont_profile', ''), traffic_profile=data.get('traffic_profile', ''),
        vlan=data.get('vlan', 100), description=data.get('description', '')
    )
    db.session.add(t)
    db.session.commit()
    return jsonify({'success': True, 'id': t.id})


@app.route('/api/template/<int:tid>', methods=['PUT'])
@permission_required('manage_templates')
def update_template(tid):
    t = db.session.get(Template, tid)
    if not t:
        return jsonify({'success': False}), 404
    data = request.get_json()
    for field in ['name', 'vendor', 'model', 'onu_type', 'tcont_profile', 'traffic_profile', 'vlan', 'description']:
        if field in data:
            setattr(t, field, data[field])
    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/template/<int:tid>', methods=['DELETE'])
@permission_required('manage_templates')
def delete_template(tid):
    t = db.session.get(Template, tid)
    if not t:
        return jsonify({'success': False}), 404
    db.session.delete(t)
    db.session.commit()
    return jsonify({'success': True})


# ==================== TR069 PROFILE ====================

@app.route('/api/tr069', methods=['GET', 'POST'])
@login_required
def api_tr069():
    if request.method == 'GET':
        profiles = TR069Profile.query.all()
        return jsonify([{
            'id': p.id, 'name': p.name, 'acs_url': p.acs_url,
            'acs_username': p.acs_username, 'acs_password': '***' if p.acs_password else '',
            'default_olt_id': p.default_olt_id, 'vlan': p.vlan, 'vlan_mode': p.vlan_mode or 'tag',
            'default_olt_name': p.default_olt.name if p.default_olt else None,
        } for p in profiles])
    # POST — create (requires manage_tr069)
    if not current_user.has_permission('manage_tr069'):
        return jsonify({'success': False, 'message': 'Permission denied'}), 403
    data = request.get_json()
    p = TR069Profile(
        name=data.get('name', ''), acs_url=data.get('acs_url', ''),
        acs_username=data.get('acs_username', ''), acs_password=data.get('acs_password', ''),
        default_olt_id=data.get('default_olt_id'), vlan=data.get('vlan', 0),
        vlan_mode=data.get('vlan_mode', 'tag')
    )
    db.session.add(p)
    db.session.commit()
    return jsonify({'success': True, 'id': p.id})


@app.route('/api/tr069/<int:pid>', methods=['PUT'])
@permission_required('manage_tr069')
def update_tr069(pid):
    p = db.session.get(TR069Profile, pid)
    if not p:
        return jsonify({'success': False}), 404
    data = request.get_json()
    for field in ['name', 'acs_url', 'acs_username', 'default_olt_id', 'vlan', 'vlan_mode']:
        if field in data:
            setattr(p, field, data[field])
    if 'acs_password' in data and data['acs_password'] and not data['acs_password'].startswith('***'):
        p.acs_password = data['acs_password']
    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/tr069/<int:pid>', methods=['DELETE'])
@permission_required('manage_tr069')
def delete_tr069(pid):
    p = db.session.get(TR069Profile, pid)
    if not p:
        return jsonify({'success': False}), 404
    db.session.delete(p)
    db.session.commit()
    return jsonify({'success': True})


# ==================== OLT SETTINGS ====================

@app.route('/api/olt', methods=['POST'])
@permission_required('settings_ip_olts')
def create_olt():
    data = request.get_json()
    olt = OLT(
        name=data.get('name', ''), ip_address=data.get('ip_address', ''),
        model=data.get('model', 'C320'), vendor=data.get('vendor', 'zte'),
        snmp_community=data.get('snmp_community', 'public'),
        snmp_community_write=data.get('snmp_community_write', ''),
        snmp_port=data.get('snmp_port', 161),
        telnet_enabled=data.get('telnet_enabled', True),
        telnet_port=data.get('telnet_port', 23),
        web_port=data.get('web_port', 80),
        ssh_enabled=data.get('ssh_enabled', False),
        ssh_port=data.get('ssh_port', 22),
        cli_username=data.get('cli_username', ''),
        cli_password=data.get('cli_password', ''),
        polling_interval=data.get('polling_interval', 300),
    )
    db.session.add(olt)
    db.session.commit()
    log_action('olt_create', 'olt', target=olt.name, detail=f'Created OLT {olt.name} ({olt.ip_address})')
    return jsonify({'success': True, 'id': olt.id})


@app.route('/api/olt/<int:olt_id>', methods=['GET'])
@login_required
def get_olt(olt_id):
    """Get OLT data for edit modal.
    Sensitive fields (SNMP community, write community) are masked unless
    the user has settings_ip_olts permission."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    can_manage = current_user.has_permission('settings_ip_olts')
    return jsonify({
        'success': True,
        'id': olt.id,
        'name': olt.name,
        'ip_address': olt.ip_address,
        'vendor': olt.vendor,
        'model': olt.model,
        'firmware_version': olt.firmware_version or '',
        'snmp_enabled': olt.snmp_enabled,
        'snmp_community': olt.snmp_community if can_manage else '***',
        'snmp_community_write': olt.snmp_community_write if can_manage else '',
        'snmp_port': olt.snmp_port,
        'telnet_enabled': olt.telnet_enabled,
        'telnet_port': olt.telnet_port,
        'web_port': olt.web_port or 80,
        'ssh_enabled': olt.ssh_enabled,
        'ssh_port': olt.ssh_port,
        'cli_username': olt.cli_username if can_manage else '',
        'cli_password': '***' if olt.cli_password else '',
        'monitoring_enabled': olt.monitoring_enabled,
        'polling_interval': olt.polling_interval,
        'is_online': olt.is_online,
        'connection_status': olt.connection_status,
        'snmp_status': olt.snmp_status,
        'telnet_status': olt.telnet_status,
    })


@app.route('/api/olt/<int:olt_id>', methods=['PUT'])
@permission_required('settings_ip_olts')
def update_olt(olt_id):
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False}), 404
    data = request.get_json()
    for field in ['name', 'ip_address', 'model', 'vendor', 'snmp_port',
                  'telnet_enabled', 'telnet_port', 'web_port', 'ssh_enabled', 'ssh_port',
                  'cli_username', 'polling_interval', 'monitoring_enabled']:
        if field in data:
            setattr(olt, field, data[field])
    # Only update password if a real value is provided (not masked placeholder)
    if 'cli_password' in data and data['cli_password'] and not data['cli_password'].startswith('***'):
        olt.cli_password = data['cli_password']
    # Only update SNMP communities if a real value is provided (not masked placeholder)
    if 'snmp_community' in data and data['snmp_community'] and not data['snmp_community'].startswith('***'):
        olt.snmp_community = data['snmp_community']
    if 'snmp_community_write' in data and data['snmp_community_write'] and not data['snmp_community_write'].startswith('***'):
        olt.snmp_community_write = data['snmp_community_write']
    db.session.commit()
    log_action('olt_update', 'olt', target=olt.name, detail=f'Updated OLT {olt.name} — fields: {list(data.keys())}')
    return jsonify({'success': True, 'id': olt.id})


@app.route('/api/olt/<int:olt_id>', methods=['DELETE'])
@permission_required('settings_ip_olts')
def delete_olt(olt_id):
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    try:
        # Delete all child records explicitly to avoid FK constraint errors
        ONU.query.filter_by(olt_id=olt_id).delete()
        Fan.query.filter_by(olt_id=olt_id).delete()
        OLTCard.query.filter_by(olt_id=olt_id).delete()
        OLTUplink.query.filter_by(olt_id=olt_id).delete()
        OLTPort.query.filter_by(olt_id=olt_id).delete()
        ONUVlan.query.filter_by(olt_id=olt_id).delete()
        ONUType.query.filter_by(olt_id=olt_id).delete()
        SpeedProfile.query.filter_by(olt_id=olt_id).delete()
        WanIpProfile.query.filter_by(olt_id=olt_id).delete()
        OLTSyncStatus.query.filter_by(olt_id=olt_id).delete()
        Notification.query.filter_by(olt_id=olt_id).delete()
        AlertHistory.query.filter_by(olt_id=olt_id).delete()
        # FTTH — nullable FKs, set to NULL
        FTTHOTB.query.filter_by(olt_id=olt_id).update({'olt_id': None})
        FTTHPonPort.query.filter_by(olt_id=olt_id).update({'olt_id': None})
        TR069Profile.query.filter_by(default_olt_id=olt_id).update({'default_olt_id': None})
        db.session.delete(olt)
        db.session.commit()
        log_action('olt_delete', 'olt', target=olt.name, detail=f'Deleted OLT {olt.name} ({olt.ip_address})')
        return jsonify({'success': True, 'message': f'OLT "{olt.name}" deleted successfully.'})
    except Exception as e:
        db.session.rollback()
        logging.error(f'Delete OLT {olt_id} failed: {e}')
        return jsonify({'success': False, 'message': f'Delete failed: {str(e)[:200]}'}), 500


# ==================== ACCOUNT ====================

@app.route('/api/profile', methods=['POST'])
@login_required
def update_profile():
    data = request.get_json()
    if 'full_name' in data:
        current_user.full_name = data['full_name']
    if 'sidebar_name' in data:
        if not current_user.is_super_admin:
            return jsonify({'success': False, 'message': 'Only super admin can change branding name.'}), 403
        current_user.sidebar_name = data['sidebar_name']
        # Also update SystemConfig so all users see consistent branding
        cfg = SystemConfig.query.filter_by(key='nms_name').first()
        if cfg:
            cfg.value = data['sidebar_name']
        else:
            db.session.add(SystemConfig(key='nms_name', value=data['sidebar_name']))
    if 'password' in data and data['password']:
        current_user.set_password(data['password'])
    db.session.commit()
    log_action('profile_update', 'user', target=current_user.username, detail=f'Updated own profile — fields: {list(data.keys())}')
    return jsonify({'success': True})


# ==================== USER MANAGEMENT ====================

@app.route('/api/permissions')
@permission_required('manage_users')
def api_permissions():
    from models import AVAILABLE_PERMISSIONS
    return jsonify({'permissions': AVAILABLE_PERMISSIONS})


@app.route('/api/user', methods=['POST'])
@permission_required('manage_users')
def create_user():
    data = request.get_json()
    if User.query.filter_by(username=data.get('username')).first():
        return jsonify({'success': False, 'message': 'Username already exists'})
    user = User(
        full_name=data.get('full_name', ''),
        username=data.get('username', ''),
        role_id=data.get('role_id'),
        is_super_admin=False,
        phone=data.get('phone', ''),
    )
    user.set_password(data.get('password', ''))
    db.session.add(user)
    db.session.commit()
    log_action('user_create', 'user', target=user.username, detail=f'Created user {user.username} ({user.full_name})')
    return jsonify({'success': True, 'id': user.id})


@app.route('/api/user/<int:uid>', methods=['GET'])
@permission_required('manage_users')
def get_user(uid):
    user = db.session.get(User, uid)
    if not user:
        return jsonify({'success': False}), 404
    return jsonify({
        'success': True,
        'user': {
            'id': user.id,
            'full_name': user.full_name,
            'username': user.username,
            'role_id': user.role_id,
            'phone': user.phone or '',
        }
    })

@app.route('/api/user/<int:uid>', methods=['PUT'])
@permission_required('manage_users')
def update_user(uid):
    user = db.session.get(User, uid)
    if not user:
        return jsonify({'success': False}), 404
    data = request.get_json()
    if 'full_name' in data:
        user.full_name = data['full_name']
    if 'role_id' in data:
        user.role_id = data['role_id']
    if 'phone' in data:
        user.phone = data['phone']
    if 'password' in data and data['password']:
        user.set_password(data['password'])
    db.session.commit()
    log_action('user_update', 'user', target=user.username, detail=f'Updated user {user.username} — fields: {list(data.keys())}')
    return jsonify({'success': True})


@app.route('/api/user/<int:uid>', methods=['DELETE'])
@permission_required('manage_users')
def delete_user(uid):
    user = db.session.get(User, uid)
    if not user:
        return jsonify({'success': False, 'message': 'User not found'})
    if user.id == current_user.id:
        return jsonify({'success': False, 'message': 'Cannot delete your own account'})
    db.session.delete(user)
    db.session.commit()
    log_action('user_delete', 'user', target=user.username, detail=f'Deleted user {user.username} ({user.full_name})')
    return jsonify({'success': True})


# ==================== ROLE MANAGEMENT ====================

@app.route('/api/role', methods=['POST'])
@permission_required('manage_users')
def create_role():
    data = request.get_json()
    r = Role(
        name=data.get('name', ''),
        description=data.get('description', ''),
        permissions=','.join(data.get('permissions', []))
    )
    db.session.add(r)
    db.session.commit()
    log_action('role_create', 'role', target=r.name, detail=f'Created role {r.name} with {len(data.get("permissions", []))} permissions')
    return jsonify({'success': True, 'id': r.id})


@app.route('/api/role/<int:rid>', methods=['PUT'])
@permission_required('manage_users')
def update_role(rid):
    r = db.session.get(Role, rid)
    if not r:
        return jsonify({'success': False}), 404
    data = request.get_json()
    if 'name' in data:
        r.name = data['name']
    if 'description' in data:
        r.description = data['description']
    if 'permissions' in data:
        r.permissions = ','.join(data['permissions'])
    db.session.commit()
    log_action('role_update', 'role', target=r.name, detail=f'Updated role {r.name} — fields: {list(data.keys())}')
    return jsonify({'success': True})


@app.route('/api/role/<int:rid>', methods=['DELETE'])
@permission_required('manage_users')
def delete_role(rid):
    r = db.session.get(Role, rid)
    if not r:
        return jsonify({'success': False, 'message': 'Role not found'})
    if r.is_system:
        return jsonify({'success': False, 'message': 'Cannot delete system role'})
    db.session.delete(r)
    db.session.commit()
    log_action('role_delete', 'role', target=r.name, detail=f'Deleted role {r.name}')
    return jsonify({'success': True})


# ==================== ACTION LOGS ====================

@app.route('/api/action-logs')
@permission_required('manage_users')
def api_action_logs():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    category = request.args.get('category', '').strip()
    search = request.args.get('search', '').strip()
    user_filter = request.args.get('username', '').strip()

    q = ActionLog.query
    if category:
        q = q.filter(ActionLog.category == category)
    if user_filter:
        q = q.filter(ActionLog.username.ilike(f'%{user_filter}%'))
    if search:
        like = f'%{search}%'
        q = q.filter(
            db.or_(
                ActionLog.action.ilike(like),
                ActionLog.target.ilike(like),
                ActionLog.detail.ilike(like),
                ActionLog.username.ilike(like),
            )
        )
    total = q.count()
    logs = q.order_by(ActionLog.id.desc()).offset((page - 1) * per_page).limit(per_page).all()

    categories = [r[0] for r in db.session.query(ActionLog.category).distinct().all() if r[0]]

    return jsonify({
        'logs': [{
            'id': l.id,
            'username': l.username,
            'action': l.action,
            'category': l.category,
            'target': l.target,
            'detail': l.detail,
            'ip_address': l.ip_address,
            'created_at': utc_iso(l.created_at),
        } for l in logs],
        'total': total,
        'page': page,
        'per_page': per_page,
        'pages': (total + per_page - 1) // per_page,
        'categories': sorted(categories),
    })


# ==================== CUSTOMIZATION ====================

@app.route('/api/customization/reset', methods=['POST'])
@permission_required('customization')
def reset_customization_columns():
    ONUCustomColumn.query.delete()
    defaults = [
        ('OLT', 'olt'), ('Name', 'name'), ('Description', 'description'),
        ('PPPoE', 'pppoe'), ('ONU ID', 'onu_id_str'), ('Status', 'status'),
        ('RX OLT', 'rx_power'), ('RX ONU', 'onu_rx_power'), ('SN / MAC', 'serial_number'),
        ('Actual Type', 'actual_type'), ('Action', 'action')
    ]
    for i, (name, key) in enumerate(defaults):
        col = ONUCustomColumn(column_name=name, column_key=key, sort_order=i)
        db.session.add(col)
    db.session.commit()
    log_action('customization_reset', 'general', target='columns', detail='Reset to default columns')
    return jsonify({'success': True})


@app.route('/api/customization/column', methods=['POST'])
@permission_required('customization')
def save_custom_columns():
    data = request.get_json()
    columns = data.get('columns', [])
    ONUCustomColumn.query.delete()
    for i, col in enumerate(columns):
        c = ONUCustomColumn(
            column_name=col['name'], column_key=col['key'],
            visible_desktop=col.get('desktop', True),
            visible_mobile=col.get('mobile', False), sort_order=i
        )
        db.session.add(c)
    db.session.commit()
    log_action('customization_save', 'general', target='columns', detail=f'Saved {len(columns)} custom columns')
    return jsonify({'success': True})


@app.route('/api/customization/signal-filter', methods=['GET'])
@login_required
def api_get_signal_filter():
    """Get signal filter thresholds."""
    rule = AlertRule.query.first()
    if not rule:
        return jsonify({'critical_threshold': -28.0, 'good_threshold': -26.0})
    # rx_threshold is the critical level; good_threshold is rx_threshold + rx_change_threshold
    critical = rule.rx_threshold
    good = rule.rx_threshold + rule.rx_change_threshold
    return jsonify({'critical_threshold': critical, 'good_threshold': good})


@app.route('/api/customization/signal-filter', methods=['POST'])
@permission_required('customization')
def api_save_signal_filter():
    """Save signal filter thresholds."""
    data = request.get_json() or {}
    critical = float(data.get('critical_threshold', -28.0))
    good = float(data.get('good_threshold', -26.0))
    # Validate: critical must be less than good, both in valid range
    if critical >= good:
        return jsonify({'success': False, 'message': 'Critical threshold must be less than Good threshold'}), 400
    if critical < -40 or good > -10:
        return jsonify({'success': False, 'message': 'Thresholds must be between -40 and -10 dBm'}), 400

    rule = AlertRule.query.first()
    if not rule:
        rule = AlertRule(name='Default Alert Rule', enabled=True,
                         check_offline=True, check_dyinggasp=True, check_los=True, check_rx_power=True,
                         notify_bell=True)
        db.session.add(rule)
    rule.rx_threshold = critical
    rule.rx_change_threshold = round(good - critical, 1)
    db.session.commit()
    log_action('customization_save', 'general', target='signal-filter', detail=f'Critical={critical} Good={good}')
    return jsonify({'success': True})


@app.route('/api/customization/rx-colors', methods=['GET'])
@login_required
def api_get_rx_colors():
    """Get RX power color ranges."""
    import json as _json
    cfg = SystemConfig.query.filter_by(key='rx_color_ranges').first()
    if cfg and cfg.value:
        try:
            return jsonify({'ranges': _json.loads(cfg.value)})
        except Exception:
            pass
    # Default ranges
    return jsonify({'ranges': [
        {'min': -25, 'max': 0, 'color': 'green', 'label': 'Good'},
        {'min': -28, 'max': -25, 'color': 'yellow', 'label': 'Warning'},
        {'min': -99, 'max': -28, 'color': 'red', 'label': 'Critical'},
    ]})


@app.route('/api/customization/rx-colors', methods=['POST'])
@permission_required('customization')
def api_save_rx_colors():
    """Save RX power color ranges."""
    import json as _json
    data = request.get_json() or {}
    ranges = data.get('ranges', [])
    if not isinstance(ranges, list) or len(ranges) == 0:
        return jsonify({'success': False, 'message': 'At least one range required'}), 400
    # Validate
    for r in ranges:
        if 'min' not in r or 'max' not in r or 'color' not in r:
            return jsonify({'success': False, 'message': 'Each range needs min, max, and color'}), 400
    cfg = SystemConfig.query.filter_by(key='rx_color_ranges').first()
    if cfg:
        cfg.value = _json.dumps(ranges)
    else:
        db.session.add(SystemConfig(key='rx_color_ranges', value=_json.dumps(ranges)))
    db.session.commit()
    log_action('customization_save', 'general', target='rx-colors', detail=f'Saved {len(ranges)} color ranges')
    return jsonify({'success': True})


# ==================== NOTIFICATIONS API ====================

ALARM_CATEGORIES = {'offline', 'dyinggasp', 'los', 'olt_offline', 'signal', 'signal_drop',
                    'offline_batch', 'dyinggasp_batch', 'los_batch', 'signal_drop_batch',
                    'olt_cpu_high', 'olt_mem_high', 'olt_temp_high'}
UNREGISTER_CATEGORIES = {'unconfig', 'unconfigured'}


def _notif_type(category):
    if category in ALARM_CATEGORIES:
        return 'alarm'
    if category in UNREGISTER_CATEGORIES:
        return 'unregister'
    return 'general'


@app.route('/api/notifications', methods=['GET'])
@login_required
def get_notifications():
    """Get notifications for current user's role, optionally filtered by type."""
    limit = request.args.get('limit', 50, type=int)
    unread_only = request.args.get('unread', 'false') == 'true'
    notif_type = request.args.get('type', '')  # alarm | unregister | general

    query = Notification.query
    if unread_only:
        query = query.filter_by(is_read=False)

    # Filter by target roles if user is not admin
    if current_user.role and not current_user.role.has_permission('all_olt'):
        role_id = current_user.role_id
        query = query.filter(
            (Notification.target_roles == '') |
            (Notification.target_roles.contains(str(role_id)))
        )

    # Filter by type using category mapping
    if notif_type == 'alarm':
        query = query.filter(Notification.category.in_(ALARM_CATEGORIES))
    elif notif_type == 'unregister':
        query = query.filter(Notification.category.in_(UNREGISTER_CATEGORIES))
    elif notif_type == 'general':
        query = query.filter(~Notification.category.in_(ALARM_CATEGORIES | UNREGISTER_CATEGORIES))

    notifications = query.order_by(Notification.created_at.desc()).limit(limit).all()

    # Per-type unread counts (only active/non-resolved)
    base_unread = Notification.query.filter_by(is_read=False, resolved=False)
    alarm_unread = base_unread.filter(Notification.category.in_(ALARM_CATEGORIES)).count()
    unreg_unread = base_unread.filter(Notification.category.in_(UNREGISTER_CATEGORIES)).count()
    general_unread = base_unread.filter(~Notification.category.in_(ALARM_CATEGORIES | UNREGISTER_CATEGORIES)).count()
    unread_count = alarm_unread + unreg_unread + general_unread

    return jsonify({
        'notifications': [{
            'id': n.id, 'severity': n.severity, 'category': n.category,
            'type': _notif_type(n.category),
            'title': n.title, 'message': n.message, 'is_read': n.is_read,
            'acknowledged': n.acknowledged, 'acknowledged_by': n.acknowledged_by,
            'acknowledged_at': utc_iso(n.acknowledged_at),
            'resolved': n.resolved, 'resolved_at': utc_iso(n.resolved_at),
            'olt_id': n.olt_id, 'onu_id': n.onu_id,
            'created_at': utc_iso(n.created_at),
        } for n in notifications],
        'unread_count': unread_count,
        'alarm_unread': alarm_unread,
        'unregister_unread': unreg_unread,
        'general_unread': general_unread,
    })


@app.route('/api/notifications/<int:notif_id>/read', methods=['POST'])
@login_required
def mark_notification_read(notif_id):
    """Mark a notification as read."""
    notif = db.session.get(Notification, notif_id)
    if not notif:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    notif.is_read = True
    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/notifications/read-all', methods=['POST'])
@login_required
def mark_all_notifications_read():
    """Mark all notifications as read, optionally filtered by type."""
    notif_type = request.args.get('type', '')
    q = Notification.query.filter_by(is_read=False)
    if notif_type == 'alarm':
        q = q.filter(Notification.category.in_(ALARM_CATEGORIES))
    elif notif_type == 'unregister':
        q = q.filter(Notification.category.in_(UNREGISTER_CATEGORIES))
    elif notif_type == 'general':
        q = q.filter(~Notification.category.in_(ALARM_CATEGORIES | UNREGISTER_CATEGORIES))
    q.update({'is_read': True})
    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/notifications/<int:notif_id>/acknowledge', methods=['POST'])
@login_required
def acknowledge_notification(notif_id):
    """Acknowledge a notification (mark as being handled)."""
    notif = db.session.get(Notification, notif_id)
    if not notif:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    notif.acknowledged = True
    notif.acknowledged_by = current_user.username or current_user.email or 'unknown'
    notif.acknowledged_at = datetime.now(timezone.utc)
    notif.is_read = True
    db.session.commit()
    log_action('acknowledge', 'notification', notif.id, f'Acknowledged alert: {notif.title}')
    return jsonify({'success': True, 'acknowledged_by': notif.acknowledged_by})


@app.route('/api/notifications/acknowledge-all', methods=['POST'])
@permission_required('customization')
def acknowledge_all_notifications():
    """Acknowledge all unread/unacknowledged notifications, optionally filtered by type."""
    notif_type = request.args.get('type', '')
    q = Notification.query.filter_by(acknowledged=False)
    if notif_type == 'alarm':
        q = q.filter(Notification.category.in_(ALARM_CATEGORIES))
    elif notif_type == 'unregister':
        q = q.filter(Notification.category.in_(UNREGISTER_CATEGORIES))
    elif notif_type == 'general':
        q = q.filter(~Notification.category.in_(ALARM_CATEGORIES | UNREGISTER_CATEGORIES))
    now = datetime.now(timezone.utc)
    username = current_user.username or current_user.email or 'unknown'
    count = 0
    for notif in q.all():
        notif.acknowledged = True
        notif.acknowledged_by = username
        notif.acknowledged_at = now
        notif.is_read = True
        count += 1
    db.session.commit()
    return jsonify({'success': True, 'count': count})


@app.route('/api/notifications/<int:notif_id>', methods=['DELETE'])
@permission_required('customization')
def delete_notification(notif_id):
    """Delete a notification."""
    notif = db.session.get(Notification, notif_id)
    if not notif:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    db.session.delete(notif)
    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/notifications/clear', methods=['POST'])
@permission_required('customization')
def clear_notifications():
    """Clear all read notifications."""
    q = Notification.query.filter_by(is_read=True)
    q.delete()
    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/alerts/history', methods=['GET'])
@login_required
def get_alert_history():
    """Get paginated alert history (AlertHistory table).
    Query params: page, per_page, alert_type, olt_id"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 30, type=int)
    alert_type = request.args.get('type', '').strip()
    olt_id = request.args.get('olt_id', type=int)

    query = AlertHistory.query

    if alert_type:
        query = query.filter_by(alert_type=alert_type)
    if olt_id:
        query = query.filter_by(olt_id=olt_id)

    # Join with OLT for name, and ONU for serial/name
    pagination = query.order_by(AlertHistory.last_alert_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False)

    results = []
    for h in pagination.items:
        olt_name = ''
        onu_info = ''
        onu = db.session.get(ONU, h.onu_id) if h.onu_id else None
        if onu:
            onu_info = onu.name or onu.serial_number or onu.onu_id_str or ''
        resolved_olt_id = h.olt_id or (onu.olt_id if onu else None)
        if resolved_olt_id:
            olt = db.session.get(OLT, resolved_olt_id)
            olt_name = olt.name if olt else ''

        results.append({
            'id': h.id,
            'alert_type': h.alert_type,
            'last_value': h.last_value,
            'last_alert_at': utc_iso(h.last_alert_at),
            'olt_id': resolved_olt_id,
            'olt_name': olt_name,
            'onu_id': h.onu_id,
            'onu_info': onu_info,
        })

    return jsonify({
        'history': results,
        'total': pagination.total,
        'pages': pagination.pages,
        'page': page,
    })


# ==================== MAINTENANCE WINDOWS API ====================

@app.route('/api/maintenance', methods=['GET'])
@login_required
def get_maintenance_windows():
    """List maintenance windows."""
    from models import MaintenanceWindow
    query = MaintenanceWindow.query
    windows = query.order_by(MaintenanceWindow.start_time.desc()).limit(50).all()
    return jsonify({
        'windows': [{
            'id': w.id, 'olt_id': w.olt_id,
            'olt_name': w.olt.name if w.olt else 'All OLTs',
            'start_time': utc_iso(w.start_time),
            'end_time': utc_iso(w.end_time),
            'reason': w.reason,
            'created_by': w.created_by,
            'is_active': w.start_time <= datetime.now(timezone.utc).replace(tzinfo=None) <= w.end_time,
        } for w in windows]
    })


@app.route('/api/maintenance', methods=['POST'])
@login_required
@permission_required('customization')
def create_maintenance_window():
    """Create a maintenance window."""
    from models import MaintenanceWindow
    data = request.get_json() or {}
    start = data.get('start_time')
    end = data.get('end_time')
    if not start or not end:
        return jsonify({'success': False, 'message': 'start_time and end_time required'}), 400

    try:
        start_dt = datetime.fromisoformat(start.replace('Z', '+00:00')).astimezone(timezone.utc).replace(tzinfo=None)
        end_dt = datetime.fromisoformat(end.replace('Z', '+00:00')).astimezone(timezone.utc).replace(tzinfo=None)
    except Exception:
        return jsonify({'success': False, 'message': 'Invalid datetime format'}), 400

    window = MaintenanceWindow(
        olt_id=data.get('olt_id'),
        start_time=start_dt,
        end_time=end_dt,
        reason=data.get('reason', ''),
        created_by=current_user.username or '',
    )
    db.session.add(window)
    db.session.commit()
    log_action('create', 'maintenance', window.id, f'Maintenance: {window.reason}')
    return jsonify({'success': True, 'id': window.id})


@app.route('/api/maintenance/<int:window_id>', methods=['DELETE'])
@login_required
@permission_required('customization')
def delete_maintenance_window(window_id):
    """Delete a maintenance window."""
    from models import MaintenanceWindow
    window = db.session.get(MaintenanceWindow, window_id)
    if not window:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    db.session.delete(window)
    db.session.commit()
    return jsonify({'success': True})


# ==================== UPTIME / SLA API ====================

@app.route('/api/uptime/onu/<int:onu_id>', methods=['GET'])
@login_required
def get_onu_uptime(onu_id):
    """Get uptime statistics for an ONU.
    Query params: range (days, default 30)"""
    from models import UptimeLog
    days = request.args.get('range', 30, type=int)
    since = datetime.now(timezone.utc) - timedelta(days=days)

    logs = UptimeLog.query.filter(
        UptimeLog.onu_id == onu_id,
        UptimeLog.changed_at >= since
    ).order_by(UptimeLog.changed_at.asc()).all()

    # Calculate uptime
    total_seconds = days * 86400
    offline_seconds = 0
    last_online_at = since

    for log in logs:
        if log.new_status in ('offline', 'dyinggasp', 'los'):
            # Went offline
            offline_start = log.changed_at
            last_online_at = None
        elif log.new_status == 'online' and last_online_at is None:
            # Came back online
            if hasattr(log, '_offline_start'):
                offline_seconds += (log.changed_at - offline_start).total_seconds()
            last_online_at = log.changed_at

    uptime_pct = ((total_seconds - offline_seconds) / total_seconds * 100) if total_seconds > 0 else 100

    return jsonify({
        'onu_id': onu_id,
        'range_days': days,
        'uptime_pct': round(uptime_pct, 2),
        'total_incidents': len([l for l in logs if l.new_status != 'online']),
        'last_incident': utc_iso(logs[-1].changed_at) if logs else None,
    })


@app.route('/api/uptime/olt/<int:olt_id>', methods=['GET'])
@login_required
def get_olt_uptime(olt_id):
    """Get uptime statistics for an OLT."""
    from models import UptimeLog
    days = request.args.get('range', 30, type=int)
    since = datetime.now(timezone.utc) - timedelta(days=days)

    logs = UptimeLog.query.filter(
        UptimeLog.olt_id == olt_id,
        UptimeLog.onu_id.is_(None),  # OLT-level events only
        UptimeLog.changed_at >= since
    ).order_by(UptimeLog.changed_at.asc()).all()

    total_seconds = days * 86400
    offline_seconds = 0
    for i, log in enumerate(logs):
        if log.new_status == 'offline':
            next_online = next((l for l in logs[i+1:] if l.new_status == 'online'), None)
            if next_online:
                offline_seconds += (next_online.changed_at - log.changed_at).total_seconds()
            else:
                offline_seconds += (datetime.now(timezone.utc) - log.changed_at).total_seconds()

    uptime_pct = ((total_seconds - offline_seconds) / total_seconds * 100) if total_seconds > 0 else 100

    return jsonify({
        'olt_id': olt_id,
        'range_days': days,
        'uptime_pct': round(uptime_pct, 2),
        'total_incidents': len([l for l in logs if l.new_status == 'offline']),
    })


@app.route('/api/unregistered-count', methods=['GET'])
@login_required
def unregistered_count():
    """Quick check for unregistered ONUs across all OLTs.
    Returns count + per-OLT breakdown. Also creates notifications if found."""
    olts = OLT.query.filter_by(monitoring_enabled=True).all()
    total_unreg = 0
    breakdown = []
    from snmp_collector import TelnetCollector, create_cli_collector
    for olt in olts:
        if not olt.telnet_enabled:
            continue
        try:
            tc = create_cli_collector(olt)
            unregistered = tc.collect_unregistered_onus()
            count = len(unregistered)
            if count > 0:
                total_unreg += count
                breakdown.append({'olt_id': olt.id, 'olt_name': olt.name, 'count': count})
                # Create or update notification (dedup by olt_id + category, not title)
                existing = Notification.query.filter_by(
                    olt_id=olt.id, category='unconfig', is_read=False
                ).first()
                title = f'⚠️ {count} ONU Belum Terdaftar — {olt.name}'
                message = f'{count} ONU(s) waiting for registration on OLT {olt.name}'
                if existing:
                    existing.title = title
                    existing.message = message
                else:
                    n = Notification(
                        olt_id=olt.id,
                        title=title,
                        message=message,
                        severity='warning',
                        category='unconfig'
                    )
                    db.session.add(n)
        except:
            pass
    if total_unreg > 0:
        db.session.commit()
    # Also count offline/dyinggasp/los ONUs from DB
    base_q = ONU.query.filter(ONU.status.in_(['offline', 'dyinggasp', 'los']))
    offline_count = base_q.filter(ONU.status == 'offline').count()
    dyinggasp_count = base_q.filter(ONU.status == 'dyinggasp').count()
    los_count = base_q.filter(ONU.status == 'los').count()
    offline_dyinggasp = offline_count + dyinggasp_count + los_count
    return jsonify({
        'unregistered': total_unreg,
        'breakdown': breakdown,
        'offline_dyinggasp': offline_dyinggasp,
        'offline_count': offline_count,
        'dyinggasp_count': dyinggasp_count,
        'los_count': los_count,
    })


# ==================== ALERT RULES API ====================

@app.route('/api/alert-rules', methods=['GET'])
@login_required
def get_alert_rules():
    """Get alert rules."""
    rules = AlertRule.query.all()
    return jsonify({'rules': [{
        'id': r.id, 'name': r.name, 'enabled': r.enabled,
        'check_offline': r.check_offline, 'check_dyinggasp': r.check_dyinggasp,
        'check_los': r.check_los, 'check_rx_power': r.check_rx_power,
        'rx_threshold': r.rx_threshold, 'rx_change_threshold': r.rx_change_threshold,
        'check_olt_offline': r.check_olt_offline, 'check_olt_cpu': r.check_olt_cpu,
        'check_olt_memory': r.check_olt_memory, 'check_olt_temperature': r.check_olt_temperature,
        'olt_cpu_threshold': r.olt_cpu_threshold, 'olt_memory_threshold': r.olt_memory_threshold,
        'olt_temp_threshold': r.olt_temp_threshold,
        'notify_bell': r.notify_bell, 'notify_telegram': r.notify_telegram,
        'notify_whatsapp': r.notify_whatsapp, 'notify_whatsapp_native': r.notify_whatsapp_native,
        'target_roles': r.target_roles or '',
    } for r in rules]})


@app.route('/api/alert-rules/<int:rule_id>', methods=['PUT'])
@permission_required('customization')
def update_alert_rule(rule_id):
    """Update an alert rule."""
    rule = db.session.get(AlertRule, rule_id)
    if not rule:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    data = request.get_json() or {}
    for field in ['name', 'enabled', 'check_offline', 'check_dyinggasp', 'check_los',
                  'check_rx_power', 'rx_threshold', 'rx_change_threshold',
                  'check_olt_offline', 'check_olt_cpu', 'check_olt_memory',
                  'check_olt_temperature', 'olt_cpu_threshold', 'olt_memory_threshold',
                  'olt_temp_threshold',
                  'notify_bell', 'notify_telegram', 'notify_whatsapp',
                  'notify_whatsapp_native', 'target_roles']:
        if field in data:
            setattr(rule, field, data[field])
    db.session.commit()
    return jsonify({'success': True})


# ==================== BOT CONFIG API ====================

@app.route('/api/bot-config', methods=['GET'])
@login_required
def get_bot_config():
    """Get bot configurations."""
    configs = BotConfig.query.all()
    return jsonify({'configs': [{
        'id': c.id, 'bot_type': c.bot_type, 'enabled': c.enabled,
        'bot_token': c.bot_token[:10] + '...' if c.bot_token and len(c.bot_token) > 10 else c.bot_token,
        'chat_id': c.chat_id, 'api_url': c.api_url,
        'phone_number': c.phone_number,
    } for c in configs]})


@app.route('/api/bot-config/<string:bot_type>', methods=['PUT'])
@permission_required('customization')
def update_bot_config(bot_type):
    """Update or create bot configuration."""
    config = BotConfig.query.filter_by(bot_type=bot_type).first()
    if not config:
        config = BotConfig(bot_type=bot_type)
        db.session.add(config)

    data = request.get_json() or {}
    for field in ['enabled', 'bot_token', 'chat_id', 'api_url', 'api_key', 'phone_number']:
        if field in data:
            val = data[field]
            # Don't overwrite with placeholder
            if field in ('bot_token', 'api_key') and val and '...' in str(val):
                continue
            setattr(config, field, val)

    db.session.commit()
    return jsonify({'success': True})


# ==================== SYSTEM CONFIG API ====================

@app.route('/api/system-config', methods=['GET'])
@login_required
def get_system_config():
    """Get system configuration (timezone, alert interval, etc)."""
    configs = SystemConfig.query.all()
    result = {}
    for c in configs:
        result[c.key] = c.value
    # Defaults
    if 'timezone' not in result:
        result['timezone'] = 'Asia/Jakarta'
    if 'alert_check_interval' not in result:
        result['alert_check_interval'] = '60'
    if 'nms_name' not in result:
        result['nms_name'] = 'Salfanet NMS'
    if 'base_url' not in result:
        result['base_url'] = 'https://salfanet.id'
    if 'admin_service_phone' not in result:
        result['admin_service_phone'] = '6285121111220'
    if 'duitku_merchant_code' not in result:
        result['duitku_merchant_code'] = ''
    if 'duitku_api_key' not in result:
        result['duitku_api_key'] = ''
    if 'duitku_callback_url' not in result:
        result['duitku_callback_url'] = ''
    if 'duitku_environment' not in result:
        result['duitku_environment'] = 'sandbox'
    return jsonify({'success': True, 'config': result})


@app.route('/api/system-config', methods=['PUT'])
@login_required
def update_system_config():
    """Update system configuration. Super admin can update all keys.
    Non-super-admin can only update alert_check_interval and timezone."""
    data = request.get_json() or {}
    allowed_keys = {'alert_check_interval', 'timezone'}
    if not current_user.is_super_admin:
        for key in data:
            if key not in allowed_keys:
                return jsonify({'success': False, 'message': f'Permission denied: only super admin can update {key}'}), 403
    for key, value in data.items():
        config = SystemConfig.query.filter_by(key=key).first()
        if config:
            config.value = str(value)
        else:
            db.session.add(SystemConfig(key=key, value=str(value)))
    db.session.commit()
    return jsonify({'success': True})


# ==================== PUBLIC API (no auth — branding) ====================

@app.route('/api/public/branding', methods=['GET'])
def public_branding():
    """Get NMS branding — public, no auth. Used by login page."""
    brand = _get_nms_branding()
    base = brand['nms_url'].replace('https://', '').replace('http://', '').rstrip('/')
    parts = base.split('.')
    if len(parts) > 2:
        root_domain = '.'.join(parts[1:])
        nms_prefix = parts[0]
    else:
        root_domain = base
        nms_prefix = ''
    # Include system timezone for frontend date formatting
    tz_cfg = SystemConfig.query.filter_by(key='timezone').first()
    system_timezone = tz_cfg.value if tz_cfg and tz_cfg.value else 'Asia/Jakarta'
    return jsonify({'nms_name': brand['nms_name'], 'base_domain': root_domain, 'nms_prefix': nms_prefix, 'timezone': system_timezone})


@app.route('/api/ws-token', methods=['GET'])
@login_required
def ws_token():
    """Return ephemeral HMAC-signed WebSocket auth token for authenticated users.

    Token format: {user_id}.{expiry}.{hmac_signature}
    The WebSocket server verifies the signature and expiry — no SECRET_KEY exposed.
    """
    secret = os.environ.get('INTERNAL_API_KEY', '')
    if not secret:
        logger.warning('INTERNAL_API_KEY not set — WebSocket tokens will use random per-process key')
        import secrets as _secrets
        secret = _secrets.token_hex(32)
    expiry = int(time.time()) + 60  # 60-second TTL
    payload = f"{current_user.id}.{expiry}"
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    token = f"{payload}.{sig}"
    return jsonify({'token': token})


# WA notification functions moved to services_wa.py


@app.route('/api/alert-rules/recheck', methods=['POST'])
@permission_required('customization')
def recheck_alerts():
    """Manually trigger alert re-check now."""
    from alerts import _check_onus_for_tenant
    try:
        _check_onus_for_tenant(force_send=True)
        unread = Notification.query.filter_by(is_read=False).count()
        return jsonify({'success': True, 'message': f'Re-check complete. {unread} unread notifications. Alerts sent to enabled channels.'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/bot-config/telegram/test', methods=['POST'])
@permission_required('customization')
def test_telegram():
    """Send test message via Telegram."""
    config = BotConfig.query.filter_by(bot_type='telegram').first()
    if not config or not config.enabled:
        return jsonify({'success': False, 'message': 'Telegram not configured or disabled'})
    if not config.bot_token or not config.chat_id:
        return jsonify({'success': False, 'message': 'Bot token and chat ID are required'})
    try:
        import urllib.request as _urllib
        url = f"https://api.telegram.org/bot{config.bot_token}/sendMessage"
        payload = json.dumps({
            'chat_id': config.chat_id,
            'text': '🔔 *FiberNMS Test Message*\n\nThis is a test notification from FiberNMS.\nIf you see this, your Telegram bot is configured correctly!',
            'parse_mode': 'Markdown',
        }).encode('utf-8')
        req = _urllib.Request(url, data=payload, headers={'Content-Type': 'application/json'})
        resp = _urllib.urlopen(req, timeout=10)
        if resp.status == 200:
            return jsonify({'success': True, 'message': 'Test message sent!'})
        return jsonify({'success': False, 'message': f'HTTP {resp.status}'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/bot-config/whatsapp/test', methods=['POST'])
@permission_required('customization')
def test_whatsapp():
    """Send test message via WhatsApp gateway."""
    config = BotConfig.query.filter_by(bot_type='whatsapp').first()
    if not config or not config.enabled:
        return jsonify({'success': False, 'message': 'WhatsApp not configured or disabled'})
    if not config.api_url or not config.phone_number:
        return jsonify({'success': False, 'message': 'API URL and phone number are required'})
    try:
        import urllib.request as _urllib
        import urllib.parse as _parse

        test_msg = '🔔 FiberNMS Test\n\nThis is a test notification from FiberNMS.\nIf you see this, WhatsApp gateway is configured correctly!'
        headers = {'Content-Type': 'application/json'}
        if config.api_key:
            headers['Authorization'] = f'Bearer {config.api_key}'

        url = config.api_url
        phone = config.phone_number

        # Adapt payload format based on gateway URL
        if 'fonnte.com' in url:
            # Fonnte uses form-encoded, NOT JSON. Token in Authorization header directly (no Bearer)
            payload = _parse.urlencode({'target': phone, 'message': test_msg, 'countryCode': '62'}).encode('utf-8')
            headers = {'Authorization': config.api_key or ''}
        elif 'wablas.com' in url:
            payload = json.dumps({'phone': phone, 'message': test_msg}).encode('utf-8')
            if config.api_key:
                headers['Authorization'] = config.api_key
        elif 'callmebot.com' in url:
            url = f'{url}?phone={phone}&text={_parse.quote(test_msg)}&apikey={config.api_key}'
            payload = None
            headers = {}
        elif 'green-api.com' in url:
            payload = json.dumps({'message': test_msg, 'chatId': phone}).encode('utf-8')
        elif 'graph.facebook.com' in url or 'meta' in url.lower():
            payload = json.dumps({'messaging_product': 'whatsapp', 'to': phone, 'type': 'text', 'text': {'body': test_msg}}).encode('utf-8')
        elif 'twilio.com' in url:
            payload = _parse.urlencode({'To': f'whatsapp:{phone}', 'From': 'whatsapp:+14155238886', 'Body': test_msg}).encode('utf-8')
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
        else:
            # Generic: try phone + message
            payload = json.dumps({'phone': phone, 'message': test_msg, 'target': phone, 'text': test_msg}).encode('utf-8')

        if payload:
            req = _urllib.Request(url, data=payload, headers=headers)
        else:
            req = _urllib.Request(url, headers=headers)
        resp = _urllib.urlopen(req, timeout=15)
        if resp.status in (200, 201):
            return jsonify({'success': True, 'message': 'Test message sent! Check your WhatsApp.'})
        return jsonify({'success': False, 'message': f'HTTP {resp.status}'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


# ==================== WHATSAPP NATIVE GATEWAY ====================

def _wa_gateway_url():
    """Get the gateway URL for the WA gateway."""
    return f'http://localhost:{_wa_gateway_port()}'


@app.route('/api/bot-config/whatsapp-native/status', methods=['GET'])
@login_required
def wa_native_status():
    """Proxy status check to native WA gateway."""
    gw_url = _wa_gateway_url()
    try:
        import urllib.request as _urllib
        url = gw_url.rstrip('/') + '/status'
        req = _urllib.Request(url)
        resp = _urllib.urlopen(req, timeout=5)
        return jsonify(json.loads(resp.read().decode()))
    except Exception as e:
        return jsonify({'connected': False, 'message': f'Gateway offline: {e}'})


@app.route('/api/bot-config/whatsapp-native/qr', methods=['GET'])
@login_required
def wa_native_qr():
    """Proxy QR code from native WA gateway."""
    gw_url = _wa_gateway_url()
    try:
        import urllib.request as _urllib
        url = gw_url.rstrip('/') + '/qr'
        req = _urllib.Request(url)
        resp = _urllib.urlopen(req, timeout=5)
        return jsonify(json.loads(resp.read().decode()))
    except Exception as e:
        return jsonify({'qr': None, 'message': f'Gateway offline: {e}'})


@app.route('/api/bot-config/whatsapp-native/test', methods=['POST'])
@permission_required('customization')
def wa_native_test():
    """Send test message via native WA gateway."""
    gw_url = _wa_gateway_url()
    config = BotConfig.query.filter_by(bot_type='whatsapp_native').first()
    if not config or not config.enabled:
        return jsonify({'success': False, 'message': 'WhatsApp Native not configured or disabled'})
    if not config.phone_number:
        return jsonify({'success': False, 'message': 'Phone number required'})
    try:
        import urllib.request as _urllib
        test_msg = '🔔 *FiberNMS Test*\n\nThis is a test notification from FiberNMS via Native WhatsApp Gateway.\nIf you see this, your native WA gateway is working correctly!'
        payload = json.dumps({'phone': config.phone_number, 'message': test_msg}).encode('utf-8')
        url = gw_url.rstrip('/') + '/send'
        req = _urllib.Request(url, data=payload, headers={'Content-Type': 'application/json'})
        resp = _urllib.urlopen(req, timeout=15)
        resp_body = resp.read().decode()
        if resp.status in (200, 201):
            return jsonify({'success': True, 'message': 'Test message sent! Check your WhatsApp.'})
        return jsonify({'success': False, 'message': f'HTTP {resp.status}: {resp_body}'})
    except _urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else str(e)
        logger.error(f"[WA Native] Test error: {e.code} {body}")
        return jsonify({'success': False, 'message': f'Gateway error: {e.code} — {body[:200]}'})
    except Exception as e:
        logger.error(f"[WA Native] Test exception: {e}")
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/bot-config/whatsapp-native/logout', methods=['POST'])
@permission_required('customization')
def wa_native_logout():
    """Logout and clear WA session."""
    gw_url = _wa_gateway_url()
    try:
        import urllib.request as _urllib
        url = gw_url.rstrip('/') + '/logout'
        req = _urllib.Request(url, data=b'{}', headers={'Content-Type': 'application/json'}, method='POST')
        resp = _urllib.urlopen(req, timeout=10)
        return jsonify({'success': True, 'message': 'Logged out. New QR will be generated.'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/bot-config/whatsapp-native/reconnect', methods=['POST'])
@permission_required('customization')
def wa_native_reconnect():
    """Force reconnect WA gateway."""
    gw_url = _wa_gateway_url()
    try:
        import urllib.request as _urllib
        url = gw_url.rstrip('/') + '/reconnect'
        req = _urllib.Request(url, data=b'{}', headers={'Content-Type': 'application/json'}, method='POST')
        resp = _urllib.urlopen(req, timeout=10)
        return jsonify({'success': True, 'message': 'Reconnecting...'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


def _wa_gateway_port():
    """WA gateway port — single instance on 3000."""
    return 3000


PM2_BIN = '/usr/bin/pm2'


def _wa_gateway_name():
    """PM2 process name for the WA gateway."""
    return 'wa-gateway-admin'


def _wa_auth_dir():
    """Auth state directory for the WA gateway."""
    return '/opt/fibernms/wa_gateway/auth_state_admin'


@app.route('/api/bot-config/whatsapp-native/gateway', methods=['GET'])
@login_required
def wa_native_gateway_info():
    """Get gateway port, PM2 status, and assigned URL."""
    port = _wa_gateway_port()
    name = _wa_gateway_name()
    auth_dir = _wa_auth_dir()
    try:
        import subprocess
        result = subprocess.run([PM2_BIN, 'jlist'], capture_output=True, text=True, timeout=5)
        processes = json.loads(result.stdout) if result.stdout else []
        proc = next((p for p in processes if p.get('name') == name), None)
        pm2_status = proc.get('pm2_env', {}).get('status', 'stopped') if proc else 'not_found'
        pid = proc.get('pid') if proc else None
    except Exception:
        pm2_status = 'unknown'
        pid = None
    return jsonify({
        'port': port,
        'pm2_name': name,
        'auth_dir': auth_dir,
        'api_url': f'http://localhost:{port}',
        'pm2_status': pm2_status,
        'pid': pid,
    })


@app.route('/api/bot-config/whatsapp-native/start', methods=['POST'])
@permission_required('customization')
def wa_native_start():
    """Start WA gateway instance via PM2."""
    port = _wa_gateway_port()
    name = _wa_gateway_name()
    auth_dir = _wa_auth_dir()
    try:
        import subprocess
        import os
        import traceback
        os.makedirs(auth_dir, exist_ok=True)
        env = os.environ.copy()
        env['WA_GATEWAY_PORT'] = str(port)
        env['WA_AUTH_DIR'] = auth_dir
        env['PATH'] = '/usr/local/bin:/usr/bin:/bin:' + env.get('PATH', '')
        # Try restart first (works if process exists)
        restart = subprocess.run([PM2_BIN, 'restart', name, '--update-env'],
            capture_output=True, text=True, timeout=10, env=env)
        if restart.returncode != 0:
            # Process doesn't exist yet — start it
            start = subprocess.run(
                [PM2_BIN, 'start', '/opt/fibernms/wa_gateway/index.js',
                 '--name', name, '--update-env'],
                capture_output=True, text=True, timeout=15, env=env,
                cwd='/opt/fibernms/wa_gateway'
            )
            if start.returncode != 0:
                err = start.stderr or start.stdout or 'Failed to start'
                logger.error(f"[WA Native] Start PM2 error: {err}")
                return jsonify({'success': False, 'message': err}), 500
        subprocess.run([PM2_BIN, 'save'], capture_output=True, text=True, timeout=5, env=env)
        return jsonify({'success': True, 'message': f'Gateway started on port {port}', 'port': port})
    except Exception as e:
        logger.error(f"[WA Native] Start error: {e}\n{traceback.format_exc()}")
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/bot-config/whatsapp-native/stop', methods=['POST'])
@permission_required('customization')
def wa_native_stop():
    """Stop WA gateway instance via PM2."""
    name = _wa_gateway_name()
    try:
        import subprocess
        result = subprocess.run([PM2_BIN, 'stop', name], capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            return jsonify({'success': False, 'message': result.stderr or 'Process not found'}), 500
        subprocess.run([PM2_BIN, 'save'], capture_output=True, text=True, timeout=5)
        return jsonify({'success': True, 'message': 'Gateway stopped'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ==================== SEED INITIAL DATA ====================

def seed_initial_data():
    """Seed only essential initial data - admin user, default roles, default packages"""
    # Ensure phone column exists (for older DBs without migration) — must run before any User query
    try:
        from sqlalchemy import inspect as sa_inspect
        inspector = sa_inspect(db.engine)
        cols = [c['name'] for c in inspector.get_columns('users')]
        if 'phone' not in cols:
            db.session.execute(db.text('ALTER TABLE users ADD COLUMN phone VARCHAR(30) DEFAULT ""'))
            db.session.commit()
            logger.info("Added phone column to users table")
    except Exception as e:
        logger.debug(f"phone column check: {e}")

    # Ensure technician_id column exists on onus table (for older DBs)
    try:
        from sqlalchemy import inspect as sa_inspect
        inspector = sa_inspect(db.engine)
        onu_cols = [c['name'] for c in inspector.get_columns('onus')]
        if 'technician_id' not in onu_cols:
            db.session.execute(db.text('ALTER TABLE onus ADD COLUMN technician_id INTEGER'))
            db.session.commit()
            logger.info("Added technician_id column to onus table")
    except Exception as e:
        logger.debug(f"technician_id column check: {e}")

    # Data loss safeguard: if onu_custom_columns has data but roles is empty,
    # the DB was previously populated but tables were emptied. Refuse to re-seed
    # to avoid masking data loss and alerting the admin.
    existing_roles = Role.query.first()
    if not existing_roles:
        custom_cols = ONUCustomColumn.query.first()
        if custom_cols:
            logger.critical(
                "DATA LOSS DETECTED: onu_custom_columns has data but roles table is empty. "
                "Refusing to re-seed. Restore from backup before continuing."
            )
            return

    if existing_roles:
        # Migrate existing admin to super_admin if not already
        admin = User.query.filter_by(username='admin').first()
        if admin and not admin.is_super_admin:
            admin.is_super_admin = True
            db.session.commit()
        # For existing DBs: ensure Technician role exists
        if not Role.query.filter_by(name='Technician').first():
            tech_role = Role(name='Technician', description='Field technician — view ONUs, receive alerts', is_system=True,
                            permissions='view_dashboard,view_onus,receive_alerts')
            db.session.add(tech_role)
            db.session.commit()
            logger.info("Technician role seeded")
        return  # Already seeded

    # Create default roles
    all_perms = ','.join(AVAILABLE_PERMISSIONS.keys())
    admin_role = Role(name='Full Access', description='Full access to all features', is_system=True, permissions=all_perms)
    viewer_role = Role(name='Viewer', description='View-only access', is_system=True, permissions='view_dashboard')
    limited_role = Role(name='Limited', description='Limited operational access', is_system=True,
                       permissions='view_dashboard,add_onu,configure_onu,reboot_onu,edit_onu_name,edit_onu_description')
    technician_role = Role(name='Technician', description='Field technician — view ONUs, receive alerts', is_system=True,
                          permissions='view_dashboard,view_onus,receive_alerts')
    db.session.add_all([admin_role, viewer_role, limited_role, technician_role])
    db.session.flush()

    # Create admin user (super admin)
    admin = User(full_name='Administrator', username='admin', role_id=admin_role.id, is_super_admin=True)
    admin.set_password('admin123')
    db.session.add(admin)

    # Default columns
    defaults = [
        ('OLT', 'olt'), ('Name', 'name'), ('Description', 'description'),
        ('PPPoE', 'pppoe'), ('ONU ID', 'onu_id_str'), ('Status', 'status'),
        ('RX OLT', 'rx_power'), ('RX ONU', 'onu_rx_power'), ('SN / MAC', 'serial_number'),
        ('Actual Type', 'actual_type'), ('Action', 'action')
    ]
    for i, (name, key) in enumerate(defaults):
        col = ONUCustomColumn(column_name=name, column_key=key, sort_order=i)
        db.session.add(col)

    db.session.commit()
    logger.info("Initial data seeded: admin user (admin/admin123), 3 roles, default columns")
    logger.info("NOTE: No dummy OLT/ONU data. Add your real OLTs via Settings > OLT Settings")


def migrate_schema():
    """Add missing columns to existing tables without losing data.
    Works with both SQLite and PostgreSQL using SQLAlchemy inspection."""
    from sqlalchemy import inspect as sqla_inspect, text as sqla_text
    inspector = sqla_inspect(db.engine)

    # Get existing columns for each table
    def table_cols(table):
        try:
            return {col['name'] for col in inspector.get_columns(table)}
        except:
            return set()

    def add_col(table, col, coltype, default=None):
        if col not in table_cols(table):
            stmt = f"ALTER TABLE {table} ADD COLUMN {col} {coltype}"
            if default is not None:
                stmt += f" DEFAULT {default}"
            try:
                with db.engine.connect() as conn:
                    conn.execute(sqla_text(stmt))
                    conn.commit()
                logger.info(f"  Migration: added {table}.{col}")
            except Exception as e:
                logger.debug(f"  Migration skip {table}.{col}: {e}")

    # OLT table - add new columns
    add_col('olts', 'snmp_status', 'VARCHAR(20)', "'disconnected'")
    add_col('olts', 'telnet_status', 'VARCHAR(20)', "'disconnected'")
    add_col('olts', 'firmware_version', 'VARCHAR(100)', "''")
    add_col('olts', 'last_full_sync', 'DATETIME', None)

    # ONU table - add new columns if missing
    add_col('onus', 'actual_type', 'VARCHAR(100)', "''")
    add_col('onus', 'last_seen', 'DATETIME', None)
    add_col('onus', 'card', 'VARCHAR(20)', "''")
    add_col('onus', 'pon', 'VARCHAR(20)', "''")
    add_col('onus', 'onu_rx_power', 'FLOAT', None)

    # ONU Types table - add new columns
    add_col('onu_types', 'max_flow', 'INTEGER', '0')
    add_col('onu_types', 'interfaces', 'TEXT', "''")

    # Fix: update onu_custom_columns to use onu_rx_power instead of tx_power for RX ONU
    try:
        with db.engine.connect() as conn:
            result = conn.execute(sqla_text("UPDATE onu_custom_columns SET column_key='onu_rx_power' WHERE column_key='tx_power' AND column_name='RX ONU'"))
            conn.commit()
            if result.rowcount > 0:
                logger.info(f"  Migration: updated {result.rowcount} onu_custom_columns from tx_power to onu_rx_power")
    except Exception as e:
        logger.debug(f"  Migration skip onu_custom_columns update: {e}")

    # OLT Uplink table - add SFP transceiver columns
    add_col('olt_uplinks', 'sfp_vendor', 'VARCHAR(100)', "''")
    add_col('olt_uplinks', 'sfp_serial', 'VARCHAR(100)', "''")
    add_col('olt_uplinks', 'sfp_type', 'VARCHAR(100)', "''")
    add_col('olt_uplinks', 'sfp_wavelength', 'VARCHAR(50)', "''")
    add_col('olt_uplinks', 'sfp_distance', 'VARCHAR(50)', "''")
    add_col('olt_uplinks', 'sfp_rx_power', 'VARCHAR(20)', "''")
    add_col('olt_uplinks', 'sfp_tx_power', 'VARCHAR(20)', "''")
    add_col('olt_uplinks', 'sfp_temperature', 'VARCHAR(20)', "''")
    add_col('olt_uplinks', 'sfp_voltage', 'VARCHAR(20)', "''")
    add_col('olt_uplinks', 'sfp_bias_current', 'VARCHAR(20)', "''")
    add_col('olt_uplinks', 'sfp_connector', 'VARCHAR(20)', "''")
    add_col('olt_uplinks', 'phy_attribute', 'VARCHAR(20)', "''")
    add_col('olt_uplinks', 'linktrap', 'VARCHAR(10)', "'enable'")
    add_col('olt_uplinks', 'port_protect', 'VARCHAR(10)', "'disable'")
    add_col('olt_uplinks', 'uplink_isolate', 'VARCHAR(10)', "'disable'")
    add_col('olt_uplinks', 'port_type', 'VARCHAR(20)', "''")

    # User table - add sidebar_name
    add_col('users', 'sidebar_name', 'VARCHAR(100)', "'FiberNMS'")
    add_col('users', 'is_super_admin', 'BOOLEAN', '0')

    # Migrate existing admin user to super_admin
    try:
        with db.engine.connect() as conn:
            result = conn.execute(sqla_text("UPDATE users SET is_super_admin=true WHERE username='admin' AND (is_super_admin IS NULL OR is_super_admin=false)"))
            conn.commit()
            if result.rowcount > 0:
                logger.info(f"  Migration: set admin user as super_admin")
    except Exception as e:
        logger.debug(f"  Migration skip admin super_admin: {e}")

    # Notification table - add resolved lifecycle columns
    add_col('notifications', 'resolved', 'BOOLEAN', '0')
    add_col('notifications', 'resolved_at', 'DATETIME', None)

    # AlertHistory table - add first_seen_at for debounce
    add_col('alert_history', 'first_seen_at', 'DATETIME', None)

    # AlertRule table - add notify_whatsapp_native + OLT health fields
    add_col('alert_rules', 'notify_whatsapp_native', 'BOOLEAN', '0')
    add_col('alert_rules', 'check_olt_offline', 'BOOLEAN', '1')
    add_col('alert_rules', 'check_olt_cpu', 'BOOLEAN', '1')
    add_col('alert_rules', 'check_olt_memory', 'BOOLEAN', '1')
    add_col('alert_rules', 'check_olt_temperature', 'BOOLEAN', '1')
    add_col('alert_rules', 'olt_cpu_threshold', 'FLOAT', '80.0')
    add_col('alert_rules', 'olt_memory_threshold', 'FLOAT', '80.0')
    add_col('alert_rules', 'olt_temp_threshold', 'FLOAT', '60.0')

    # Ensure critical indexes exist (db.create_all only creates indexes for new tables)
    def ensure_index(index_name, table, *columns):
        try:
            existing = {idx['name'] for idx in inspector.get_indexes(table)}
        except Exception:
            existing = set()
        if index_name not in existing:
            cols = ', '.join(columns)
            try:
                with db.engine.connect() as conn:
                    conn.execute(sqla_text(f'CREATE INDEX IF NOT EXISTS {index_name} ON {table} ({cols})'))
                    conn.commit()
                logger.info(f"  Migration: created index {index_name} on {table}({cols})")
            except Exception as e:
                logger.debug(f"  Migration skip index {index_name}: {e}")

    ensure_index('ix_onus_olt_id', 'onus', 'olt_id')
    ensure_index('ix_onus_status', 'onus', 'status')
    ensure_index('ix_onus_serial_number', 'onus', 'serial_number')
    ensure_index('ix_onus_olt_status', 'onus', 'olt_id', 'status')
    ensure_index('ix_olt_sync_status_olt_id', 'olt_sync_status', 'olt_id')
    ensure_index('ix_sync_jobs_olt_id', 'sync_jobs', 'olt_id')
    ensure_index('ix_sync_jobs_created_at', 'sync_jobs', 'created_at')
    ensure_index('ix_notifications_unread', 'notifications', 'is_read', 'resolved')
    ensure_index('ix_alert_history_onu_type', 'alert_history', 'onu_id', 'alert_type')
    ensure_index('ix_action_logs_user_id', 'action_logs', 'user_id')

    # Encrypt plaintext SNMP community strings (S6)
    try:
        from models import encrypt_field
        olts = OLT.query.all()
        migrated = 0
        for olt in olts:
            raw = olt._snmp_community_enc
            # If it's plaintext (not a Fernet token), encrypt it
            if raw and not raw.startswith('gAAAA'):
                olt._snmp_community_enc = encrypt_field(raw)
                migrated += 1
            raw_w = olt._snmp_community_write_enc
            if raw_w and not raw_w.startswith('gAAAA'):
                olt._snmp_community_write_enc = encrypt_field(raw_w)
                migrated += 1
        if migrated:
            db.session.commit()
            logger.info(f"  Migration: encrypted {migrated} SNMP community string(s)")
    except Exception as e:
        logger.debug(f"  Migration skip SNMP encrypt: {e}")


# ==================== FTTH INFRASTRUCTURE APIs ====================

@app.route('/api/ftth/stats', methods=['GET'])
@login_required
def ftth_stats():
    """FTTH Overview stats: aggregate ONU status counts, per-OLT/PON breakdown, infrastructure summary, orphans."""
    olts = OLT.query.all()
    onu_q = ONU.query

    # Aggregate ONU status counts
    onus = onu_q.all()
    status_counts = {'online': 0, 'offline': 0, 'los': 0, 'dyinggasp': 0, 'unregister': 0}
    for o in onus:
        s = (o.status or 'offline').lower()
        if s in status_counts:
            status_counts[s] += 1
        else:
            status_counts['offline'] += 1
    total_onu = len(onus)

    # Per-OLT breakdown
    per_olt = []
    for olt in olts:
        olt_onus = [o for o in onus if o.olt_id == olt.id]
        olt_counts = {'online': 0, 'offline': 0, 'los': 0, 'dyinggasp': 0, 'unregister': 0}
        for o in olt_onus:
            s = (o.status or 'offline').lower()
            if s in olt_counts:
                olt_counts[s] += 1
            else:
                olt_counts['offline'] += 1
        per_olt.append({
            'olt_id': olt.id, 'olt_name': olt.name,
            'total': len(olt_onus), **olt_counts,
            'is_online': olt.is_online,
        })

    # Per-PON port breakdown (from OLTPort table)
    pon_ports_db = OLTPort.query.all()
    pon_olt_map = {p.id: p.olt_id for p in pon_ports_db}
    per_pon = []
    for pp in pon_ports_db:
        parts = (pp.port_name or '').replace('gpon-olt_', '').replace('gpon-onu_', '').split('/')
        if len(parts) >= 3:
            try:
                frame, slot, port = int(parts[0]), int(parts[1]), int(parts[2])
                pon_onus = [o for o in onus if o.olt_id == pp.olt_id and o.frame == frame and o.slot == slot and o.port == port]
                online_cnt = sum(1 for o in pon_onus if (o.status or '').lower() == 'online')
                per_pon.append({
                    'port_id': pp.id, 'port_name': pp.port_name or f'{frame}/{slot}/{port}',
                    'olt_id': pp.olt_id, 'olt_name': next((olt.name for olt in olts if olt.id == pp.olt_id), ''),
                    'total': len(pon_onus), 'online': online_cnt,
                    'offline': len(pon_onus) - online_cnt,
                    'admin_status': pp.admin_status,
                })
            except (ValueError, IndexError):
                continue

    # Infrastructure summary
    otbs = FTTHOTB.query.all()
    otb_ids = [o.id for o in otbs]
    odcs = FTTHODC.query.all()
    odc_ids = [o.id for o in odcs]
    odps = FTTHODP.query.all()
    odp_ids = [o.id for o in odps]
    odp_ports_q = FTTHODPPort.query

    total_otb = len(otbs)
    total_odc = len(odcs)
    total_odp = len(odps)
    all_odp_ports = odp_ports_q.all()
    total_odp_ports = len(all_odp_ports)
    used_odp_ports = sum(1 for p in all_odp_ports if p.status == 'used')

    # Orphan detection
    orphan_onus = sum(1 for o in onus if not any(p.onu_id == o.id for p in all_odp_ports))
    orphan_odps = sum(1 for odp in odps if not odp.odc_id)
    orphan_odcs = sum(1 for odc in odcs if not odc.otb_id)
    orphan_otbs = sum(1 for otb in otbs if not otb.olt_id)
    # Data completeness checks
    onus_without_technician = sum(1 for o in onus if not o.technician_id)
    onus_without_coordinates = sum(1 for o in onus if o.latitude is None or o.longitude is None)
    total_orphans = orphan_onus + orphan_odps + orphan_odcs + orphan_otbs

    return jsonify({
        'success': True,
        'onu_stats': {
            'total': total_onu,
            **status_counts,
        },
        'per_olt': per_olt,
        'per_pon': per_pon,
        'infrastructure': {
            'total_otb': total_otb,
            'total_odc': total_odc,
            'total_odp': total_odp,
            'total_odp_ports': total_odp_ports,
            'used_odp_ports': used_odp_ports,
            'available_odp_ports': total_odp_ports - used_odp_ports,
        },
        'orphans': {
            'total': total_orphans,
            'onus_without_odp': orphan_onus,
            'odps_without_odc': orphan_odps,
            'odcs_without_otb': orphan_odcs,
            'otbs_without_olt': orphan_otbs,
            'onus_without_technician': onus_without_technician,
            'onus_without_coordinates': onus_without_coordinates,
        },
    })


def _otb_to_dict(o):
    odc_count = FTTHODC.query.filter_by(otb_id=o.id).count()
    total_cores = o.total_cores or 0
    return {
        'id': o.id, 'name': o.name, 'type': o.type, 'model': o.model,
        'location': o.location, 'latitude': o.latitude, 'longitude': o.longitude,
        'olt_id': o.olt_id, 'olt_name': o.olt.name if o.olt else '',
        'pon_port': o.pon_port, 'total_cores': total_cores,
        'description': o.description or '',
        'odc_count': odc_count,
        'used_cores': odc_count,
        'available_cores': max(0, total_cores - odc_count),
        'is_active': odc_count > 0,
    }

def _odc_to_dict(o):
    odp_count = FTTHODP.query.filter_by(odc_id=o.id).count()
    total_cores = o.total_cores or 0
    return {
        'id': o.id, 'name': o.name, 'model': o.model,
        'location': o.location, 'latitude': o.latitude, 'longitude': o.longitude,
        'otb_id': o.otb_id, 'otb_name': o.otb.name if o.otb else '',
        'otb_core_number': o.otb_core_number,
        'total_cores': total_cores, 'splitter_model': o.splitter_model,
        'description': o.description or '',
        'odp_count': odp_count,
        'used_cores': odp_count,
        'available_cores': max(0, total_cores - odp_count),
        'is_active': odp_count > 0,
    }

def _odp_to_dict(o):
    used_ports_count = FTTHODPPort.query.filter_by(odp_id=o.id, status='used').count()
    total_ports = o.total_ports or 0
    return {
        'id': o.id, 'name': o.name, 'model': o.model,
        'location': o.location, 'latitude': o.latitude, 'longitude': o.longitude,
        'odc_id': o.odc_id, 'odc_name': o.odc.name if o.odc else '',
        'odc_core_number': o.odc_core_number,
        'total_ports': total_ports, 'splitter_model': o.splitter_model,
        'description': o.description or '',
        'used_ports': used_ports_count,
        'available_ports': max(0, total_ports - used_ports_count),
        'is_active': used_ports_count > 0,
    }

def _odp_port_to_dict(p):
    onu = ONU.query.get(p.onu_id) if p.onu_id else None
    return {
        'id': p.id, 'odp_id': p.odp_id, 'port_number': p.port_number,
        'onu_id': p.onu_id, 'status': p.status,
        'customer_name': p.customer_name, 'customer_phone': p.customer_phone,
        'description': p.description or '',
        'onu_name': onu.name if onu else '',
        'onu_serial': onu.serial_number if onu else '',
        'onu_status': onu.status if onu else '',
        'onu_id_str': onu.onu_id_str if onu else '',
    }

# --- OTB/ODF CRUD ---
@app.route('/api/ftth/otb', methods=['GET'])
@login_required
def ftth_otb_list():
    items = FTTHOTB.query.order_by(FTTHOTB.name).all()
    return jsonify({'success': True, 'items': [_otb_to_dict(o) for o in items]})

@app.route('/api/ftth/otb', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def ftth_otb_create():
    d = request.get_json() or {}
    o = FTTHOTB(
        name=d.get('name', ''), type=d.get('type', 'otb'), model=d.get('model', ''),
        location=d.get('location', ''), latitude=d.get('latitude'), longitude=d.get('longitude'),
        olt_id=d.get('olt_id'), pon_port=d.get('pon_port', ''),
        total_cores=d.get('total_cores', 12), description=d.get('description', ''),
    )
    db.session.add(o)
    db.session.commit()
    return jsonify({'success': True, 'item': _otb_to_dict(o)})

@app.route('/api/ftth/otb/<int:otb_id>', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def ftth_otb_update(otb_id):
    o = db.session.get(FTTHOTB, otb_id)
    if not o: return jsonify({'success': False, 'message': 'Not found'}), 404
    d = request.get_json() or {}
    for k in ['name', 'type', 'model', 'location', 'pon_port', 'description']:
        if k in d: setattr(o, k, d[k])
    for k in ['latitude', 'longitude']:
        if k in d: setattr(o, k, d[k])
    for k in ['olt_id', 'total_cores']:
        if k in d: setattr(o, k, d[k])
    db.session.commit()
    return jsonify({'success': True, 'item': _otb_to_dict(o)})

@app.route('/api/ftth/otb/<int:otb_id>', methods=['DELETE'])
@login_required
@permission_required('settings_ip_olts')
def ftth_otb_delete(otb_id):
    o = db.session.get(FTTHOTB, otb_id)
    if not o: return jsonify({'success': False, 'message': 'Not found'}), 404
    db.session.delete(o)
    db.session.commit()
    return jsonify({'success': True})

# --- ODC CRUD ---
@app.route('/api/ftth/odc', methods=['GET'])
@login_required
def ftth_odc_list():
    otb_id = request.args.get('otb_id', type=int)
    q = FTTHODC.query
    if otb_id: q = q.filter_by(otb_id=otb_id)
    items = q.order_by(FTTHODC.name).all()
    return jsonify({'success': True, 'items': [_odc_to_dict(o) for o in items]})

@app.route('/api/ftth/odc', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def ftth_odc_create():
    d = request.get_json() or {}
    o = FTTHODC(
        name=d.get('name', ''), model=d.get('model', ''),
        location=d.get('location', ''), latitude=d.get('latitude'), longitude=d.get('longitude'),
        otb_id=d.get('otb_id'), otb_core_number=d.get('otb_core_number', 1),
        total_cores=d.get('total_cores', 8), splitter_model=d.get('splitter_model', ''),
        description=d.get('description', ''),
    )
    db.session.add(o)
    db.session.commit()
    return jsonify({'success': True, 'item': _odc_to_dict(o)})

@app.route('/api/ftth/odc/<int:odc_id>', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def ftth_odc_update(odc_id):
    o = db.session.get(FTTHODC, odc_id)
    if not o: return jsonify({'success': False, 'message': 'Not found'}), 404
    d = request.get_json() or {}
    for k in ['name', 'model', 'location', 'splitter_model', 'description']:
        if k in d: setattr(o, k, d[k])
    for k in ['latitude', 'longitude']:
        if k in d: setattr(o, k, d[k])
    for k in ['otb_id', 'otb_core_number', 'total_cores']:
        if k in d: setattr(o, k, d[k])
    db.session.commit()
    return jsonify({'success': True, 'item': _odc_to_dict(o)})

@app.route('/api/ftth/odc/<int:odc_id>', methods=['DELETE'])
@login_required
@permission_required('settings_ip_olts')
def ftth_odc_delete(odc_id):
    o = db.session.get(FTTHODC, odc_id)
    if not o: return jsonify({'success': False, 'message': 'Not found'}), 404
    db.session.delete(o)
    db.session.commit()
    return jsonify({'success': True})

# --- ODP CRUD ---
@app.route('/api/ftth/odp', methods=['GET'])
@login_required
def ftth_odp_list():
    odc_id = request.args.get('odc_id', type=int)
    q = FTTHODP.query
    if odc_id: q = q.filter_by(odc_id=odc_id)
    items = q.order_by(FTTHODP.name).all()
    return jsonify({'success': True, 'items': [_odp_to_dict(o) for o in items]})

@app.route('/api/ftth/odp', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def ftth_odp_create():
    d = request.get_json() or {}
    o = FTTHODP(
        name=d.get('name', ''), model=d.get('model', ''),
        location=d.get('location', ''), latitude=d.get('latitude'), longitude=d.get('longitude'),
        odc_id=d.get('odc_id'), odc_core_number=d.get('odc_core_number', 1),
        total_ports=d.get('total_ports', 8), splitter_model=d.get('splitter_model', ''),
        description=d.get('description', ''),
    )
    db.session.add(o)
    db.session.commit()
    # Auto-create ports
    for i in range(1, o.total_ports + 1):
        db.session.add(FTTHODPPort(odp_id=o.id, port_number=i, status='available'))
    db.session.commit()
    return jsonify({'success': True, 'item': _odp_to_dict(o)})

@app.route('/api/ftth/odp/<int:odp_id>', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def ftth_odp_update(odp_id):
    o = db.session.get(FTTHODP, odp_id)
    if not o: return jsonify({'success': False, 'message': 'Not found'}), 404
    d = request.get_json() or {}
    for k in ['name', 'model', 'location', 'splitter_model', 'description']:
        if k in d: setattr(o, k, d[k])
    for k in ['latitude', 'longitude']:
        if k in d: setattr(o, k, d[k])
    for k in ['odc_id', 'odc_core_number', 'total_ports']:
        if k in d: setattr(o, k, d[k])
    # Auto-create missing ports if total_ports increased
    if 'total_ports' in d:
        existing = FTTHODPPort.query.filter_by(odp_id=o.id).count()
        for i in range(existing + 1, o.total_ports + 1):
            db.session.add(FTTHODPPort(odp_id=o.id, port_number=i, status='available'))
    db.session.commit()
    return jsonify({'success': True, 'item': _odp_to_dict(o)})

@app.route('/api/ftth/odp/<int:odp_id>', methods=['DELETE'])
@login_required
@permission_required('settings_ip_olts')
def ftth_odp_delete(odp_id):
    o = db.session.get(FTTHODP, odp_id)
    if not o: return jsonify({'success': False, 'message': 'Not found'}), 404
    db.session.delete(o)
    db.session.commit()
    return jsonify({'success': True})

# --- ODP Ports ---
@app.route('/api/ftth/odp/<int:odp_id>/ports', methods=['GET'])
@login_required
def ftth_odp_ports(odp_id):
    ports = FTTHODPPort.query.filter_by(odp_id=odp_id).order_by(FTTHODPPort.port_number).all()
    return jsonify({'success': True, 'ports': [_odp_port_to_dict(p) for p in ports]})

@app.route('/api/ftth/odp-port/<int:port_id>', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def ftth_odp_port_update(port_id):
    p = db.session.get(FTTHODPPort, port_id)
    if not p: return jsonify({'success': False, 'message': 'Not found'}), 404
    d = request.get_json() or {}
    for k in ['port_number', 'onu_id', 'status', 'customer_name', 'customer_phone', 'description']:
        if k in d: setattr(p, k, d[k])
    if p.onu_id:
        p.status = 'used'
    elif p.status == 'used':
        p.status = 'available'
    db.session.commit()
    return jsonify({'success': True, 'port': _odp_port_to_dict(p)})

@app.route('/api/ftth/odp-port/<int:port_id>', methods=['DELETE'])
@login_required
@permission_required('settings_ip_olts')
def ftth_odp_port_delete(port_id):
    p = db.session.get(FTTHODPPort, port_id)
    if not p: return jsonify({'success': False, 'message': 'Not found'}), 404
    db.session.delete(p)
    db.session.commit()
    return jsonify({'success': True})

# --- FTTH Tree (full hierarchy) ---
@app.route('/api/ftth/tree', methods=['GET'])
@login_required
def ftth_tree():
    otbs = FTTHOTB.query.order_by(FTTHOTB.name).all()
    result = []
    for otb in otbs:
        otb_d = _otb_to_dict(otb)
        otb_d['odcs'] = []
        for odc in FTTHODC.query.filter_by(otb_id=otb.id).order_by(FTTHODC.name).all():
            odc_d = _odc_to_dict(odc)
            odc_d['odps'] = []
            for odp in FTTHODP.query.filter_by(odc_id=odc.id).order_by(FTTHODP.name).all():
                odp_d = _odp_to_dict(odp)
                ports = FTTHODPPort.query.filter_by(odp_id=odp.id).order_by(FTTHODPPort.port_number).all()
                odp_d['ports'] = [_odp_port_to_dict(p) for p in ports]
                odc_d['odps'].append(odp_d)
            otb_d['odcs'].append(odc_d)
        result.append(otb_d)
    return jsonify({'success': True, 'tree': result})

# --- FTTH Map data (all coordinates) ---
@app.route('/api/ftth/map', methods=['GET'])
@login_required
def ftth_map():
    markers = []
    # Build OLT name lookup
    olts = OLT.query.all()
    olt_name_map = {o.id: o.name for o in olts}

    for o in FTTHOTB.query.all():
        if o.latitude and o.longitude:
            markers.append({'type': 'otb', 'id': o.id, 'name': o.name, 'lat': o.latitude, 'lng': o.longitude, 'subtype': o.type})
    odc_list = FTTHODC.query.all()
    odc_ids = [o.id for o in odc_list]
    for o in odc_list:
        if o.latitude and o.longitude:
            markers.append({'type': 'odc', 'id': o.id, 'name': o.name, 'lat': o.latitude, 'lng': o.longitude})
    odp_list = FTTHODP.query.all()
    odp_ids = [o.id for o in odp_list]
    for o in odp_list:
        if o.latitude and o.longitude:
            markers.append({'type': 'odp', 'id': o.id, 'name': o.name, 'lat': o.latitude, 'lng': o.longitude})
    # ONU markers with status and details
    onu_query = ONU.query
    for o in onu_query.all():
        if o.latitude and o.longitude:
            markers.append({'type': 'onu', 'id': o.id, 'name': o.name or o.serial_number or f'ONU {o.onu_id_str}',
                            'lat': o.latitude, 'lng': o.longitude, 'status': o.status,
                            'serial': o.serial_number, 'olt_id': o.olt_id,
                            'olt_name': olt_name_map.get(o.olt_id, ''),
                            'onu_id_str': o.onu_id_str,
                            'rx_power': o.rx_power, 'tx_power': o.tx_power,
                            'onu_rx_power': o.onu_rx_power})
    # Build connections (lines) with from_id/to_id for path highlighting
    lines = []
    for odc in odc_list:
        if odc.otb_id:
            otb = db.session.get(FTTHOTB, odc.otb_id)
            if otb and otb.latitude and odc.latitude:
                lines.append({'from_lat': otb.latitude, 'from_lng': otb.longitude, 'to_lat': odc.latitude, 'to_lng': odc.longitude, 'from_type': 'otb', 'to_type': 'odc', 'from_id': otb.id, 'to_id': odc.id, 'label': f'Core {odc.otb_core_number}'})
    for odp in odp_list:
        if odp.odc_id:
            odc = db.session.get(FTTHODC, odp.odc_id)
            if odc and odc.latitude and odp.latitude:
                lines.append({'from_lat': odc.latitude, 'from_lng': odc.longitude, 'to_lat': odp.latitude, 'to_lng': odp.longitude, 'from_type': 'odc', 'to_type': 'odp', 'from_id': odc.id, 'to_id': odp.id, 'label': f'Core {odp.odc_core_number}'})
    # ODP → ONU connection lines
    for odp in odp_list:
        if odp.latitude and odp.odc_id:
            for port in odp.ports:
                if port.onu_id:
                    onu = db.session.get(ONU, port.onu_id)
                    if onu and onu.latitude:
                        lines.append({'from_lat': odp.latitude, 'from_lng': odp.longitude,
                                      'to_lat': onu.latitude, 'to_lng': onu.longitude,
                                      'from_type': 'odp', 'to_type': 'onu',
                                      'from_id': odp.id, 'to_id': onu.id,
                                      'label': f'Port {port.port_number}'})
    return jsonify({'success': True, 'markers': markers, 'lines': lines})

# --- FTTH Fiber Paths (manual/auto routing) ---
@app.route('/api/ftth/paths', methods=['GET'])
@login_required
def ftth_paths_list():
    paths = FTTHFiberPath.query.all()
    return jsonify({'success': True, 'paths': [{
        'id': p.id, 'from_type': p.from_type, 'from_id': p.from_id,
        'to_type': p.to_type, 'to_id': p.to_id,
        'coordinates': json.loads(p.coordinates) if p.coordinates else [],
        'path_type': p.path_type,
    } for p in paths]})

@app.route('/api/ftth/paths', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def ftth_paths_create():
    data = request.get_json()
    path = FTTHFiberPath(
        from_type=data['from_type'], from_id=data['from_id'],
        to_type=data['to_type'], to_id=data['to_id'],
        coordinates=json.dumps(data.get('coordinates', [])),
        path_type=data.get('path_type', 'manual'),
    )
    db.session.add(path)
    db.session.commit()
    return jsonify({'success': True, 'id': path.id})

@app.route('/api/ftth/paths/<int:path_id>', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def ftth_paths_update(path_id):
    path = db.session.get(FTTHFiberPath, path_id)
    if not path:
        return jsonify({'success': False, 'message': 'Path not found'}), 404
    data = request.get_json()
    if 'coordinates' in data:
        path.coordinates = json.dumps(data['coordinates'])
    if 'path_type' in data:
        path.path_type = data['path_type']
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/ftth/paths/<int:path_id>', methods=['DELETE'])
@login_required
@permission_required('settings_ip_olts')
def ftth_paths_delete(path_id):
    path = db.session.get(FTTHFiberPath, path_id)
    if not path:
        return jsonify({'success': False, 'message': 'Path not found'}), 404
    db.session.delete(path)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/ftth/auto-route', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def ftth_auto_route():
    """Auto-route between two coordinates using OSRM public API."""
    data = request.get_json()
    from_lat, from_lng = data['from_lat'], data['from_lng']
    to_lat, to_lng = data['to_lat'], data['to_lng']
    from_type, from_id = data.get('from_type', ''), data.get('from_id', 0)
    to_type, to_id = data.get('to_type', ''), data.get('to_id', 0)

    import urllib.request
    import urllib.error
    osrm_url = f'https://router.project-osrm.org/route/v1/driving/{from_lng},{from_lat};{to_lng},{to_lat}?overview=full&geometries=geojson'
    try:
        req = urllib.request.Request(osrm_url, headers={'User-Agent': 'Salfanet-NMS/1.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            osrm_data = json.loads(resp.read().decode())
        if osrm_data.get('code') != 'Ok' or not osrm_data.get('routes'):
            return jsonify({'success': False, 'message': 'OSRM routing failed'}), 400
        coords = osrm_data['routes'][0]['geometry']['coordinates']  # [[lng, lat], ...]
        # Convert to [lat, lng] for Leaflet
        latlng_coords = [[c[1], c[0]] for c in coords]
        # Save to DB
        path = FTTHFiberPath(
            from_type=from_type, from_id=from_id,
            to_type=to_type, to_id=to_id,
            coordinates=json.dumps(latlng_coords),
            path_type='auto',
        )
        db.session.add(path)
        db.session.commit()
        return jsonify({'success': True, 'id': path.id, 'coordinates': latlng_coords})
    except urllib.error.URLError as e:
        return jsonify({'success': False, 'message': f'OSRM request failed: {str(e)}'}), 502
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# --- Available ONUs (not yet linked to ODP) ---
@app.route('/api/ftth/available-onus', methods=['GET'])
@login_required
def ftth_available_onus():
    olt_id = request.args.get('olt_id', type=int)
    q = ONU.query.filter(~ONU.id.in_(db.session.query(FTTHODPPort.onu_id).filter(FTTHODPPort.onu_id.isnot(None))))
    if olt_id:
        q = q.filter_by(olt_id=olt_id)
    onus = q.order_by(ONU.name).limit(200).all()
    return jsonify({'success': True, 'onus': [{'id': o.id, 'name': o.name, 'serial': o.serial_number, 'onu_id_str': o.onu_id_str, 'olt_id': o.olt_id, 'olt_name': o.olt.name if o.olt else ''} for o in onus]})


# --- PON Port CRUD ---
def _pon_to_dict(p):
    # Count ONUs on this PON port
    onu_q = ONU.query.filter_by(olt_id=p.olt_id, frame=p.frame, slot=p.slot, port=p.port) if p.olt_id else ONU.query.filter_by(frame=p.frame, slot=p.slot, port=p.port)
    onus = onu_q.all()
    total_onu = len(onus)
    online_onu = sum(1 for o in onus if (o.status or '').lower() == 'online')
    return {
        'id': p.id, 'olt_id': p.olt_id, 'olt_name': p.olt_name,
        'frame': p.frame, 'slot': p.slot, 'port': p.port,
        'pon_name': p.pon_name,
        'otb_id': p.otb_id, 'otb_name': p.otb.name if p.otb else '',
        'otb_core_number': p.otb_core_number,
        'description': p.description or '',
        'total_onu': total_onu,
        'online_onu': online_onu,
        'offline_onu': total_onu - online_onu,
    }

@app.route('/api/ftth/pon', methods=['GET'])
@login_required
def ftth_pon_list():
    q = FTTHPonPort.query
    items = q.order_by(FTTHPonPort.pon_name).all()
    return jsonify({'success': True, 'items': [_pon_to_dict(p) for p in items]})

@app.route('/api/ftth/pon', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def ftth_pon_create():
    d = request.get_json() or {}
    o = FTTHPonPort(
        olt_id=d.get('olt_id'), olt_name=d.get('olt_name', ''),
        frame=d.get('frame', 1), slot=d.get('slot', 1), port=d.get('port', 1),
        pon_name=d.get('pon_name', ''),
        otb_id=d.get('otb_id'), otb_core_number=d.get('otb_core_number', 1),
        description=d.get('description', ''),
    )
    db.session.add(o)
    db.session.commit()
    return jsonify({'success': True, 'item': _pon_to_dict(o)})

@app.route('/api/ftth/pon/<int:pon_id>', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def ftth_pon_update(pon_id):
    o = db.session.get(FTTHPonPort, pon_id)
    if not o: return jsonify({'success': False, 'message': 'Not found'}), 404
    d = request.get_json() or {}
    for k in ['olt_name', 'pon_name', 'description']:
        if k in d: setattr(o, k, d[k])
    for k in ['frame', 'slot', 'port', 'otb_core_number']:
        if k in d: setattr(o, k, int(d[k]))
    for k in ['olt_id', 'otb_id']:
        if k in d: setattr(o, k, d[k] if d[k] else None)
    db.session.commit()
    return jsonify({'success': True, 'item': _pon_to_dict(o)})

@app.route('/api/ftth/pon/<int:pon_id>', methods=['DELETE'])
@login_required
@permission_required('settings_ip_olts')
def ftth_pon_delete(pon_id):
    o = db.session.get(FTTHPonPort, pon_id)
    if not o: return jsonify({'success': False, 'message': 'Not found'}), 404
    db.session.delete(o)
    db.session.commit()
    return jsonify({'success': True})


# --- FTTH Export / Import ---
@app.route('/api/ftth/export', methods=['GET'])
@login_required
def ftth_export():
    data = {
        'pon_ports': [], 'otbs': [], 'odcs': [], 'odps': [], 'odp_ports': [],
    }
    for p in FTTHPonPort.query.all():
        data['pon_ports'].append(_pon_to_dict(p))
    for o in FTTHOTB.query.all():
        data['otbs'].append(_otb_to_dict(o))
    for o in FTTHODC.query.all():
        data['odcs'].append(_odc_to_dict(o))
    for o in FTTHODP.query.all():
        data['odps'].append(_odp_to_dict(o))
    for p in FTTHODPPort.query.all():
        data['odp_ports'].append(_odp_port_to_dict(p))
    from io import StringIO
    import csv
    si = StringIO()
    writer = csv.writer(si)
    # Write as structured CSV with sections
    writer.writerow(['=== PON PORTS ==='])
    writer.writerow(['id', 'olt_name', 'frame', 'slot', 'port', 'pon_name', 'otb_name', 'otb_core_number', 'description'])
    for p in data['pon_ports']:
        writer.writerow([p['id'], p['olt_name'], p['frame'], p['slot'], p['port'], p['pon_name'], p['otb_name'], p['otb_core_number'], p['description']])
    writer.writerow([])
    writer.writerow(['=== OTB/ODF ==='])
    writer.writerow(['id', 'name', 'type', 'model', 'location', 'latitude', 'longitude', 'total_cores', 'description'])
    for o in data['otbs']:
        writer.writerow([o['id'], o['name'], o['type'], o['model'], o['location'], o['latitude'], o['longitude'], o['total_cores'], o['description']])
    writer.writerow([])
    writer.writerow(['=== ODC ==='])
    writer.writerow(['id', 'name', 'model', 'location', 'latitude', 'longitude', 'otb_name', 'otb_core_number', 'total_cores', 'splitter_model', 'description'])
    for o in data['odcs']:
        writer.writerow([o['id'], o['name'], o['model'], o['location'], o['latitude'], o['longitude'], o['otb_name'], o['otb_core_number'], o['total_cores'], o['splitter_model'], o['description']])
    writer.writerow([])
    writer.writerow(['=== ODP ==='])
    writer.writerow(['id', 'name', 'model', 'location', 'latitude', 'longitude', 'odc_name', 'odc_core_number', 'total_ports', 'splitter_model', 'description'])
    for o in data['odps']:
        writer.writerow([o['id'], o['name'], o['model'], o['location'], o['latitude'], o['longitude'], o['odc_name'], o['odc_core_number'], o['total_ports'], o['splitter_model'], o['description']])
    writer.writerow([])
    writer.writerow(['=== ODP PORTS ==='])
    writer.writerow(['id', 'odp_id', 'port_number', 'status', 'customer_name', 'customer_phone', 'onu_name', 'onu_serial', 'description'])
    for p in data['odp_ports']:
        writer.writerow([p['id'], p['odp_id'], p['port_number'], p['status'], p['customer_name'], p['customer_phone'], p['onu_name'], p['onu_serial'], p['description']])
    from flask import Response
    resp = Response(si.getvalue(), mimetype='text/csv')
    resp.headers['Content-Disposition'] = 'attachment; filename=ftth_infrastructure.csv'
    return resp

@app.route('/api/ftth/import', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def ftth_import():
    import csv as csv_mod
    from io import StringIO
    file = request.files.get('file')
    if not file:
        return jsonify({'success': False, 'message': 'No file uploaded'}), 400
    content = file.read().decode('utf-8')
    reader = csv_mod.reader(StringIO(content))
    rows = list(reader)
    section = None
    imported = {'pon_ports': 0, 'otbs': 0, 'odcs': 0, 'odps': 0, 'odp_ports': 0}
    # Build name→id maps for linking
    otb_map = {o.name: o.id for o in FTTHOTB.query.all()}
    odc_map = {o.name: o.id for o in FTTHODC.query.all()}
    odp_map = {o.name: o.id for o in FTTHODP.query.all()}
    i = 0
    while i < len(rows):
        row = rows[i]
        if not row:
            i += 1
            continue
        if row[0].startswith('==='):
            section = row[0].strip('= ').strip()
            i += 1  # skip header row
            i += 1  # skip column names row
            continue
        try:
            if section == 'PON PORTS' and len(row) >= 9:
                o = FTTHPonPort(olt_name=row[1], frame=int(row[2] or 1), slot=int(row[3] or 1),
                                port=int(row[4] or 1), pon_name=row[5],
                                otb_id=otb_map.get(row[6]), otb_core_number=int(row[7] or 1),
                                description=row[8])
                db.session.add(o)
                imported['pon_ports'] += 1
            elif section == 'OTB/ODF' and len(row) >= 9:
                o = FTTHOTB(name=row[1], type=row[2] or 'otb', model=row[3], location=row[4],
                            latitude=float(row[5]) if row[5] and row[5] != 'None' else None,
                            longitude=float(row[6]) if row[6] and row[6] != 'None' else None,
                            total_cores=int(row[7] or 12), description=row[8])
                db.session.add(o)
                db.session.flush()
                otb_map[o.name] = o.id
                imported['otbs'] += 1
            elif section == 'ODC' and len(row) >= 11:
                o = FTTHODC(name=row[1], model=row[2], location=row[3],
                            latitude=float(row[4]) if row[4] and row[4] != 'None' else None,
                            longitude=float(row[5]) if row[5] and row[5] != 'None' else None,
                            otb_id=otb_map.get(row[6]), otb_core_number=int(row[7] or 1),
                            total_cores=int(row[8] or 8), splitter_model=row[9], description=row[10])
                db.session.add(o)
                db.session.flush()
                odc_map[o.name] = o.id
                imported['odcs'] += 1
            elif section == 'ODP' and len(row) >= 11:
                o = FTTHODP(name=row[1], model=row[2], location=row[3],
                            latitude=float(row[4]) if row[4] and row[4] != 'None' else None,
                            longitude=float(row[5]) if row[5] and row[5] != 'None' else None,
                            odc_id=odc_map.get(row[6]), odc_core_number=int(row[7] or 1),
                            total_ports=int(row[8] or 8), splitter_model=row[9], description=row[10])
                db.session.add(o)
                db.session.flush()
                odp_map[o.name] = o.id
                # Auto-create ports
                for pi in range(1, o.total_ports + 1):
                    db.session.add(FTTHODPPort(odp_id=o.id, port_number=pi, status='available'))
                imported['odps'] += 1
            elif section == 'ODP PORTS' and len(row) >= 9:
                # Only import if odp_id resolves
                odp_id = int(row[1]) if row[1] and row[1].isdigit() else None
                if odp_id:
                    p = FTTHODPPort(odp_id=odp_id, port_number=int(row[2] or 1),
                                    status=row[3] or 'available', customer_name=row[4],
                                    customer_phone=row[5], description=row[8])
                    db.session.add(p)
                    imported['odp_ports'] += 1
        except Exception as ex:
            logger.warning(f"Import row error: {ex}, row: {row}")
        i += 1
    db.session.commit()
    return jsonify({'success': True, 'imported': imported})


# --- All ONUs Export ---
@app.route('/api/all-onus/export', methods=['GET'])
@login_required
def all_onus_export():
    import csv as csv_mod
    from io import StringIO
    from flask import Response
    from sqlalchemy import or_

    # Accept same filters as /api/all-onus
    olt_filter = request.args.get('olt', 'all')
    status_filter = request.args.get('status', 'all')
    pon_filter = request.args.get('pon', 'all')
    search = request.args.get('search', '').strip()
    sort_by = request.args.get('sort_by', '')
    sort_dir = 'desc' if request.args.get('sort_dir', 'asc') == 'desc' else 'asc'

    query = ONU.query.options(joinedload(ONU.odp_port).joinedload(FTTHODPPort.odp))
    olts = {o.id: o.name for o in OLT.query.all()}
    if olt_filter != 'all':
        query = query.filter_by(olt_id=int(olt_filter))
    if status_filter != 'all':
        query = query.filter_by(status=status_filter)
    if pon_filter != 'all' and olt_filter != 'all':
        try:
            parts = pon_filter.split('/')
            if len(parts) == 3:
                query = query.filter_by(frame=int(parts[0]), slot=int(parts[1]), port=int(parts[2]))
            elif len(parts) == 2 and parts[0] == 'slot':
                query = query.filter_by(slot=int(parts[1]))
        except (ValueError, IndexError):
            pass
    if search:
        q = f'%{search}%'
        olt_ids = [o.id for o in OLT.query.filter(OLT.name.ilike(q)).all()]
        conditions = [
            ONU.name.ilike(q), ONU.serial_number.ilike(q),
            ONU.description.ilike(q), ONU.pppoe.ilike(q),
            ONU.actual_type.ilike(q),
        ]
        if olt_ids:
            conditions.append(ONU.olt_id.in_(olt_ids))
        query = query.filter(or_(*conditions))

    # Sorting
    sort_map = {
        'olt': ONU.olt_id, 'name': ONU.name, 'description': ONU.description,
        'pppoe': ONU.pppoe, 'onu_id': ONU.onu_id, 'status': ONU.status,
        'rx_olt': ONU.rx_power, 'rx_onu': ONU.onu_rx_power,
        'sn': ONU.serial_number, 'type': ONU.actual_type, 'distance': ONU.distance,
    }
    sort_col = sort_map.get(sort_by)
    if sort_col is not None:
        query = query.order_by(sort_col.desc() if sort_dir == 'desc' else sort_col.asc())
    else:
        query = query.order_by(ONU.id.asc())

    onus = query.all()

    # Build technician lookup
    tech_ids = {o.technician_id for o in onus if o.technician_id}
    tech_names = {}
    if tech_ids:
        tech_names = {u.id: u.full_name for u in User.query.filter(User.id.in_(tech_ids)).all()}

    si = StringIO()
    writer = csv_mod.writer(si)
    writer.writerow(['OLT', 'Name', 'Description', 'Status', 'Frame', 'Slot', 'Port', 'ONU_ID',
                     'Serial_Number', 'Actual_Type', 'PPPoE', 'RX_dBm',
                     'Distance_m', 'Last_Dereg_Reason', 'Technician',
                     'Latitude', 'Longitude',
                     'ODP_Name', 'ODP_Port', 'Customer_Name', 'Customer_Phone',
                     'Last_Seen', 'Last_Online', 'Last_Offline'])
    for o in onus:
        odp_name = ''
        odp_port = ''
        cust_name = ''
        cust_phone = ''
        if o.odp_port:
            odp_name = o.odp_port.odp.name if o.odp_port.odp else ''
            odp_port = o.odp_port.port_number
            cust_name = o.odp_port.customer_name
            cust_phone = o.odp_port.customer_phone
        writer.writerow([
            olts.get(o.olt_id, ''), o.name or '', o.description or '', o.status,
            o.frame, o.slot, o.port, o.onu_id_str or '',
            o.serial_number or '', o.actual_type or '', o.pppoe or '',
            f'{o.onu_rx_power:.2f}' if o.onu_rx_power is not None else '',
            f'{o.distance}' if o.distance is not None else '',
            o.last_dereg_reason or '',
            tech_names.get(o.technician_id, '') if o.technician_id else '',
            f'{o.latitude:.6f}' if o.latitude is not None else '',
            f'{o.longitude:.6f}' if o.longitude is not None else '',
            odp_name, odp_port, cust_name, cust_phone,
            utc_iso(o.last_seen) or '',
            utc_iso(o.last_online) or '',
            utc_iso(o.last_offline) or '',
        ])
    resp = Response(si.getvalue(), mimetype='text/csv')
    resp.headers['Content-Disposition'] = 'attachment; filename=all_onus.csv'
    return resp


# ==================== TRAFFIC MONITORING ====================

# Cache for live grid polling: {(olt_id, port_type): (timestamp, rates_dict)}
# TTL 10s — all users viewing Live grid share the same OLT poll, reducing OLT load.
_live_grid_cache = {}
_LIVE_GRID_TTL = 10  # seconds

_TRAFFIC_PERIODS = {
    # period -> (lookback_hours, bucket_seconds)
    'live': (0.25, 300),
    '1h': (1, 300),
    '6h': (6, 900),
    '1d': (24, 1800),
    '3d': (72, 3600),
    '7d': (168, 7200),
    '30d': (720, 21600),
}


def _bucket_traffic_rows(rows, bucket_seconds):
    """Group TrafficLog rows into fixed-size time buckets, averaging rx/tx per bucket."""
    buckets = {}
    for r in rows:
        ts = r.recorded_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        key = int(ts.timestamp() // bucket_seconds) * bucket_seconds
        buckets.setdefault(key, []).append(r)
    points = []
    for key in sorted(buckets.keys()):
        items = buckets[key]
        rx_avg = sum(i.rx_mbps or 0 for i in items) / len(items)
        tx_avg = sum(i.tx_mbps or 0 for i in items) / len(items)
        points.append({
            't': datetime.fromtimestamp(key, tz=timezone.utc).isoformat(),
            'rx': round(rx_avg, 3),
            'tx': round(tx_avg, 3),
        })
    return points


@app.route('/api/traffic/meta', methods=['GET'])
@login_required
def traffic_meta():
    """List OLTs (with CLI access) and their uplink/PON port names for Traffic page filters."""
    q = OLT.query.filter(OLT.cli_username.isnot(None), OLT.cli_username != '')
    olts = q.order_by(OLT.name).all()

    data = []
    for olt in olts:
        uplinks = OLTUplink.query.filter_by(olt_id=olt.id).order_by(OLTUplink.port_number).all()
        pon_ports = OLTPort.query.filter_by(olt_id=olt.id).order_by(OLTPort.port_number).all()
        data.append({
            'id': olt.id, 'name': olt.name,
            'uplinks': [{'port_name': u.port_name, 'admin_status': u.admin_status} for u in uplinks if u.port_name],
            'pon_ports': [{'port_name': p.port_name, 'onu_count': p.onu_count, 'onu_online': p.onu_online, 'admin_status': p.admin_status} for p in pon_ports if p.port_name],
        })
    return jsonify({'success': True, 'olts': data})


@app.route('/api/traffic/grid', methods=['GET'])
@login_required
def traffic_grid():
    """Bucketed traffic history for all ports of an OLT (for card mini-charts).
    When period=live, polls current rates directly via Telnet for real-time display."""
    olt_id = request.args.get('olt_id', type=int)
    port_type = request.args.get('port_type', 'pon')
    period = request.args.get('period', '6h')
    search = request.args.get('search', '').strip().lower()
    if not olt_id:
        return jsonify({'success': False, 'message': 'olt_id is required'}), 400
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404

    if port_type == 'uplink':
        port_names = [u.port_name for u in OLTUplink.query.filter_by(olt_id=olt_id).order_by(OLTUplink.port_number).all() if u.port_name]
    else:
        port_names = [p.port_name for p in OLTPort.query.filter_by(olt_id=olt_id).order_by(OLTPort.port_number).all() if p.port_name]

    if search:
        port_names = [pn for pn in port_names if search in pn.lower()]

    # For 'live' period: poll current rates via SNMP (lighter on OLT than Telnet)
    # Uses server-side cache (10s TTL) so concurrent users share the same OLT poll
    # Fallback: if SNMP fails (all zeros), use last DB traffic_logs values
    if period == 'live' and port_names:
        import time as _time
        cache_key = (olt_id, port_type)
        now_ts = _time.time()
        cached = _live_grid_cache.get(cache_key)
        if cached and (now_ts - cached[0]) < _LIVE_GRID_TTL:
            live_rates = cached[1]
        else:
            from snmp_core import SNMPCollector
            sc = SNMPCollector(olt.ip_address, olt.snmp_community, olt.snmp_port or 161)
            snmp_names = [pn.replace('gpon-olt_', 'gpon_') for pn in port_names]
            snmp_rates = sc.get_port_traffic_rates_snmp(snmp_names, double_read=True)
            sc.close()
            # Map back to DB port names
            live_rates = {}
            all_zero = True
            for port_name in port_names:
                snmp_name = port_name.replace('gpon-olt_', 'gpon_')
                r = snmp_rates.get(snmp_name, {'in_mbps': 0.0, 'out_mbps': 0.0})
                if r['in_mbps'] > 0 or r['out_mbps'] > 0:
                    all_zero = False
                live_rates[port_name] = r
            # Fallback: if all zeros (OLT unreachable), use last DB values
            if all_zero:
                for port_name in port_names:
                    last_log = TrafficLog.query.filter(
                        TrafficLog.olt_id == olt_id, TrafficLog.port_type == port_type,
                        TrafficLog.port_name == port_name,
                    ).order_by(TrafficLog.recorded_at.desc()).first()
                    if last_log:
                        if port_type == 'uplink':
                            live_rates[port_name] = {'in_mbps': last_log.rx_mbps, 'out_mbps': last_log.tx_mbps}
                        else:
                            live_rates[port_name] = {'out_mbps': last_log.rx_mbps, 'in_mbps': last_log.tx_mbps}
            _live_grid_cache[cache_key] = (now_ts, live_rates)

        # Also fetch recent logs (last 15 min) for mini-chart sparkline
        since = datetime.now(timezone.utc) - timedelta(minutes=15)
        rows = TrafficLog.query.filter(
            TrafficLog.olt_id == olt_id, TrafficLog.port_type == port_type,
            TrafficLog.recorded_at >= since, TrafficLog.port_name.in_(port_names),
        ).order_by(TrafficLog.recorded_at.asc()).all() if port_names else []
        rows_by_port = {}
        for r in rows:
            rows_by_port.setdefault(r.port_name, []).append(r)

        cards = []
        for port_name in port_names:
            r = live_rates.get(port_name, {'in_mbps': 0.0, 'out_mbps': 0.0})
            if port_type == 'uplink':
                cur_rx, cur_tx = r['in_mbps'], r['out_mbps']
            else:
                cur_rx, cur_tx = r['out_mbps'], r['in_mbps']
            port_rows = rows_by_port.get(port_name, [])
            points = _bucket_traffic_rows(port_rows, 300)
            # Append current live rate as an extra point so chart always has 2+ points
            points.append({
                't': datetime.now(timezone.utc).isoformat(),
                'rx': round(cur_rx, 3),
                'tx': round(cur_tx, 3),
            })
            cards.append({
                'port_name': port_name,
                'points': points,
                'current_rx': round(cur_rx, 3),
                'current_tx': round(cur_tx, 3),
                'has_data': True,
            })
        return jsonify({'success': True, 'olt_name': olt.name, 'port_type': port_type, 'period': period, 'cards': cards})

    lookback_hours, bucket_seconds = _TRAFFIC_PERIODS.get(period, _TRAFFIC_PERIODS['6h'])
    since = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)

    # Use hourly aggregated data for periods > 7 days
    if lookback_hours > 168:
        from models import TrafficLogHourly
        h_rows = TrafficLogHourly.query.filter(
            TrafficLogHourly.olt_id == olt_id, TrafficLogHourly.port_type == port_type,
            TrafficLogHourly.hour_start >= since, TrafficLogHourly.port_name.in_(port_names),
        ).order_by(TrafficLogHourly.hour_start.asc()).all() if port_names else []

        rows_by_port = {}
        for r in h_rows:
            rows_by_port.setdefault(r.port_name, []).append(r)

        cards = []
        for port_name in port_names:
            port_rows = rows_by_port.get(port_name, [])
            points = []
            for r in port_rows:
                ts = r.hour_start
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                points.append({
                    't': ts.isoformat(),
                    'rx': round(r.rx_mbps_avg, 3),
                    'tx': round(r.tx_mbps_avg, 3),
                })
            last = port_rows[-1] if port_rows else None
            cards.append({
                'port_name': port_name,
                'points': points,
                'current_rx': round(last.rx_mbps_avg, 3) if last else 0,
                'current_tx': round(last.tx_mbps_avg, 3) if last else 0,
                'has_data': len(port_rows) > 0,
            })
        return jsonify({'success': True, 'olt_name': olt.name, 'port_type': port_type, 'period': period, 'cards': cards})

    rows = TrafficLog.query.filter(
        TrafficLog.olt_id == olt_id, TrafficLog.port_type == port_type,
        TrafficLog.recorded_at >= since, TrafficLog.port_name.in_(port_names),
    ).order_by(TrafficLog.recorded_at.asc()).all() if port_names else []

    rows_by_port = {}
    for r in rows:
        rows_by_port.setdefault(r.port_name, []).append(r)

    cards = []
    for port_name in port_names:
        port_rows = rows_by_port.get(port_name, [])
        points = _bucket_traffic_rows(port_rows, bucket_seconds)
        last = port_rows[-1] if port_rows else None
        cards.append({
            'port_name': port_name,
            'points': points,
            'current_rx': round(last.rx_mbps, 3) if last else 0,
            'current_tx': round(last.tx_mbps, 3) if last else 0,
            'has_data': len(port_rows) > 0,
        })

    return jsonify({'success': True, 'olt_name': olt.name, 'port_type': port_type, 'period': period, 'cards': cards})


@app.route('/api/traffic/history', methods=['GET'])
@login_required
def traffic_history():
    """Bucketed traffic history for a single port (detail drawer sections).
    Uses raw traffic_logs for periods <= 7d, traffic_log_hourly for > 7d."""
    olt_id = request.args.get('olt_id', type=int)
    port_type = request.args.get('port_type', 'pon')
    port_name = request.args.get('port_name', '')
    period = request.args.get('period', '1d')
    if not olt_id or not port_name:
        return jsonify({'success': False, 'message': 'olt_id and port_name are required'}), 400

    lookback_hours, bucket_seconds = _TRAFFIC_PERIODS.get(period, _TRAFFIC_PERIODS['1d'])
    since = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)

    # Use hourly aggregated data for periods > 7 days
    if lookback_hours > 168:
        from models import TrafficLogHourly
        rows = TrafficLogHourly.query.filter(
            TrafficLogHourly.olt_id == olt_id, TrafficLogHourly.port_type == port_type,
            TrafficLogHourly.port_name == port_name, TrafficLogHourly.hour_start >= since,
        ).order_by(TrafficLogHourly.hour_start.asc()).all()
        # Convert hourly rows to same format as _bucket_traffic_rows output
        points = []
        for r in rows:
            ts = r.hour_start
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            points.append({
                't': ts.isoformat(),
                'rx': round(r.rx_mbps_avg, 3),
                'tx': round(r.tx_mbps_avg, 3),
            })
        return jsonify({'success': True, 'period': period, 'points': points, 'has_data': len(points) > 0})

    rows = TrafficLog.query.filter(
        TrafficLog.olt_id == olt_id, TrafficLog.port_type == port_type,
        TrafficLog.port_name == port_name, TrafficLog.recorded_at >= since,
    ).order_by(TrafficLog.recorded_at.asc()).all()

    points = _bucket_traffic_rows(rows, bucket_seconds)
    return jsonify({'success': True, 'period': period, 'points': points, 'has_data': len(rows) > 0})


@app.route('/api/traffic/live', methods=['GET'])
@login_required
def traffic_live():
    """Real-time single-port traffic rate (polled every 5s by detail drawer).
    Uses SNMP ifInOctets/ifOutOctets with double-read for instantaneous rate.
    Cached for 5s server-side so concurrent users share the same OLT poll."""
    import time as _time
    olt_id = request.args.get('olt_id', type=int)
    port_type = request.args.get('port_type', 'pon')
    port_name = request.args.get('port_name', '')
    olt = db.session.get(OLT, olt_id) if olt_id else None
    if not olt or not port_name:
        return jsonify({'success': False, 'message': 'OLT/port not configured'}), 400

    # Check cache (5s TTL) — key: (olt_id, port_name)
    cache_key = (olt_id, port_name)
    now_ts = _time.time()
    cached = _live_grid_cache.get(cache_key)
    if cached and (now_ts - cached[0]) < 5:
        r = cached[1]
    else:
        from snmp_core import SNMPCollector
        sc = SNMPCollector(olt.ip_address, olt.snmp_community, olt.snmp_port or 161)
        snmp_name = port_name.replace('gpon-olt_', 'gpon_')
        rates = sc.get_port_traffic_rates_snmp([snmp_name], double_read=True)
        r = rates.get(snmp_name, {'in_mbps': 0.0, 'out_mbps': 0.0})
        sc.close()
        # Fallback: if SNMP returns 0.0 (OLT unreachable), use last DB value
        if r['in_mbps'] == 0.0 and r['out_mbps'] == 0.0:
            last_log = TrafficLog.query.filter(
                TrafficLog.olt_id == olt_id, TrafficLog.port_type == port_type,
                TrafficLog.port_name == port_name,
            ).order_by(TrafficLog.recorded_at.desc()).first()
            if last_log:
                if port_type == 'uplink':
                    r = {'in_mbps': last_log.rx_mbps, 'out_mbps': last_log.tx_mbps}
                else:
                    r = {'out_mbps': last_log.rx_mbps, 'in_mbps': last_log.tx_mbps}
        _live_grid_cache[cache_key] = (now_ts, r)
    if port_type == 'uplink':
        # Uplink: Download = Input (WAN -> OLT), Upload = Output (OLT -> WAN)
        rx_mbps, tx_mbps = r['in_mbps'], r['out_mbps']
    else:
        # PON: Download = Output (OLT -> ONU), Upload = Input (ONU -> OLT)
        rx_mbps, tx_mbps = r['out_mbps'], r['in_mbps']

    # Persist this live sample too, so grid/history charts stay in sync with what's displayed live
    try:
        db.session.add(TrafficLog(olt_id=olt.id, port_type=port_type,
                                   port_name=port_name, rx_mbps=round(rx_mbps, 3), tx_mbps=round(tx_mbps, 3)))
        db.session.commit()
    except Exception:
        db.session.rollback()

    return jsonify({'success': True, 'rx_mbps': round(rx_mbps, 3), 'tx_mbps': round(tx_mbps, 3), 'ts': int(_time.time())})


# ==================== METRICS HISTORY ====================

@app.route('/api/metrics/history', methods=['GET'])
@login_required
def metrics_history():
    """Get metric history for charts. Params: type, olt_id/onu_id, hours (default 24)."""
    metric_type = request.args.get('type', 'rx_power')
    olt_id = request.args.get('olt_id', type=int)
    onu_id = request.args.get('onu_id', type=int)
    hours = request.args.get('hours', 24, type=int)
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    q = MetricHistory.query.filter(MetricHistory.recorded_at >= since)
    if metric_type:
        q = q.filter_by(metric_type=metric_type)
    if olt_id:
        q = q.filter_by(olt_id=olt_id)
    if onu_id:
        q = q.filter_by(onu_id=onu_id)

    records = q.order_by(MetricHistory.recorded_at.asc()).limit(500).all()
    return jsonify({
        'success': True,
        'data': [{
            'value': r.value,
            'time': utc_iso(r.recorded_at),
            'type': r.metric_type,
        } for r in records]
    })


# ==================== SERVE REACT BUILD ====================

@app.route('/')
def serve_spa_root():
    """Serve React SPA index.html at root."""
    from flask import send_from_directory, make_response
    dist = os.path.join(os.path.dirname(__file__), 'frontend', 'dist')
    if not os.path.exists(dist):
        return 'Frontend not built. Run: cd frontend && npm run build', 503
    resp = make_response(send_from_directory(dist, 'index.html'))
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp


@app.route('/<path:path>')
def serve_spa(path=''):
    """Serve React SPA build — catch-all for non-API routes (clean URLs, no /spa/ prefix)."""
    # Don't intercept API or auth routes
    if path.startswith('api/') or path.startswith('auth/'):
        from flask import abort
        abort(404)
    from werkzeug.security import safe_join
    dist = os.path.join(os.path.dirname(__file__), 'frontend', 'dist')
    if not os.path.exists(dist):
        return 'Frontend not built. Run: cd frontend && npm run build', 503
    if path:
        safe_path = safe_join(dist, path)
        if safe_path and os.path.exists(safe_path):
            from flask import send_from_directory, make_response
            resp = make_response(send_from_directory(dist, path))
            if path == 'index.html' or path.endswith('.html'):
                resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
                resp.headers['Pragma'] = 'no-cache'
                resp.headers['Expires'] = '0'
            return resp
    from flask import send_from_directory, make_response
    resp = make_response(send_from_directory(dist, 'index.html'))
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp


# Enable SQLite WAL mode for better write concurrency (C5)
if 'sqlite' in app.config.get('SQLALCHEMY_DATABASE_URI', ''):
    from sqlalchemy import event as sa_event
    with app.app_context():
        @sa_event.listens_for(db.engine, 'connect')
        def _set_sqlite_wal(dbapi_conn, conn_record):
            cursor = dbapi_conn.cursor()
            cursor.execute('PRAGMA journal_mode=WAL')
            cursor.execute('PRAGMA busy_timeout=30000')
            cursor.close()
    logger.info('SQLite WAL mode enabled for write concurrency')

# Ensure schema is migrated and tables exist — ONLY in the server process.
# Cron scripts (auto_sync.py, traffic_poller.py, auto_backup.py) import app.py
# but must NOT run schema init, as concurrent db.create_all() on SQLite WAL
# can cause schema lock conflicts and data loss.
if os.environ.get('NMS_SERVER_PROCESS') == '1' or __name__ == '__main__':
    with app.app_context():
        migrate_schema()
        db.create_all()
        seed_initial_data()


# _get_nms_branding moved to services_wa.py


if __name__ == '__main__':
    with app.app_context():
        migrate_schema()
        db.create_all()
        seed_initial_data()

    # Start alert monitor only in the Werkzeug child process (not the reloader parent)
    # This prevents duplicate alert threads when debug=True
    import os
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        from alerts import run_alert_monitor
        alert_thread = threading.Thread(target=run_alert_monitor, args=(app,), daemon=True)
        alert_thread.start()

    app.run(debug=app.config['DEBUG'], host='0.0.0.0', port=5000)
