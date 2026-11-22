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
