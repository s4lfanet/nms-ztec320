"""Auto-extracted from app.py monolith split (blueprint: olt_settings).
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

bp = Blueprint('olt_settings', __name__)

@bp.route('/api/olt/<int:olt_id>/refresh-signal', methods=['POST'])
@login_required
def refresh_onu_signal(olt_id):
    """Fast SNMP-only refresh of status + RX/TX power for all ONUs (ZTE).
    Walks oper_state, ONU RX, TX, OLT RX, and serial — updates status + signal in DB."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})
    try:
        from snmp_collector import SNMPCollector, TelnetCollector, decode_rx_power, parse_serial
        from snmp_core import classify_onu_status, decode_dereg_reason
        import asyncio
        from pysnmp.hlapi.v1arch.asyncio import Slim, ObjectType, ObjectIdentity

        OID_OPER = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.6'
        OID_DEREG = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.7'
        OID_RX = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.10'
        OID_TX = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.11'
        OID_OLT_RX = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.18'
        OID_SN = '1.3.6.1.4.1.3902.1012.3.28.1.1.5'

        async def _refresh():
            slim = Slim(1)
            try:
                async def walk(oid):
                    results = []
                    s = Slim(1)
                    cur = oid
                    errs = 0
                    try:
                        while True:
                            try:
                                ei, es, eidx, vb = await s.next('public', olt.ip_address, 161, ObjectType(ObjectIdentity(cur)), timeout=5, retries=2)
                            except: break
                            if ei: errs += 1; continue
                            if es: break
                            roid = str(vb[0][0])
                            if not roid.startswith(oid): break
                            results.append((roid, vb[0][1]))
                            cur = roid; errs = 0
                    finally:
                        s.close()
                    return results

                sn_raw, oper_raw, dereg_raw, rx_raw, tx_raw, olt_rx_raw = await asyncio.gather(
                    walk(OID_SN), walk(OID_OPER), walk(OID_DEREG),
                    walk(OID_RX), walk(OID_TX), walk(OID_OLT_RX),
                )

                def parse_key(oid_str, base):
                    suffix = oid_str[len(base):]
                    parts = suffix.lstrip('.').split('.')
                    if len(parts) >= 2:
                        return (int(parts[0]), int(parts[1]))
                    return None

                sn_by_key = {}
                for oid, val in sn_raw:
                    k = parse_key(oid, OID_SN)
                    if k:
                        sn_by_key[k] = parse_serial(val)

                oper_by_key = {}
                for oid, val in oper_raw:
                    k = parse_key(oid, OID_OPER)
                    if k:
                        try: oper_by_key[k] = int(val)
                        except: pass

                dereg_by_key = {}
                for oid, val in dereg_raw:
                    k = parse_key(oid, OID_DEREG)
                    if k:
                        try: dereg_by_key[k] = int(val)
                        except: pass

                onu_rx_by_key = {}
                for oid, val in rx_raw:
                    k = parse_key(oid, OID_RX)
                    if k:
                        onu_rx_by_key[k] = decode_rx_power(int(val))

                tx_by_key = {}
                for oid, val in tx_raw:
                    k = parse_key(oid, OID_TX)
                    if k:
                        tx_by_key[k] = decode_rx_power(int(val))

                olt_rx_by_key = {}
                for oid, val in olt_rx_raw:
                    k = parse_key(oid, OID_OLT_RX)
                    if k:
                        olt_rx_by_key[k] = decode_rx_power(int(val))

                # Build signal map by serial
                signal_by_sn = {}
                for k, sn in sn_by_key.items():
                    if sn:
                        signal_by_sn[sn] = {
                            'oper_state': oper_by_key.get(k, 0),
                            'dereg_reason': dereg_by_key.get(k, 0),
                            'onu_rx': onu_rx_by_key.get(k),
                            'tx': tx_by_key.get(k),
                            'olt_rx': olt_rx_by_key.get(k),
                        }

                return signal_by_sn
            finally:
                slim.close()

        signal_map = asyncio.run(_refresh())

        onus = ONU.query.filter_by(olt_id=olt_id).all()
        updated = 0
        status_changed = 0
        for o in onus:
            sn = o.serial_number or ''
            if sn in signal_map:
                sig = signal_map[sn]
                new_status = classify_onu_status(sig['oper_state'], sig['dereg_reason'], sig['olt_rx'], sig['onu_rx'])
                if o.status != new_status:
                    # Record status change in history
                    try:
                        from models import OnuStatusHistory
                        hist = OnuStatusHistory(
                            onu_id=o.id, olt_id=olt_id,
                            onu_name=o.name or '', onu_index=o.onu_id_str,
                            serial_number=o.serial_number or '',
                            old_status=o.status, new_status=new_status,
                            dereg_reason=decode_dereg_reason(sig['dereg_reason']),
                            rx_power=sig['olt_rx'],
                            source='refresh',
                        )
                        db.session.add(hist)
                    except Exception:
                        pass
                    o.status = new_status
                    o.oper_state = sig['oper_state']
                    status_changed += 1
                # Update signal values for online ONUs
                if new_status == 'online':
                    if sig['olt_rx'] is not None:
                        o.rx_power = sig['olt_rx']
                    if sig['onu_rx'] is not None:
                        o.onu_rx_power = sig['onu_rx']
                    if sig['tx'] is not None:
                        o.tx_power = sig['tx']
                else:
                    o.rx_power = None
                    o.tx_power = None
                    o.onu_rx_power = None
                o.last_dereg_reason = decode_dereg_reason(sig['dereg_reason'])
                o.last_seen = datetime.now(timezone.utc)
                updated += 1
        db.session.commit()
        # Invalidate cache
        try:
            from cache import cache_clear
            cache_clear("dashboard:*")
            cache_clear(f"olt:{olt_id}:*")
        except Exception:
            pass
        return jsonify({'success': True, 'updated': updated, 'total': len(onus), 'status_changed': status_changed})
    except Exception as e:
        logger.error(f"refresh-signal OLT {olt_id} failed: {e}")
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/olt/<int:olt_id>/olt-logs', methods=['GET'])
@login_required
def olt_device_logs(olt_id):
    """Fetch OLT device logs via CLI (show log alarmlog / cmdlog / snmplog)."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})
    log_type = request.args.get('type', 'alarmlog')
    lines_limit = min(int(request.args.get('lines', 200)), 2000)
    try:
        from snmp_collector import create_cli_collector
        tc = create_cli_collector(olt)
        tn = tc._connect()
        if not tn:
            return jsonify({'success': False, 'message': 'Could not connect to OLT via CLI'})
        try:
            cmd_map = {
                'alarmlog': 'show log alarmlog',
                'cmdlog': 'show log cmdlog',
                'snmplog': 'show log snmplog',
            }
            cmd = cmd_map.get(log_type, 'show log alarmlog')
            output = tc._send_command(tn, cmd, timeout=30)
            all_lines = (output or '').split('\n')
            # Strip header lines (Max/Current/percent)
            data_lines = [l for l in all_lines if l.strip() and not l.startswith('Max ') and not l.startswith('Current ') and not l.strip().startswith('%')]
            # Take last N lines (most recent)
            result_lines = data_lines[-lines_limit:] if len(data_lines) > lines_limit else data_lines
            return jsonify({
                'success': True,
                'type': log_type,
                'total_lines': len(data_lines),
                'lines': result_lines,
            })
        finally:
            try: tn.close()
            except: pass
    except Exception as e:
        logger.error(f"olt-logs OLT {olt_id} failed: {e}")
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/olt/<int:olt_id>/onu-status-history', methods=['GET'])
@login_required
def onu_status_history(olt_id):
    """Fetch ONU status change history."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'})
    try:
        from models import OnuStatusHistory
        limit = min(int(request.args.get('limit', 100)), 500)
        status_filter = request.args.get('status', '')
        q = OnuStatusHistory.query.filter_by(olt_id=olt_id)
        if status_filter and status_filter != 'all':
            q = q.filter(OnuStatusHistory.new_status == status_filter)
        records = q.order_by(OnuStatusHistory.created_at.desc()).limit(limit).all()
        return jsonify({
            'success': True,
            'total': len(records),
            'records': [{
                'id': r.id,
                'onu_id': r.onu_id,
                'onu_name': r.onu_name,
                'onu_index': r.onu_index,
                'serial_number': r.serial_number,
                'old_status': r.old_status,
                'new_status': r.new_status,
                'dereg_reason': r.dereg_reason,
                'rx_power': r.rx_power,
                'distance': r.distance,
                'source': r.source,
                'created_at': r.created_at.isoformat() if r.created_at else None,
            } for r in records],
        })
    except Exception as e:
        logger.error(f"onu-status-history OLT {olt_id} failed: {e}")
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/olt/<int:olt_id>/discover-slots', methods=['POST'])
@permission_required('settings_ip_olts')
def discover_olt_slots(olt_id):
    """Real-time slot discovery via CLI 'show card' — no full sync needed.
    Connects to OLT, collects chassis info, saves cards to DB, returns result."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    if not olt.cli_enabled or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})
    try:
        from snmp_collector import create_cli_collector
        tc = create_cli_collector(olt)
        chassis = tc.collect_chassis_info()
        cards = chassis.get('cards', [])
        if not cards:
            return jsonify({'success': False, 'message': 'No cards discovered. Check CLI connection.'})
        # Save discovered cards to DB
        OLTCard.query.filter_by(olt_id=olt_id).delete()
        for cd in cards:
            card = OLTCard(
                olt_id=olt_id, slot=cd.get('slot', 0),
                card_type=cd.get('type', ''), status=cd.get('status', ''),
                total_ports=cd.get('port_count', 0),
            )
            db.session.add(card)
        # Save fans if available
        if chassis.get('fans'):
            Fan.query.filter_by(olt_id=olt_id).delete()
            for f in chassis['fans']:
                fan = Fan(
                    olt_id=olt_id, fan_number=f.get('number', 0),
                    status=f.get('status', ''), rpm=f.get('rpm', 0),
                    speed_level=f.get('speed_level', ''),
                )
                db.session.add(fan)
        db.session.commit()
        log_action('olt_discover_slots', 'olt', target=olt.name,
                   detail=f'Discovered {len(cards)} cards via CLI')
        try:
            from cache import cache_clear
            cache_clear("dashboard:*")
            cache_clear(f"olt:{olt_id}:chassis")
            cache_clear(f"olt:{olt_id}:pon-structure")
        except Exception:
            pass
        return jsonify({
            'success': True,
            'message': f'Discovered {len(cards)} card(s) from OLT',
            'cards': cards,
            'fans': chassis.get('fans', []),
            'temperature': chassis.get('temperature'),
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Discovery failed: {str(e)[:200]}'})


@bp.route('/api/olt/<int:olt_id>/migrate-batch', methods=['POST'])
@permission_required('configure_onu')
def migrate_onu_batch(olt_id):
    """Batch migrate multiple ONUs to the same target PON.

    Body: { onu_ids: [1,2,3], card: 1, pon: 3, onu_id_mode: 'auto' }
    Returns: { success, migrated, failed, details: [...] }
    """
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    data = request.get_json()
    onu_ids = data.get('onu_ids', [])
    new_card = int(data.get('card', 0))
    new_pon = int(data.get('pon', 0))
    onu_id_mode = data.get('onu_id_mode', 'auto')

    if not onu_ids or not new_card or not new_pon:
        return jsonify({'success': False, 'message': 'Missing onu_ids, card, or pon'})

    if not olt.cli_enabled or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})

    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)

    # Pre-calculate used ONU IDs on target PON (for auto mode)
    used_ids = {o.onu_id for o in ONU.query.filter_by(
        olt_id=olt_id, frame=1, slot=new_card, port=new_pon
    ).all()}

    results = []
    migrated = 0
    failed = 0

    for oid in onu_ids:
        onu = db.session.get(ONU, oid)
        if not onu:
            results.append({'id': oid, 'success': False, 'message': 'ONU not found'})
            failed += 1
            continue

        serial = onu.serial_number or ''
        onu_type = onu.onu_type or 'ZTE-F609'
        onu_name = onu.name or ''
        onu_desc = onu.description or ''

        if not serial:
            results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': 'No serial number'})
            failed += 1
            continue

        # Calculate new ONU ID
        if onu_id_mode == 'auto':
            new_oid = next((i for i in range(1, 129) if i not in used_ids), None)
            if new_oid is None:
                results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': 'No available ONU IDs'})
                failed += 1
                continue
        else:
            try:
                new_oid = int(data.get('onu_id_value', onu.onu_id))
            except (TypeError, ValueError):
                results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': 'Invalid ONU ID'})
                failed += 1
                continue
            if not (1 <= new_oid <= 128):
                results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': 'ONU ID must be 1-128'})
                failed += 1
                continue
            if new_oid in used_ids:
                results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': f'ONU ID {new_oid} already used'})
                failed += 1
                continue

        old_frame, old_slot, old_port, old_id = onu.frame, onu.slot, onu.port, onu.onu_id
        is_epon = (onu.card or '').lower() == 'epon'

        # Step 1: Deregister from old PON
        ok1, msg1 = tc.deregister_onu(old_frame, old_slot, old_port, old_id, is_epon=is_epon)
        if not ok1:
            results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': f'Deregister failed: {msg1}'})
            failed += 1
            continue

        # Step 2: Register on new PON
        ok2, msg2 = tc.register_onu(onu.frame, new_card, new_pon, new_oid, onu_type, serial, is_epon=is_epon)
        if not ok2:
            # Rollback: re-register on old PON
            tc.register_onu(old_frame, old_slot, old_port, old_id, onu_type, serial, is_epon=is_epon)
            results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': f'Register failed: {msg2}'})
            failed += 1
            continue

        # Step 3: Re-apply name and description
        if onu_name or onu_desc:
            try:
                tc.configure_onu_profile(onu.frame, new_card, new_pon, new_oid,
                                         name=onu_name, description=onu_desc, is_epon=is_epon)
            except Exception:
                pass

        # Step 4: Update DB
        onu.slot = new_card
        onu.port = new_pon
        onu.onu_id = new_oid
        db.session.commit()

        used_ids.add(new_oid)
        migrated += 1
        new_str = f'{onu.frame}/{new_card}/{new_pon}:{new_oid}'
        results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': True,
                        'message': f'Migrated to {new_str}', 'new_onu_id_str': new_str})

    return jsonify({
        'success': migrated > 0,
        'migrated': migrated,
        'failed': failed,
        'total': len(onu_ids),
        'details': results,
    })


@bp.route('/api/olt/migrate-cross-olt', methods=['POST'])
@permission_required('configure_onu')
def migrate_cross_olt():
    """Migrate ONUs from one OLT to another OLT.

    Body: {
        source_olt_id: int,
        target_olt_id: int,
        onu_ids: [int],       # ONU ids from source OLT
        card: int,            # target card
        pon: int,             # target PON port
        onu_id_mode: 'auto' | 'manual',
        onu_id_value: int     # starting ONU ID for manual mode
    }
    Returns: { success, migrated, failed, total, details: [...] }
    """
    data = request.get_json()
    source_olt_id = int(data.get('source_olt_id', 0))
    target_olt_id = int(data.get('target_olt_id', 0))
    onu_ids = data.get('onu_ids', [])
    new_card = int(data.get('card', 0))
    new_pon = int(data.get('pon', 0))
    onu_id_mode = data.get('onu_id_mode', 'auto')

    if not source_olt_id or not target_olt_id:
        return jsonify({'success': False, 'message': 'Missing source_olt_id or target_olt_id'}), 400
    if source_olt_id == target_olt_id:
        return jsonify({'success': False, 'message': 'Source and target OLT must be different. Use same-OLT migration instead.'}), 400
    if not onu_ids or not new_card or not new_pon:
        return jsonify({'success': False, 'message': 'Missing onu_ids, card, or pon'}), 400

    source_olt = db.session.get(OLT, source_olt_id)
    target_olt = db.session.get(OLT, target_olt_id)
    if not source_olt:
        return jsonify({'success': False, 'message': 'Source OLT not found'}), 404
    if not target_olt:
        return jsonify({'success': False, 'message': 'Target OLT not found'}), 404
    if not target_olt.cli_enabled or not target_olt.cli_username:
        return jsonify({'success': False, 'message': 'Target OLT not configured for CLI access'}), 400
    if not source_olt.cli_enabled or not source_olt.cli_username:
        return jsonify({'success': False, 'message': 'Source OLT not configured for CLI access'}), 400

    from snmp_collector import TelnetCollector, create_cli_collector
    src_tc = create_cli_collector(source_olt)
    dst_tc = create_cli_collector(target_olt)

    # Pre-calculate used ONU IDs on target PON (for auto mode)
    used_ids = {o.onu_id for o in ONU.query.filter_by(
        olt_id=target_olt_id, frame=1, slot=new_card, port=new_pon
    ).all()}

    results = []
    migrated = 0
    failed = 0

    for oid in onu_ids:
        onu = db.session.get(ONU, oid)
        if not onu:
            results.append({'id': oid, 'success': False, 'message': 'ONU not found'})
            failed += 1
            continue
        if onu.olt_id != source_olt_id:
            results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': 'ONU does not belong to source OLT'})
            failed += 1
            continue

        serial = onu.serial_number or ''
        onu_type = onu.onu_type or 'ZTE-F609'
        onu_name = onu.name or ''
        onu_desc = onu.description or ''

        if not serial:
            results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': 'No serial number'})
            failed += 1
            continue

        # Calculate new ONU ID on target OLT
        if onu_id_mode == 'auto':
            new_oid = next((i for i in range(1, 129) if i not in used_ids), None)
            if new_oid is None:
                results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': 'No available ONU IDs on target PON'})
                failed += 1
                continue
        else:
            try:
                new_oid = int(data.get('onu_id_value', onu.onu_id))
            except (TypeError, ValueError):
                results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': 'Invalid ONU ID'})
                failed += 1
                continue
            if not (1 <= new_oid <= 128):
                results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': 'ONU ID must be 1-128'})
                failed += 1
                continue
            if new_oid in used_ids:
                results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': f'ONU ID {new_oid} already used on target PON'})
                failed += 1
                continue

        old_frame, old_slot, old_port, old_id = onu.frame, onu.slot, onu.port, onu.onu_id
        is_epon = (onu.card or '').lower() == 'epon'
        target_frame = 1  # target OLT frame

        # Step 1: Deregister from source OLT
        ok1, msg1 = src_tc.deregister_onu(old_frame, old_slot, old_port, old_id, is_epon=is_epon)
        if not ok1:
            results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': f'Deregister from source OLT failed: {msg1}'})
            failed += 1
            continue

        # Step 2: Register on target OLT
        ok2, msg2 = dst_tc.register_onu(target_frame, new_card, new_pon, new_oid, onu_type, serial, is_epon=is_epon)
        if not ok2:
            # Rollback: re-register on source OLT
            try:
                src_tc.register_onu(old_frame, old_slot, old_port, old_id, onu_type, serial, is_epon=is_epon)
            except Exception:
                pass
            results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': False, 'message': f'Register on target OLT failed: {msg2}'})
            failed += 1
            continue

        # Step 3: Re-apply name and description on target OLT
        if onu_name or onu_desc:
            try:
                dst_tc.configure_onu_profile(target_frame, new_card, new_pon, new_oid,
                                             name=onu_name, description=onu_desc, is_epon=is_epon)
            except Exception:
                pass

        # Step 4: Update DB — move ONU to target OLT
        onu.olt_id = target_olt_id
        onu.frame = target_frame
        onu.slot = new_card
        onu.port = new_pon
        onu.onu_id = new_oid
        onu.status = 'offline'
        onu.rx_power = None
        onu.tx_power = None
        onu.onu_rx_power = None
        onu.distance = None
        onu.last_dereg_reason = ''
        db.session.commit()

        used_ids.add(new_oid)
        migrated += 1
        new_str = f'{target_frame}/{new_card}/{new_pon}:{new_oid}'
        results.append({'id': oid, 'onu_id_str': onu.onu_id_str, 'success': True,
                        'message': f'Migrated to {target_olt.name} {new_str}', 'new_onu_id_str': new_str})

    log_action('migrate_cross_olt', 'system',
               detail=f'Source OLT {source_olt.name} → Target OLT {target_olt.name}: {migrated} migrated, {failed} failed')

    return jsonify({
        'success': migrated > 0,
        'migrated': migrated,
        'failed': failed,
        'total': len(onu_ids),
        'details': results,
    })


@bp.route('/api/olt/copy-config', methods=['POST'])
@permission_required('settings_ip_olts')
def copy_olt_config():
    """Copy OLT configuration (VLANs, ONU types, speed profiles, WAN IP profiles)
    from source OLT to target OLT via CLI, and duplicate DB records.

    Body: { source_olt_id: int, target_olt_id: int }
    Returns: { success, copied: { vlans, onu_types, speed_profiles, wan_ip_profiles }, errors: [...] }
    """
    data = request.get_json()
    source_olt_id = int(data.get('source_olt_id', 0))
    target_olt_id = int(data.get('target_olt_id', 0))

    if not source_olt_id or not target_olt_id:
        return jsonify({'success': False, 'message': 'Missing source_olt_id or target_olt_id'}), 400
    if source_olt_id == target_olt_id:
        return jsonify({'success': False, 'message': 'Source and target OLT must be different'}), 400

    source_olt = db.session.get(OLT, source_olt_id)
    target_olt = db.session.get(OLT, target_olt_id)
    if not source_olt:
        return jsonify({'success': False, 'message': 'Source OLT not found'}), 404
    if not target_olt:
        return jsonify({'success': False, 'message': 'Target OLT not found'}), 404
    if not target_olt.cli_enabled or not target_olt.cli_username:
        return jsonify({'success': False, 'message': 'Target OLT not configured for CLI access'}), 400

    from snmp_collector import create_cli_collector
    dst_tc = create_cli_collector(target_olt)

    errors = []
    copied = {'vlans': 0, 'onu_types': 0, 'speed_profiles': 0, 'wan_ip_profiles': 0}

    # Gather source config from DB
    source_vlans = ONUVlan.query.filter_by(olt_id=source_olt_id).all()
    source_onu_types = ONUType.query.filter_by(olt_id=source_olt_id).all()
    source_speed_profiles = SpeedProfile.query.filter_by(olt_id=source_olt_id).all()
    source_wan_ip_profiles = WanIpProfile.query.filter_by(olt_id=source_olt_id).all()

    # Existing target config (to skip duplicates)
    existing_vlans = {(v.vlan_id, v.vlan_name) for v in ONUVlan.query.filter_by(olt_id=target_olt_id).all()}
    existing_onu_types = {t.type_name for t in ONUType.query.filter_by(olt_id=target_olt_id).all()}
    existing_speed = {(p.profile_type, p.name) for p in SpeedProfile.query.filter_by(olt_id=target_olt_id).all()}
    existing_wan_ip = {p.name for p in WanIpProfile.query.filter_by(olt_id=target_olt_id).all()}

    tn = dst_tc._connect()
    if not tn:
        return jsonify({'success': False, 'message': 'Cannot connect to target OLT via CLI'}), 500

    try:
        # --- 1. Copy VLANs ---
        if source_vlans:
            dst_tc._send_command(tn, 'end', timeout=5)
            dst_tc._send_command(tn, 'configure terminal', timeout=5)
            dst_tc._send_command(tn, 'vlan database', timeout=5)
            for v in source_vlans:
                key = (v.vlan_id, v.vlan_name)
                if key in existing_vlans:
                    continue
                try:
                    dst_tc._send_command(tn, f'vlan {v.vlan_id}', timeout=5)
                    if v.vlan_name:
                        dst_tc._send_command(tn, f'vlan {v.vlan_id} name {v.vlan_name}', timeout=5)
                    # Duplicate DB record
                    new_vlan = ONUVlan(
                        olt_id=target_olt_id, vlan_id=v.vlan_id, vlan_name=v.vlan_name,
                        vlan_type=v.vlan_type, onu_profiles=v.onu_profiles,
                        tagged_ports=v.tagged_ports, untagged_ports=v.untagged_ports,
                    )
                    db.session.add(new_vlan)
                    copied['vlans'] += 1
                    existing_vlans.add(key)
                except Exception as e:
                    errors.append(f'VLAN {v.vlan_id}: {str(e)[:100]}')
            dst_tc._send_command(tn, 'exit', timeout=5)  # exit vlan database

        # --- 2. Copy ONU Types ---
        if source_onu_types:
            dst_tc._send_command(tn, 'end', timeout=5)
            dst_tc._send_command(tn, 'configure terminal', timeout=5)
            dst_tc._send_command(tn, 'pon', timeout=5)
            for t in source_onu_types:
                if t.type_name in existing_onu_types:
                    continue
                try:
                    cmd = f'onu-type {t.type_name} {t.pon_type or "gpon"}'
                    if t.description:
                        cmd += f' description "{t.description}"'
                    dst_tc._send_command(tn, cmd, timeout=5)
                    # Duplicate DB record
                    new_type = ONUType(
                        olt_id=target_olt_id, type_name=t.type_name, pon_type=t.pon_type,
                        description=t.description, max_tcont=t.max_tcont, max_gem=t.max_gem,
                        max_switch=t.max_switch, max_flow=t.max_flow, max_ip_host=t.max_ip_host,
                        max_veip=t.max_veip, interfaces=t.interfaces,
                    )
                    db.session.add(new_type)
                    copied['onu_types'] += 1
                    existing_onu_types.add(t.type_name)
                except Exception as e:
                    errors.append(f'ONU Type {t.type_name}: {str(e)[:100]}')
            dst_tc._send_command(tn, 'exit', timeout=5)  # exit pon

        # --- 3. Copy Speed Profiles (TCONT + Traffic) ---
        if source_speed_profiles:
            dst_tc._send_command(tn, 'end', timeout=5)
            dst_tc._send_command(tn, 'configure terminal', timeout=5)
            dst_tc._send_command(tn, 'gpon', timeout=5)
            for p in source_speed_profiles:
                key = (p.profile_type, p.name)
                if key in existing_speed:
                    continue
                try:
                    if p.profile_type == 'tcont':
                        cmd = f'profile tcont {p.name}'
                        if p.type_val:
                            cmd += f' type {p.type_val}'
                        if p.max_bandwidth and p.max_bandwidth != '0':
                            cmd += f' maximum {p.max_bandwidth}'
                        dst_tc._send_command(tn, cmd, timeout=5)
                    elif p.profile_type == 'traffic':
                        cmd = f'profile traffic {p.name}'
                        if p.sir:
                            cmd += f' sir {p.sir}'
                        if p.pir:
                            cmd += f' pir {p.pir}'
                        dst_tc._send_command(tn, cmd, timeout=5)
                    # Duplicate DB record
                    new_sp = SpeedProfile(
                        olt_id=target_olt_id, profile_type=p.profile_type, name=p.name,
                        type_val=p.type_val, fixed_bandwidth=p.fixed_bandwidth,
                        assured_bandwidth=p.assured_bandwidth, max_bandwidth=p.max_bandwidth,
                        sir=p.sir, pir=p.pir,
                    )
                    db.session.add(new_sp)
                    copied['speed_profiles'] += 1
                    existing_speed.add(key)
                except Exception as e:
                    errors.append(f'Speed Profile {p.name}: {str(e)[:100]}')
            dst_tc._send_command(tn, 'exit', timeout=5)  # exit gpon

        # --- 4. Copy WAN IP Profiles ---
        if source_wan_ip_profiles:
            dst_tc._send_command(tn, 'end', timeout=5)
            dst_tc._send_command(tn, 'configure terminal', timeout=5)
            dst_tc._send_command(tn, 'gpon', timeout=5)
            for w in source_wan_ip_profiles:
                if w.name in existing_wan_ip:
                    continue
                try:
                    cmd = f'profile wan-ip {w.name}'
                    if w.ip_address:
                        cmd += f' ipaddress {w.ip_address}'
                    if w.netmask:
                        cmd += f' netmask {w.netmask}'
                    if w.gateway:
                        cmd += f' gateway {w.gateway}'
                    dst_tc._send_command(tn, cmd, timeout=5)
                    # Duplicate DB record
                    new_wip = WanIpProfile(
                        olt_id=target_olt_id, name=w.name, ip_address=w.ip_address,
                        netmask=w.netmask, gateway=w.gateway, dns1=w.dns1, dns2=w.dns2,
                    )
                    db.session.add(new_wip)
                    copied['wan_ip_profiles'] += 1
                    existing_wan_ip.add(w.name)
                except Exception as e:
                    errors.append(f'WAN IP Profile {w.name}: {str(e)[:100]}')
            dst_tc._send_command(tn, 'exit', timeout=5)  # exit gpon

        # Save config to target OLT
        dst_tc._send_command(tn, 'end', timeout=5)
        dst_tc._send_command(tn, 'write', timeout=15)

        db.session.commit()
    except Exception as e:
        db.session.rollback()
        errors.append(f'General error: {str(e)[:200]}')
    finally:
        try:
            tn.close()
        except Exception:
            pass

    log_action('copy_olt_config', 'system',
               detail=f'{source_olt.name} → {target_olt.name}: VLANs={copied["vlans"]}, ONU Types={copied["onu_types"]}, Speed Profiles={copied["speed_profiles"]}, WAN IP={copied["wan_ip_profiles"]}')

    total_copied = sum(copied.values())
    return jsonify({
        'success': total_copied > 0 or len(errors) == 0,
        'copied': copied,
        'errors': errors,
        'message': f'Copied {total_copied} config items' + (f' ({len(errors)} errors)' if errors else ''),
    })


@bp.route('/api/olt/<int:olt_id>/write-config', methods=['POST'])
@permission_required('settings_ip_olts')
def olt_write_config(olt_id):
    """Save OLT running-config to startup-config (write command)."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    if not olt.cli_enabled or not olt.cli_username:
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
            return jsonify({'success': False, 'message': f'Save failed: {out.strip()[:200]}'})
        log_action('olt_write_config', 'olt', target=olt.name, detail='Saved running-config to startup')
        return jsonify({'success': True, 'message': 'Configuration saved to startup-config'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/olt/<int:olt_id>/system-config', methods=['POST'])
@permission_required('settings_ip_olts')
def olt_system_config(olt_id):
    """Configure SNMP community and admin user on the OLT device via CLI."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    if not olt.cli_enabled or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})
    data = request.get_json()
    snmp_ro = (data.get('snmp_community_ro') or '').strip()
    snmp_rw = (data.get('snmp_community_rw') or '').strip()
    admin_user = (data.get('admin_username') or '').strip()
    admin_pass = (data.get('admin_password') or '').strip()
    if not snmp_ro and not snmp_rw and not admin_user:
        return jsonify({'success': False, 'message': 'No configuration provided'})
    from snmp_collector import create_cli_collector
    tc = create_cli_collector(olt)
    try:
        ok, msg, log = tc.configure_system(
            snmp_community_ro=snmp_ro,
            snmp_community_rw=snmp_rw,
            admin_username=admin_user,
            admin_password=admin_pass,
        )
        if ok:
            # Update NMS-side stored credentials to match
            changed = []
            if snmp_ro and snmp_ro != olt.snmp_community:
                olt.snmp_community = snmp_ro
                changed.append('SNMP read community')
            if snmp_rw and snmp_rw != olt.snmp_community_write:
                olt.snmp_community_write = snmp_rw
                changed.append('SNMP write community')
            if admin_user and admin_pass:
                if admin_user != olt.cli_username:
                    olt.cli_username = admin_user
                    changed.append('CLI username')
                olt.cli_password = admin_pass
                changed.append('CLI password')
            if changed:
                db.session.commit()
            log_action('olt_system_config', 'olt', target=olt.name,
                       detail=f'Configured: {", ".join(changed) if changed else "no local changes"}')
        return jsonify({'success': ok, 'message': msg, 'log': log})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/olt/<int:olt_id>/snmp-communities', methods=['GET', 'POST', 'DELETE'])
@permission_required('settings_ip_olts')
def olt_snmp_communities(olt_id):
    """List, add, or delete SNMP communities on the OLT device."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    if not olt.cli_enabled or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})
    from snmp_collector import create_cli_collector
    tc = create_cli_collector(olt)
    try:
        if request.method == 'GET':
            communities, raw = tc.show_snmp_config()
            return jsonify({'success': True, 'communities': communities, 'raw': raw})
        data = request.get_json()
        if request.method == 'POST':
            community = (data.get('community') or '').strip()
            access = (data.get('access') or 'ro').strip()
            if not community:
                return jsonify({'success': False, 'message': 'Community string required'})
            ok, msg, log = tc.add_snmp_community(community, access)
            if ok:
                log_action('olt_snmp_add', 'olt', target=olt.name, detail=f'Added community {community} ({access})')
            return jsonify({'success': ok, 'message': msg, 'log': log})
        if request.method == 'DELETE':
            community = (data.get('community') or '').strip()
            if not community:
                return jsonify({'success': False, 'message': 'Community string required'})
            ok, msg, log = tc.delete_snmp_community(community)
            if ok:
                log_action('olt_snmp_delete', 'olt', target=olt.name, detail=f'Deleted community {community}')
            return jsonify({'success': ok, 'message': msg, 'log': log})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/olt/<int:olt_id>/cli-users', methods=['GET', 'POST', 'DELETE'])
@permission_required('settings_ip_olts')
def olt_cli_users(olt_id):
    """List, add, or delete CLI users on the OLT device."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    if not olt.cli_enabled or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})
    from snmp_collector import create_cli_collector
    tc = create_cli_collector(olt)
    try:
        if request.method == 'GET':
            users, raw = tc.show_users()
            return jsonify({'success': True, 'users': users, 'raw': raw})
        data = request.get_json()
        if request.method == 'POST':
            username = (data.get('username') or '').strip()
            password = (data.get('password') or '').strip()
            level = int(data.get('level', 15))
            if not username or not password:
                return jsonify({'success': False, 'message': 'Username and password required'})
            ok, msg, log = tc.add_user(username, password, level)
            if ok:
                log_action('olt_user_add', 'olt', target=olt.name, detail=f'Saved user {username} (level {level})')
            return jsonify({'success': ok, 'message': msg, 'log': log})
        if request.method == 'DELETE':
            username = (data.get('username') or '').strip()
            if not username:
                return jsonify({'success': False, 'message': 'Username required'})
            ok, msg, log = tc.delete_user(username)
            if ok:
                log_action('olt_user_delete', 'olt', target=olt.name, detail=f'Deleted user {username}')
            return jsonify({'success': ok, 'message': msg, 'log': log})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/olt/<int:olt_id>/backup-config', methods=['POST'])
@permission_required('settings_ip_olts')
def backup_olt_config(olt_id):
    """Backup OLT running configuration via CLI (SSH or Telnet)."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    if not olt.cli_enabled or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    try:
        tn = tc._connect()
        if not tn:
            return jsonify({'success': False, 'message': 'CLI connection failed'})
        tc._send_command(tn, 'write memory', timeout=30)
        config = tc._send_command(tn, 'show running-config', timeout=60)
        tn.close()
        if config and len(config) > 10:
            from flask import Response
            filename = f'{olt.name}_backup_{__import__("datetime").datetime.now().strftime("%Y%m%d_%H%M%S")}.cfg'
            return Response(config, mimetype='text/plain',
                          headers={'Content-Disposition': f'attachment;filename={filename}'})
        return jsonify({'success': False, 'message': 'Failed to retrieve config'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/olt/<int:olt_id>/backups', methods=['GET'])
@login_required
def list_olt_backups(olt_id):
    """List config backups for an OLT."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    backups = OLTConfigBackup.query.filter_by(olt_id=olt_id).order_by(
        OLTConfigBackup.created_at.desc()
    ).limit(50).all()
    return jsonify({
        'success': True,
        'auto_backup_enabled': olt.auto_backup_enabled,
        'auto_backup_interval': olt.auto_backup_interval,
        'auto_backup_unit': olt.auto_backup_unit,
        'auto_backup_time': olt.auto_backup_time,
        'last_backup_at': utc_iso(olt.last_backup_at),
        'backups': [{
            'id': b.id,
            'backup_type': b.backup_type,
            'status': b.status,
            'config_size': b.config_size,
            'error_message': b.error_message,
            'created_at': utc_iso(b.created_at),
        } for b in backups],
    })


@bp.route('/api/olt/<int:olt_id>/backup-save', methods=['POST'])
@permission_required('settings_ip_olts')
def backup_olt_config_to_db(olt_id):
    """Backup OLT running-config and save to DB."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    if not olt.cli_enabled or not olt.cli_username:
        return jsonify({'success': False, 'message': 'OLT not configured for CLI access'})
    from snmp_collector import create_cli_collector
    tc = create_cli_collector(olt)
    try:
        tn = tc._connect()
        if not tn:
            return jsonify({'success': False, 'message': 'CLI connection failed'})
        # Save running config to startup (NVRAM) before backup
        tc._send_command(tn, 'write memory', timeout=30)
        config = tc._send_command(tn, 'show running-config', timeout=60)
        tn.close()
        if not config or len(config) < 50:
            return jsonify({'success': False, 'message': 'Failed to retrieve config'})
        backup = OLTConfigBackup(
            olt_id=olt_id,
            config_text=config,
            config_size=len(config),
            backup_type='manual',
            status='success',
        )
        db.session.add(backup)
        olt.last_backup_at = datetime.now(timezone.utc)
        db.session.commit()
        log_action('backup_olt_config', 'olt', target=olt.name, detail=f'Manual backup saved ({len(config)} bytes)')
        return jsonify({'success': True, 'message': f'Backup saved ({len(config)} bytes)', 'backup_id': backup.id})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/olt/<int:olt_id>/backup/<int:backup_id>/download', methods=['GET'])
@permission_required('settings_ip_olts')
def download_olt_backup(olt_id, backup_id):
    """Download a specific config backup."""
    backup = db.session.get(OLTConfigBackup, backup_id)
    if not backup or backup.olt_id != olt_id:
        return jsonify({'success': False, 'message': 'Backup not found'}), 404
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    from flask import Response
    filename = f'{olt.name}_backup_{backup.created_at.strftime("%Y%m%d_%H%M%S")}.cfg'
    return Response(
        backup.config_text,
        mimetype='text/plain',
        headers={'Content-Disposition': f'attachment;filename={filename}'},
    )


@bp.route('/api/olt/<int:olt_id>/backup/<int:backup_id>', methods=['DELETE'])
@permission_required('settings_ip_olts')
def delete_olt_backup(olt_id, backup_id):
    """Delete a config backup."""
    backup = db.session.get(OLTConfigBackup, backup_id)
    if not backup or backup.olt_id != olt_id:
        return jsonify({'success': False, 'message': 'Backup not found'}), 404
    db.session.delete(backup)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Backup deleted'})


@bp.route('/api/olt/<int:olt_id>/auto-backup', methods=['PUT'])
@permission_required('settings_ip_olts')
def toggle_auto_backup(olt_id):
    """Toggle auto-backup settings for an OLT."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    data = request.get_json() or {}
    if 'enabled' in data:
        olt.auto_backup_enabled = bool(data['enabled'])
    if 'interval' in data:
        interval = int(data['interval'])
        if interval < 1:
            interval = 1
        olt.auto_backup_interval = interval
    if 'unit' in data:
        unit = data['unit']
        if unit not in ('hours', 'days'):
            unit = 'hours'
        olt.auto_backup_unit = unit
    if 'time' in data:
        t = str(data['time']).strip()
        if t and ':' in t:
            parts = t.split(':')
            try:
                h, m = int(parts[0]), int(parts[1])
                if 0 <= h <= 23 and 0 <= m <= 59:
                    olt.auto_backup_time = f'{h:02d}:{m:02d}'
                else:
                    olt.auto_backup_time = ''
            except (ValueError, IndexError):
                olt.auto_backup_time = ''
        else:
            olt.auto_backup_time = ''
    db.session.commit()
    detail = f'Auto-backup {"enabled" if olt.auto_backup_enabled else "disabled"}, interval={olt.auto_backup_interval}{olt.auto_backup_unit[:1]}'
    if olt.auto_backup_time:
        detail += f', time={olt.auto_backup_time}'
    log_action('toggle_auto_backup', 'olt', target=olt.name, detail=detail)
    return jsonify({
        'success': True,
        'message': f'Auto-backup {"enabled" if olt.auto_backup_enabled else "disabled"}',
        'auto_backup_enabled': olt.auto_backup_enabled,
        'auto_backup_interval': olt.auto_backup_interval,
        'auto_backup_unit': olt.auto_backup_unit,
        'auto_backup_time': olt.auto_backup_time,
    })


@bp.route('/api/olt/<int:olt_id>/traffic/add', methods=['POST'])
@permission_required('settings_ip_olts')
def add_traffic_profile(olt_id):
    """Add a new Traffic profile"""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'Profile name is required'})
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.create_traffic_profile(
        name,
        sir=data.get('sir', '0'),
        pir=data.get('pir', '0'),
    )
    if success:
        profile = SpeedProfile(
            olt_id=olt_id, profile_type='traffic', name=name,
            sir=data.get('sir', '0'),
            pir=data.get('pir', '0'),
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


@bp.route('/api/olt/<int:olt_id>/traffic/<int:profile_id>/delete', methods=['POST'])
@permission_required('settings_ip_olts')
def delete_traffic_profile(olt_id, profile_id):
    """Delete a Traffic profile"""
    olt = db.session.get(OLT, olt_id)
    profile = db.session.get(SpeedProfile, profile_id)
    if not olt or not profile:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    from snmp_collector import TelnetCollector, create_cli_collector
    tc = create_cli_collector(olt)
    success, msg = tc.delete_traffic_profile(profile.name)
    if success:
        db.session.delete(profile)
        db.session.commit()
        log_action('traffic_profile_delete', 'olt', target=olt.name, detail=f'Profile {profile.name}')
        try:
            from cache import cache_clear
            cache_clear(f"olt:{olt_id}:speed-profiles")
            cache_clear(f"olt:{olt_id}:speed-profiles-full")
        except Exception:
            pass
    return jsonify({'success': success, 'message': msg})


@bp.route('/api/olt', methods=['POST'])
@permission_required('settings_ip_olts')
def create_olt():
    data = request.get_json()
    olt = OLT(
        name=data.get('name', ''), ip_address=data.get('ip_address', ''),
        model=data.get('model', 'C320'), vendor=data.get('vendor', 'zte'),
        snmp_community=data.get('snmp_community', 'public'),
        snmp_community_write=data.get('snmp_community_write', ''),
        snmp_port=data.get('snmp_port', 161),
        telnet_enabled=data.get('telnet_enabled', True),
        telnet_port=data.get('telnet_port', 23),
        web_port=data.get('web_port', 80),
        ssh_enabled=data.get('ssh_enabled', False),
        ssh_port=data.get('ssh_port', 22),
        cli_username=data.get('cli_username', ''),
        cli_password=data.get('cli_password', ''),
        polling_interval=data.get('polling_interval', 300),
    )
    db.session.add(olt)
    db.session.commit()
    log_action('olt_create', 'olt', target=olt.name, detail=f'Created OLT {olt.name} ({olt.ip_address})')

    # Kick off a full sync immediately so a newly-added OLT doesn't sit empty
    # until the next auto-sync cron tick (up to 5 minutes away). auto_sync.py
    # would force a full sync anyway on its first run for this OLT (last_full_sync
    # is None), so this just does that same first sync right away instead of
    # making the admin wait or remember to click "Sync" manually.
    try:
        from flask import current_app
        start_single_sync(current_app._get_current_object(), olt.id, light=False)
    except Exception as e:
        logger.warning(f"Could not start initial sync for new OLT {olt.id}: {e}")

    return jsonify({'success': True, 'id': olt.id})


@bp.route('/api/olt/<int:olt_id>', methods=['GET'])
@login_required
def get_olt(olt_id):
    """Get OLT data for edit modal.
    Sensitive fields (SNMP community, write community) are masked unless
    the user has settings_ip_olts permission."""
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    can_manage = current_user.has_permission('settings_ip_olts')
    return jsonify({
        'success': True,
        'id': olt.id,
        'name': olt.name,
        'ip_address': olt.ip_address,
        'vendor': olt.vendor,
        'model': olt.model,
        'firmware_version': olt.firmware_version or '',
        'snmp_enabled': olt.snmp_enabled,
        'snmp_community': olt.snmp_community if can_manage else '***',
        'snmp_community_write': olt.snmp_community_write if can_manage else '',
        'snmp_port': olt.snmp_port,
        'telnet_enabled': olt.telnet_enabled,
        'telnet_port': olt.telnet_port,
        'web_port': olt.web_port or 80,
        'ssh_enabled': olt.ssh_enabled,
        'ssh_port': olt.ssh_port,
        'cli_username': olt.cli_username if can_manage else '',
        'cli_password': '***' if olt.cli_password else '',
        'monitoring_enabled': olt.monitoring_enabled,
        'polling_interval': olt.polling_interval,
        'is_online': olt.is_online,
        'connection_status': olt.connection_status,
        'snmp_status': olt.snmp_status,
        'telnet_status': olt.telnet_status,
    })


@bp.route('/api/olt/<int:olt_id>', methods=['PUT'])
@permission_required('settings_ip_olts')
def update_olt(olt_id):
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False}), 404
    data = request.get_json()
    for field in ['name', 'ip_address', 'model', 'vendor', 'snmp_port',
                  'telnet_enabled', 'telnet_port', 'web_port', 'ssh_enabled', 'ssh_port',
                  'cli_username', 'polling_interval', 'monitoring_enabled']:
        if field in data:
            setattr(olt, field, data[field])
    # Only update password if a real value is provided (not masked placeholder)
    if 'cli_password' in data and data['cli_password'] and not data['cli_password'].startswith('***'):
        olt.cli_password = data['cli_password']
    # Only update SNMP communities if a real value is provided (not masked placeholder)
    if 'snmp_community' in data and data['snmp_community'] and not data['snmp_community'].startswith('***'):
        olt.snmp_community = data['snmp_community']
    if 'snmp_community_write' in data and data['snmp_community_write'] and not data['snmp_community_write'].startswith('***'):
        olt.snmp_community_write = data['snmp_community_write']
    db.session.commit()
    log_action('olt_update', 'olt', target=olt.name, detail=f'Updated OLT {olt.name} — fields: {list(data.keys())}')
    return jsonify({'success': True, 'id': olt.id})


@bp.route('/api/olt/<int:olt_id>', methods=['DELETE'])
@permission_required('settings_ip_olts')
def delete_olt(olt_id):
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404
    from models import MaintenanceWindow
    try:
        # Delete all child records explicitly to avoid FK constraint errors
        ONU.query.filter_by(olt_id=olt_id).delete()
        Fan.query.filter_by(olt_id=olt_id).delete()
        OLTCard.query.filter_by(olt_id=olt_id).delete()
        OLTUplink.query.filter_by(olt_id=olt_id).delete()
        OLTPort.query.filter_by(olt_id=olt_id).delete()
        ONUVlan.query.filter_by(olt_id=olt_id).delete()
        ONUType.query.filter_by(olt_id=olt_id).delete()
        SpeedProfile.query.filter_by(olt_id=olt_id).delete()
        WanIpProfile.query.filter_by(olt_id=olt_id).delete()
        OLTSyncStatus.query.filter_by(olt_id=olt_id).delete()
        Notification.query.filter_by(olt_id=olt_id).delete()
        AlertHistory.query.filter_by(olt_id=olt_id).delete()
        OLTConfigBackup.query.filter_by(olt_id=olt_id).delete()
        TrafficLogHourly.query.filter_by(olt_id=olt_id).delete()
        MetricHistory.query.filter_by(olt_id=olt_id).delete()
        MaintenanceWindow.query.filter_by(olt_id=olt_id).delete()
        # FTTH — nullable FKs, set to NULL
        FTTHOTB.query.filter_by(olt_id=olt_id).update({'olt_id': None})
        FTTHPonPort.query.filter_by(olt_id=olt_id).update({'olt_id': None})
        TR069Profile.query.filter_by(default_olt_id=olt_id).update({'default_olt_id': None})
        db.session.delete(olt)
        db.session.commit()
        log_action('olt_delete', 'olt', target=olt.name, detail=f'Deleted OLT {olt.name} ({olt.ip_address})')
        return jsonify({'success': True, 'message': f'OLT "{olt.name}" deleted successfully.'})
    except Exception as e:
        db.session.rollback()
        logging.error(f'Delete OLT {olt_id} failed: {e}')
        return jsonify({'success': False, 'message': f'Delete failed: {str(e)[:200]}'}), 500
