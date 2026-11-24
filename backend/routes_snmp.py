"""API pemantauan perangkat SNMP (ala Observium) — lihat snmp_monitor.py."""
import threading

from flask import Blueprint, jsonify, request, current_app
from flask_login import login_required, current_user

import json
from datetime import timedelta

from models import db, SnmpDevice, SnmpPort, SnmpSensor, SnmpEvent, SnmpSample, SnmpSampleHourly, SnmpNeighbor
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
        # Community v1/v2c ditampilkan apa adanya untuk pengelola (seperti community OLT);
        # password SNMPv3 tetap tidak pernah dikirim.
        'community': (d.community or '') if _can_manage_devices() else '',
    }


def _can_manage_devices():
    try:
        return bool(current_user.is_authenticated and current_user.has_permission('settings_ip_olts'))
    except Exception:
        return False


def _port_dict(p):
    return {
        'id': p.id, 'if_index': p.if_index, 'name': p.name, 'descr': p.descr, 'alias': p.alias,
        'if_type': p.if_type, 'speed_mbps': p.speed_mbps, 'mac': p.mac,
        'admin_status': p.admin_status, 'oper_status': p.oper_status, 'status_changed_at': _iso(p.status_changed_at),
        'ignored': p.ignored, 'watched': bool(p.watched), 'in_bps': p.in_bps, 'out_bps': p.out_bps,
        'in_err_rate': p.in_err_rate, 'out_err_rate': p.out_err_rate,
        'in_errors': p.in_errors, 'out_errors': p.out_errors,
        'in_pps': p.in_pps, 'out_pps': p.out_pps,
        # ringkas untuk daftar port; detail lengkap di GET /api/snmp/ports/<id>
        'rx_dbm': p.dom_rx_dbm, 'tx_dbm': p.dom_tx_dbm, 'rx_loss': p.dom_rx_loss,
        'sfp_type': (json.loads(p.sfp_info).get('type') if p.sfp_info else None) or None,
        # counter sudah pernah dibaca tapi laju belum ada → UI menulis "menunggu poll berikutnya"
        'has_counters': p.counter_at is not None,
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
        'neighbors': _neighbors_of(d.id),
    })


def _neighbors_of(device_id):
    names = {x.id: x.name for x in SnmpDevice.query.all()}
    ports = {p.id: p for p in SnmpPort.query.filter_by(deleted=False).all()}
    rows = SnmpNeighbor.query.filter_by(device_id=device_id).order_by(SnmpNeighbor.local_if_index).all()
    out = []
    for n in rows:
        lp, rp = ports.get(n.port_id), ports.get(n.remote_port_id)
        out.append({'id': n.id, 'protocol': n.protocol, 'local_port': lp.name if lp else '', 'local_port_id': n.port_id,
                    'remote_name': n.remote_name, 'remote_ip': n.remote_ip, 'remote_chassis': n.remote_chassis,
                    'remote_port': rp.name if rp else (n.remote_port or n.remote_port_descr),
                    'remote_platform': n.remote_platform, 'remote_device_id': n.remote_device_id,
                    'remote_device_name': names.get(n.remote_device_id, ''), 'last_seen': _iso(n.last_seen)})
    return out


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
    for model in (SnmpPort, SnmpSensor, SnmpEvent, SnmpSample, SnmpSampleHourly, SnmpNeighbor):
        model.query.filter_by(device_id=d.id).delete()
    SnmpNeighbor.query.filter_by(remote_device_id=d.id).update({'remote_device_id': None, 'remote_port_id': None})
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
    if 'watched' in data:
        p.watched = bool(data['watched'])
    db.session.commit()
    return jsonify({'success': True, 'port': _port_dict(p)})


# ─── Grafik riwayat (tahap 2) ───

RANGES = {  # rentang → (durasi, sumber, bucket detik)
    '6h': (timedelta(hours=6), 'raw', 0),
    '24h': (timedelta(hours=24), 'raw', 0),
    '7d': (timedelta(days=7), 'hourly', 3600),
    '30d': (timedelta(days=30), 'hourly', 3600 * 3),
    '1y': (timedelta(days=365), 'hourly', 86400),
}


