"""Auto-extracted from app.py monolith split (blueprint: onu).
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

bp = Blueprint('onu', __name__)

@bp.route('/api/onu/lookup/<int:olt_id>/<int:frame>/<int:port>/<int:onu_num>')
@login_required
def onu_lookup(olt_id, frame, port, onu_num):
    """Look up ONU DB id by R-Config URL: /gpon/{olt_id}/{frame}/{pon_port}/{onu_id}
    Matches R-Config format: gpon_olt-{frame}/{slot}/{port}:{onu_id}
    URL maps: 3rd segment = PON port, 4th segment = ONU ID (1-128)"""
    onu = ONU.query.filter_by(olt_id=olt_id, frame=frame, port=port, onu_id=onu_num).first()
    if not onu:
        # Fallback: try slot=port for backwards compatibility
        onu = ONU.query.filter_by(olt_id=olt_id, frame=frame, slot=port, onu_id=onu_num).first()
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    return jsonify({'success': True, 'id': onu.id})


@bp.route('/api/onu/<int:onu_id>/detail')
@login_required
def api_onu_detail(onu_id):
    """Return ONU data from DB only — instant response, no CLI."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt_map = {o.id: o.name for o in OLT.query.all()}
    olt_vendor_map = {o.id: (o.vendor or '').lower() for o in OLT.query.all()}
    return jsonify({
        'onu': {
            'id': onu.id, 'olt_id': onu.olt_id, 'olt_name': olt_map.get(onu.olt_id, ''),
            'olt_vendor': olt_vendor_map.get(onu.olt_id, ''),
            'name': onu.name, 'description': onu.description, 'pppoe': onu.pppoe,
            'onu_id_str': onu.onu_id_str, 'status': onu.status,
            'rx_power': onu.rx_power, 'onu_rx_power': onu.onu_rx_power, 'tx_power': onu.tx_power,
            'serial_number': onu.serial_number, 'actual_type': onu.actual_type,
            'onu_type': onu.onu_type,
            'frame': onu.frame, 'slot': onu.slot, 'port': onu.port, 'onu_id': onu.onu_id,
            'card': onu.card or '',
            'distance': onu.distance,
            'latitude': onu.latitude,
            'longitude': onu.longitude,
            'last_seen': utc_iso(onu.last_seen),
            'last_online': utc_iso(onu.last_online),
            'last_offline': utc_iso(onu.last_offline),
            'wifi_config': onu.wifi_config or '',
        },
        'live_detail': None,
        'history': [],
        'wan_services_json': '{}',
    })


