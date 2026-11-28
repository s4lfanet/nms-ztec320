"""API pemantauan perangkat SNMP (ala Observium) — lihat snmp_monitor.py."""
import threading

from flask import Blueprint, jsonify, request, current_app
from flask_login import login_required, current_user

import json
from datetime import timedelta

from models import db, SnmpSensorRule, SnmpMaintenance, SnmpDevice, SnmpPort, SnmpSensor, SnmpEvent, SnmpSample, SnmpSampleHourly, SnmpNeighbor, SnmpArp, SnmpFdb, SnmpVlan, SnmpWifiRadio, SnmpWifiClient
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
        'enabled': d.enabled, 'location': d.location or '', 'group': d.group_name or '', 'notes': d.notes or '', 'flow_ip': d.flow_ip or '',
        'sys_name': d.sys_name or '', 'sys_descr': d.sys_descr or '', 'sys_location': d.sys_location or '',
        'sys_contact': d.sys_contact or '', 'vendor': d.vendor or '', 'os_name': d.os_name or '',
        'hardware': d.hardware or '', 'os_version': d.os_version or '', 'serial': d.serial or '',
        'discovered_at': _iso(d.discovered_at),
        'status': d.status or 'unknown', 'status_reason': d.status_reason or '', 'status_changed_at': _iso(d.status_changed_at),
        'last_poll_at': _iso(d.last_poll_at), 'last_ok_at': _iso(d.last_ok_at), 'poll_ms': d.poll_ms,
        'uptime_s': d.uptime_s, 'cpu_pct': d.cpu_pct, 'mem_pct': d.mem_pct, 'temperature': d.temperature,
        'parent_id': d.parent_id,
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
        'customer': p.customer or '', 'commit_mbps': p.commit_mbps, 'overage_rate': p.overage_rate,
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
    if 'group' in data:
        d.group_name = (data.get('group') or '').strip()[:100]
    for k in ('location', 'notes'):
        if k in data:
            setattr(d, k, (data.get(k) or '').strip()[:2000])
    if 'flow_ip' in data:
        fip = (data.get('flow_ip') or '').strip()
        if fip:
            import ipaddress
            try:
                fip = str(ipaddress.ip_address(fip))
            except ValueError:
                return 'IP pengirim Traffic Flow tidak valid'
        d.flow_ip = fip
    if 'enabled' in data:
        d.enabled = bool(data['enabled'])
    if 'parent_id' in data:
        raw = data.get('parent_id')
        if raw in (None, '', 0, '0'):
            d.parent_id = None
        else:
            try:
                pid = int(raw)
            except (TypeError, ValueError):
                return 'Induk tidak valid'
            if not db.session.get(SnmpDevice, pid):
                return 'Perangkat induk tidak ditemukan'
            if d.id is not None:
                import snmp_depend
                parents = {x.id: x.parent_id for x in SnmpDevice.query.all()}
                if snmp_depend.would_cycle(d.id, pid, parents):
                    return 'Induk tidak boleh perangkat itu sendiri atau turunannya'
            d.parent_id = pid
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
    import snmp_depend
    scope = snmp_depend.Scope()
    for it, d in zip(items, devs):
        it['in_maintenance'] = scope.in_maintenance(d)
        pd = scope.parent_down(d)
        it['parent_down'] = pd.name if pd else ''
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
    for model in (SnmpPort, SnmpSensor, SnmpEvent, SnmpSample, SnmpSampleHourly, SnmpNeighbor, SnmpArp, SnmpFdb, SnmpVlan, SnmpWifiRadio, SnmpWifiClient):
        model.query.filter_by(device_id=d.id).delete()
    SnmpNeighbor.query.filter_by(remote_device_id=d.id).update({'remote_device_id': None, 'remote_port_id': None})
    SnmpDevice.query.filter_by(parent_id=d.id).update({'parent_id': None})
    SnmpMaintenance.query.filter_by(device_id=d.id).delete()
    SnmpSensorRule.query.filter_by(device_id=d.id).delete()
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
    if 'customer' in data:
        p.customer = str(data['customer'] or '').strip()[:150]
    for k in ('commit_mbps', 'overage_rate'):
        if k in data:
            try:
                v = None if data[k] in (None, '') else float(data[k])
            except (TypeError, ValueError):
                return jsonify({'success': False, 'message': f'{k} harus angka'}), 400
            setattr(p, k, max(0.0, v) if v is not None else None)
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


