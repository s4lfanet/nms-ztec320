"""Auto-extracted from app.py monolith split (blueprint: olt_ports).
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

bp = Blueprint('olt_ports', __name__)

@bp.route('/api/olt/<int:olt_id>/pon-structure', methods=['GET'])
@login_required
def olt_pon_structure(olt_id):
    """Return card/PON structure for Move ONU modal dropdowns."""
    import re as _re
    ports = OLTPort.query.filter_by(olt_id=olt_id).all()
    structure = {}
    for p in ports:
        m = _re.match(r'(?:gpon|epon)-olt_(\d+)/(\d+)/(\d+)', p.port_name or '')
        if m:
            slot = int(m.group(2))
            port = int(m.group(3))
            structure.setdefault(slot, [])
            if port not in structure[slot]:
                structure[slot].append(port)
    result = [{'card': k, 'ports': sorted(v)} for k, v in sorted(structure.items())]
    # Fallback: derive from existing ONU records if no PON ports in DB
    if not result:
        onus = ONU.query.filter_by(olt_id=olt_id).all()
        for o in onus:
            structure.setdefault(o.slot, [])
            if o.port not in structure[o.slot]:
                structure[o.slot].append(o.port)
        result = [{'card': k, 'ports': sorted(v)} for k, v in sorted(structure.items())]
    return jsonify({'success': True, 'structure': result})


@bp.route('/api/olt/<int:olt_id>/onu-types', methods=['GET'])
@login_required
def get_olt_onu_types(olt_id):
    """Get ONU types — try CLI first (if enabled), fallback to DB. Cached 5 min."""
    from cache import cache_get, cache_set
    cache_key = f"olt:{olt_id}:onu-types"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'types': []})

    types = []
    # Only try Telnet if enabled with credentials
    if olt.cli_enabled and olt.cli_username:
        try:
            from snmp_collector import TelnetCollector, create_cli_collector
            tc = create_cli_collector(olt)
            types = tc.collect_onu_types()
        except Exception as e:
            logger.debug(f"CLI onu-types failed: {e}")

    if types:
        type_list = [{'type_name': t.get('type_name', ''), 'pon_type': t.get('pon_type', 'gpon')}
                     for t in types if t.get('type_name')]
        type_list.sort(key=lambda x: x['type_name'])
        result = {'success': True, 'types': type_list, 'source': 'cli'}
    else:
        # Try SNMP — collect distinct type names from registered ONUs
        try:
            from snmp_core import SNMPCollector
            sc = SNMPCollector(olt.ip_address, olt.snmp_community or 'public', olt.snmp_port or 161)
            snmp_types = sc.collect_onu_types_snmp()
            sc.close()
            if snmp_types:
                result = {'success': True, 'types': snmp_types, 'source': 'snmp'}
                cache_set(cache_key, result, ttl=300)
                return jsonify(result)
        except Exception as e:
            logger.debug(f"SNMP onu-types failed: {e}")

        # Fallback to DB
        db_types = ONUType.query.filter_by(olt_id=olt_id).order_by(ONUType.type_name).all()
        if db_types:
            type_list = [{'type_name': t.type_name, 'pon_type': t.pon_type or 'gpon'}
                         for t in db_types if t.type_name]
            result = {'success': True, 'types': type_list, 'source': 'database'}
        else:
            # No Telnet, no SNMP, no DB — seed default ZTE ONU types
            # ZTE C320: ZTEG-* = GPON, ZTE-* = EPON (per ZTE CLI manual)
            default_types = [
                # GPON types
                {'type_name': 'ZTEG-F601', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F602', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F607', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F609', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F612', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F620', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F621', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F622', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F623', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F625', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F626', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F627', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F640', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F641', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F642', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F643', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F645', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F647', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F660', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F667', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F668', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F669', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F670', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F672', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F821', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-F822', 'pon_type': 'gpon'},
                {'type_name': 'ZTEG-9806H', 'pon_type': 'gpon'},
                # EPON types
                {'type_name': 'ZTE-F401', 'pon_type': 'epon'},
                {'type_name': 'ZTE-F420', 'pon_type': 'epon'},
                {'type_name': 'ZTE-F425', 'pon_type': 'epon'},
                {'type_name': 'ZTE-F429', 'pon_type': 'epon'},
                {'type_name': 'ZTE-F430', 'pon_type': 'epon'},
                {'type_name': 'ZTE-F435', 'pon_type': 'epon'},
                {'type_name': 'ZTE-F500', 'pon_type': 'epon'},
                {'type_name': 'ZTE-F803', 'pon_type': 'epon'},
                {'type_name': 'ZTE-F820', 'pon_type': 'epon'},
                {'type_name': 'ZTE-F821', 'pon_type': 'epon'},
                {'type_name': 'ZTE-F822', 'pon_type': 'epon'},
                {'type_name': 'ZTE-9806', 'pon_type': 'epon'},
            ]
            result = {'success': True, 'types': default_types, 'source': 'defaults'}
    cache_set(cache_key, result, ttl=300)
    return jsonify(result)


@bp.route('/api/olt/<int:olt_id>/onu-types-full', methods=['GET'])
@login_required
def get_olt_onu_types_full(olt_id):
    """Get full ONU types from DB with all fields. Cached 60s."""
    from cache import cache_get, cache_set
    cache_key = f"olt:{olt_id}:onu-types-full"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)
    db_types = ONUType.query.filter_by(olt_id=olt_id).order_by(ONUType.type_name).all()
    result = {'success': True, 'onu_types': [{
        'id': t.id, 'type_name': t.type_name, 'pon_type': t.pon_type or 'gpon',
        'description': t.description or '', 'max_tcont': t.max_tcont or 0,
        'max_gem': t.max_gem or 0, 'max_switch': t.max_switch or 0,
        'max_flow': t.max_flow or 0, 'max_ip_host': t.max_ip_host or 0,
        'max_veip': t.max_veip or 0, 'interfaces': t.interfaces or '',
    } for t in db_types]}
    cache_set(cache_key, result, ttl=60)
    return jsonify(result)


@bp.route('/api/olt/<int:olt_id>/uplink/<int:uplink_id>/toggle', methods=['POST'])
@permission_required('settings_ip_olts')
def toggle_uplink_port(olt_id, uplink_id):
    """Enable or disable an uplink port"""
    olt = db.session.get(OLT, olt_id)
    uplink = db.session.get(OLTUplink, uplink_id)
    if not olt or not uplink:
        return jsonify({'success': False, 'message': 'Port not found'}), 404
    data = request.get_json() or {}
    action = data.get('action', 'enable')  # 'enable' or 'disable'
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    if action == 'enable':
        success, msg = tc.enable_port(uplink.port_name)
        if success:
            uplink.admin_status = 'up'
    else:
        success, msg = tc.disable_port(uplink.port_name)
        if success:
            uplink.admin_status = 'down'
    if success:
        db.session.commit()
        log_action('uplink_toggle', 'olt', target=olt.name, detail=f'{uplink.port_name} {action}d')
    return jsonify({'success': success, 'message': msg, 'admin_status': uplink.admin_status})


@bp.route('/api/olt/<int:olt_id>/uplink/<int:uplink_id>/description', methods=['POST'])
@permission_required('settings_ip_olts')
def set_uplink_description(olt_id, uplink_id):
    """Set uplink port description"""
    olt = db.session.get(OLT, olt_id)
    uplink = db.session.get(OLTUplink, uplink_id)
    if not olt or not uplink:
        return jsonify({'success': False, 'message': 'Port not found'}), 404
    data = request.get_json() or {}
    description = data.get('description', '')
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.set_port_description(uplink.port_name, description)
    if success:
        uplink.description = description
        db.session.commit()
    return jsonify({'success': success, 'message': msg})


@bp.route('/api/olt/<int:olt_id>/uplinks', methods=['GET'])
@login_required
def get_uplinks(olt_id):
    """Get stored uplink port data"""
    uplinks = OLTUplink.query.filter_by(olt_id=olt_id).order_by(OLTUplink.port_number).all()
    return jsonify({'success': True, 'uplinks': [{
        'id': u.id, 'port_number': u.port_number, 'port_name': u.port_name,
        'speed': u.speed, 'duplex': u.duplex, 'medium': u.medium,
        'admin_status': u.admin_status, 'oper_status': u.oper_status,
        'line_protocol': u.line_protocol, 'description': u.description,
        'negotiation': u.negotiation, 'flowcontrol': u.flowcontrol,
        'switchport_mode': u.switchport_mode, 'vlans_tagged': u.vlans_tagged,
        'input_rate': u.input_rate, 'output_rate': u.output_rate,
        'input_utilization': u.input_utilization, 'output_utilization': u.output_utilization,
        'input_packets': u.input_packets, 'output_packets': u.output_packets,
        'input_bytes': u.input_bytes, 'output_bytes': u.output_bytes,
        'crc_errors': u.crc_errors, 'dropped': u.dropped,
        'sfp_vendor': u.sfp_vendor or '', 'sfp_serial': u.sfp_serial or '',
        'sfp_type': u.sfp_type or '', 'sfp_wavelength': u.sfp_wavelength or '',
        'sfp_connector': u.sfp_connector or '',
        'sfp_distance': u.sfp_distance or '', 'sfp_rx_power': u.sfp_rx_power or '',
        'sfp_tx_power': u.sfp_tx_power or '',
        'sfp_temperature': u.sfp_temperature or '',
        'sfp_voltage': u.sfp_voltage or '',
        'sfp_bias_current': u.sfp_bias_current or '',
        'phy_attribute': u.phy_attribute or '', 'linktrap': u.linktrap or 'enable',
        'port_protect': u.port_protect or 'disable', 'uplink_isolate': u.uplink_isolate or 'disable',
        'port_type': u.port_type or '',
        'ip_vlan_id': u.ip_vlan_id or 0,
        'ip_address': u.ip_address or '', 'ip_mask': u.ip_mask or '', 'ip_gateway': u.ip_gateway or '',
    } for u in uplinks]})


@bp.route('/api/olt/<int:olt_id>/uplink/refresh', methods=['POST'])
@permission_required('settings_ip_olts')
def refresh_uplinks(olt_id):
    """Re-collect uplink port data from OLT"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    uplinks = tc.collect_uplinks()
    if not uplinks:
        return jsonify({'success': False, 'message': 'Failed to collect uplinks (CLI connection error)'}), 500
    # Save existing IP configs before delete (keyed by port_name)
    existing = OLTUplink.query.filter_by(olt_id=olt.id).all()
    saved_ips = {}
    for u in existing:
        if u.ip_address:
            saved_ips[u.port_name] = {
                'ip_vlan_id': u.ip_vlan_id,
                'ip_address': u.ip_address,
                'ip_mask': u.ip_mask,
                'ip_gateway': u.ip_gateway,
            }
    OLTUplink.query.filter_by(olt_id=olt.id).delete()
    for i, up in enumerate(uplinks):
        port_name = up.get('port_name', '')
        # Use collected IP, or restore from saved if collect didn't detect it
        ip_vlan_id = up.get('ip_vlan_id', 0)
        ip_address = up.get('ip_address', '')
        ip_mask = up.get('ip_mask', '')
        ip_gateway = up.get('ip_gateway', '')
        if not ip_address and port_name in saved_ips:
            ip_vlan_id = saved_ips[port_name]['ip_vlan_id']
            ip_address = saved_ips[port_name]['ip_address']
            ip_mask = saved_ips[port_name]['ip_mask']
            ip_gateway = saved_ips[port_name]['ip_gateway']
        uplink = OLTUplink(olt_id=olt.id, port_number=i+1,
                           port_name=port_name,
                           speed=up.get('speed', ''),
                           duplex=up.get('duplex', 'full'),
                           medium=up.get('medium', ''),
                           admin_status=up.get('admin_status', 'up'),
                           oper_status=up.get('oper_status', 'down'),
                           line_protocol=up.get('line_protocol', 'down'),
                           description=up.get('description', ''),
                           negotiation=up.get('negotiation', 'disable'),
                           flowcontrol=up.get('flowcontrol', 'disable'),
                           switchport_mode=up.get('switchport_mode', 'trunk'),
                           vlans_tagged=up.get('vlans_tagged', ''),
                           input_rate=up.get('input_rate', '0 Bps'),
                           output_rate=up.get('output_rate', '0 Bps'),
                           input_utilization=up.get('input_utilization', '0%'),
                           output_utilization=up.get('output_utilization', '0%'),
                           input_packets=up.get('input_packets', 0),
                           output_packets=up.get('output_packets', 0),
                           input_bytes=up.get('input_bytes', 0),
                           output_bytes=up.get('output_bytes', 0),
                           crc_errors=up.get('crc_errors', 0),
                           dropped=up.get('dropped', 0),
                           sfp_vendor=up.get('sfp_vendor', ''),
                           sfp_serial=up.get('sfp_serial', ''),
                           sfp_type=up.get('sfp_type', ''),
                           sfp_wavelength=up.get('sfp_wavelength', ''),
                           sfp_connector=up.get('sfp_connector', ''),
                           sfp_distance=up.get('sfp_distance', ''),
                           sfp_rx_power=up.get('sfp_rx_power', ''),
                           sfp_tx_power=up.get('sfp_tx_power', ''),
                           sfp_temperature=up.get('sfp_temperature', ''),
                           sfp_voltage=up.get('sfp_voltage', ''),
                           sfp_bias_current=up.get('sfp_bias_current', ''),
                           phy_attribute=up.get('phy_attribute', ''),
                           linktrap=up.get('linktrap', 'enable'),
                           port_protect=up.get('port_protect', 'disable'),
                           uplink_isolate=up.get('uplink_isolate', 'disable'),
                           port_type=up.get('port_type', ''),
                           ip_vlan_id=ip_vlan_id,
                           ip_address=ip_address,
                           ip_mask=ip_mask,
                           ip_gateway=ip_gateway)
        db.session.add(uplink)
    db.session.commit()
    return jsonify({'success': True, 'count': len(uplinks)})