@bp.route('/api/onu/<int:onu_id>/live-detail')
@login_required
def api_onu_live_detail(onu_id):
    """Fetch live ONU data from OLT via CLI — SSH or Telnet (ZTE only)."""
    import json as _json
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    live_detail = None
    history = []

    if olt and olt.cli_enabled and olt.cli_username:
        # ZTE: CLI-based live detail (SSH or Telnet)
        from snmp_collector import TelnetCollector, create_cli_collector
        try:
            tc = create_cli_collector(olt)
            is_epon = (onu.card or '').lower() == 'epon'
            live_detail = tc.collect_onu_detail(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
            if live_detail and live_detail.get('history_raw'):
                history = live_detail['history_raw']
            # Update DB with live signal values
            if live_detail:
                updated = False
                if live_detail.get('rx_power') is not None:
                    onu.rx_power = live_detail['rx_power']; updated = True
                if live_detail.get('onu_rx_power') is not None:
                    onu.onu_rx_power = live_detail['onu_rx_power']; updated = True
                if live_detail.get('tx_power') is not None:
                    onu.tx_power = live_detail['tx_power']; updated = True
                if live_detail.get('onu_type') and not onu.onu_type:
                    onu.onu_type = live_detail['onu_type']; updated = True
                # Read-back WiFi config from ONU running-config
                wifi_entries = live_detail.get('wifi_entries', [])
                if wifi_entries:
                    import json as _json_wb
                    # Preserve existing passwords and newly-added SSIDs from DB
                    # (ZTE doesn't expose WPA keys in read-back, and newly added
                    # SSIDs may not appear in OLT running-config immediately)
                    existing_ssids = {}
                    if onu.wifi_config:
                        try:
                            _prev = _json_wb.loads(onu.wifi_config)
                            for s in _prev.get('ssids', []):
                                existing_ssids[int(s.get('ssid_num', 0))] = s
                        except Exception:
                            pass
                    ssids = []
                    readback_nums = set()
                    for w in wifi_entries:
                        num = int(w.get('wifi_num', 0))
                        readback_nums.add(num)
                        rb_pw = w.get('ssid_password', '')
                        ssids.append({
                            'ssid_num': num,
                            'ssid_name': w.get('ssid_name', ''),
                            'ssid_auth_type': w.get('ssid_auth_type', ''),
                            'ssid_password': rb_pw if rb_pw and rb_pw != '--' else existing_ssids.get(num, {}).get('ssid_password', ''),
                            'wifi_mode': w.get('mode', ''),
                            'wifi_status': w.get('status', 'up'),
                            'vlan': w.get('vlan', ''),
                        })
                    # Preserve DB entries not in read-back (newly added, OLT may not have applied yet)
                    for num, s in existing_ssids.items():
                        if num not in readback_nums:
                            ssids.append(s)
                    onu.wifi_config = _json_wb.dumps({'ssids': ssids})
                    updated = True
                if updated: db.session.commit()
        except Exception as e:
            logger.warning(f"Failed to collect ONU detail: {e}")

    # Seed traffic cache from Total Bytes collected during collect_onu_detail
    if live_detail and live_detail.get('input_bytes') and live_detail.get('output_bytes'):
        import time as _t
        cache_key = f'traffic_{onu_id}'
        _traffic_cache[cache_key] = {'ts': _t.time(), 'in': live_detail['input_bytes'], 'out': live_detail['output_bytes']}
    return jsonify({
        'success': True,
        'live_detail': live_detail,
        'history': history,
        'wan_services_json': _json.dumps(live_detail.get('wan_services', {}), separators=(',', ':')) if live_detail else '{}',
    })


@bp.route('/api/onu/<int:onu_id>/update', methods=['POST'])
@login_required
def update_onu(onu_id):
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    data = request.get_json()
    logger.info(f"[update_onu] ONU {onu_id} payload={data} by user={current_user.username}")
    olt = db.session.get(OLT, onu.olt_id) if onu.olt_id else None
    cli_cmds = []  # Collect CLI commands to send to OLT after DB save
    if 'name' in data:
        if not current_user.has_permission('edit_onu_name'):
            return jsonify({'success': False, 'message': 'Permission denied: edit_onu_name'}), 403
        onu.name = data['name']
        cli_cmds.append(f'name {data["name"]}')
    if 'description' in data:
        if not current_user.has_permission('edit_onu_description'):
            return jsonify({'success': False, 'message': 'Permission denied: edit_onu_description'}), 403
        onu.description = data['description']
        cli_cmds.append(f'description {data["description"]}')
    if 'pppoe' in data:
        if not current_user.has_permission('configure_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403
        onu.pppoe = data['pppoe']
    if 'actual_type' in data:
        if not current_user.has_permission('edit_onu_name'):
            return jsonify({'success': False, 'message': 'Permission denied: edit_onu_name'}), 403
        onu.actual_type = data['actual_type'].strip()
    if 'onu_type' in data:
        if not current_user.has_permission('configure_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403
        onu.onu_type = data['onu_type'].strip()
        # Re-register ONU with new type on OLT (preserves existing config)
        if olt and olt.cli_enabled and olt.cli_username and onu.serial_number:
            try:
                from snmp_collector import create_cli_collector
                tc = create_cli_collector(olt)
                tn = tc._connect()
                if tn:
                    is_epon = (onu.card or '').lower() == 'epon'
                    olt_pfx = 'epon-olt' if is_epon else 'gpon-olt'
                    pon_if = f'{olt_pfx}_{onu.frame}/{onu.slot}/{onu.port}'
                    tc._send_command(tn, 'end')
                    tc._send_command(tn, 'configure terminal')
                    tc._send_command(tn, f'interface {pon_if}')
                    if is_epon:
                        from telnet_client import _format_epon_mac
                        tc._send_command(tn, f'onu {onu.onu_id} type {data["onu_type"].strip()} mac {_format_epon_mac(onu.serial_number)}')
                    else:
                        tc._send_command(tn, f'onu {onu.onu_id} type {data["onu_type"].strip()} sn {onu.serial_number}')
                    tc._send_command(tn, 'end')
                    tn.close()
                    logger.info(f"[update_onu] CLI: re-registered ONU {onu.onu_id} type={data['onu_type'].strip()}")
            except Exception as e:
                logger.warning(f"[update_onu] onu_type CLI failed: {e}")
    if 'serial_number' in data:
        if not current_user.has_permission('configure_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403
        onu.serial_number = data['serial_number'].strip()
    if 'onu_id' in data:
        if not current_user.has_permission('configure_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403
        try:
            new_oid = int(data['onu_id'])
            if 1 <= new_oid <= 128:
                onu.onu_id = new_oid
        except (ValueError, TypeError):
            pass
    if 'technician_id' in data:
        if not current_user.has_permission('configure_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403
        onu.technician_id = data['technician_id'] or None
    if 'latitude' in data:
        if not current_user.has_permission('configure_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403
        onu.latitude = float(data['latitude']) if data['latitude'] else None
    if 'longitude' in data:
        if not current_user.has_permission('configure_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403
        onu.longitude = float(data['longitude']) if data['longitude'] else None
    if 'odp_port_id' in data:
        if not current_user.has_permission('configure_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403
        from models import FTTHODPPort
        # Unlink old ODP port if any
        if onu.odp_port:
            old_port = onu.odp_port
            old_port.onu_id = None
            old_port.status = 'available'
        # Link new ODP port
        new_port_id = data['odp_port_id']
        if new_port_id:
            new_port = db.session.get(FTTHODPPort, int(new_port_id))
            if new_port:
                # Free up the ONU currently on this port (if any)
                if new_port.onu_id and new_port.onu_id != onu.id:
                    new_port.onu_id = None
                new_port.onu_id = onu.id
                new_port.status = 'used'
        db.session.flush()
    db.session.commit()
    logger.info(f"[update_onu] DB committed for ONU {onu_id}, fields: {list(data.keys())}")
    if cli_cmds and olt and olt.cli_enabled and olt.cli_username:
        try:
            from snmp_collector import create_cli_collector
            tc = create_cli_collector(olt)
            tn = tc._connect()
            if tn:
                is_epon = (onu.card or '').lower() == 'epon'
                onu_pfx = 'epon-onu' if is_epon else 'gpon-onu'
                onu_if = f'{onu_pfx}_{onu.frame}/{onu.slot}/{onu.port}:{onu.onu_id}'
                tc._send_command(tn, 'end')
                tc._send_command(tn, 'configure terminal')
                tc._send_command(tn, f'interface {onu_if}')
                for cmd in cli_cmds:
                    tc._send_command(tn, cmd)
                tc._send_command(tn, 'end')
                tn.close()
                logger.info(f"[update_onu] CLI: {cli_cmds} on {onu_if}")
            else:
                logger.warning(f"[update_onu] CLI connect failed to {olt.ip_address}, DB saved but OLT not updated")
        except Exception as e:
            logger.warning(f"[update_onu] CLI failed: {e}")

    # Invalidate caches so frontend sees fresh data
    try:
        from cache import cache_clear
        cache_clear("dashboard:*")
        if onu.olt_id:
            cache_clear(f"olt:{onu.olt_id}:*")
    except Exception:
        pass

    log_action('onu_update', 'onu', target=onu.onu_id_str or str(onu.id), detail=f'Updated {onu.name} — fields: {list(data.keys())}')
    # Auto-save config to startup-config if CLI commands were sent to OLT
    if cli_cmds:
        _auto_write_config(onu.olt_id)
    return jsonify({'success': True})


@bp.route('/api/onu/<int:onu_id>/move', methods=['POST'])
@permission_required('configure_onu')
def move_onu(onu_id):
    """Move ONU to a different card/PON/ID (DB update only — sync will reconcile with OLT)."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    data = request.get_json()
    new_card = int(data.get('card', onu.slot))
    new_pon = int(data.get('pon', onu.port))
    onu_id_mode = data.get('onu_id_mode', 'auto')
    if onu_id_mode == 'auto':
        used_ids = {o.onu_id for o in ONU.query.filter_by(
            olt_id=onu.olt_id, frame=onu.frame, slot=new_card, port=new_pon
        ).filter(ONU.id != onu_id).all()}
        new_oid = next((i for i in range(1, 129) if i not in used_ids), None)
        if new_oid is None:
            return jsonify({'success': False, 'message': 'No available ONU IDs on target PON (all 128 used)'})
    else:
        try:
            new_oid = int(data.get('onu_id_value', onu.onu_id))
        except (TypeError, ValueError):
            return jsonify({'success': False, 'message': 'Invalid ONU ID'})
        if not (1 <= new_oid <= 128):
            return jsonify({'success': False, 'message': 'ONU ID must be 1–128'})
    onu.slot = new_card
    onu.port = new_pon
    onu.onu_id = new_oid
    db.session.commit()
    log_action('onu_move', 'onu', target=onu.onu_id_str or str(onu.id), detail=f'Moved to {onu.frame}/{new_card}/{new_pon}:{new_oid}')
    return jsonify({'success': True, 'message': f'ONU moved to {onu.frame}/{new_card}/{new_pon}:{new_oid}'})


@bp.route('/api/onu/<int:onu_id>/migrate', methods=['POST'])
@permission_required('configure_onu')
def migrate_onu(onu_id):
    """Migrate ONU from one PON to another: deregister old, register new, update DB.

    Flow:
    1. Get ONU current info (serial, type, name, description)
    2. Deregister from old PON (no onu N on old interface)
    3. Register on new PON (onu N type TYPE sn SERIAL)
    4. Update DB (slot, port, onu_id)
    5. Optionally re-apply name/description and basic config
    """
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    data = request.get_json()
    new_card = int(data.get('card', onu.slot))
    new_pon = int(data.get('pon', onu.port))
    onu_id_mode = data.get('onu_id_mode', 'auto')

    olt = onu.olt
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})

    # Calculate new ONU ID
    if onu_id_mode == 'auto':
        used_ids = {o.onu_id for o in ONU.query.filter_by(
            olt_id=onu.olt_id, frame=onu.frame, slot=new_card, port=new_pon
        ).filter(ONU.id != onu_id).all()}
        new_oid = next((i for i in range(1, 129) if i not in used_ids), None)
        if new_oid is None:
            return jsonify({'success': False, 'message': 'No available ONU IDs on target PON (all 128 used)'})
    else:
        try:
            new_oid = int(data.get('onu_id_value', onu.onu_id))
        except (TypeError, ValueError):
            return jsonify({'success': False, 'message': 'Invalid ONU ID'})
        if not (1 <= new_oid <= 128):
            return jsonify({'success': False, 'message': 'ONU ID must be 1–128'})

    old_frame, old_slot, old_port, old_id = onu.frame, onu.slot, onu.port, onu.onu_id
    serial = onu.serial_number or ''
    onu_type = onu.onu_type or 'ZTE-F609'
    onu_name = onu.name or ''
    onu_desc = onu.description or ''

    if not serial:
        return jsonify({'success': False, 'message': 'ONU has no serial number — cannot re-register'})

    use_snmp = data.get('register_mode', 'cli') == 'snmp' and olt.snmp_enabled

    if use_snmp:
        from snmp_collector import create_snmp_collector, get_write_community
        collector = create_snmp_collector(olt)
        wc = get_write_community(olt)

        # Step 1: Deregister from old PON
        ok1, msg1 = collector.deregister_onu_snmp(old_frame, old_slot, old_port, old_id, write_community=wc)
        if not ok1:
            collector.close()
            return jsonify({'success': False, 'message': f'Deregister failed: {msg1}'})

        # Step 2: Register on new PON
        ok2, msg2 = collector.register_onu_snmp(
            onu.frame, new_card, new_pon, new_oid, serial,
            onu_type=onu_type, name=onu_name, description=onu_desc,
            write_community=wc,
        )
        collector.close()
        if not ok2:
            # Try to re-register on old PON as rollback
            collector2 = create_snmp_collector(olt)
            collector2.register_onu_snmp(old_frame, old_slot, old_port, old_id, serial,
                                         onu_type=onu_type, name=onu_name, description=onu_desc,
                                         write_community=wc)
            collector2.close()
            return jsonify({'success': False, 'message': f'Register on new PON failed: {msg2}. Rolled back to old PON.'})

        # Step 3: Update DB
        onu.slot = new_card
        onu.port = new_pon
        onu.onu_id = new_oid
        onu.onu_id_str = f'gpon-onu_{onu.frame}/{new_card}/{new_pon}:{new_oid}'
        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'ONU migrated from {old_frame}/{old_slot}/{old_port}:{old_id} to {onu.frame}/{new_card}/{new_pon}:{new_oid} (SNMP)'
        })

    if not olt.cli_enabled or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})

    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    is_epon = (onu.card or '').lower() == 'epon'

    # Step 1: Deregister from old PON
    ok1, msg1 = tc.deregister_onu(old_frame, old_slot, old_port, old_id, is_epon=is_epon)
    if not ok1:
        return jsonify({'success': False, 'message': f'Deregister failed: {msg1}'})

    # Step 2: Register on new PON
    ok2, msg2 = tc.register_onu(onu.frame, new_card, new_pon, new_oid, onu_type, serial, is_epon=is_epon)
    if not ok2:
        # Try to re-register on old PON as rollback
        tc.register_onu(old_frame, old_slot, old_port, old_id, onu_type, serial, is_epon=is_epon)
        return jsonify({'success': False, 'message': f'Register on new PON failed: {msg2}. Rolled back to old PON.'})

    # Step 3: Re-apply name and description if set
    if onu_name or onu_desc:
        try:
            tc.configure_onu_profile(onu.frame, new_card, new_pon, new_oid,
                                     name=onu_name, description=onu_desc, is_epon=is_epon)
        except Exception:
            pass  # Non-fatal: ONU is registered, just without name/desc

    # Step 4: Update DB
    onu.slot = new_card
    onu.port = new_pon
    onu.onu_id = new_oid
    onu.onu_id_str = f'gpon-onu_{onu.frame}/{new_card}/{new_pon}:{new_oid}'
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'ONU migrated from {old_frame}/{old_slot}/{old_port}:{old_id} to {onu.frame}/{new_card}/{new_pon}:{new_oid}'
    })


@bp.route('/api/onu/<int:onu_id>/delete', methods=['POST'])
@permission_required('delete_onu')
def delete_onu(onu_id):
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    olt_id = onu.olt_id
    # Deregister from OLT via CLI if configured (SSH or Telnet)
    if olt and olt.cli_enabled:
        from snmp_collector import TelnetCollector, create_cli_collector
        tc = create_cli_collector(olt)
        is_epon = (onu.card or '').lower() == 'epon'
        tc.deregister_onu(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
    db.session.delete(onu)
    db.session.commit()
    # Auto-sync OLT after delete — full sync with delay to clean stale ONUs
    _auto_sync_olt(olt_id, light=False, delay=3)
    log_action('onu_delete', 'onu', target=onu.onu_id_str or str(onu.id), detail=f'Deleted {onu.name} ({onu.serial_number}) from {olt.name if olt else "unknown"}')
    return jsonify({'success': True, 'message': 'ONU deleted. Auto-syncing OLT...'})


def _auto_sync_olt(olt_id, light=True, delay=0):
    """Trigger a background sync for an OLT after ONU actions (clear-config, delete, etc.).
    Non-blocking — runs in a thread so the API response is not delayed.
    Uses LIGHT sync (SNMP-only) by default to minimize OLT CPU load.
    Set light=False for full sync (needed after delete to clean stale ONUs).
    delay: seconds to wait before starting sync (gives OLT time to process changes)."""
    import threading
    from flask import current_app
    from sync_lock import acquire_sync_lock, release_sync_lock

    app = current_app._get_current_object()

    def _do_sync():
        if delay > 0:
            time.sleep(delay)
        with app.app_context():
            # Acquire per-OLT sync lock
            lock_token = acquire_sync_lock(olt_id, timeout=0)
            if lock_token is None:
                logger.info(f"Auto-sync skipped for OLT {olt_id} — already syncing")
                return

            try:
                olt = db.session.get(OLT, olt_id)
                if not olt:
                    return
                sync = OLTSyncStatus.query.filter_by(olt_id=olt_id).first()
                if not sync:
                    sync = OLTSyncStatus(olt_id=olt_id)
                    db.session.add(sync)
                sync.status = 'running'
                sync.progress = 0
                sync.message = 'Auto-sync (light) after ONU action...'
                sync.started_at = datetime.now(timezone.utc)
                sync.completed_at = None
                db.session.commit()

                def update_progress(pct, msg):
                    sync.progress = pct
                    sync.message = msg
                    db.session.commit()

                from snmp_collector import poll_olt
                result = poll_olt(olt, progress_cb=update_progress, light=light)

                if result.get('success'):
                    from sync_helper import save_sync_result, check_unregistered_onus
                    onu_count, stale_count = save_sync_result(olt, result, sync, light=light)
                    sync.progress = 100
                    sync.status = 'completed'
                    sync.message = f'Auto-sync OK: {onu_count} ONUs'
                    sync.completed_at = datetime.now(timezone.utc)
                    db.session.commit()
                    try:
                        from ws_bridge import ws_broadcast_sync, ws_broadcast_dashboard
                        ws_broadcast_sync(olt_id, 100, "Sync complete", "done")
                        ws_broadcast_dashboard("onu_change", {"olt_id": olt_id, "action": "sync_complete"})
                    except Exception:
                        pass
                else:
                    olt.is_online = False
                    olt.connection_status = 'error'
                    olt.snmp_status = 'disconnected'
                    olt.telnet_status = 'disconnected'
                    sync.status = 'error'
                    sync.message = result.get('error', result.get('message', 'Auto-sync failed'))
                    sync.completed_at = datetime.now(timezone.utc)
                    db.session.commit()
            except Exception as e:
                try:
                    sync = OLTSyncStatus.query.filter_by(olt_id=olt_id).first()
                    if sync:
                        sync.status = 'error'
                        sync.message = str(e)[:200]
                        db.session.commit()
                except:
                    pass
            finally:
                release_sync_lock(olt_id, lock_token)

    thread = threading.Thread(target=_do_sync, daemon=True)
    thread.start()


def _auto_write_config(olt_id):
    """Auto-save OLT running-config to startup-config via 'write' command.
    Non-blocking — runs in a background thread so API response is not delayed.
    Called after provisioning ONU, config changes, etc. to ensure config persists across reboots."""
    import threading
    from flask import current_app

    app = current_app._get_current_object()

    def _do_write():
        with app.app_context():
            try:
                olt = db.session.get(OLT, olt_id)
                if not olt or not olt.cli_enabled or not olt.cli_username:
                    return
                from snmp_collector import create_cli_collector
                tc = create_cli_collector(olt)
                tn = tc._connect()
                if not tn:
                    logger.warning(f"Auto-write: CLI connect failed for OLT {olt_id}")
                    return
                out = tc._send_command(tn, 'write', timeout=30)
                tn.close()
                low = out.lower()
                if '%error' in low or '% invalid' in low or '%code' in low or 'incomplete command' in low or 'ambiguous command' in low or 'return error' in low:
                    logger.warning(f"Auto-write: write command failed for OLT {olt_id}: {out.strip()[:200]}")
                else:
                    logger.info(f"Auto-write: Config saved to startup-config for OLT {olt_id}")
                    log_action('olt_auto_write', 'olt', target=olt.name, detail='Auto-saved running-config to startup after provisioning')
            except Exception as e:
                logger.warning(f"Auto-write: Failed for OLT {olt_id}: {e}")

    thread = threading.Thread(target=_do_write, daemon=True)
    thread.start()


@bp.route('/api/onu/<int:onu_id>/action', methods=['POST'])
@login_required
def onu_action(onu_id):
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    data = request.get_json()
    action = data.get('action')
    olt = onu.olt

    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})

    use_snmp = data.get('register_mode', 'cli') == 'snmp' and olt.snmp_enabled

    # SNMP mode: handle delete/deregister via SNMP SET
    if use_snmp and action == 'delete':
        if not current_user.has_permission('delete_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: delete_onu'}), 403
        from snmp_collector import create_snmp_collector, get_write_community
        collector = create_snmp_collector(olt)
        wc = get_write_community(olt)
        olt_id_for_sync = onu.olt_id
        success, msg = collector.deregister_onu_snmp(onu.frame, onu.slot, onu.port, onu.onu_id, write_community=wc)
        collector.close()
        if success:
            db.session.delete(onu)
            db.session.commit()
            _auto_sync_olt(olt_id_for_sync, light=False, delay=3)
        return jsonify({'success': success, 'message': msg})

    if not olt.cli_enabled:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})

    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    is_epon = (onu.card or '').lower() == 'epon'
    device_type = 'EPON' if is_epon else 'GPON'
    logger.info(f"[onu-action] ONU {onu_id} action='{action}' device={device_type} card='{onu.card}' by user={current_user.username}")

    if action == 'reboot':
        if not current_user.has_permission('reboot_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: reboot_onu'}), 403
        success, msg = tc.reset_onu(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon, serial_number=onu.serial_number or '')
        logger.info(f"[onu-action] reboot ONU {onu_id} ({device_type}): success={success} msg={msg}")
        if success:
            _auto_sync_olt(onu.olt_id)
    elif action == 'reset':
        if not current_user.has_permission('reboot_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: reboot_onu'}), 403
        success, msg = tc.reset_onu(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon, serial_number=onu.serial_number or '')
        logger.info(f"[onu-action] reset ONU {onu_id} ({device_type}): success={success} msg={msg}")
        if success:
            _auto_sync_olt(onu.olt_id)
    elif action == 'delete':
        if not current_user.has_permission('delete_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: delete_onu'}), 403
        olt_id_for_sync = onu.olt_id
        success, msg = tc.deregister_onu(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
        if success:
            db.session.delete(onu)
            db.session.commit()
            # Auto-trigger FULL sync after delete with 3s delay — gives OLT time
            # to process deregistration so SNMP won't re-create the ONU in DB
            _auto_sync_olt(olt_id_for_sync, light=False, delay=3)
            # Auto-save config to startup-config
            _auto_write_config(olt_id_for_sync)
    elif action == 'clear-config':
        if not current_user.has_permission('clear_config_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: clear_config_onu'}), 403
        success, msg = tc.clear_onu_config(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
        logger.info(f"[onu-action] clear-config ONU {onu_id} ({device_type}): success={success} msg={msg}")
        if success:
            # Clear service-related fields in DB
            onu.pppoe = ''
            db.session.commit()
            _auto_sync_olt(onu.olt_id, delay=2)
            # Auto-save config to startup-config
            _auto_write_config(onu.olt_id)
    elif action == 'disable':
        if not current_user.has_permission('disable_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: disable_onu'}), 403
        success, msg = tc.disable_onu(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
        logger.info(f"[onu-action] disable ONU {onu_id} ({device_type}): success={success} msg={msg}")
        if success:
            onu.status = 'offline'
            db.session.commit()
    elif action == 'enable':
        if not current_user.has_permission('disable_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: disable_onu'}), 403
        success, msg = tc.enable_onu(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
        logger.info(f"[onu-action] enable ONU {onu_id} ({device_type}): success={success} msg={msg}")
        if success:
            onu.status = 'online'
            db.session.commit()
    elif action == 'resync':
        success, msg = (True, 'OK')
        logger.info(f"[onu-action] resync ONU {onu_id} ({device_type}): collecting from OLT...")
        data = tc.collect_onu_detail(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
        if data:
            if data.get('name') and not onu.name: onu.name = data['name']
            if data.get('description') and not onu.description: onu.description = data['description']
            if data.get('serial'): onu.serial_number = data['serial']
            if data.get('distance_m') is not None: onu.distance = data['distance_m']
            if data.get('rx_power') is not None: onu.rx_power = data['rx_power']
            if data.get('onu_rx_power') is not None: onu.onu_rx_power = data['onu_rx_power']
            if data.get('tx_power') is not None: onu.tx_power = data['tx_power']
            if data.get('state'):
                state = data['state'].lower()
                if state == 'ready': onu.status = 'online'
                elif state == 'dyinggasp': onu.status = 'dyinggasp'
                elif state == 'los': onu.status = 'los'
                else: onu.status = state
            db.session.commit()
            success, msg = True, 'Config resynced from OLT'
            logger.info(f"[onu-action] resync ONU {onu_id} ({device_type}): success — state={data.get('state','?')} rx={data.get('rx_power','?')}")
        else:
            success, msg = False, 'Failed to collect ONU data from OLT'
            logger.warning(f"[onu-action] resync ONU {onu_id} ({device_type}): failed — no data from OLT")
    elif action == 'restore-factory':
        if not current_user.has_permission('reset_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: reset_onu'}), 403
        success, msg = tc.restore_factory_onu(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
        logger.info(f"[onu-action] restore-factory ONU {onu_id} ({device_type}): success={success} msg={msg}")
        if success:
            # Clear service-related fields in DB — factory reset wipes all ONU config
            onu.pppoe = ''
            db.session.commit()
            _auto_sync_olt(onu.olt_id, delay=2)
            # Auto-save config to startup-config
            _auto_write_config(onu.olt_id)
    elif action == 'restore-wifi':
        if not current_user.has_permission('configure_onu'):
            return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403
        success, msg = tc.restore_wifi_onu(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
        logger.info(f"[onu-action] restore-wifi ONU {onu_id} ({device_type}): success={success} msg={msg}")
        if success:
            # Clear WiFi config in DB
            onu.wifi_config = ''
            db.session.commit()
            _auto_sync_olt(onu.olt_id)
    else:
        return jsonify({'success': False, 'message': f'Unknown action: {action}'})
    logger.info(f"[onu-action] ONU {onu_id} action='{action}' ({device_type}): final success={success} msg={msg}")
    if success:
        log_action(f'onu_{action}', 'onu', target=onu.onu_id_str or str(onu.id), detail=f'{action} on {onu.name} ({onu.serial_number}) — {msg}')
    return jsonify({'success': success, 'message': msg})


@bp.route('/api/onu/<int:onu_id>/live-info', methods=['GET'])
@login_required
def onu_live_info(onu_id):
    """Fetch live ONU data from OLT: detail-info, remote-onu equip, running-config."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    if not olt or not olt.cli_enabled:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})

    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    is_epon = (onu.card or '').lower() == 'epon'
    data = tc.get_onu_live_data(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
    if data.get('error') and not data.get('equip') and not data.get('running_config', {}).get('service_ports'):
        return jsonify({'success': False, 'message': data['error']})
    return jsonify({'success': True, 'data': data})


@bp.route('/api/onu/<int:onu_id>/get-status', methods=['POST'])
@login_required
def onu_get_status(onu_id):
    """Get detailed ONU status matching R-Config Get Status output.
    Returns: interface info, optical status (OLT/ONU RX/TX + attenuation), history, MAC table."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    if not olt or not olt.cli_enabled:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})

    from snmp_collector import create_cli_collector
    import re as _re
    tc = create_cli_collector(olt)
    tn = tc._connect()
    if not tn:
        return jsonify({'success': False, 'message': 'CLI connection failed'})

    is_epon = (onu.card or '').lower() == 'epon'
    prefix = 'epon-onu' if is_epon else 'gpon-onu'
    iface = f'{prefix}_{onu.frame}/{onu.slot}/{onu.port}:{onu.onu_id}'
    device_type = 'EPON' if is_epon else 'GPON'
    logger.info(f"[get-status] ONU {onu_id} ({device_type}) iface={iface} by user={current_user.username}")
    status_data = {
        'interface': {},
        'optical': {'up': {}, 'down': {}},
        'history': [],
        'macs': [],
    }

    if is_epon:
        # EPON: running-config for name/desc + power attenuation for optical
        try:
            raw_cfg = tc._send_command(tn, f'show running-config interface {iface}', timeout=12)
            info = {}
            for line in raw_cfg.split('\n'):
                ls = line.strip()
                if ls.startswith('property description'):
                    desc_raw = ls.split('description', 1)[1].strip() if 'description' in ls else ''
                    if desc_raw:
                        parts = desc_raw.split('$$')
                        parts = [p.strip() for p in parts if p.strip()]
                        if len(parts) >= 1: info['Name'] = parts[0]
                        if len(parts) >= 2: info['Description'] = parts[1]
                elif ls.startswith('name '):
                    info['Name'] = ls.split(' ', 1)[1] if ' ' in ls else ''
            status_data['interface'] = info

            # Power attenuation — same command works for EPON with epon-onu_ prefix
            try:
                att_out = tc._send_command(tn, f'show pon power attenuation {iface}', timeout=10)
                if att_out and 'Error' not in att_out and 'Incomplete' not in att_out:
                    for line in att_out.split('\n'):
                        ls = line.strip()
                        if not ls or '---' in ls or ls.lower().startswith('olt') or 'attenuation' in ls.lower():
                            continue
                        ll = ls.lower()
                        if ll.startswith('up'):
                            rx_m = _re.search(r'Rx\s*:\s*([-]?\d+\.?\d*)', ls)
                            tx_m = _re.search(r'Tx\s*:\s*([-]?\d+\.?\d*)', ls)
                            att_m = _re.findall(r'([-]?\d+\.?\d*)\s*\(dB\)', ls)
                            if rx_m:
                                val = f'{float(rx_m.group(1)):.3f} dBm'
                                status_data['optical']['up']['rx'] = val
                                status_data['optical']['up']['olt_rx'] = val
                            if tx_m:
                                val = f'{float(tx_m.group(1)):.3f} dBm'
                                status_data['optical']['up']['tx'] = val
                                status_data['optical']['up']['onu_tx'] = val
                            if att_m:
                                status_data['optical']['up']['attenuation'] = f'{float(att_m[-1]):.3f} dB'
                        elif ll.startswith('down'):
                            rx_m = _re.search(r'Rx\s*:\s*([-]?\d+\.?\d*)', ls)
                            tx_m = _re.search(r'Tx\s*:\s*([-]?\d+\.?\d*)', ls)
                            att_m = _re.findall(r'([-]?\d+\.?\d*)\s*\(dB\)', ls)
                            if tx_m:
                                val = f'{float(tx_m.group(1)):.3f} dBm'
                                status_data['optical']['down']['tx'] = val
                                status_data['optical']['down']['olt_tx'] = val
                            if rx_m:
                                val = f'{float(rx_m.group(1)):.3f} dBm'
                                status_data['optical']['down']['rx'] = val
                                status_data['optical']['down']['onu_rx'] = val
                            if att_m:
                                status_data['optical']['down']['attenuation'] = f'{float(att_m[-1]):.3f} dB'
            except Exception:
                pass

            # Update DB with live optical values
            try:
                up_rx = status_data['optical']['up'].get('olt_rx')
                down_rx = status_data['optical']['down'].get('onu_rx')
                up_tx = status_data['optical']['up'].get('onu_tx')
                if up_rx:
                    onu.rx_power = float(_re.search(r'[-]?\d+\.?\d*', up_rx).group())
                if down_rx:
                    onu.onu_rx_power = float(_re.search(r'[-]?\d+\.?\d*', down_rx).group())
                if up_tx:
                    onu.tx_power = float(_re.search(r'[-]?\d+\.?\d*', up_tx).group())
                db.session.commit()
            except Exception as e:
                logger.debug(f"EPON DB optical update failed: {e}")

            tn.write('exit\n'); tn.close()
        except Exception as e:
            try: tn.close()
            except: pass
        return jsonify({'success': True, 'status': status_data})

    # GPON path

    try:
        # 1. detail-info for interface info
        raw = tc._send_command(tn, f'show gpon onu detail-info {iface}', timeout=15)
        info = {}
        in_history = False
        for line in raw.split('\n'):
            ls = line.strip()
            if '------' in ls:
                in_history = True
                continue
            if in_history:
                hm = _re.match(r'\s*\d+\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*(.*)', ls)
                if hm:
                    authpass = hm.group(1).strip()
                    offline = hm.group(2).strip()
                    cause = hm.group(3).strip()
                    status_data['history'].append({
                        'authpass_time': authpass,
                        'offline_time': offline,
                        'cause': cause,
                    })
                continue
            if ':' in ls and not in_history:
                k = ls.split(':', 1)[0].strip()
                v = ls.split(':', 1)[1].strip()
                info[k] = v
        status_data['interface'] = info

        # 2. Optical status — try CLI first (has ONU TX), SNMP fallback
        # ZTE C320 V2.1.0: SNMP OID .11 (ONU TX) returns 0, so CLI is needed

        # 2a. CLI: show pon power attenuation
        # ZTE C320 V2.1.0 output format:
        #           OLT                  ONU              Attenuation
        # --------------------------------------------------------------------------
        #  up      Rx :-22.204(dbm)      Tx:2.170(dbm)        24.374(dB)
        #
        #  down    Tx :9.604(dbm)        Rx:-14.070(dbm)      23.674(dB)
        try:
            att_out = tc._send_command(tn, f'show pon power attenuation {iface}', timeout=10)
            if att_out and 'Error' not in att_out and 'Incomplete' not in att_out:
                for line in att_out.split('\n'):
                    ls = line.strip()
                    if not ls or '---' in ls or ls.lower().startswith('olt') or 'attenuation' in ls.lower():
                        continue
                    ll = ls.lower()
                    # Lines start with 'up' or 'down' followed by data on the SAME line
                    if ll.startswith('up'):
                        # Extract Rx (OLT side) and Tx (ONU side) and attenuation
                        rx_m = _re.search(r'Rx\s*:\s*([-]?\d+\.?\d*)', ls)
                        tx_m = _re.search(r'Tx\s*:\s*([-]?\d+\.?\d*)', ls)
                        # Attenuation is the last number followed by (dB)
                        att_m = _re.findall(r'([-]?\d+\.?\d*)\s*\(dB\)', ls)
                        if rx_m:
                            val = f'{float(rx_m.group(1)):.3f} dBm'
                            status_data['optical']['up']['rx'] = val
                            status_data['optical']['up']['olt_rx'] = val
                        if tx_m:
                            val = f'{float(tx_m.group(1)):.3f} dBm'
                            status_data['optical']['up']['tx'] = val
                            status_data['optical']['up']['onu_tx'] = val
                        if att_m:
                            status_data['optical']['up']['attenuation'] = f'{float(att_m[-1]):.3f} dB'
                    elif ll.startswith('down'):
                        rx_m = _re.search(r'Rx\s*:\s*([-]?\d+\.?\d*)', ls)
                        tx_m = _re.search(r'Tx\s*:\s*([-]?\d+\.?\d*)', ls)
                        att_m = _re.findall(r'([-]?\d+\.?\d*)\s*\(dB\)', ls)
                        if tx_m:
                            val = f'{float(tx_m.group(1)):.3f} dBm'
                            status_data['optical']['down']['tx'] = val
                            status_data['optical']['down']['olt_tx'] = val
                        if rx_m:
                            val = f'{float(rx_m.group(1)):.3f} dBm'
                            status_data['optical']['down']['rx'] = val
                            status_data['optical']['down']['onu_rx'] = val
                        if att_m:
                            status_data['optical']['down']['attenuation'] = f'{float(att_m[-1]):.3f} dB'
        except:
            pass

        # 2b. SNMP fallback for any missing optical values
        try:
            import asyncio as _aio
            from pysnmp.hlapi.v1arch.asyncio import Slim as _Slim, ObjectType as _OT, ObjectIdentity as _OI
            BOARD1_BASE = 268500992
            PON_INCREMENT = 256
            pon_index = BOARD1_BASE + onu.port * PON_INCREMENT
            oid_onu_rx = f'1.3.6.1.4.1.3902.1012.3.50.12.1.1.10.{pon_index}.{onu.onu_id}.1'
            oid_olt_tx = f'1.3.6.1.4.1.3902.1012.3.50.12.1.1.14.{pon_index}.{onu.onu_id}.1'
            oid_olt_rx = f'1.3.6.1.4.1.3902.1012.3.50.12.1.1.18.{pon_index}.{onu.onu_id}.1'
            async def _get_optical():
                slim = _Slim(1)
                try:
                    ei, es, eidx, vb = await slim.get(
                        str(olt.snmp_community), str(olt.ip_address), int(olt.snmp_port),
                        _OT(_OI(oid_onu_rx)), _OT(_OI(oid_olt_tx)), _OT(_OI(oid_olt_rx)),
                        timeout=5, retries=2)
                    if not ei and not es:
                        from snmp_collector import decode_rx_power
                        return (decode_rx_power(int(vb[0][1])), decode_rx_power(int(vb[1][1])), decode_rx_power(int(vb[2][1])))
                except: pass
                finally: slim.close()
                return (None, None, None)
            loop = _aio.new_event_loop()
            onu_rx, olt_tx, olt_rx = loop.run_until_complete(_get_optical())
            loop.close()

            # Fill missing Up values: OLT Rx, attenuation
            if olt_rx is not None:
                if 'rx' not in status_data['optical']['up']:
                    status_data['optical']['up']['rx'] = f'{olt_rx:.3f} dBm'
                    status_data['optical']['up']['olt_rx'] = f'{olt_rx:.3f} dBm'
                    status_data['optical']['up']['olt_rx_snmp_fallback'] = True  # OID .18 — inaccurate on V2.1.0
                # Compute up attenuation if we now have both ONU TX and OLT RX
                onu_tx_str = status_data['optical']['up'].get('onu_tx', '')
                if 'attenuation' not in status_data['optical']['up'] and onu_tx_str:
                    onu_tx_val = float(_re.search(r'[-]?\d+\.?\d*', onu_tx_str).group())
                    status_data['optical']['up']['attenuation'] = f'{round(onu_tx_val - olt_rx, 3):.3f} dB'

            # Fill missing Down values: OLT Tx, ONU Rx, attenuation
            if olt_tx is not None:
                if 'tx' not in status_data['optical']['down']:
                    status_data['optical']['down']['tx'] = f'{olt_tx:.3f} dBm'
                    status_data['optical']['down']['olt_tx'] = f'{olt_tx:.3f} dBm'
            if onu_rx is not None:
                if 'rx' not in status_data['optical']['down']:
                    status_data['optical']['down']['rx'] = f'{onu_rx:.3f} dBm'
                    status_data['optical']['down']['onu_rx'] = f'{onu_rx:.3f} dBm'
            if olt_tx is not None and onu_rx is not None:
                if 'attenuation' not in status_data['optical']['down']:
                    status_data['optical']['down']['attenuation'] = f'{round(olt_tx - onu_rx, 3):.3f} dB'
        except Exception as e:
            logger.debug(f"Optical SNMP failed: {e}")

        # 2c. ONU optical module info via CLI: show gpon remote-onu interface
        try:
            opt_out = tc._send_command(tn, f'show gpon remote-onu interface {iface}', timeout=10)
            if opt_out and 'Error' not in opt_out and 'Incomplete' not in opt_out:
                onu_opt = {}
                for line in opt_out.split('\n'):
                    ls = line.strip()
                    if ':' in ls:
                        k = ls.split(':', 1)[0].strip().lower()
                        v = ls.split(':', 1)[1].strip()
                        if 'temperature' in k:
                            onu_opt['temperature'] = v
                        elif 'voltage' in k or 'supply' in k:
                            onu_opt['voltage'] = v
                        elif 'bias' in k or 'current' in k:
                            onu_opt['bias_current'] = v
                        elif 'txpower' in k or 'tx power' in k:
                            onu_opt['tx_power'] = v
                        elif 'rxpower' in k or 'rx power' in k or 'rxoptical' in k:
                            onu_opt['rx_power'] = v
                        elif 'wavelength' in k:
                            onu_opt['wavelength'] = v
                        elif 'vendor' in k:
                            onu_opt['vendor'] = v
                        elif 'type' in k and 'module' in k:
                            onu_opt['module_type'] = v
                if onu_opt:
                    status_data['optical']['onu_module'] = onu_opt
        except:
            pass

        # 3. MAC address table (may not be supported on all firmware versions)
        try:
            mac_out = tc._send_command(tn, f'show mac gpon-onu {iface}', timeout=10)
            if mac_out and 'Error' not in mac_out and 'Invalid' not in mac_out and 'Incomplete' not in mac_out:
                for line in mac_out.split('\n'):
                    ls = line.strip()
                    if not ls or '---' in ls or ls.lower().startswith('mac') or ls.lower().startswith('total'):
                        continue
                    parts = ls.split()
                    if len(parts) >= 4 and _re.match(r'^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$', parts[0].lower()):
                        status_data['macs'].append({
                            'mac': parts[0],
                            'vlan': parts[1] if len(parts) > 1 else '',
                            'type': parts[2] if len(parts) > 2 else '',
                            'port': parts[3] if len(parts) > 3 else '',
                            'vport': parts[4] if len(parts) > 4 else '',
                        })
        except:
            pass

        tn.write('exit\n'); tn.close()

        # Update DB with live optical values for consistency
        try:
            up_rx = status_data['optical']['up'].get('olt_rx')
            down_rx = status_data['optical']['down'].get('onu_rx')
            up_tx = status_data['optical']['up'].get('onu_tx')
            # Only update rx_power (OLT RX) in DB if from CLI, not SNMP OID .18 fallback
            if up_rx and not status_data['optical']['up'].get('olt_rx_snmp_fallback'):
                onu.rx_power = float(_re.search(r'[-]?\d+\.?\d*', up_rx).group())
            if down_rx:
                onu.onu_rx_power = float(_re.search(r'[-]?\d+\.?\d*', down_rx).group())
            if up_tx:
                onu.tx_power = float(_re.search(r'[-]?\d+\.?\d*', up_tx).group())
            db.session.commit()
        except Exception as e:
            logger.debug(f"DB optical update failed: {e}")

        return jsonify({'success': True, 'status': status_data})
    except Exception as e:
        logger.error(f"get-status failed: {e}")
        try: tn.close()
        except: pass
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/onu/<int:onu_id>/refresh-status', methods=['POST'])
@login_required
def onu_refresh_status(onu_id):
    """Re-fetch ONU status from OLT and update DB (ZTE via CLI — SSH or Telnet)."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt

    if not olt or not olt.cli_enabled:
        return jsonify({'success': False, 'message': 'OLT not configured'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    is_epon = (onu.card or '').lower() == 'epon'
    data = tc.collect_onu_detail(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
    state_val = data.get('state', '').lower()
    if state_val in ('ready', 'online'):
        onu.status = 'online'
    elif state_val in ('offline', 'los', 'dyinggasp'):
        onu.status = state_val
    if data.get('distance_m') is not None:
        onu.distance = data['distance_m']
    if data.get('rx_power') is not None:
        onu.rx_power = data['rx_power']
    if data.get('onu_rx_power') is not None:
        onu.onu_rx_power = data['onu_rx_power']
    if data.get('tx_power') is not None:
        onu.tx_power = data['tx_power']
    db.session.commit()
    return jsonify({'success': True, 'data': data})


@bp.route('/api/onu/<int:onu_id>/running-config', methods=['GET'])
@login_required
def onu_running_config(onu_id):
    """Get ONU running-config from OLT (interface + pon-onu-mng sections)."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    if not olt or not olt.cli_enabled:
        return jsonify({'success': False, 'message': 'OLT not configured'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    is_epon = (onu.card or '').lower() == 'epon'
    data = tc.collect_onu_detail(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
    config = data.get('running_config_raw', '')
    return jsonify({'success': True, 'config': config or 'No config available'})


@bp.route('/api/onu/<int:onu_id>/save-config', methods=['POST'])
@permission_required('configure_onu')
def onu_save_config(onu_id):
    """Save OLT running-config to startup-config by running 'write' command."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    if not olt or not olt.cli_enabled or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    try:
        tn = tc._connect()
        if not tn:
            return jsonify({'success': False, 'message': 'CLI connection failed'})
        out = tc._send_command(tn, 'write', timeout=30)
        tn.close()
        if 'error' in out.lower() or '%' in out:
            return jsonify({'success': False, 'message': f'Save failed: {out.strip()}'})
        return jsonify({'success': True, 'message': 'Config saved to startup-config'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/onu/<int:onu_id>/resync-config', methods=['POST'])
@permission_required('configure_onu')
def onu_resync_config(onu_id):
    """Re-collect ONU detail from OLT and update DB (ZTE via CLI — SSH or Telnet).
    This is a READ-ONLY operation — does NOT modify OLT config.
    """
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt

    if not olt or not olt.cli_enabled:
        return jsonify({'success': False, 'message': 'OLT not configured'})
    try:
        from snmp_collector import TelnetCollector, create_cli_collector
        tc = create_cli_collector(olt)
        is_epon = (onu.card or '').lower() == 'epon'
        device_type = 'EPON' if is_epon else 'GPON'
        logger.info(f"[resync-config] ONU {onu_id} ({device_type}) by user={current_user.username}")
        data = tc.collect_onu_detail(onu.frame, onu.slot, onu.port, onu.onu_id, is_epon=is_epon)
        if not data:
            logger.warning(f"[resync-config] ONU {onu_id} ({device_type}): no data from OLT")
            return jsonify({'success': False, 'message': 'Failed to collect ONU data from OLT'})
        updated = False
        if data.get('name') and not onu.name: onu.name = data['name']; updated = True
        if data.get('description') and not onu.description: onu.description = data['description']; updated = True
        if data.get('serial'): onu.serial_number = data['serial']; updated = True
        if data.get('distance_m') is not None: onu.distance = data['distance_m']; updated = True
        if data.get('state'):
            state = data['state'].lower()
            if state == 'ready': onu.status = 'online'
            elif state == 'dyinggasp': onu.status = 'dyinggasp'
            elif state == 'los': onu.status = 'los'
            else: onu.status = state
            updated = True
        # Read-back WiFi config from ONU running-config
        wifi_entries = data.get('wifi_entries', [])
        if wifi_entries:
            import json as _json_rc
            # Preserve existing passwords and DB-only SSIDs from DB
            # (ZTE doesn't expose WPA keys in read-back, and newly added
            # SSIDs may not appear in OLT running-config immediately)
            existing_ssids = {}
            if onu.wifi_config:
                try:
                    _prev = _json_rc.loads(onu.wifi_config)
                    for s in _prev.get('ssids', []):
                        existing_ssids[int(s.get('ssid_num', 0))] = s
                except Exception:
                    pass
            ssids = []
            readback_nums = set()
            for w in wifi_entries:
                num = int(w.get('wifi_num', 0))
                readback_nums.add(num)
                rb_pw = w.get('ssid_password', '')
                ssids.append({
                    'ssid_num': num,
                    'ssid_name': w.get('ssid_name', ''),
                    'ssid_auth_type': w.get('ssid_auth_type', ''),
                    'ssid_password': rb_pw if rb_pw and rb_pw != '--' else existing_ssids.get(num, {}).get('ssid_password', ''),
                    'wifi_mode': w.get('mode', ''),
                    'wifi_status': w.get('status', 'up'),
                    'vlan': w.get('vlan', ''),
                })
            # Preserve DB entries not in read-back (newly added, OLT may not have applied yet)
            for num, s in existing_ssids.items():
                if num not in readback_nums:
                    ssids.append(s)
            onu.wifi_config = _json_rc.dumps({'ssids': ssids})
            updated = True
        if updated: db.session.commit()
        return jsonify({'success': True, 'message': 'Config resynced from OLT'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Resync failed: {str(e)}'})


@bp.route('/api/onu/<int:onu_id>/replace', methods=['POST'])
@permission_required('configure_onu')
def onu_replace(onu_id):
    """Replace ONU with new SN/MAC — preserves all config (service, VLAN, profiles, etc).
    Validates vendor match, backs up config, deletes old ONU, registers new, re-applies config."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404

    data = request.get_json()
    new_serial = (data.get('new_serial') or '').strip().upper()
    if not new_serial:
        return jsonify({'success': False, 'message': 'New serial number is required'})

    olt = onu.olt
    if not olt or not olt.cli_enabled:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})

    if not current_user.has_permission('configure_onu'):
        return jsonify({'success': False, 'message': 'Permission denied: configure_onu'}), 403

    old_serial = onu.serial_number or ''
    is_epon = (onu.card or '').lower() == 'epon'
    device_type = 'EPON' if is_epon else 'GPON'

    # Vendor validation from serial prefix
    def get_vendor(sn):
        sn = (sn or '').upper()
        if sn.startswith('ZTE'): return 'ZTE'
        if sn.startswith('FHT'): return 'FiberHome'
        if sn.startswith('HW'): return 'Huawei'
        if sn.startswith('GPON'): return 'GPON'
        return 'Unknown'

    old_vendor = get_vendor(old_serial)
    new_vendor = get_vendor(new_serial)

    logger.info(f"[replace-onu] ONU {onu_id} ({device_type}): old SN={old_serial} ({old_vendor}) -> new SN={new_serial} ({new_vendor}) by user={current_user.username}")

    if old_vendor != new_vendor and old_vendor != 'Unknown' and new_vendor != 'Unknown':
        return jsonify({'success': False, 'message': f'Vendor mismatch: old ONU is {old_vendor} ({old_serial}), new SN is {new_vendor} ({new_serial}). ONU vendor must match.'})

    from snmp_collector import create_cli_collector
    tc = create_cli_collector(olt)
    onu_type = onu.onu_type or 'All'

    def progress_cb(step, msg):
        logger.info(f"[replace-onu] ONU {onu_id} step={step}: {msg}")

    success, msg = tc.replace_onu(
        onu.frame, onu.slot, onu.port, onu.onu_id,
        new_serial, old_serial=old_serial,
        is_epon=is_epon, onu_type=onu_type,
        progress_cb=progress_cb
    )

    logger.info(f"[replace-onu] ONU {onu_id} ({device_type}): final success={success} msg={msg}")

    if success:
        onu.serial_number = new_serial
        onu.status = 'offline'
        db.session.commit()
        _auto_sync_olt(onu.olt_id)
        _auto_write_config(onu.olt_id)
        log_action('onu_replace', 'onu', target=onu.onu_id_str or str(onu.id),
                   detail=f'Replaced ONU: {old_serial} -> {new_serial} — {msg}')

    return jsonify({'success': success, 'message': msg})


@bp.route('/api/onu-types', methods=['GET'])
@login_required
def get_onu_types():
    """Get ONU types list from OLT for dropdown selection."""
    olt_id = request.args.get('olt_id')
    if not olt_id:
        # Use first OLT
        olt = OLT.query.first()
    else:
        olt = db.session.get(OLT, int(olt_id))
    if not olt:
        return jsonify({'success': False, 'types': []})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    types = tc.collect_onu_types()
    type_names = [t.get('type_name', '') for t in types if t.get('type_name')]
    type_names.sort()
    return jsonify({'success': True, 'types': type_names})


@bp.route('/api/onu/<int:onu_id>/wan-service/<int:svc_idx>', methods=['POST'])
@permission_required('configure_onu')
def onu_wan_service_edit(onu_id, svc_idx):
    """Edit WAN service configuration via CLI (SSH or Telnet).
    Matches R-Config modal: Status, VLAN, CoS, Download/Upload profiles,
    Mode (PPPoE NAT / Wan-IP / Bridge), with sub-options."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    if not olt or not olt.cli_enabled or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured'})
    data = request.get_json()
    logger.info(f"[wan-service] ONU {onu_id} svc={svc_idx} data={data} by user={current_user.username}")
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    try:
        tn = tc._connect()
        if not tn:
            return jsonify({'success': False, 'message': 'CLI connection failed'})
        is_epon = (onu.card or '').lower() == 'epon'
        onu_pfx = 'epon-onu' if is_epon else 'gpon-onu'
        onu_path = f'{onu_pfx}_{onu.frame}/{onu.slot}/{onu.port}:{onu.onu_id}'
        tc._send_command(tn, 'configure terminal', timeout=10)
        import time as _t

        mode = data.get('mode', 'Bridge / ONU Webpage')
        vlan = str(data.get('vlan', '')).strip()
        service_name = data.get('service_name', f'service{svc_idx}')
        download = data.get('download_profile', '')
        upload = data.get('upload_profile', '')
        status = data.get('status', 'enable')
        last_err = None

        # ── EPON: only service-port applies, skip GPON OMCI commands ──
        if is_epon:
            tc._send_command(tn, f'interface {onu_path}', timeout=10)
            # Remove old service-port (ignore errors — may not exist)
            tc._send_command(tn, f'no service-port {svc_idx}', timeout=10)
            if status == 'enable' and vlan:
                _, err = tc._send_cmd_check(tn, f'service-port {svc_idx} vport {svc_idx} user-vlan {vlan} vlan {vlan}', timeout=10)
                if err:
                    last_err = err
            tc._send_command(tn, 'end', timeout=5)
            tn.close()
            if last_err:
                return jsonify({'success': False, 'message': f'CLI error: {last_err}'})
            logger.info(f"[wan-service] EPON ONU {onu_id} svc={svc_idx} vlan={vlan} status={status} — service-port only")
            return jsonify({'success': True, 'message': f'WAN Service {svc_idx} updated (EPON mode: service-port only)'})

        def sc(cmd):
            nonlocal last_err
            _, err = tc._send_cmd_check(tn, cmd, timeout=10)
            if err:
                low = err.lower()
                logger.warning(f"[wan-service] CLI cmd='{cmd[:80]}' err='{err[:120]}'")
                # Ignore: "does not exist", specific firmware limitation code
                if 'does not exist' in low or '%code 63990' in low:
                    logger.debug(f"Ignored CLI: {cmd[:60]} -> {err[:80]}")
                # Handle 63869 "Record already exists" — force delete and retry once
                elif '63869' in low or 'already exists' in low:
                    logger.warning(f"Record exists, force-replacing: {cmd[:60]}")
                    # Extract pppoe/wan-ip index from command
                    if cmd.startswith('pppoe '):
                        idx = cmd.split()[1]
                        tc._send_command(tn, f'no wan {idx} service', timeout=10)
                        tc._send_command(tn, f'no pppoe {idx}', timeout=10)
                        _t.sleep(0.5)
                        _, err2 = tc._send_cmd_check(tn, cmd, timeout=10)
                        if err2 and ('63869' in err2.lower() or 'already exists' in err2.lower()):
                            last_err = err2  # Still fails after retry
                        elif err2:
                            last_err = err2
                    elif cmd.startswith('wan-ip '):
                        idx = cmd.split()[1]
                        tc._send_command(tn, f'no wan-ip {idx}', timeout=10)
                        _t.sleep(0.5)
                        _, err2 = tc._send_cmd_check(tn, cmd, timeout=10)
                        if err2:
                            last_err = err2
                    elif cmd.startswith('service '):
                        # Service record exists — delete and retry
                        tc._send_command(tn, f'no {cmd}', timeout=10)
                        _t.sleep(0.5)
                        _, err2 = tc._send_cmd_check(tn, cmd, timeout=10)
                        if err2:
                            last_err = err2
                    elif cmd.startswith('wan '):
                        # wan N service ... — delete and retry
                        idx = cmd.split()[1]
                        tc._send_command(tn, f'no wan {idx} service', timeout=10)
                        _t.sleep(0.5)
                        _, err2 = tc._send_cmd_check(tn, cmd, timeout=10)
                        if err2:
                            last_err = err2
                    else:
                        last_err = err
                else:
                    last_err = err

        # ── Step 1: interface context ────────────────────────────────────────
        # Must create TCONT + gemport BEFORE pon-onu-mng service command,
        # otherwise ZTE returns %Code 62397-GPONSRV: The entry is not existed.
        tc._send_command(tn, f'interface {onu_path}', timeout=10)

        # Remove old service-port (ignore errors — may not exist)
        tc._send_command(tn, f'no service-port {svc_idx}', timeout=10)

        if status == 'enable':
            # TCONT: assign upload profile (idempotent — ignore error if tcont already configured)
            if upload:
                tc._send_command(tn, f'tcont {svc_idx} profile {upload}', timeout=10)

            # gemport: bind to TCONT (idempotent — ignore error if gemport already exists)
            tc._send_command(tn, f'gemport {svc_idx} tcont {svc_idx}', timeout=10)

            # service-port: OLT-side VLAN mapping (idempotent — ignore error)
            if vlan:
                tc._send_command(tn, f'service-port {svc_idx} vport {svc_idx} user-vlan {vlan} vlan {vlan}', timeout=10)

            # downstream traffic profile (idempotent — ignore if profile unchanged)
            if download and download != 'default':
                tc._send_command(tn, f'gemport {svc_idx} traffic-limit downstream {download}', timeout=10)

        tc._send_command(tn, 'exit', timeout=5)

        # ── Step 2: pon-onu-mng context ──────────────────────────────────────
        tc._send_command(tn, f'pon-onu-mng {onu_path}', timeout=10)

        # Detect non-ZTE ONU (FiberHome etc) — uses VEIP mode (single virtual port, host 1)
        # FiberHome OMCI does NOT support PPPoE IE — only Bridge and wan-ip dhcp work
        sn = (onu.serial_number or '').upper()
        use_veip = sn and not sn.startswith('ZTEG') and not sn.startswith('ZTE')
        wan_host = '1' if use_veip else str(svc_idx)

        # VEIP ONUs don't support PPPoE OMCI — reject early with clear error
        if status == 'enable' and use_veip and mode == 'PPPoE NAT':
            tn.close()
            return jsonify({'success': False, 'message': 'PPPoE NAT tidak didukung untuk ONU FiberHome (VEIP). Gunakan Bridge atau Wan-IP DHCP.'})
        if status == 'enable' and use_veip and mode == 'Wan-IP' and data.get('wan_ip_mode', 'dhcp').lower() == 'pppoe':
            tn.close()
            return jsonify({'success': False, 'message': 'Wan-IP PPPoE tidak didukung untuk ONU FiberHome (VEIP). Gunakan DHCP atau Static.'})

        # Clean up old ONU-side service entries — order matters on ZTE!
        # Must remove WAN service binding BEFORE pppoe/wan-ip, else "Record already exists" (63869)
        tc._send_command(tn, f'no service {service_name}', timeout=10)
        tc._send_command(tn, f'no service {svc_idx}', timeout=10)
        tc._send_command(tn, f'no wan {svc_idx} service', timeout=10)
        tc._send_command(tn, f'no wan-ip {svc_idx}', timeout=10)
        tc._send_command(tn, f'no pppoe {svc_idx}', timeout=10)
        # Brief pause for OLT to process OMCI deletions before re-creating
        import time as _t; _t.sleep(1)

        if status == 'enable':
            if mode == 'Bridge / ONU Webpage':
                cmd = f'service {service_name} gemport {svc_idx}'
                if vlan:
                    cmd += f' vlan {vlan}'
                sc(cmd)

            elif mode == 'PPPoE NAT':
                # ZTE ONUs: use iphost + pppoe nat
                cmd = f'service {service_name} gemport {svc_idx} iphost {svc_idx}'
                if vlan:
                    cmd += f' vlan {vlan}'
                sc(cmd)
                username = data.get('pppoe_username', '')
                password = data.get('pppoe_password', '')
                if username:
                    sc(f'pppoe {svc_idx} nat enable user {username} password {password}')
                    sc(f'wan {svc_idx} service internet host {svc_idx}')

            elif mode == 'Wan-IP':
                # ZTE ONUs: use iphost. VEIP ONUs: use host 1 (VEIP port, no iphost)
                if use_veip:
                    cmd = f'service {service_name} gemport {svc_idx}'
                else:
                    cmd = f'service {service_name} gemport {svc_idx} iphost {svc_idx}'
                if vlan:
                    cmd += f' vlan {vlan}'
                sc(cmd)
                wan_ip_mode = data.get('wan_ip_mode', 'dhcp').lower()
                vlan_profile = data.get('vlan_profile', '')
                if wan_ip_mode == 'dhcp':
                    if vlan_profile:
                        cmd = f'wan-ip {svc_idx} mode dhcp vlan-profile {vlan_profile} host {wan_host}'
                        sc(cmd)
                    else:
                        tc._send_command(tn, f'wan-ip {svc_idx} mode dhcp host {wan_host}', timeout=10)
                    if data.get('ping_response'):
                        tc._send_command(tn, f'wan-ip {svc_idx} ping-response enable', timeout=10)
                    if data.get('traceroute_response'):
                        tc._send_command(tn, f'wan-ip {svc_idx} traceroute-response enable', timeout=10)
                elif wan_ip_mode == 'static':
                    ip = data.get('wan_ip', '')
                    mask = data.get('wan_netmask', '')
                    gw = data.get('wan_gateway', '')
                    dns1 = data.get('wan_dns1', '')
                    cmd = f'wan-ip {svc_idx} mode static'
                    if vlan_profile:
                        cmd += f' vlan-profile {vlan_profile}'
                    cmd += f' host {wan_host}'
                    if ip: cmd += f' ipaddress {ip}'
                    if mask: cmd += f' netmask {mask}'
                    if gw: cmd += f' gateway {gw}'
                    if dns1: cmd += f' dns {dns1}'
                    sc(cmd)

        tc._send_command(tn, 'end', timeout=10)
        tn.close()
        if last_err:
            return jsonify({'success': False, 'message': f'CLI error: {last_err}'})
        return jsonify({'success': True, 'message': f'WAN Service {svc_idx} updated'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/onu/<int:onu_id>/wan-service/<int:svc_idx>', methods=['DELETE'])
@permission_required('configure_onu')
def onu_wan_service_delete(onu_id, svc_idx):
    """Delete a WAN service configuration via CLI (SSH or Telnet).
    Removes: service, wan-ip, pppoe, service-port, tcont, gemport for the given index."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    if not olt or not olt.cli_enabled or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured'})
    logger.info(f"[wan-service-delete] ONU {onu_id} svc={svc_idx} by user={current_user.username}")
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    try:
        tn = tc._connect()
        if not tn:
            return jsonify({'success': False, 'message': 'CLI connection failed'})
        is_epon = (onu.card or '').lower() == 'epon'
        onu_pfx = 'epon-onu' if is_epon else 'gpon-onu'
        onu_path = f'{onu_pfx}_{onu.frame}/{onu.slot}/{onu.port}:{onu.onu_id}'

        # Step 1: interface context — remove service-port, tcont, gemport
        tc._send_command(tn, 'configure terminal', timeout=10)
        tc._send_command(tn, f'interface {onu_path}', timeout=10)
        tc._send_command(tn, f'no service-port {svc_idx}', timeout=10)
        if not is_epon:
            tc._send_command(tn, f'no gemport {svc_idx}', timeout=10)
            tc._send_command(tn, f'no tcont {svc_idx}', timeout=10)
        tc._send_command(tn, 'exit', timeout=5)

        # Step 2: pon-onu-mng context — remove ONU-side service entries
        if not is_epon:
            tc._send_command(tn, f'pon-onu-mng {onu_path}', timeout=10)
            tc._send_command(tn, f'no service service{svc_idx}', timeout=10)
            tc._send_command(tn, f'no service {svc_idx}', timeout=10)
            tc._send_command(tn, f'no wan {svc_idx} service', timeout=10)
            tc._send_command(tn, f'no wan-ip {svc_idx}', timeout=10)
            tc._send_command(tn, f'no pppoe {svc_idx}', timeout=10)
            tc._send_command(tn, 'end', timeout=10)

        tn.close()
        logger.info(f"[wan-service-delete] ONU {onu_id} svc={svc_idx} deleted successfully")
        return jsonify({'success': True, 'message': f'WAN Service {svc_idx} deleted'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/onu/<int:onu_id>/update-field', methods=['POST'])
@login_required
def update_onu_field(onu_id):
    """Update a single ONU field with confirmation message."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = db.session.get(OLT, onu.olt_id) if onu.olt_id else None
    data = request.get_json()
    field = data.get('field')
    value = data.get('value', '').strip()
    logger.info(f"[update-field] ONU {onu_id} field='{field}' value='{value}' by user={current_user.username}")

    field_perms = {
        'name': 'edit_onu_name',
        'description': 'edit_onu_description',
        'actual_type': 'edit_onu_name',
        'onu_type': 'configure_onu',
        'serial_number': 'configure_onu',
        'onu_id': 'configure_onu',
    }
    required_perm = field_perms.get(field, 'configure_onu')
    if not current_user.has_permission(required_perm):
        return jsonify({'success': False, 'message': f'Permission denied: {required_perm}'}), 403

    def _send_onu_cli(olt, onu, cmd):
        """Helper: send CLI command to ONU interface on OLT (ZTE only)."""
        if not olt or not olt.cli_enabled or not olt.cli_username:
            return
        try:
            from snmp_collector import create_cli_collector
            tc = create_cli_collector(olt)
            tn = tc._connect()
            if tn:
                is_epon = (onu.card or '').lower() == 'epon'
                onu_pfx = 'epon-onu' if is_epon else 'gpon-onu'
                onu_if = f'{onu_pfx}_{onu.frame}/{onu.slot}/{onu.port}:{onu.onu_id}'
                tc._send_command(tn, 'end')
                tc._send_command(tn, 'configure terminal')
                tc._send_command(tn, f'interface {onu_if}')
                tc._send_command(tn, cmd)
                tc._send_command(tn, 'end')
                tn.close()
                logger.info(f"[update_onu_field] CLI: '{cmd}' on {onu_if}")
        except Exception as e:
            logger.warning(f"[update_onu_field] CLI failed: {e}")

    if field == 'name':
        onu.name = value
        is_epon = (onu.card or '').lower() == 'epon'
        if is_epon:
            _send_onu_cli(olt, onu, f'property description $${value}$${onu.description or ""}')
        else:
            _send_onu_cli(olt, onu, f'name {value}')
    elif field == 'description':
        onu.description = value
        is_epon = (onu.card or '').lower() == 'epon'
        if is_epon:
            _send_onu_cli(olt, onu, f'property description $${onu.name or ""}$${value}')
        else:
            _send_onu_cli(olt, onu, f'description {value}')
    elif field == 'actual_type':
        onu.actual_type = value
    elif field == 'onu_type':
        onu.onu_type = value
        # Send CLI to OLT — re-register ONU with new type (preserves existing config)
        if olt and olt.cli_enabled and olt.cli_username:
            try:
                from snmp_collector import create_cli_collector
                tc = create_cli_collector(olt)
                tn = tc._connect()
                if tn:
                    is_epon = (onu.card or '').lower() == 'epon'
                    olt_pfx = 'epon-olt' if is_epon else 'gpon-olt'
                    pon_if = f'{olt_pfx}_{onu.frame}/{onu.slot}/{onu.port}'
                    tc._send_command(tn, 'end')
                    tc._send_command(tn, 'configure terminal')
                    tc._send_command(tn, f'interface {pon_if}')
                    # Re-register with new type WITHOUT removing first — preserves config
                    # EPON uses 'mac' keyword, GPON uses 'sn' keyword
                    if is_epon:
                        from telnet_client import _format_epon_mac
                        tc._send_command(tn, f'onu {onu.onu_id} type {value} mac {_format_epon_mac(onu.serial_number)}')
                    else:
                        tc._send_command(tn, f'onu {onu.onu_id} type {value} sn {onu.serial_number}')
                    tc._send_command(tn, 'end')
                    tn.close()
                    logger.info(f"[update_onu_type] CLI: re-registered ONU {onu.onu_id} type={value}")
            except Exception as e:
                logger.warning(f"[update_onu_type] CLI failed: {e}")
    elif field == 'serial_number':
        onu.serial_number = value
    elif field == 'onu_id':
        try:
            new_oid = int(value)
            if 1 <= new_oid <= 128:
                onu.onu_id = new_oid
            else:
                return jsonify({'success': False, 'message': 'ONU ID must be 1–128'})
        except (ValueError, TypeError):
            return jsonify({'success': False, 'message': 'Invalid ONU ID'})
    else:
        return jsonify({'success': False, 'message': f'Unknown field: {field}'})
    db.session.commit()
    logger.info(f"[update-field] DB committed: ONU {onu_id} {field}='{value}' (verified: {getattr(onu, field, 'N/A')})")
    try:
        from cache import cache_clear
        cache_clear("dashboard:*")
        if onu.olt_id:
            cache_clear(f"olt:{onu.olt_id}:*")
    except Exception:
        pass

    log_action('onu_field_update', 'onu', target=onu.onu_id_str or str(onu.id), detail=f'{field}="{value}"')
    # Auto-save config to startup-config for fields that modify OLT running-config
    if field in ('name', 'description', 'onu_type'):
        _auto_write_config(onu.olt_id)
    return jsonify({'success': True, 'message': f'{field} updated to "{value}"'})


@bp.route('/api/onu/<int:onu_id>/section-config', methods=['POST'])
@permission_required('configure_onu')
def onu_section_config(onu_id):
    """Update section config (WiFi/LAN/VEIP/TR069) on OLT via CLI (SSH or Telnet).
    Uses correct ZTE C320 pon-onu-mng context commands."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    if not olt or not olt.cli_enabled or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})
    # Every command below is ZTE C320 pon-onu-mng syntax. Running it against
    # another vendor produces confusing CLI syntax errors, so refuse up front.
    vendor = (olt.vendor or 'zte').lower()
    if vendor != 'zte':
        return jsonify({
            'success': False,
            'message': f'Section config is not supported for {vendor.upper()} OLTs. '
                       f'This feature uses ZTE C320 CLI commands.',
        }), 400
    data = request.get_json()
    section = data.get('section')
    # CLI indices are always 1-based. Frontend sends 0-based array index.
    # R-Config hardcodes tr069-mgmt index to 1, ACL starts at 1 and auto-increments.
    raw_idx = data.get('index', 0)
    action = data.get('action', 'save')
    cfg_data = data.get('data', {})
    logger.info(f"[section-config] ONU {onu_id} section='{section}' action='{action}' idx={raw_idx} data={cfg_data} by user={current_user.username}")

    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)

    try:
        tn = tc._connect()
        if not tn:
            return jsonify({'success': False, 'message': 'CLI connection failed'})

        is_epon = (onu.card or '').lower() == 'epon'
        onu_pfx = 'epon-onu' if is_epon else 'gpon-onu'
        onu_path = f'{onu_pfx}_{onu.frame}/{onu.slot}/{onu.port}:{onu.onu_id}'
        msg = ''
        ok = False
        last_err = None

        # Errors meaning "the ONU/firmware cannot do this" rather than
        # "the operation failed" — always tolerated.
        firmware_limit_errors = ('%code 63990', 'ont return error', '%error 20202')
        # Syntax rejections — the keyword does not exist on this firmware build.
        syntax_errors = ('%error 20201', 'invalid input', 'invalid command')

        def sc(cmd, optional=False):
            """Send a command; return the error string, or None on success.

            optional=True marks firmware-dependent command variants, where a
            syntax rejection means "not supported on this build" and must not
            fail the whole request.
            """
            nonlocal last_err
            _, err = tc._send_cmd_check(tn, cmd, timeout=10)
            if not err or 'does not exist' in err.lower():
                return None
            low = err.lower()
            if any(e in low for e in firmware_limit_errors):
                logger.debug(f"ONU firmware limitation: {cmd[:60]} -> {err[:80]}")
                return err
            if optional and any(e in low for e in syntax_errors):
                logger.debug(f"Command unsupported on this firmware: {cmd[:60]} -> {err[:80]}")
                return err
            last_err = err
            return err

        if section == 'wifi':
            # Use ssid_num from payload if provided (actual SSID 1-8), else fall back to index+1
            cli_idx = int(cfg_data.get('ssid_num', raw_idx + 1))
            tc._send_command(tn, 'configure terminal', timeout=10)
            tc._send_command(tn, f'pon-onu-mng {onu_path}', timeout=10)

            if action == 'delete':
                # Remove SSID from OLT: clear name, auth, and VLAN config
                sc(f'no ssid ctrl wifi_0/{cli_idx} name', optional=True)
                sc(f'ssid auth wpa wifi_0/{cli_idx} no-auth', optional=True)
                sc(f'ssid auth wpa wifi_0/{cli_idx} encrypt none', optional=True)
                sc(f'ssid auth wpa wifi_0/{cli_idx} no-key', optional=True)
                tc._send_command(tn, f'no vlan port wifi_0/{cli_idx} mode', timeout=10)
                logger.info(f"[section-config] WiFi delete: ONU {onu_id} SSID {cli_idx} — CLI commands sent")

                # Remove SSID from DB wifi_config
                import json as _json_wdel
                existing_wifi = {}
                if onu.wifi_config:
                    try:
                        existing_wifi = _json_wdel.loads(onu.wifi_config)
                    except Exception:
                        existing_wifi = {}
                ssids_list = existing_wifi.get('ssids', [])
                ssids_list = [s for s in ssids_list if int(s.get('ssid_num', 0)) != cli_idx]
                existing_wifi['ssids'] = ssids_list
                onu.wifi_config = _json_wdel.dumps(existing_wifi)
                db.session.commit()
                logger.info(f"[section-config] WiFi delete: DB updated — {len(ssids_list)} SSIDs remaining")

                ok, msg = True, f'WiFi SSID {cli_idx} deleted'
            else:
                mode = cfg_data.get('wifiMode', 'N/A')
                status = cfg_data.get('wifiStatus', 'enable')
                new_vlan = cfg_data.get('vlan', '')
                new_priority = cfg_data.get('priority', '')

                # Enable/disable WiFi radio interface (lock = disable, unlock = enable)
                if status == 'disable':
                    sc(f'interface wifi_0/{cli_idx} state lock')
                else:
                    sc(f'interface wifi_0/{cli_idx} state unlock', optional=True)

                # Set VLAN config (only when enabled and mode is not N/A)
                if status == 'enable' and mode != 'N/A':
                    tc._send_command(tn, f'no vlan port wifi_0/{cli_idx} mode', timeout=10)
                    if mode == 'Access' and new_vlan:
                        sc(f'vlan port wifi_0/{cli_idx} mode tag vlan {new_vlan}')
                    elif mode == 'Hybrid' and new_vlan:
                        sc(f'vlan port wifi_0/{cli_idx} mode hybrid def-vlan {new_vlan}')
                    elif mode == 'Trunk':
                        sc(f'vlan port wifi_0/{cli_idx} mode trunk')
                    # Try priority as separate optional command (not all firmware supports it)
                    if new_priority and str(new_priority) != '0':
                        err = sc(f'vlan port wifi_0/{cli_idx} priority {new_priority}', optional=True)
                        logger.info(f'[WIFI] priority {new_priority} for wifi_0/{cli_idx}: {"unsupported" if err else "ok"}')
                elif mode == 'N/A' or status == 'disable':
                    tc._send_command(tn, f'no vlan port wifi_0/{cli_idx} mode', timeout=10)
                # SSID broadcast name — correct ZTE C320 pon-onu-mng syntax: 'ssid ctrl wifi_0/N name'
                ssid_name = cfg_data.get('ssid_name', '').strip().replace(' ', '_')
                if ssid_name:
                    sc(f'ssid ctrl wifi_0/{cli_idx} name {ssid_name}')

                # SSID authentication — correct ZTE C320 syntax: 'ssid auth wpa wifi_0/N ...'
                ssid_auth = cfg_data.get('ssid_auth_type', '').strip()  # 'wpa2-psk', 'wpa-psk', 'wpa-wpa2-psk', or 'open'
                ssid_pass = cfg_data.get('ssid_password', '').strip()
                if ssid_auth in ('wpa2-psk', 'wpa-psk', 'wpa-wpa2-psk') and ssid_pass:
                    sc(f'ssid auth wpa wifi_0/{cli_idx} {ssid_auth}')
                    sc(f'ssid auth wpa wifi_0/{cli_idx} encrypt aes')
                    sc(f'ssid auth wpa wifi_0/{cli_idx} key {ssid_pass}')
                elif ssid_auth == 'open':
                    # Firmware builds express "open" auth differently and reject the
                    # variants they don't implement with %Error 20201. Try them all
                    # and treat the SSID as configured if any one is accepted.
                    open_cmds = (
                        f'ssid auth wpa wifi_0/{cli_idx} no-auth',
                        f'ssid auth wpa wifi_0/{cli_idx} encrypt none',
                        f'ssid auth wpa wifi_0/{cli_idx} no-key',
                        f'ssid auth wep wifi_0/{cli_idx} open-system',
                    )
                    accepted = [c for c in open_cmds if sc(c, optional=True) is None]
                    if accepted:
                        logger.info(f'[WIFI] Open auth set for wifi_0/{cli_idx} via: {"; ".join(accepted)}')
                    else:
                        last_err = f'ONU firmware rejected all open-auth commands for wifi_0/{cli_idx}'
                        logger.warning(last_err)

                ok, msg = True, f'WiFi SSID {cli_idx} config updated'

                # Save WiFi config to database
                import json as _json_wifi
                existing_wifi = {}
                if onu.wifi_config:
                    try:
                        existing_wifi = _json_wifi.loads(onu.wifi_config)
                    except Exception:
                        existing_wifi = {}
                ssids_list = existing_wifi.get('ssids', [])
                ssid_entry = {
                    'ssid_num': cli_idx,
                    'ssid_name': ssid_name,
                    'ssid_auth_type': ssid_auth,
                    'ssid_password': ssid_pass,
                    'wifi_mode': mode,
                    'wifi_status': status,
                    'vlan': new_vlan,
                }
                found = False
                for i, s in enumerate(ssids_list):
                    if s.get('ssid_num') == cli_idx:
                        ssids_list[i] = ssid_entry
                        found = True
                        break
                if not found:
                    ssids_list.append(ssid_entry)
                existing_wifi['ssids'] = ssids_list
                onu.wifi_config = _json_wifi.dumps(existing_wifi)
                db.session.commit()
                logger.info(f"[section-config] WiFi DB saved: ONU {onu_id} SSID {cli_idx} '{ssid_name}' auth={ssid_auth} — {len(ssids_list)} SSIDs total")

        elif section == 'lan':
            cli_idx = raw_idx + 1
            tc._send_command(tn, 'configure terminal', timeout=10)
            tc._send_command(tn, f'pon-onu-mng {onu_path}', timeout=10)
            mode = cfg_data.get('lanMode', 'Access')
            status = cfg_data.get('lanStatus', 'enable')
            new_vlan = cfg_data.get('access_vlan', '')

            # ZTE C320: 'interface eth eth_0/N state lock/unlock' enters a sub-context.
            # The pon-onu-mng parser must NOT treat 'interface eth' as a section boundary.
            # VLAN config is preserved through lock/unlock — no re-apply needed.

            # Step 1: Set VLAN config if provided
            if new_vlan:
                tc._send_command(tn, f'no vlan port eth_0/{cli_idx} mode', timeout=10)
                if mode == 'Access':
                    sc(f'vlan port eth_0/{cli_idx} mode tag vlan {new_vlan}')
                elif mode == 'Trunk':
                    sc(f'vlan port eth_0/{cli_idx} mode trunk')
                elif mode == 'Hybrid':
                    sc(f'vlan port eth_0/{cli_idx} mode hybrid def-vlan {new_vlan}')

            # Step 2: Lock/Unlock (enters sub-context, exits back automatically)
            state = 'unlock' if status == 'enable' else 'lock'
            sc(f'interface eth eth_0/{cli_idx} state {state}')

            ok, msg = True, 'LAN config updated'

        elif section == 'veip':
            cli_idx = raw_idx + 1
            tc._send_command(tn, 'configure terminal', timeout=10)
            tc._send_command(tn, f'pon-onu-mng {onu_path}', timeout=10)
            mode = cfg_data.get('mode', 'hybrid').lower()
            sc(f'vlan port veip_{cli_idx} mode {mode}')
            ok, msg = True, 'VEIP config updated'

        elif section == 'tr069':
            # R-Config ALWAYS uses tr069-mgmt index 1 (hardcoded)
            cli_idx = 1
            tc._send_command(tn, 'configure terminal', timeout=10)
            tc._send_command(tn, f'pon-onu-mng {onu_path}', timeout=10)
            status = cfg_data.get('tr069Status', 'enable')
            acs_url = cfg_data.get('acs_url', '')
            username = cfg_data.get('username', '')
            password = cfg_data.get('password', '')
            vlan = cfg_data.get('vlan', '')
            priority = cfg_data.get('priority', '0')
            if status == 'disable':
                # R-Config: lock/disable TR069
                sc(f'tr069-mgmt {cli_idx} state lock')
            else:
                # R-Config: unlock → acs → tag (separate commands)
                # Note: 'state enable' is NOT valid on some ONU firmwares, only unlock/lock/disable
                sc(f'tr069-mgmt {cli_idx} state unlock')
                if acs_url:
                    acs_cmd = f'tr069-mgmt {cli_idx} acs {acs_url} validate basic'
                    if username:
                        acs_cmd += f' username {username}'
                    if password:
                        acs_cmd += f' password {password}'
                    sc(acs_cmd)
                if vlan and vlan.lower() not in ('untag', 'none', '0', ''):
                    sc(f'tr069-mgmt {cli_idx} tag pri {priority} vlan {vlan}')
                else:
                    # Remove existing tag when switching to untag mode
                    sc(f'tr069-mgmt {cli_idx} untag')
            ok, msg = True, 'TR069 config updated'

        elif section == 'acl':
            tc._send_command(tn, 'configure terminal', timeout=10)
            tc._send_command(tn, f'pon-onu-mng {onu_path}', timeout=10)
            if action == 'delete':
                # raw_idx is already 1-based acl_id from frontend
                acl_idx = raw_idx if raw_idx > 0 else 1
                tc._send_command(tn, f'no security-mgmt {acl_idx}', timeout=10)
                ok, msg = True, 'ACL rule deleted'
            else:
                # raw_idx is already 1-based acl_id from frontend
                acl_idx = raw_idx if raw_idx > 0 else 1
                # Normalize mode: frontend may send 'forward'/'block'/'allow'/'block'
                acl_mode_raw = cfg_data.get('mode', 'forward').lower()
                acl_mode = 'forward' if acl_mode_raw in ('forward', 'allow', 'permit') else 'block'
                services = cfg_data.get('service_list', 'HTTP').upper()
                svc_map = {
                    'HTTP': 'web', 'WEB': 'web', 'HTTPS': 'https',
                    'SNMP': 'snmp', 'SSH': 'ssh', 'TELNET': 'telnet',
                    'FTP': 'ftp', 'TR069': 'tr069'
                }
                protocol_parts = []
                for svc in services.split(','):
                    svc = svc.strip()
                    proto = svc_map.get(svc, svc.lower())
                    if proto:
                        protocol_parts.append(proto)
                # Build protocol string: all protocols in one command
                if not protocol_parts:
                    protocol_parts = ['web']
                proto_str = ' '.join(protocol_parts)
                cmd = f'security-mgmt {acl_idx} state enable mode {acl_mode} protocol {proto_str}'
                _, err = tc._send_cmd_check(tn, cmd, timeout=10)
                if err and ('return error' in err.lower() or '%code' in err.lower() or '%error' in err.lower()):
                    # ONU firmware doesn't support protocol parameter
                    # Fallback: simple mode without protocol
                    _, fallback_err = tc._send_cmd_check(tn, f'security-mgmt {acl_idx} state enable mode {acl_mode}', timeout=10)
                    if fallback_err and ('return error' in fallback_err.lower() or '%code' in fallback_err.lower() or '%error' in fallback_err.lower()):
                        last_err = 'ONU firmware does not support ACL/Remote Access (security-mgmt)'
                    elif fallback_err:
                        last_err = fallback_err
                elif err:
                    last_err = err
            ok, msg = True, 'ACL config updated'

        else:
            return jsonify({'success': False, 'message': f'Unknown section: {section}'})

        # Properly exit from any context back to exec mode
        # (interface wifi/eth may have entered a sub-context)
        tc._send_command(tn, 'end', timeout=10)
        tn.close()
        if last_err:
            return jsonify({'success': False, 'message': f'CLI error: {last_err}'})
        if ok:
            log_action('onu_section_config', 'onu', target=onu.onu_id_str or str(onu.id), detail=f'{section} {action}')
            # Auto-sync OLT after config change (light, SNMP-only)
            if section in ('wifi', 'lan', 'veip', 'tr069'):
                _auto_sync_olt(onu.olt_id)
        return jsonify({'success': ok, 'message': msg})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/onu/<int:onu_id>/history', methods=['GET'])
@login_required
def onu_history(onu_id):
    """Get ONU event history (last 10 events)."""
    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    if not olt or not olt.cli_enabled:
        return jsonify({'success': True, 'events': []})
    # EPON ONUs don't support 'show gpon onu history' — return empty
    if (onu.card or '').lower() == 'epon':
        return jsonify({'success': True, 'events': []})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    events = tc.collect_onu_history(onu.frame, onu.slot, onu.port, onu.onu_id)
    return jsonify({'success': True, 'events': events})


_traffic_cache = {}  # onu_id -> {'ts': timestamp, 'down': bytes, 'up': bytes}


@bp.route('/api/onu/<int:onu_id>/traffic', methods=['GET'])
@login_required
def onu_traffic(onu_id):
    """Get live ONU traffic bandwidth using Total Bytes delta method (matching R-Config).

    Method: Read 'Total statistic: Input/Output: Bytes:XXX' from 'show interface gpon-onu_X/Y/Z:N',
    store previous reading, calculate delta_bytes / delta_time.

    Direction mapping for ZTE C320 GPON interface:
      - Download (user receives) = OLT Output = Output Bytes
      - Upload (user sends)     = OLT Input  = Input Bytes
    """
    import time as _time

    onu = db.session.get(ONU, onu_id)
    if not onu:
        return jsonify({'success': False, 'message': 'ONU not found'}), 404
    olt = onu.olt
    if not olt:
        return jsonify({'success': True, 'traffic': {'downstream_kbps': '0 Kbps', 'upstream_kbps': '0 Kbps'}})

    traffic = {'downstream_kbps': '0 Kbps', 'upstream_kbps': '0 Kbps'}

    if olt.cli_enabled and olt.cli_username:
        try:
            from snmp_collector import TelnetCollector, create_cli_collector
            tc = create_cli_collector(olt)
            tn = tc._connect()
            if tn:
                is_epon = (onu.card or '').lower() == 'epon'
                onu_pfx = 'epon-onu' if is_epon else 'gpon-onu'
                iface = f'{onu_pfx}_{onu.frame}/{onu.slot}/{onu.port}:{onu.onu_id}'
                output = tc._send_command(tn, f'show interface {iface}', timeout=10)
                tn.write('exit\n')
                tn.close()

                # Parse Total Bytes: "Bytes:11028174968" (GPON) or "Bytes        :11028174968" (EPON)
                input_bytes = None
                output_bytes = None
                in_total = False
                out_total = False
                for line in output.split('\n'):
                    ls = line.strip()
                    if 'Input:' in ls and 'Total' not in ls:
                        in_total = True; out_total = False
                    elif 'Output:' in ls:
                        in_total = False; out_total = True
                    elif ls.startswith('Bytes') and ':' in ls:
                        val_str = ls.split(':', 1)[1].strip().split()[0]
                        try:
                            val = int(val_str)
                            if in_total: input_bytes = val
                            elif out_total: output_bytes = val
                        except ValueError:
                            pass

                if input_bytes is not None and output_bytes is not None:
                    now = _time.time()
                    cache_key = f'traffic_{onu_id}'
                    prev = _traffic_cache.get(cache_key)

                    if prev and prev.get('in') is not None:
                        dt = now - prev['ts']
                        if dt > 0.5:
                            delta_in = input_bytes - prev['in']
                            delta_out = output_bytes - prev['out']
                            if delta_in < 0: delta_in += 2**32
                            if delta_out < 0: delta_out += 2**32

                            in_bps = (delta_in * 8) / dt
                            out_bps = (delta_out * 8) / dt
                            traffic['upstream_kbps'] = format_speed(in_bps)
                            traffic['downstream_kbps'] = format_speed(out_bps)

                    _traffic_cache[cache_key] = {'ts': now, 'in': input_bytes, 'out': output_bytes}

                    # If no previous data, try rate lines as fallback for first reading
                    if not prev:
                        for line in output.split('\n'):
                            ls = line.strip().lower()
                            if 'input rate' in ls and 'bps' in ls:
                                m = re.search(r'input\s+rate\s*:\s*([\d.]+)\s*(bps|kbps|mbps|gbps)', ls, re.IGNORECASE)
                                if m:
                                    val = float(m.group(1)); unit = m.group(2).lower()
                                    traffic['upstream_kbps'] = format_speed(_to_bps(val, unit))
                            elif 'output rate' in ls and 'bps' in ls:
                                m = re.search(r'output\s+rate\s*:\s*([\d.]+)\s*(bps|kbps|mbps|gbps)', ls, re.IGNORECASE)
                                if m:
                                    val = float(m.group(1)); unit = m.group(2).lower()
                                    traffic['downstream_kbps'] = format_speed(_to_bps(val, unit))
        except Exception as e:
            logger.debug(f"Traffic poll failed for ONU {onu_id}: {e}")

    return jsonify({'success': True, 'traffic': traffic})


def _to_bps(val, unit):
    """Convert a value with unit to bits-per-second."""
    if unit == 'gbps':
        return val * 1_000_000_000
    elif unit == 'mbps':
        return val * 1_000_000
    elif unit == 'kbps':
        return val * 1_000
    else:  # bps = bytes per second on ZTE
        return val * 8  # convert Bytes to bits


def format_speed(bps):
    """Format bits-per-second into human-readable string."""
    if bps >= 1_000_000_000:
        return f'{bps / 1_000_000_000:.1f} Gbps'
    elif bps >= 1_000_000:
        return f'{bps / 1_000_000:.1f} Mbps'
    elif bps >= 1_000:
        return f'{bps / 1_000:.1f} Kbps'
    else:
        return f'{bps:.0f} bps'


@bp.route('/api/provision/unified', methods=['POST'])
@permission_required('add_onu')
def provision_unified():
    """Unified ONU provisioning — works for all vendors with dynamic services."""
    data = request.get_json() or {}
    olt_id = data.get('olt_id')
    olt = db.session.get(OLT, olt_id) if olt_id else None
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})

    frame = data.get('frame', 1)
    slot = data.get('slot', 1)
    port = data.get('port', 1)
    onu_id = data.get('onu_id', 1)
    serial = data.get('serial', '')
    onu_type = data.get('onu_type', 'All')
    name = data.get('name', '')
    description = data.get('description', '')
    technician_id = data.get('technician_id')

    # Check register mode from request — SNMP or CLI (SSH/Telnet)
    use_snmp = data.get('register_mode', 'cli') == 'snmp' and olt.snmp_enabled

    tcont_profile = data.get('tcont_profile', 'default')
    traffic_profile = data.get('traffic_profile', '')
    services = data.get('services', [])
    use_veip = data.get('use_veip')  # None = auto-detect
    wifi_config = data.get('wifi_config')  # None = no wifi
    tr069_config = data.get('tr069_config')  # None = no tr069
    sla_profile = data.get('sla_profile', '')  # EPON SLA profile for speed limiting

    if wifi_config and isinstance(wifi_config, dict):
        ssids_log = wifi_config.get('ssids', [])
        logger.info(f"[provision_unified] WiFi config received: {len(ssids_log)} SSIDs")
        for s in ssids_log:
            logger.info(f"[provision_unified]   SSID {s.get('port','?')}: name='{s.get('name','')}' auth='{s.get('auth','')}' pass={'***' if s.get('pass') else '(empty)'} enabled={s.get('enabled',True)}")
    else:
        logger.info(f"[provision_unified] No WiFi config received (wifi_config={type(wifi_config).__name__})")

    if not serial:
        return jsonify({'success': False, 'message': 'Serial number required'})
    if not services:
        return jsonify({'success': False, 'message': 'At least one service required'})

    # Detect EPON from pon_port prefix or explicit is_epon flag
    pon_port = data.get('pon_port', '')
    is_epon = data.get('is_epon', False) or 'epon-olt' in pon_port or 'epon_olt' in pon_port
    # ZTE EPON universal onu-type is named 'ALL-EPON', not 'All' (GPON)
    if is_epon and onu_type.strip().upper() == 'ALL':
        onu_type = 'ALL-EPON'

    if use_snmp:
        from snmp_collector import create_snmp_collector, get_write_community
        collector = create_snmp_collector(olt)
        wc = get_write_community(olt)
        success, msg = collector.register_onu_snmp(
            frame, slot, port, onu_id, serial,
            onu_type=onu_type, name=name, description=description,
            write_community=wc,
        )
        collector.close()
        if success:
            log_action('onu_register', 'onu', target=f'gpon-onu_{frame}/{slot}/{port}:{onu_id}',
                       detail=f'Registered SN={serial} on {olt.name} as {onu_type} (SNMP)')
            if technician_id:
                onu = ONU.query.filter_by(olt_id=olt_id, frame=frame, slot=slot, port=port, onu_id=onu_id).first()
                if onu:
                    onu.technician_id = technician_id
                    db.session.commit()

            # G4 fix: SNMP can only do basic registration. Auto-fallback to CLI for service config.
            if olt.cli_enabled and olt.cli_username and not is_epon:
                logger.info(f"[provision_unified] SNMP registration done, falling back to CLI for service config")
                from snmp_collector import create_cli_collector
                tc = create_cli_collector(olt)
                svc_success, svc_msg = tc.register_unified(
                    frame=frame, slot=slot, port=port, onu_id=onu_id,
                    serial=serial, onu_type=onu_type, tcont_profile=tcont_profile,
                    services=services, use_veip=use_veip, traffic_profile=traffic_profile,
                    sla_profile=sla_profile,
                    wifi_config=wifi_config, tr069_config=tr069_config,
                    name=name, description=description, is_epon=is_epon,
                    skip_registration=True,
                )
                if svc_success:
                    msg = f'ONU registered via SNMP + services configured via Telnet'
                else:
                    msg = f'ONU registered via SNMP but service config failed: {svc_msg}'
            else:
                msg = f'ONU registered via SNMP (basic only — service config requires Telnet)'

            # Save to DB
            computed_index = frame * 100000 + slot * 10000 + port * 100 + onu_id
            existing = ONU.query.filter_by(
                olt_id=olt_id, frame=frame, slot=slot, port=port, onu_id=onu_id
            ).first()
            if not existing:
                onu = ONU(
                    olt_id=olt_id, frame=frame, slot=slot, port=port,
                    onu_id=onu_id, serial_number=serial,
                    onu_index=computed_index,
                    name=name or 'Unnamed', description=description or '',
                    status='offline', actual_type=onu_type, onu_type=onu_type,
                    technician_id=technician_id or None,
                    card='epon' if is_epon else '',
                )
                db.session.add(onu)
                db.session.commit()

            # Trigger background sync + auto-write config
            _auto_sync_olt(olt_id)
            _auto_write_config(olt_id)
            prefix = 'epon-onu' if is_epon else 'gpon-onu'
            log_action('onu_provision', 'onu', target=f'{prefix}_{frame}/{slot}/{port}:{onu_id}', detail=f'Provisioned SN={serial} on {olt.name} as {onu_type} (SNMP)')
        return jsonify({'success': success, 'message': msg})

    if not olt.cli_enabled or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT CLI access not configured'})

    from snmp_collector import create_cli_collector
    tc = create_cli_collector(olt)

    success, msg = tc.register_unified(
        frame=frame, slot=slot, port=port, onu_id=onu_id,
        serial=serial, onu_type=onu_type, tcont_profile=tcont_profile,
        services=services, use_veip=use_veip, traffic_profile=traffic_profile,
        sla_profile=sla_profile,
        wifi_config=wifi_config, tr069_config=tr069_config,
        name=name, description=description, is_epon=is_epon,
    )

    # Save to DB on success
    if success:
        # Compute onu_index matching sync format: frame*100000 + slot*10000 + port*100 + onu_id
        computed_index = frame * 100000 + slot * 10000 + port * 100 + onu_id
        existing = ONU.query.filter_by(
            olt_id=olt_id, frame=frame, slot=slot, port=port, onu_id=onu_id
        ).first()
        if not existing:
            onu = ONU(
                olt_id=olt_id, frame=frame, slot=slot, port=port,
                onu_id=onu_id, serial_number=serial,
                onu_index=computed_index,
                name=name or 'Unnamed', description=description or '',
                status='offline', actual_type=onu_type, onu_type=onu_type,
                technician_id=technician_id or None,
                card='epon' if is_epon else '',
            )
            db.session.add(onu)
            db.session.commit()

        # Trigger background sync to update status from OLT
        _auto_sync_olt(olt_id)
        # Auto-save config to startup-config so changes persist across reboots
        _auto_write_config(olt_id)
        prefix = 'epon-onu' if is_epon else 'gpon-onu'
        log_action('onu_provision', 'onu', target=f'{prefix}_{frame}/{slot}/{port}:{onu_id}', detail=f'Provisioned SN={serial} on {olt.name} as {onu_type}')

    return jsonify({'success': success, 'message': msg})


@bp.route('/api/pre-register', methods=['POST'])
@permission_required('add_onu')
def pre_register_onu():
    data = request.get_json()
    olt_id = data.get('olt_id')
    olt = db.session.get(OLT, olt_id) if olt_id else None
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})

    frame = data.get('frame', 1)
    slot = data.get('slot', 1)
    port = data.get('port', 1)
    onu_id = data.get('onu_id', 1)
    onu_type = data.get('onu_type', 'All')  # Default 'All' per oltc320 reference (universal type)
    serial = data.get('serial', '')
    vlan = data.get('vlan', 100)
    tcont_profile = data.get('tcont_profile', 'default')
    name = data.get('name', '')
    description = data.get('description', '')
    configure = data.get('configure', True)
    template = data.get('template', 'bridge')  # bridge|pppoe|fiberhome_veip|zte_full|zte_single|huawei_full|zte_multi
    extra = data.get('extra', {})  # Template-specific extra config
    traffic_profile = data.get('traffic_profile', '')
    sla_profile = data.get('sla_profile', '') or extra.get('sla_profile', '')
    if traffic_profile and 'traffic_profile' not in extra:
        extra['traffic_profile'] = traffic_profile

    # Check register mode from request — SNMP or CLI (SSH/Telnet)
    use_snmp = data.get('register_mode', 'cli') == 'snmp' and olt.snmp_enabled

    if use_snmp:
        from snmp_collector import create_snmp_collector, get_write_community
        collector = create_snmp_collector(olt)
        wc = get_write_community(olt)
        success, msg = collector.register_onu_snmp(
            frame, slot, port, onu_id, serial,
            onu_type=onu_type, name=name, description=description,
            write_community=wc,
        )
        collector.close()
        if success:
            log_action('onu_register', 'onu', target=f'gpon-onu_{frame}/{slot}/{port}:{onu_id}', detail=f'Registered SN={serial} on {olt.name} as {onu_type} (SNMP)')
            technician_id = data.get('technician_id')
            if technician_id:
                onu = ONU.query.filter_by(olt_id=olt_id, frame=frame, slot=slot, port=port, onu_id=onu_id).first()
                if onu:
                    onu.technician_id = technician_id
                    db.session.commit()

            # G5 fix: SNMP can only do basic registration. Auto-fallback to CLI for template config.
            if olt.cli_enabled and olt.cli_username:
                pon_port = data.get('pon_port', '')
                is_epon = data.get('is_epon', False) or 'epon-olt' in pon_port or 'epon_olt' in pon_port
                if is_epon and onu_type.strip().upper() == 'ALL':
                    onu_type = 'ALL-EPON'
                logger.info(f"[pre_register] SNMP registration done, falling back to CLI for service config")
                from snmp_collector import create_cli_collector
                tc = create_cli_collector(olt)
                # SNMP already registered the ONU — only configure service (TCONT/GEM/VLAN)
                # Use configure_onu_profile which skips the registration step
                svc_success, svc_msg = tc.configure_onu_profile(
                    frame=frame, slot=slot, port=port, onu_id=onu_id,
                    tcont_profile=tcont_profile,
                    user_vlan=vlan, service_vlan=vlan,
                    name=name, description=description, is_epon=is_epon,
                    sla_profile=sla_profile
                )
                if svc_success:
                    msg = f'ONU registered via SNMP + service configured via CLI'
                else:
                    msg = f'ONU registered via SNMP but service config failed: {svc_msg}'
            else:
                msg = f'ONU registered via SNMP (basic only — template config requires CLI)'

            # Auto-save config to startup-config
            _auto_write_config(olt_id)
        return jsonify({'success': success, 'message': msg})

    # CLI mode (SSH or Telnet)
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)

    # Log WiFi config from extra.ssids for debugging
    ssids_raw = extra.get('ssids', [])
    if ssids_raw:
        if isinstance(ssids_raw, str):
            import json as _json_dbg
            try: ssids_dbg = _json_dbg.loads(ssids_raw)
            except: ssids_dbg = []
        else:
            ssids_dbg = ssids_raw
        logger.info(f"[pre_register] WiFi config received: {len(ssids_dbg)} SSIDs (template={template})")
        for s in ssids_dbg:
            logger.info(f"[pre_register]   SSID {s.get('port','?')}: name='{s.get('name','')}' auth='{s.get('auth','')}' pass={'***' if s.get('pass') else '(empty)'} enabled={s.get('enabled',True)}")
    else:
        logger.info(f"[pre_register] No WiFi SSIDs in extra (template={template})")
    # Detect EPON from pon_port prefix or explicit is_epon flag
    pon_port = data.get('pon_port', '')
    is_epon = data.get('is_epon', False) or 'epon-olt' in pon_port or 'epon_olt' in pon_port
    # ZTE EPON universal onu-type is named 'ALL-EPON', not 'All' (GPON)
    if is_epon and onu_type.strip().upper() == 'ALL':
        onu_type = 'ALL-EPON'

    if template and template != 'bridge':
        success, msg = tc.register_vendor_template(
            frame=frame, slot=slot, port=port, onu_id=onu_id,
            serial=serial, template=template, onu_type=onu_type,
            tcont_profile=tcont_profile, vlan=vlan,
            name=name, description=description, extra=extra, is_epon=is_epon
        )
    elif configure:
        success, msg = tc.register_and_configure(
            frame=frame, slot=slot, port=port, onu_id=onu_id,
            onu_type=onu_type, serial=serial, vlan=vlan,
            tcont_profile=tcont_profile, name=name, description=description, is_epon=is_epon,
            sla_profile=sla_profile
        )
    else:
        success, msg = tc.register_onu(
            frame=frame, slot=slot, port=port, onu_id=onu_id,
            onu_type=onu_type, serial=serial, vlan=vlan, is_epon=is_epon
        )
        if success and (name or description):
            tc.configure_onu_profile(
                frame=frame, slot=slot, port=port, onu_id=onu_id,
                tcont_profile=tcont_profile, user_vlan=vlan, service_vlan=vlan,
                name=name, description=description, is_epon=is_epon,
                sla_profile=sla_profile
            )

    if success:
        prefix = 'epon-onu' if is_epon else 'gpon-onu'
        log_action('onu_register', 'onu', target=f'{prefix}_{frame}/{slot}/{port}:{onu_id}', detail=f'Registered SN={serial} on {olt.name} as {onu_type}')
        # Save technician_id to the ONU record if provided
        technician_id = data.get('technician_id')
        if technician_id:
            onu = ONU.query.filter_by(olt_id=olt_id, frame=frame, slot=slot, port=port, onu_id=onu_id).first()
            if onu:
                onu.technician_id = technician_id
                db.session.commit()
        # Auto-save config to startup-config so changes persist across reboots
        _auto_write_config(olt_id)
    return jsonify({'success': success, 'message': msg})


@bp.route('/api/scan-unconfigured', methods=['POST'])
@permission_required('add_onu')
def scan_unconfigured():
    data = request.get_json()
    olt_id = data.get('olt_id')
    olt = db.session.get(OLT, olt_id) if olt_id else None
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})

    use_snmp = data.get('register_mode', 'cli') == 'snmp' and olt.snmp_enabled

    if use_snmp:
        from snmp_collector import create_snmp_collector, get_write_community
        collector = create_snmp_collector(olt)
        unconfigured = collector.scan_unconfigured_snmp()
        collector.close()

        # Get registered ONU types from DB for matching
        reg_types = [t.type_name for t in ONUType.query.filter_by(olt_id=olt_id).all() if t.type_name]

        def match_onu_type(model):
            if not model or not reg_types:
                return ''
            ml = model.upper()
            for rt in reg_types:
                if rt.upper() == ml:
                    return rt
            for rt in reg_types:
                if ml.startswith(rt.upper()):
                    return rt
            for rt in reg_types:
                if rt.upper() in ml:
                    return rt
            base = re.split(r'[V.]\d', ml)[0]
            if base and base != ml:
                for rt in reg_types:
                    if rt.upper() == base or base.startswith(rt.upper()):
                        return rt
            if 'ALL' in [rt.upper() for rt in reg_types]:
                return 'All'
            return ''

        # Enrich with next available onu_id per port
        port_onu_ids = {}
        for onu in unconfigured:
            if 'onu_id' not in onu or not onu['onu_id']:
                pon_port = onu.get('pon_port', '')
                if pon_port not in port_onu_ids:
                    parts = pon_port.split('/')
                    if len(parts) == 3:
                        try:
                            # Use DB to find used IDs
                            used = {o.onu_id for o in ONU.query.filter_by(
                                olt_id=olt_id, frame=int(parts[0]), slot=int(parts[1]), port=int(parts[2])
                            ).all()}
                            next_id = 1
                            while next_id in used:
                                next_id += 1
                            port_onu_ids[pon_port] = next_id
                        except Exception:
                            port_onu_ids[pon_port] = 1
                    else:
                        port_onu_ids[pon_port] = 1
            onu['onu_id'] = port_onu_ids.get(onu.get('pon_port', ''), onu.get('onu_id', 1))
            port_onu_ids[onu.get('pon_port', '')] = onu['onu_id'] + 1
            onu['matched_type'] = match_onu_type(onu.get('model', ''))

        return jsonify({'success': True, 'onus': unconfigured, 'registered_types': reg_types})

    # CLI mode (SSH or Telnet)
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    unconfigured = tc.collect_unregistered_onus()

    # Get registered ONU types for matching
    reg_types = []
    try:
        reg_types_raw = tc.collect_onu_types()
        reg_types = [t.get('type_name', '') for t in reg_types_raw if t.get('type_name')]
    except Exception:
        reg_types = [t.type_name for t in ONUType.query.filter_by(olt_id=olt_id).all() if t.type_name]

    def match_onu_type(model):
        """Match scanned model to a registered ONU type.
        F670LV9.0 → F670L, HG8245H5 → HG8245H5 or HG8145V5, etc."""
        if not model or not reg_types:
            return ''
        ml = model.upper()
        # Exact match first
        for rt in reg_types:
            if rt.upper() == ml:
                return rt
        # Prefix match: F670LV9.0 → F670L (registered type is prefix of model)
        for rt in reg_types:
            if ml.startswith(rt.upper()):
                return rt
        # Suffix/partial: model contains registered type
        for rt in reg_types:
            if rt.upper() in ml:
                return rt
        # Strip version suffix: F670LV9.0 → F670LV9 → F670LV → F670L
        base = re.split(r'[V.]\d', ml)[0]
        if base and base != ml:
            for rt in reg_types:
                if rt.upper() == base or base.startswith(rt.upper()):
                    return rt
        # Fallback to 'All' (universal)
        if 'ALL' in [rt.upper() for rt in reg_types]:
            return 'All'
        return ''

    # Enrich with next available onu_id per port (oltc320 reference: get_next_available_onu_id)
    port_onu_ids = {}  # cache per port
    for onu in unconfigured:
        if 'onu_id' not in onu or not onu['onu_id']:
            pon_port = onu.get('pon_port', '')
            is_epon = onu.get('is_epon', False)
            if pon_port not in port_onu_ids:
                # Parse port: "1/1/5" → frame=1, slot=1, port=5
                parts = pon_port.split('/')
                if len(parts) == 3:
                    try:
                        next_id = tc.get_next_available_onu_id(int(parts[0]), int(parts[1]), int(parts[2]), is_epon=is_epon)
                        port_onu_ids[pon_port] = next_id or 1
                    except Exception:
                        port_onu_ids[pon_port] = 1
                else:
                    port_onu_ids[pon_port] = 1
            onu['onu_id'] = port_onu_ids[pon_port]
            port_onu_ids[pon_port] = onu['onu_id'] + 1  # next ONU on same port gets next ID

        # Match model to registered ONU type
        model = onu.get('model', '')
        onu['matched_type'] = match_onu_type(model)

    return jsonify({'success': True, 'onus': unconfigured, 'registered_types': reg_types})
