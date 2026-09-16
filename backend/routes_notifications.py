"""Auto-extracted from app.py monolith split (blueprint: notifications).
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

bp = Blueprint('notifications', __name__)

ALARM_CATEGORIES = {'offline', 'dyinggasp', 'los', 'olt_offline', 'signal', 'signal_drop',
                    'offline_batch', 'dyinggasp_batch', 'los_batch', 'signal_drop_batch',
                    'olt_cpu_high', 'olt_mem_high', 'olt_temp_high', 'olt_backup_failed'}


UNREGISTER_CATEGORIES = {'unconfig', 'unconfigured'}


def _notif_type(category):
    if category in ALARM_CATEGORIES:
        return 'alarm'
    if category in UNREGISTER_CATEGORIES:
        return 'unregister'
    return 'general'


@bp.route('/api/notifications', methods=['GET'])
@login_required
def get_notifications():
    """Get notifications for current user's role, optionally filtered by type."""
    limit = request.args.get('limit', 50, type=int)
    unread_only = request.args.get('unread', 'false') == 'true'
    notif_type = request.args.get('type', '')  # alarm | unregister | general

    query = Notification.query
    if unread_only:
        query = query.filter_by(is_read=False)

    # Filter by target roles if user is not admin
    if current_user.role and not current_user.role.has_permission('all_olt'):
        role_id = current_user.role_id
        query = query.filter(
            (Notification.target_roles == '') |
            (Notification.target_roles.contains(str(role_id)))
        )

    # Filter by type using category mapping
    if notif_type == 'alarm':
        query = query.filter(Notification.category.in_(ALARM_CATEGORIES))
    elif notif_type == 'unregister':
        query = query.filter(Notification.category.in_(UNREGISTER_CATEGORIES))
    elif notif_type == 'general':
        query = query.filter(~Notification.category.in_(ALARM_CATEGORIES | UNREGISTER_CATEGORIES))

    notifications = query.order_by(Notification.created_at.desc()).limit(limit).all()

    # Per-type unread counts (only active/non-resolved)
    base_unread = Notification.query.filter_by(is_read=False, resolved=False)
    alarm_unread = base_unread.filter(Notification.category.in_(ALARM_CATEGORIES)).count()
    unreg_unread = base_unread.filter(Notification.category.in_(UNREGISTER_CATEGORIES)).count()
    general_unread = base_unread.filter(~Notification.category.in_(ALARM_CATEGORIES | UNREGISTER_CATEGORIES)).count()
    unread_count = alarm_unread + unreg_unread + general_unread

    return jsonify({
        'notifications': [{
            'id': n.id, 'severity': n.severity, 'category': n.category,
            'type': _notif_type(n.category),
            'title': n.title, 'message': n.message, 'is_read': n.is_read,
            'acknowledged': n.acknowledged, 'acknowledged_by': n.acknowledged_by,
            'acknowledged_at': utc_iso(n.acknowledged_at),
            'resolved': n.resolved, 'resolved_at': utc_iso(n.resolved_at),
            'olt_id': n.olt_id, 'onu_id': n.onu_id,
            'created_at': utc_iso(n.created_at),
        } for n in notifications],
        'unread_count': unread_count,
        'alarm_unread': alarm_unread,
        'unregister_unread': unreg_unread,
        'general_unread': general_unread,
    })


@bp.route('/api/notifications/<int:notif_id>/read', methods=['POST'])
@login_required
def mark_notification_read(notif_id):
    """Mark a notification as read."""
    notif = db.session.get(Notification, notif_id)
    if not notif:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    notif.is_read = True
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/notifications/read-all', methods=['POST'])
@login_required
def mark_all_notifications_read():
    """Mark all notifications as read, optionally filtered by type."""
    notif_type = request.args.get('type', '')
    q = Notification.query.filter_by(is_read=False)
    if notif_type == 'alarm':
        q = q.filter(Notification.category.in_(ALARM_CATEGORIES))
    elif notif_type == 'unregister':
        q = q.filter(Notification.category.in_(UNREGISTER_CATEGORIES))
    elif notif_type == 'general':
        q = q.filter(~Notification.category.in_(ALARM_CATEGORIES | UNREGISTER_CATEGORIES))
    q.update({'is_read': True})
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/notifications/<int:notif_id>/acknowledge', methods=['POST'])
@login_required
def acknowledge_notification(notif_id):
    """Acknowledge a notification (mark as being handled)."""
    notif = db.session.get(Notification, notif_id)
    if not notif:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    notif.acknowledged = True
    notif.acknowledged_by = current_user.username or current_user.email or 'unknown'
    notif.acknowledged_at = datetime.now(timezone.utc)
    notif.is_read = True
    db.session.commit()
    log_action('acknowledge', 'notification', notif.id, f'Acknowledged alert: {notif.title}')
    return jsonify({'success': True, 'acknowledged_by': notif.acknowledged_by})