@bp.route('/api/olt/<int:olt_id>/pon-stats/<int:slot>', methods=['GET'])
@login_required
def get_pon_port_stats(olt_id, slot):
    """Get per-port ONU stats for a PON card slot. Cached 30s."""
    from cache import cache_get, cache_set
    cache_key = f"olt:{olt_id}:pon-stats:{slot}"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    ports = tc.collect_pon_port_stats(slot)
    result = {'success': True, 'ports': ports}
    cache_set(cache_key, result, ttl=30)
    return jsonify(result)


@bp.route('/api/olt/<int:olt_id>/chassis', methods=['GET'])
@login_required
def get_olt_chassis(olt_id):
    """Return chassis slot/card/port data for rack diagram visualization. Cached 30s."""
    from cache import cache_get
    cached = cache_get(f"olt:{olt_id}:chassis")
    if cached is not None:
        return jsonify(cached)
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404

    cards = OLTCard.query.filter_by(olt_id=olt_id).all()
    uplinks = OLTUplink.query.filter_by(olt_id=olt_id).all()
    onus = ONU.query.filter_by(olt_id=olt_id).all()
    fans = Fan.query.filter_by(olt_id=olt_id).all()
    pon_ports_db = OLTPort.query.filter_by(olt_id=olt_id).all()

    # Build per-port stats from ONU table (key = "slot/port", port is 1-indexed on ZTE)
    port_stats = {}
    for onu in onus:
        key = f"{onu.slot}/{onu.port}"
        if key not in port_stats:
            port_stats[key] = {'total': 0, 'online': 0, 'los': 0, 'dyinggasp': 0, 'unregistered': 0, 'rxPowers': []}
        port_stats[key]['total'] += 1
        st = (onu.status or '').lower()
        if st == 'online':
            port_stats[key]['online'] += 1
        elif st == 'los':
            port_stats[key]['los'] += 1
        elif st == 'dyinggasp':
            port_stats[key]['dyinggasp'] += 1
        if onu.rx_power is not None:
            port_stats[key]['rxPowers'].append(onu.rx_power)

    # Build olt_pon_ports lookup: {slot_idx: {port_num: {...}}}
    # port_name format: "gpon-olt_1/1/2" → slot=1, port=2 (1-indexed)
    pon_by_slot = {}
    for pp in pon_ports_db:
        parts = (pp.port_name or '').replace('gpon-olt_', '').split('/')
        try:
            sidx_p = int(parts[1]) if len(parts) >= 3 else 0
            pidx_p = int(parts[2]) if len(parts) >= 3 else pp.port_number
        except (ValueError, IndexError):
            sidx_p, pidx_p = 0, pp.port_number
        if sidx_p not in pon_by_slot:
            pon_by_slot[sidx_p] = {}
        pon_by_slot[sidx_p][pidx_p] = {
            'id': pp.id,
            'port_name': pp.port_name,
            'name': pp.name or '',
            'description': pp.description or '',
            'admin_status': pp.admin_status or 'up',
            'onu_count': pp.onu_count,
            'onu_online': pp.onu_online,
        }

    # Group uplinks by slot index (port_name like "gei_1/3/4" or "xgei_1/3/1")
    # Also build full uplink lookup by port_name for the detail panel
    uplink_by_slot = {}
    uplink_detail = {}
    for ul in uplinks:
        name = ul.port_name or ''
        stripped = name.replace('xgei_1/', '').replace('gei_1/', '')
        parts = stripped.split('/')
        if len(parts) >= 2:
            try:
                slot_idx = int(parts[0])
                port_idx = int(parts[1])
            except ValueError:
                continue
            if slot_idx not in uplink_by_slot:
                uplink_by_slot[slot_idx] = []
            is_xge = name.startswith('xgei')
            entry = {
                'id': ul.id,
                'port': port_idx,
                'iface': name,
                'onuCount': 0,
                'onlineCount': 0,
                'hasOnus': False,
                'adminStatus': ul.admin_status,
                'linkStatus': ul.oper_status,
                'speed': ul.speed,
                'duplex': ul.duplex,
                'medium': ul.medium,
                'description': ul.description or '',
                'physicalType': 'xge' if is_xge else 'ge',
                'isEnabled': (ul.admin_status or '').lower() == 'up',
                'isLinked': (ul.oper_status or '').lower() == 'up',
                'vlansTagged': ul.vlans_tagged or '',
                'inputRate': ul.input_rate or '0 Bps',
                'outputRate': ul.output_rate or '0 Bps',
                'inputUtil': ul.input_utilization or '0%',
                'outputUtil': ul.output_utilization or '0%',
                'inputBytes': ul.input_bytes or 0,
                'outputBytes': ul.output_bytes or 0,
                'sfpVendor': ul.sfp_vendor or '',
                'sfpType': ul.sfp_type or '',
                'sfpRxPower': ul.sfp_rx_power or '',
                'sfpTxPower': ul.sfp_tx_power or '',
                'sfpTemp': ul.sfp_temperature or '',
                'sfpWavelength': ul.sfp_wavelength or '',
            }
            uplink_by_slot[slot_idx].append(entry)
            uplink_detail[name] = entry

    def slot_type_for(card_type):
        ct = (card_type or '').upper()
        if ct.startswith('GTG') or ct.startswith('GTC') or ct.startswith('ETG'):
            return 'service'
        # C320 uplink: SMXA, GICF, GISF  |  C300 uplink/control: SCXN, SCXM, SCXO, HUVQ
        if ct.startswith('SMXA') or ct in ('GICF', 'GISF', 'SMXA-A', 'SMXA-B') or ct.startswith('SCX') or ct.startswith('HUVQ'):
            return 'uplink'
        if ct.startswith('MCUD') or ct.startswith('PRWH'):
            return 'mcud'
        return 'service'

    chassis = []
    for card in cards:
        stype = slot_type_for(card.card_type)
        sidx = card.slot
        if stype == 'service':
            port_count = card.total_ports or 16
            is_epon_card = (card.card_type or '').upper().startswith('ETG')
            olt_pfx = 'epon-olt' if is_epon_card else 'gpon-olt'
            # Collect actual port numbers (1-indexed on ZTE C320)
            slot_pon = pon_by_slot.get(sidx, {})
            stat_ports = {int(k.split('/')[1]) for k in port_stats if k.split('/')[0] == str(sidx)}
            db_ports = sorted(p for p in set(list(slot_pon.keys()) + list(stat_ports)) if p != 0)
            # Always include all physical ports 1..port_count, merge with any extra DB ports
            all_port_nums = sorted(set(list(range(1, port_count + 1)) + db_ports))
            ports = []
            for p in all_port_nums:
                s = port_stats.get(f"{sidx}/{p}", {})
                rx = s.get('rxPowers', [])
                meta = slot_pon.get(p, {})
                ports.append({
                    'port': p,
                    'portId': meta.get('id'),
                    'portName': meta.get('port_name', f'{olt_pfx}_1/{sidx}/{p}'),
                    'name': meta.get('name', ''),
                    'description': meta.get('description', ''),
                    'adminStatus': meta.get('admin_status', 'up'),
                    'iface': None,
                    'onuCount': s.get('total', meta.get('onu_count', 0)),
                    'onlineCount': s.get('online', meta.get('onu_online', 0)),
                    'losCount': s.get('los', 0),
                    'dyingGaspCount': s.get('dyinggasp', 0),
                    'unregisteredCount': s.get('unregistered', 0),
                    'hasOnus': s.get('total', meta.get('onu_count', 0)) > 0,
                    'avgRxPower': round(sum(rx) / len(rx), 1) if rx else None,
                })
            chassis.append({
                'index': sidx,
                'label': str(sidx),
                'type': stype,
                'present': True,
                'cardType': card.card_type,
                'cardStatus': card.status,
                'portCount': len(ports),
                'ports': ports,
                'temperature': card.temperature,
                'cpuUsage': card.cpu_usage or 0,
                'memoryUsage': card.memory_usage or 0,
            })
        elif stype == 'uplink':
            ports = sorted(uplink_by_slot.get(sidx, []), key=lambda p: p['port'])
            chassis.append({
                'index': sidx,
                'label': str(sidx),
                'type': stype,
                'present': True,
                'cardType': card.card_type,
                'cardStatus': card.status,
                'portCount': len(ports),
                'ports': ports,
                'temperature': card.temperature,
                'cpuUsage': card.cpu_usage or 0,
                'memoryUsage': card.memory_usage or 0,
            })
        else:
            chassis.append({
                'index': sidx,
                'label': str(sidx),
                'type': stype,
                'present': True,
                'cardType': card.card_type,
                'cardStatus': card.status,
                'portCount': 0,
                'ports': [],
                'temperature': card.temperature,
                'cpuUsage': card.cpu_usage or 0,
                'memoryUsage': card.memory_usage or 0,
            })

    chassis.sort(key=lambda s: s['index'])

    # Add empty slot placeholders for ZTE C320 (4 physical slots) if not in DB
    # Slots 1-2 = service (GPON), Slots 3-4 = uplink (SMXA)
    existing_indices = {s['index'] for s in chassis}
    for i in range(1, 5):
        if i not in existing_indices:
            chassis.append({
                'index': i,
                'label': str(i),
                'type': 'uplink' if i >= 3 else 'service',
                'present': False,
                'cardType': '',
                'cardStatus': '',
                'portCount': 0,
                'ports': [],
                'temperature': None,
                'cpuUsage': 0,
                'memoryUsage': 0,
            })
    chassis.sort(key=lambda s: s['index'])

    fan_list = [{'number': f.fan_number, 'status': f.status, 'rpm': f.rpm} for f in fans]
    online_fans = sum(1 for f in fans if (f.status or '').lower() in ('online', 'normal', 'running'))

    result = {
        'success': True,
        'chassis': chassis,
        'fans': fan_list,
        'fanSummary': f"{online_fans}/{len(fans)}",
    }
    from cache import cache_set
    cache_set(f"olt:{olt_id}:chassis", result, ttl=30)
    return jsonify(result)


