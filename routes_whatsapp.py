"""Auto-extracted from app.py monolith split (blueprint: whatsapp).
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

bp = Blueprint('whatsapp', __name__)

def _wa_gateway_url():
    """Get the gateway URL for the WA gateway."""
    return f'http://localhost:{_wa_gateway_port()}'


@bp.route('/api/bot-config/whatsapp-native/status', methods=['GET'])
@login_required
def wa_native_status():
    """Proxy status check to native WA gateway."""
    gw_url = _wa_gateway_url()
    try:
        import urllib.request as _urllib
        url = gw_url.rstrip('/') + '/status'
        req = _urllib.Request(url)
        resp = _urllib.urlopen(req, timeout=5)
        return jsonify(json.loads(resp.read().decode()))
    except Exception as e:
        return jsonify({'connected': False, 'message': f'Gateway offline: {e}'})


@bp.route('/api/bot-config/whatsapp-native/qr', methods=['GET'])
@login_required
def wa_native_qr():
    """Proxy QR code from native WA gateway."""
    gw_url = _wa_gateway_url()
    try:
        import urllib.request as _urllib
        url = gw_url.rstrip('/') + '/qr'
        req = _urllib.Request(url)
        resp = _urllib.urlopen(req, timeout=5)
        return jsonify(json.loads(resp.read().decode()))
    except Exception as e:
        return jsonify({'qr': None, 'message': f'Gateway offline: {e}'})


@bp.route('/api/bot-config/whatsapp-native/test', methods=['POST'])
@permission_required('customization')
def wa_native_test():
    """Send test message via native WA gateway."""
    gw_url = _wa_gateway_url()
    config = BotConfig.query.filter_by(bot_type='whatsapp_native').first()
    if not config or not config.enabled:
        return jsonify({'success': False, 'message': 'WhatsApp Native not configured or disabled'})
    if not config.phone_number:
        return jsonify({'success': False, 'message': 'Phone number required'})
    try:
        import urllib.request as _urllib
        test_msg = '🔔 *FiberNMS Test*\n\nThis is a test notification from FiberNMS via Native WhatsApp Gateway.\nIf you see this, your native WA gateway is working correctly!'
        payload = json.dumps({'phone': config.phone_number, 'message': test_msg}).encode('utf-8')
        url = gw_url.rstrip('/') + '/send'
        req = _urllib.Request(url, data=payload, headers={'Content-Type': 'application/json'})
        resp = _urllib.urlopen(req, timeout=15)
        resp_body = resp.read().decode()
        if resp.status in (200, 201):
            return jsonify({'success': True, 'message': 'Test message sent! Check your WhatsApp.'})
        return jsonify({'success': False, 'message': f'HTTP {resp.status}: {resp_body}'})
    except _urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else str(e)
        logger.error(f"[WA Native] Test error: {e.code} {body}")
        return jsonify({'success': False, 'message': f'Gateway error: {e.code} — {body[:200]}'})
    except Exception as e:
        logger.error(f"[WA Native] Test exception: {e}")
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/bot-config/whatsapp-native/logout', methods=['POST'])
@permission_required('customization')
def wa_native_logout():
    """Logout and clear WA session."""
    gw_url = _wa_gateway_url()
    try:
        import urllib.request as _urllib
        url = gw_url.rstrip('/') + '/logout'
        req = _urllib.Request(url, data=b'{}', headers={'Content-Type': 'application/json'}, method='POST')
        resp = _urllib.urlopen(req, timeout=10)
        return jsonify({'success': True, 'message': 'Logged out. New QR will be generated.'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/bot-config/whatsapp-native/reconnect', methods=['POST'])
@permission_required('customization')
def wa_native_reconnect():
    """Force reconnect WA gateway."""
    gw_url = _wa_gateway_url()
    try:
        import urllib.request as _urllib
        url = gw_url.rstrip('/') + '/reconnect'
        req = _urllib.Request(url, data=b'{}', headers={'Content-Type': 'application/json'}, method='POST')
        resp = _urllib.urlopen(req, timeout=10)
        return jsonify({'success': True, 'message': 'Reconnecting...'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


def _wa_gateway_port():
    """WA gateway port — single instance on 3000."""
    return 3000


PM2_BIN = '/usr/bin/pm2'


def _wa_gateway_name():
    """PM2 process name for the WA gateway."""
    return 'wa-gateway-admin'


def _wa_auth_dir():
    """Auth state directory for the WA gateway."""
    return '/opt/fibernms/wa_gateway/auth_state_admin'


@bp.route('/api/bot-config/whatsapp-native/gateway', methods=['GET'])
@login_required
def wa_native_gateway_info():
    """Get gateway port, PM2 status, and assigned URL."""
    port = _wa_gateway_port()
    name = _wa_gateway_name()
    auth_dir = _wa_auth_dir()
    try:
        import subprocess
        result = subprocess.run([PM2_BIN, 'jlist'], capture_output=True, text=True, timeout=5)
        processes = json.loads(result.stdout) if result.stdout else []
        proc = next((p for p in processes if p.get('name') == name), None)
        pm2_status = proc.get('pm2_env', {}).get('status', 'stopped') if proc else 'not_found'
        pid = proc.get('pid') if proc else None
    except Exception:
        pm2_status = 'unknown'
        pid = None
    return jsonify({
        'port': port,
        'pm2_name': name,
        'auth_dir': auth_dir,
        'api_url': f'http://localhost:{port}',
        'pm2_status': pm2_status,
        'pid': pid,
    })


@bp.route('/api/bot-config/whatsapp-native/start', methods=['POST'])
@permission_required('customization')
def wa_native_start():
    """Start WA gateway instance via PM2."""
    port = _wa_gateway_port()
    name = _wa_gateway_name()
    auth_dir = _wa_auth_dir()
    try:
        import subprocess
        import os
        import traceback
        os.makedirs(auth_dir, exist_ok=True)
        env = os.environ.copy()
        env['WA_GATEWAY_PORT'] = str(port)
        env['WA_AUTH_DIR'] = auth_dir
        env['PATH'] = '/usr/local/bin:/usr/bin:/bin:' + env.get('PATH', '')
        # Try restart first (works if process exists)
        restart = subprocess.run([PM2_BIN, 'restart', name, '--update-env'],
            capture_output=True, text=True, timeout=10, env=env)
        if restart.returncode != 0:
            # Process doesn't exist yet — start it
            start = subprocess.run(
                [PM2_BIN, 'start', '/opt/fibernms/wa_gateway/index.js',
                 '--name', name, '--update-env'],
                capture_output=True, text=True, timeout=15, env=env,
                cwd='/opt/fibernms/wa_gateway'
            )
            if start.returncode != 0:
                err = start.stderr or start.stdout or 'Failed to start'
                logger.error(f"[WA Native] Start PM2 error: {err}")
                return jsonify({'success': False, 'message': err}), 500
        subprocess.run([PM2_BIN, 'save'], capture_output=True, text=True, timeout=5, env=env)
        return jsonify({'success': True, 'message': f'Gateway started on port {port}', 'port': port})
    except Exception as e:
        logger.error(f"[WA Native] Start error: {e}\n{traceback.format_exc()}")
        return jsonify({'success': False, 'message': str(e)}), 500


@bp.route('/api/bot-config/whatsapp-native/stop', methods=['POST'])
@permission_required('customization')
def wa_native_stop():
    """Stop WA gateway instance via PM2."""
    name = _wa_gateway_name()
    try:
        import subprocess
        result = subprocess.run([PM2_BIN, 'stop', name], capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            return jsonify({'success': False, 'message': result.stderr or 'Process not found'}), 500
        subprocess.run([PM2_BIN, 'save'], capture_output=True, text=True, timeout=5)
        return jsonify({'success': True, 'message': 'Gateway stopped'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
