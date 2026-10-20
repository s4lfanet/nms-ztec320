"""Mikrotik RouterOS integration — PPPoE/link-state monitoring.

Endpoints:
  GET/POST        /api/mikrotik            list / create device
  PUT/DELETE      /api/mikrotik/<id>       update / delete device
  POST            /api/mikrotik/<id>/test  test connection (live RouterOS query)
  GET             /api/mikrotik/link-state live OnuLinkState map {onu_id: {...}}
  POST            /api/onu/<id>/ping       on-demand ping for one ONU's client IP

Credentials are stored server-side only — the api_password is NEVER returned
to the frontend (masked as '' / kept when left blank on update).
"""
import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_login import login_required

from helpers import log_action, permission_required
from models import db, MikrotikDevice, ONU, OnuLinkState
from routeros_client import RouterOSClient

bp = Blueprint('mikrotik', __name__)
logger = logging.getLogger(__name__)


def _dev_to_dict(d):
    return {
        'id': d.id,
        'name': d.name,
        'host': d.host,
        'api_mode': d.api_mode,
        'api_port': d.api_port,
        'api_ssl': bool(d.api_ssl),
        'api_user': d.api_user,
        'has_password': bool(d.api_password),
        'enabled': bool(d.enabled),
        'ping_enabled': bool(d.ping_enabled),
        'ping_batch': d.ping_batch,
        'last_ok': bool(d.last_ok),
        'last_error': d.last_error or '',
        'last_polled_at': d.last_polled_at.isoformat() + 'Z' if d.last_polled_at else None,
    }


@bp.route('/api/mikrotik', methods=['GET'])
@permission_required('settings_ip_olts')
def list_devices():
    rows = MikrotikDevice.query.order_by(MikrotikDevice.name).all()
    return jsonify({'success': True, 'devices': [_dev_to_dict(d) for d in rows]})


@bp.route('/api/mikrotik', methods=['POST'])
@permission_required('settings_ip_olts')
def create_device():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    host = (data.get('host') or '').strip()
    if not name or not host:
        return jsonify({'success': False, 'message': 'Nama dan host wajib diisi'}), 400
    d = MikrotikDevice(
        name=name, host=host,
        api_mode=(data.get('api_mode') or 'api').lower(),
        api_port=int(data.get('api_port') or 8728),
        api_ssl=bool(data.get('api_ssl')),
        api_user=(data.get('api_user') or '').strip(),
        api_password=data.get('api_password') or '',
        enabled=bool(data.get('enabled', True)),
        ping_enabled=bool(data.get('ping_enabled', True)),
        ping_batch=max(1, int(data.get('ping_batch') or 25)),
    )
    db.session.add(d)
    db.session.commit()
    log_action('mikrotik_add', 'settings', target=name,
               detail=f'{host}:{d.api_port} mode={d.api_mode}')
    return jsonify({'success': True, 'device': _dev_to_dict(d)})


@bp.route('/api/mikrotik/<int:dev_id>', methods=['PUT'])
@permission_required('settings_ip_olts')
def update_device(dev_id):
    d = db.session.get(MikrotikDevice, dev_id)
    if not d:
        return jsonify({'success': False, 'message': 'Device tidak ditemukan'}), 404
    data = request.get_json(silent=True) or {}
    for f in ('name', 'host', 'api_user'):
        if f in data:
            setattr(d, f, (data[f] or '').strip())
    if 'api_mode' in data:
        d.api_mode = (data['api_mode'] or 'api').lower()
    if 'api_port' in data:
        d.api_port = int(data['api_port'] or d.api_port)
    for f in ('api_ssl', 'enabled', 'ping_enabled'):
        if f in data:
            setattr(d, f, bool(data[f]))
    if 'ping_batch' in data:
        d.ping_batch = max(1, int(data['ping_batch'] or d.ping_batch))
    # blank password = keep existing; explicit non-empty = replace
    if data.get('api_password'):
        d.api_password = data['api_password']
    db.session.commit()
    log_action('mikrotik_update', 'settings', target=d.name, detail=f'{d.host}')
    return jsonify({'success': True, 'device': _dev_to_dict(d)})