@bp.route('/api/olt/<int:olt_id>/rack', methods=['GET'])
@login_required
def get_olt_rack(olt_id):
    """Return normalized rack data for any supported OLT vendor.

    Dispatches to the appropriate vendor adapter via RackAdapterRegistry.
    Returns normalized RackData JSON that all frontend rack diagram components consume.
    """
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'supported': False, 'message': 'OLT not found'}), 404

    try:
        from olt_adapters import RackAdapterRegistry
        adapter = RackAdapterRegistry.get_adapter(olt)
        if not adapter:
            return jsonify({
                'supported': False,
                'brand': (olt.vendor or 'unknown').upper(),
                'model': olt.model,
                'message': f"Vendor '{olt.vendor}' belum didukung rack diagram",
            })

        refresh = request.args.get('refresh', 'false').lower() == 'true'
        rack_data = adapter.get_rack_data(refresh=refresh)
        return jsonify(rack_data.to_dict())

    except Exception as e:
        logger.error(f"Rack data for OLT {olt_id}: {e}")
        return jsonify({
            'supported': False,
            'brand': (olt.vendor or 'unknown').upper(),
            'model': olt.model,
            'message': str(e),
        }), 500


@bp.route('/api/olt/<int:olt_id>/pon-port/<int:port_id>/toggle', methods=['POST'])
@permission_required('settings_ip_olts')
def toggle_pon_port(olt_id, port_id):
    """Enable or disable a PON port"""
    olt = db.session.get(OLT, olt_id)
    port = db.session.get(OLTPort, port_id)
    if not olt or not port:
        return jsonify({'success': False, 'message': 'Port not found'}), 404
    data = request.get_json() or {}
    enable = data.get('action', 'enable') == 'enable'
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.toggle_pon_port(port.port_name, enable)
    if success:
        port.admin_status = 'up' if enable else 'down'
        db.session.commit()
    return jsonify({'success': success, 'message': msg, 'admin_status': port.admin_status})


