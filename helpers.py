"""Shared helper functions and decorators used across all route modules.

Extracted from app.py during modularization. These functions are imported
by route blueprints to avoid code duplication.
"""
from functools import wraps
from flask import request, jsonify, flash, redirect, url_for, current_app
from flask_login import current_user, login_required
from models import db, OLT, ActionLog
from extensions import logger


def utc_iso(dt):
    """Serialize a datetime to ISO format with UTC suffix.
    SQLite strips timezone info, so naive datetimes need +00:00 appended
    so the browser interprets them correctly as UTC."""
    if not dt:
        return None
    if dt.tzinfo is not None:
        return dt.isoformat()
    return dt.isoformat() + '+00:00'


def log_action(action, category='general', target='', detail=''):
    """Record an action to the audit log."""
    try:
        uid = getattr(current_user, 'id', None) if current_user else None
        uname = getattr(current_user, 'username', '') if current_user else ''
        tid = getattr(current_user, 'tenant_id', None) if current_user else None
        ip = ''
        if request:
            ip = request.headers.get('X-Forwarded-For', '').split(',')[0].strip()
            if not ip:
                ip = request.headers.get('X-Real-IP', '').strip()
            if not ip:
                ip = request.remote_addr or ''
        entry = ActionLog(
            user_id=uid, username=uname or '', tenant_id=tid,
            action=action, category=category,
            target=str(target)[:200], detail=str(detail)[:2000],
            ip_address=ip or '',
        )
        db.session.add(entry)
        db.session.commit()
    except Exception:
        db.session.rollback()


def permission_required(perm):
    """Decorator that checks if current user has the given permission.
    Falls back to @login_required behavior. 403 if logged-in but missing perm."""
    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            if not current_user.has_permission(perm):
                flash('You do not have permission to access this page.', 'danger')
                return redirect(url_for('my_profile'))
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def super_admin_required(f):
    """Decorator that checks if current user is a super admin AND on the main domain."""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        hostname = request.host.split(':')[0].lower()
        main_domains = {'nms.salfa.my.id', 'localhost', '127.0.0.1'}
        if hostname not in main_domains:
            if request.path.startswith('/api/'):
                return jsonify({'success': False, 'message': 'Super admin access is restricted to the main domain'}), 403
            return redirect('/spa/')
        if not current_user.is_super_admin:
            if request.path.startswith('/api/'):
                return jsonify({'success': False, 'message': 'Super admin access required'}), 403
            return redirect('/spa/')
        return f(*args, **kwargs)
    return decorated_function


def get_tenant_id():
    """Get current user's tenant_id. Returns None for super admin (no filter)."""
    if not current_user or not current_user.is_authenticated:
        return None
    if current_user.is_super_admin:
        return None
    return current_user.tenant_id


def tenant_filter(model):
    """Return a SQLAlchemy filter for the current tenant on the given model.
    Returns a no-op filter for super admin."""
    tid = get_tenant_id()
    if tid is None:
        return model.id >= 0
    return model.tenant_id == tid


def check_subscription():
    """Check if current user's subscription is active.
    Returns (ok, message). Super admin always passes."""
    if not current_user or not current_user.is_authenticated:
        return (True, '')
    if current_user.is_super_admin:
        return (True, '')
    if not current_user.is_subscription_active:
        return (False, 'Your subscription has expired. Please renew to continue.')
    return (True, '')


def check_olt_limit():
    """Check if tenant can add more OLTs based on subscription.
    Returns (ok, message)."""
    if not current_user or not current_user.is_authenticated:
        return (True, '')
    if current_user.is_super_admin:
        return (True, '')
    sub = current_user.subscription
    if not sub:
        return (False, 'No active subscription found.')
    tid = current_user.tenant_id
    current_count = OLT.query.filter_by(tenant_id=tid).count()
    if current_count >= sub.max_olts:
        return (False, f'OLT limit reached ({sub.max_olts}). Upgrade your package to add more OLTs.')
    return (True, '')


# Login rate limiting
_login_attempts = {}
_LOGIN_MAX_ATTEMPTS = 5
_LOGIN_WINDOW_SECONDS = 300
_LOGIN_LOCK_SECONDS = 900


def check_rate_limit(ip):
    """Check if IP is rate-limited. Returns (allowed, retry_after_seconds)."""
    import time
    now = time.time()
    attempts = _login_attempts.get(ip, [])
    attempts = [t for t in attempts if now - t < _LOGIN_WINDOW_SECONDS]
    if len(attempts) >= _LOGIN_MAX_ATTEMPTS:
        oldest = min(attempts)
        retry_after = int(_LOGIN_LOCK_SECONDS - (now - oldest))
        if retry_after > 0:
            return False, retry_after
        else:
            _login_attempts.pop(ip, None)
    return True, 0


def record_failed_login(ip):
    """Record a failed login attempt for rate limiting."""
    import time
    now = time.time()
    if ip not in _login_attempts:
        _login_attempts[ip] = []
    _login_attempts[ip].append(now)
    now2 = time.time()
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now2 - t < _LOGIN_WINDOW_SECONDS]


def clear_failed_logins(ip):
    """Clear failed login attempts after successful login."""
    _login_attempts.pop(ip, None)
