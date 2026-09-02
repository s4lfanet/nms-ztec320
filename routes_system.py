"""Auto-extracted from app.py monolith split (blueprint: system).
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

bp = Blueprint('system', __name__)

@bp.route('/api/customization/columns')
@login_required
def api_customization_columns():
    q = ONUCustomColumn.query
    columns = q.order_by(ONUCustomColumn.sort_order).all()
    if not columns:
        defaults = [
            ('OLT', 'olt_name'), ('Name', 'name'), ('Description', 'description'),
            ('PPPoE', 'pppoe'), ('ONU ID', 'onu_id_str'), ('Status', 'status'),
            ('RX OLT', 'rx_power'), ('RX ONU', 'onu_rx_power'), ('SN / MAC', 'serial_number'),
            ('Actual Type', 'actual_type'),
        ]
        for i, (name, key) in enumerate(defaults):
            col = ONUCustomColumn(column_name=name, column_key=key, sort_order=i,
                                  visible_desktop=True, visible_mobile=(i < 4))
            db.session.add(col)
        db.session.commit()
        columns = q.order_by(ONUCustomColumn.sort_order).all()
    return jsonify({
        'columns': [{
            'id': str(c.id), 'column_name': c.column_name, 'column_key': c.column_key,
            'visible_desktop': c.visible_desktop, 'visible_mobile': c.visible_mobile,
            'sort_order': c.sort_order,
        } for c in columns]
    })


@bp.route('/api/action-logs')
@permission_required('manage_users')
def api_action_logs():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    category = request.args.get('category', '').strip()
    search = request.args.get('search', '').strip()
    user_filter = request.args.get('username', '').strip()

    q = ActionLog.query
    if category:
        q = q.filter(ActionLog.category == category)
    if user_filter:
        q = q.filter(ActionLog.username.ilike(f'%{user_filter}%'))
    if search:
        like = f'%{search}%'
        q = q.filter(
            db.or_(
                ActionLog.action.ilike(like),
                ActionLog.target.ilike(like),
                ActionLog.detail.ilike(like),
                ActionLog.username.ilike(like),
            )
        )
    total = q.count()
    logs = q.order_by(ActionLog.id.desc()).offset((page - 1) * per_page).limit(per_page).all()

    categories = [r[0] for r in db.session.query(ActionLog.category).distinct().all() if r[0]]

    return jsonify({
        'logs': [{
            'id': l.id,
            'username': l.username,
            'action': l.action,
            'category': l.category,
            'target': l.target,
            'detail': l.detail,
            'ip_address': l.ip_address,
            'created_at': utc_iso(l.created_at),
        } for l in logs],
        'total': total,
        'page': page,
        'per_page': per_page,
        'pages': (total + per_page - 1) // per_page,
        'categories': sorted(categories),
    })


@bp.route('/api/customization/reset', methods=['POST'])
@permission_required('customization')
def reset_customization_columns():
    ONUCustomColumn.query.delete()
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
    log_action('customization_reset', 'general', target='columns', detail='Reset to default columns')
    return jsonify({'success': True})


@bp.route('/api/customization/column', methods=['POST'])
@permission_required('customization')
def save_custom_columns():
    data = request.get_json()
    columns = data.get('columns', [])
    ONUCustomColumn.query.delete()
    for i, col in enumerate(columns):
        c = ONUCustomColumn(
            column_name=col['name'], column_key=col['key'],
            visible_desktop=col.get('desktop', True),
            visible_mobile=col.get('mobile', False), sort_order=i
        )
        db.session.add(c)
    db.session.commit()
    log_action('customization_save', 'general', target='columns', detail=f'Saved {len(columns)} custom columns')
    return jsonify({'success': True})


@bp.route('/api/customization/signal-filter', methods=['GET'])
@login_required
def api_get_signal_filter():
    """Get signal filter thresholds."""
    rule = AlertRule.query.first()
    if not rule:
        return jsonify({'critical_threshold': -28.0, 'good_threshold': -26.0})
    # rx_threshold is the critical level; good_threshold is rx_threshold + rx_change_threshold
    critical = rule.rx_threshold
    good = rule.rx_threshold + rule.rx_change_threshold
    return jsonify({'critical_threshold': critical, 'good_threshold': good})


@bp.route('/api/customization/signal-filter', methods=['POST'])
@permission_required('customization')
def api_save_signal_filter():
    """Save signal filter thresholds."""
    data = request.get_json() or {}
    critical = float(data.get('critical_threshold', -28.0))
    good = float(data.get('good_threshold', -26.0))
    # Validate: critical must be less than good, both in valid range
    if critical >= good:
        return jsonify({'success': False, 'message': 'Critical threshold must be less than Good threshold'}), 400
    if critical < -40 or good > -10:
        return jsonify({'success': False, 'message': 'Thresholds must be between -40 and -10 dBm'}), 400

    rule = AlertRule.query.first()
    if not rule:
        rule = AlertRule(name='Default Alert Rule', enabled=True,
                         check_offline=True, check_dyinggasp=True, check_los=True, check_rx_power=True,
                         notify_bell=True)
        db.session.add(rule)
    rule.rx_threshold = critical
    rule.rx_change_threshold = round(good - critical, 1)
    db.session.commit()
    log_action('customization_save', 'general', target='signal-filter', detail=f'Critical={critical} Good={good}')
    return jsonify({'success': True})


@bp.route('/api/customization/rx-colors', methods=['GET'])
@login_required
def api_get_rx_colors():
    """Get RX power color ranges."""
    import json as _json
    cfg = SystemConfig.query.filter_by(key='rx_color_ranges').first()
    if cfg and cfg.value:
        try:
            return jsonify({'ranges': _json.loads(cfg.value)})
        except Exception:
            pass
    # Default ranges
    return jsonify({'ranges': [
        {'min': -25, 'max': 0, 'color': 'green', 'label': 'Good'},
        {'min': -28, 'max': -25, 'color': 'yellow', 'label': 'Warning'},
        {'min': -99, 'max': -28, 'color': 'red', 'label': 'Critical'},
    ]})


@bp.route('/api/customization/rx-colors', methods=['POST'])
@permission_required('customization')
def api_save_rx_colors():
    """Save RX power color ranges."""
    import json as _json
    data = request.get_json() or {}
    ranges = data.get('ranges', [])
    if not isinstance(ranges, list) or len(ranges) == 0:
        return jsonify({'success': False, 'message': 'At least one range required'}), 400
    # Validate
    for r in ranges:
        if 'min' not in r or 'max' not in r or 'color' not in r:
            return jsonify({'success': False, 'message': 'Each range needs min, max, and color'}), 400
    cfg = SystemConfig.query.filter_by(key='rx_color_ranges').first()
    if cfg:
        cfg.value = _json.dumps(ranges)
    else:
        db.session.add(SystemConfig(key='rx_color_ranges', value=_json.dumps(ranges)))
    db.session.commit()
    log_action('customization_save', 'general', target='rx-colors', detail=f'Saved {len(ranges)} color ranges')
    return jsonify({'success': True})


_VPS_PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/snap/bin:' + os.environ.get('PATH', '')


def _run_cmd(cmd, cwd=None, timeout=30):
    """Run a command with extended PATH (for systemd context)."""
    import subprocess as _sp, pwd
    env = os.environ.copy()
    env['PATH'] = _VPS_PATH
    # Use the actual user's home directory (systemd service may run as non-root)
    try:
        env['HOME'] = pwd.getpwuid(os.getuid()).pw_dir
    except Exception:
        env['HOME'] = env.get('HOME', '/root')
    return _sp.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)


@bp.route('/api/system/update/check', methods=['GET'])
@super_admin_required
def system_update_check():
    """Check if a newer version is available on GitHub.
    Runs git fetch + compares local vs remote HEAD."""
    app_dir = os.path.dirname(os.path.abspath(__file__))
    try:
        # git fetch origin
        fetch = _run_cmd(['git', 'fetch', 'origin', 'main'], cwd=app_dir, timeout=30)
        if fetch.returncode != 0:
            return jsonify({'success': False, 'message': f'Git fetch failed: {fetch.stderr[:200]}'})
        # Get local HEAD
        local = _run_cmd(['git', 'rev-parse', 'HEAD'], cwd=app_dir, timeout=10)
        local_sha = local.stdout.strip()
        # Get remote HEAD
        remote = _run_cmd(['git', 'rev-parse', 'origin/main'], cwd=app_dir, timeout=10)
        remote_sha = remote.stdout.strip()
        # Get short log of incoming commits
        if local_sha != remote_sha:
            log = _run_cmd(['git', 'log', '--oneline', f'{local_sha}..{remote_sha}'], cwd=app_dir, timeout=10)
            commits = [l for l in log.stdout.strip().split('\n') if l]
        else:
            commits = []
        # Get current branch
        branch = _run_cmd(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], cwd=app_dir, timeout=10)
        current_branch = branch.stdout.strip()
        return jsonify({
            'success': True,
            'up_to_date': local_sha == remote_sha,
            'local_sha': local_sha[:8],
            'remote_sha': remote_sha[:8],
            'branch': current_branch,
            'commits': commits[:20],
        })
    except Exception as e:
        type_name = type(e).__name__
        return jsonify({'success': False, 'message': f'Check failed: {type_name}: {str(e)[:200]}'})


@bp.route('/api/system/update/apply', methods=['POST'])
@super_admin_required
def system_update_apply():
    """Apply update from GitHub: git pull, (re)build frontend if needed, restart service."""
    app_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(app_dir, 'frontend')
    try:
        # Step 1: git pull
        pull = _run_cmd(['git', 'pull', 'origin', 'main'], cwd=app_dir, timeout=60)
        if pull.returncode != 0:
            return jsonify({'success': False, 'message': f'Git pull failed: {pull.stderr[:300]}'})
        pull_output = pull.stdout.strip()

        # Check if anything changed
        if 'Already up to date' in pull_output or 'Already up-to-date' in pull_output:
            return jsonify({'success': True, 'message': 'Already up to date. No changes needed.', 'restarted': False})

        # Step 2: frontend/dist/ is committed to the repo, so `git pull` above
        # already brought in the current pre-built frontend — no need to
        # reinstall/rebuild with pnpm (which also risks corepack's
        # interactive download prompt hanging this request the first time
        # pnpm is used). Only fall back to building if dist is somehow
        # missing (e.g. a very old checkout, or dist was deleted locally).
        frontend_step = 'skipped (using pre-built frontend/dist/ from git pull)'
        if not os.path.isfile(os.path.join(frontend_dir, 'dist', 'index.html')):
            import subprocess as _sp
            env = os.environ.copy()
            env['PATH'] = _VPS_PATH
            env['COREPACK_ENABLE_DOWNLOAD_PROMPT'] = '0'
            try:
                install = _sp.run(['pnpm', 'install', '--no-frozen-lockfile'], cwd=frontend_dir,
                                   capture_output=True, text=True, timeout=120, env=env)
            except _sp.TimeoutExpired:
                return jsonify({'success': False, 'message': 'pnpm install timed out after 120s'})
            if install.returncode != 0:
                return jsonify({'success': False, 'message': f'pnpm install failed: {install.stderr[:300]}'})

            try:
                build = _sp.run(['pnpm', 'build'], cwd=frontend_dir,
                                 capture_output=True, text=True, timeout=120, env=env)
            except _sp.TimeoutExpired:
                return jsonify({'success': False, 'message': 'Frontend build timed out after 120s'})
            if build.returncode != 0:
                return jsonify({'success': False, 'message': f'Frontend build failed: {build.stderr[:300]}'})
            frontend_step = 'built with pnpm (dist/ was missing)'

        # Step 3: Restart service (systemd). The app runs as a non-root user
        # (salfanet), which can't restart its own systemd unit directly —
        # install-vps.sh grants it a narrowly-scoped NOPASSWD sudo rule for
        # exactly this one command.
        #
        # A plain `systemctl restart` here would be a *child of the very
        # service being restarted* — systemd tears down that whole process
        # tree as part of the restart, so this handler can get killed
        # mid-flight before it reads the subprocess's exit code, reporting
        # a false "restart failed" even though the restart genuinely
        # succeeded (confirmed by testing: journalctl showed the new
        # process started right on time despite the API returning an
        # error). `systemd-run --no-block` runs the restart in its own
        # separate transient scope, detached from this process tree, and
        # returns immediately once the restart is queued rather than
        # waiting for it — avoiding the race entirely.
        restart = _run_cmd([
            'sudo', '-n', '/usr/bin/systemd-run', '--no-block', '--unit=salfanet-nms-restart',
            '--', '/usr/bin/systemctl', 'restart', 'salfanet-nms',
        ], timeout=30)
        if restart.returncode != 0:
            return jsonify({'success': True, 'message': f'Update applied but service restart failed: {restart.stderr[:200]}. Please restart manually.', 'restarted': False})

        log_action('system_update', 'system', detail=f'Git pull + service restart (frontend: {frontend_step}). Pull: {pull_output[:100]}')
        return jsonify({
            'success': True,
            'message': 'Update applied successfully. Service restarted.',
            'restarted': True,
            'pull_output': pull_output[:500],
        })
    except Exception as e:
        type_name = type(e).__name__
        return jsonify({'success': False, 'message': f'Update failed: {type_name}: {str(e)[:200]}'})


@bp.route('/api/system-config', methods=['GET'])
@login_required
def get_system_config():
    """Get system configuration (timezone, alert interval, etc)."""
    _SENSITIVE_KEYS = {'bot_token', 'wa_api_key'}
    is_admin = current_user.is_super_admin
    configs = SystemConfig.query.all()
    result = {}
    for c in configs:
        if c.key in _SENSITIVE_KEYS and not is_admin:
            result[c.key] = '***' if c.value else ''
        else:
            result[c.key] = c.value
    # Defaults
    if 'timezone' not in result:
        result['timezone'] = 'Asia/Jakarta'
    if 'alert_check_interval' not in result:
        result['alert_check_interval'] = '60'
    if 'nms_name' not in result:
        result['nms_name'] = 'Salfanet NMS'
    if 'base_url' not in result:
        result['base_url'] = 'https://salfanet.id'
    if 'admin_service_phone' not in result:
        result['admin_service_phone'] = '6285121111220'
    return jsonify({'success': True, 'config': result})


@bp.route('/api/system-config', methods=['PUT'])
@login_required
def update_system_config():
    """Update system configuration. Super admin can update all keys.
    Non-super-admin can only update alert_check_interval and timezone."""
    data = request.get_json() or {}
    allowed_keys = {'alert_check_interval', 'timezone'}
    if not current_user.is_super_admin:
        for key in data:
            if key not in allowed_keys:
                return jsonify({'success': False, 'message': f'Permission denied: only super admin can update {key}'}), 403
    for key, value in data.items():
        config = SystemConfig.query.filter_by(key=key).first()
        if config:
            config.value = str(value)
        else:
            db.session.add(SystemConfig(key=key, value=str(value)))
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/system/backup-db', methods=['POST'])
@super_admin_required
def backup_database():
    """Create a database backup and optionally upload to remote storage.

    For SQLite: uses sqlite3.backup() API (safe online backup).
    For PostgreSQL: uses pg_dump if available, else copies via SQL.

    The backup is kept locally in instance/backups/ (same location the
    hourly db_backup.py cron writes to — pruned by the same retention
    policy) so a backup exists even when remote upload isn't configured.

    Optional env vars for remote upload:
    - BACKUP_REMOTE_SCP_TARGET: e.g. "user@backup-server:/path/to/backups/"
    - BACKUP_REMOTE_SCP_KEY: SSH key path (default: ~/.ssh/id_rsa)
    """
    import subprocess
    from flask import current_app
    from db_backup import create_db_backup, prune_old_db_backups

    # Prefer the actual live engine URL over app.config — they can diverge
    # (e.g. test fixtures that swap db.engines[None] to a temp file without
    # updating app.config['SQLALCHEMY_DATABASE_URI'], which stays pinned to
    # TestingConfig's "sqlite:///:memory:"), matching restore_database()'s
    # existing fallback below.
    try:
        db_uri = str(db.engine.url)
    except Exception:
        db_uri = current_app.config.get('SQLALCHEMY_DATABASE_URI', '')
    ok, backup_path, err = create_db_backup(db_uri)
    if not ok:
        return jsonify({'success': False, 'message': err}), 500
    backup_filename = os.path.basename(backup_path)
    backup_size = os.path.getsize(backup_path)

    # Optional remote upload via SCP (in addition to the local copy above)
    # Uses known_hosts verification (no StrictHostKeyChecking=no).
    # Admin must pre-populate known_hosts via: ssh-keyscan -H <backup-host> >> ~/.ssh/known_hosts
    remote_target = os.environ.get('BACKUP_REMOTE_SCP_TARGET', '')
    scp_key = os.environ.get('BACKUP_REMOTE_SCP_KEY', os.path.expanduser('~/.ssh/id_rsa'))
    remote_uploaded = False
    remote_error = ''
    if remote_target:
        scp_cmd = ['scp', '-i', scp_key,
                   '-o', 'BatchMode=yes',
                   '-o', 'ConnectTimeout=30',
                   backup_path, remote_target]
        try:
            result = subprocess.run(scp_cmd, capture_output=True, timeout=120)
            if result.returncode == 0:
                remote_uploaded = True
            else:
                remote_error = result.stderr.decode()[:300]
        except Exception as e:
            remote_error = str(e)[:300]

    try:
        prune_old_db_backups(os.path.dirname(backup_path))
    except Exception:
        pass

    log_action('backup_database', 'system', detail=f'DB backup {backup_filename} ({backup_size} bytes)')
    return jsonify({
        'success': True,
        'filename': backup_filename,
        'size_bytes': backup_size,
        'integrity_check': 'ok',
        'remote_uploaded': remote_uploaded,
        'remote_error': remote_error,
    })


@bp.route('/api/system/restore-db', methods=['POST'])
@super_admin_required
def restore_database():
    """Restore database from an uploaded backup file.

    Accepts a .db file (SQLite) uploaded via multipart form data.
    The current database is backed up before restore (safety net).
    Only works for SQLite databases.
    """
    import tempfile

    # Always use the actual engine URL (handles test fixtures that replace
    # db.engines[None] but don't update app.config)
    try:
        db_uri = str(db.engine.url)
    except Exception:
        from flask import current_app
        db_uri = current_app.config.get('SQLALCHEMY_DATABASE_URI', '')
    if 'sqlite' not in db_uri:
        return jsonify({'success': False, 'message': 'Restore only supported for SQLite databases'}), 400

    if 'backup_file' not in request.files:
        return jsonify({'success': False, 'message': 'No backup file uploaded'}), 400

    upload = request.files['backup_file']
    if not upload.filename:
        return jsonify({'success': False, 'message': 'Empty filename'}), 400

    # Save uploaded file to temp with restrictive permissions
    tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False, dir=tempfile.gettempdir())
    upload_path = tmp.name
    tmp.close()
    os.chmod(upload_path, 0o600)
    upload.save(upload_path)

    try:
        import sqlite3

        # Verify uploaded backup integrity
        chk = sqlite3.connect(upload_path)
        result = chk.execute('PRAGMA integrity_check').fetchone()
        if result[0] != 'ok':
            chk.close()
            os.remove(upload_path)
            return jsonify({'success': False, 'message': f'Uploaded file integrity check failed: {result[0]}'}), 400

        # Schema compatibility check: backup must have all tables in current DB
        db_path = db_uri.replace('sqlite:///', '')
        if db_path == ':memory:' or not os.path.exists(db_path):
            os.remove(upload_path)
            return jsonify({'success': False, 'message': 'Cannot resolve database file path for restore'}), 500
        cur = chk.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        backup_tables = {row[0] for row in cur.fetchall()}
        chk.close()

        cur_db = sqlite3.connect(db_path)
        cur = cur_db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        current_tables = {row[0] for row in cur.fetchall()}
        cur_db.close()

        missing_tables = current_tables - backup_tables
        if missing_tables:
            os.remove(upload_path)
            return jsonify({
                'success': False,
                'message': f'Schema mismatch: backup is missing tables: {sorted(missing_tables)[:10]}'
            }), 400

        # Safety: backup current DB before overwrite
        pre_restore_backup = db_path + f'.pre_restore_{datetime.now().strftime("%Y%m%d_%H%M%S")}'
        src = sqlite3.connect(db_path)
        safety = sqlite3.connect(pre_restore_backup)
        src.backup(safety)
        safety.close()
        src.close()
        os.chmod(pre_restore_backup, 0o600)

        # Close SQLAlchemy connections before overwriting
        db.session.remove()
        db.engine.dispose()

        # Overwrite DB file
        shutil.copy2(upload_path, db_path)

        # Post-restore verification: check the restored DB
        post_chk = sqlite3.connect(db_path)
        post_result = post_chk.execute('PRAGMA integrity_check').fetchone()
        post_chk.close()

        if post_result[0] != 'ok':
            # Auto-rollback: restore the pre-restore backup
            try:
                shutil.copy2(pre_restore_backup, db_path)
                log_action('restore_database', 'system',
                           detail=f'Restore FAILED verification, rolled back to {os.path.basename(pre_restore_backup)}')
                return jsonify({
                    'success': False,
                    'message': f'Restored DB failed integrity check, auto-rolled back to pre-restore backup',
                    'rolled_back': True,
                    'pre_restore_backup': os.path.basename(pre_restore_backup),
                }), 500
            except Exception as rollback_err:
                return jsonify({
                    'success': False,
                    'message': f'Restore failed verification AND rollback failed: {rollback_err}. Pre-restore backup at: {os.path.basename(pre_restore_backup)}',
                    'rolled_back': False,
                    'pre_restore_backup': os.path.basename(pre_restore_backup),
                }), 500

        log_action('restore_database', 'system',
                   detail=f'Restored from {upload.filename}, pre-restore backup: {os.path.basename(pre_restore_backup)}')

        return jsonify({
            'success': True,
            'message': f'Database restored from {upload.filename}',
            'pre_restore_backup': os.path.basename(pre_restore_backup),
            'integrity_check': 'ok',
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'Restore failed: {e}'}), 500
    finally:
        try:
            os.remove(upload_path)
        except Exception:
            pass


@bp.route('/api/ws-token', methods=['GET'])
@login_required
def ws_token():
    """Return ephemeral HMAC-signed WebSocket auth token for authenticated users.

    Token format: {user_id}.{expiry}.{hmac_signature}
    The WebSocket server verifies the signature and expiry — no SECRET_KEY exposed.
    """
    secret = os.environ.get('INTERNAL_API_KEY', '')
    if not secret:
        _is_production = os.environ.get('FLASK_ENV', 'development') == 'production'
        if _is_production:
            raise RuntimeError(
                "INTERNAL_API_KEY must be explicitly configured in production. "
                "Set it in your .env file or environment variables."
            )
        logger.warning('INTERNAL_API_KEY not set — using ephemeral key for development')
        import secrets as _secrets
        secret = _secrets.token_hex(32)
    expiry = int(time.time()) + 60  # 60-second TTL
    payload = f"{current_user.id}.{expiry}"
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    token = f"{payload}.{sig}"
    return jsonify({'token': token})
