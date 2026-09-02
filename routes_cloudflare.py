"""Auto-extracted from app.py monolith split (blueprint: cloudflare).
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

bp = Blueprint('cloudflare', __name__)

def _cf_config(key=None, value=None):
    """Get or set Cloudflare config in SystemConfig."""
    if key is None:
        configs = SystemConfig.query.filter(SystemConfig.key.like('cf_%')).all()
        return {c.key: c.value for c in configs}
    cfg = SystemConfig.query.filter_by(key=f'cf_{key}').first()
    if value is not None:
        if cfg:
            cfg.value = value
        else:
            cfg = SystemConfig(key=f'cf_{key}', value=value)
            db.session.add(cfg)
        db.session.commit()
    return cfg.value if cfg else ''


@bp.route('/api/cloudflare/status', methods=['GET'])
@super_admin_required
def cf_status():
    """Check cloudflared installation and tunnel status."""
    import subprocess as sp
    result = {'installed': False, 'version': '', 'tunnel_running': False,
              'tunnel_id': '', 'tunnel_name': '', 'domain': '', 'configured': False}
    # Check if cloudflared is installed
    try:
        ver = sp.run(['/usr/local/bin/cloudflared', 'version'], capture_output=True, text=True, timeout=5)
        if ver.returncode != 0:
            ver = sp.run(['/usr/bin/cloudflared', 'version'], capture_output=True, text=True, timeout=5)
        if ver.returncode == 0:
            result['installed'] = True
            result['version'] = ver.stdout.strip().split('\n')[0]
    except (FileNotFoundError, sp.TimeoutExpired):
        pass
    # Check if tunnel service is running
    try:
        svc = sp.run(['/bin/bash', '-c', '/usr/bin/sudo systemctl is-active cloudflared'], capture_output=True, text=True, timeout=5)
        result['tunnel_running'] = svc.stdout.strip() == 'active'
    except (FileNotFoundError, sp.TimeoutExpired):
        pass
    # Get config from DB
    result['tunnel_id'] = _cf_config('tunnel_id')
    result['tunnel_name'] = _cf_config('tunnel_name')
    result['domain'] = _cf_config('domain')
    result['configured'] = bool(result['tunnel_id'] and result['domain'])
    return jsonify({'success': True, **result})


@bp.route('/api/cloudflare/install', methods=['POST'])
@super_admin_required
def cf_install():
    """Install cloudflared on the VPS."""
    import subprocess as sp
    import os
    try:
        # Check if already installed
        cf_path = None
        for p in ['/usr/local/bin/cloudflared', '/usr/bin/cloudflared']:
            if os.path.isfile(p) and os.access(p, os.X_OK):
                cf_path = p
                break
        if cf_path:
            ver = sp.run([cf_path, 'version'], capture_output=True, text=True, timeout=5)
            return jsonify({'success': True, 'message': 'cloudflared already installed',
                            'version': ver.stdout.strip().split('\n')[0] if ver.returncode == 0 else ''})
        # Download and install
        result = sp.run(['/bin/bash', '-c',
                'curl -L --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && '
                '/usr/bin/sudo dpkg -i /tmp/cloudflared.deb && rm -f /tmp/cloudflared.deb'],
               capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            logger.error(f'cloudflared install failed: rc={result.returncode} stderr={result.stderr[:300]}')
            return jsonify({'success': False, 'message': f'Install failed: {result.stderr[:200] or result.stdout[:200]}'}), 500
        ver = sp.run(['/usr/bin/cloudflared', 'version'], capture_output=True, text=True, timeout=5)
        if ver.returncode == 0:
            return jsonify({'success': True, 'message': 'cloudflared installed successfully',
                            'version': ver.stdout.strip().split('\n')[0]})
        return jsonify({'success': False, 'message': 'Installation completed but version check failed'})
    except sp.TimeoutExpired:
        logger.error('cloudflared install timed out (120s)')
        return jsonify({'success': False, 'message': 'Install timed out — download took too long. Try again.'}), 500
    except Exception as e:
        logger.error(f'cloudflared install error: {e}')
        return jsonify({'success': False, 'message': f'Install failed: {str(e)[:200]}'}), 500


@bp.route('/api/cloudflare/configure', methods=['POST'])
@super_admin_required
def cf_configure():
    """Configure Cloudflare Tunnel with token from Zero Trust dashboard."""
    data = request.get_json()
    tunnel_token = (data or {}).get('tunnel_token', '').strip()
    domain = (data or {}).get('domain', '').strip()
    tunnel_name = (data or {}).get('tunnel_name', 'salfanet-nms').strip() or 'salfanet-nms'
    if not tunnel_token:
        return jsonify({'success': False, 'message': 'Tunnel token is required'}), 400
    if not domain:
        return jsonify({'success': False, 'message': 'Domain is required'}), 400
    import subprocess as sp
    # Save config to DB
    _cf_config('tunnel_token', tunnel_token)
    _cf_config('domain', domain)
    _cf_config('tunnel_name', tunnel_name)
    # Create systemd service for cloudflared tunnel
    service_content = f"""[Unit]
