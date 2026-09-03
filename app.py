from flask import Flask, redirect, request, jsonify, g, session
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.middleware.proxy_fix import ProxyFix
from models import db, User, Role, OLT, ONU, Template, TR069Profile, ONUCustomColumn, Fan, OLTSyncStatus, OLTCard, OLTUplink, ONUVlan, ONUType, SpeedProfile, WanIpProfile, OLTPort, AVAILABLE_PERMISSIONS, Notification, AlertRule, AlertHistory, BotConfig, FTTHOTB, FTTHODC, FTTHODP, FTTHODPPort, FTTHPonPort, FTTHFiberPath, SystemConfig, ActionLog, MetricHistory, TrafficLog, TrafficLogHourly, OLTConfigBackup
from datetime import datetime, timezone, timedelta
from functools import wraps
import logging
import re
import threading
import os
import json
import time
import hashlib
import shutil
import hmac


from sqlalchemy import or_
from sqlalchemy.orm import joinedload

# --- Refactored modules (extracted from monolithic app.py) ---
from extensions import db as _ext_db, login_manager, migrate, logger
from helpers import (
    utc_iso, log_action, permission_required, super_admin_required,
    check_rate_limit as _check_rate_limit,
    record_failed_login as _record_failed_login,
    clear_failed_logins as _clear_failed_logins,
)
from services_wa import (
    get_nms_branding as _get_nms_branding,
)
from services_sync import (
    start_single_sync, start_sync_all,
)
from routes_auth import bp as auth_bp
from routes_dashboard import bp as dashboard_bp
from routes_onu import bp as onu_bp
from routes_olt_sync import bp as olt_sync_bp
from routes_olt_ports import bp as olt_ports_bp
from routes_olt_settings import bp as olt_settings_bp
from routes_olt_spa_data import bp as olt_spa_data_bp
from routes_templates import bp as templates_bp
from routes_users import bp as users_bp
from routes_system import bp as system_bp
from routes_notifications import bp as notifications_bp
from routes_public import bp as public_bp
from routes_whatsapp import bp as whatsapp_bp
from routes_cloudflare import bp as cloudflare_bp
from routes_ftth import bp as ftth_bp
from routes_traffic import bp as traffic_bp
from metrics_service import (
    metrics_response, track_http_request, track_snmp_poll, track_sync,
    update_olt_gauge, update_onu_gauge, track_cache_hit, track_cache_miss,
    set_ws_connections, set_active_users, _ENABLED as METRICS_ENABLED,
)

from config import ActiveConfig

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
app.config.from_object(ActiveConfig)

# Rate limiting moved to helpers.py (check_rate_limit, record_failed_login, clear_failed_logins)

db.init_app(app)
migrate.init_app(app, db)
login_manager.init_app(app)
login_manager.login_message = 'Please login to access this page.'

app.register_blueprint(auth_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(onu_bp)
app.register_blueprint(olt_sync_bp)
app.register_blueprint(olt_ports_bp)
app.register_blueprint(olt_settings_bp)
app.register_blueprint(olt_spa_data_bp)
app.register_blueprint(templates_bp)
app.register_blueprint(users_bp)
app.register_blueprint(system_bp)
app.register_blueprint(notifications_bp)
app.register_blueprint(public_bp)
app.register_blueprint(whatsapp_bp)
app.register_blueprint(cloudflare_bp)
app.register_blueprint(ftth_bp)
app.register_blueprint(traffic_bp)


@app.before_request
def _metrics_before_request():
    """Record request start time for Prometheus timing."""
    g._req_start = time.time()


@app.before_request
def _csrf_protection():
    """CSRF protection: reject state-changing requests without custom header.

    Browsers won't send X-Requested-With on cross-site form submissions,
    so requiring it blocks CSRF attacks. SPA fetch calls include it.
    Login endpoint is exempted to allow initial form login.
    """
    if request.method in ('POST', 'PUT', 'DELETE', 'PATCH'):
        if not request.headers.get('X-Requested-With'):
            _csrf_exempt = (
                '/api/auth/login', '/login',
                '/api/public/forgot-password',
                '/api/public/register', '/api/public/register/pay',
            )
            if request.path not in _csrf_exempt:
                return jsonify({'error': 'Missing X-Requested-With header'}), 403


@app.after_request
def add_security_headers(response):
    """Add security headers to all responses."""
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'geolocation=(self), microphone=(), camera=()'
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' https://static.cloudflareinsights.com https://unpkg.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "img-src 'self' data: blob: https:; "
        "connect-src 'self' ws: wss: https:; "
        "frame-ancestors 'none';"
    )
    if request.is_secure or request.headers.get('X-Forwarded-Proto') == 'https':
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    # Prevent Cloudflare/browser from caching API responses (especially 401s)
    if request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['CDN-Cache-Control'] = 'no-cache, no-store, must-revalidate'
    # Prometheus metrics
    if METRICS_ENABLED and hasattr(g, '_req_start') and not request.path.startswith('/metrics'):
        duration = time.time() - g._req_start
        track_http_request(request.method, request.path, response.status_code, duration)
    return response


