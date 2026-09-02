"""Auto-extracted from app.py monolith split (blueprint: public).
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

bp = Blueprint('public', __name__)

@bp.route('/api/public/branding', methods=['GET'])
def public_branding():
    """Get NMS branding — public, no auth. Used by login page."""
    brand = _get_nms_branding()
    base = brand['nms_url'].replace('https://', '').replace('http://', '').rstrip('/')
    parts = base.split('.')
    if len(parts) > 2:
        root_domain = '.'.join(parts[1:])
        nms_prefix = parts[0]
    else:
        root_domain = base
        nms_prefix = ''
    # Include system timezone for frontend date formatting
    tz_cfg = SystemConfig.query.filter_by(key='timezone').first()
    system_timezone = tz_cfg.value if tz_cfg and tz_cfg.value else 'Asia/Jakarta'
    return jsonify({'nms_name': brand['nms_name'], 'base_domain': root_domain, 'nms_prefix': nms_prefix, 'timezone': system_timezone})
