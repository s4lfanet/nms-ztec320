#!/usr/bin/env python3
"""Traffic poller — runs via cronjob every 5 minutes.
Polls instantaneous input/output rate on all uplink & PON ports of every OLT
(via Telnet 'show interface <port>') and stores samples into traffic_logs.
Also prunes samples older than 7 days (raw) and aggregates into traffic_log_hourly.
Hourly data retained for 90 days.
Read-only (show commands only).
Uses file lock to prevent overlapping cron runs."""
import sys
sys.path.insert(0, '/opt/fibernms')
import os
os.chdir('/opt/fibernms')

import fcntl
from datetime import datetime, timezone, timedelta
from sqlalchemy import func
from app import app, db
from models import OLT, OLTUplink, OLTPort, TrafficLog, TrafficLogHourly

RAW_RETENTION_DAYS = 7
HOURLY_RETENTION_DAYS = 90

# File lock to prevent overlapping cron runs
_lock_fp = open('/tmp/traffic_poller.lock', 'w')
try:
    fcntl.flock(_lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
except (IOError, OSError):
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Another traffic_poller instance is running, skipping.')
    sys.exit(0)


def _aggregate_hourly():
    """Aggregate raw traffic_logs older than 7 days into traffic_log_hourly.
    Groups by (olt_id, port_type, port_name, hour) and computes avg + peak.
    Deletes raw rows after aggregation."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=RAW_RETENTION_DAYS)
    # Find distinct hours that need aggregation (raw data older than retention)
    # Use date_trunc (PostgreSQL) instead of strftime (SQLite)
    hours_to_agg = db.session.query(
        func.date_trunc('hour', TrafficLog.recorded_at).label('hour_start')
    ).filter(
        TrafficLog.recorded_at < cutoff
    ).distinct().all()

    if not hours_to_agg:
        return 0

    aggregated = 0
    for (hour_start,) in hours_to_agg:
        if hour_start is None:
            continue
        # Ensure timezone-aware
        if hour_start.tzinfo is None:
            hour_start = hour_start.replace(tzinfo=timezone.utc)
        hour_end = hour_start + timedelta(hours=1)

        # Aggregate raw rows for this hour
        rows = db.session.query(
            TrafficLog.olt_id, TrafficLog.port_type, TrafficLog.port_name,
            func.avg(TrafficLog.rx_mbps).label('rx_avg'),
            func.avg(TrafficLog.tx_mbps).label('tx_avg'),
            func.max(TrafficLog.rx_mbps).label('rx_peak'),
            func.max(TrafficLog.tx_mbps).label('tx_peak'),
            func.count(TrafficLog.id).label('cnt')
        ).filter(
            TrafficLog.recorded_at >= hour_start,
            TrafficLog.recorded_at < hour_end
        ).group_by(
            TrafficLog.olt_id, TrafficLog.port_type, TrafficLog.port_name
        ).all()

        for r in rows:
            # Upsert into traffic_log_hourly
            existing = TrafficLogHourly.query.filter_by(
                olt_id=r.olt_id, port_type=r.port_type,
                port_name=r.port_name, hour_start=hour_start
            ).first()
            if existing:
                existing.rx_mbps_avg = round(float(r.rx_avg or 0), 3)
                existing.tx_mbps_avg = round(float(r.tx_avg or 0), 3)
                existing.rx_mbps_peak = round(float(r.rx_peak or 0), 3)
                existing.tx_mbps_peak = round(float(r.tx_peak or 0), 3)
                existing.sample_count = int(r.cnt)
            else:
                db.session.add(TrafficLogHourly(
                    olt_id=r.olt_id, port_type=r.port_type,
                    port_name=r.port_name,
                    rx_mbps_avg=round(float(r.rx_avg or 0), 3),
                    tx_mbps_avg=round(float(r.tx_avg or 0), 3),
                    rx_mbps_peak=round(float(r.rx_peak or 0), 3),
                    tx_mbps_peak=round(float(r.tx_peak or 0), 3),
                    sample_count=int(r.cnt), hour_start=hour_start,
                ))
            aggregated += 1

        # Delete aggregated raw rows for this hour
        TrafficLog.query.filter(
            TrafficLog.recorded_at >= hour_start,
            TrafficLog.recorded_at < hour_end
        ).delete()

    db.session.commit()
    return aggregated


with app.app_context():
    # 1. Prune old hourly data (90 days)
    try:
        hourly_cutoff = datetime.now(timezone.utc) - timedelta(days=HOURLY_RETENTION_DAYS)
        deleted_hourly = TrafficLogHourly.query.filter(TrafficLogHourly.hour_start < hourly_cutoff).delete()
        if deleted_hourly:
            db.session.commit()
            print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Pruned {deleted_hourly} old hourly rows')
    except Exception as e:
        db.session.rollback()
        print(f'Hourly prune error: {e}')

    # 2. Aggregate raw data older than 7 days into hourly
    try:
        agg_count = _aggregate_hourly()
        if agg_count:
            print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Aggregated {agg_count} hourly records from raw data')
    except Exception as e:
        db.session.rollback()
        print(f'Aggregation error: {e}')

    # 3. Poll current traffic from all OLTs
    olts = OLT.query.all()
    for olt in olts:
        uplinks = OLTUplink.query.filter_by(olt_id=olt.id).all()
        pon_ports = OLTPort.query.filter_by(olt_id=olt.id).all()
        uplink_names = [u.port_name for u in uplinks if u.port_name]
        pon_names = [p.port_name for p in pon_ports if p.port_name]
        all_names = uplink_names + pon_names
        if not all_names:
            continue

        now = datetime.now(timezone.utc)
        rows = 0
        all_rates = {}

        if olt.cli_username:
            try:
                from snmp_collector import create_cli_collector
                tc = create_cli_collector(olt)
                all_rates = tc.get_ports_traffic_rate(all_names)
            except Exception as e:
                print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] {olt.name}: CLI ERROR: {e}')
        else:
            continue

        try:
            for port_name in uplink_names:
                r = all_rates.get(port_name, {'in_mbps': 0.0, 'out_mbps': 0.0})
                # Uplink: Download = Input (WAN -> OLT), Upload = Output (OLT -> WAN)
                db.session.add(TrafficLog(
                    olt_id=olt.id, port_type='uplink',
                    port_name=port_name, rx_mbps=round(r['in_mbps'], 3), tx_mbps=round(r['out_mbps'], 3),
                    recorded_at=now,
                ))
                rows += 1

            for port_name in pon_names:
                r = all_rates.get(port_name, {'in_mbps': 0.0, 'out_mbps': 0.0})
                # PON: Download = Output (OLT -> ONU), Upload = Input (ONU -> OLT)
                db.session.add(TrafficLog(
                    olt_id=olt.id, port_type='pon',
                    port_name=port_name, rx_mbps=round(r['out_mbps'], 3), tx_mbps=round(r['in_mbps'], 3),
                    recorded_at=now,
                ))
                rows += 1
            db.session.commit()
            print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] {olt.name}: logged {rows} port samples')
        except Exception as e:
            db.session.rollback()
            print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] {olt.name}: ERROR {e}')

print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Traffic poll complete')
