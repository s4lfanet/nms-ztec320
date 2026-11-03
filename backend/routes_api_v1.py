"""REST API v1 — token-authenticated endpoints for external integrations.
Bearer token auth via ApiToken. Per-token rate limiting. Owner OLT access control.
Consistent response shape: {success, data, error, meta}."""
import hashlib
import time
from datetime import datetime, timezone, timedelta
from functools import wraps

from flask import Blueprint, request, jsonify, g
from sqlalchemy import or_

from models import db, ApiToken, OLT, ONU, AlertHistory, Notification, OnuLinkState
from extensions import logger

bp = Blueprint('api_v1', __name__, url_prefix='/api/v1')

# Simple in-memory rate limiter: {token_hash: [timestamps]}
_rate_buckets: dict = {}
_RATE_LIMIT = 100  # requests per minute per token


def _rate_check(token_hash):
    """Simple sliding-window rate limiter. Returns True if allowed."""
    now = time.time()
    window = 60.0
    bucket = _rate_buckets.get(token_hash, [])
    bucket = [t for t in bucket if now - t < window]
    if len(bucket) >= _RATE_LIMIT:
        _rate_buckets[token_hash] = bucket
        return False
    bucket.append(now)
    _rate_buckets[token_hash] = bucket
    return True


def api_auth(required_ability='*'):
    """Decorator: validate bearer token + ability + rate limit.
    Sets g.api_token, g.api_user on success."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            auth = request.headers.get('Authorization', '')
            if not auth.startswith('Bearer '):
                return _err('Missing or invalid Authorization header. Use: Bearer <token>', 401)
            raw = auth[7:].strip()
            if not raw:
                return _err('Empty token', 401)
            token_hash = ApiToken.hash_token(raw)
            token = ApiToken.query.filter_by(token_hash=token_hash).first()
            if not token:
                return _err('Invalid token', 401)
            if not token.is_valid():
                return _err('Token expired or revoked', 401)
            if required_ability != '*' and not token.has_ability(required_ability):
                return _err(f'Token lacks ability: {required_ability}', 403)
            if not _rate_check(token_hash):
                return _err('Rate limit exceeded (100/min)', 429)
            # Update last used
            token.last_used_at = datetime.now(timezone.utc)
            token.last_used_ip = request.remote_addr or ''
            db.session.commit()
            g.api_token = token
            g.api_user = token.user
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def _err(msg, code=400):
    return jsonify({'success': False, 'error': msg, 'data': None}), code


def _ok(data, meta=None):
    return jsonify({'success': True, 'data': data, 'error': None, 'meta': meta or {}})


def _user_olt_ids():
    """Return set of OLT IDs the token user can access.
    Super admin → all; otherwise filter by user's assigned OLTs."""
    user = g.api_user
    if user.is_super_admin:
        return None  # None = no filter (all)
    # Non-super users: return their OLT IDs (via technician assignment or explicit)
    # For now, super_admin gets all; others get OLTs where they're assigned technician
    olt_ids = set()
    for olt in OLT.query.all():
        if olt.technician_id == user.id:
            olt_ids.add(olt.id)
    return olt_ids  # empty set = no access


# ─── ONU endpoints ───

@bp.route('/onus', methods=['GET'])
@api_auth('onus:read')
def list_onus():
    """List ONUs. Optional filters: olt_id, status, search (name/serial).
    Pagination: ?page=1&per_page=50 (max 200)."""
    q = ONU.query
    olt_ids = _user_olt_ids()
    if olt_ids is not None:
        q = q.filter(ONU.olt_id.in_(olt_ids))
    olt_id = request.args.get('olt_id')
    if olt_id:
        q = q.filter(ONU.olt_id == int(olt_id))
    status = request.args.get('status')
    if status:
        q = q.filter(ONU.status == status)
    search = request.args.get('search')
    if search:
        q = q.filter(or_(
            ONU.name.ilike(f'%{search}%'),
            ONU.serial_number.ilike(f'%{search}%'),
            ONU.pppoe.ilike(f'%{search}%'),
        ))
    page = max(1, int(request.args.get('page', 1)))
    per_page = min(200, max(1, int(request.args.get('per_page', 50))))
    total = q.count()
    rows = q.order_by(ONU.id).offset((page - 1) * per_page).limit(per_page).all()
    olt_map = {o.id: o.name for o in OLT.query.all()}
    data = [_onu_dict(r, olt_map) for r in rows]
    return _ok(data, {'page': page, 'per_page': per_page, 'total': total})


@bp.route('/onus/<int:onu_id>', methods=['GET'])
@api_auth('onus:read')
def get_onu(onu_id):
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return _err('ONU not found', 404)
    olt_ids = _user_olt_ids()
    if olt_ids is not None and onu.olt_id not in olt_ids:
        return _err('Access denied to this ONU', 403)
    olt_map = {o.id: o.name for o in OLT.query.all()}
    return _ok(_onu_dict(onu, olt_map))


def _onu_dict(onu, olt_map):
    return {
        'id': onu.id, 'name': onu.name or '', 'serial': onu.serial_number or '',
        'olt_id': onu.olt_id, 'olt_name': olt_map.get(onu.olt_id, ''),
        'status': onu.status, 'rx_power': onu.rx_power, 'tx_power': onu.tx_power,
        'onu_rx_power': onu.onu_rx_power, 'distance': onu.distance,
        'pppoe': onu.pppoe or '', 'actual_type': onu.actual_type or '',
        'onu_id_str': onu.onu_id_str, 'frame': onu.frame, 'slot': onu.slot,
        'port': onu.port, 'onu_id': onu.onu_id,
        'last_seen': onu.last_seen.isoformat() + 'Z' if onu.last_seen else None,
    }


