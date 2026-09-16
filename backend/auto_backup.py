#!/usr/bin/env python3
"""Auto backup OLT running-config — runs via cronjob.

Checks all OLTs with auto_backup_enabled=True.
Backs up running-config via Telnet `show running-config`.
Stores config text in DB (olt_config_backups table).
Prunes backups older than 30 days (configurable via SystemConfig `backup_retention_days`).

Cron: every 1 hour — checks if enough time has passed since last backup.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

import fcntl
from datetime import datetime, timezone, timedelta

# File lock to prevent overlapping runs
_lock_fp = open('/tmp/auto_backup.lock', 'w')
try:
    fcntl.flock(_lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
except (IOError, OSError):
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Another auto_backup instance is running, skipping.')
    sys.exit(0)

from app import app, db
from models import OLT, OLTConfigBackup, SystemConfig, Notification


def get_system_timezone():
    """Get configured timezone from SystemConfig, default Asia/Jakarta."""
    try:
        cfg = SystemConfig.query.filter_by(key='timezone').first()
        if cfg and cfg.value:
            return cfg.value
    except Exception:
        pass
    return 'Asia/Jakarta'


def get_local_now(tz_name):
    """Get current time in the given timezone as a naive datetime (for comparison)."""
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(tz_name)
        return datetime.now(tz).replace(tzinfo=None)
    except Exception:
        # Fallback: manual UTC+7 offset for Asia/Jakarta
        return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=7)


def notify_backup_failure(olt, error):
    """Create/update an in-app notification (bell icon) when auto-backup fails.
    Dedup by (olt_id, category) like other system notifications, rather than
    one row per admin — Notification has no per-user targeting field."""
    try:
        title = f'Auto-backup failed: {olt.name}'
        message = f'OLT {olt.name} ({olt.ip_address}) auto-backup failed: {error[:200]}'
        existing = Notification.query.filter_by(
            olt_id=olt.id, category='olt_backup_failed', is_read=False, resolved=False
        ).first()
        if existing:
            existing.title = title
            existing.message = message
        else:
            db.session.add(Notification(
                olt_id=olt.id,
                title=title,
                message=message,
                severity='warning',
                category='olt_backup_failed',
            ))
        db.session.commit()
    except Exception as e:
        print(f'    WARNING: could not create backup-failure notification: {e}')


def get_retention_days():
    """Get backup retention period from SystemConfig, default 30 days."""
    cfg = SystemConfig.query.filter_by(key='backup_retention_days').first()
    if cfg and cfg.value:
        try:
            days = int(cfg.value)
            if days > 0:
                return days
        except ValueError:
            pass
    return 30


def backup_olt(olt):
    """Backup a single OLT's running-config via Telnet. Returns (success, config_text, error).

    Sends 'write memory' first to persist running config to startup (NVRAM),
    then reads 'show running-config' to capture the full configuration.
    """
    from snmp_collector import create_cli_collector
    tc = create_cli_collector(olt)
    try:
        tn = tc._connect()
        if not tn:
            return False, '', 'Telnet connection failed'
        # Save running config to startup (NVRAM) before backup
        tc._send_command(tn, 'write memory', timeout=30)
        config = tc._send_command(tn, 'show running-config', timeout=60)
        tn.close()
        if config and len(config) > 50:
            return True, config, ''
        return False, '', 'Empty or too short config response'
    except Exception as e:
        return False, '', str(e)[:500]


def prune_old_backups(retention_days):
    """Delete backups older than retention_days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    old = OLTConfigBackup.query.filter(OLTConfigBackup.created_at < cutoff).all()
    for b in old:
        db.session.delete(b)
    if old:
        db.session.commit()
        print(f'  Pruned {len(old)} backup(s) older than {retention_days} days')


with app.app_context():
    now = datetime.now(timezone.utc)
    tz_name = get_system_timezone()
    local_now = get_local_now(tz_name)
    print(f'[{now.strftime("%Y-%m-%d %H:%M:%S")} UTC / {local_now.strftime("%H:%M:%S")} {tz_name}] Auto backup started')

    # Find OLTs that need backup (CLI access = Telnet or SSH)
    all_olts = OLT.query.filter_by(auto_backup_enabled=True).all()
    olts = [o for o in all_olts if o.cli_enabled]
    if not olts:
        print('  No OLTs with auto-backup enabled. Exiting.')
        sys.exit(0)

    backed_up = 0
    skipped = 0
    failed = 0

    for olt in olts:
        # Calculate interval as timedelta
        unit = olt.auto_backup_unit or 'hours'
        interval_val = olt.auto_backup_interval or 24
        if unit == 'days':
            interval_td = timedelta(days=interval_val)
        else:
            interval_td = timedelta(hours=interval_val)

        # Check if enough time has passed since last backup
        if olt.last_backup_at:
            last = olt.last_backup_at
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if now - last < interval_td:
                skipped += 1
                print(f'  {olt.name}: Skipped (last backup {interval_val}{unit[:1]} interval not reached)')
                continue

        # Check time-of-day constraint (auto_backup_time = "HH:MM" in configured timezone)
        backup_time = olt.auto_backup_time or ''
        if backup_time:
            try:
                bh, bm = map(int, backup_time.split(':'))
                # Use configured system timezone for time-of-day matching
                current_hm = local_now.hour * 60 + local_now.minute
                target_hm = bh * 60 + bm
                # Allow a 30-minute window (cron runs hourly, so we need some tolerance)
                diff = abs(current_hm - target_hm)
                if diff > 30 and diff < (1440 - 30):
                    skipped += 1
                    print(f'  {olt.name}: Skipped (backup time {backup_time} {tz_name}, now {local_now.strftime("%H:%M")} {tz_name})')
                    continue
            except (ValueError, IndexError):
                pass  # Invalid time format, ignore constraint

        # Check if OLT has CLI credentials
        if not olt.cli_username:
            print(f'  {olt.name}: Skipped (no CLI credentials)')
            skipped += 1
            continue

        print(f'  {olt.name} ({olt.ip_address}): Backing up...')
        success, config_text, error = backup_olt(olt)

        if success:
            backup = OLTConfigBackup(
                olt_id=olt.id,
                config_text=config_text,
                config_size=len(config_text),
                backup_type='auto',
                status='success',
            )
            db.session.add(backup)
            olt.last_backup_at = now
            db.session.commit()
            backed_up += 1
            print(f'    OK — {len(config_text)} bytes saved (id={backup.id})')
        else:
            # Record failure (but don't update last_backup_at so it retries next cron)
            backup = OLTConfigBackup(
                olt_id=olt.id,
                config_text='',
                config_size=0,
                backup_type='auto',
                status='failed',
                error_message=error,
            )
            db.session.add(backup)
            db.session.commit()
            notify_backup_failure(olt, error)
            failed += 1
            print(f'    FAILED — {error}')

    # Prune old backups
    retention = get_retention_days()
    prune_old_backups(retention)

    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Auto backup complete: {backed_up} backed up, {skipped} skipped, {failed} failed')