def _p95(values):
    if not values:
        return None
    v = sorted(values)
    return v[max(0, int(round(0.95 * len(v))) - 1)]


def build_graph(device_id, port_id, metrics, rng):
    """→ {series: {metric: [{t, avg, max}]}, stats: {metric: {...}}, source, step_s}."""
    dur, source, bucket = RANGES[rng]
    now = snmp_monitor._now()
    start = now - dur
    out, stats = {}, {}
    for m in metrics:
        if source == 'raw':
            q = SnmpSample.query.filter(SnmpSample.device_id == device_id, SnmpSample.metric == m, SnmpSample.ts >= start)
            q = q.filter(SnmpSample.port_id == port_id) if port_id else q.filter(SnmpSample.port_id.is_(None))
            rows = q.order_by(SnmpSample.ts).all()
            pts = [{'t': _iso(r.ts), 'avg': r.value, 'max': r.value} for r in rows]
            vals = [r.value for r in rows]
            peak = max(vals) if vals else None
        else:
            q = SnmpSampleHourly.query.filter(SnmpSampleHourly.device_id == device_id, SnmpSampleHourly.metric == m,
                                              SnmpSampleHourly.hour >= start)
            q = q.filter(SnmpSampleHourly.port_id == port_id) if port_id else q.filter(SnmpSampleHourly.port_id.is_(None))
            rows = q.order_by(SnmpSampleHourly.hour).all()
            buckets = {}
            for r in rows:
                if not r.count:
                    continue
                epoch = int(r.hour.timestamp()) // bucket * bucket
                b = buckets.setdefault(epoch, {'t': r.hour, 'total': 0.0, 'count': 0, 'max': None})
                b['total'] += r.total
                b['count'] += r.count
                b['max'] = r.vmax if b['max'] is None else max(b['max'], r.vmax or 0)
            pts = [{'t': _iso(b['t']), 'avg': b['total'] / b['count'], 'max': b['max']} for _, b in sorted(buckets.items())]
            vals = [r.total / r.count for r in rows if r.count]   # p95 dari rata-rata per jam
            peak = max((r.vmax for r in rows if r.vmax is not None), default=None)
        stats[m] = {
            'current': pts[-1]['avg'] if pts else None,
            'avg': (sum(vals) / len(vals)) if vals else None,
            'max': peak,
            'p95': _p95(vals),
            'samples': len(vals),
        }
        out[m] = pts
    return {'series': out, 'stats': stats, 'source': source, 'range': rng}


@bp.route('/api/snmp/graph', methods=['GET'])
@login_required
def snmp_graph():
    device_id = request.args.get('device_id', type=int)
    port_id = request.args.get('port_id', type=int)
    rng = request.args.get('range', '24h')
    metrics = [m for m in (request.args.get('metrics') or '').split(',') if m][:12]
    if not device_id or rng not in RANGES or not metrics:
        return jsonify({'success': False, 'message': 'device_id, metrics, dan range (6h/24h/7d/30d/1y) wajib'}), 400
    if port_id and not SnmpPort.query.filter_by(id=port_id, device_id=device_id).first():
        return jsonify({'success': False, 'message': 'Port tidak ditemukan'}), 404
    return jsonify({'success': True, **build_graph(device_id, port_id, metrics, rng)})


@bp.route('/api/snmp/devices/<int:device_id>/metrics', methods=['GET'])
@login_required
def snmp_device_metrics(device_id):
    """Daftar seri perangkat yang punya riwayat (cpu, memory:…, temperature:…)."""
    rows = db.session.query(SnmpSampleHourly.metric).filter(
        SnmpSampleHourly.device_id == device_id, SnmpSampleHourly.port_id.is_(None)).distinct().all()
    names = {f'{s.kind}:{s.key}': s.name for s in SnmpSensor.query.filter_by(device_id=device_id).all()}
    return jsonify({'success': True, 'metrics': [{'metric': r[0], 'name': names.get(r[0], r[0])} for r in rows]})


# ─── Tahap 3: ambang alert, ringkasan, laporan bulanan ───

import csv  # noqa: E402
import io  # noqa: E402
from datetime import datetime  # noqa: E402

from flask import Response  # noqa: E402

import snmp_alerts  # noqa: E402
from models import Notification  # noqa: E402


