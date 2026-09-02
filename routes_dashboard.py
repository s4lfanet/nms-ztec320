"""Auto-extracted from app.py monolith split (blueprint: dashboard).
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

bp = Blueprint('dashboard', __name__)

@bp.route('/api/dashboard')
@login_required
def api_dashboard():
    nocache = request.args.get('nocache', '0') == '1'
    # Try Redis cache (15s TTL — dashboard auto-refreshes every 15-30s)
    from cache import cache_get, cache_set
    cache_key = "dashboard:global"
    if not nocache:
        cached = cache_get(cache_key)
        if cached is not None:
            return jsonify(cached)

    olts = OLT.query.all()
    olt_ids = [o.id for o in olts]

    # Batch-load related data to avoid N+1 queries
    from collections import defaultdict
    fans_by_olt = defaultdict(list)
    for f in Fan.query.filter(Fan.olt_id.in_(olt_ids)).all():
        fans_by_olt[f.olt_id].append(f)

    cards_by_olt = defaultdict(list)
    for c in OLTCard.query.filter(OLTCard.olt_id.in_(olt_ids)).all():
        cards_by_olt[c.olt_id].append(c)

    uplink_counts = defaultdict(int)
    for u in OLTUplink.query.filter(OLTUplink.olt_id.in_(olt_ids)).all():
        uplink_counts[u.olt_id] += 1

    total_onu = sum(o.total_onu for o in olts)
    online_onu = sum(o.online_onu for o in olts)
    los_onu = sum(o.los_onu for o in olts)
    dyinggasp_onu = sum(o.dyinggasp_onu for o in olts)
    offline_onu = sum(o.offline_onu for o in olts)
    other_onu = sum(o.other_onu for o in olts)
    t = max(total_onu, 1)
    stats = {
        'total_olts': len(olts), 'total_onu': total_onu,
        'online': online_onu, 'online_pct': round(online_onu / t * 100, 2),
        'los': los_onu, 'los_pct': round(los_onu / t * 100, 2),
        'dyinggasp': dyinggasp_onu, 'dyinggasp_pct': round(dyinggasp_onu / t * 100, 2),
        'offline': offline_onu, 'offline_pct': round(offline_onu / t * 100, 2),
        'other': other_onu,
    }
    olt_list = [{
        'id': o.id, 'name': o.name, 'ip_address': o.ip_address, 'model': o.model,
        'firmware_version': o.firmware_version, 'is_online': o.is_online,
        'total_onu': o.total_onu, 'online_onu': o.online_onu, 'los_onu': o.los_onu,
        'dyinggasp_onu': o.dyinggasp_onu, 'offline_onu': o.offline_onu,
        'temperature': o.temperature, 'last_sync': utc_iso(o.last_sync),
        'connection_status': o.connection_status,
        'fans': [{'number': f.fan_number, 'status': f.status, 'rpm': f.rpm, 'speed_level': f.speed_level} for f in fans_by_olt.get(o.id, [])],
        'ip': o.ip_address,
        'vendor': o.vendor or 'zte',
        'cards': [{'slot': c.slot, 'card_type': c.card_type, 'status': c.status, 'total_ports': c.total_ports, 'ports_up': c.ports_up, 'ports_down': c.ports_down} for c in cards_by_olt.get(o.id, [])],
        'uplink_count': uplink_counts.get(o.id, 0),
        'uptime': o.uptime or 0,
        'snmp_status': o.snmp_status or 'disconnected',
        'telnet_status': o.telnet_status or 'disconnected',
        'polling_interval': o.polling_interval or 300,
        'total_fan': o.total_fan or 0,
    } for o in olts]
    result = {'stats': stats, 'olts': olt_list}
    try:
        cache_set(cache_key, result, ttl=15)
        logger.info(f"Dashboard cache SET: {cache_key}")
    except Exception as e:
        logger.warning(f"Dashboard cache SET failed: {e}")
    return jsonify(result)


@bp.route('/api/all-onus')
@login_required
def api_all_onus():
    olt_filter = request.args.get('olt', 'all')
    status_filter = request.args.get('status', 'all')
    pon_filter = request.args.get('pon', 'all')
    search = request.args.get('search', '').strip()
    page = max(int(request.args.get('page', 1)), 1)
    page_size = min(max(int(request.args.get('page_size', 20)), 1), 200)
    sort_by = request.args.get('sort_by', '')
    sort_dir = 'desc' if request.args.get('sort_dir', 'asc') == 'desc' else 'asc'

    # Build base query with eager loading to avoid N+1
    query = ONU.query.options(joinedload(ONU.odp_port).joinedload(FTTHODPPort.odp))
    if olt_filter != 'all':
        query = query.filter_by(olt_id=int(olt_filter))
    if status_filter != 'all':
        query = query.filter_by(status=status_filter)
    if pon_filter != 'all' and olt_filter != 'all':
        try:
            parts = pon_filter.split('/')
            if len(parts) == 3:
                query = query.filter_by(frame=int(parts[0]), slot=int(parts[1]), port=int(parts[2]))
            elif len(parts) == 2 and parts[0] == 'slot':
                query = query.filter_by(slot=int(parts[1]))
        except (ValueError, IndexError):
            pass

    # SQL-side search (replaces Python filtering)
    if search:
        q = f'%{search}%'
        olt_ids = [o.id for o in OLT.query.filter(OLT.name.ilike(q)).all()]
        conditions = [
            ONU.name.ilike(q),
            ONU.serial_number.ilike(q),
            ONU.description.ilike(q),
            ONU.pppoe.ilike(q),
            ONU.actual_type.ilike(q),
        ]
        if olt_ids:
            conditions.append(ONU.olt_id.in_(olt_ids))
        query = query.filter(or_(*conditions))

    # Sorting
    sort_map = {
        'olt': ONU.olt_id,
        'name': ONU.name,
        'description': ONU.description,
        'pppoe': ONU.pppoe,
        'onu_id': ONU.onu_id,
        'status': ONU.status,
        'rx_olt': ONU.rx_power,
        'rx_onu': ONU.onu_rx_power,
        'sn': ONU.serial_number,
        'type': ONU.actual_type,
        'distance': ONU.distance,
    }
    sort_col = sort_map.get(sort_by)
    if sort_col is not None:
        query = query.order_by(sort_col.desc() if sort_dir == 'desc' else sort_col.asc())
    else:
        query = query.order_by(ONU.id.asc())

    # Signal stats — single lightweight query (no ONU objects loaded)
    total = query.count()
    stats_rows = query.with_entities(ONU.rx_power, ONU.onu_rx_power, ONU.status).all()

    # Read RX color ranges from SystemConfig (customization)
    import json as _json_stats
    rx_ranges = [
        {'min': -25, 'max': 0, 'color': 'green', 'label': 'Good'},
        {'min': -28, 'max': -25, 'color': 'yellow', 'label': 'Warning'},
        {'min': -99, 'max': -28, 'color': 'red', 'label': 'Critical'},
    ]
    rx_cfg = SystemConfig.query.filter_by(key='rx_color_ranges').first()
    if rx_cfg and rx_cfg.value:
        try:
            rx_ranges = _json_stats.loads(rx_cfg.value)
        except Exception:
            pass

    # Sort ranges by min descending so we match the highest (best) range first
    sorted_ranges = sorted(rx_ranges, key=lambda r: r['min'], reverse=True)

    def classify_rx(val):
        if val is None:
            return 'na'
        for r in sorted_ranges:
            if r['min'] <= val < r['max']:
                return r.get('color', 'gray')
        # Below all ranges → use the lowest range's color
        if sorted_ranges:
            return sorted_ranges[-1].get('color', 'red')
        return 'red'

    # RX ONU (onu_rx_power) stats — using customized ranges
    onu_counts = {}
    for r in rx_ranges:
        color = r.get('color', 'gray')
        onu_counts[color] = 0
    onu_na = 0
    for r in stats_rows:
        cat = classify_rx(r[1])  # r[1] = onu_rx_power
        if cat == 'na':
            onu_na += 1
        elif cat in onu_counts:
            onu_counts[cat] += 1

    # Also compute RX OLT (rx_power) stats
    olt_counts = {}
    for r in rx_ranges:
        color = r.get('color', 'gray')
        olt_counts[color] = 0
    olt_na = 0
    for r in stats_rows:
        cat = classify_rx(r[0])  # r[0] = rx_power
        if cat == 'na':
            olt_na += 1
        elif cat in olt_counts:
            olt_counts[cat] += 1

    # Status counts
    los_count = sum(1 for r in stats_rows if r[2] == 'los')
    online_count = sum(1 for r in stats_rows if r[2] == 'online')
    offline_count = sum(1 for r in stats_rows if r[2] == 'offline')
    dyinggasp_count = sum(1 for r in stats_rows if r[2] == 'dyinggasp')
    na_count = sum(1 for r in stats_rows if r[1] is None)  # Based on onu_rx_power
    stats_total = max(len(stats_rows), 1)

    # Build signal_stats dynamically from rx_ranges
    signal_stats = {}
    for r in rx_ranges:
        color = r.get('color', 'gray')
        label = r.get('label', color.capitalize())
        cnt = onu_counts.get(color, 0)
        signal_stats[color] = {
            'count': cnt,
            'pct': round(cnt / stats_total * 100, 1),
            'label': label,
            'min': r['min'],
            'max': r['max'],
            'rx_olt': olt_counts.get(color, 0),
            'rx_onu': cnt,
        }
    signal_stats['los'] = los_count
    signal_stats['na'] = na_count
    signal_stats['na_pct'] = round(na_count / stats_total * 100, 1)
    signal_stats['online'] = online_count
    signal_stats['offline'] = offline_count
    signal_stats['dyinggasp'] = dyinggasp_count
    signal_stats['total'] = len(stats_rows)

    # Paginated results
    paginated = query.limit(page_size).offset((page - 1) * page_size).all()

    olts = OLT.query.all()
    olt_list = [{'id': o.id, 'name': o.name} for o in olts]
    olt_map = {o.id: o.name for o in olts}
    olt_vendor_map = {o.id: (o.vendor or '').lower() for o in olts}

    # Build PON port list per OLT grouped by slot/card (for frontend filter dropdowns)
    pon_ports = []
    if olt_filter != 'all':
        try:
            olt_id_int = int(olt_filter)
            # 1. Get service cards (GTG/GTC/ETG) from OLTCard table
            cards = OLTCard.query.filter_by(olt_id=olt_id_int).order_by(OLTCard.slot).all()
            service_cards = [c for c in cards if (c.card_type or '').upper().startswith(('GTG', 'GTC', 'ETG'))]
            # 2. Get all OLTPort entries for this OLT
            oltp_rows = OLTPort.query.filter_by(olt_id=olt_id_int).all()
            # 3. Get distinct frame/slot/port from ONU table (fallback for ports not in OLTPort)
            onu_ports = ONU.query.filter_by(olt_id=olt_id_int).with_entities(
                ONU.frame, ONU.slot, ONU.port
            ).distinct().all()
            onu_slot_ports = {}
            for r in onu_ports:
                onu_slot_ports.setdefault(r[1], set()).add(r[2])

            if service_cards:
                # Build from OLTCard + OLTPort + ONU fallback
                for card in service_cards:
                    slot = card.slot
                    ct = (card.card_type or '').upper()
                    is_epon = ct.startswith('ETG')
                    olt_pfx = 'epon-olt' if is_epon else 'gpon-olt'
                    frame = 1  # ZTE C320 frame is always 1
                    # Collect ports for this slot from OLTPort
                    slot_ports = []
                    port_nums_seen = set()
                    for p in oltp_rows:
                        pparts = (p.port_name or '').replace('gpon-olt_', '').replace('epon-olt_', '').split('/')
                        if len(pparts) >= 3:
                            try:
                                pframe, pslot, pport = int(pparts[0]), int(pparts[1]), int(pparts[2])
                                if pslot == slot:
                                    port_nums_seen.add(pport)
                                    slot_ports.append({
                                        'value': f'{pframe}/{pslot}/{pport}',
                                        'label': f'PON {pport}',
                                        'port': pport,
                                    })
                            except (ValueError, IndexError):
                                pass
                    # Add placeholder ports from card total_ports if not in OLTPort
                    total_ports = card.total_ports or 0
                    for pn in range(1, total_ports + 1):
                        if pn not in port_nums_seen:
                            slot_ports.append({
                                'value': f'{frame}/{slot}/{pn}',
                                'label': f'PON {pn}',
                                'port': pn,
                            })
                    # Add ports from ONU table that aren't in OLTPort or placeholders
                    for pn in sorted(onu_slot_ports.get(slot, [])):
                        if pn not in port_nums_seen:
                            slot_ports.append({
                                'value': f'{frame}/{slot}/{pn}',
                                'label': f'PON {pn}',
                                'port': pn,
                            })
                    slot_ports.sort(key=lambda x: x['port'])
                    if slot_ports:
                        pon_ports.append({
                            'slot': slot,
                            'card_type': card.card_type or '',
                            'card_status': card.status or '',
                            'ports': slot_ports,
                        })
            else:
                # No OLTCard data — fall back to ONU table only
                onu_slot_map = {}
                for r in onu_ports:
                    frame, slot, port = r[0], r[1], r[2]
                    onu_slot_map.setdefault(slot, []).append({
                        'value': f'{frame}/{slot}/{port}',
                        'label': f'PON {port}',
                        'port': port,
                    })
                for slot in sorted(onu_slot_map.keys()):
                    ports = sorted(onu_slot_map[slot], key=lambda x: x['port'])
                    pon_ports.append({
                        'slot': slot,
                        'card_type': '',
                        'card_status': '',
                        'ports': ports,
                    })
        except (ValueError, TypeError):
            pass
    onu_list = [{
        'id': o.id, 'olt_id': o.olt_id, 'olt_name': olt_map.get(o.olt_id, ''),
        'olt_vendor': olt_vendor_map.get(o.olt_id, ''),
        'name': o.name, 'description': o.description, 'pppoe': o.pppoe,
        'onu_id_str': o.onu_id_str, 'status': o.status,
        'rx_power': o.rx_power, 'onu_rx_power': o.onu_rx_power, 'tx_power': o.tx_power,
        'serial_number': o.serial_number, 'actual_type': o.actual_type,
        'frame': o.frame, 'slot': o.slot, 'port': o.port, 'onu_id': o.onu_id,
        'card': o.card or '',
        'distance': o.distance,
        'technician_id': o.technician_id,
        'technician_name': o.technician.full_name if o.technician else '',
        'technician_phone': o.technician.phone if o.technician else '',
        'odp_name': o.odp_port.odp.name if o.odp_port and o.odp_port.odp else '',
        'odp_port_number': o.odp_port.port_number if o.odp_port else None,
        'odp_port_id': o.odp_port.id if o.odp_port else None,
        'customer_name': o.odp_port.customer_name if o.odp_port else '',
        'customer_phone': o.odp_port.customer_phone if o.odp_port else '',
        'latitude': o.latitude,
        'longitude': o.longitude,
        'last_seen': utc_iso(o.last_seen),
        'last_online': utc_iso(o.last_online),
        'last_offline': utc_iso(o.last_offline),
    } for o in paginated]
    return jsonify({
        'onus': onu_list, 'signal_stats': signal_stats,
        'olts': olt_list, 'pon_ports': pon_ports, 'total': total,
        'page': page, 'page_size': page_size,
        'total_pages': max(1, (total + page_size - 1) // page_size),
    })


@bp.route('/api/technicians')
@login_required
def api_technicians():
    """List users with receive_alerts permission (technicians) for dropdown selection."""
    users = User.query.filter_by(is_super_admin=False).all()
    technicians = [{
        'id': u.id, 'full_name': u.full_name, 'username': u.username,
        'phone': u.phone or '',
    } for u in users if u.role and u.role.has_permission('receive_alerts')]
    return jsonify({'technicians': technicians})


@bp.route('/api/all-onus/export', methods=['GET'])
@login_required
def all_onus_export():
    import csv as csv_mod
    from io import StringIO
    from flask import Response
    from sqlalchemy import or_

    # Accept same filters as /api/all-onus
    olt_filter = request.args.get('olt', 'all')
    status_filter = request.args.get('status', 'all')
    pon_filter = request.args.get('pon', 'all')
    search = request.args.get('search', '').strip()
    sort_by = request.args.get('sort_by', '')
    sort_dir = 'desc' if request.args.get('sort_dir', 'asc') == 'desc' else 'asc'

    query = ONU.query.options(joinedload(ONU.odp_port).joinedload(FTTHODPPort.odp))
    olts = {o.id: o.name for o in OLT.query.all()}
    if olt_filter != 'all':
        query = query.filter_by(olt_id=int(olt_filter))
    if status_filter != 'all':
        query = query.filter_by(status=status_filter)
    if pon_filter != 'all' and olt_filter != 'all':
        try:
            parts = pon_filter.split('/')
            if len(parts) == 3:
                query = query.filter_by(frame=int(parts[0]), slot=int(parts[1]), port=int(parts[2]))
            elif len(parts) == 2 and parts[0] == 'slot':
                query = query.filter_by(slot=int(parts[1]))
        except (ValueError, IndexError):
            pass
    if search:
        q = f'%{search}%'
        olt_ids = [o.id for o in OLT.query.filter(OLT.name.ilike(q)).all()]
        conditions = [
            ONU.name.ilike(q), ONU.serial_number.ilike(q),
            ONU.description.ilike(q), ONU.pppoe.ilike(q),
            ONU.actual_type.ilike(q),
        ]
        if olt_ids:
            conditions.append(ONU.olt_id.in_(olt_ids))
        query = query.filter(or_(*conditions))

    # Sorting
    sort_map = {
        'olt': ONU.olt_id, 'name': ONU.name, 'description': ONU.description,
        'pppoe': ONU.pppoe, 'onu_id': ONU.onu_id, 'status': ONU.status,
        'rx_olt': ONU.rx_power, 'rx_onu': ONU.onu_rx_power,
        'sn': ONU.serial_number, 'type': ONU.actual_type, 'distance': ONU.distance,
    }
    sort_col = sort_map.get(sort_by)
    if sort_col is not None:
        query = query.order_by(sort_col.desc() if sort_dir == 'desc' else sort_col.asc())
    else:
        query = query.order_by(ONU.id.asc())

    onus = query.all()

    # Build technician lookup
    tech_ids = {o.technician_id for o in onus if o.technician_id}
    tech_names = {}
    if tech_ids:
        tech_names = {u.id: u.full_name for u in User.query.filter(User.id.in_(tech_ids)).all()}

    si = StringIO()
    writer = csv_mod.writer(si)
    writer.writerow(['OLT', 'Name', 'Description', 'Status', 'Frame', 'Slot', 'Port', 'ONU_ID',
                     'Serial_Number', 'Actual_Type', 'PPPoE', 'RX_dBm',
                     'Distance_m', 'Last_Dereg_Reason', 'Technician',
                     'Latitude', 'Longitude',
                     'ODP_Name', 'ODP_Port', 'Customer_Name', 'Customer_Phone',
                     'Last_Seen', 'Last_Online', 'Last_Offline'])
    for o in onus:
        odp_name = ''
        odp_port = ''
        cust_name = ''
        cust_phone = ''
        if o.odp_port:
            odp_name = o.odp_port.odp.name if o.odp_port.odp else ''
            odp_port = o.odp_port.port_number
            cust_name = o.odp_port.customer_name
            cust_phone = o.odp_port.customer_phone
        writer.writerow([
            olts.get(o.olt_id, ''), o.name or '', o.description or '', o.status,
            o.frame, o.slot, o.port, o.onu_id_str or '',
            o.serial_number or '', o.actual_type or '', o.pppoe or '',
            f'{o.onu_rx_power:.2f}' if o.onu_rx_power is not None else '',
            f'{o.distance}' if o.distance is not None else '',
            o.last_dereg_reason or '',
            tech_names.get(o.technician_id, '') if o.technician_id else '',
            f'{o.latitude:.6f}' if o.latitude is not None else '',
            f'{o.longitude:.6f}' if o.longitude is not None else '',
            odp_name, odp_port, cust_name, cust_phone,
            utc_iso(o.last_seen) or '',
            utc_iso(o.last_online) or '',
            utc_iso(o.last_offline) or '',
        ])
    resp = Response(si.getvalue(), mimetype='text/csv')
    resp.headers['Content-Disposition'] = 'attachment; filename=all_onus.csv'
    return resp
