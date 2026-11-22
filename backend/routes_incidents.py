"""Fase 3 — insiden gangguan: daftar, detail, ubah status, catatan, foto."""
import json
import os
import uuid
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, current_app, send_from_directory, abort
from flask_login import login_required, current_user

from models import db, ONU, OLT, User, Incident, IncidentLog
from helpers import utc_iso, log_action
from incidents import ACTIVE_STATUSES, STATUS_ORDER, add_log

bp = Blueprint('incidents', __name__)

_PHOTO_EXT = {'jpg': (b'\xff\xd8\xff',), 'jpeg': (b'\xff\xd8\xff',), 'png': (b'\x89PNG\r\n\x1a\n',)}
_MAX_PHOTO = 8 * 1024 * 1024
_TS = {'acknowledged': 'acknowledged_at', 'en_route': 'en_route_at', 'on_site': 'on_site_at', 'resolved': 'resolved_at'}


def _can_handle():
    u = current_user
    return bool(u.is_super_admin or u.has_permission('receive_alerts') or u.has_permission('manage_users'))


def _photo_dir(inc_id):
    d = os.path.join(current_app.instance_path, 'incident_photos', str(int(inc_id)))
    os.makedirs(d, exist_ok=True)
    return d


def _names(ids_csv):
    out = []
    for part in (ids_csv or '').split(','):
        if part.strip().isdigit():
            u = db.session.get(User, int(part))
            if u:
                out.append(u.full_name or u.username)
    return out


def _maps(inc):
    from ftth_topology import get_node
    n = get_node(inc.node_type, inc.node_id)
    if n is not None and getattr(n, 'latitude', None) is not None and getattr(n, 'longitude', None) is not None:
        return f'https://maps.google.com/?q={n.latitude},{n.longitude}'
    return ''


def _summary(inc):
    from ftth_topology import get_node
    olt = db.session.get(OLT, inc.olt_id) if inc.olt_id else None
    node = get_node(inc.node_type, inc.node_id)
    return {
        'lat': getattr(node, 'latitude', None), 'lng': getattr(node, 'longitude', None),
        'id': inc.id, 'title': inc.title, 'status': inc.status, 'cause': inc.cause,
        'category': inc.category, 'node_type': inc.node_type, 'node_id': inc.node_id,
        'node_name': inc.node_name, 'olt_id': inc.olt_id, 'olt_name': olt.name if olt else '',
        'affected_count': inc.affected_count or 0, 'peak_affected': inc.peak_affected or 0,
        'assigned': _names(inc.assigned_user_ids),
        'acknowledged_by': inc.acknowledged_by or '', 'resolved_by': inc.resolved_by or '',
        'opened_at': utc_iso(inc.opened_at), 'acknowledged_at': utc_iso(inc.acknowledged_at),
        'en_route_at': utc_iso(inc.en_route_at), 'on_site_at': utc_iso(inc.on_site_at),
        'resolved_at': utc_iso(inc.resolved_at), 'recovered_at': utc_iso(inc.recovered_at),
        'resolution_note': inc.resolution_note or '', 'merged_into_id': inc.merged_into_id,
        'escalation_level': inc.escalation_level or 0,
    }


@bp.route('/api/incidents', methods=['GET'])
@login_required
def list_incidents():
    status = request.args.get('status', 'active')
    q = Incident.query
    if status == 'active':
        q = q.filter(Incident.status.in_(ACTIVE_STATUSES))
    elif status == 'closed':
        q = q.filter(Incident.status.in_(('resolved', 'merged')))
    try:
        limit = max(1, min(200, int(request.args.get('limit', 100))))
    except ValueError:
        limit = 100
    rows = q.order_by(Incident.opened_at.desc()).limit(limit).all()
    active = Incident.query.filter(Incident.status.in_(ACTIVE_STATUSES)).count()
    closed = Incident.query.filter(Incident.status.in_(('resolved', 'merged'))).count()
    return jsonify({'success': True, 'incidents': [_summary(i) for i in rows],
                    'active_count': active, 'closed_count': closed})


