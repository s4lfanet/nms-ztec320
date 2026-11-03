"""RX power history aggregation + pruning — runs as a cron job (like traffic_poller.py).

Aggregates raw onu_rx_samples older than the sample retention window into
onu_rx_hourly (min/avg/max per hour), then prunes:
  - raw samples older than `rx_sample_retention_hours` (default 48)
  - hourly rows older than `rx_hourly_retention_days` (default 90)

Config keys (SystemConfig):
  rx_sample_retention_hours   raw sample TTL   (default 48)
  rx_hourly_retention_days     hourly row TTL  (default 90)
"""
from datetime import datetime, timezone, timedelta
from sqlalchemy import func

from app import app, db
from models import OnuRxSample, OnuRxHourly, SystemConfig


def _cfg_int(key, default):
    row = SystemConfig.query.filter_by(key=key).first()
    try:
        return int(row.value) if row and row.value is not None else default
    except (ValueError, TypeError):
        return default


def _hour_trunc(dt):
    return dt.replace(minute=0, second=0, microsecond=0)


def aggregate_rx_hourly():
    """Aggregate raw samples older than the retention window into hourly rows.
    Groups by (onu_id, olt_id, hour) and computes min/avg/max. Deletes raw rows
    after aggregation. Idempotent — re-running for the same hour upserts."""
    cutoff_hours = _cfg_int('rx_sample_retention_hours', 48)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=cutoff_hours)

    # Distinct (onu_id, hour) pairs in raw data older than cutoff
    pairs = db.session.query(
        OnuRxSample.onu_id,
        OnuRxSample.olt_id,
        func.strftime('%Y-%m-%d %H:00:00', OnuRxSample.polled_at).label('hour_str'),
    ).filter(OnuRxSample.polled_at < cutoff).distinct().all()

    if not pairs:
        return 0

    aggregated = 0
    for onu_id, olt_id, hour_str in pairs:
        if hour_str is None:
            continue
        if isinstance(hour_str, str):
            hour_start = datetime.strptime(hour_str, '%Y-%m-%d %H:00:00')
        else:
            hour_start = _hour_trunc(hour_str)
        if hour_start.tzinfo is None:
            hour_start = hour_start.replace(tzinfo=timezone.utc)
        hour_end = hour_start + timedelta(hours=1)

        row = db.session.query(
            func.min(OnuRxSample.rx_dbm).label('rx_min'),
            func.avg(OnuRxSample.rx_dbm).label('rx_avg'),
            func.max(OnuRxSample.rx_dbm).label('rx_max'),
            func.avg(OnuRxSample.tx_dbm).label('tx_avg'),
            func.avg(OnuRxSample.onu_rx_dbm).label('onu_rx_avg'),
            func.count(OnuRxSample.id).label('cnt'),
        ).filter(
            OnuRxSample.onu_id == onu_id,
            OnuRxSample.polled_at >= hour_start,
            OnuRxSample.polled_at < hour_end,
        ).one()

        if not row.cnt:
            continue

        existing = OnuRxHourly.query.filter_by(onu_id=onu_id, hour=hour_start).first()
        vals = dict(
            rx_min=round(float(row.rx_min), 3) if row.rx_min is not None else None,
            rx_avg=round(float(row.rx_avg), 3) if row.rx_avg is not None else None,
            rx_max=round(float(row.rx_max), 3) if row.rx_max is not None else None,
            tx_avg=round(float(row.tx_avg), 3) if row.tx_avg is not None else None,
            onu_rx_avg=round(float(row.onu_rx_avg), 3) if row.onu_rx_avg is not None else None,
            samples=int(row.cnt),
        )
        if existing:
            for k, v in vals.items():
                setattr(existing, k, v)
        else:
            db.session.add(OnuRxHourly(onu_id=onu_id, olt_id=olt_id,
                                       hour=hour_start, **vals))
        aggregated += 1

    # Delete aggregated raw rows
    OnuRxSample.query.filter(OnuRxSample.polled_at < cutoff).delete()
    db.session.commit()
    return aggregated


def prune_rx_history():
    """Prune old hourly rows beyond retention."""
    days = _cfg_int('rx_hourly_retention_days', 90)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    deleted = OnuRxHourly.query.filter(OnuRxHourly.hour < cutoff).delete()
    if deleted:
        db.session.commit()
    return deleted


if __name__ == '__main__':
    with app.app_context():
        try:
            n = aggregate_rx_hourly()
            if n:
                print(f'[{datetime.now():%Y-%m-%d %H:%M:%S}] RX: aggregated {n} hourly rows')
        except Exception as e:
            db.session.rollback()
            print(f'RX aggregation error: {e}')
        try:
            d = prune_rx_history()
            if d:
                print(f'[{datetime.now():%Y-%m-%d %H:%M:%S}] RX: pruned {d} old hourly rows')
        except Exception as e:
            db.session.rollback()
            print(f'RX prune error: {e}')