def build_graph(device_id, port_id, metrics, rng, prev=False):
    """→ {series: {metric: [{t, avg, max}]}, stats: {metric: {...}}, source, step_s}.
    prev=True → periode SEBELUMNYA dengan lebar sama (mis. 24 jam lalu), waktunya digeser maju
    sebesar durasi agar bisa ditumpuk di atas grafik periode ini."""
    dur, source, bucket = RANGES[rng]
    now = snmp_monitor._now()
    shift = dur if prev else timedelta(0)
    end = now - shift
    start = end - dur
    out, stats = {}, {}
    for m in metrics:
        if source == 'raw':
            q = SnmpSample.query.filter(SnmpSample.device_id == device_id, SnmpSample.metric == m, SnmpSample.ts >= start,
                                       SnmpSample.ts < end)
            q = q.filter(SnmpSample.port_id == port_id) if port_id else q.filter(SnmpSample.port_id.is_(None))
            rows = q.order_by(SnmpSample.ts).all()
            pts = [{'t': _iso(r.ts + shift), 'avg': r.value, 'max': r.value} for r in rows]
            vals = [r.value for r in rows]
            peak = max(vals) if vals else None
        else:
            q = SnmpSampleHourly.query.filter(SnmpSampleHourly.device_id == device_id, SnmpSampleHourly.metric == m,
                                              SnmpSampleHourly.hour >= start, SnmpSampleHourly.hour < end)
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
            pts = [{'t': _iso(b['t'] + shift), 'avg': b['total'] / b['count'], 'max': b['max']} for _, b in sorted(buckets.items())]
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
    prev = request.args.get('compare') == '1' and rng != '1y'
    return jsonify({'success': True, **build_graph(device_id, port_id, metrics, rng, prev=prev)})


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
    can_edit = current_user.has_permission('settings_ip_olts')
    lc = snmp_monitor.last_cycle()
    return jsonify({
        'success': True, 'settings': snmp_alerts.get_settings(), 'defaults': snmp_alerts.DEFAULTS,
        'group_overrides': snmp_alerts.get_group_overrides(),
        'flow_anomaly': __import__('flow_anomaly').get_settings(),
        'groups': sorted({(d.group_name or '').strip() for d in SnmpDevice.query.all()} - {''}),
        'general': snmp_monitor.get_general(),
        'digest': __import__('snmp_digest').settings(),
        'general_defaults': {k: v[0] for k, v in snmp_monitor.GENERAL.items()},
        'general_limits': {k: [v[1], v[2]] for k, v in snmp_monitor.GENERAL.items()},
        # community bawaan hanya untuk pengelola perangkat (seperti community perangkat)
        'new_device': snmp_monitor.get_new_device_defaults(with_secret=can_edit),
        'last_cycle': {'at': utc_iso(lc['at']) if lc['at'] else None, 'secs': lc['secs'],
                       'devices': lc['devices'], 'failed': lc['failed']},
        'volume': snmp_monitor.data_volume() if can_edit else None,
    })


