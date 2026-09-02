"""Auto-extracted from app.py monolith split (blueprint: olt_spa_data).
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

bp = Blueprint('olt_spa_data', __name__)

@bp.route('/api/olt/<int:olt_id>/uplinks/live-traffic', methods=['GET'])
@login_required
def uplinks_live_traffic(olt_id):
    """Real-time traffic rates for all uplink ports via CLI (called every 3s by frontend)."""
    import time as _time
    olt = db.session.get(OLT, olt_id)
    if not olt or not olt.cli_enabled or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI'})
    uplinks = OLTUplink.query.filter_by(olt_id=olt_id).order_by(OLTUplink.port_number).all()
    if not uplinks:
        return jsonify({'success': True, 'uplinks': [], 'ts': int(_time.time())})
    port_ids = [(u.id, u.port_name) for u in uplinks if u.port_name]
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    data = tc.get_uplinks_live_traffic(port_ids)
    return jsonify({'success': True, 'uplinks': data, 'ts': int(_time.time())})


_traffic_cache = {}


@bp.route('/api/olt/<int:olt_id>/uplinks/live-traffic', methods=['GET'])
@login_required
def get_uplinks_live_traffic(olt_id):
    """Get live traffic rates via SNMP polling with rate calculation."""
    import time as _time
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404

    import asyncio as _aio
    from pysnmp.hlapi.v1arch.asyncio import Slim as _Slim, ObjectType as _OT, ObjectIdentity as _OI

    async def _snmp_walk_next(oid, as_int=True):
        results = {}
        slim = _Slim(1)
        cur = oid
        errors = 0
        try:
            while True:
                try:
                    ei, es, eidx, vb = await slim.next(
                        olt.snmp_community or 'public', olt.ip_address, olt.snmp_port or 161,
                        _OT(_OI(cur)), timeout=3, retries=1)
                except Exception:
                    break
                if ei:
                    errors += 1
                    if errors > 2: break
                    continue
                if es: break
                roid = str(vb[0][0])
                if not roid.startswith(oid): break
                val = vb[0][1]
                if 'noSuch' in str(val): break
                idx = roid.split('.')[-1]
                if as_int:
                    try: results[idx] = int(val)
                    except (ValueError, TypeError): results[idx] = 0
                else:
                    results[idx] = str(val).strip()
                cur = roid
                errors = 0
        finally:
            slim.close()
        return results

    try:
        loop = _aio.new_event_loop()
        in_oct = loop.run_until_complete(_snmp_walk_next('1.3.6.1.2.1.2.2.1.10'))    # ifInOctets (int)
        out_oct = loop.run_until_complete(_snmp_walk_next('1.3.6.1.2.1.2.2.1.16'))   # ifOutOctets (int)
        if_descr = loop.run_until_complete(_snmp_walk_next('1.3.6.1.2.1.2.2.1.2', as_int=False))  # ifDescr (str)
        if_oper = loop.run_until_complete(_snmp_walk_next('1.3.6.1.2.1.2.2.1.8'))     # ifOperStatus (int)
        if_speed = loop.run_until_complete(_snmp_walk_next('1.3.6.1.2.1.2.2.1.5'))    # ifSpeed (int)
        loop.close()
    except Exception as e:
        logger.error(f"Live traffic SNMP walk failed: {e}")
        return jsonify({'success': False, 'message': str(e)})

    # Build ordered list of non-PON SNMP interfaces (uplink range: >= 285278977)
    uplink_snmp = []
    for idx in sorted(in_oct.keys(), key=lambda x: int(x)):
        ival = int(idx)
        if ival >= 285278977 and ival < 285290000:
            uplink_snmp.append(idx)

    now = _time.time()
    cache_key = f'olt_{olt_id}'
    prev = _traffic_cache.get(cache_key, {})
    dt = now - prev.get('_t', now)
    if dt < 0.5:
        dt = 0.5

    uplinks = OLTUplink.query.filter_by(olt_id=olt_id).order_by(OLTUplink.port_number).all()
    result = []
    new_cache = {'_t': now}

    for i, u in enumerate(uplinks):
        port = u.port_name
        # Match by ifDescr containing port name, or by position in uplink SNMP list
        matched_idx = None
        for idx in uplink_snmp:
            descr = if_descr.get(idx, '')
            if port.lower() in descr.lower():
                matched_idx = idx
                break
        if not matched_idx and i < len(uplink_snmp):
            matched_idx = uplink_snmp[i]

        cur_in = in_oct.get(matched_idx, 0) if matched_idx else 0
        cur_out = out_oct.get(matched_idx, 0) if matched_idx else 0
        new_cache[f'{port}_in'] = cur_in
        new_cache[f'{port}_out'] = cur_out

        prev_in = prev.get(f'{port}_in', cur_in)
        prev_out = prev.get(f'{port}_out', cur_out)
        in_rate = max(0, (cur_in - prev_in) / dt) if dt > 0 else 0
        out_rate = max(0, (cur_out - prev_out) / dt) if dt > 0 else 0

        def _fmt_rate(bytes_per_sec):
            bps = bytes_per_sec * 8
            if bps >= 1000000000: return f'{bps / 1000000000:.2f} Gbps'
            if bps >= 1000000: return f'{bps / 1000000:.2f} Mbps'
            if bps >= 1000: return f'{bps / 1000:.1f} Kbps'
            return f'{round(bps)} bps'

        result.append({
            'id': u.id, 'port_name': port,
            'in_rate_str': _fmt_rate(in_rate),
            'out_rate_str': _fmt_rate(out_rate),
            'total_in': cur_in,
            'total_out': cur_out,
        })

    _traffic_cache[cache_key] = new_cache
    return jsonify({'success': True, 'uplinks': result, 'ts': now})


@bp.route('/api/olt/<int:olt_id>/wan-ip-profiles', methods=['GET'])
@login_required
def get_wan_ip_profiles_db(olt_id):
    """Get full WAN IP profiles from DB. Cached 60s."""
    from cache import cache_get, cache_set
    cache_key = f"olt:{olt_id}:wan-ip-profiles"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)
    profiles = WanIpProfile.query.filter_by(olt_id=olt_id).order_by(WanIpProfile.name).all()
    result = []
    for p in profiles:
        vlan = ''
        priority = ''
        ip_mode = 'dhcp'
        if p.dns1 and p.dns1.startswith('cvlan:'):
            vlan = p.dns1.replace('cvlan:', '')
        elif p.netmask:
            vlan = p.netmask
        if p.dns2 and p.dns2.startswith('pri:'):
            priority = p.dns2.replace('pri:', '')
        elif p.dns2:
            priority = p.dns2
        if p.ip_address and p.ip_address.lower() != 'dhcp':
            ip_mode = 'static'
        result.append({
            'id': p.id, 'name': p.name, 'ip_address': p.ip_address or '',
            'netmask': p.netmask or '', 'gateway': p.gateway or '',
            'dns1': p.dns1 or '', 'dns2': p.dns2 or '',
            'vlan': vlan, 'priority': priority, 'ip_mode': ip_mode,
        })
    result_json = {'success': True, 'wan_ip_profiles': result}
    cache_set(cache_key, result_json, ttl=60)
    return jsonify(result_json)


@bp.route('/api/olt/<int:olt_id>/pon-port/<int:port_id>/onus', methods=['GET'])
@login_required
def get_pon_port_onus(olt_id, port_id):
    """Get ONU list for a specific PON port from DB"""
    port = db.session.get(OLTPort, port_id)
    if not port or port.olt_id != olt_id:
        return jsonify({'success': False, 'message': 'Port not found'}), 404
    # Extract frame/slot/port from port_name like gpon-olt_1/1/1 or epon-olt_1/1/1
    parts = port.port_name.replace('gpon-olt_', '').replace('gpon-onu_', '').replace('epon-olt_', '').replace('epon-onu_', '').split('/')
    if len(parts) >= 3:
        frame, slot, pon_port = int(parts[0]), int(parts[1]), int(parts[2])
        onus = ONU.query.filter_by(olt_id=olt_id, frame=frame, slot=slot, port=pon_port).order_by(ONU.onu_id).all()
    else:
        onus = []
    return jsonify({
        'success': True,
        'onus': [{
            'id': o.id, 'onu_id': o.onu_id, 'onu_id_str': f'{o.frame}/{o.slot}/{o.port}:{o.onu_id}',
            'serial_number': o.serial_number or '',
            'name': o.name or '', 'status': o.status or 'offline',
            'rx_power': o.rx_power, 'onu_rx_power': o.onu_rx_power,
            'onu_type': o.onu_type or '', 'distance': o.distance or '',
            'slot': o.slot, 'port': o.port, 'frame': o.frame,
        } for o in onus]
    })


@bp.route('/api/olt/<int:olt_id>/pon-port-by-name/<path:port_name>/onus', methods=['GET'])
@login_required
def get_pon_port_onus_by_name(olt_id, port_name):
    """Get ONU list for a PON port by port_name (for placeholder ports without DB id)"""
    parts = port_name.replace('gpon-olt_', '').replace('gpon-onu_', '').replace('epon-olt_', '').replace('epon-onu_', '').split('/')
    if len(parts) >= 3:
        try:
            frame, slot, pon_port = int(parts[0]), int(parts[1]), int(parts[2])
            onus = ONU.query.filter_by(olt_id=olt_id, frame=frame, slot=slot, port=pon_port).order_by(ONU.onu_id).all()
        except (ValueError, IndexError):
            onus = []
    else:
        onus = []
    return jsonify({
        'success': True,
        'onus': [{
            'id': o.id, 'onu_id': o.onu_id, 'onu_id_str': f'{o.frame}/{o.slot}/{o.port}:{o.onu_id}',
            'serial_number': o.serial_number or '',
            'name': o.name or '', 'status': o.status or 'offline',
            'rx_power': o.rx_power, 'onu_rx_power': o.onu_rx_power,
            'onu_type': o.onu_type or '', 'distance': o.distance or '',
            'slot': o.slot, 'port': o.port, 'frame': o.frame,
        } for o in onus]
    })