@bp.route('/api/notifications/acknowledge-all', methods=['POST'])
@permission_required('customization')
def acknowledge_all_notifications():
    """Acknowledge all unread/unacknowledged notifications, optionally filtered by type."""
    notif_type = request.args.get('type', '')
    q = Notification.query.filter_by(acknowledged=False)
    if notif_type == 'alarm':
        q = q.filter(Notification.category.in_(ALARM_CATEGORIES))
    elif notif_type == 'unregister':
        q = q.filter(Notification.category.in_(UNREGISTER_CATEGORIES))
    elif notif_type == 'general':
        q = q.filter(~Notification.category.in_(ALARM_CATEGORIES | UNREGISTER_CATEGORIES))
    now = datetime.now(timezone.utc)
    username = current_user.username or current_user.email or 'unknown'
    count = 0
    for notif in q.all():
        notif.acknowledged = True
        notif.acknowledged_by = username
        notif.acknowledged_at = now
        notif.is_read = True
        count += 1
    db.session.commit()
    return jsonify({'success': True, 'count': count})


@bp.route('/api/notifications/<int:notif_id>', methods=['DELETE'])
@permission_required('customization')
def delete_notification(notif_id):
    """Delete a notification."""
    notif = db.session.get(Notification, notif_id)
    if not notif:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    db.session.delete(notif)
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/notifications/clear', methods=['POST'])
@permission_required('customization')
def clear_notifications():
    """Clear all read notifications."""
    q = Notification.query.filter_by(is_read=True)
    q.delete()
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/alerts/history', methods=['GET'])
@login_required
def get_alert_history():
    """Get paginated alert history (AlertHistory table).
    Query params: page, per_page, alert_type, olt_id"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 30, type=int)
    alert_type = request.args.get('type', '').strip()
    olt_id = request.args.get('olt_id', type=int)

    query = AlertHistory.query

    if alert_type:
        query = query.filter_by(alert_type=alert_type)
    if olt_id:
        query = query.filter_by(olt_id=olt_id)

    # Join with OLT for name, and ONU for serial/name
    pagination = query.order_by(AlertHistory.last_alert_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False)

    results = []
    for h in pagination.items:
        olt_name = ''
        onu_info = ''
        onu = db.session.get(ONU, h.onu_id) if h.onu_id else None
        if onu:
            onu_info = onu.name or onu.serial_number or onu.onu_id_str or ''
        resolved_olt_id = h.olt_id or (onu.olt_id if onu else None)
        if resolved_olt_id:
            olt = db.session.get(OLT, resolved_olt_id)
            olt_name = olt.name if olt else ''

        results.append({
            'id': h.id,
            'alert_type': h.alert_type,
            'last_value': h.last_value,
            'last_alert_at': utc_iso(h.last_alert_at),
            'olt_id': resolved_olt_id,
            'olt_name': olt_name,
            'onu_id': h.onu_id,
            'onu_info': onu_info,
        })

    return jsonify({
        'history': results,
        'total': pagination.total,
        'pages': pagination.pages,
        'page': page,
    })


@bp.route('/api/maintenance', methods=['GET'])
@login_required
def get_maintenance_windows():
    """List maintenance windows."""
    from models import MaintenanceWindow
    query = MaintenanceWindow.query
    windows = query.order_by(MaintenanceWindow.start_time.desc()).limit(50).all()
    return jsonify({
        'windows': [{
            'id': w.id, 'olt_id': w.olt_id,
            'olt_name': w.olt.name if w.olt else 'All OLTs',
            'start_time': utc_iso(w.start_time),
            'end_time': utc_iso(w.end_time),
            'reason': w.reason,
            'created_by': w.created_by,
            'is_active': w.start_time <= datetime.now(timezone.utc).replace(tzinfo=None) <= w.end_time,
        } for w in windows]
    })


@bp.route('/api/maintenance', methods=['POST'])
@login_required
@permission_required('customization')
def create_maintenance_window():
    """Create a maintenance window."""
    from models import MaintenanceWindow
    data = request.get_json() or {}
    start = data.get('start_time')
    end = data.get('end_time')
    if not start or not end:
        return jsonify({'success': False, 'message': 'start_time and end_time required'}), 400

    try:
        start_dt = datetime.fromisoformat(start.replace('Z', '+00:00')).astimezone(timezone.utc).replace(tzinfo=None)
        end_dt = datetime.fromisoformat(end.replace('Z', '+00:00')).astimezone(timezone.utc).replace(tzinfo=None)
    except Exception:
        return jsonify({'success': False, 'message': 'Invalid datetime format'}), 400

    window = MaintenanceWindow(
        olt_id=data.get('olt_id'),
        start_time=start_dt,
        end_time=end_dt,
        reason=data.get('reason', ''),
        created_by=current_user.username or '',
    )
    db.session.add(window)
    db.session.commit()
    log_action('create', 'maintenance', window.id, f'Maintenance: {window.reason}')
    return jsonify({'success': True, 'id': window.id})


@bp.route('/api/maintenance/<int:window_id>', methods=['DELETE'])
@login_required
@permission_required('customization')
def delete_maintenance_window(window_id):
    """Delete a maintenance window."""
    from models import MaintenanceWindow
    window = db.session.get(MaintenanceWindow, window_id)
    if not window:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    db.session.delete(window)
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/uptime/onu/<int:onu_id>', methods=['GET'])
@login_required
def get_onu_uptime(onu_id):
    """Get uptime statistics for an ONU.
    Query params: range (days, default 30)"""
    from models import UptimeLog
    days = request.args.get('range', 30, type=int)
    since = datetime.now(timezone.utc) - timedelta(days=days)

    logs = UptimeLog.query.filter(
        UptimeLog.onu_id == onu_id,
        UptimeLog.changed_at >= since
    ).order_by(UptimeLog.changed_at.asc()).all()

    # Calculate uptime
    total_seconds = days * 86400
    offline_seconds = 0
    last_online_at = since

    for log in logs:
        if log.new_status in ('offline', 'dyinggasp', 'los'):
            # Went offline
            offline_start = log.changed_at
            last_online_at = None
        elif log.new_status == 'online' and last_online_at is None:
            # Came back online
            if hasattr(log, '_offline_start'):
                offline_seconds += (log.changed_at - offline_start).total_seconds()
            last_online_at = log.changed_at

    uptime_pct = ((total_seconds - offline_seconds) / total_seconds * 100) if total_seconds > 0 else 100

    return jsonify({
        'onu_id': onu_id,
        'range_days': days,
        'uptime_pct': round(uptime_pct, 2),
        'total_incidents': len([l for l in logs if l.new_status != 'online']),
        'last_incident': utc_iso(logs[-1].changed_at) if logs else None,
    })


@bp.route('/api/uptime/olt/<int:olt_id>', methods=['GET'])
@login_required
def get_olt_uptime(olt_id):
    """Get uptime statistics for an OLT."""
    from models import UptimeLog
    days = request.args.get('range', 30, type=int)
    since = datetime.now(timezone.utc) - timedelta(days=days)

    logs = UptimeLog.query.filter(
        UptimeLog.olt_id == olt_id,
        UptimeLog.onu_id.is_(None),  # OLT-level events only
        UptimeLog.changed_at >= since
    ).order_by(UptimeLog.changed_at.asc()).all()

    total_seconds = days * 86400
    offline_seconds = 0
    for i, log in enumerate(logs):
        if log.new_status == 'offline':
            next_online = next((l for l in logs[i+1:] if l.new_status == 'online'), None)
            if next_online:
                offline_seconds += (next_online.changed_at - log.changed_at).total_seconds()
            else:
                offline_seconds += (datetime.now(timezone.utc) - log.changed_at).total_seconds()

    uptime_pct = ((total_seconds - offline_seconds) / total_seconds * 100) if total_seconds > 0 else 100

    return jsonify({
        'olt_id': olt_id,
        'range_days': days,
        'uptime_pct': round(uptime_pct, 2),
        'total_incidents': len([l for l in logs if l.new_status == 'offline']),
    })


@bp.route('/api/unregistered-count', methods=['GET'])
@login_required
def unregistered_count():
    """Quick check for unregistered ONUs across all OLTs.
    Returns count + per-OLT breakdown. Also creates notifications if found."""
    olts = OLT.query.filter_by(monitoring_enabled=True).all()
    total_unreg = 0
    breakdown = []
    from snmp_collector import TelnetCollector, create_cli_collector
    for olt in olts:
        if not olt.cli_enabled:
            continue
        try:
            tc = create_cli_collector(olt)
            unregistered = tc.collect_unregistered_onus()
            count = len(unregistered)
            if count > 0:
                total_unreg += count
                breakdown.append({'olt_id': olt.id, 'olt_name': olt.name, 'count': count})
                # Create or update notification (dedup by olt_id + category, not title)
                existing = Notification.query.filter_by(
                    olt_id=olt.id, category='unconfig', is_read=False
                ).first()
                title = f'⚠️ {count} ONU Belum Terdaftar — {olt.name}'
                message = f'{count} ONU(s) waiting for registration on OLT {olt.name}'
                if existing:
                    existing.title = title
                    existing.message = message
                else:
                    n = Notification(
                        olt_id=olt.id,
                        title=title,
                        message=message,
                        severity='warning',
                        category='unconfig'
                    )
                    db.session.add(n)
            else:
                # All ONUs registered — auto-resolve any existing unconfig notifications
                stale = Notification.query.filter_by(
                    olt_id=olt.id, category='unconfig', resolved=False
                ).all()
                for n in stale:
                    n.resolved = True
                    n.resolved_at = datetime.now(timezone.utc)
                    n.is_read = True
        except:
            pass
    db.session.commit()
    # Also count offline/dyinggasp/los ONUs from DB
    base_q = ONU.query.filter(ONU.status.in_(['offline', 'dyinggasp', 'los']))
    offline_count = base_q.filter(ONU.status == 'offline').count()
    dyinggasp_count = base_q.filter(ONU.status == 'dyinggasp').count()
    los_count = base_q.filter(ONU.status == 'los').count()
    offline_dyinggasp = offline_count + dyinggasp_count + los_count
    return jsonify({
        'unregistered': total_unreg,
        'breakdown': breakdown,
        'offline_dyinggasp': offline_dyinggasp,
        'offline_count': offline_count,
        'dyinggasp_count': dyinggasp_count,
        'los_count': los_count,
    })


@bp.route('/api/alert-rules', methods=['GET'])
@login_required
def get_alert_rules():
    """Get alert rules."""
    rules = AlertRule.query.all()
    return jsonify({'rules': [{
        'id': r.id, 'name': r.name, 'enabled': r.enabled,
        'check_offline': r.check_offline, 'check_dyinggasp': r.check_dyinggasp,
        'check_los': r.check_los, 'check_rx_power': r.check_rx_power,
        'rx_threshold': r.rx_threshold, 'rx_change_threshold': r.rx_change_threshold,
        'check_olt_offline': r.check_olt_offline, 'check_olt_cpu': r.check_olt_cpu,
        'check_olt_memory': r.check_olt_memory, 'check_olt_temperature': r.check_olt_temperature,
        'olt_cpu_threshold': r.olt_cpu_threshold, 'olt_memory_threshold': r.olt_memory_threshold,
        'olt_temp_threshold': r.olt_temp_threshold,
        'notify_bell': r.notify_bell, 'notify_telegram': r.notify_telegram,
        'notify_whatsapp': r.notify_whatsapp, 'notify_whatsapp_native': r.notify_whatsapp_native,
        'target_roles': r.target_roles or '',
    } for r in rules]})


@bp.route('/api/alert-rules/<int:rule_id>', methods=['PUT'])
@permission_required('customization')
def update_alert_rule(rule_id):
    """Update an alert rule."""
    rule = db.session.get(AlertRule, rule_id)
    if not rule:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    data = request.get_json() or {}
    for field in ['name', 'enabled', 'check_offline', 'check_dyinggasp', 'check_los',
                  'check_rx_power', 'rx_threshold', 'rx_change_threshold',
                  'check_olt_offline', 'check_olt_cpu', 'check_olt_memory',
                  'check_olt_temperature', 'olt_cpu_threshold', 'olt_memory_threshold',
                  'olt_temp_threshold',
                  'notify_bell', 'notify_telegram', 'notify_whatsapp',
                  'notify_whatsapp_native', 'target_roles']:
        if field in data:
            setattr(rule, field, data[field])
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/bot-config', methods=['GET'])
@login_required
def get_bot_config():
    """Get bot configurations."""
    configs = BotConfig.query.all()
    return jsonify({'configs': [{
        'id': c.id, 'bot_type': c.bot_type, 'enabled': c.enabled,
        'bot_token': c.bot_token[:10] + '...' if c.bot_token and len(c.bot_token) > 10 else c.bot_token,
        'chat_id': c.chat_id, 'api_url': c.api_url,
        'phone_number': c.phone_number,
    } for c in configs]})


@bp.route('/api/bot-config/<string:bot_type>', methods=['PUT'])
@permission_required('customization')
def update_bot_config(bot_type):
    """Update or create bot configuration."""
    config = BotConfig.query.filter_by(bot_type=bot_type).first()
    if not config:
        config = BotConfig(bot_type=bot_type)
        db.session.add(config)

    data = request.get_json() or {}
    for field in ['enabled', 'bot_token', 'chat_id', 'api_url', 'api_key', 'phone_number']:
        if field in data:
            val = data[field]
            # Don't overwrite with placeholder
            if field in ('bot_token', 'api_key') and val and '...' in str(val):
                continue
            setattr(config, field, val)

    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/alert-rules/recheck', methods=['POST'])
@permission_required('customization')
def recheck_alerts():
    """Manually trigger alert re-check now."""
    from alerts import _check_onus_for_tenant
    try:
        _check_onus_for_tenant(force_send=True)
        unread = Notification.query.filter_by(is_read=False).count()
        return jsonify({'success': True, 'message': f'Re-check complete. {unread} unread notifications. Alerts sent to enabled channels.'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/bot-config/telegram/test', methods=['POST'])
@permission_required('customization')
def test_telegram():
    """Send test message via Telegram."""
    config = BotConfig.query.filter_by(bot_type='telegram').first()
    if not config or not config.enabled:
        return jsonify({'success': False, 'message': 'Telegram not configured or disabled'})
    if not config.bot_token or not config.chat_id:
        return jsonify({'success': False, 'message': 'Bot token and chat ID are required'})
    try:
        import urllib.request as _urllib
        url = f"https://api.telegram.org/bot{config.bot_token}/sendMessage"
        payload = json.dumps({
            'chat_id': config.chat_id,
            'text': '🔔 *FiberNMS Test Message*\n\nThis is a test notification from FiberNMS.\nIf you see this, your Telegram bot is configured correctly!',
            'parse_mode': 'Markdown',
        }).encode('utf-8')
        req = _urllib.Request(url, data=payload, headers={'Content-Type': 'application/json'})
        resp = _urllib.urlopen(req, timeout=10)
        if resp.status == 200:
            return jsonify({'success': True, 'message': 'Test message sent!'})
        return jsonify({'success': False, 'message': f'HTTP {resp.status}'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/bot-config/whatsapp/test', methods=['POST'])
@permission_required('customization')
def test_whatsapp():
    """Send test message via WhatsApp gateway."""
    config = BotConfig.query.filter_by(bot_type='whatsapp').first()
    if not config or not config.enabled:
        return jsonify({'success': False, 'message': 'WhatsApp not configured or disabled'})
    if not config.api_url or not config.phone_number:
        return jsonify({'success': False, 'message': 'API URL and phone number are required'})
    try:
        import urllib.request as _urllib
        import urllib.parse as _parse

        test_msg = '🔔 FiberNMS Test\n\nThis is a test notification from FiberNMS.\nIf you see this, WhatsApp gateway is configured correctly!'
        headers = {'Content-Type': 'application/json'}
        if config.api_key:
            headers['Authorization'] = f'Bearer {config.api_key}'

        url = config.api_url
        phone = config.phone_number

        # Adapt payload format based on gateway URL
        if 'fonnte.com' in url:
            # Fonnte uses form-encoded, NOT JSON. Token in Authorization header directly (no Bearer)
            payload = _parse.urlencode({'target': phone, 'message': test_msg, 'countryCode': '62'}).encode('utf-8')
            headers = {'Authorization': config.api_key or ''}
        elif 'wablas.com' in url:
            payload = json.dumps({'phone': phone, 'message': test_msg}).encode('utf-8')
            if config.api_key:
                headers['Authorization'] = config.api_key
        elif 'callmebot.com' in url:
            url = f'{url}?phone={phone}&text={_parse.quote(test_msg)}&apikey={config.api_key}'
            payload = None
            headers = {}
        elif 'green-api.com' in url:
            payload = json.dumps({'message': test_msg, 'chatId': phone}).encode('utf-8')
        elif 'graph.facebook.com' in url or 'meta' in url.lower():
            payload = json.dumps({'messaging_product': 'whatsapp', 'to': phone, 'type': 'text', 'text': {'body': test_msg}}).encode('utf-8')
        elif 'twilio.com' in url:
            payload = _parse.urlencode({'To': f'whatsapp:{phone}', 'From': 'whatsapp:+14155238886', 'Body': test_msg}).encode('utf-8')
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
        else:
            # Generic: try phone + message
            payload = json.dumps({'phone': phone, 'message': test_msg, 'target': phone, 'text': test_msg}).encode('utf-8')

        if payload:
            req = _urllib.Request(url, data=payload, headers=headers)
        else:
            req = _urllib.Request(url, headers=headers)
        resp = _urllib.urlopen(req, timeout=15)
        if resp.status in (200, 201):
            return jsonify({'success': True, 'message': 'Test message sent! Check your WhatsApp.'})
        return jsonify({'success': False, 'message': f'HTTP {resp.status}'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})
