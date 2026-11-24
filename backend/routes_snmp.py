"""API pemantauan perangkat SNMP (ala Observium) — lihat snmp_monitor.py."""
import threading

from flask import Blueprint, jsonify, request, current_app
from flask_login import login_required

from models import db, SnmpDevice, SnmpPort, SnmpSensor, SnmpEvent
from helpers import utc_iso, log_action, permission_required
import snmp_monitor

bp = Blueprint('snmp', __name__)

VERSIONS = ('1', '2c', '3')
V3_LEVELS = ('noAuthNoPriv', 'authNoPriv', 'authPriv')
AUTH_PROTOS = ('MD5', 'SHA', 'SHA256')
PRIV_PROTOS = ('DES', 'AES', 'AES256')


def _iso(v):
    return utc_iso(v) if v else None


def _device_dict(d, ports=None):
    ports = ports if ports is not None else SnmpPort.query.filter_by(device_id=d.id, deleted=False).all()
    active = [p for p in ports if not p.ignored and p.admin_status == 'up']
    return {
        'id': d.id, 'name': d.name, 'host': d.host, 'port': d.port, 'snmp_version': d.snmp_version,
        'v3_user': d.v3_user or '', 'v3_level': d.v3_level, 'v3_auth_proto': d.v3_auth_proto, 'v3_priv_proto': d.v3_priv_proto,
        'has_community': bool(d._community_enc), 'has_auth_pass': bool(d._v3_auth_enc), 'has_priv_pass': bool(d._v3_priv_enc),
        'enabled': d.enabled, 'location': d.location or '', 'notes': d.notes or '',
        'sys_name': d.sys_name or '', 'sys_descr': d.sys_descr or '', 'sys_location': d.sys_location or '',
        'sys_contact': d.sys_contact or '', 'vendor': d.vendor or '', 'os_name': d.os_name or '',
        'hardware': d.hardware or '', 'os_version': d.os_version or '', 'serial': d.serial or '',
        'discovered_at': _iso(d.discovered_at),
        'status': d.status or 'unknown', 'status_reason': d.status_reason or '', 'status_changed_at': _iso(d.status_changed_at),
        'last_poll_at': _iso(d.last_poll_at), 'last_ok_at': _iso(d.last_ok_at), 'poll_ms': d.poll_ms,
        'uptime_s': d.uptime_s, 'cpu_pct': d.cpu_pct, 'mem_pct': d.mem_pct, 'temperature': d.temperature,
        'ports_total': len(active), 'ports_up': sum(1 for p in active if p.oper_status == 'up'),
        'ports_down': sum(1 for p in active if p.oper_status != 'up'),
    }


def _port_dict(p):
    return {
        'id': p.id, 'if_index': p.if_index, 'name': p.name, 'descr': p.descr, 'alias': p.alias,
        'if_type': p.if_type, 'speed_mbps': p.speed_mbps, 'mac': p.mac,
        'admin_status': p.admin_status, 'oper_status': p.oper_status, 'status_changed_at': _iso(p.status_changed_at),
        'ignored': p.ignored, 'in_bps': p.in_bps, 'out_bps': p.out_bps,
        'in_err_rate': p.in_err_rate, 'out_err_rate': p.out_err_rate,
        'in_errors': p.in_errors, 'out_errors': p.out_errors,
        'util_pct': round(max(p.in_bps or 0, p.out_bps or 0) / (p.speed_mbps * 1e6) * 100, 1) if p.speed_mbps else None,
    }


