"""Redis-based task queue for background processing.
Uses RQ (Redis Queue) to offload long-running tasks from the Flask request cycle.

Usage:
    # Start worker process (via systemd or CLI):
    python rq_worker.py

    # Enqueue tasks from app:
    from task_queue import enqueue_sync, enqueue_traffic_poll
    job = enqueue_sync(olt_id)
"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from redis import Redis
from rq import Queue

REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')

_redis_conn = None
_sync_queue = None


def get_redis():
    global _redis_conn
    if _redis_conn is None:
        _redis_conn = Redis.from_url(REDIS_URL)
    return _redis_conn


def get_sync_queue():
    global _sync_queue
    if _sync_queue is None:
        _sync_queue = Queue('sync', connection=get_redis())
    return _sync_queue


def enqueue_sync(olt_id, light=False):
    """Enqueue a single OLT sync job."""
    q = get_sync_queue()
    job = q.enqueue('task_queue._run_sync_task', olt_id, light,
                    job_timeout=600, result_ttl=300)
    return job.id


def enqueue_sync_all():
    """Enqueue a sync-all job."""
    q = get_sync_queue()
    job = q.enqueue('task_queue._run_sync_all_task',
                    job_timeout=1800, result_ttl=300)
    return job.id


def enqueue_traffic_poll():
    """Enqueue a traffic polling job."""
    q = get_sync_queue()
    job = q.enqueue('task_queue._run_traffic_poll_task',
                    job_timeout=300, result_ttl=60)
    return job.id


# --- Task functions (executed by RQ worker) ---

def _run_sync_task(olt_id, light=False):
    """Sync a single OLT — runs in RQ worker process."""
    from app import app
    from models import OLT, OLTSyncStatus
    from services_sync import run_single_sync
    from snmp_collector import poll_olt
    from sync_helper import save_sync_result
    from extensions import db
    import threading

    # Re-register SQLAlchemy for this forked process
    try:
        if hasattr(app, 'extensions') and 'sqlalchemy' in app.extensions:
            del app.extensions['sqlalchemy']
    except Exception:
        pass
    db.init_app(app)

    with app.app_context():
        olt = db_get_olt(olt_id)
        if not olt:
            return {'success': False, 'error': 'OLT not found'}

        sync_status = OLTSyncStatus.query.filter_by(olt_id=olt_id).first()
        if not sync_status:
            sync_status = OLTSyncStatus(olt_id=olt_id)
            from extensions import db
            db.session.add(sync_status)
            db.session.commit()

        sync_id = sync_status.id
        run_single_sync(app, olt_id, sync_id, light=light)
        return {'success': True, 'olt_id': olt_id}


def _run_sync_all_task():
    """Sync all OLTs — runs in RQ worker process."""
    from app import app
    from services_sync import run_sync_all
    from extensions import db

    # Re-register SQLAlchemy for this forked process
    try:
        if hasattr(app, 'extensions') and 'sqlalchemy' in app.extensions:
            del app.extensions['sqlalchemy']
    except Exception:
        pass
    db.init_app(app)

    with app.app_context():
        run_sync_all(app)
        return {'success': True}


def _run_traffic_poll_task():
    """Poll traffic from all OLTs — runs in RQ worker process.
    Also prunes old raw data (7d) and aggregates into hourly (90d retention)."""
    from app import app
    from models import OLT, OLTUplink, OLTPort, TrafficLog, TrafficLogHourly
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import func
    from extensions import db

    # In RQ's forked process, Flask-SQLAlchemy 3.x loses the app-engine
    # mapping. We need to re-register by removing the old entry and
    # calling init_app again.
    try:
        if hasattr(app, 'extensions') and 'sqlalchemy' in app.extensions:
            del app.extensions['sqlalchemy']
    except Exception:
        pass
    db.init_app(app)

    RAW_RETENTION_DAYS = 7
    HOURLY_RETENTION_DAYS = 90

    with app.app_context():
        # 1. Prune old hourly data (90 days)
        try:
            hourly_cutoff = datetime.now(timezone.utc) - timedelta(days=HOURLY_RETENTION_DAYS)
            deleted = TrafficLogHourly.query.filter(TrafficLogHourly.hour_start < hourly_cutoff).delete()
            if deleted:
                db.session.commit()
        except Exception:
            db.session.rollback()

        # 2. Aggregate raw data older than 7 days into hourly
        try:
            raw_cutoff = datetime.now(timezone.utc) - timedelta(days=RAW_RETENTION_DAYS)
            hours_to_agg = db.session.query(
                func.date_trunc('hour', TrafficLog.recorded_at).label('h')
            ).filter(
                TrafficLog.recorded_at < raw_cutoff
            ).distinct().all()

            for (hour_start,) in hours_to_agg:
                hour_end = hour_start + timedelta(hours=1)
                rows = db.session.query(
                    TrafficLog.olt_id,
                    TrafficLog.port_type, TrafficLog.port_name,
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

                TrafficLog.query.filter(
                    TrafficLog.recorded_at >= hour_start,
                    TrafficLog.recorded_at < hour_end
                ).delete()

            db.session.commit()
        except Exception:
            db.session.rollback()

        # 3. Poll current traffic from all OLTs
        olts = OLT.query.all()
        total = 0
        for olt in olts:
            uplinks = OLTUplink.query.filter_by(olt_id=olt.id).all()
            pon_ports = OLTPort.query.filter_by(olt_id=olt.id).all()
            uplink_names = [u.port_name for u in uplinks if u.port_name]
            pon_names = [p.port_name for p in pon_ports if p.port_name]
            all_names = uplink_names + pon_names
            if not all_names:
                continue

            now = datetime.now(timezone.utc)
            all_rates = {}

            if olt.cli_username:
                try:
                    from snmp_collector import create_cli_collector
                    tc = create_cli_collector(olt)
                    all_rates = tc.get_ports_traffic_rate(all_names)
                except Exception as e:
                    print(f'[traffic_poll] {olt.name}: CLI ERROR: {e}')
            else:
                continue

            for port_name in uplink_names:
                r = all_rates.get(port_name, {'in_mbps': 0.0, 'out_mbps': 0.0})
                db.session.add(TrafficLog(
                    olt_id=olt.id, port_type='uplink',
                    port_name=port_name, rx_mbps=round(r['in_mbps'], 3),
                    tx_mbps=round(r['out_mbps'], 3), recorded_at=now,
                ))
                total += 1

            for port_name in pon_names:
                r = all_rates.get(port_name, {'in_mbps': 0.0, 'out_mbps': 0.0})
                db.session.add(TrafficLog(
                    olt_id=olt.id, port_type='pon',
                    port_name=port_name, rx_mbps=round(r['out_mbps'], 3),
                    tx_mbps=round(r['in_mbps'], 3), recorded_at=now,
                ))
                total += 1
            db.session.commit()
        return {'success': True, 'samples': total}


def db_get_olt(olt_id):
    from models import OLT
    return OLT.query.get(olt_id)
