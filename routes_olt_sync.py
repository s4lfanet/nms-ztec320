"""Auto-extracted from app.py monolith split (blueprint: olt_sync).
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

bp = Blueprint('olt_sync', __name__)

@bp.route('/api/olt/<int:olt_id>/sync-logs', methods=['GET'])
@login_required
def olt_sync_logs(olt_id):
    """Fetch NMS sync logs from /var/log/salfanet-sync.log."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})
    lines_limit = min(int(request.args.get('lines', 200)), 2000)
    try:
        import os
        log_path = os.environ.get('SYNC_LOG_PATH', '/var/log/salfanet-sync.log')
        if not os.path.exists(log_path):
            return jsonify({'success': True, 'lines': [], 'total_lines': 0, 'message': f'Log file not found: {log_path}'})
        with open(log_path, 'r', errors='replace') as f:
            all_lines = f.readlines()
        # Filter lines related to this OLT (by name or IP)
        olt_name = olt.name or ''
        olt_ip = olt.ip_address or ''
        olt_lines = [l.rstrip('\n') for l in all_lines if olt_name in l or olt_ip in l or 'Auto-sync' in l or 'Starting parallel' in l]
        result_lines = olt_lines[-lines_limit:] if len(olt_lines) > lines_limit else olt_lines
        return jsonify({
            'success': True,
            'total_lines': len(olt_lines),
            'lines': result_lines,
        })
    except Exception as e:
        logger.error(f"sync-logs OLT {olt_id} failed: {e}")
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/olt/<int:olt_id>/sync', methods=['POST'])
@permission_required('settings_ip_olts')
def sync_olt(olt_id):
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})
    from sync_lock import is_sync_locked
    if is_sync_locked(olt.id):
        return jsonify({'success': False, 'message': 'Sync already in progress for this OLT'}), 409
    from flask import current_app
    start_single_sync(current_app._get_current_object(), olt.id)
    log_action('olt_sync', 'olt', target=olt.name, detail='Manual sync triggered')
    return jsonify({'success': True, 'message': 'Synchronization started'})


@bp.route('/api/olt/sync-all', methods=['POST'])
@permission_required('settings_ip_olts')
def sync_all_olts():
    """Sync all OLTs sequentially in a background thread."""
    olts = OLT.query.all()
    if not olts:
        return jsonify({'success': False, 'message': 'No OLTs found'})

    olt_ids = [olt.id for olt in olts if olt.snmp_enabled or olt.cli_username]
    if not olt_ids:
        return jsonify({'success': False, 'message': 'No OLTs with SNMP or CLI access configured'})

    from flask import current_app
    start_sync_all(current_app._get_current_object(), olt_ids)
    log_action('olt_sync_all', 'olt', target='all', detail=f'Synced {len(olt_ids)} OLTs')
    return jsonify({'success': True, 'message': f'Syncing {len(olt_ids)} OLT(s)'})


@bp.route('/api/olt/<int:olt_id>/sync-status', methods=['GET'])
@login_required
def sync_status(olt_id):
    sync = OLTSyncStatus.query.filter_by(olt_id=olt_id).first()
    if not sync:
        return jsonify({'status': 'idle', 'progress': 0, 'message': ''})
    return jsonify({
        'status': sync.status,
        'progress': sync.progress,
        'message': sync.message,
        'onu_count': sync.onu_count,
        'started_at': utc_iso(sync.started_at),
        'completed_at': utc_iso(sync.completed_at),
        'job_id': sync.job_id,
        'sync_type': sync.sync_type,
        'triggered_by': sync.triggered_by,
        'duration_seconds': sync.duration_seconds,
        'error_detail': sync.error_detail,
    })


@bp.route('/api/olt/<int:olt_id>/sync-history', methods=['GET'])
@login_required
def sync_history(olt_id):
    """Get sync job history for an OLT."""
    from sync_job import get_sync_history
    jobs = get_sync_history(olt_id, limit=20)
    return jsonify({'jobs': [{
        'job_id': j.job_id,
        'status': j.status,
        'sync_type': j.sync_type,
        'triggered_by': j.triggered_by,
        'progress': j.progress,
        'message': j.message,
        'onu_count': j.onu_count,
        'error_detail': j.error_detail,
        'started_at': utc_iso(j.started_at),
        'completed_at': utc_iso(j.completed_at),
        'duration_seconds': j.duration_seconds,
    } for j in jobs]})


