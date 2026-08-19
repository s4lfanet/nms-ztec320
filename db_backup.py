#!/usr/bin/env python3
"""Automatic SQLite database backup — runs via cronjob every hour.

Copies instance/nms.db to backups/ directory with timestamp.
Keeps last 24 hourly backups and last 7 daily backups.
Uses SQLite online backup API (safe with WAL — no need to stop writes).

Cron: 0 * * * * cd /opt/salfanet-nms && /opt/salfanet-nms/.venv/bin/python3 db_backup.py >> /var/log/salfanet-backup.log 2>&1
"""
import sys
import os
import shutil
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

DB_PATH = os.path.join('instance', 'nms.db')
BACKUP_DIR = os.path.join('instance', 'backups')
MAX_HOURLY = 24
MAX_DAILY = 7


def backup_db():
    """Create a timestamped backup of the SQLite database using the online backup API."""
    if not os.path.exists(DB_PATH):
        print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] DB file not found: {DB_PATH}')
        return False

    os.makedirs(BACKUP_DIR, exist_ok=True)

    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = os.path.join(BACKUP_DIR, f'nms_{ts}.db')

    # Use SQLite online backup API — safe with WAL, no need to stop writes
    import sqlite3
    src = sqlite3.connect(DB_PATH)
    dst = sqlite3.connect(backup_path)
    try:
        src.backup(dst)
    except Exception as e:
        print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Backup failed: {e}')
        dst.close()
        src.close()
        if os.path.exists(backup_path):
            os.remove(backup_path)
        return False
    finally:
        dst.close()
        src.close()

    size = os.path.getsize(backup_path)
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Backup OK: {backup_path} ({size:,} bytes)')
    return True


def prune_old_backups():
    """Remove old backups — keep last MAX_HOURLY hourly + MAX_DAILY daily."""
    if not os.path.isdir(BACKUP_DIR):
        return

    files = []
    for f in os.listdir(BACKUP_DIR):
        if f.startswith('nms_') and f.endswith('.db'):
            path = os.path.join(BACKUP_DIR, f)
            mtime = os.path.getmtime(path)
            files.append((f, path, mtime))

    files.sort(key=lambda x: x[2], reverse=True)

    now = datetime.now()
    kept_hourly = 0
    kept_daily = set()
    daily_seen = set()

    for f, path, mtime in files:
        dt = datetime.fromtimestamp(mtime)
        date_key = dt.strftime('%Y-%m-%d')

        if kept_hourly < MAX_HOURLY:
            kept_hourly += 1
            continue

        if date_key not in daily_seen and len(daily_seen) < MAX_DAILY:
            daily_seen.add(date_key)
            continue

        os.remove(path)
        print(f'  Pruned old backup: {f}')


if __name__ == '__main__':
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] DB backup starting...')
    success = backup_db()
    if success:
        prune_old_backups()
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] DB backup done.')
