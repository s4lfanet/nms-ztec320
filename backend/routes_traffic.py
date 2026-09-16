"""Auto-extracted from app.py monolith split (blueprint: traffic).
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

bp = Blueprint('traffic', __name__)

_live_grid_cache = {}


_LIVE_GRID_TTL = 10  # seconds


_TRAFFIC_PERIODS = {
    # period -> (lookback_hours, bucket_seconds)
    'live': (0.25, 300),
    '1h': (1, 300),
    '6h': (6, 900),
    '1d': (24, 1800),
    '3d': (72, 3600),
    '7d': (168, 7200),
    '30d': (720, 21600),
}


def _bucket_traffic_rows(rows, bucket_seconds):
    """Group TrafficLog rows into fixed-size time buckets, averaging rx/tx per bucket."""
    buckets = {}
    for r in rows:
        ts = r.recorded_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        key = int(ts.timestamp() // bucket_seconds) * bucket_seconds
        buckets.setdefault(key, []).append(r)
    points = []
    for key in sorted(buckets.keys()):
        items = buckets[key]
        rx_avg = sum(i.rx_mbps or 0 for i in items) / len(items)
        tx_avg = sum(i.tx_mbps or 0 for i in items) / len(items)
        points.append({
            't': datetime.fromtimestamp(key, tz=timezone.utc).isoformat(),
            'rx': round(rx_avg, 3),
            'tx': round(tx_avg, 3),
        })
    return points


@bp.route('/api/traffic/meta', methods=['GET'])
@login_required
def traffic_meta():
    """List OLTs (with CLI access) and their uplink/PON port names for Traffic page filters."""
    q = OLT.query.filter(OLT.cli_username.isnot(None), OLT.cli_username != '')
    olts = q.order_by(OLT.name).all()

    data = []
    for olt in olts:
        uplinks = OLTUplink.query.filter_by(olt_id=olt.id).order_by(OLTUplink.port_number).all()
        pon_ports = OLTPort.query.filter_by(olt_id=olt.id).order_by(OLTPort.port_number).all()
        data.append({
            'id': olt.id, 'name': olt.name,
            'uplinks': [{'port_name': u.port_name, 'admin_status': u.admin_status} for u in uplinks if u.port_name],
            'pon_ports': [{'port_name': p.port_name, 'onu_count': p.onu_count, 'onu_online': p.onu_online, 'admin_status': p.admin_status} for p in pon_ports if p.port_name],
        })
    return jsonify({'success': True, 'olts': data})


@bp.route('/api/traffic/grid', methods=['GET'])
@login_required
def traffic_grid():
    """Bucketed traffic history for all ports of an OLT (for card mini-charts).
    When period=live, polls current rates directly via Telnet for real-time display."""
    olt_id = request.args.get('olt_id', type=int)
    port_type = request.args.get('port_type', 'pon')
    period = request.args.get('period', '6h')
    search = request.args.get('search', '').strip().lower()
    if not olt_id:
        return jsonify({'success': False, 'message': 'olt_id is required'}), 400
    olt = db.session.get(OLT, olt_id)
    if not olt:
        return jsonify({'success': False, 'message': 'OLT not found'}), 404

    if port_type == 'uplink':
        port_names = [u.port_name for u in OLTUplink.query.filter_by(olt_id=olt_id).order_by(OLTUplink.port_number).all() if u.port_name]
    else:
        port_names = [p.port_name for p in OLTPort.query.filter_by(olt_id=olt_id).order_by(OLTPort.port_number).all() if p.port_name]

    if search:
        port_names = [pn for pn in port_names if search in pn.lower()]

    # For 'live' period: poll current rates via SNMP (lighter on OLT than Telnet)
    # Uses server-side cache (10s TTL) so concurrent users share the same OLT poll
    # Fallback: if SNMP fails (all zeros), use last DB traffic_logs values
    if period == 'live' and port_names:
        import time as _time
        cache_key = (olt_id, port_type)
        now_ts = _time.time()
        cached = _live_grid_cache.get(cache_key)
        if cached and (now_ts - cached[0]) < _LIVE_GRID_TTL:
            live_rates = cached[1]
        else:
            from snmp_core import SNMPCollector
            sc = SNMPCollector(olt.ip_address, olt.snmp_community, olt.snmp_port or 161)
            snmp_names = [pn.replace('gpon-olt_', 'gpon_') for pn in port_names]
            snmp_rates = sc.get_port_traffic_rates_snmp(snmp_names, double_read=True)
            sc.close()
            # Map back to DB port names
            live_rates = {}
            all_zero = True
            for port_name in port_names:
                snmp_name = port_name.replace('gpon-olt_', 'gpon_')
                r = snmp_rates.get(snmp_name, {'in_mbps': 0.0, 'out_mbps': 0.0})
                if r['in_mbps'] > 0 or r['out_mbps'] > 0:
                    all_zero = False
                live_rates[port_name] = r
            # Fallback: if all zeros (OLT unreachable), use last DB values
            if all_zero:
                for port_name in port_names:
                    last_log = TrafficLog.query.filter(
                        TrafficLog.olt_id == olt_id, TrafficLog.port_type == port_type,
                        TrafficLog.port_name == port_name,
                    ).order_by(TrafficLog.recorded_at.desc()).first()
                    if last_log:
                        if port_type == 'uplink':
                            live_rates[port_name] = {'in_mbps': last_log.rx_mbps, 'out_mbps': last_log.tx_mbps}
                        else:
                            live_rates[port_name] = {'out_mbps': last_log.rx_mbps, 'in_mbps': last_log.tx_mbps}
            _live_grid_cache[cache_key] = (now_ts, live_rates)

        # Also fetch recent logs (last 15 min) for mini-chart sparkline
        since = datetime.now(timezone.utc) - timedelta(minutes=15)
        rows = TrafficLog.query.filter(
            TrafficLog.olt_id == olt_id, TrafficLog.port_type == port_type,
            TrafficLog.recorded_at >= since, TrafficLog.port_name.in_(port_names),
        ).order_by(TrafficLog.recorded_at.asc()).all() if port_names else []
        rows_by_port = {}
        for r in rows:
            rows_by_port.setdefault(r.port_name, []).append(r)

        cards = []
        for port_name in port_names:
            r = live_rates.get(port_name, {'in_mbps': 0.0, 'out_mbps': 0.0})
            if port_type == 'uplink':
                cur_rx, cur_tx = r['in_mbps'], r['out_mbps']
            else:
                cur_rx, cur_tx = r['out_mbps'], r['in_mbps']
            port_rows = rows_by_port.get(port_name, [])
            points = _bucket_traffic_rows(port_rows, 300)
            # Append current live rate as an extra point so chart always has 2+ points
            points.append({
                't': datetime.now(timezone.utc).isoformat(),
                'rx': round(cur_rx, 3),
                'tx': round(cur_tx, 3),
            })
            cards.append({
                'port_name': port_name,
                'points': points,
                'current_rx': round(cur_rx, 3),
                'current_tx': round(cur_tx, 3),
                'has_data': True,
            })
        return jsonify({'success': True, 'olt_name': olt.name, 'port_type': port_type, 'period': period, 'cards': cards})

    lookback_hours, bucket_seconds = _TRAFFIC_PERIODS.get(period, _TRAFFIC_PERIODS['6h'])
    since = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)

    # Use hourly aggregated data for periods > 7 days
    if lookback_hours > 168:
        from models import TrafficLogHourly
        h_rows = TrafficLogHourly.query.filter(
            TrafficLogHourly.olt_id == olt_id, TrafficLogHourly.port_type == port_type,
            TrafficLogHourly.hour_start >= since, TrafficLogHourly.port_name.in_(port_names),
        ).order_by(TrafficLogHourly.hour_start.asc()).all() if port_names else []

        rows_by_port = {}
        for r in h_rows:
            rows_by_port.setdefault(r.port_name, []).append(r)

        cards = []
        for port_name in port_names:
            port_rows = rows_by_port.get(port_name, [])
            points = []
            for r in port_rows:
                ts = r.hour_start
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                points.append({
                    't': ts.isoformat(),
                    'rx': round(r.rx_mbps_avg, 3),
                    'tx': round(r.tx_mbps_avg, 3),
                })
            last = port_rows[-1] if port_rows else None
            cards.append({
                'port_name': port_name,
                'points': points,
                'current_rx': round(last.rx_mbps_avg, 3) if last else 0,
                'current_tx': round(last.tx_mbps_avg, 3) if last else 0,
                'has_data': len(port_rows) > 0,
            })
        return jsonify({'success': True, 'olt_name': olt.name, 'port_type': port_type, 'period': period, 'cards': cards})

    rows = TrafficLog.query.filter(
        TrafficLog.olt_id == olt_id, TrafficLog.port_type == port_type,
        TrafficLog.recorded_at >= since, TrafficLog.port_name.in_(port_names),
    ).order_by(TrafficLog.recorded_at.asc()).all() if port_names else []

    rows_by_port = {}
    for r in rows:
        rows_by_port.setdefault(r.port_name, []).append(r)

    cards = []
    for port_name in port_names:
        port_rows = rows_by_port.get(port_name, [])
        points = _bucket_traffic_rows(port_rows, bucket_seconds)
        last = port_rows[-1] if port_rows else None
        cards.append({
            'port_name': port_name,
            'points': points,
            'current_rx': round(last.rx_mbps, 3) if last else 0,
            'current_tx': round(last.tx_mbps, 3) if last else 0,
            'has_data': len(port_rows) > 0,
        })

    return jsonify({'success': True, 'olt_name': olt.name, 'port_type': port_type, 'period': period, 'cards': cards})


@bp.route('/api/traffic/history', methods=['GET'])
@login_required
def traffic_history():
    """Bucketed traffic history for a single port (detail drawer sections).
    Uses raw traffic_logs for periods <= 7d, traffic_log_hourly for > 7d."""
    olt_id = request.args.get('olt_id', type=int)
    port_type = request.args.get('port_type', 'pon')
    port_name = request.args.get('port_name', '')
    period = request.args.get('period', '1d')
    if not olt_id or not port_name:
        return jsonify({'success': False, 'message': 'olt_id and port_name are required'}), 400

    lookback_hours, bucket_seconds = _TRAFFIC_PERIODS.get(period, _TRAFFIC_PERIODS['1d'])
    since = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)

    # Use hourly aggregated data for periods > 7 days
    if lookback_hours > 168:
        from models import TrafficLogHourly
        rows = TrafficLogHourly.query.filter(
            TrafficLogHourly.olt_id == olt_id, TrafficLogHourly.port_type == port_type,
            TrafficLogHourly.port_name == port_name, TrafficLogHourly.hour_start >= since,
        ).order_by(TrafficLogHourly.hour_start.asc()).all()
        # Convert hourly rows to same format as _bucket_traffic_rows output
        points = []
        for r in rows:
            ts = r.hour_start
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            points.append({
                't': ts.isoformat(),
                'rx': round(r.rx_mbps_avg, 3),
                'tx': round(r.tx_mbps_avg, 3),
            })
        return jsonify({'success': True, 'period': period, 'points': points, 'has_data': len(points) > 0})

    rows = TrafficLog.query.filter(
        TrafficLog.olt_id == olt_id, TrafficLog.port_type == port_type,
        TrafficLog.port_name == port_name, TrafficLog.recorded_at >= since,
    ).order_by(TrafficLog.recorded_at.asc()).all()

    points = _bucket_traffic_rows(rows, bucket_seconds)
    return jsonify({'success': True, 'period': period, 'points': points, 'has_data': len(rows) > 0})


@bp.route('/api/traffic/live', methods=['GET'])
@login_required
def traffic_live():
    """Real-time single-port traffic rate (polled every 5s by detail drawer).
    Uses SNMP ifInOctets/ifOutOctets with double-read for instantaneous rate.
    Cached for 5s server-side so concurrent users share the same OLT poll."""
    import time as _time
    olt_id = request.args.get('olt_id', type=int)
    port_type = request.args.get('port_type', 'pon')
    port_name = request.args.get('port_name', '')
    olt = db.session.get(OLT, olt_id) if olt_id else None
    if not olt or not port_name:
        return jsonify({'success': False, 'message': 'OLT/port not configured'}), 400

    # Check cache (5s TTL) — key: (olt_id, port_name)
    cache_key = (olt_id, port_name)
    now_ts = _time.time()
    cached = _live_grid_cache.get(cache_key)
    if cached and (now_ts - cached[0]) < 5:
        r = cached[1]
    else:
        from snmp_core import SNMPCollector
        sc = SNMPCollector(olt.ip_address, olt.snmp_community, olt.snmp_port or 161)
        snmp_name = port_name.replace('gpon-olt_', 'gpon_')
        rates = sc.get_port_traffic_rates_snmp([snmp_name], double_read=True)
        r = rates.get(snmp_name, {'in_mbps': 0.0, 'out_mbps': 0.0})
        sc.close()
        # Fallback: if SNMP returns 0.0 (OLT unreachable), use last DB value
        if r['in_mbps'] == 0.0 and r['out_mbps'] == 0.0:
            last_log = TrafficLog.query.filter(
                TrafficLog.olt_id == olt_id, TrafficLog.port_type == port_type,
                TrafficLog.port_name == port_name,
            ).order_by(TrafficLog.recorded_at.desc()).first()
            if last_log:
                if port_type == 'uplink':
                    r = {'in_mbps': last_log.rx_mbps, 'out_mbps': last_log.tx_mbps}
                else:
                    r = {'out_mbps': last_log.rx_mbps, 'in_mbps': last_log.tx_mbps}
        _live_grid_cache[cache_key] = (now_ts, r)
    if port_type == 'uplink':
        # Uplink: Download = Input (WAN -> OLT), Upload = Output (OLT -> WAN)
        rx_mbps, tx_mbps = r['in_mbps'], r['out_mbps']
    else:
        # PON: Download = Output (OLT -> ONU), Upload = Input (ONU -> OLT)
        rx_mbps, tx_mbps = r['out_mbps'], r['in_mbps']

    # Persist this live sample too, so grid/history charts stay in sync with what's displayed live
    try:
        db.session.add(TrafficLog(olt_id=olt.id, port_type=port_type,
                                   port_name=port_name, rx_mbps=round(rx_mbps, 3), tx_mbps=round(tx_mbps, 3)))
        db.session.commit()
    except Exception:
        db.session.rollback()

    return jsonify({'success': True, 'rx_mbps': round(rx_mbps, 3), 'tx_mbps': round(tx_mbps, 3), 'ts': int(_time.time())})


@bp.route('/api/metrics/history', methods=['GET'])
@login_required
def metrics_history():
    """Get metric history for charts. Params: type, olt_id/onu_id, hours (default 24)."""
    metric_type = request.args.get('type', 'rx_power')
    olt_id = request.args.get('olt_id', type=int)
    onu_id = request.args.get('onu_id', type=int)
    hours = request.args.get('hours', 24, type=int)
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    q = MetricHistory.query.filter(MetricHistory.recorded_at >= since)
    if metric_type:
        q = q.filter_by(metric_type=metric_type)
    if olt_id:
        q = q.filter_by(olt_id=olt_id)
    if onu_id:
        q = q.filter_by(onu_id=onu_id)

    records = q.order_by(MetricHistory.recorded_at.asc()).limit(500).all()
    return jsonify({
        'success': True,
        'data': [{
            'value': r.value,
            'time': utc_iso(r.recorded_at),
            'type': r.metric_type,
        } for r in records]
    })