@bp.route('/api/snmp/settings', methods=['GET'])
@login_required
def snmp_settings_get():
    return jsonify({'success': True, 'settings': snmp_alerts.get_settings(), 'defaults': snmp_alerts.DEFAULTS})


@bp.route('/api/snmp/settings', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def snmp_settings_put():
    changed = snmp_alerts.save_settings(request.get_json() or {})
    db.session.commit()
    if changed:
        log_action('snmp_settings', 'monitoring', target='SNMP', detail=', '.join(changed))
    return jsonify({'success': True, 'settings': snmp_alerts.get_settings()})


def _util(p):
    if not p.speed_mbps:
        return None
    return round(max(p.in_bps or 0, p.out_bps or 0) / (p.speed_mbps * 1e6) * 100, 1)


def _port_brief(p, d):
    return {'port_id': p.id, 'device_id': d.id, 'device_name': d.name, 'name': p.name, 'alias': p.alias or '',
            'speed_mbps': p.speed_mbps, 'oper_status': p.oper_status, 'in_bps': p.in_bps, 'out_bps': p.out_bps,
            'util_pct': _util(p), 'watched': bool(p.watched),
            'err_rate': round((p.in_err_rate or 0) + (p.out_err_rate or 0), 3)}


@bp.route('/api/snmp/summary', methods=['GET'])
@login_required
def snmp_summary():
    """Ringkasan untuk halaman Perangkat & dashboard: jumlah per status, masalah
    aktif (alert terbuka + perangkat turun), port dipantau, dan trafik teratas."""
    devices = SnmpDevice.query.all()
    by_id = {d.id: d for d in devices}
    counts = {'total': len(devices), 'up': 0, 'warn': 0, 'down': 0, 'unknown': 0, 'disabled': 0}
    for d in devices:
        key = 'disabled' if not d.enabled else (d.status if d.status in counts else 'unknown')
        counts[key] += 1
    enabled_ids = [d.id for d in devices if d.enabled]
    ports = SnmpPort.query.filter(SnmpPort.device_id.in_(enabled_ids), SnmpPort.deleted.is_(False),
                                  SnmpPort.ignored.is_(False)).all() if enabled_ids else []
    port_by_id = {p.id: p for p in ports}

    problems = []
    seen_dev = set()
    cats = ('snmp_down',) + snmp_alerts.CATEGORIES
    for n in Notification.query.filter(Notification.category.in_(cats), Notification.resolved.is_(False)) \
            .order_by(Notification.created_at.desc()).limit(200).all():
        if n.target_type == 'snmp':
            d = by_id.get(n.target_id)
            port = None
        elif n.target_type == 'snmp_port':
            port = port_by_id.get(n.target_id)
            d = by_id.get(port.device_id) if port else None
        else:
            continue
        if not d or not d.enabled:
            continue
        if n.category == 'snmp_down':
            seen_dev.add(d.id)
        problems.append({'category': n.category, 'severity': n.severity, 'title': n.title,
                         'device_id': d.id, 'device_name': d.name, 'port_id': port.id if port else None,
                         'since': _iso(n.created_at)})
    for d in devices:  # perangkat turun/warn yang belum jadi alert (belum lewat batas menit)
        if d.enabled and d.status in ('down', 'warn') and d.id not in seen_dev:
            problems.append({'category': 'device_' + d.status, 'severity': 'critical' if d.status == 'down' else 'warning',
                             'title': d.status_reason or d.status, 'device_id': d.id, 'device_name': d.name,
                             'port_id': None, 'since': _iso(d.status_changed_at)})
    rank = {'critical': 0, 'warning': 1}
    problems.sort(key=lambda x: rank.get(x['severity'], 2))

    live = [p for p in ports if by_id[p.device_id].status == 'up']
    top = sorted((p for p in live if (p.in_bps or 0) + (p.out_bps or 0) > 0),
                 key=lambda p: max(p.in_bps or 0, p.out_bps or 0), reverse=True)[:10]
    watched = sorted((p for p in ports if p.watched), key=lambda p: (by_id[p.device_id].name, p.if_index))
    return jsonify({'success': True, 'counts': counts, 'problems': problems[:50],
                    'top_ports': [_port_brief(p, by_id[p.device_id]) for p in top],
                    'watched_ports': [_port_brief(p, by_id[p.device_id]) for p in watched]})


def _month_bounds(month, tz_min):
    """'YYYY-MM' + offset zona waktu (menit, mis. 420 = WIB) → (awal, akhir) UTC naif."""
    y, m = (int(x) for x in month.split('-'))
    start_local = datetime(y, m, 1)
    end_local = datetime(y + (m == 12), m % 12 + 1, 1)
    off = timedelta(minutes=tz_min)
    return start_local - off, end_local - off


def _availability(device_id, start, end, now):
    """Persen waktu perangkat terjangkau dari event device_down/device_up."""
    stop = min(end, now)
    if stop <= start:
        return None
    last = SnmpEvent.query.filter(SnmpEvent.device_id == device_id, SnmpEvent.kind.in_(('device_down', 'device_up')),
                                  SnmpEvent.created_at < start).order_by(SnmpEvent.created_at.desc()).first()
    down_since = start if last and last.kind == 'device_down' else None
    downtime = 0.0
    for e in SnmpEvent.query.filter(SnmpEvent.device_id == device_id, SnmpEvent.kind.in_(('device_down', 'device_up')),
                                    SnmpEvent.created_at >= start, SnmpEvent.created_at < stop) \
            .order_by(SnmpEvent.created_at).all():
        if e.kind == 'device_down' and down_since is None:
            down_since = e.created_at
        elif e.kind == 'device_up' and down_since is not None:
            downtime += (e.created_at - down_since).total_seconds()
            down_since = None
    if down_since is not None:
        downtime += (stop - down_since).total_seconds()
    total = (stop - start).total_seconds()
    return round(max(0.0, 100 - downtime / total * 100), 3), round(downtime / 60)


def build_report(month, tz_min=0, device_id=None, scope='watched'):
    start, end = _month_bounds(month, tz_min)
    now = snmp_monitor._now()
    q = SnmpPort.query.filter(SnmpPort.deleted.is_(False), SnmpPort.ignored.is_(False))
    if device_id:
        q = q.filter(SnmpPort.device_id == device_id)
    if scope == 'watched':
        q = q.filter(SnmpPort.watched.is_(True))
    ports = q.all()
    devs = {d.id: d for d in SnmpDevice.query.all()}
    hours_elapsed = max(1, int((min(end, now) - start).total_seconds() // 3600)) if now > start else 0
    rows = []
    if ports:
        hourly = SnmpSampleHourly.query.filter(
            SnmpSampleHourly.port_id.in_([p.id for p in ports]), SnmpSampleHourly.metric.in_(('in', 'out')),
            SnmpSampleHourly.hour >= start, SnmpSampleHourly.hour < end).all()
        series = {}
        for r in hourly:
            if r.count:
                series.setdefault((r.port_id, r.metric), []).append(r)
        for p in ports:
            d = devs.get(p.device_id)
            if not d:
                continue
            row = {'port_id': p.id, 'device_id': d.id, 'device_name': d.name, 'port': p.name, 'alias': p.alias or '',
                   'speed_mbps': p.speed_mbps, 'watched': bool(p.watched)}
            hours = 0
            for m in ('in', 'out'):
                rs = series.get((p.id, m), [])
                avgs = [r.total / r.count for r in rs]
                hours = max(hours, len(rs))
                row[m] = {
                    'avg_bps': round(sum(r.total for r in rs) / sum(r.count for r in rs), 1) if rs else None,
                    'max_bps': max((r.vmax for r in rs if r.vmax is not None), default=None),
                    'p95_bps': _p95(avgs),
                    'volume_bytes': round(sum(a * 3600 / 8 for a in avgs)),
                }
            peak = max((row[m]['max_bps'] or 0) for m in ('in', 'out'))
            p95 = max((row[m]['p95_bps'] or 0) for m in ('in', 'out'))
            cap = (p.speed_mbps or 0) * 1e6
            row['peak_util_pct'] = round(peak / cap * 100, 1) if cap and peak else None
            row['p95_util_pct'] = round(p95 / cap * 100, 1) if cap and p95 else None
            row['coverage_pct'] = round(hours / hours_elapsed * 100, 1) if hours_elapsed else 0
            if scope != 'watched' and not hours:
                continue
            rows.append(row)
    rows.sort(key=lambda r: (r['device_name'], r['port']))
    dev_rows = []
    for d in sorted(devs.values(), key=lambda d: d.name):
        if device_id and d.id != device_id:
            continue
        av = _availability(d.id, start, end, now)
        cpu = SnmpSampleHourly.query.filter(SnmpSampleHourly.device_id == d.id, SnmpSampleHourly.port_id.is_(None),
                                            SnmpSampleHourly.metric == 'cpu:cpu', SnmpSampleHourly.hour >= start,
                                            SnmpSampleHourly.hour < end).all()
        temps = SnmpSampleHourly.query.filter(SnmpSampleHourly.device_id == d.id, SnmpSampleHourly.port_id.is_(None),
                                              SnmpSampleHourly.metric.like('temperature:%'),
                                              SnmpSampleHourly.hour >= start, SnmpSampleHourly.hour < end).all()
        n = sum(r.count for r in cpu)
        dev_rows.append({
            'device_id': d.id, 'device_name': d.name, 'host': d.host,
            'availability_pct': av[0] if av else None, 'downtime_min': av[1] if av else None,
            'cpu_avg': round(sum(r.total for r in cpu) / n, 1) if n else None,
            'cpu_max': max((r.vmax for r in cpu if r.vmax is not None), default=None),
            'temp_max': max((r.vmax for r in temps if r.vmax is not None), default=None),
        })
    return {'month': month, 'start': _iso(start), 'end': _iso(end), 'ports': rows, 'devices': dev_rows}


def _report_csv(rep):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(['Laporan SNMP', rep['month']])
    w.writerow([])
    w.writerow(['PERANGKAT'])
    w.writerow(['Perangkat', 'Host', 'Ketersediaan %', 'Downtime (menit)', 'CPU rata-rata %', 'CPU maks %', 'Suhu maks °C'])
    for d in rep['devices']:
        w.writerow([d['device_name'], d['host'], d['availability_pct'], d['downtime_min'], d['cpu_avg'], d['cpu_max'], d['temp_max']])
    w.writerow([])
    w.writerow(['PORT'])
    w.writerow(['Perangkat', 'Port', 'Keterangan', 'Kecepatan (Mbps)',
                'Masuk rata-rata (Mbps)', 'Masuk 95% (Mbps)', 'Masuk puncak (Mbps)', 'Volume masuk (GB)',
                'Keluar rata-rata (Mbps)', 'Keluar 95% (Mbps)', 'Keluar puncak (Mbps)', 'Volume keluar (GB)',
                'Utilisasi 95% (%)', 'Utilisasi puncak (%)', 'Cakupan data (%)'])
    mb = lambda v: round(v / 1e6, 2) if v is not None else ''
    for r in rep['ports']:
        w.writerow([r['device_name'], r['port'], r['alias'], r['speed_mbps'] or '',
                    mb(r['in']['avg_bps']), mb(r['in']['p95_bps']), mb(r['in']['max_bps']), round(r['in']['volume_bytes'] / 1e9, 2),
                    mb(r['out']['avg_bps']), mb(r['out']['p95_bps']), mb(r['out']['max_bps']), round(r['out']['volume_bytes'] / 1e9, 2),
                    r['p95_util_pct'] if r['p95_util_pct'] is not None else '',
                    r['peak_util_pct'] if r['peak_util_pct'] is not None else '', r['coverage_pct']])
    return buf.getvalue()


@bp.route('/api/snmp/report', methods=['GET'])
@login_required
def snmp_report():
    month = request.args.get('month') or snmp_monitor._now().strftime('%Y-%m')
    try:
        _month_bounds(month, 0)
    except (ValueError, TypeError):
        return jsonify({'success': False, 'message': 'month harus berformat YYYY-MM'}), 400
    tz_min = max(-720, min(840, request.args.get('tz', 0, type=int) or 0))
    scope = 'all' if request.args.get('scope') == 'all' else 'watched'
    rep = build_report(month, tz_min, request.args.get('device_id', type=int), scope)
    if request.args.get('format') == 'csv':
        return Response('﻿' + _report_csv(rep), mimetype='text/csv; charset=utf-8',
                        headers={'Content-Disposition': f'attachment; filename=laporan-snmp-{month}.csv'})
    return jsonify({'success': True, **rep})


# ─── Tahap 4: topologi (LLDP/CDP/MNDP) ───

import snmp_topology  # noqa: E402


@bp.route('/api/snmp/topology', methods=['GET'])
@login_required
def snmp_topology_get():
    nodes, links = snmp_topology.build()
    for lk in links:
        lk['last_seen'] = _iso(lk['last_seen'])
    return jsonify({'success': True, 'nodes': nodes, 'links': links})


# ─── Port ala Observium: grafik mini 24 jam & mode Live ───

import time as _time  # noqa: E402
import threading as _threading  # noqa: E402

_live_last = {}
_live_lock = _threading.Lock()
LIVE_MIN_GAP = 1.0   # detik per port — UI memanggil tiap 3 dtk


@bp.route('/api/snmp/ports/<int:port_id>/live', methods=['GET'])
@login_required
def snmp_port_live(port_id):
    """Counter port saat ini langsung dari perangkat (hanya SNMP GET). Laju dihitung klien
    dari dua pembacaan berurutan; dibatasi 1x/detik per port supaya perangkat tidak terbebani."""
    p = db.session.get(SnmpPort, port_id)
    if not p or p.deleted:
        return jsonify({'success': False, 'message': 'Port tidak ditemukan'}), 404
    d = db.session.get(SnmpDevice, p.device_id)
    if not d or not d.enabled:
        return jsonify({'success': False, 'message': 'Perangkat nonaktif'}), 400
    now = _time.monotonic()
    with _live_lock:
        if now - _live_last.get(port_id, 0) < LIVE_MIN_GAP:
            return jsonify({'success': False, 'message': 'Terlalu cepat'}), 429
        _live_last[port_id] = now
    try:
        r = snmp_monitor.read_port_live(snmp_monitor.device_params(d), p.if_index)
    except Exception as e:
        return jsonify({'success': False, 'message': f'SNMP tidak menjawab: {e}'[:200]}), 502
    return jsonify({'success': True, 'ts': int(_time.time() * 1000), 'speed_mbps': p.speed_mbps, **r})


SPARK_POINTS = 48          # 24 jam / 30 menit


@bp.route('/api/snmp/devices/<int:device_id>/sparks', methods=['GET'])
@login_required
def snmp_device_sparks(device_id):
    """Grafik mini 24 jam semua port (rata-rata per 30 menit) untuk daftar port."""
    now = snmp_monitor._now()
    start = now - timedelta(hours=24)
    step = 24 * 3600 / SPARK_POINTS
    acc = {}
    rows = db.session.query(SnmpSample.port_id, SnmpSample.metric, SnmpSample.ts, SnmpSample.value).filter(
        SnmpSample.device_id == device_id, SnmpSample.port_id.isnot(None),
        SnmpSample.metric.in_(('in', 'out')), SnmpSample.ts >= start).all()
    for port_id, metric, ts, v in rows:
        b = min(SPARK_POINTS - 1, int((ts - start).total_seconds() // step))
        a = acc.setdefault(port_id, {}).setdefault(metric, [[0.0, 0] for _ in range(SPARK_POINTS)])
        a[b][0] += v
        a[b][1] += 1
    out = {}
    for port_id, m in acc.items():
        out[port_id] = {k: [round(t / n, 1) if n else None for t, n in m.get(k, [[0, 0]] * SPARK_POINTS)]
                        for k in ('in', 'out')}
    return jsonify({'success': True, 'points': SPARK_POINTS, 'step_s': int(step), 'ports': out})


# ─── Tahap 5: detail port ala Winbox ───

import snmp_portinfo  # noqa: E402


@bp.route('/api/snmp/ports/<int:port_id>', methods=['GET'])
@login_required
def snmp_port_detail(port_id):
    p = db.session.get(SnmpPort, port_id)
    if not p or p.deleted:
        return jsonify({'success': False, 'message': 'Port tidak ditemukan'}), 404
    return jsonify({'success': True, 'port': _port_dict(p), 'detail': snmp_portinfo.detail_dict(p)})
