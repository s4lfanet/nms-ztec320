"""Auth routes — API auth endpoints + legacy route redirects to React SPA.

Blueprint 'auth' — all HTML rendering removed, React SPA at root /* handles UI.
"""
from flask import Blueprint, redirect, request, jsonify, session
from flask_login import login_user, logout_user, login_required, current_user

from models import db, User
from helpers import utc_iso, log_action, check_rate_limit, record_failed_login, clear_failed_logins

bp = Blueprint('auth', __name__)


@bp.route('/logout')
def logout():
    logout_user()
    return redirect('/login')


@bp.route('/api/auth/me')
@login_required
def api_me():
    from models import SystemConfig
    sys_cfg = {c.key: c.value for c in SystemConfig.query.all()}
    nms_name = sys_cfg.get('nms_name', 'Salfanet NMS')
    return jsonify({'user': {
        'id': current_user.id,
        'full_name': current_user.full_name,
        'username': current_user.username,
        'role': current_user.role.name if current_user.role else 'User',
        'permissions': current_user.role.permissions.split(',') if current_user.role else [],
        'sidebar_name': nms_name,
        'is_super_admin': current_user.is_super_admin,
    }})


@bp.route('/api/auth/login', methods=['POST'])
def api_login():
    client_ip = request.headers.get('X-Forwarded-For', '').split(',')[0].strip() or request.remote_addr
    allowed, retry_after = check_rate_limit(client_ip)
    if not allowed:
        return jsonify({'success': False, 'message': f'Too many login attempts. Please try again in {retry_after} seconds.'}), 429

    data = request.get_json() or {}
    username = data.get('username', '')
    password = data.get('password', '')
    user = User.query.filter_by(username=username).first()

    if user and user.check_password(password):
        login_user(user)
        session.permanent = True
        clear_failed_logins(client_ip)
        log_action('login', 'auth', target=user.username, detail=f'User {user.username} logged in')
        return jsonify({'success': True, 'user': {
            'id': user.id, 'full_name': user.full_name, 'username': user.username,
            'role': user.role.name if user.role else 'User',
            'permissions': user.role.permissions.split(',') if user.role else [],
            'is_super_admin': user.is_super_admin,
        }})
    record_failed_login(client_ip)
    return jsonify({'success': False, 'message': 'Invalid credentials'}), 401


@bp.route('/api/auth/logout', methods=['POST'])
@login_required
def api_logout():
    log_action('logout', 'auth', target=current_user.username, detail=f'User {current_user.username} logged out')
    logout_user()
    return jsonify({'success': True})