@bp.route('/api/olt/<int:olt_id>/test-connection', methods=['POST'])
@permission_required('settings_ip_olts')
def test_olt_connection(olt_id):
    """Test SNMP and CLI (SSH or Telnet) connections to OLT"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})

    data = request.get_json() or {}
    results = {'snmp': {'ok': False, 'message': ''}, 'telnet': {'ok': False, 'message': ''}, 'web': {'ok': False, 'message': ''}}

    ip = data.get('ip_address', olt.ip_address)

    # Test SNMP
    try:
        from snmp_collector import SNMPCollector
        collector = SNMPCollector(
            ip,
            data.get('snmp_community', olt.snmp_community),
            int(data.get('snmp_port', olt.snmp_port))
        )
        info = collector.collect_system_info()
        if info.get('description'):
            results['snmp'] = {'ok': True, 'message': f'Connected - {info["description"][:60]}'}
            import re
            ver_match = re.search(r'Version\s+([\w.]+)', info['description'])
            olt.firmware_version = ver_match.group(1) if ver_match else info['description'][:30]
            olt.snmp_status = 'connected'
        else:
            results['snmp'] = {'ok': False, 'message': 'No response from SNMP'}
            olt.snmp_status = 'disconnected'
    except Exception as e:
        results['snmp'] = {'ok': False, 'message': f'SNMP Error: {str(e)[:80]}'}
        olt.snmp_status = 'disconnected'

    # Test CLI (SSH or Telnet — SSH takes priority if enabled)
    cli_user = data.get('cli_username', olt.cli_username)
    cli_pass = data.get('cli_password', olt.cli_password)
    # If password is masked ('***'), use stored password from DB
    if cli_pass and cli_pass.startswith('***'):
        cli_pass = olt.cli_password
    if cli_user and cli_pass:
        try:
            from snmp_collector import TelnetCollector
            use_ssh = data.get('ssh_enabled', olt.ssh_enabled)
            if use_ssh:
                cli_port = int(data.get('ssh_port', olt.ssh_port or 22))
                cli_label = 'SSH'
            else:
                cli_port = int(data.get('telnet_port', olt.telnet_port or 23))
                cli_label = 'Telnet'
            tc = TelnetCollector(
                ip, cli_user, cli_pass, cli_port,
                use_ssh=use_ssh
            )
            tn = tc._connect()
            if tn:
                tn.write('exit\n')
                tn.close()
                results['telnet'] = {'ok': True, 'message': f'{cli_label} Connected'}
                olt.telnet_status = 'connected'
            else:
                results['telnet'] = {'ok': False, 'message': f'{cli_label} connection failed'}
                olt.telnet_status = 'disconnected'
        except Exception as e:
            results['telnet'] = {'ok': False, 'message': f'CLI Error: {str(e)[:80]}'}
            olt.telnet_status = 'disconnected'
    else:
        # No CLI credentials — SNMP-only mode, not an error
        results['telnet'] = {'ok': None, 'message': 'Not configured (SNMP-only)'}
        olt.telnet_status = 'not_configured'

    # Test Web (HTTP Basic Auth)
    web_port = int(data.get('web_port', olt.web_port or 80))
    if cli_user and cli_pass:
        try:
            import urllib.request, base64
            url = f'http://{ip}:{web_port}/'
            req = urllib.request.Request(url, method='GET')
            cred = base64.b64encode(f'{cli_user}:{cli_pass}'.encode()).decode()
            req.add_header('Authorization', f'Basic {cred}')
            req.add_header('User-Agent', 'Mozilla/5.0')
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    results['web'] = {'ok': True, 'message': f'Connected (HTTP {resp.status})'}
                else:
                    results['web'] = {'ok': False, 'message': f'HTTP {resp.status}'}
        except urllib.error.HTTPError as e:
            if e.code == 401:
                results['web'] = {'ok': False, 'message': 'Auth failed (401)'}
            else:
                results['web'] = {'ok': False, 'message': f'HTTP {e.code}'}
        except Exception as e:
            results['web'] = {'ok': False, 'message': f'Web Error: {str(e)[:80]}'}

    # Update connection status — online if SNMP is OK (Telnet is optional)
    if results['snmp']['ok']:
        olt.is_online = True
        olt.connection_status = 'connected'
    else:
        olt.is_online = False
        olt.connection_status = 'disconnected'
    db.session.commit()
    return jsonify({'success': True, 'results': results})


@bp.route('/api/olt/test-connection', methods=['POST'])
@permission_required('settings_ip_olts')
def test_new_olt_connection():
    """Test connection for a new OLT (no ID yet)"""
    data = request.get_json() or {}
    results = {'snmp': {'ok': False, 'message': ''}, 'telnet': {'ok': False, 'message': ''}, 'web': {'ok': False, 'message': ''}}

    ip = data.get('ip_address', '')
    if not ip:
        return jsonify({'success': False, 'message': 'IP address required'})

    # Test SNMP
    try:
        from snmp_collector import SNMPCollector
        collector = SNMPCollector(
            ip, data.get('snmp_community', 'public'), int(data.get('snmp_port', 161))
        )
        info = collector.collect_system_info()
        if info.get('description'):
            results['snmp'] = {'ok': True, 'message': f'Connected - {info["description"][:60]}'}
        else:
            results['snmp'] = {'ok': False, 'message': 'No response from SNMP'}
    except Exception as e:
        results['snmp'] = {'ok': False, 'message': f'SNMP Error: {str(e)[:80]}'}

    # Test CLI (SSH or Telnet — SSH takes priority if enabled)
    cli_user = data.get('cli_username', '')
    cli_pass = data.get('cli_password', '')
    # Ignore masked password placeholder
    if cli_pass and cli_pass.startswith('***'):
        cli_pass = ''
    if cli_user and cli_pass:
        try:
            from snmp_collector import TelnetCollector
            use_ssh = data.get('ssh_enabled', False)
            if use_ssh:
                cli_port = int(data.get('ssh_port', 22))
                cli_label = 'SSH'
            else:
                cli_port = int(data.get('telnet_port', 23))
                cli_label = 'Telnet'
            tc = TelnetCollector(ip, cli_user, cli_pass, cli_port, use_ssh=use_ssh)
            tn = tc._connect()
            if tn:
                tn.write('exit\n')
                tn.close()
                results['telnet'] = {'ok': True, 'message': f'{cli_label} Connected'}
            else:
                results['telnet'] = {'ok': False, 'message': f'{cli_label} connection failed'}
        except Exception as e:
            results['telnet'] = {'ok': False, 'message': f'CLI Error: {str(e)[:80]}'}
    else:
        # No CLI credentials — SNMP-only mode
        results['telnet'] = {'ok': None, 'message': 'Not configured (SNMP-only)'}

    # Test Web (HTTP Basic Auth)
    web_port = int(data.get('web_port', 80))
    if cli_user and cli_pass:
        try:
            import urllib.request, base64
            url = f'http://{ip}:{web_port}/'
            req = urllib.request.Request(url, method='GET')
            cred = base64.b64encode(f'{cli_user}:{cli_pass}'.encode()).decode()
            req.add_header('Authorization', f'Basic {cred}')
            req.add_header('User-Agent', 'Mozilla/5.0')
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    results['web'] = {'ok': True, 'message': f'Connected (HTTP {resp.status})'}
                else:
                    results['web'] = {'ok': False, 'message': f'HTTP {resp.status}'}
        except urllib.error.HTTPError as e:
            if e.code == 401:
                results['web'] = {'ok': False, 'message': 'Auth failed (401)'}
            else:
                results['web'] = {'ok': False, 'message': f'HTTP {e.code}'}
        except Exception as e:
            results['web'] = {'ok': False, 'message': f'Web Error: {str(e)[:80]}'}

    return jsonify({'success': True, 'results': results})
