"""Fase 2 — CRUD wilayah teknisi (`technician_areas`)."""
from flask import Blueprint, request, jsonify
from flask_login import login_required

from models import db, User, OLT, TechnicianArea
from ftth_topology import NODE_MODELS, get_node
from helpers import log_action, permission_required

bp = Blueprint('tech_areas', __name__)

_TYPES = ('olt',) + tuple(NODE_MODELS.keys())


def _node_name(node_type, node_id):
    if node_type == 'olt':
        o = db.session.get(OLT, node_id)
        return o.name if o else None
    n = get_node(node_type, node_id)
    return n.name if n else None


def _row(a):
    return {
        'id': a.id, 'user_id': a.user_id,
        'user_name': (a.user.full_name or a.user.username) if a.user else '',
        'user_phone': (a.user.phone or '') if a.user else '',
        'node_type': a.node_type, 'node_id': a.node_id,
        'node_name': _node_name(a.node_type, a.node_id) or f'#{a.node_id}',
        'role': a.role,
    }


@bp.route('/api/technician-areas', methods=['GET'])
@login_required
def list_areas():
    rows = TechnicianArea.query.order_by(TechnicianArea.node_type, TechnicianArea.node_id).all()
    return jsonify({'success': True, 'areas': [_row(a) for a in rows]})


@bp.route('/api/technician-areas/nodes', methods=['GET'])
@login_required
def list_nodes():
    nodes = [{'type': 'olt', 'id': o.id, 'name': o.name} for o in OLT.query.order_by(OLT.name).all()]
    for t, model in NODE_MODELS.items():
        nodes += [{'type': t, 'id': n.id, 'name': n.name} for n in model.query.order_by(model.name).all()]
    return jsonify({'success': True, 'nodes': nodes})


@bp.route('/api/technician-areas', methods=['POST'])
@login_required
@permission_required('manage_users')
def add_area():
    d = request.get_json() or {}
    try:
        user_id = int(d.get('user_id'))
        node_id = int(d.get('node_id'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': 'user_id/node_id tidak valid'}), 400
    node_type = str(d.get('node_type') or '')
    role = 'backup' if d.get('role') == 'backup' else 'primary'
    if node_type not in _TYPES:
        return jsonify({'success': False, 'message': 'node_type tidak valid'}), 400
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'success': False, 'message': 'User tidak ditemukan'}), 404
    name = _node_name(node_type, node_id)
    if name is None:
        return jsonify({'success': False, 'message': 'Node tidak ditemukan'}), 404
    a = TechnicianArea.query.filter_by(user_id=user_id, node_type=node_type, node_id=node_id).first()
    if a:
        a.role = role
    else:
        a = TechnicianArea(user_id=user_id, node_type=node_type, node_id=node_id, role=role)
        db.session.add(a)
    db.session.commit()
    log_action('technician_area_set', 'users', target=user.username,
               detail=f'{node_type.upper()} {name} ({role})')
    return jsonify({'success': True, 'area': _row(a)})


@bp.route('/api/technician-areas/scope', methods=['GET'])
@login_required
def get_scope():
    from alert_routing import alert_scope
    return jsonify({'success': True, 'scope': alert_scope()})


@bp.route('/api/technician-areas/scope', methods=['PUT'])
@login_required
@permission_required('manage_users')
def set_scope():
    from models import SystemConfig
    from alert_routing import SCOPE_KEY
    scope = 'area' if (request.get_json() or {}).get('scope') == 'area' else 'all'
    row = SystemConfig.query.filter_by(key=SCOPE_KEY).first()
    if row:
        row.value = scope
    else:
        db.session.add(SystemConfig(key=SCOPE_KEY, value=scope))
    db.session.commit()
    log_action('technician_alert_scope', 'users', target='alert', detail=scope)
    return jsonify({'success': True, 'scope': scope})


@bp.route('/api/technician-areas/bulk', methods=['POST'])
@login_required
@permission_required('manage_users')
def add_areas_bulk():
    """Beberapa teknisi × beberapa node sekaligus (idempoten: pasangan yang ada hanya diubah perannya).
    Body: {user_ids: [..], nodes: [{node_type, node_id}, ..], role}"""
    d = request.get_json() or {}
    role = 'backup' if d.get('role') == 'backup' else 'primary'
    try:
        user_ids = sorted({int(x) for x in (d.get('user_ids') or [])})
        nodes = {(str(n.get('node_type') or ''), int(n.get('node_id'))) for n in (d.get('nodes') or [])}
    except (TypeError, ValueError, AttributeError):
        return jsonify({'success': False, 'message': 'Data tidak valid'}), 400
    if not user_ids or not nodes:
        return jsonify({'success': False, 'message': 'Pilih minimal satu teknisi dan satu wilayah'}), 400
    if len(user_ids) * len(nodes) > 2000:
        return jsonify({'success': False, 'message': 'Terlalu banyak sekaligus (maks 2000 kombinasi)'}), 400
    users = {u.id: u for u in User.query.filter(User.id.in_(user_ids)).all()}
    if len(users) != len(user_ids):
        return jsonify({'success': False, 'message': 'Ada teknisi yang tidak ditemukan'}), 404
    names = {}
    for nt, nid in nodes:
        if nt not in _TYPES or (names.setdefault((nt, nid), _node_name(nt, nid)) is None):
            return jsonify({'success': False, 'message': f'Wilayah tidak valid: {nt} #{nid}'}), 404
    existing = {(a.user_id, a.node_type, a.node_id): a
                for a in TechnicianArea.query.filter(TechnicianArea.user_id.in_(user_ids)).all()}
    added = changed = 0
    for uid in user_ids:
        for nt, nid in sorted(nodes):
            a = existing.get((uid, nt, nid))
            if a is None:
                db.session.add(TechnicianArea(user_id=uid, node_type=nt, node_id=nid, role=role)); added += 1
            elif a.role != role:
                a.role = role; changed += 1
    db.session.commit()
    log_action('technician_area_bulk', 'users', target=','.join(users[u].username for u in user_ids),
               detail=f'{len(nodes)} wilayah ({role}): +{added}, diubah {changed}')
    return jsonify({'success': True, 'added': added, 'changed': changed})


@bp.route('/api/technician-areas/<int:area_id>', methods=['DELETE'])
@login_required
@permission_required('manage_users')
def delete_area(area_id):
    a = db.session.get(TechnicianArea, area_id)
    if not a:
        return jsonify({'success': False, 'message': 'Tidak ditemukan'}), 404
    detail = f'{a.node_type.upper()} #{a.node_id} ({a.role})'
    username = a.user.username if a.user else ''
    db.session.delete(a)
    db.session.commit()
    log_action('technician_area_delete', 'users', target=username, detail=detail)
    return jsonify({'success': True})
