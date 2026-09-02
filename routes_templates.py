"""Auto-extracted from app.py monolith split (blueprint: templates).
Behavior-preserving move: route bodies are unchanged from the original app.py.
"""
from flask import Blueprint, request, jsonify, g, session, redirect
from flask_login import login_required, current_user
from datetime import datetime, timezone, timedelta
from functools import wraps
import logging, re, threading, os, json, time, hashlib, shutil, hmac

from sqlalchemy import or_
from sqlalchemy.orm import joinedload

from models import (
    db, User, Role, OLT, ONU, Template, TR069Profile, ONUCustomColumn, Fan,
    OLTSyncStatus, OLTCard, OLTUplink, ONUVlan, ONUType, SpeedProfile,
    WanIpProfile, OLTPort, AVAILABLE_PERMISSIONS, Notification, AlertRule,
    AlertHistory, BotConfig, FTTHOTB, FTTHODC, FTTHODP, FTTHODPPort,
    FTTHPonPort, FTTHFiberPath, SystemConfig, ActionLog, MetricHistory,
    TrafficLog, TrafficLogHourly, OLTConfigBackup,
)
from extensions import logger
from helpers import (
    utc_iso, log_action, permission_required, super_admin_required,
    check_rate_limit as _check_rate_limit,
    record_failed_login as _record_failed_login,
    clear_failed_logins as _clear_failed_logins,
)
from services_wa import get_nms_branding as _get_nms_branding
from services_sync import start_single_sync, start_sync_all

bp = Blueprint('templates', __name__)

@bp.route('/api/template', methods=['GET', 'POST'])
@permission_required('manage_templates')
def api_template():
    if request.method == 'GET':
        templates = Template.query.order_by(Template.name).all()
        return jsonify([{
            'id': t.id, 'name': t.name, 'vendor': t.vendor, 'model': t.model,
            'onu_type': t.onu_type, 'tcont_profile': t.tcont_profile,
            'traffic_profile': t.traffic_profile, 'vlan': t.vlan,
            'description': t.description, 'config': t.config or '',
            'created_at': t.created_at.isoformat() if t.created_at else None,
        } for t in templates])
    data = request.get_json()
    t = Template(
        name=data.get('name', ''), vendor=data.get('vendor', ''),
        model=data.get('model', ''), onu_type=data.get('onu_type', ''),
        tcont_profile=data.get('tcont_profile', ''), traffic_profile=data.get('traffic_profile', ''),
        vlan=data.get('vlan', 100), description=data.get('description', ''),
        config=data.get('config', ''),
    )
    db.session.add(t)
    db.session.commit()
    log_action('create_template', 'system', detail=f'Template: {t.name}')
    return jsonify({'success': True, 'id': t.id})


@bp.route('/api/template/<int:tid>', methods=['PUT', 'DELETE'])
@permission_required('manage_templates')
def manage_template(tid):
    t = db.session.get(Template, tid)
    if not t:
        return jsonify({'success': False}), 404
    if request.method == 'DELETE':
        db.session.delete(t)
        db.session.commit()
        log_action('delete_template', 'system', detail=f'Template: {t.name}')
        return jsonify({'success': True})
    data = request.get_json()
    for field in ['name', 'vendor', 'model', 'onu_type', 'tcont_profile', 'traffic_profile', 'vlan', 'description', 'config']:
        if field in data:
            setattr(t, field, data[field])
    db.session.commit()
    log_action('update_template', 'system', detail=f'Template: {t.name}')
    return jsonify({'success': True})


@bp.route('/api/tr069', methods=['GET', 'POST'])
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


@bp.route('/api/tr069/<int:pid>', methods=['PUT'])
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


@bp.route('/api/tr069/<int:pid>', methods=['DELETE'])
@permission_required('manage_tr069')
def delete_tr069(pid):
    p = db.session.get(TR069Profile, pid)
    if not p:
        return jsonify({'success': False}), 404
    db.session.delete(p)
    db.session.commit()
    return jsonify({'success': True})