# Rate limiting functions moved to helpers.py


@app.route('/metrics')
def prometheus_metrics():
    """Prometheus metrics endpoint for monitoring."""
    data, content_type = metrics_response()
    from flask import Response
    return Response(data, content_type=content_type)


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


@login_manager.unauthorized_handler
def unauthorized():
    if request.path.startswith('/api/'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    return redirect('/login')


@app.errorhandler(500)
def handle_500(e):
    logger.error(f"HTTP 500: {request.method} {request.path} - {e}", exc_info=True)
    if request.path.startswith('/api/'):
        return jsonify({'success': False, 'message': 'Internal server error'}), 500
    return ('Internal Server Error', 500)


@app.errorhandler(404)
def handle_404(e):
    if request.path.startswith('/api/'):
        return jsonify({'success': False, 'message': 'Not found'}), 404
    return redirect('/')


@app.errorhandler(Exception)
def handle_unexpected(e):
    logger.error(f"Unhandled exception: {request.method} {request.path} - {e}", exc_info=True)
    if request.path.startswith('/api/'):
        return jsonify({'success': False, 'message': 'Internal server error'}), 500
    return ('Internal Server Error', 500)


# ==================== SEED INITIAL DATA ====================

def seed_initial_data():
    """Seed only essential initial data - admin user, default roles, default packages"""
    # Ensure phone column exists (for older DBs without migration) — must run before any User query
    try:
        from sqlalchemy import inspect as sa_inspect
        inspector = sa_inspect(db.engine)
        cols = [c['name'] for c in inspector.get_columns('users')]
        if 'phone' not in cols:
            db.session.execute(db.text('ALTER TABLE users ADD COLUMN phone VARCHAR(30) DEFAULT ""'))
            db.session.commit()
            logger.info("Added phone column to users table")
    except Exception as e:
        logger.debug(f"phone column check: {e}")

    # Ensure technician_id column exists on onus table (for older DBs)
    try:
        from sqlalchemy import inspect as sa_inspect
        inspector = sa_inspect(db.engine)
        onu_cols = [c['name'] for c in inspector.get_columns('onus')]
        if 'technician_id' not in onu_cols:
            db.session.execute(db.text('ALTER TABLE onus ADD COLUMN technician_id INTEGER'))
            db.session.commit()
            logger.info("Added technician_id column to onus table")
    except Exception as e:
        logger.debug(f"technician_id column check: {e}")

    # Data loss safeguard: if onu_custom_columns has data but roles is empty,
    # the DB was previously populated but tables were emptied. Refuse to re-seed
    # to avoid masking data loss and alerting the admin.
    existing_roles = Role.query.first()
    if not existing_roles:
        custom_cols = ONUCustomColumn.query.first()
        if custom_cols:
            logger.critical(
                "DATA LOSS DETECTED: onu_custom_columns has data but roles table is empty. "
                "Refusing to re-seed. Restore from backup before continuing."
            )
            return

    if existing_roles:
        # Migrate existing admin to super_admin if not already
        admin = User.query.filter_by(username='admin').first()
        if admin and not admin.is_super_admin:
            admin.is_super_admin = True
            db.session.commit()
        # For existing DBs: ensure Technician role exists
        if not Role.query.filter_by(name='Technician').first():
            tech_role = Role(name='Technician', description='Field technician — view ONUs, receive alerts', is_system=True,
                            permissions='view_dashboard,view_onus,receive_alerts')
            db.session.add(tech_role)
            db.session.commit()
            logger.info("Technician role seeded")
        return  # Already seeded

    # Create default roles
    all_perms = ','.join(AVAILABLE_PERMISSIONS.keys())
    admin_role = Role(name='Full Access', description='Full access to all features', is_system=True, permissions=all_perms)
    viewer_role = Role(name='Viewer', description='View-only access', is_system=True, permissions='view_dashboard')
    limited_role = Role(name='Limited', description='Limited operational access', is_system=True,
                       permissions='view_dashboard,add_onu,configure_onu,reboot_onu,edit_onu_name,edit_onu_description')
    technician_role = Role(name='Technician', description='Field technician — view ONUs, receive alerts', is_system=True,
                          permissions='view_dashboard,view_onus,receive_alerts')
    db.session.add_all([admin_role, viewer_role, limited_role, technician_role])
    db.session.flush()

    # Create admin user (super admin)
    admin = User(full_name='Administrator', username='admin', role_id=admin_role.id, is_super_admin=True)
    admin.set_password('admin123')
    db.session.add(admin)

    # Default columns
    defaults = [
        ('OLT', 'olt'), ('Name', 'name'), ('Description', 'description'),
        ('PPPoE', 'pppoe'), ('ONU ID', 'onu_id_str'), ('Status', 'status'),
        ('RX OLT', 'rx_power'), ('RX ONU', 'onu_rx_power'), ('SN / MAC', 'serial_number'),
        ('Actual Type', 'actual_type'), ('Action', 'action')
    ]
    for i, (name, key) in enumerate(defaults):
        col = ONUCustomColumn(column_name=name, column_key=key, sort_order=i)
        db.session.add(col)

    db.session.commit()
    logger.info("Initial data seeded: admin user (admin/admin123), 3 roles, default columns")
    logger.info("NOTE: No dummy OLT/ONU data. Add your real OLTs via Settings > OLT Settings")


def migrate_schema():
    """Add missing columns to existing tables without losing data.
    Works with both SQLite and PostgreSQL using SQLAlchemy inspection."""
    from sqlalchemy import inspect as sqla_inspect, text as sqla_text
    inspector = sqla_inspect(db.engine)

    # Get existing columns for each table
    def table_cols(table):
        try:
            return {col['name'] for col in inspector.get_columns(table)}
        except:
            return set()

    def add_col(table, col, coltype, default=None):
        if col not in table_cols(table):
            stmt = f"ALTER TABLE {table} ADD COLUMN {col} {coltype}"
            if default is not None:
                stmt += f" DEFAULT {default}"
            try:
                with db.engine.connect() as conn:
                    conn.execute(sqla_text(stmt))
                    conn.commit()
                logger.info(f"  Migration: added {table}.{col}")
            except Exception as e:
                logger.debug(f"  Migration skip {table}.{col}: {e}")

    # OLT table - add new columns
    add_col('olts', 'snmp_status', 'VARCHAR(20)', "'disconnected'")
    add_col('olts', 'telnet_status', 'VARCHAR(20)', "'disconnected'")
    add_col('olts', 'firmware_version', 'VARCHAR(100)', "''")
    add_col('olts', 'last_full_sync', 'DATETIME', None)
    add_col('olts', 'register_mode', 'VARCHAR(10)', "'telnet'")

    # ONU table - add new columns if missing
    add_col('onus', 'actual_type', 'VARCHAR(100)', "''")
    add_col('onus', 'last_seen', 'DATETIME', None)
    add_col('onus', 'card', 'VARCHAR(20)', "''")
    add_col('onus', 'pon', 'VARCHAR(20)', "''")
    add_col('onus', 'onu_rx_power', 'FLOAT', None)

    # ONU Types table - add new columns
    add_col('onu_types', 'max_flow', 'INTEGER', '0')
    add_col('onu_types', 'interfaces', 'TEXT', "''")

    # Fix: update onu_custom_columns to use onu_rx_power instead of tx_power for RX ONU
    try:
        with db.engine.connect() as conn:
            result = conn.execute(sqla_text("UPDATE onu_custom_columns SET column_key='onu_rx_power' WHERE column_key='tx_power' AND column_name='RX ONU'"))
            conn.commit()
            if result.rowcount > 0:
                logger.info(f"  Migration: updated {result.rowcount} onu_custom_columns from tx_power to onu_rx_power")
    except Exception as e:
        logger.debug(f"  Migration skip onu_custom_columns update: {e}")

    # OLT Uplink table - add SFP transceiver columns
    add_col('olt_uplinks', 'sfp_vendor', 'VARCHAR(100)', "''")
    add_col('olt_uplinks', 'sfp_serial', 'VARCHAR(100)', "''")
    add_col('olt_uplinks', 'sfp_type', 'VARCHAR(100)', "''")
    add_col('olt_uplinks', 'sfp_wavelength', 'VARCHAR(50)', "''")
    add_col('olt_uplinks', 'sfp_distance', 'VARCHAR(50)', "''")
    add_col('olt_uplinks', 'sfp_rx_power', 'VARCHAR(20)', "''")
    add_col('olt_uplinks', 'sfp_tx_power', 'VARCHAR(20)', "''")
    add_col('olt_uplinks', 'sfp_temperature', 'VARCHAR(20)', "''")
    add_col('olt_uplinks', 'sfp_voltage', 'VARCHAR(20)', "''")
    add_col('olt_uplinks', 'sfp_bias_current', 'VARCHAR(20)', "''")
    add_col('olt_uplinks', 'sfp_connector', 'VARCHAR(20)', "''")
    add_col('olt_uplinks', 'phy_attribute', 'VARCHAR(20)', "''")
    add_col('olt_uplinks', 'linktrap', 'VARCHAR(10)', "'enable'")
    add_col('olt_uplinks', 'port_protect', 'VARCHAR(10)', "'disable'")
    add_col('olt_uplinks', 'uplink_isolate', 'VARCHAR(10)', "'disable'")
    add_col('olt_uplinks', 'port_type', 'VARCHAR(20)', "''")

    # User table - add sidebar_name
    add_col('users', 'sidebar_name', 'VARCHAR(100)', "'FiberNMS'")
    add_col('users', 'is_super_admin', 'BOOLEAN', '0')

    # Migrate existing admin user to super_admin
    try:
        with db.engine.connect() as conn:
            result = conn.execute(sqla_text("UPDATE users SET is_super_admin=true WHERE username='admin' AND (is_super_admin IS NULL OR is_super_admin=false)"))
            conn.commit()
            if result.rowcount > 0:
                logger.info(f"  Migration: set admin user as super_admin")
    except Exception as e:
        logger.debug(f"  Migration skip admin super_admin: {e}")

    # Notification table - add resolved lifecycle columns
    add_col('notifications', 'resolved', 'BOOLEAN', '0')
    add_col('notifications', 'resolved_at', 'DATETIME', None)

    # AlertHistory table - add first_seen_at for debounce
    add_col('alert_history', 'first_seen_at', 'DATETIME', None)

    # AlertRule table - add notify_whatsapp_native + OLT health fields
    add_col('alert_rules', 'notify_whatsapp_native', 'BOOLEAN', '0')
    add_col('alert_rules', 'check_olt_offline', 'BOOLEAN', '1')
    add_col('alert_rules', 'check_olt_cpu', 'BOOLEAN', '1')
    add_col('alert_rules', 'check_olt_memory', 'BOOLEAN', '1')
    add_col('alert_rules', 'check_olt_temperature', 'BOOLEAN', '1')
    add_col('alert_rules', 'olt_cpu_threshold', 'FLOAT', '80.0')
    add_col('alert_rules', 'olt_memory_threshold', 'FLOAT', '80.0')
    add_col('alert_rules', 'olt_temp_threshold', 'FLOAT', '60.0')

    # Templates table - add config JSON column
    add_col('templates', 'config', 'TEXT', "''")

    # FTTH ODC/ODP - JC (joint closure) as an alternate feed source
    add_col('ftth_odc', 'feed_source', 'VARCHAR(10)', "'otb'")
    add_col('ftth_odc', 'jc_id', 'INTEGER', None)
    add_col('ftth_odc', 'jc_core_number', 'INTEGER', None)
    add_col('ftth_odp', 'feed_source', 'VARCHAR(10)', "'odc'")
    add_col('ftth_odp', 'jc_id', 'INTEGER', None)
    add_col('ftth_odp', 'jc_core_number', 'INTEGER', None)

    # Ensure critical indexes exist (db.create_all only creates indexes for new tables)
    def ensure_index(index_name, table, *columns):
        try:
            existing = {idx['name'] for idx in inspector.get_indexes(table)}
        except Exception:
            existing = set()
        if index_name not in existing:
            cols = ', '.join(columns)
            try:
                with db.engine.connect() as conn:
                    conn.execute(sqla_text(f'CREATE INDEX IF NOT EXISTS {index_name} ON {table} ({cols})'))
                    conn.commit()
                logger.info(f"  Migration: created index {index_name} on {table}({cols})")
            except Exception as e:
                logger.debug(f"  Migration skip index {index_name}: {e}")

    ensure_index('ix_onus_olt_id', 'onus', 'olt_id')
    ensure_index('ix_onus_status', 'onus', 'status')
    ensure_index('ix_onus_serial_number', 'onus', 'serial_number')
    ensure_index('ix_onus_olt_status', 'onus', 'olt_id', 'status')
    ensure_index('ix_olt_sync_status_olt_id', 'olt_sync_status', 'olt_id')
    ensure_index('ix_sync_jobs_olt_id', 'sync_jobs', 'olt_id')
    ensure_index('ix_sync_jobs_created_at', 'sync_jobs', 'created_at')
    ensure_index('ix_notifications_unread', 'notifications', 'is_read', 'resolved')
    ensure_index('ix_alert_history_onu_type', 'alert_history', 'onu_id', 'alert_type')
    ensure_index('ix_action_logs_user_id', 'action_logs', 'user_id')

    # Encrypt plaintext SNMP community strings (S6)
    try:
        from models import encrypt_field
        olts = OLT.query.all()
        migrated = 0
        for olt in olts:
            raw = olt._snmp_community_enc
            # If it's plaintext (not a Fernet token), encrypt it
            if raw and not raw.startswith('gAAAA'):
                olt._snmp_community_enc = encrypt_field(raw)
                migrated += 1
            raw_w = olt._snmp_community_write_enc
            if raw_w and not raw_w.startswith('gAAAA'):
                olt._snmp_community_write_enc = encrypt_field(raw_w)
                migrated += 1
        if migrated:
            db.session.commit()
            logger.info(f"  Migration: encrypted {migrated} SNMP community string(s)")
    except Exception as e:
        logger.debug(f"  Migration skip SNMP encrypt: {e}")


# ==================== SERVE REACT BUILD ====================

@app.route('/')
def serve_spa_root():
    """Serve React SPA index.html at root."""
    from flask import send_from_directory, make_response
    dist = os.path.join(os.path.dirname(__file__), 'frontend', 'dist')
    if not os.path.exists(dist):
        return 'Frontend not built. Run: cd frontend && npm run build', 503
    resp = make_response(send_from_directory(dist, 'index.html'))
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp


@app.route('/<path:path>')
def serve_spa(path=''):
    """Serve React SPA build — catch-all for non-API routes (clean URLs, no /spa/ prefix)."""
    # Don't intercept API or auth routes
    if path.startswith('api/') or path.startswith('auth/'):
        from flask import abort
        abort(404)
    from werkzeug.security import safe_join
    dist = os.path.join(os.path.dirname(__file__), 'frontend', 'dist')
    if not os.path.exists(dist):
        return 'Frontend not built. Run: cd frontend && npm run build', 503
    if path:
        safe_path = safe_join(dist, path)
        if safe_path and os.path.exists(safe_path):
            from flask import send_from_directory, make_response
            resp = make_response(send_from_directory(dist, path))
            if path == 'index.html' or path.endswith('.html'):
                resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
                resp.headers['Pragma'] = 'no-cache'
                resp.headers['Expires'] = '0'
            return resp
    from flask import send_from_directory, make_response
    resp = make_response(send_from_directory(dist, 'index.html'))
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp


# Enable SQLite WAL mode for better write concurrency (C5)
if 'sqlite' in app.config.get('SQLALCHEMY_DATABASE_URI', ''):
    from sqlalchemy import event as sa_event
    with app.app_context():
        @sa_event.listens_for(db.engine, 'connect')
        def _set_sqlite_wal(dbapi_conn, conn_record):
            cursor = dbapi_conn.cursor()
            cursor.execute('PRAGMA journal_mode=WAL')
            cursor.execute('PRAGMA busy_timeout=30000')
            cursor.close()
    logger.info('SQLite WAL mode enabled for write concurrency')

# Ensure schema is migrated and tables exist — ONLY in the server process.
# Cron scripts (auto_sync.py, traffic_poller.py, auto_backup.py) import app.py
# but must NOT run schema init, as concurrent db.create_all() on SQLite WAL
# can cause schema lock conflicts and data loss.
if os.environ.get('NMS_SERVER_PROCESS') == '1' or __name__ == '__main__':
    with app.app_context():
        migrate_schema()
        db.create_all()
        seed_initial_data()


# _get_nms_branding moved to services_wa.py


if __name__ == '__main__':
    with app.app_context():
        migrate_schema()
        db.create_all()
        seed_initial_data()

    # Start alert monitor only in the Werkzeug child process (not the reloader parent)
    # This prevents duplicate alert threads when debug=True
    import os
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        from alerts import run_alert_monitor
        alert_thread = threading.Thread(target=run_alert_monitor, args=(app,), daemon=True)
        alert_thread.start()

    app.run(debug=app.config['DEBUG'], host='0.0.0.0', port=5000)
