"""Auto-extracted from app.py monolith split (blueprint: users).
Behavior-preserving move: route bodies are unchanged from the original app.py.
"""
from flask import Blueprint, request, jsonify, g, session, redirect
from flask_login import login_required, current_user
from datetime import datetime, timezone, timedelta
from functools import wraps
import logging, re, threading, os, json, time, hashlib, shutil, hmac, glob

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

bp = Blueprint('users', __name__)

@bp.route('/api/users')
@permission_required('manage_users')
def api_users():
    users = User.query.all()
    roles = Role.query.all()
    return jsonify({
        'users': [{
            'id': u.id, 'full_name': u.full_name, 'username': u.username,
            'role': u.role.name if u.role else 'User', 'role_id': u.role_id or 0,
            'phone': u.phone or '',
        } for u in users],
        'roles': [{
            'id': r.id, 'name': r.name, 'description': r.description,
            'permissions': r.permissions, 'is_system': r.is_system,
        } for r in roles],
    })


@bp.route('/api/profile', methods=['POST'])
@login_required
def update_profile():
    data = request.get_json()
    if 'full_name' in data:
        current_user.full_name = data['full_name']
    if 'sidebar_name' in data:
        if not current_user.is_super_admin:
            return jsonify({'success': False, 'message': 'Only super admin can change branding name.'}), 403
        current_user.sidebar_name = data['sidebar_name']
        # Also update SystemConfig so all users see consistent branding
        cfg = SystemConfig.query.filter_by(key='nms_name').first()
        if cfg:
            cfg.value = data['sidebar_name']
        else:
            db.session.add(SystemConfig(key='nms_name', value=data['sidebar_name']))
    if 'password' in data and data['password']:
        current_user.set_password(data['password'])
    db.session.commit()
    log_action('profile_update', 'user', target=current_user.username, detail=f'Updated own profile — fields: {list(data.keys())}')
    return jsonify({'success': True})


ALLOWED_LOGO_EXT = {'png', 'jpg', 'jpeg', 'webp', 'gif'}
# Signature check guards against a mislabeled/corrupt upload being written to
# disk and served as a broken image — not a security boundary (the file is
# never executed, only served as static bytes with a matching Content-Type).
LOGO_MAGIC_BYTES = {
    'png': (b'\x89PNG\r\n\x1a\n',),
    'jpg': (b'\xff\xd8\xff',),
    'jpeg': (b'\xff\xd8\xff',),
    'gif': (b'GIF87a', b'GIF89a'),
}
MAX_LOGO_SIZE = 2 * 1024 * 1024  # 2MB


def _logo_dir():
    base = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'uploads')
    os.makedirs(base, exist_ok=True)
    return base


def _clear_logo_files(logo_dir):
    for old in glob.glob(os.path.join(logo_dir, 'company-logo.*')):
        try:
            os.remove(old)
        except OSError:
            pass


@bp.route('/api/profile/logo', methods=['POST'])
@super_admin_required
def upload_logo():
    if 'logo' not in request.files:
        return jsonify({'success': False, 'message': 'No logo file uploaded'}), 400
    upload = request.files['logo']
    if not upload.filename:
        return jsonify({'success': False, 'message': 'Empty filename'}), 400

    ext = upload.filename.rsplit('.', 1)[-1].lower() if '.' in upload.filename else ''
    if ext not in ALLOWED_LOGO_EXT:
        return jsonify({'success': False, 'message': 'Unsupported file type. Use PNG, JPG, WEBP, or GIF.'}), 400

    data = upload.read()
    if not data:
        return jsonify({'success': False, 'message': 'Empty file.'}), 400
    if len(data) > MAX_LOGO_SIZE:
        return jsonify({'success': False, 'message': 'Logo file too large (max 2MB).'}), 400

    if ext == 'webp':
        magic_ok = data[:4] == b'RIFF' and data[8:12] == b'WEBP'
    else:
        magic_ok = any(data.startswith(sig) for sig in LOGO_MAGIC_BYTES[ext])
    if not magic_ok:
        return jsonify({'success': False, 'message': 'File content does not match a valid image.'}), 400

    logo_dir = _logo_dir()
    _clear_logo_files(logo_dir)
    filename = f'company-logo.{ext}'
    with open(os.path.join(logo_dir, filename), 'wb') as f:
        f.write(data)

    logo_url = f'/static/uploads/{filename}?v={int(time.time())}'
    cfg = SystemConfig.query.filter_by(key='nms_logo_url').first()
    if cfg:
        cfg.value = logo_url
    else:
        db.session.add(SystemConfig(key='nms_logo_url', value=logo_url))
    db.session.commit()
    log_action('logo_upload', 'general', target='branding', detail=f'Uploaded company logo ({ext}, {len(data)} bytes)')
    return jsonify({'success': True, 'logo_url': logo_url})


