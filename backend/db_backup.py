"""Application database backup — SQLite or PostgreSQL.

Core functions (`create_db_backup`, `prune_old_db_backups`) are pure — they
take a DB URI / directory and don't import Flask, so both the cron script
below (`__main__`) and the manual `/api/system/backup-db` route in app.py
can share the same logic instead of reimplementing it twice.

Backups are written to instance/backups/ (gitignored, not web-served) and
kept per a simple hourly+daily retention policy, mirroring auto_backup.py's
OLT-config retention approach.

Cron (hourly): 0 * * * * cd /opt/salfanet-nms && /opt/salfanet-nms/.venv/bin/python3 db_backup.py >> /var/log/salfanet-db-backup.log 2>&1
"""
import os
import sys
import sqlite3
import subprocess
import tempfile
from datetime import datetime
from urllib.parse import urlparse

DEFAULT_BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'backups')
MAX_HOURLY = 24
MAX_DAILY = 7


def _backup_sqlite(db_uri, dest_dir, timestamp):
    db_path = db_uri.replace('sqlite:///', '')
    if db_path == ':memory:' or not os.path.exists(db_path):
        return False, None, f'Database file not found: {db_path}'

    dest_path = os.path.join(dest_dir, f'nms_db_backup_{timestamp}.db')
    try:
        src = sqlite3.connect(db_path)
        dst = sqlite3.connect(dest_path)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
        # Verify integrity before trusting the backup
        chk = sqlite3.connect(dest_path)
        result = chk.execute('PRAGMA integrity_check').fetchone()
        chk.close()
        if result[0] != 'ok':
            os.remove(dest_path)
            return False, None, f'Backup integrity check failed: {result[0]}'
        os.chmod(dest_path, 0o600)
        return True, dest_path, ''
    except Exception as e:
        if os.path.exists(dest_path):
            os.remove(dest_path)
        return False, None, f'SQLite backup failed: {e}'


def _backup_postgres(db_uri, dest_dir, timestamp):
    dest_path = os.path.join(dest_dir, f'nms_db_backup_{timestamp}.sql.gz')
    try:
        # Credentials via env vars, never on the command line (avoids ps aux leakage).
        parsed = urlparse(db_uri)
        pg_env = os.environ.copy()
        pg_env['PGHOST'] = parsed.hostname or 'localhost'
        pg_env['PGPORT'] = str(parsed.port or 5432)
        pg_env['PGUSER'] = parsed.username or ''
        pg_env['PGPASSWORD'] = parsed.password or ''
        pg_env['PGDATABASE'] = parsed.path.lstrip('/') or ''
        with open(dest_path, 'wb') as f:
            proc = subprocess.Popen(
                ['pg_dump', '--no-password'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=pg_env
            )
            gzip_proc = subprocess.Popen(['gzip'], stdin=proc.stdout, stdout=f, stderr=subprocess.PIPE)
            proc.stdout.close()
            proc_err = proc.stderr.read().decode()
            gzip_proc.wait()
            if proc.wait() != 0:
                raise RuntimeError(proc_err or 'pg_dump exited non-zero')
        os.chmod(dest_path, 0o600)
        return True, dest_path, ''
    except FileNotFoundError:
        if os.path.exists(dest_path):
            os.remove(dest_path)
        return False, None, 'pg_dump not installed on server'
    except Exception as e:
        if os.path.exists(dest_path):
            os.remove(dest_path)
        return False, None, f'PostgreSQL backup failed: {e}'


def create_db_backup(db_uri, dest_dir=DEFAULT_BACKUP_DIR):
    """Create a timestamped backup of the app database. Returns (success, path, error)."""
    os.makedirs(dest_dir, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    if 'sqlite' in db_uri:
        return _backup_sqlite(db_uri, dest_dir, timestamp)
    if 'postgresql' in db_uri:
        return _backup_postgres(db_uri, dest_dir, timestamp)
    return False, None, f'Unsupported database type in URI: {db_uri.split("://")[0]}'


def prune_old_db_backups(dest_dir=DEFAULT_BACKUP_DIR, max_hourly=MAX_HOURLY, max_daily=MAX_DAILY):
    """Keep the most recent `max_hourly` backups plus one per day for `max_daily`
    more days beyond that; delete the rest."""
    if not os.path.isdir(dest_dir):
        return []
    files = []
    for f in os.listdir(dest_dir):
        if f.startswith('nms_db_backup_'):
            path = os.path.join(dest_dir, f)
            files.append((f, path, os.path.getmtime(path)))
    files.sort(key=lambda x: x[2], reverse=True)

    kept_hourly = 0
    daily_seen = set()
    pruned = []
    for f, path, mtime in files:
        date_key = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d')
        if kept_hourly < max_hourly:
            kept_hourly += 1
            continue
        if date_key not in daily_seen and len(daily_seen) < max_daily:
            daily_seen.add(date_key)
            continue
        os.remove(path)
        pruned.append(f)
    return pruned


if __name__ == '__main__':
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    import fcntl
    _lock_fp = open('/tmp/db_backup.lock', 'w')
    try:
        fcntl.flock(_lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except (IOError, OSError):
        print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Another db_backup instance is running, skipping.')
        sys.exit(0)

    from app import app

    with app.app_context():
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        db_uri = app.config.get('SQLALCHEMY_DATABASE_URI', '')
        print(f'[{now_str}] DB backup starting ({db_uri.split("://")[0]})...')
        ok, path, err = create_db_backup(db_uri)
        if ok:
            size = os.path.getsize(path)
            print(f'  OK — {path} ({size:,} bytes)')
            pruned = prune_old_db_backups(os.path.dirname(path))
            if pruned:
                print(f'  Pruned {len(pruned)} old backup(s): {", ".join(pruned)}')
        else:
            print(f'  FAILED: {err}')
            sys.exit(1)
        print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] DB backup done.')