@bp.route('/api/olt/<int:olt_id>/pon-port/<int:port_id>/edit', methods=['POST'])
@permission_required('settings_ip_olts')
def edit_pon_port(olt_id, port_id):
    """Edit PON port name and description"""
    olt = db.session.get(OLT, olt_id)
    port = db.session.get(OLTPort, port_id)
    if not olt or not port:
        return jsonify({'success': False, 'message': 'Port not found'}), 404
    data = request.get_json() or {}
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    if 'name' in data:
        success, msg = tc.set_pon_port_name(port.port_name, data['name'])
        if success:
            port.name = data['name']
    if 'description' in data:
        success, msg = tc.set_pon_port_description(port.port_name, data['description'])
        if success:
            port.description = data['description']
    db.session.commit()
    return jsonify({'success': True, 'message': 'PON port updated'})


@bp.route('/api/olt/<int:olt_id>/pon-port/<int:port_id>/optical', methods=['GET'])
@login_required
def get_pon_port_optical(olt_id, port_id):
    """Get optical module info for a single PON port via Telnet (live data)."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    port = db.session.get(OLTPort, port_id)
    if not port or port.olt_id != olt_id:
        return jsonify({'success': False, 'message': 'Port not found'}), 404

    sfp = {}
    try:
        from snmp_collector import TelnetCollector, create_cli_collector
        tc = create_cli_collector(olt)
        tn = tc._connect()
        if tn:
            try:
                opt_out = tc._send_command(tn, f'show interface optical-module-info {port.port_name}', timeout=10)
                if opt_out and '%Error' not in opt_out and 'Optical module' in opt_out:
                    import re as _re
                    def _clean_sfp(v):
                        v = _re.sub(r'\s*\([^)]*\)\s*', '', v).strip()
                        v = _re.sub(r'\(dbm\)', '', v, flags=_re.IGNORECASE).strip()
                        v = _re.sub(r'\(km\)', '', v, flags=_re.IGNORECASE).strip()
                        v = _re.sub(r'\(v\)', '', v, flags=_re.IGNORECASE).strip()
                        v = _re.sub(r'\(ma\)', '', v, flags=_re.IGNORECASE).strip()
                        v = _re.sub(r'\(c\)', '', v, flags=_re.IGNORECASE).strip()
                        v = _re.sub(r'\(nm\)', '', v, flags=_re.IGNORECASE).strip()
                        return v.strip()
                    for line in opt_out.split('\n'):
                        ls = line.strip()
                        if not ls:
                            continue
                        pairs = _re.findall(r'(\S+(?:-\S+)*)\s*:\s*(.+?)(?:\s{2,}|\s*$)', ls)
                        for key, val in pairs:
                            key = key.strip().lower()
                            val = _clean_sfp(val.strip())
                            if not val or val == 'N/A':
                                continue
                            if 'vendor-name' in key: sfp['vendor'] = val
                            elif 'vendor-pn' in key: sfp['type'] = val
                            elif 'vendor-sn' in key: sfp['serial'] = val
                            elif 'wavelength' in key: sfp['wavelength'] = val
                            elif 'connector' in key: sfp['connector'] = val
                            elif 'trans-distance' in key: sfp['distance'] = val
                            elif 'rxpower' in key and 'upper' not in key and 'lower' not in key: sfp['rx_power'] = val
                            elif 'txpower' in key and 'upper' not in key and 'lower' not in key: sfp['tx_power'] = val
                            elif 'txbias' in key: sfp['bias_current'] = val
                            elif 'temperature' in key and 'upper' not in key and 'lower' not in key: sfp['temperature'] = val
                            elif 'supply-vol' in key: sfp['voltage'] = val
            finally:
                tn.write('exit\n'); tn.close()
    except Exception as e:
        logger.debug(f'PON port optical {port.port_name}: {e}')

    return jsonify({'success': True, 'optical': sfp})


@bp.route('/api/olt/<int:olt_id>/pon-ports', methods=['GET'])
@login_required
def get_pon_ports(olt_id):
    """Get all PON ports for an OLT with optical module data via Telnet.
    Generates placeholder entries from OLTCard table for service cards
    (GTG/ETG) that have no OLTPort entries yet."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'ports': []})
    ports = OLTPort.query.filter_by(olt_id=olt_id).order_by(OLTPort.port_number).all()

    # Build placeholder ports from OLTCard table for service cards without OLTPort entries
    existing_names = {p.port_name for p in ports}
    cards = OLTCard.query.filter_by(olt_id=olt_id).all()
    placeholder_ports = []
    for card in cards:
        ct = (card.card_type or '').upper()
        if ct.startswith('GTG') or ct.startswith('GTC') or ct.startswith('ETG'):
            is_epon = ct.startswith('ETG')
            olt_pfx = 'epon-olt' if is_epon else 'gpon-olt'
            port_count = card.total_ports or 16
            for pnum in range(1, port_count + 1):
                pname = f'{olt_pfx}_1/{card.slot}/{pnum}'
                if pname not in existing_names:
                    placeholder_ports.append({
                        'id': None,
                        'port_number': pnum,
                        'port_name': pname,
                        'admin_status': 'up',
                        'name': '',
                        'description': '',
                        'linktrap': 'disable',
                        'onu_count': 0,
                        'onu_online': 0,
                        'onu_offline': 0,
                        'card_type': card.card_type,
                        'card_slot': card.slot,
                        'is_placeholder': True,
                    })

    # Sort placeholder ports by slot then port number
    placeholder_ports.sort(key=lambda p: (p.get('card_slot', 0), p['port_number']))

    # Collect optical module info via Telnet for all ports (DB + placeholders)
    optical_data = {}
    all_port_names = [p.port_name for p in ports] + [pp['port_name'] for pp in placeholder_ports]
    try:
        from snmp_collector import TelnetCollector, create_cli_collector
        tc = create_cli_collector(olt)
        tn = tc._connect()
        if tn:
            for pname in all_port_names:
                try:
                    opt_out = tc._send_command(tn, f'show interface optical-module-info {pname}', timeout=10)
                    if '%Error' not in opt_out and 'Optical module' in opt_out:
                        sfp = {}
                        import re as _re3
                        def _clean_sfp(v):
                            v = _re3.sub(r'\s*\([^)]*\)\s*', '', v).strip()
                            v = _re3.sub(r'\(dbm\)', '', v, flags=_re3.IGNORECASE).strip()
                            v = _re3.sub(r'\(km\)', '', v, flags=_re3.IGNORECASE).strip()
                            v = _re3.sub(r'\(v\)', '', v, flags=_re3.IGNORECASE).strip()
                            v = _re3.sub(r'\(ma\)', '', v, flags=_re3.IGNORECASE).strip()
                            v = _re3.sub(r'\(c\)', '', v, flags=_re3.IGNORECASE).strip()
                            v = _re3.sub(r'\(nm\)', '', v, flags=_re3.IGNORECASE).strip()
                            return v.strip()
                        for line in opt_out.split('\n'):
                            ls = line.strip()
                            if not ls: continue
                            pairs = _re3.findall(r'(\S+(?:-\S+)*)\s*:\s*(.+?)(?:\s{2,}|\s*$)', ls)
                            for key, val in pairs:
                                key = key.strip().lower()
                                val = _clean_sfp(val.strip())
                                if not val or val == 'N/A': continue
                                if 'vendor-name' in key: sfp['vendor'] = val
                                elif 'vendor-pn' in key: sfp['type'] = val
                                elif 'vendor-sn' in key: sfp['serial'] = val
                                elif 'wavelength' in key: sfp['wavelength'] = val
                                elif 'connector' in key: sfp['connector'] = val
                                elif 'trans-distance' in key: sfp['distance'] = val
                                elif 'rxpower' in key and 'upper' not in key and 'lower' not in key: sfp['rx_power'] = val
                                elif 'txpower' in key and 'upper' not in key and 'lower' not in key: sfp['tx_power'] = val
                                elif 'txbias' in key: sfp['bias_current'] = val
                                elif 'temperature' in key and 'upper' not in key and 'lower' not in key: sfp['temperature'] = val
                                elif 'supply-vol' in key: sfp['voltage'] = val
                        if sfp:
                            optical_data[pname] = sfp
                except Exception as e:
                    logger.debug(f'PON optical {pname}: {e}')
            if not placeholder_ports:
                tn.write('exit\n'); tn.close()
                tn = None
    except Exception as e:
        logger.debug(f'PON optical Telnet: {e}')
        tn = None

    # Also collect ONU state counts for placeholder ports via Telnet
    placeholder_onu_counts = {}
    if placeholder_ports:
        try:
            if not tn:
                tn = tc._connect()
            if tn:
                for pp in placeholder_ports:
                    pname = pp['port_name']
                    is_epon = pname.startswith('epon-olt')
                    onu_cmd = 'show epon onu state' if is_epon else 'show gpon onu state'
                    try:
                        out = tc._send_command(tn, f'{onu_cmd} {pname}', timeout=10)
                        total = online = offline = 0
                        for line in out.split('\n'):
                            line = line.strip()
                            if not line or '---' in line or line.startswith('OnuIndex') or line.startswith('ONU'): continue
                            parts = line.split()
                            if len(parts) < 4 or '/' not in parts[0] or ':' not in parts[0]: continue
                            if is_epon:
                                import re as _re4
                                if not _re4.match(r'^epon-onu_\d+/\d+/\d+:\d+$', parts[0]): continue
                                total += 1
                                status_word = parts[1].lower() if len(parts) > 1 else ''
                                if 'online' in status_word: online += 1
                                else: offline += 1
                            else:
                                import re as _re4
                                if not _re4.match(r'^\d+/\d+/\d+:\d+$', parts[0]): continue
                                total += 1
                                phase = parts[3].lower() if len(parts) > 3 else ''
                                if 'working' in phase: online += 1
                                else: offline += 1
                        placeholder_onu_counts[pname] = {'onu_count': total, 'onu_online': online, 'onu_offline': offline}
                    except Exception as e:
                        logger.debug(f'Placeholder ONU state {pname}: {e}')
                try: tn.write('exit\n'); tn.close()
                except: pass
        except Exception as e:
            logger.debug(f'Placeholder ONU state Telnet: {e}')

    # Merge ONU counts into placeholder ports
    for pp in placeholder_ports:
        counts = placeholder_onu_counts.get(pp['port_name'])
        if counts:
            pp['onu_count'] = counts['onu_count']
            pp['onu_online'] = counts['onu_online']
            pp['onu_offline'] = counts['onu_offline']

    return jsonify({
        'success': True,
        'ports': [{
            'id': p.id, 'port_number': p.port_number, 'port_name': p.port_name,
            'admin_status': p.admin_status, 'name': p.name, 'description': p.description,
            'linktrap': p.linktrap, 'onu_count': p.onu_count,
            'onu_online': p.onu_online, 'onu_offline': p.onu_offline,
            'card_type': '',
            'is_placeholder': False,
            **optical_data.get(p.port_name, {}),
        } for p in ports] + [
            {**pp, **optical_data.get(pp['port_name'], {})}
            for pp in placeholder_ports
        ]
    })