def _apply(d, data, creating=False):
    """Validasi & isi field dari payload. → pesan error / None."""
    if 'name' in data or creating:
        name = (data.get('name') or '').strip()
        if not name:
            return 'Nama wajib diisi'
        d.name = name[:100]
    if 'host' in data or creating:
        host = (data.get('host') or '').strip()
        if not host or ' ' in host or len(host) > 255:
            return 'IP/hostname tidak valid'
        d.host = host
    if 'port' in data:
        try:
            port = int(data.get('port') or 161)
        except (TypeError, ValueError):
            return 'Port harus angka'
        if not 1 <= port <= 65535:
            return 'Port harus 1–65535'
        d.port = port
    if 'snmp_version' in data:
        if data['snmp_version'] not in VERSIONS:
            return 'Versi SNMP harus 1, 2c, atau 3'
        d.snmp_version = data['snmp_version']
    if data.get('community'):
        d.community = data['community'].strip()
    for k, allowed in (('v3_level', V3_LEVELS), ('v3_auth_proto', AUTH_PROTOS), ('v3_priv_proto', PRIV_PROTOS)):
        if k in data and data[k]:
            if data[k] not in allowed:
                return f'{k} tidak valid'
            setattr(d, k, data[k])
    if 'v3_user' in data:
        d.v3_user = (data.get('v3_user') or '').strip()[:100]
    if data.get('v3_auth_pass'):
        if len(data['v3_auth_pass']) < 8:
            return 'Password auth SNMPv3 minimal 8 karakter'
        d.v3_auth_pass = data['v3_auth_pass']
    if data.get('v3_priv_pass'):
        if len(data['v3_priv_pass']) < 8:
            return 'Password privasi SNMPv3 minimal 8 karakter'
        d.v3_priv_pass = data['v3_priv_pass']
    for k in ('location', 'notes'):
        if k in data:
            setattr(d, k, (data.get(k) or '').strip()[:2000])
    if 'enabled' in data:
        d.enabled = bool(data['enabled'])
    if (d.snmp_version or '2c') == '3' and not d.v3_user:
        return 'User SNMPv3 wajib diisi'
    if (d.snmp_version or '2c') != '3' and not d._community_enc:
        return 'Community wajib diisi'
    return None


def _kick(device_id, discover=True):
    """Discovery + poll satu perangkat di thread latar (tidak menahan request)."""
    app = current_app._get_current_object()

    def work():
        with app.app_context():
            dev = db.session.get(SnmpDevice, device_id)
            if not dev:
                return
            try:
                if discover:
                    snmp_monitor.discover_device(dev)
                snmp_monitor.poll_all([dev])
            except Exception:
                db.session.rollback()
    threading.Thread(target=work, daemon=True, name=f'snmp-kick-{device_id}').start()


@bp.route('/api/snmp/devices', methods=['GET'])
@login_required
def snmp_devices_list():
    devs = SnmpDevice.query.order_by(SnmpDevice.name).all()
    ports = {}
    for p in SnmpPort.query.filter_by(deleted=False).all():
        ports.setdefault(p.device_id, []).append(p)
    items = [_device_dict(d, ports.get(d.id, [])) for d in devs]
    summary = {s: sum(1 for i in items if i['status'] == s and i['enabled']) for s in ('up', 'down', 'warn', 'unknown')}
    summary['ports_down'] = sum(i['ports_down'] for i in items if i['enabled'])
    return jsonify({'success': True, 'devices': items, 'summary': summary})


@bp.route('/api/snmp/devices/<int:device_id>', methods=['GET'])
@login_required
def snmp_device_get(device_id):
    d = db.session.get(SnmpDevice, device_id)
    if not d:
        return jsonify({'success': False, 'message': 'Perangkat tidak ditemukan'}), 404
    ports = SnmpPort.query.filter_by(device_id=d.id, deleted=False).order_by(SnmpPort.if_index).all()
    sensors = SnmpSensor.query.filter_by(device_id=d.id).order_by(SnmpSensor.kind, SnmpSensor.name).all()
    events = SnmpEvent.query.filter_by(device_id=d.id).order_by(SnmpEvent.created_at.desc()).limit(100).all()
    return jsonify({
        'success': True, 'device': _device_dict(d, ports),
        'ports': [_port_dict(p) for p in ports],
        'sensors': [{'id': s.id, 'kind': s.kind, 'name': s.name, 'value': s.value, 'unit': s.unit,
                     'updated_at': _iso(s.updated_at)} for s in sensors],
        'events': [{'id': e.id, 'kind': e.kind, 'severity': e.severity, 'message': e.message,
                    'port_id': e.port_id, 'created_at': _iso(e.created_at)} for e in events],
    })


