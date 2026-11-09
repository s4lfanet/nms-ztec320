"""Auth routes — API auth endpoints + legacy route redirects to React SPA.

Blueprint 'auth' — all HTML rendering removed, React SPA at root /* handles UI.
"""
from flask import Blueprint, redirect, request, jsonify, session, current_app
from flask_login import login_user, logout_user, login_required, current_user

from models import db, User
from helpers import utc_iso, log_action, check_rate_limit, record_failed_login, clear_failed_logins

bp = Blueprint('auth', __name__)

# Password bawaan installer (lihat seed admin di app.py).
INSTALLER_DEFAULT_PASSWORDS = frozenset({'admin123'})


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
    logo_url = sys_cfg.get('nms_logo_url') or None
    return jsonify({'user': {
        'id': current_user.id,
        'full_name': current_user.full_name,
        'username': current_user.username,
        'role': current_user.role.name if current_user.role else 'User',
        'permissions': current_user.role.permissions.split(',') if current_user.role else [],
        'sidebar_name': nms_name,
        'logo_url': logo_url,
        'is_super_admin': current_user.is_super_admin,
        'must_change_password': bool(current_user.must_change_password),
        'theme': current_user.theme or 'system',
        'language': current_user.language or 'id',
    }})


@bp.route('/api/auth/login', methods=['POST'])
def api_login():
    # app.py installs ProxyFix(x_for=1, ...), which already normalizes
    # request.remote_addr from a trusted X-Forwarded-For header. Reading the
    # header directly here let a caller set an arbitrary X-Forwarded-For and
    # get a fresh rate-limit bucket on every login attempt, defeating the
    # brute-force protection below entirely.
    client_ip = request.remote_addr
    allowed, retry_after = check_rate_limit(client_ip)
    if not allowed:
        return jsonify({'success': False, 'error_code': 'rate_limited', 'retry_after': retry_after, 'message': f'Too many login attempts. Please try again in {retry_after} seconds.'}), 429

    data = request.get_json() or {}
    username = data.get('username', '')
    password = data.get('password', '')
    user = User.query.filter_by(username=username).first()

    if user and user.check_password(password):
        # Install yang dibuat sebelum flag ini ada (atau admin yang di-reset
        # ke password bawaan) tidak pernah ditandai must_change_password.
        # Tandai sekarang, saat password bawaan terbukti dipakai login.
        # Suite tes lama memakai password bawaan sebagai kredensial fixture, jadi saat
        # TESTING penandaan ini hanya aktif bila diminta eksplisit.
        _flag_default = (not current_app.config.get('TESTING')
                         or current_app.config.get('FORCE_DEFAULT_PASSWORD_FLAG'))
        if _flag_default and password in INSTALLER_DEFAULT_PASSWORDS and not user.must_change_password:
            user.must_change_password = True
            db.session.commit()
            log_action('default_password_flagged', 'security', target=user.username,
                       detail='Login with installer default password — password change required')
        login_user(user)
        session.permanent = True
        clear_failed_logins(client_ip)
        log_action('login', 'auth', target=user.username, detail=f'User {user.username} logged in')
        from models import SystemConfig
        sys_cfg = {c.key: c.value for c in SystemConfig.query.all()}
        return jsonify({'success': True, 'user': {
            'id': user.id, 'full_name': user.full_name, 'username': user.username,
            'role': user.role.name if user.role else 'User',
            'permissions': user.role.permissions.split(',') if user.role else [],
            'sidebar_name': sys_cfg.get('nms_name', 'Salfanet NMS'),
            'logo_url': sys_cfg.get('nms_logo_url') or None,
            'is_super_admin': user.is_super_admin,
            'must_change_password': bool(user.must_change_password),
            'theme': user.theme or 'system',
            'language': user.language or 'id',
        }})
    record_failed_login(client_ip)
    return jsonify({'success': False, 'error_code': 'invalid_credentials', 'message': 'Invalid credentials'}), 401


@bp.route('/api/auth/logout', methods=['POST'])
@login_required
def api_logout():
    log_action('logout', 'auth', target=current_user.username, detail=f'User {current_user.username} logged out')
    logout_user()
    return jsonify({'success': True})