Description=Cloudflare Tunnel for Salfanet NMS
After=network.target

[Service]
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate run --token {tunnel_token}
Restart=on-failure
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
"""
    try:
        # Write service file to temp (Flask runs as non-root), then sudo mv
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.service', delete=False, dir='/tmp') as tf:
            tf.write(service_content)
            tmp_path = tf.name
        sp.run(['/bin/bash', '-c', f'/usr/bin/sudo mv {tmp_path} /etc/systemd/system/cloudflared.service && /usr/bin/sudo chmod 644 /etc/systemd/system/cloudflared.service'], capture_output=True, text=True, timeout=10)
        sp.run(['/bin/bash', '-c', '/usr/bin/sudo systemctl daemon-reload'], capture_output=True, text=True, timeout=10)
        enable_r = sp.run(['/bin/bash', '-c', '/usr/bin/sudo systemctl enable cloudflared'], capture_output=True, text=True, timeout=10)
        start_r = sp.run(['/bin/bash', '-c', '/usr/bin/sudo systemctl start cloudflared'], capture_output=True, text=True, timeout=15)
        if start_r.returncode != 0:
            logger.error(f'cloudflared start failed: {start_r.stderr[:300]}')
            return jsonify({'success': False, 'message': f'Tunnel service failed to start: {start_r.stderr[:200]}'}), 500
        log_action('cf_tunnel_configure', 'system', detail=f'Tunnel configured for domain {domain}')
        return jsonify({'success': True, 'message': f'Tunnel configured and started for {domain}',
                        'domain': domain, 'tunnel_name': tunnel_name})
    except Exception as e:
        logger.error(f'cf_configure error: {e}')
        return jsonify({'success': False, 'message': f'Configuration failed: {str(e)[:200]}'}), 500


@bp.route('/api/cloudflare/start', methods=['POST'])
@super_admin_required
def cf_start():
    """Start cloudflared tunnel service."""
    import subprocess as sp
    try:
        sp.run(['/bin/bash', '-c', '/usr/bin/sudo systemctl start cloudflared'], capture_output=True, text=True, timeout=15)
        log_action('cf_tunnel_start', 'system')
        return jsonify({'success': True, 'message': 'Tunnel started'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)[:200]}), 500


@bp.route('/api/cloudflare/stop', methods=['POST'])
@super_admin_required
def cf_stop():
    """Stop cloudflared tunnel service."""
    import subprocess as sp
    try:
        sp.run(['/bin/bash', '-c', '/usr/bin/sudo systemctl stop cloudflared'], capture_output=True, text=True, timeout=15)
        log_action('cf_tunnel_stop', 'system')
        return jsonify({'success': True, 'message': 'Tunnel stopped'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)[:200]}), 500


@bp.route('/api/cloudflare/logs', methods=['GET'])
@super_admin_required
def cf_logs():
    """Get recent cloudflared logs."""
    import subprocess as sp
    try:
        logs = sp.run(['/bin/bash', '-c', '/usr/bin/sudo journalctl -u cloudflared --no-pager -n 50'],
                      capture_output=True, text=True, timeout=10)
        return jsonify({'success': True, 'logs': logs.stdout})
    except Exception as e:
        return jsonify({'success': False, 'logs': '', 'message': str(e)[:200]})
