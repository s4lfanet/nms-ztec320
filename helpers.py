"""Shared helper functions and decorators used across all route modules.

Extracted from app.py during modularization. These functions are imported
by route blueprints to avoid code duplication.
"""
from functools import wraps
from flask import request, jsonify, flash, redirect, url_for, current_app
from flask_login import current_user, login_required
from models import db, OLT, ActionLog, SystemConfig
from extensions import logger


def get_system_timezone():
    """Get the configured system timezone from SystemConfig.
    Defaults to 'Asia/Jakarta' if not set.
    Used by auto_backup, API responses, and logging for consistent local time.
    """
    try:
        cfg = SystemConfig.query.filter_by(key='timezone').first()
        if cfg and cfg.value:
            return cfg.value
    except Exception:
        pass
    return 'Asia/Jakarta'


def utc_iso(dt):
    """Serialize a datetime to ISO format with UTC suffix.
    SQLite strips timezone info, so naive datetimes need +00:00 appended
    so the browser interprets them correctly as UTC.
    The browser then converts to the user's local timezone for display."""
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
        ip = ''
        if request:
            ip = request.headers.get('X-Forwarded-For', '').split(',')[0].strip()
            if not ip:
                ip = request.headers.get('X-Real-IP', '').strip()
            if not ip:
                ip = request.remote_addr or ''
        entry = ActionLog(
            user_id=uid, username=uname or '',
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
    Returns JSON 403 for API calls, redirects for HTML pages.
    Logs unauthorized access attempts."""
    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            if not current_user.has_permission(perm):
                # Log unauthorized access attempt
                logger.warning(
                    f'Unauthorized access: user={current_user.username} '
                    f'perm={perm} path={request.path} method={request.method}'
                )
                try:
                    log_action('unauthorized_access', 'security',
                               target=request.path,
                               detail=f'Required permission: {perm}')
                except Exception:
                    pass
                if request.path.startswith('/api/'):
                    return jsonify({'success': False, 'message': 'Permission denied'}), 403
                flash('You do not have permission to access this page.', 'danger')
                return redirect('/dashboard')
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def super_admin_required(f):
    """Decorator that checks if current user is a super admin."""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        if not current_user.is_super_admin:
            if request.path.startswith('/api/'):
                return jsonify({'success': False, 'message': 'Super admin access required'}), 403
            return redirect('/')
        return f(*args, **kwargs)
    return decorated_function


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
