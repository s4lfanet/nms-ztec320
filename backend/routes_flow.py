"""Trafik Aplikasi (NetFlow/IPFIX): ringkasan layanan, grafik, top pelanggan, pengaturan."""
import socket
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request
from flask_login import login_required
from sqlalchemy import func

from models import (db, FlowBucket, FlowServiceHour, FlowClientHour, FlowExporter, FlowIpName,
                    SnmpDevice, SnmpPort, MikrotikDevice, PppoeSessionEvent, ONU)
from helpers import log_action, permission_required, utc_iso
import flow_collector

bp = Blueprint('flow', __name__)

# rentang → (jam ke belakang, sumber: 'bucket' 5 menit | 'hour', detik per titik)
RANGES = {'1h': (1, 'bucket', 300), '6h': (6, 'bucket', 300), '24h': (24, 'bucket', 300),
          '7d': (168, 'hour', 3600), '30d': (720, 'hour', 3600)}
TOP_SERIES = 8


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _range():
    key = request.args.get('range', '24h')
    return (key if key in RANGES else '24h'), RANGES[key if key in RANGES else '24h']


def _model_for(source):
    return FlowBucket if source == 'bucket' else FlowServiceHour


def _filters(model, q, exporter, if_index, since):
    q = q.filter(model.ts >= since)
    if exporter:
        q = q.filter(model.exporter == exporter)
    if if_index not in (None, ''):
        try:
            q = q.filter(model.if_index == int(if_index))
        except ValueError:
            pass
    return q


def _exporter_name(ip):
    d = SnmpDevice.query.filter_by(host=ip).first()
    if d:
        return d.name
    m = MikrotikDevice.query.filter_by(host=ip).first()
    return m.name if m else ip


@bp.route('/api/flow/status', methods=['GET'])
@login_required
def status():
    cfg = flow_collector.get_settings()
    now = _now()
    exps = []
    for e in FlowExporter.query.order_by(FlowExporter.last_seen.desc()).all():
        exps.append({'ip': e.ip, 'name': _exporter_name(e.ip), 'version': e.version, 'packets': e.packets or 0,
                     'flows': e.flows or 0, 'last_seen': utc_iso(e.last_seen),
                     'age_seconds': int((now - e.last_seen).total_seconds()) if e.last_seen else None})
    try:  # tebakan IP server untuk contoh perintah router
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        server_ip = s.getsockname()[0]
        s.close()
    except Exception:
        server_ip = ''
    return jsonify({'success': True, 'settings': cfg, 'exporters': exps, 'server_ip': server_ip,
                    'ip_names': FlowIpName.query.count(),
                    'has_data': db.session.query(FlowBucket.id).first() is not None})


@bp.route('/api/flow/settings', methods=['PUT'])
@login_required
@permission_required('settings_ip_olts')
def save_settings():
    changed = flow_collector.save_settings(request.get_json() or {})
    if changed:
        log_action('flow_settings', 'snmp', target='flow', detail=','.join(changed))
    return jsonify({'success': True, 'changed': changed, 'settings': flow_collector.get_settings()})


@bp.route('/api/flow/interfaces', methods=['GET'])
@login_required
def interfaces():
    """Pasangan router + interface yang punya data (untuk filter)."""
    since = _now() - timedelta(days=3)
    rows = db.session.query(FlowBucket.exporter, FlowBucket.if_index).filter(FlowBucket.ts >= since).distinct().all()
    out = {}
    for ex, ifx in rows:
        d = out.setdefault(ex, {'exporter': ex, 'name': _exporter_name(ex), 'interfaces': []})
        port = None
        dev = SnmpDevice.query.filter_by(host=ex).first()
        if dev and ifx:
            port = SnmpPort.query.filter_by(device_id=dev.id, if_index=ifx).first()
        d['interfaces'].append({'if_index': ifx, 'name': (port.name if port else (f'ifIndex {ifx}' if ifx else '-'))})
    for d in out.values():
        d['interfaces'].sort(key=lambda x: x['if_index'])
    return jsonify({'success': True, 'exporters': list(out.values())})


@bp.route('/api/flow/overview', methods=['GET'])
@login_required
def overview():
    key, (hours, source, step) = _range()
    model = _model_for(source)
    since = _now() - timedelta(hours=hours)
    exporter, if_index = request.args.get('exporter'), request.args.get('if_index')
    base = _filters(model, db.session.query(model.service, func.sum(model.down_bytes), func.sum(model.up_bytes)),
                    exporter, if_index, since).group_by(model.service)
    rows = [(s, int(d or 0), int(u or 0)) for s, d, u in base.all()]
    total_down = sum(r[1] for r in rows)
    total_up = sum(r[2] for r in rows)
    grand = (total_down + total_up) or 1
    rows.sort(key=lambda r: -(r[1] + r[2]))
    services = [{'service': s, 'down': d, 'up': u, 'total': d + u, 'share': round((d + u) / grand * 100, 1)}
                for s, d, u in rows[:50]]
    top = [r[0] for r in rows[:TOP_SERIES]]
    # deret waktu: top N + sisanya digabung
    sq = _filters(model, db.session.query(model.ts, model.service, func.sum(model.down_bytes), func.sum(model.up_bytes)),
                  exporter, if_index, since).group_by(model.ts, model.service).order_by(model.ts)
    by_ts = {}
    for ts, svc, d, u in sq.all():
        name = svc if svc in top else 'Lainnya (gabungan)'
        cell = by_ts.setdefault(ts, {}).setdefault(name, [0, 0])
        cell[0] += int(d or 0)
        cell[1] += int(u or 0)
    names = top + (['Lainnya (gabungan)'] if any('Lainnya (gabungan)' in v for v in by_ts.values()) else [])
    points = [{'ts': utc_iso(ts), **{n: by_ts[ts].get(n, [0, 0]) for n in names}} for ts in sorted(by_ts)]
    clients = _filters(FlowClientHour, db.session.query(func.count(func.distinct(FlowClientHour.client_ip))),
                       exporter, None, since).scalar() or 0
    return jsonify({'success': True, 'range': key, 'step': step, 'down': total_down, 'up': total_up,
                    'services': services, 'series_names': names, 'series': points, 'clients': clients,
                    'unresolved_share': round(next((r[1] + r[2] for r in rows if r[0] == flow_collector.OTHER), 0)
                                              / grand * 100, 1)})