@bp.route('/api/olt/<int:olt_id>/uplink/<int:uplink_id>/configure', methods=['POST'])
@permission_required('settings_ip_olts')
def configure_uplink_port(olt_id, uplink_id):
    """Apply port configuration changes (speed, duplex, negotiation, flowcontrol, description)"""
    olt = db.session.get(OLT, olt_id)
    uplink = db.session.get(OLTUplink, uplink_id)
    if not olt or not uplink:
        return jsonify({'success': False, 'message': 'Port not found'}), 404
    data = request.get_json() or {}
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.configure_port(
        uplink.port_name,
        speed=data.get('speed'),
        duplex=data.get('duplex'),
        negotiation=data.get('negotiation'),
        flowcontrol=data.get('flowcontrol'),
        description=data.get('description'),
    )
    if success:
        if 'speed' in data and data['speed']:
            spd = data['speed']
            if spd == '10000': uplink.speed = '10G'
            elif spd == '1000': uplink.speed = '1G'
            elif spd == '100': uplink.speed = '100M'
            else: uplink.speed = spd
        if 'duplex' in data and data['duplex']:
            uplink.duplex = data['duplex']
        if 'negotiation' in data and data['negotiation']:
            uplink.negotiation = data['negotiation']
        if 'flowcontrol' in data and data['flowcontrol']:
            uplink.flowcontrol = data['flowcontrol']
        if 'description' in data:
            uplink.description = data.get('description', '')
        db.session.commit()
    return jsonify({'success': success, 'message': msg})