@bp.route('/api/profile/logo', methods=['DELETE'])
@super_admin_required
def reset_logo():
    _clear_logo_files(_logo_dir())
    cfg = SystemConfig.query.filter_by(key='nms_logo_url').first()
    if cfg:
        db.session.delete(cfg)
        db.session.commit()
    log_action('logo_reset', 'general', target='branding', detail='Reset to default logo')
    return jsonify({'success': True})


@bp.route('/api/permissions')
@permission_required('manage_users')
def api_permissions():
    from models import AVAILABLE_PERMISSIONS
    return jsonify({'permissions': AVAILABLE_PERMISSIONS})


@bp.route('/api/user', methods=['POST'])
@permission_required('manage_users')
def create_user():
    data = request.get_json()
    if User.query.filter_by(username=data.get('username')).first():
        return jsonify({'success': False, 'message': 'Username already exists'})
    user = User(
        full_name=data.get('full_name', ''),
        username=data.get('username', ''),
        role_id=data.get('role_id'),
        is_super_admin=False,
        phone=data.get('phone', ''),
    )
    user.set_password(data.get('password', ''))
    db.session.add(user)
    db.session.commit()
    log_action('user_create', 'user', target=user.username, detail=f'Created user {user.username} ({user.full_name})')
    return jsonify({'success': True, 'id': user.id})


@bp.route('/api/user/<int:uid>', methods=['GET'])
@permission_required('manage_users')
def get_user(uid):
    user = db.session.get(User, uid)
    if not user:
        return jsonify({'success': False}), 404
    return jsonify({
        'success': True,
        'user': {
            'id': user.id,
            'full_name': user.full_name,
            'username': user.username,
            'role_id': user.role_id,
            'phone': user.phone or '',
        }
    })


@bp.route('/api/user/<int:uid>', methods=['PUT'])
@permission_required('manage_users')
def update_user(uid):
    user = db.session.get(User, uid)
    if not user:
        return jsonify({'success': False}), 404
    data = request.get_json()
    if 'full_name' in data:
        user.full_name = data['full_name']
    if 'role_id' in data:
        user.role_id = data['role_id']
    if 'phone' in data:
        user.phone = data['phone']
    if 'password' in data and data['password']:
        user.set_password(data['password'])
    db.session.commit()
    log_action('user_update', 'user', target=user.username, detail=f'Updated user {user.username} — fields: {list(data.keys())}')
    return jsonify({'success': True})


@bp.route('/api/user/<int:uid>', methods=['DELETE'])
@permission_required('manage_users')
def delete_user(uid):
    user = db.session.get(User, uid)
    if not user:
        return jsonify({'success': False, 'message': 'User not found'})
    if user.id == current_user.id:
        return jsonify({'success': False, 'message': 'Cannot delete your own account'})
    # Unassign this user from any ONUs before deleting (technician_id FK)
    ONU.query.filter_by(technician_id=user.id).update({'technician_id': None})
    db.session.delete(user)
    db.session.commit()
    log_action('user_delete', 'user', target=user.username, detail=f'Deleted user {user.username} ({user.full_name})')
    return jsonify({'success': True})


@bp.route('/api/role', methods=['POST'])
@permission_required('manage_users')
def create_role():
    data = request.get_json()
    r = Role(
        name=data.get('name', ''),
        description=data.get('description', ''),
        permissions=','.join(data.get('permissions', []))
    )
    db.session.add(r)
    db.session.commit()
    log_action('role_create', 'role', target=r.name, detail=f'Created role {r.name} with {len(data.get("permissions", []))} permissions')
    return jsonify({'success': True, 'id': r.id})


@bp.route('/api/role/<int:rid>', methods=['PUT'])
@permission_required('manage_users')
def update_role(rid):
    r = db.session.get(Role, rid)
    if not r:
        return jsonify({'success': False}), 404
    data = request.get_json()
    if 'name' in data:
        r.name = data['name']
    if 'description' in data:
        r.description = data['description']
    if 'permissions' in data:
        r.permissions = ','.join(data['permissions'])
    db.session.commit()
    log_action('role_update', 'role', target=r.name, detail=f'Updated role {r.name} — fields: {list(data.keys())}')
    return jsonify({'success': True})


@bp.route('/api/role/<int:rid>', methods=['DELETE'])
@permission_required('manage_users')
def delete_role(rid):
    r = db.session.get(Role, rid)
    if not r:
        return jsonify({'success': False, 'message': 'Role not found'})
    if r.is_system:
        return jsonify({'success': False, 'message': 'Cannot delete system role'})
    db.session.delete(r)
    db.session.commit()
    log_action('role_delete', 'role', target=r.name, detail=f'Deleted role {r.name}')
    return jsonify({'success': True})
