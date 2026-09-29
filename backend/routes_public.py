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
    logo_cfg = SystemConfig.query.filter_by(key='nms_logo_url').first()
    logo_url = logo_cfg.value if logo_cfg and logo_cfg.value else None
    return jsonify({'nms_name': brand['nms_name'], 'logo_url': logo_url, 'base_domain': root_domain, 'nms_prefix': nms_prefix, 'timezone': system_timezone})


# ─── Branding-derived PWA manifest & favicons ────────────────────────────
# These explicit routes take precedence over app.py's /<path:path> SPA
# catch-all (Flask matches static routes before the path converter).

_DEFAULT_MANIFEST = {
    'name': 'Salfanet NMS — FTTH Network Management',
    'short_name': 'Salfanet NMS',
    'description': 'Salfanet NMS — FTTH Network Management System',
    'start_url': '/', 'display': 'standalone',
    'background_color': '#0A0C14', 'theme_color': '#0A0C14',
    'scope': '/', 'orientation': 'any', 'id': '/',
    'categories': ['utilities', 'productivity'],
    'icons': [
        {'src': '/pwa/icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
        {'src': '/pwa/icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
        {'src': '/pwa/maskable-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'maskable'},
        {'src': '/pwa/maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
    ],
}


def _dist_dir():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(repo_root, 'frontend', 'dist')


@bp.route('/manifest.webmanifest', methods=['GET'])
def pwa_manifest():
    """Serve the PWA manifest with tenant branding (name + uploaded logo icons)."""
    import json as _json
    from flask import Response
    from branding_icons import ensure_branding_icons, branding_icon_version

    manifest_path = os.path.join(_dist_dir(), 'manifest.webmanifest')
    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            m = _json.load(f)
    except Exception:
        m = dict(_DEFAULT_MANIFEST)

    nms_name = _get_nms_branding()['nms_name']
    m['name'] = f'{nms_name} — FTTH Network Management'
    m['short_name'] = nms_name[:30]

    if ensure_branding_icons():
        v = branding_icon_version()
        base = '/static/uploads/pwa'
        m['icons'] = [
            {'src': f'{base}/icon-192.png?v={v}', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
            {'src': f'{base}/icon-512.png?v={v}', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
            {'src': f'{base}/maskable-192.png?v={v}', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'maskable'},
            {'src': f'{base}/maskable-512.png?v={v}', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
        ]

    resp = Response(_json.dumps(m), mimetype='application/manifest+json')
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return resp


def _branding_icon(filename, fallback_rel):
    """Serve a branding icon generated from the uploaded logo, else the
    static PWA default from frontend/dist."""
    from flask import send_from_directory, make_response
    from branding_icons import ensure_branding_icons, ICON_DIR
    if ensure_branding_icons():
        resp = make_response(send_from_directory(ICON_DIR, filename))
    else:
        resp = make_response(send_from_directory(_dist_dir(), fallback_rel))
    resp.headers['Cache-Control'] = 'no-cache'
    return resp


@bp.route('/branding/favicon.png', methods=['GET'])
def branding_favicon_png():
    return _branding_icon('favicon-32.png', 'pwa/favicon-192.png')


@bp.route('/branding/favicon.ico', methods=['GET'])
@bp.route('/favicon.ico', methods=['GET'])
def branding_favicon_ico():
    return _branding_icon('favicon.ico', 'pwa/favicon-192.png')


@bp.route('/branding/apple-touch-icon.png', methods=['GET'])
def branding_apple_touch_icon():
    return _branding_icon('apple-touch-icon.png', 'pwa/apple-touch-icon.png')