@bp.route('/api/snmp/devices', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def snmp_device_create():
    data = request.get_json() or {}
    d = SnmpDevice(snmp_version=data.get('snmp_version') or '2c', port=161)
    err = _apply(d, data, creating=True)
    if err:
        return jsonify({'success': False, 'message': err}), 400
    db.session.add(d)
    db.session.commit()
    log_action('snmp_device_add', 'monitoring', target=f'{d.name} ({d.host})')
    _kick(d.id)
    return jsonify({'success': True, 'device': _device_dict(d, [])})


@bp.route('/api/snmp/devices/<int:device_id>', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def snmp_device_update(device_id):
    d = db.session.get(SnmpDevice, device_id)
    if not d:
        return jsonify({'success': False, 'message': 'Perangkat tidak ditemukan'}), 404
    data = request.get_json() or {}
    creds_before = (d.host, d.port, d.snmp_version, d._community_enc, d.v3_user, d._v3_auth_enc, d._v3_priv_enc)
    err = _apply(d, data)
    if err:
        db.session.rollback()
        return jsonify({'success': False, 'message': err}), 400
    db.session.commit()
    log_action('snmp_device_edit', 'monitoring', target=f'{d.name} ({d.host})')
    if creds_before != (d.host, d.port, d.snmp_version, d._community_enc, d.v3_user, d._v3_auth_enc, d._v3_priv_enc) and d.enabled:
        _kick(d.id)
    return jsonify({'success': True, 'device': _device_dict(d)})


@bp.route('/api/snmp/devices/<int:device_id>', methods=['DELETE'])
@login_required
@permission_required('settings_ip_olts')
def snmp_device_delete(device_id):
    d = db.session.get(SnmpDevice, device_id)
    if not d:
        return jsonify({'success': False, 'message': 'Perangkat tidak ditemukan'}), 404
    for model in (SnmpPort, SnmpSensor, SnmpEvent):
        model.query.filter_by(device_id=d.id).delete()
    from models import Notification
    for n in Notification.query.filter_by(target_type='snmp', target_id=d.id, resolved=False).all():
        n.resolved, n.is_read = True, True
    name = f'{d.name} ({d.host})'
    db.session.delete(d)
    db.session.commit()
    log_action('snmp_device_delete', 'monitoring', target=name)
    return jsonify({'success': True})


@bp.route('/api/snmp/devices/<int:device_id>/discover', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def snmp_device_discover(device_id):
    d = db.session.get(SnmpDevice, device_id)
    if not d:
        return jsonify({'success': False, 'message': 'Perangkat tidak ditemukan'}), 404
    _kick(d.id, discover=True)
    return jsonify({'success': True, 'message': 'Discovery dimulai — hasil muncul dalam beberapa detik'})


@bp.route('/api/snmp/test', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def snmp_test():
    """Uji kredensial tanpa menyimpan. Bila `device_id` diberi dan password
    dikosongkan, kredensial tersimpan dipakai."""
    data = request.get_json() or {}
    d = db.session.get(SnmpDevice, data['device_id']) if data.get('device_id') else None
    tmp = SnmpDevice(snmp_version='2c', port=161)
    if d:
        tmp._community_enc, tmp._v3_auth_enc, tmp._v3_priv_enc = d._community_enc, d._v3_auth_enc, d._v3_priv_enc
        tmp.v3_user, tmp.host, tmp.port, tmp.snmp_version = d.v3_user, d.host, d.port, d.snmp_version
        tmp.v3_level, tmp.v3_auth_proto, tmp.v3_priv_proto = d.v3_level, d.v3_auth_proto, d.v3_priv_proto
    data.setdefault('name', 'test')
    err = _apply(tmp, data, creating=not d)
    if err:
        return jsonify({'success': False, 'message': err}), 400
    res = snmp_monitor.test_connection(snmp_monitor.device_params(tmp))
    return jsonify({'success': True, **res})


@bp.route('/api/snmp/ports/<int:port_id>', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def snmp_port_update(port_id):
    p = db.session.get(SnmpPort, port_id)
    if not p:
        return jsonify({'success': False, 'message': 'Port tidak ditemukan'}), 404
    data = request.get_json() or {}
    if 'ignored' in data:
        p.ignored = bool(data['ignored'])
    db.session.commit()
    return jsonify({'success': True, 'port': _port_dict(p)})