@bp.route('/api/olt/<int:olt_id>/uplink/<int:uplink_id>/ip', methods=['POST'])
@permission_required('settings_ip_olts')
def set_uplink_ip(olt_id, uplink_id):
    """Set or remove IP address on a VLAN interface (SVI) tagged on an uplink port."""
    olt = db.session.get(OLT, olt_id)
    uplink = db.session.get(OLTUplink, uplink_id)
    if not olt or not uplink:
        return jsonify({'success': False, 'message': 'Port not found'}), 404
    data = request.get_json() or {}
    vlan_id = data.get('ip_vlan_id', 0)
    ip_address = data.get('ip_address', '').strip()
    ip_mask = data.get('ip_mask', '').strip()
    gateway = data.get('ip_gateway', '').strip() or None
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.set_uplink_ip(uplink.port_name, vlan_id, ip_address, ip_mask, gateway)
    if success:
        uplink.ip_vlan_id = vlan_id if ip_address else 0
        uplink.ip_address = ip_address
        uplink.ip_mask = ip_mask
        uplink.ip_gateway = gateway or ''
        db.session.commit()
    return jsonify({'success': success, 'message': msg})


@bp.route('/api/olt/<int:olt_id>/vlans', methods=['GET'])
@login_required
def get_olt_vlans(olt_id):
    """Get VLAN list — try Telnet first, fallback to SNMP, then DB. Cached 5 min."""
    from cache import cache_get, cache_set
    cache_key = f"olt:{olt_id}:vlans"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'vlans': []})

    vlans = []
    source = 'none'

    # Try Telnet first (if enabled)
    if olt.cli_enabled and olt.cli_username:
        try:
            from snmp_collector import TelnetCollector, create_cli_collector
            tc = create_cli_collector(olt)
            vlans = tc.collect_vlans()
            source = 'telnet'
        except Exception as e:
            logger.debug(f"Telnet vlans failed: {e}")

    # Fallback to SNMP
    if not vlans and olt.snmp_enabled:
        try:
            from snmp_core import SNMPCollector
            collector = SNMPCollector(olt.ip_address, olt.snmp_community, olt.snmp_port)
            snmp_vlans = collector.collect_vlans_snmp()
            collector.close()
            if snmp_vlans:
                vlans = snmp_vlans
                source = 'snmp'
        except Exception as e:
            logger.debug(f"SNMP vlans failed: {e}")

    # Fallback to DB
    if not vlans:
        db_vlans = ONUVlan.query.filter_by(olt_id=olt_id).order_by(ONUVlan.vlan_id).all()
        vlans = [{'vlan_id': v.vlan_id, 'name': v.vlan_name or ''} for v in db_vlans]
        source = 'database'

    result = {'success': True, 'vlans': vlans, 'source': source}
    cache_set(cache_key, result, ttl=300)
    return jsonify(result)


@bp.route('/api/olt/<int:olt_id>/speed-profiles', methods=['GET'])
@login_required
def get_olt_speed_profiles(olt_id):
    """Get TCONT, Traffic, and WAN IP profile names — DB first, SNMP fallback. Cached 60s."""
    from cache import cache_get, cache_set
    cache_key = f"olt:{olt_id}:speed-profiles"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)
    tcont = [p.name for p in SpeedProfile.query.filter_by(olt_id=olt_id, profile_type='tcont').order_by(SpeedProfile.name).all()]
    traffic = [p.name for p in SpeedProfile.query.filter_by(olt_id=olt_id, profile_type='traffic').order_by(SpeedProfile.name).all()]
    wan_ip = []
    for p in WanIpProfile.query.filter_by(olt_id=olt_id).order_by(WanIpProfile.name).all():
        cvlan = ''
        if p.dns1 and p.dns1.startswith('cvlan:'):
            cvlan = p.dns1.replace('cvlan:', '')
        wan_ip.append({'name': p.name, 'ip_address': p.ip_address or '', 'cvlan': cvlan})

    # If DB is empty, try SNMP
    source = 'database'
    if not tcont or not traffic:
        olt = db.session.get(OLT, olt_id)
        if olt and olt.snmp_enabled:
            try:
                from snmp_core import SNMPCollector
                collector = SNMPCollector(olt.ip_address, olt.snmp_community, olt.snmp_port)
                if not tcont:
                    snmp_tcont = collector.collect_tcont_profiles_snmp()
                    if snmp_tcont:
                        tcont = [p['name'] for p in snmp_tcont]
                        source = 'snmp'
                if not traffic:
                    snmp_traffic = collector.collect_traffic_profiles_snmp()
                    if snmp_traffic:
                        traffic = [p['name'] for p in snmp_traffic]
                        source = 'snmp' if source == 'snmp' else source
                collector.close()
            except Exception as e:
                logger.debug(f"SNMP speed-profiles fallback failed: {e}")

    result = {'success': True, 'tcont': tcont, 'traffic': traffic, 'wan_ip_profiles': wan_ip, 'source': source}
    cache_set(cache_key, result, ttl=60)
    return jsonify(result)


@bp.route('/api/olt/<int:olt_id>/speed-profiles-full', methods=['GET'])
@login_required
def get_olt_speed_profiles_full(olt_id):
    """Get full speed profiles from DB with all fields. Cached 60s.
    Also auto-syncs EPON SLA profiles from OLT if CLI is enabled."""
    # --- AUTO-SYNC EPON SLA PROFILES ---
    olt = db.session.get(OLT, olt_id) if olt_id else None
    if olt and olt.cli_enabled and olt.cli_username:
        try:
            from snmp_collector import create_cli_collector
            tc = create_cli_collector(olt)
            tn = tc._connect()
            if tn:
                tc._send_command(tn, 'configure terminal', timeout=5)
                tc._send_command(tn, 'epon', timeout=5)
                out = tc._send_command(tn, 'show onu-profile sla', timeout=10)
                tc._send_command(tn, 'end', timeout=5)
                tn.close()

                import re
                if 'Profile name' in out:
                    SpeedProfile.query.filter_by(olt_id=olt_id, profile_type='sla').delete()

                    blocks = re.split(r'Profile name:\s*', out, flags=re.IGNORECASE)
                    for block in blocks[1:]:
                        lines = block.strip().split('\n')
                        if not lines: continue

                        name = lines[0].strip()
                        up_cir = '0'; up_pir = '0'
                        down_cir = '0'; down_pir = '0'

                        for line in lines[1:]:
                            line_lower = line.lower()
                            if 'upstream' in line_lower:
                                cm = re.search(r'cir:\s*(\d+)', line_lower)
                                pm = re.search(r'pir:\s*(\d+)', line_lower)
                                if cm: up_cir = cm.group(1)
                                if pm: up_pir = pm.group(1)
                            elif 'downstream' in line_lower:
                                cm = re.search(r'cir:\s*(\d+)', line_lower)
                                pm = re.search(r'pir:\s*(\d+)', line_lower)
                                if cm: down_cir = cm.group(1)
                                if pm: down_pir = pm.group(1)

                        db.session.add(SpeedProfile(
                            olt_id=olt_id, profile_type='sla', name=name,
                            sir=up_cir, pir=up_pir, assured_bandwidth=down_cir, max_bandwidth=down_pir
                        ))
                    db.session.commit()
        except Exception as e:
            db.session.rollback()
    # --- END: AUTO-SYNC EPON SLA PROFILES ---

    from cache import cache_get, cache_set
    cache_key = f"olt:{olt_id}:speed-profiles-full"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)
    profiles = SpeedProfile.query.filter_by(olt_id=olt_id).order_by(SpeedProfile.profile_type, SpeedProfile.name).all()
    result = {'success': True, 'speed_profiles': [{
        'id': p.id, 'profile_type': p.profile_type, 'name': p.name,
        'type_val': p.type_val or '', 'fixed_bandwidth': p.fixed_bandwidth or '0',
        'assured_bandwidth': p.assured_bandwidth or '0', 'max_bandwidth': p.max_bandwidth or '0',
        'sir': p.sir or '', 'pir': p.pir or '',
    } for p in profiles]}
    cache_set(cache_key, result, ttl=60)
    return jsonify(result)