def _client_labels(ips):
    """ip → {'user','onu'} dari riwayat sesi PPPoE terbaru."""
    out = {}
    if not ips:
        return out
    rows = (PppoeSessionEvent.query.filter(PppoeSessionEvent.ip.in_(list(ips)), PppoeSessionEvent.event == 'up')
            .order_by(PppoeSessionEvent.at.desc()).all())
    onu_ids = {}
    for r in rows:
        if r.ip not in out:
            out[r.ip] = {'user': r.pppoe_user or '', 'onu': ''}
            onu_ids[r.ip] = r.onu_id
    if onu_ids:
        onus = {o.id: o for o in ONU.query.filter(ONU.id.in_(set(onu_ids.values()))).all()}
        for ip, oid in onu_ids.items():
            o = onus.get(oid)
            if o:
                out[ip]['onu'] = o.name or ''
    return out


@bp.route('/api/flow/clients', methods=['GET'])
@login_required
def clients():
    key, (hours, _src, _step) = _range()
    since = _now() - timedelta(hours=max(hours, 2))
    exporter, service = request.args.get('exporter'), request.args.get('service')
    q = db.session.query(FlowClientHour.client_ip, func.sum(FlowClientHour.down_bytes),
                         func.sum(FlowClientHour.up_bytes)).filter(FlowClientHour.ts >= since)
    if exporter:
        q = q.filter(FlowClientHour.exporter == exporter)
    if service:
        q = q.filter(FlowClientHour.service == service)
    needle = (request.args.get('q') or '').strip()
    if needle:
        q = q.filter(FlowClientHour.client_ip.like(f'%{needle}%'))
    rows = q.group_by(FlowClientHour.client_ip).order_by(
        func.sum(FlowClientHour.down_bytes + FlowClientHour.up_bytes).desc()).limit(50).all()
    ips = [r[0] for r in rows]
    top = {}
    if ips:
        sq = db.session.query(FlowClientHour.client_ip, FlowClientHour.service,
                              func.sum(FlowClientHour.down_bytes + FlowClientHour.up_bytes)) \
            .filter(FlowClientHour.ts >= since, FlowClientHour.client_ip.in_(ips))
        if exporter:
            sq = sq.filter(FlowClientHour.exporter == exporter)
        for ip, svc, tot in sq.group_by(FlowClientHour.client_ip, FlowClientHour.service).all():
            top.setdefault(ip, []).append((svc, int(tot or 0)))
    labels = _client_labels(ips)
    out = []
    for ip, d, u in rows:
        svcs = sorted(top.get(ip, []), key=lambda x: -x[1])[:3]
        out.append({'ip': ip, 'down': int(d or 0), 'up': int(u or 0), 'total': int((d or 0) + (u or 0)),
                    'user': labels.get(ip, {}).get('user', ''), 'onu': labels.get(ip, {}).get('onu', ''),
                    'top_services': [{'service': s, 'total': t} for s, t in svcs]})
    return jsonify({'success': True, 'range': key, 'since': utc_iso(since), 'clients': out})


@bp.route('/api/flow/client/<path:ip>', methods=['GET'])
@login_required
def client_detail(ip):
    key, (hours, _src, _step) = _range()
    since = _now() - timedelta(hours=max(hours, 2))
    q = FlowClientHour.query.filter(FlowClientHour.client_ip == ip, FlowClientHour.ts >= since)
    if request.args.get('exporter'):
        q = q.filter(FlowClientHour.exporter == request.args['exporter'])
    totals, by_ts = {}, {}
    for r in q.all():
        t = totals.setdefault(r.service, [0, 0])
        t[0] += r.down_bytes or 0
        t[1] += r.up_bytes or 0
        cell = by_ts.setdefault(r.ts, {}).setdefault(r.service, [0, 0])
        cell[0] += r.down_bytes or 0
        cell[1] += r.up_bytes or 0
    ranked = sorted(totals.items(), key=lambda kv: -(kv[1][0] + kv[1][1]))
    top = [s for s, _ in ranked[:TOP_SERIES]]
    names = top + (['Lainnya (gabungan)'] if len(ranked) > TOP_SERIES else [])
    series = []
    for ts in sorted(by_ts):
        row = {'ts': utc_iso(ts)}
        rest = [0, 0]
        for svc, v in by_ts[ts].items():
            if svc in top:
                row[svc] = v
            else:
                rest[0] += v[0]
                rest[1] += v[1]
        if len(ranked) > TOP_SERIES:
            row['Lainnya (gabungan)'] = rest
        series.append(row)
    label = _client_labels([ip]).get(ip, {})
    return jsonify({'success': True, 'ip': ip, 'user': label.get('user', ''), 'onu': label.get('onu', ''),
                    'services': [{'service': s, 'down': v[0], 'up': v[1], 'total': v[0] + v[1]} for s, v in ranked],
                    'series_names': names, 'series': series, 'step': 3600})