@bp.route('/api/snmp/settings', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def snmp_settings_put():
    data = request.get_json() or {}
    import snmp_digest
    changed = snmp_alerts.save_settings(data) + snmp_monitor.save_general(data) + snmp_digest.save_settings(data)
    changed += __import__('flow_anomaly').save_settings(data)
    if 'group_overrides' in data and snmp_alerts.save_group_overrides(data['group_overrides']):
        changed.append('group_overrides')
    db.session.commit()
    snmp_monitor.refresh_runtime()
    if changed:
        log_action('snmp_settings', 'monitoring', target='SNMP', detail=', '.join(changed))
    return jsonify({'success': True, 'settings': snmp_alerts.get_settings(),
                    'group_overrides': snmp_alerts.get_group_overrides(),
                    'flow_anomaly': __import__('flow_anomaly').get_settings(),
                    'general': snmp_monitor.get_general()})


@bp.route('/api/snmp/digest/send', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def snmp_digest_send():
    import snmp_digest
    ok = snmp_digest.send()
    return jsonify({'success': ok, 'message': 'Ringkasan dikirim ke kanal notifikasi' if ok else 'Belum ada perangkat SNMP'})


@bp.route('/api/snmp/report.pdf')
@login_required
@permission_required('settings_ip_olts')
def snmp_report_pdf():
    import snmp_report
    days = min(max(request.args.get('days', 7, type=int), 1), 31)
    pdf = snmp_report.build_pdf(days=days)
    if not pdf:
        return jsonify({'success': False, 'message': 'Belum ada perangkat SNMP'}), 404
    return Response(pdf, mimetype='application/pdf',
                    headers={'Content-Disposition': 'attachment; filename="laporan-snmp.pdf"'})


@bp.route('/api/snmp/report/send', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def snmp_report_send():
    import snmp_report
    res = snmp_report.send_pdf()
    if res is None:
        return jsonify({'success': False, 'message': 'Belum ada perangkat SNMP'})
    if not res:
        return jsonify({'success': False, 'message': 'Tidak ada kanal Telegram / WA bawaan yang aktif'})
    ok = [k for k, v in res.items() if v]
    bad = [k for k, v in res.items() if not v]
    msg = ('Terkirim: ' + ', '.join(ok)) if ok else 'Gagal kirim ke semua kanal'
    if bad and ok:
        msg += ' (gagal: ' + ', '.join(bad) + ')'
    return jsonify({'success': bool(ok), 'message': msg})


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
    return jsonify({'success': True, **build_summary()})


def build_summary():
    """Ringkasan untuk halaman Perangkat, dashboard, dan AI Agent: jumlah per status,
    masalah aktif (alert terbuka + perangkat turun), port dipantau, trafik teratas."""
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
    return {'counts': counts, 'problems': problems[:50],
            'top_ports': [_port_brief(p, by_id[p.device_id]) for p in top],
            'watched_ports': [_port_brief(p, by_id[p.device_id]) for p in watched]}


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
    elif scope == 'billing':
        q = q.filter(db.or_(db.and_(SnmpPort.customer.isnot(None), SnmpPort.customer != ''),
                            SnmpPort.commit_mbps.isnot(None)))
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
            # Billing burstable: 95th percentile dari rata-rata per jam, arah terbesar (masuk/keluar)
            p95_mbps = round(p95 / 1e6, 2)
            row['customer'] = p.customer or ''
            row['commit_mbps'] = p.commit_mbps
            row['overage_rate'] = p.overage_rate
            row['billing_p95_mbps'] = p95_mbps
            over = max(0.0, p95_mbps - p.commit_mbps) if p.commit_mbps is not None else None
            row['overage_mbps'] = round(over, 2) if over is not None else None
            row['overage_cost'] = round(over * p.overage_rate) if over is not None and p.overage_rate else None
            if scope == 'billing':
                pass
            elif scope != 'watched' and not hours:
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


def _billing_csv(rep, customer=''):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(['Billing port (burstable 95%)', rep['month']])
    w.writerow(['Pelanggan', 'Perangkat', 'Port', 'Keterangan', 'Komitmen (Mbps)', 'Pemakaian 95% (Mbps)',
                'Kelebihan (Mbps)', 'Tarif kelebihan /Mbps', 'Biaya kelebihan', 'Volume masuk (GB)',
                'Volume keluar (GB)', 'Cakupan data (%)'])
    total = 0
    for r in rep['ports']:
        if customer and r['customer'] != customer:
            continue
        total += r['overage_cost'] or 0
        w.writerow([r['customer'], r['device_name'], r['port'], r['alias'],
                    r['commit_mbps'] if r['commit_mbps'] is not None else '', r['billing_p95_mbps'],
                    r['overage_mbps'] if r['overage_mbps'] is not None else '',
                    r['overage_rate'] if r['overage_rate'] is not None else '',
                    r['overage_cost'] if r['overage_cost'] is not None else '',
                    round(r['in']['volume_bytes'] / 1e9, 2), round(r['out']['volume_bytes'] / 1e9, 2), r['coverage_pct']])
    w.writerow([])
    w.writerow(['Total biaya kelebihan', total])
    return buf.getvalue()


@bp.route('/api/snmp/billing', methods=['GET'])
@login_required
def snmp_billing():
    """Billing per port: komitmen vs 95% bulanan, kelebihan & biaya. ?customer= untuk satu pelanggan; ?format=csv."""
    month = request.args.get('month') or snmp_monitor._now().strftime('%Y-%m')
    try:
        _month_bounds(month, 0)
    except (ValueError, TypeError):
        return jsonify({'success': False, 'message': 'month harus berformat YYYY-MM'}), 400
    tz_min = max(-720, min(840, request.args.get('tz', 0, type=int) or 0))
    rep = build_report(month, tz_min, request.args.get('device_id', type=int), 'billing')
    cust = (request.args.get('customer') or '').strip()
    if cust:
        rep['ports'] = [r for r in rep['ports'] if r['customer'] == cust]
    if request.args.get('format') == 'csv':
        name = ''.join(ch if ch.isalnum() or ch in '-_' else '_' for ch in cust) or 'semua'
        return Response('﻿' + _billing_csv(rep, cust), mimetype='text/csv; charset=utf-8',
                        headers={'Content-Disposition': f'attachment; filename=billing-{name}-{month}.csv'})
    rep.pop('devices', None)
    rep['customers'] = sorted({r['customer'] for r in rep['ports'] if r['customer']})
    return jsonify({'success': True, **rep})


@bp.route('/api/snmp/report', methods=['GET'])
@login_required
def snmp_report():
    month = request.args.get('month') or snmp_monitor._now().strftime('%Y-%m')
    try:
        _month_bounds(month, 0)
    except (ValueError, TypeError):
        return jsonify({'success': False, 'message': 'month harus berformat YYYY-MM'}), 400
    tz_min = max(-720, min(840, request.args.get('tz', 0, type=int) or 0))
    scope = request.args.get('scope')
    scope = scope if scope in ('all', 'billing') else 'watched'
    rep = build_report(month, tz_min, request.args.get('device_id', type=int), scope)
    if request.args.get('format') == 'csv':
        return Response('﻿' + _report_csv(rep), mimetype='text/csv; charset=utf-8',
                        headers={'Content-Disposition': f'attachment; filename=laporan-snmp-{month}.csv'})
    return jsonify({'success': True, **rep})


# ─── Sensor kustom (ambang bertingkat gaya PRTG) ───

@bp.route('/api/snmp/devices/<int:did>/rules', methods=['GET'])
@login_required
def snmp_rules_list(did):
    import snmp_rules
    if not db.session.get(SnmpDevice, did):
        return jsonify({'success': False, 'message': 'Perangkat tidak ditemukan'}), 404
    rules = SnmpSensorRule.query.filter_by(device_id=did).order_by(SnmpSensorRule.id).all()
    sensors = [{'metric': f'{s.kind}:{s.key}', 'name': s.name or s.key, 'kind': s.kind, 'unit': s.unit}
               for s in SnmpSensor.query.filter_by(device_id=did).all()]
    return jsonify({'success': True, 'rules': [snmp_rules.rule_dict(r) for r in rules], 'sensors': sensors})


@bp.route('/api/snmp/devices/<int:did>/rules', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def snmp_rules_create(did):
    import snmp_rules
    if not db.session.get(SnmpDevice, did):
        return jsonify({'success': False, 'message': 'Perangkat tidak ditemukan'}), 404
    if SnmpSensorRule.query.filter_by(device_id=did).count() >= 50:
        return jsonify({'success': False, 'message': 'Maksimal 50 sensor kustom per perangkat'}), 400
    vals, err = snmp_rules.validate(did, request.get_json() or {})
    if err:
        return jsonify({'success': False, 'message': err}), 400
    r = SnmpSensorRule(device_id=did, created_by=current_user.username, status='unknown', **vals)
    db.session.add(r)
    db.session.commit()
    log_action('snmp_rule_add', 'monitoring', target=str(did), detail=r.name)
    return jsonify({'success': True, 'rule': snmp_rules.rule_dict(r)})


@bp.route('/api/snmp/rules/<int:rid>', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def snmp_rules_update(rid):
    import snmp_rules
    r = db.session.get(SnmpSensorRule, rid)
    if not r:
        return jsonify({'success': False, 'message': 'Tidak ditemukan'}), 404
    vals, err = snmp_rules.validate(r.device_id, request.get_json() or {}, r)
    if err:
        return jsonify({'success': False, 'message': err}), 400
    for k, v in vals.items():
        setattr(r, k, v)
    r.status, r.status_since = 'unknown', None   # ambang berubah → nilai ulang dari awal
    db.session.commit()
    log_action('snmp_rule_edit', 'monitoring', target=str(r.device_id), detail=r.name)
    return jsonify({'success': True, 'rule': snmp_rules.rule_dict(r)})


@bp.route('/api/snmp/rules/<int:rid>', methods=['DELETE'])
@login_required
@permission_required('settings_ip_olts')
def snmp_rules_delete(rid):
    r = db.session.get(SnmpSensorRule, rid)
    if not r:
        return jsonify({'success': False, 'message': 'Tidak ditemukan'}), 404
    db.session.delete(r)
    db.session.commit()
    log_action('snmp_rule_delete', 'monitoring', target=str(r.device_id), detail=r.name)
    return jsonify({'success': True})


# ─── Pemeliharaan perangkat (menahan alert) ───

def _maint_dict(m, names):
    return {'id': m.id, 'device_id': m.device_id, 'device_name': names.get(m.device_id, 'Semua perangkat SNMP') if m.device_id else 'Semua perangkat SNMP',
            'start': _iso(m.start_time), 'end': _iso(m.end_time), 'reason': m.reason or '', 'created_by': m.created_by or '',
            'active': m.start_time <= snmp_monitor._now().replace(tzinfo=None) <= m.end_time}


@bp.route('/api/snmp/maintenance', methods=['GET'])
@login_required
def snmp_maintenance_list():
    import snmp_depend
    now = snmp_depend._naive_now()
    names = {d.id: d.name for d in SnmpDevice.query.all()}
    q = SnmpMaintenance.query.filter(SnmpMaintenance.end_time >= now - timedelta(days=1))
    if request.args.get('device_id', type=int):
        did = request.args.get('device_id', type=int)
        q = q.filter((SnmpMaintenance.device_id == did) | (SnmpMaintenance.device_id.is_(None)))
    rows = q.order_by(SnmpMaintenance.start_time).limit(200).all()
    return jsonify({'success': True, 'items': [_maint_dict(m, names) for m in rows]})


@bp.route('/api/snmp/maintenance', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def snmp_maintenance_create():
    import snmp_depend
    data = request.get_json() or {}
    try:
        start = snmp_depend.parse_when(data.get('start')) if data.get('start') else snmp_depend._naive_now()
        end = snmp_depend.parse_when(data.get('end'))
    except (ValueError, TypeError):
        return jsonify({'success': False, 'message': 'Waktu tidak valid'}), 400
    if end <= start:
        return jsonify({'success': False, 'message': 'Waktu selesai harus setelah waktu mulai'}), 400
    if end - start > timedelta(days=30):
        return jsonify({'success': False, 'message': 'Maksimal 30 hari per jendela'}), 400
    did = data.get('device_id')
    if did in (None, '', 0):
        did = None
    else:
        try:
            did = int(did)
        except (TypeError, ValueError):
            return jsonify({'success': False, 'message': 'Perangkat tidak valid'}), 400
        if not db.session.get(SnmpDevice, did):
            return jsonify({'success': False, 'message': 'Perangkat tidak ditemukan'}), 404
    m = SnmpMaintenance(device_id=did, start_time=start, end_time=end,
                        reason=(data.get('reason') or '').strip()[:300], created_by=current_user.username)
    db.session.add(m)
    db.session.commit()
    log_action('snmp_maintenance_add', 'monitoring', target=str(did or 'semua'), detail=m.reason)
    names = {d.id: d.name for d in SnmpDevice.query.all()}
    return jsonify({'success': True, 'item': _maint_dict(m, names)})


@bp.route('/api/snmp/maintenance/<int:mid>', methods=['DELETE'])
@login_required
@permission_required('settings_ip_olts')
def snmp_maintenance_delete(mid):
    m = db.session.get(SnmpMaintenance, mid)
    if not m:
        return jsonify({'success': False, 'message': 'Tidak ditemukan'}), 404
    db.session.delete(m)
    db.session.commit()
    log_action('snmp_maintenance_delete', 'monitoring', target=str(m.device_id or 'semua'))
    return jsonify({'success': True})


# ─── Tahap 4: topologi (LLDP/CDP/MNDP) ───

import snmp_topology  # noqa: E402


@bp.route('/api/snmp/topology', methods=['GET'])
@login_required
def snmp_topology_get():
    """Topologi semua perangkat, atau hanya jalur yang terhubung ke ?device_id= (perangkat lain yang tidak
    saling terhubung = topologi terpisah). `groups` = daftar jalur terpisah untuk pemilih di UI."""
    nodes, links = snmp_topology.build()
    for lk in links:
        lk['last_seen'] = _iso(lk['last_seen'])
    deps = snmp_topology.annotate(nodes)
    comps = snmp_topology.components(nodes, links, deps)
    by_id = {n['id']: n for n in nodes}
    deg = {}
    for e in list(links) + list(deps):
        for k in (e['source'], e['target']):
            deg[k] = deg.get(k, 0) + 1
    groups = []
    for c in comps:
        if len(c) < 2:
            continue
        reg = [by_id[i] for i in c if by_id[i].get('device_id')]
        if not reg:
            continue
        head = max(reg, key=lambda n: (deg.get(n['id'], 0), n['name'].lower()))
        groups.append({'device_id': head['device_id'], 'name': head['name'], 'nodes': len(c),
                       'device_ids': sorted(n['device_id'] for n in reg)})
    did = request.args.get('device_id', type=int)
    if did:
        keep = next((c for c in comps if f'd{did}' in c), {f'd{did}'})
        nodes = [n for n in nodes if n['id'] in keep]
        links = [l for l in links if l['source'] in keep and l['target'] in keep]
        deps = [d for d in deps if d['source'] in keep and d['target'] in keep]
    return jsonify({'success': True, 'nodes': nodes, 'links': links, 'deps': deps, 'groups': groups})


@bp.route('/api/snmp/olt-links', methods=['GET'])
@login_required
def snmp_olt_links_get():
    """Penautan OLT↔port (manual + terdeteksi) beserta pilihan untuk form."""
    from models import OLT, SnmpOltLink
    olts = OLT.query.order_by(OLT.name).all()
    devs = SnmpDevice.query.order_by(SnmpDevice.name).all()
    ports = {}
    for p in SnmpPort.query.filter_by(deleted=False).order_by(SnmpPort.if_index).all():
        ports.setdefault(p.device_id, []).append({'id': p.id, 'name': p.name, 'alias': p.alias or ''})
    dname = {d.id: d.name for d in devs}
    pname = {p['id']: p['name'] for ps in ports.values() for p in ps}
    items = [{'id': x['link_id'], 'olt_id': x['olt'].id, 'olt_name': x['olt'].name, 'device_id': x['device_id'],
              'device_name': dname.get(x['device_id'], ''), 'port_id': x['port_id'], 'port': pname.get(x['port_id'], ''),
              'source': x['source']} for x in snmp_topology.olt_links()]
    return jsonify({'success': True, 'links': items,
                    'olts': [{'id': o.id, 'name': o.name, 'ip': o.ip_address} for o in olts],
                    'devices': [{'id': d.id, 'name': d.name, 'ports': ports.get(d.id, [])} for d in devs]})


@bp.route('/api/snmp/olt-links', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def snmp_olt_links_add():
    from models import OLT, SnmpOltLink
    data = request.get_json() or {}
    try:
        olt_id, dev_id = int(data.get('olt_id')), int(data.get('device_id'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': 'OLT dan perangkat wajib dipilih'}), 400
    port_id = data.get('port_id')
    port_id = int(port_id) if port_id not in (None, '', 0, '0') else None
    olt, dev = db.session.get(OLT, olt_id), db.session.get(SnmpDevice, dev_id)
    if not olt or not dev:
        return jsonify({'success': False, 'message': 'OLT atau perangkat tidak ditemukan'}), 404
    if port_id:
        p = db.session.get(SnmpPort, port_id)
        if not p or p.device_id != dev_id:
            return jsonify({'success': False, 'message': 'Port bukan milik perangkat itu'}), 400
    if SnmpOltLink.query.filter_by(olt_id=olt_id, device_id=dev_id, port_id=port_id).first():
        return jsonify({'success': False, 'message': 'Penautan sudah ada'}), 409
    if SnmpOltLink.query.count() >= 200:
        return jsonify({'success': False, 'message': 'Batas penautan tercapai'}), 400
    db.session.add(SnmpOltLink(olt_id=olt_id, device_id=dev_id, port_id=port_id, created_by=current_user.username))
    db.session.commit()
    log_action('snmp_olt_link_add', 'monitoring', target=f'{olt.name} ↔ {dev.name}')
    return jsonify({'success': True})


@bp.route('/api/snmp/olt-links/<int:lid>', methods=['DELETE'])
@login_required
@permission_required('settings_ip_olts')
def snmp_olt_links_delete(lid):
    from models import SnmpOltLink
    row = db.session.get(SnmpOltLink, lid)
    if not row:
        return jsonify({'success': False, 'message': 'Tidak ditemukan'}), 404
    db.session.delete(row)
    db.session.commit()
    log_action('snmp_olt_link_del', 'monitoring', target=f'#{lid}')
    return jsonify({'success': True})


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
    d = db.session.get(SnmpDevice, p.device_id)
    return jsonify({'success': True, 'port': _port_dict(p), 'detail': snmp_portinfo.detail_dict(p),
                    'macs': _port_macs(p, d)})


# ─── ARP & tabel MAC (snmp_tables) ───
import snmp_tables  # noqa: E402
from sqlalchemy import func, or_  # noqa: E402

TABLE_LIMIT = 5000
SEARCH_LIMIT = 200


def _seen(r, d):
    """Masih ada di pembacaan terakhir perangkat?"""
    return bool(d and d.tables_at and r.last_seen and r.last_seen >= d.tables_at)


def _arp_dict(r, d, ports):
    p = ports.get(r.port_id)
    return {'ip': r.ip, 'mac': r.mac, 'port_id': r.port_id, 'port': p.name if p else '', 'port_alias': (p.alias or '') if p else '',
            'first_seen': utc_iso(r.first_seen), 'last_seen': utc_iso(r.last_seen), 'active': _seen(r, d)}


def _fdb_dict(r, d, ports):
    p = ports.get(r.port_id)
    return {'mac': r.mac, 'vlan': r.vlan, 'port_id': r.port_id, 'port': p.name if p else (f'#{r.if_index}' if r.if_index else ''),
            'port_alias': (p.alias or '') if p else '',
            'first_seen': utc_iso(r.first_seen), 'last_seen': utc_iso(r.last_seen), 'active': _seen(r, d)}


def _port_macs(p, d):
    """MAC yang dipelajari di port ini (+ IP bila ada di ARP perangkat mana pun)."""
    rows = SnmpFdb.query.filter_by(port_id=p.id).order_by(SnmpFdb.last_seen.desc()).limit(100).all()
    arp_rows = SnmpArp.query.filter_by(port_id=p.id).order_by(SnmpArp.last_seen.desc()).limit(100).all()
    macs = {r.mac for r in rows}
    ip_of = {}
    if macs:
        for a in SnmpArp.query.filter(SnmpArp.mac.in_(macs)).all():
            ip_of.setdefault(a.mac, a.ip)
    out = [{'mac': r.mac, 'vlan': r.vlan, 'ip': ip_of.get(r.mac, ''), 'source': 'fdb',
            'last_seen': utc_iso(r.last_seen), 'active': _seen(r, d)} for r in rows]
    out += [{'mac': a.mac, 'vlan': None, 'ip': a.ip, 'source': 'arp', 'last_seen': utc_iso(a.last_seen),
             'active': _seen(a, d)} for a in arp_rows if a.mac not in macs]
    return out


@bp.route('/api/snmp/devices/<int:device_id>/tables', methods=['GET'])
@login_required
def snmp_device_tables(device_id):
    d = db.session.get(SnmpDevice, device_id)
    if not d:
        return jsonify({'success': False, 'message': 'Perangkat tidak ditemukan'}), 404
    ports = {p.id: p for p in SnmpPort.query.filter_by(device_id=d.id).all()}
    arp = SnmpArp.query.filter_by(device_id=d.id).order_by(SnmpArp.last_seen.desc(), SnmpArp.ip).limit(TABLE_LIMIT).all()
    fdb = SnmpFdb.query.filter_by(device_id=d.id).order_by(SnmpFdb.last_seen.desc(), SnmpFdb.mac).limit(TABLE_LIMIT).all()
    # IP untuk baris MAC: ARP perangkat ini dulu, lalu ARP perangkat lain (router di atas switch)
    ip_of = {r.mac: r.ip for r in reversed(arp)}
    missing = {r.mac for r in fdb} - set(ip_of)
    if missing:
        for a in SnmpArp.query.filter(SnmpArp.mac.in_(list(missing)[:2000])).order_by(SnmpArp.last_seen).all():
            ip_of[a.mac] = a.ip
    return jsonify({'success': True, 'tables_at': utc_iso(d.tables_at), 'note': d.tables_note or '',
                    'arp': [_arp_dict(r, d, ports) for r in arp],
                    'fdb': [{**_fdb_dict(r, d, ports), 'ip': ip_of.get(r.mac, '')} for r in fdb],
                    'truncated': len(arp) >= TABLE_LIMIT or len(fdb) >= TABLE_LIMIT})


@bp.route('/api/snmp/devices/<int:device_id>/vlans', methods=['GET'])
@login_required
def snmp_device_vlans(device_id):
    """VLAN perangkat: daftar VLAN + port tagged/untagged, dan ringkasan VLAN per port
    (PVID, anggota, serta VLAN yang terlihat dari tabel MAC sebagai cadangan)."""
    d = db.session.get(SnmpDevice, device_id)
    if not d:
        return jsonify({'success': False, 'message': 'Perangkat tidak ditemukan'}), 404
    ports = SnmpPort.query.filter_by(device_id=d.id, deleted=False).all()
    by_if = {p.if_index: p for p in ports}
    nm = lambda i: by_if[i].name if i in by_if else f'#{i}'
    vlans, per_port = [], {}
    for v in SnmpVlan.query.filter_by(device_id=d.id).order_by(SnmpVlan.vlan).all():
        eg, un = json.loads(v.egress or '[]'), set(json.loads(v.untagged or '[]'))
        vlans.append({'vlan': v.vlan, 'name': v.name or '',
                      'untagged': [nm(i) for i in eg if i in un], 'tagged': [nm(i) for i in eg if i not in un]})
        for i in eg:
            if i in by_if:
                per_port.setdefault(by_if[i].id, {'member': []})['member'].append({'vlan': v.vlan, 'tagged': i not in un})
    seen = {}
    for pid, vl in db.session.query(SnmpFdb.port_id, SnmpFdb.vlan).filter(
            SnmpFdb.device_id == d.id, SnmpFdb.vlan.isnot(None), SnmpFdb.port_id.isnot(None)).distinct().all():
        seen.setdefault(pid, set()).add(vl)
    out_ports = []
    for p in ports:
        pp = per_port.get(p.id, {'member': []})
        if not (pp['member'] or p.pvid or seen.get(p.id)):
            continue
        out_ports.append({'if_index': p.if_index, 'port_id': p.id, 'port': p.name, 'alias': p.alias or '', 'pvid': p.pvid,
                          'member': pp['member'], 'seen': sorted(seen.get(p.id, ()))})
    out_ports.sort(key=lambda x: x['if_index'])
    return jsonify({'success': True, 'vlans': vlans, 'ports': out_ports})


@bp.route('/api/snmp/devices/<int:device_id>/wireless', methods=['GET'])
@login_required
def snmp_device_wireless(device_id):
    """Radio (SSID/frekuensi/klien) dan klien wireless MikroTik; klien diberi nama pelanggan bila MAC cocok PPPoE."""
    d = db.session.get(SnmpDevice, device_id)
    if not d:
        return jsonify({'success': False, 'message': 'Perangkat tidak ditemukan'}), 404
    names = {p.if_index: p.name for p in SnmpPort.query.filter_by(device_id=d.id).all()}
    radios = [{'if_index': r.if_index, 'name': names.get(r.if_index, f'#{r.if_index}'), 'ssid': r.ssid or '', 'freq': r.freq,
               'clients': r.clients, 'noise': r.noise, 'ccq': r.ccq}
              for r in SnmpWifiRadio.query.filter_by(device_id=d.id).order_by(SnmpWifiRadio.if_index).all()]
    rows = SnmpWifiClient.query.filter_by(device_id=d.id).order_by(SnmpWifiClient.signal.asc()).all()
    who = _onu_matches({r.mac for r in rows}, set())
    clients = [{'mac': r.mac, 'iface': names.get(r.if_index, f'#{r.if_index}'), 'signal': r.signal, 'snr': r.snr,
                'tx_bps': r.tx_bps, 'rx_bps': r.rx_bps, 'uptime_s': r.uptime_s,
                'customer': (who.get(r.mac.lower()) or {}).get('name', '')} for r in rows]
    for rd in radios:   # jumlah klien dari registration table bila radio tidak melaporkannya (ROS 7)
        if rd['clients'] is None:
            rd['clients'] = sum(1 for c in clients if c['iface'] == rd['name'])
    return jsonify({'success': True, 'radios': radios, 'clients': clients})


# ─── Penemuan otomatis (tahap E) — hanya usulan ───

@bp.route('/api/snmp/discovery', methods=['GET'])
@login_required
@permission_required('settings_ip_olts')
def snmp_discovery_get():
    import snmp_discovery
    return jsonify({'success': True, 'neighbors': snmp_discovery.neighbor_candidates(), 'scan': snmp_discovery.status()})


@bp.route('/api/snmp/discovery/scan', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def snmp_discovery_scan():
    import snmp_discovery
    from flask import current_app
    dflt = snmp_monitor.get_new_device_defaults(with_secret=True)
    if not dflt.get('community'):
        return jsonify({'success': False, 'message': 'Isi community bawaan di Pengaturan SNMP dulu'}), 400
    snmp_monitor.refresh_runtime()
    base = {'id': 0, 'port': 161, 'version': dflt['snmp_version'], 'community': dflt['community'], 'user': '', 'level': None,
            'auth_proto': None, 'auth_pass': None, 'priv_proto': None, 'priv_pass': None}
    ok, msg = snmp_discovery.start_scan((request.get_json() or {}).get('cidr'), base, current_app._get_current_object())
    if ok:
        log_action('snmp_scan', 'monitoring', target=str((request.get_json() or {}).get('cidr')))
    return jsonify({'success': ok, 'message': msg}), (200 if ok else 400)


@bp.route('/api/snmp/discovery/add', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def snmp_discovery_add():
    """Tambah satu usulan sebagai perangkat SNMP (community/versi bawaan Pengaturan)."""
    data = request.get_json() or {}
    ip = (data.get('ip') or '').strip()
    if SnmpDevice.query.filter_by(host=ip).first():
        return jsonify({'success': False, 'message': 'IP sudah terdaftar'}), 400
    dflt = snmp_monitor.get_new_device_defaults(with_secret=True)
    payload = {'name': (data.get('name') or ip).strip() or ip, 'host': ip, 'community': dflt.get('community') or '',
               'snmp_version': dflt['snmp_version'], 'group': data.get('group') or ''}
    d = SnmpDevice(snmp_version=payload['snmp_version'], port=161)
    err = _apply(d, payload, creating=True)
    if err:
        return jsonify({'success': False, 'message': err}), 400
    db.session.add(d)
    db.session.commit()
    log_action('snmp_device_add', 'monitoring', target=f'{d.name} ({d.host}) [penemuan]')
    _kick(d.id)
    return jsonify({'success': True, 'device': _device_dict(d, [])})


@bp.route('/api/snmp/devices/<int:device_id>/tables/refresh', methods=['POST'])
@login_required
@permission_required('settings_ip_olts')
def snmp_device_tables_refresh(device_id):
    d = db.session.get(SnmpDevice, device_id)
    if not d:
        return jsonify({'success': False, 'message': 'Perangkat tidak ditemukan'}), 404
    snmp_monitor.refresh_runtime()
    snmp_monitor.update_tables([d], force=True)
    db.session.refresh(d)
    return jsonify({'success': True, 'tables_at': utc_iso(d.tables_at), 'note': d.tables_note or ''})


@bp.route('/api/snmp/search', methods=['GET'])
@login_required
def snmp_search():
    """Cari MAC / IP di semua tabel ARP & MAC → perangkat dan port tempat terlihat."""
    return jsonify({'success': True, **search_tables(request.args.get('q') or '')})


def _onu_matches(macs, ips):
    """MAC / IP → pelanggan dari sesi PPPoE MikroTik (caller-id = MAC, IP sesi)."""
    from models import OnuLinkState, ONU
    out = {}
    conds = []
    if macs:
        conds.append(func.lower(OnuLinkState.caller_id).in_([m.lower() for m in macs]))
    if ips:
        conds.append(OnuLinkState.pppoe_ip.in_(list(ips)))
    if not conds:
        return out
    for s, o in db.session.query(OnuLinkState, ONU).join(ONU, OnuLinkState.onu_id == ONU.id) \
            .filter(or_(*conds)).limit(SEARCH_LIMIT).all():
        info = {'id': o.id, 'name': o.name or '', 'pppoe': s.pppoe_user or o.pppoe or ''}
        if s.caller_id:
            out.setdefault(s.caller_id.lower(), info)
        if s.pppoe_ip:
            out.setdefault(s.pppoe_ip, info)
    return out


def search_tables(q, limit=SEARCH_LIMIT):
    """→ {'kind': 'mac'|'ip'|'text', 'results': [...]} — dipakai API & AI Agent."""
    kind, val = snmp_tables.norm_query(q.strip())
    if len(val) < 3 or kind == 'text':
        return {'kind': kind, 'results': []}
    arp_q, fdb_q = SnmpArp.query, SnmpFdb.query
    if kind == 'mac':
        like = f'%{val}%'
        arp_q = arp_q.filter(func.replace(SnmpArp.mac, ':', '').like(like))
        fdb_q = fdb_q.filter(func.replace(SnmpFdb.mac, ':', '').like(like))
    else:
        arp_q = arp_q.filter(or_(SnmpArp.ip == val, SnmpArp.ip.like(f'{val}%')))
        fdb_q = None
    arp = arp_q.order_by(SnmpArp.last_seen.desc()).limit(limit).all()
    fdb = fdb_q.order_by(SnmpFdb.last_seen.desc()).limit(limit).all() if fdb_q is not None else []
    # pencarian IP juga menampilkan port switch tempat MAC-nya dipelajari
    if kind == 'ip' and arp:
        macs = {a.mac for a in arp if a.mac}
        fdb = SnmpFdb.query.filter(SnmpFdb.mac.in_(macs)).order_by(SnmpFdb.last_seen.desc()).limit(limit).all()
    dev_ids = {r.device_id for r in arp} | {r.device_id for r in fdb}
    devs = {d.id: d for d in SnmpDevice.query.filter(SnmpDevice.id.in_(dev_ids)).all()} if dev_ids else {}
    port_ids = {r.port_id for r in arp if r.port_id} | {r.port_id for r in fdb if r.port_id}
    ports = {p.id: p for p in SnmpPort.query.filter(SnmpPort.id.in_(port_ids)).all()} if port_ids else {}
    ip_of = {}
    for a in arp:
        ip_of.setdefault(a.mac, a.ip)
    if fdb and not ip_of:
        for a in SnmpArp.query.filter(SnmpArp.mac.in_({r.mac for r in fdb})).limit(limit).all():
            ip_of.setdefault(a.mac, a.ip)
    onus = _onu_matches({r.mac for r in fdb} | {r.mac for r in arp}, {r.ip for r in arp} | set(ip_of.values()))

    def onu_for(mac, ip):
        return onus.get((mac or '').lower()) or (onus.get(ip) if ip else None)
    res = []
    for r in fdb:
        d = devs.get(r.device_id)
        ip = ip_of.get(r.mac, '')
        res.append({'type': 'fdb', 'device_id': r.device_id, 'device': d.name if d else '?', **_fdb_dict(r, d, ports),
                    'ip': ip, 'onu': onu_for(r.mac, ip)})
    in_fdb = {(r.device_id, r.mac) for r in fdb}
    for r in arp:
        if (r.device_id, r.mac) in in_fdb:
            continue  # sudah tampil di baris MAC perangkat yang sama (IP-nya ikut di sana)
        d = devs.get(r.device_id)
        res.append({'type': 'arp', 'device_id': r.device_id, 'device': d.name if d else '?', **_arp_dict(r, d, ports),
                    'vlan': None, 'onu': onu_for(r.mac, r.ip)})
    res.sort(key=lambda x: x['last_seen'] or '', reverse=True)
    res.sort(key=lambda x: not x['active'])  # stabil: tetap terbaru dulu di tiap kelompok
    return {'kind': kind, 'results': res[:limit]}