@bp.route('/api/incidents/<int:inc_id>', methods=['GET'])
@login_required
def get_incident(inc_id):
    inc = db.session.get(Incident, inc_id)
    if not inc:
        return jsonify({'success': False, 'message': 'Insiden tidak ditemukan'}), 404
    ids = json.loads(inc.affected_onu_ids or '[]')[:300]
    onus = []
    for oid in ids:
        o = db.session.get(ONU, oid)
        if o:
            port = getattr(o, 'odp_port', None)
            onus.append({'id': o.id, 'name': o.name or o.serial_number or '', 'serial': o.serial_number or '',
                         'status': o.status or '',
                         'customer': (port.customer_name or '') if port else '',
                         'phone': (port.customer_phone or '') if port else ''})
    logs = IncidentLog.query.filter_by(incident_id=inc.id).order_by(IncidentLog.created_at.asc()).all()
    data = _summary(inc)
    data.update({
        'maps_url': _maps(inc),
        'onus': onus,
        'online_now': sum(1 for o in onus if o['status'] == 'online'),
        'logs': [{'id': lg.id, 'at': utc_iso(lg.created_at), 'username': lg.username, 'action': lg.action,
                  'status': lg.status, 'note': lg.note, 'photo': lg.photo} for lg in logs],
        'can_handle': _can_handle(),
    })
    return jsonify({'success': True, 'incident': data})


@bp.route('/api/incidents/<int:inc_id>/status', methods=['POST'])
@login_required
def set_status(inc_id):
    if not _can_handle():
        return jsonify({'success': False, 'message': 'Tidak punya izin menangani insiden'}), 403
    inc = db.session.get(Incident, inc_id)
    if not inc:
        return jsonify({'success': False, 'message': 'Insiden tidak ditemukan'}), 404
    d = request.get_json() or {}
    new = d.get('status')
    note = (d.get('note') or '').strip()[:2000]
    if new not in STATUS_ORDER[1:]:
        return jsonify({'success': False, 'message': 'Status tidak valid'}), 400
    if inc.status not in ACTIVE_STATUSES:
        return jsonify({'success': False, 'message': 'Insiden sudah ditutup'}), 400
    if STATUS_ORDER.index(new) <= STATUS_ORDER.index(inc.status):
        return jsonify({'success': False, 'message': 'Status hanya bisa maju'}), 400
    if new == 'resolved' and len(note) < 3:
        return jsonify({'success': False, 'message': 'Isi penyebab/penanganan sebelum menutup insiden'}), 400
    now = datetime.now(timezone.utc)
    who = current_user.full_name or current_user.username
    for st in STATUS_ORDER[1:STATUS_ORDER.index(new) + 1]:
        col = _TS[st]
        if getattr(inc, col) is None:
            setattr(inc, col, now)
    if not inc.acknowledged_by:
        inc.acknowledged_by = who
    if new == 'resolved':
        inc.resolved_by = who
        inc.resolution_note = note
    inc.status = new
    add_log(inc, 'status', status=new, note=note, username=who)
    db.session.commit()
    log_action('incident_status', 'alerts', target=f'incident #{inc.id}', detail=f'{new}: {note[:200]}')
    return jsonify({'success': True, 'incident': _summary(inc)})


@bp.route('/api/incidents/<int:inc_id>/notes', methods=['POST'])
@login_required
def add_note(inc_id):
    if not _can_handle():
        return jsonify({'success': False, 'message': 'Tidak punya izin menangani insiden'}), 403
    inc = db.session.get(Incident, inc_id)
    if not inc:
        return jsonify({'success': False, 'message': 'Insiden tidak ditemukan'}), 404
    note = ((request.get_json() or {}).get('note') or '').strip()[:2000]
    if not note:
        return jsonify({'success': False, 'message': 'Catatan kosong'}), 400
    add_log(inc, 'note', note=note, username=current_user.full_name or current_user.username)
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/incidents/<int:inc_id>/photos', methods=['POST'])
@login_required
def add_photo(inc_id):
    if not _can_handle():
        return jsonify({'success': False, 'message': 'Tidak punya izin menangani insiden'}), 403
    inc = db.session.get(Incident, inc_id)
    if not inc:
        return jsonify({'success': False, 'message': 'Insiden tidak ditemukan'}), 404
    up = request.files.get('photo')
    if not up or not up.filename:
        return jsonify({'success': False, 'message': 'Tidak ada foto'}), 400
    ext = up.filename.rsplit('.', 1)[-1].lower() if '.' in up.filename else ''
    if ext not in _PHOTO_EXT:
        return jsonify({'success': False, 'message': 'Format foto harus JPG atau PNG'}), 400
    data = up.read()
    if not data or len(data) > _MAX_PHOTO:
        return jsonify({'success': False, 'message': 'Ukuran foto maksimal 8 MB'}), 400
    if not any(data.startswith(sig) for sig in _PHOTO_EXT[ext]):
        return jsonify({'success': False, 'message': 'Isi file bukan gambar yang valid'}), 400
    name = f'{uuid.uuid4().hex}.{"jpg" if ext == "jpeg" else ext}'
    with open(os.path.join(_photo_dir(inc.id), name), 'wb') as f:
        f.write(data)
    note = (request.form.get('note') or '').strip()[:500]
    add_log(inc, 'photo', note=note, photo=name, username=current_user.full_name or current_user.username)
    db.session.commit()
    return jsonify({'success': True, 'photo': name})


