"""Auth routes — API auth endpoints + legacy route redirects to React SPA.

Blueprint 'auth' — all HTML rendering removed, React SPA at /spa/* handles UI.
"""
from flask import Blueprint, redirect, request, jsonify
from flask_login import login_user, logout_user, login_required, current_user

from models import db, User, Tenant
from helpers import utc_iso, log_action, check_rate_limit, record_failed_login, clear_failed_logins

bp = Blueprint('auth', __name__)


@bp.route('/')
def index():
    return redirect('/spa/')


@bp.route('/login')
@bp.route('/auth/login')
def login():
    return redirect('/spa/login')


@bp.route('/logout')
def logout():
    logout_user()
    return redirect('/spa/login')


@bp.route('/api/auth/me')
@login_required
def api_me():
    from models import SystemConfig
    sys_cfg = {c.key: c.value for c in SystemConfig.query.all()}
    nms_name = sys_cfg.get('nms_name', 'Salfanet NMS')
    sub = current_user.subscription
    return jsonify({'user': {
        'id': current_user.id,
        'full_name': current_user.full_name,
        'username': current_user.username,
        'role': current_user.role.name if current_user.role else 'User',
        'permissions': current_user.role.permissions.split(',') if current_user.role else [],
        'sidebar_name': nms_name,
        'is_super_admin': current_user.is_super_admin,
        'tenant_id': current_user.tenant_id,
        'subscription': {
            'is_active': current_user.is_subscription_active,
            'days_remaining': sub.days_remaining if sub else 0,
            'max_olts': sub.max_olts if sub else 0,
            'package_name': sub.package.name if sub and sub.package else '',
            'end_date': utc_iso(sub.end_date) if sub else None,
        } if not current_user.is_super_admin else None,
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

    hostname = request.host.split(':')[0].lower()
    main_domains = {'nms.salfa.my.id', 'localhost', '127.0.0.1'}
    is_main_domain = hostname in main_domains

    if user and user.check_password(password):
        if is_main_domain and not user.is_super_admin:
            return jsonify({'success': False, 'message': 'Tenant login is not available on this domain. Please use your tenant subdomain.'}), 403
        if not is_main_domain and user.is_super_admin:
            return jsonify({'success': False, 'message': 'Super admin login is restricted to the main domain.'}), 403
        if not is_main_domain and not user.is_super_admin and user.tenant_id:
            tenant = Tenant.query.get(user.tenant_id)
            if tenant and not hostname.startswith(tenant.subdomain.lower() + '.'):
                return jsonify({'success': False, 'message': f'Access denied. This subdomain belongs to "{tenant.name}". Please use your own tenant subdomain.'}), 403
        if not user.is_super_admin and user.tenant_id:
            tenant = Tenant.query.get(user.tenant_id)
            if tenant and tenant.status != 'active':
                return jsonify({'success': False, 'message': f'Tenant "{tenant.name}" is {tenant.status}. Access blocked.'}), 403
            if not user.is_subscription_active:
                return jsonify({'success': False, 'message': 'Your subscription has expired. Please renew to continue.'}), 403
        login_user(user)
        clear_failed_logins(client_ip)
        log_action('login', 'auth', target=user.username, detail=f'User {user.username} logged in')
        sub = user.subscription
        return jsonify({'success': True, 'user': {
            'id': user.id, 'full_name': user.full_name, 'username': user.username,
            'role': user.role.name if user.role else 'User',
            'permissions': user.role.permissions.split(',') if user.role else [],
            'is_super_admin': user.is_super_admin,
            'tenant_id': user.tenant_id,
            'subscription': {
                'is_active': user.is_subscription_active,
                'days_remaining': sub.days_remaining if sub else 0,
                'max_olts': sub.max_olts if sub else 0,
                'package_name': sub.package.name if sub and sub.package else '',
                'end_date': utc_iso(sub.end_date) if sub else None,
            } if not user.is_super_admin else None,
        }})
    record_failed_login(client_ip)
    return jsonify({'success': False, 'message': 'Invalid credentials'}), 401


@bp.route('/api/auth/logout', methods=['POST'])
@login_required
def api_logout():
    log_action('logout', 'auth', target=current_user.username, detail=f'User {current_user.username} logged out')
    logout_user()
    return jsonify({'success': True})