@bp.route('/api/olt/<int:olt_id>/uplink/<int:uplink_id>/vlan', methods=['POST'])
@permission_required('settings_ip_olts')
def set_uplink_vlan(olt_id, uplink_id):
    """Set VLAN trunk configuration on a port"""
    olt = db.session.get(OLT, olt_id)
    uplink = db.session.get(OLTUplink, uplink_id)
    if not olt or not uplink:
        return jsonify({'success': False, 'message': 'Port not found'}), 404
    data = request.get_json() or {}
    vlan_ids = data.get('vlan_ids', [])
    mode = data.get('mode', 'trunk')
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.set_vlan_trunk(uplink.port_name, vlan_ids, mode)
    if success:
        uplink.switchport_mode = mode
        uplink.vlans_tagged = ','.join(vlan_ids)
        db.session.commit()
    return jsonify({'success': success, 'message': msg})


@bp.route('/api/olt/<int:olt_id>/uplink/<int:uplink_id>/vlan/remove', methods=['POST'])
@permission_required('settings_ip_olts')
def remove_uplink_vlan(olt_id, uplink_id):
    """Remove specific VLAN IDs from a port trunk"""
    olt = db.session.get(OLT, olt_id)
    uplink = db.session.get(OLTUplink, uplink_id)
    if not olt or not uplink:
        return jsonify({'success': False, 'message': 'Port not found'}), 404
    data = request.get_json() or {}
    vlan_ids = data.get('vlan_ids', [])
    if not vlan_ids:
        return jsonify({'success': False, 'message': 'No VLAN IDs specified'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.remove_vlan_from_port(uplink.port_name, vlan_ids)
    if success:
        # Update local DB: remove those VLANs from vlans_tagged
        current = uplink.vlans_tagged.split(',') if uplink.vlans_tagged else []
        remaining = [v.strip() for v in current if v.strip() and v.strip() not in vlan_ids]
        uplink.vlans_tagged = ','.join(remaining)
        db.session.commit()
    return jsonify({'success': success, 'message': msg})


@bp.route('/api/olt/<int:olt_id>/vlan/create', methods=['POST'])
@permission_required('settings_ip_olts')
def create_vlan(olt_id):
    """Create a new VLAN"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    data = request.get_json() or {}
    vlan_id = data.get('vlan_id')
    vlan_name = data.get('name', '')
    if not vlan_id:
        return jsonify({'success': False, 'message': 'VLAN ID is required'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.create_vlan(int(vlan_id), vlan_name)
    if success:
        existing = ONUVlan.query.filter_by(olt_id=olt_id, vlan_id=int(vlan_id)).first()
        if not existing:
            vlan = ONUVlan(olt_id=olt_id, vlan_id=int(vlan_id), vlan_name=vlan_name or f'VLAN{vlan_id}', vlan_type='L2')
            db.session.add(vlan)
            db.session.commit()
    if success:
        log_action('vlan_create', 'olt', target=olt.name, detail=f'VLAN {vlan_id} ({vlan_name})')
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:vlans")
            cache_clear(f"olt:{olt_id}:vlans-db")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


@bp.route('/api/olt/<int:olt_id>/vlan/<int:vlan_id>/rename', methods=['POST'])
@permission_required('settings_ip_olts')
def rename_vlan(olt_id, vlan_id):
    """Rename a VLAN"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    data = request.get_json() or {}
    new_name = data.get('name', '')
    if not new_name:
        return jsonify({'success': False, 'message': 'Name is required'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.rename_vlan(vlan_id, new_name)
    if success:
        vlan = ONUVlan.query.filter_by(olt_id=olt_id, vlan_id=vlan_id).first()
        if vlan:
            vlan.vlan_name = new_name
            db.session.commit()
        log_action('vlan_rename', 'olt', target=olt.name, detail=f'VLAN {vlan_id} -> {new_name}')
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:vlans")
            cache_clear(f"olt:{olt_id}:vlans-db")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


@bp.route('/api/olt/<int:olt_id>/vlan/<int:vlan_id>/delete', methods=['POST'])
@permission_required('settings_ip_olts')
def delete_vlan(olt_id, vlan_id):
    """Delete a VLAN"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.delete_vlan(vlan_id)
    if success:
        vlan = ONUVlan.query.filter_by(olt_id=olt_id, vlan_id=vlan_id).first()
        if vlan:
            db.session.delete(vlan)
            db.session.commit()
        log_action('vlan_delete', 'olt', target=olt.name, detail=f'VLAN {vlan_id}')
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:vlans")
            cache_clear(f"olt:{olt_id}:vlans-db")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


@bp.route('/api/olt/<int:olt_id>/onu-type/add', methods=['POST'])
@permission_required('settings_ip_olts')
def add_onu_type(olt_id):
    """Add a new ONU type"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    data = request.get_json() or {}
    type_name = data.get('type_name', '')
    if not type_name:
        return jsonify({'success': False, 'message': 'Type name is required'})
    interfaces = data.get('interfaces', [])
    if isinstance(interfaces, str):
        interfaces = [i.strip() for i in interfaces.split(',') if i.strip()]

    # Try Telnet push to OLT if enabled, but always save to DB
    telnet_msg = ''
    if olt.cli_enabled and olt.cli_username:
        try:
            from snmp_collector import TelnetCollector, create_cli_collector
            tc = create_cli_collector(olt)
            telnet_ok, telnet_msg = tc.add_onu_type(
                type_name,
                pon_type=data.get('pon_type', 'gpon'),
                description=data.get('description', ''),
                max_tcont=int(data.get('max_tcont', 8) or 8),
                max_gem=int(data.get('max_gem', 32) or 32),
                max_switch=int(data.get('max_switch', 8) or 8),
                max_flow=int(data.get('max_flow', 32) or 32),
                max_ip_host=int(data.get('max_ip_host', 5) or 5),
                interfaces=interfaces,
            )
        except Exception as e:
            telnet_ok = False
            telnet_msg = str(e)
    else:
        telnet_ok = True  # No Telnet — skip, not an error

    # Always save to DB
    existing = ONUType.query.filter_by(olt_id=olt_id, type_name=type_name).first()
    if existing:
        return jsonify({'success': False, 'message': f'ONU type {type_name} already exists'})

    otype = ONUType(
        olt_id=olt_id, type_name=type_name,
        pon_type=data.get('pon_type', 'gpon'),
        description=data.get('description', ''),
        max_tcont=int(data.get('max_tcont', 8) or 8),
        max_gem=int(data.get('max_gem', 32) or 32),
        max_switch=int(data.get('max_switch', 8) or 8),
        max_flow=int(data.get('max_flow', 32) or 32),
        max_ip_host=int(data.get('max_ip_host', 5) or 5),
        max_veip=int(data.get('max_veip', 0) or 0),
        interfaces=','.join(interfaces) if interfaces else '',
    )
    db.session.add(otype)
    db.session.commit()
    log_action('onu_type_create', 'olt', target=olt.name, detail=f'Type {type_name}')
    try:
        from cache import cache_clear
        cache_clear(f"olt:{olt_id}:onu-types")
        cache_clear(f"olt:{olt_id}:onu-types-full")
    except Exception:
        pass

    msg = 'ONU type saved'
    if not telnet_ok:
        msg += f' (saved to DB, Telnet push failed: {telnet_msg[:100]})'
    elif olt.cli_enabled:
        msg = 'ONU type saved and pushed to OLT'
    return jsonify({'success': True, 'message': msg})


@bp.route('/api/olt/<int:olt_id>/onu-type/<int:type_id>/delete', methods=['POST'])
@permission_required('settings_ip_olts')
def delete_onu_type(olt_id, type_id):
    """Delete an ONU type"""
    olt = db.session.get(OLT, olt_id)
    otype = db.session.get(ONUType, type_id)
    if not olt or not otype:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.delete_onu_type(otype.type_name)
    if success:
        db.session.delete(otype)
        db.session.commit()
        log_action('onu_type_delete', 'olt', target=olt.name, detail=f'Type {otype.type_name}')
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:onu-types")
            cache_clear(f"olt:{olt_id}:onu-types-full")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


@bp.route('/api/olt/<int:olt_id>/tcont/add', methods=['POST'])
@permission_required('settings_ip_olts')
def add_tcont_profile(olt_id):
    """Add a new TCONT profile"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'Profile name is required'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.create_tcont_profile(
        name,
        tcont_type=data.get('type_val', '4'),
        max_bw=data.get('max_bandwidth', '0'),
    )
    if success:
        profile = SpeedProfile(
            olt_id=olt_id, profile_type='tcont', name=name,
            type_val=data.get('type_val', '4'),
            fixed_bandwidth=data.get('fixed_bandwidth', '0'),
            assured_bandwidth=data.get('assured_bandwidth', '0'),
            max_bandwidth=data.get('max_bandwidth', '0'),
        )
        db.session.add(profile)
        db.session.commit()
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:speed-profiles")
            cache_clear(f"olt:{olt_id}:speed-profiles-full")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


@bp.route('/api/olt/<int:olt_id>/tcont/<int:profile_id>/delete', methods=['POST'])
@permission_required('settings_ip_olts')
def delete_tcont_profile(olt_id, profile_id):
    """Delete a TCONT profile"""
    olt = db.session.get(OLT, olt_id)
    profile = db.session.get(SpeedProfile, profile_id)
    if not olt or not profile:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.delete_tcont_profile(profile.name)
    if success:
        db.session.delete(profile)
        db.session.commit()
        log_action('tcont_delete', 'olt', target=olt.name, detail=f'Profile {profile.name}')
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:speed-profiles")
            cache_clear(f"olt:{olt_id}:speed-profiles-full")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


@bp.route('/api/olt/<int:olt_id>/wan-ip/add', methods=['POST'])
@permission_required('settings_ip_olts')
def add_wan_ip_profile(olt_id):
    """Add a new WAN IP profile"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'Profile name is required'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.create_wan_ip_profile(
        name,
        ip_address=data.get('ip_address', ''),
        netmask=data.get('netmask', ''),
        gateway=data.get('gateway', ''),
        dns1=data.get('dns1', ''),
        dns2=data.get('dns2', ''),
    )
    if success:
        profile = WanIpProfile(
            olt_id=olt_id, name=name,
            ip_address=data.get('ip_address', ''),
            netmask=data.get('netmask', ''),
            gateway=data.get('gateway', ''),
            dns1=data.get('dns1', ''),
            dns2=data.get('dns2', ''),
        )
        db.session.add(profile)
        db.session.commit()
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:speed-profiles")
            cache_clear(f"olt:{olt_id}:wan-ip-profiles")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


@bp.route('/api/olt/<int:olt_id>/wan-ip/<int:profile_id>/delete', methods=['POST'])
@permission_required('settings_ip_olts')
def delete_wan_ip_profile(olt_id, profile_id):
    """Delete a WAN IP profile"""
    olt = db.session.get(OLT, olt_id)
    profile = db.session.get(WanIpProfile, profile_id)
    if not olt or not profile:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.delete_wan_ip_profile(profile.name)
    if success:
        db.session.delete(profile)
        db.session.commit()
        log_action('wan_ip_delete', 'olt', target=olt.name, detail=f'Profile {profile.name}')
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:speed-profiles")
            cache_clear(f"olt:{olt_id}:wan-ip-profiles")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


@bp.route('/api/olt/<int:olt_id>/sla/add', methods=['POST'])
@permission_required('settings_ip_olts')
def add_sla_profile(olt_id):
    """Add a new EPON SLA profile"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'Profile name is required'})

    up_cir = data.get('up_cir', '0')
    up_pir = data.get('up_pir', '1000000')
    down_cir = data.get('down_cir', '0')
    down_pir = data.get('down_pir', '1000000')

    from snmp_collector import create_cli_collector
    tc = create_cli_collector(olt)

    try:
        tn = tc._connect()
        if not tn:
            return jsonify({'success': False, 'message': 'CLI connection failed'})

        tc._send_command(tn, 'configure terminal', timeout=10)
        tc._send_command(tn, 'epon', timeout=10)
        tc._send_command(tn, f'onu-profile sla {name}', timeout=10)

        tc._send_command(tn, f'upstream pir {up_pir} cir {up_cir}', timeout=10)
        tc._send_command(tn, f'downstream pir {down_pir} cir {down_cir}', timeout=10)

        out = tc._send_command(tn, 'end', timeout=10)
        tn.close()

        if '%Error' in out or 'Invalid' in out or 'Incomplete' in out:
            return jsonify({'success': False, 'message': f'Failed to create SLA profile: {out.strip()}'})

        profile = SpeedProfile(
            olt_id=olt_id,
            profile_type='sla',
            name=name,
            sir=str(up_cir),
            pir=str(up_pir),
            assured_bandwidth=str(down_cir),
            max_bandwidth=str(down_pir)
        )
        db.session.add(profile)
        db.session.commit()

        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:speed-profiles")
            cache_clear(f"olt:{olt_id}:speed-profiles-full")
        except Exception:
            pass

        return jsonify({'success': True, 'message': f'EPON SLA Profile {name} created successfully'})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/olt/<int:olt_id>/sla/<int:profile_id>/delete', methods=['POST'])
@permission_required('settings_ip_olts')
def delete_sla_profile(olt_id, profile_id):
    """Delete an EPON SLA profile"""
    olt = db.session.get(OLT, olt_id)
    profile = db.session.get(SpeedProfile, profile_id)
    if not olt or not profile:
        return jsonify({'success': False, 'message': 'Not found'}), 404

    from snmp_collector import create_cli_collector
    tc = create_cli_collector(olt)

    try:
        tn = tc._connect()
        if not tn:
            return jsonify({'success': False, 'message': 'CLI connection failed'})

        tc._send_command(tn, 'configure terminal', timeout=10)
        tc._send_command(tn, 'epon', timeout=10)
        out = tc._send_command(tn, f'no onu-profile sla {profile.name}', timeout=10)
        tc._send_command(tn, 'end', timeout=10)
        tn.close()

        if '%Error' in out or 'Invalid' in out or 'used' in out.lower():
            return jsonify({'success': False, 'message': f'Failed to delete SLA profile (it might be in use): {out.strip()}'})

        db.session.delete(profile)
        db.session.commit()

        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:speed-profiles")
            cache_clear(f"olt:{olt_id}:speed-profiles-full")
        except Exception:
            pass

        return jsonify({'success': True, 'message': f'EPON SLA Profile {profile.name} deleted successfully'})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/olt/<int:olt_id>/vlans/db', methods=['GET'])
@login_required
def get_olt_vlans_db(olt_id):
    """Get VLANs from DB. Cached 60s."""
    from cache import cache_get, cache_set
    cache_key = f"olt:{olt_id}:vlans-db"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)
    vlans = ONUVlan.query.filter_by(olt_id=olt_id).order_by(ONUVlan.vlan_id).all()
    result = {'success': True, 'vlans': [{
        'vlan_id': v.vlan_id, 'vlan_name': v.vlan_name or '',
        'vlan_type': v.vlan_type or 'L2', 'onu_profiles': v.onu_profiles or '',
    } for v in vlans]}
    cache_set(cache_key, result, ttl=60)
    return jsonify(result)