@bp.route('/api/incidents/<int:inc_id>/photos/<name>', methods=['GET'])
@login_required
def get_photo(inc_id, name):
    if not IncidentLog.query.filter_by(incident_id=inc_id, photo=name).first():
        abort(404)
    return send_from_directory(_photo_dir(inc_id), name, max_age=3600)


@bp.route('/api/incidents/report', methods=['GET'])
@login_required
def incident_report():
    """Fase 5 — ringkasan kinerja penanganan gangguan untuk N hari terakhir."""
    from datetime import timedelta
    from escalation import escalation_settings
    try:
        days = max(1, min(365, int(request.args.get('days', 30))))
    except ValueError:
        days = 30
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    since = now - timedelta(days=days)
    rows = Incident.query.filter(Incident.opened_at >= since, Incident.status != 'merged').all()
    _, _, ttr_h = escalation_settings()

    def _n(dt):
        return dt.replace(tzinfo=None) if dt is not None and dt.tzinfo else dt

    def _mins(a, b):
        return (_n(b) - _n(a)).total_seconds() / 60

    handled = [i for i in rows if i.status == 'resolved' and i.resolved_by]
    self_recovered = [i for i in rows if i.status == 'resolved' and not i.resolved_by]
    acked = [i for i in rows if i.acknowledged_at]
    mttr = round(sum(_mins(i.opened_at, i.resolved_at) for i in handled) / len(handled)) if handled else None
    mtta = round(sum(_mins(i.opened_at, i.acknowledged_at) for i in acked) / len(acked)) if acked else None
    breaches = sum(1 for i in rows if _mins(i.opened_at, i.resolved_at or now) > ttr_h * 60)

    causes = {'power': 0, 'fiber': 0, 'mixed': 0}
    nodes, techs = {}, {}
    for i in rows:
        causes[i.cause if i.cause in causes else 'mixed'] += 1
        k = (i.node_type, i.node_id)
        nodes.setdefault(k, {'node_type': i.node_type, 'node_id': i.node_id, 'node_name': i.node_name, 'count': 0,
                             'customers': 0})
        nodes[k]['count'] += 1
        nodes[k]['customers'] += i.peak_affected or 0
    for i in handled:
        t = techs.setdefault(i.resolved_by, {'name': i.resolved_by, 'resolved': 0, 'minutes': 0.0})
        t['resolved'] += 1
        t['minutes'] += _mins(i.opened_at, i.resolved_at)
    tech_rows = [{'name': t['name'], 'resolved': t['resolved'], 'avg_minutes': round(t['minutes'] / t['resolved'])}
                 for t in techs.values()]
    tech_rows.sort(key=lambda r: (-r['resolved'], r['avg_minutes']))
    top_nodes = sorted(nodes.values(), key=lambda r: (-r['count'], -r['customers']))[:10]
    return jsonify({
        'success': True, 'days': days, 'ttr_hours': ttr_h,
        'total': len(rows), 'active': sum(1 for i in rows if i.status in ACTIVE_STATUSES),
        'resolved_handled': len(handled), 'resolved_self': len(self_recovered),
        'mttr_minutes': mttr, 'mtta_minutes': mtta, 'ttr_breaches': breaches,
        'causes': causes, 'top_nodes': top_nodes, 'technicians': tech_rows,
    })