# ─── OLT endpoints ───

@bp.route('/olts', methods=['GET'])
@api_auth('olts:read')
def list_olts():
    q = OLT.query
    olt_ids = _user_olt_ids()
    if olt_ids is not None:
        q = q.filter(OLT.id.in_(olt_ids))
    rows = q.order_by(OLT.id).all()
    data = [{
        'id': o.id, 'name': o.name, 'ip_address': o.ip_address,
        'vendor': o.vendor or '', 'is_online': bool(o.is_online),
        'monitoring_enabled': bool(o.monitoring_enabled),
        'onu_count': ONU.query.filter_by(olt_id=o.id).count(),
    } for o in rows]
    return _ok(data)


@bp.route('/olts/<int:olt_id>', methods=['GET'])
@api_auth('olts:read')
def get_olt(olt_id):
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return _err('OLT not found', 404)
    olt_ids = _user_olt_ids()
    if olt_ids is not None and olt.id not in olt_ids:
        return _err('Access denied', 403)
    return _ok({
        'id': olt.id, 'name': olt.name, 'ip_address': olt.ip_address,
        'vendor': olt.vendor or '', 'is_online': bool(o.is_online),
        'monitoring_enabled': bool(o.monitoring_enabled),
        'firmware_version': olt.firmware_version or '',
        'onu_count': ONU.query.filter_by(olt_id=olt.id).count(),
    })


# ─── Alert endpoints ───

@bp.route('/alerts', methods=['GET'])
@api_auth('alerts:read')
def list_alerts():
    """Recent alert history. ?limit=50 (max 200)."""
    limit = min(200, max(1, int(request.args.get('limit', 50))))
    olt_ids = _user_olt_ids()
    q = AlertHistory.query
    if olt_ids is not None:
        q = q.filter(or_(
            AlertHistory.olt_id.in_(olt_ids),
            AlertHistory.olt_id.is_(None),
        ))
    rows = q.order_by(AlertHistory.last_alert_at.desc()).limit(limit).all()
    data = [{
        'id': r.id, 'alert_type': r.alert_type,
        'olt_id': r.olt_id, 'onu_id': r.onu_id,
        'last_value': r.last_value or '',
        'last_alert_at': r.last_alert_at.isoformat() + 'Z' if r.last_alert_at else None,
        'suppressed_by': r.suppressed_by or '',
    } for r in rows]
    return _ok(data)


# ─── Link state endpoints ───

@bp.route('/link-states', methods=['GET'])
@api_auth('onus:read')
def list_link_states():
    """Current PPPoE/ping link states. ?olt_id= filter."""
    q = OnuLinkState.query
    olt_ids = _user_olt_ids()
    if olt_ids is not None:
        q = q.filter(OnuLinkState.olt_id.in_(olt_ids))
    olt_id = request.args.get('olt_id')
    if olt_id:
        q = q.filter(OnuLinkState.olt_id == int(olt_id))
    rows = q.all()
    data = [{
        'onu_id': r.onu_id, 'link_state': r.link_state or 'unknown',
        'pppoe_ip': r.pppoe_ip or '', 'rtt_ms': r.rtt_ms,
        'loss_pct': r.loss_pct, 'session_uptime': r.session_uptime or '',
        'checked_at': r.checked_at.isoformat() + 'Z' if r.checked_at else None,
    } for r in rows]
    return _ok(data)


# ─── Token management (session-auth, not bearer) ───

from flask_login import login_required, current_user
from helpers import permission_required, log_action

_TOKEN_PERM = 'manage_api_tokens'


@bp.route('/tokens', methods=['GET'])
@login_required
@permission_required(_TOKEN_PERM)
def list_tokens():
    """List all API tokens (masked)."""
    tokens = ApiToken.query.order_by(ApiToken.created_at.desc()).all()
    data = [{
        'id': t.id, 'name': t.name, 'prefix': t.prefix,
        'user': t.user.username if t.user else '',
        'abilities': t.abilities, 'revoked': t.revoked,
        'expires_at': t.expires_at.isoformat() + 'Z' if t.expires_at else None,
        'last_used_at': t.last_used_at.isoformat() + 'Z' if t.last_used_at else None,
        'last_used_ip': t.last_used_ip or '',
        'created_at': t.created_at.isoformat() + 'Z' if t.created_at else None,
    } for t in tokens]
    return _ok(data)


@bp.route('/tokens', methods=['POST'])
@login_required
@permission_required(_TOKEN_PERM)
def create_token():
    """Create a new API token. Returns the raw token ONCE."""
    import json
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return _err('Name required'), 400
    abilities = data.get('abilities', '*')
    expires_days = data.get('expires_days')
    raw = ApiToken.generate_token()
    token = ApiToken(
        name=name,
        token_hash=ApiToken.hash_token(raw),
        prefix=raw[:12],
        user_id=current_user.id,
        abilities=abilities,
    )
    if expires_days:
        token.expires_at = datetime.now(timezone.utc) + timedelta(days=int(expires_days))
    db.session.add(token)
    db.session.commit()
    log_action('api_token_create', 'settings', detail=f'name={name} abilities={abilities}')
    return _ok({'token': raw, 'id': token.id, 'name': name, 'abilities': abilities,
                'expires_at': token.expires_at.isoformat() + 'Z' if token.expires_at else None})


@bp.route('/tokens/<int:token_id>/revoke', methods=['POST'])
@login_required
@permission_required(_TOKEN_PERM)
def revoke_token(token_id):
    token = db.session.get(ApiToken, token_id)
    if not token:
        return _err('Token not found'), 404
    token.revoked = True
    db.session.commit()
    log_action('api_token_revoke', 'settings', detail=f'name={token.name}')
    return _ok({'id': token.id, 'revoked': True})