@bp.route('/api/mikrotik/<int:dev_id>', methods=['DELETE'])
@permission_required('settings_ip_olts')
def delete_device(dev_id):
    d = db.session.get(MikrotikDevice, dev_id)
    if not d:
        return jsonify({'success': False, 'message': 'Device tidak ditemukan'}), 404
    OnuLinkState.query.filter_by(mikrotik_id=dev_id).update({'mikrotik_id': None})
    db.session.delete(d)
    db.session.commit()
    log_action('mikrotik_delete', 'settings', target=d.name)
    return jsonify({'success': True})


@bp.route('/api/mikrotik/<int:dev_id>/test', methods=['POST'])
@permission_required('settings_ip_olts')
def test_device(dev_id):
    d = db.session.get(MikrotikDevice, dev_id)
    if not d:
        return jsonify({'success': False, 'message': 'Device tidak ditemukan'}), 404
    try:
        with RouterOSClient(d.host, d.api_mode, d.api_port, d.api_ssl,
                            d.api_user, d.api_password, timeout=8) as cli:
            identity = cli.get_identity()
            sessions = cli.get_pppoe_active() or []
        d.last_ok, d.last_error = True, ''
        d.last_polled_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.commit()
        return jsonify({'success': True, 'identity': identity,
                        'active_sessions': len(sessions)})
    except Exception as e:
        d.last_ok, d.last_error = False, str(e)[:300]
        db.session.commit()
        return jsonify({'success': False, 'message': str(e)[:300]})


def _state_to_dict(s):
    return {
        'link_state': s.link_state,
        'pppoe_user': s.pppoe_user,
        'pppoe_ip': s.pppoe_ip,
        'session_up': bool(s.session_up),
        'session_uptime': s.session_uptime,
        'rtt_ms': s.rtt_ms,
        'loss_pct': s.loss_pct,
        'checked_at': s.checked_at.isoformat() + 'Z' if s.checked_at else None,
        'ping_checked_at': s.ping_checked_at.isoformat() + 'Z' if s.ping_checked_at else None,
    }


@bp.route('/api/mikrotik/link-state', methods=['GET'])
@login_required
def link_states():
    rows = OnuLinkState.query.all()
    return jsonify({'success': True,
                    'states': {str(s.onu_id): _state_to_dict(s) for s in rows}})


@bp.route('/api/onu/<int:onu_id>/link-state', methods=['GET'])
@login_required
def onu_link_state(onu_id):
    s = OnuLinkState.query.filter_by(onu_id=onu_id).first()
    return jsonify({'success': True, 'state': _state_to_dict(s) if s else None})


@bp.route('/api/onu/<int:onu_id>/ping', methods=['POST'])
@login_required
def ping_onu_client(onu_id):
    """On-demand ping of an ONU's PPPoE client IP — Mikrotik first, VPS fallback."""
    s = OnuLinkState.query.filter_by(onu_id=onu_id).first()
    if not s or not s.pppoe_ip:
        return jsonify({'success': False,
                        'message': 'ONU tidak punya sesi PPPoE aktif (IP client tidak diketahui)'}), 404
    from link_state_poller import ping_from_vps, _classify, _cfg_int
    dev = db.session.get(MikrotikDevice, s.mikrotik_id) if s.mikrotik_id else None
    ping, source = None, 'vps'
    if dev and dev.enabled:
        try:
            with RouterOSClient(dev.host, dev.api_mode, dev.api_port, dev.api_ssl,
                                dev.api_user, dev.api_password, timeout=15) as cli:
                ping = cli.ping(s.pppoe_ip, count=4)
            source = 'mikrotik'
        except Exception as e:
            logger.debug('on-demand mikrotik ping failed: %s', e)
    if ping is None:
        ping = ping_from_vps(s.pppoe_ip, count=3)
    if ping is None:
        return jsonify({'success': False, 'message': 'Ping gagal dieksekusi'}), 500

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    old = s.link_state
    s.link_state, s.fail_count = _classify(
        s, ping, _cfg_int('link_slow_rtt_ms', 150), _cfg_int('link_fail_threshold', 2, 1, 10))
    s.rtt_ms, s.loss_pct = ping.get('avg_rtt_ms'), ping.get('loss_pct')
    s.ping_checked_at = now
    db.session.commit()
    if s.link_state != old:
        from link_state_poller import _broadcast_state
        _broadcast_state(s)
    return jsonify({'success': True, 'source': source, 'ip': s.pppoe_ip,
                    'ping': ping, 'state': _state_to_dict(s)})
