#!/usr/bin/env python3
"""Off-site encrypted database backup — runs via cronjob daily.

Creates an encrypted tarball of the SQLite DB + WAL files and uploads
to a remote destination via SCP/S3. Falls back to local-only if no
remote configured.

Encryption: AES-256-CBC via openssl (standard, portable).
Remote: SCP to configured host (BACKUP_REMOTE_HOST + BACKUP_REMOTE_PATH).

Cron: 30 2 * * * cd /opt/salfanet-nms && /opt/salfanet-nms/.venv/bin/python3 db_backup_offsite.py >> /var/log/salfanet-backup.log 2>&1

Required env vars (set in /opt/salfanet-nms/.env or systemd):
  BACKUP_ENCRYPTION_KEY — passphrase for AES encryption (required)
  BACKUP_REMOTE_HOST — SSH host for SCP, e.g. user@backup.example.com (optional)
  BACKUP_REMOTE_PATH — remote path, e.g. /backups/nms (optional, default: /backups/nms)

If BACKUP_REMOTE_HOST is not set, encrypted backup is stored locally in
instance/backups/offsite/ and a warning is logged.
"""
import os
import sys
import shutil
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

DB_DIR = Path('instance')
DB_PATH = DB_DIR / 'nms.db'
WAL_PATH = DB_DIR / 'nms.db-wal'
SHM_PATH = DB_DIR / 'nms.db-shm'
BACKUP_DIR = DB_DIR / 'backups'
OFFSITE_DIR = BACKUP_DIR / 'offsite'
MAX_OFFSITE_BACKUPS = 7  # Keep 7 daily off-site backups


def _log(msg: str):
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] {msg}')


def create_encrypted_backup() -> str | None:
    """Create an encrypted tarball of the DB + WAL files.

    Returns path to the encrypted backup file, or None on failure.
    """
    encryption_key = os.environ.get('BACKUP_ENCRYPTION_KEY', '')
    if not encryption_key:
        _log('WARNING: BACKUP_ENCRYPTION_KEY not set — skipping off-site backup')
        return None

    if not DB_PATH.exists():
        _log(f'ERROR: DB file not found: {DB_PATH}')
        return None

    OFFSITE_DIR.mkdir(parents=True, exist_ok=True)

    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    tarball_name = f'nms_{ts}.tar'
    encrypted_name = f'nms_{ts}.tar.enc'
    encrypted_path = OFFSITE_DIR / encrypted_name

    with tempfile.TemporaryDirectory() as tmpdir:
        # Copy DB files to temp dir (safe snapshot via SQLite backup API)
        import sqlite3
        tmp_db = os.path.join(tmpdir, 'nms.db')
        src = sqlite3.connect(str(DB_PATH))
        dst = sqlite3.connect(tmp_db)
        try:
            src.backup(dst)
        except Exception as e:
            _log(f'ERROR: SQLite backup failed: {e}')
            dst.close()
            src.close()
            return None
        finally:
            dst.close()
            src.close()

        # Create tarball
        tarball_path = os.path.join(tmpdir, tarball_name)
        result = subprocess.run(
            ['tar', 'cf', tarball_path, '-C', tmpdir, 'nms.db'],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            _log(f'ERROR: tar failed: {result.stderr}')
            return None

        # Encrypt with AES-256-CBC
        result = subprocess.run(
            ['openssl', 'enc', '-aes-256-cbc', '-salt',
             '-pbkdf2', '-iter', '100000',
             '-pass', f'pass:{encryption_key}',
             '-in', tarball_path,
             '-out', str(encrypted_path)],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            _log(f'ERROR: openssl encryption failed: {result.stderr}')
            if encrypted_path.exists():
                encrypted_path.unlink()
            return None

    size = encrypted_path.stat().st_size
    _log(f'Encrypted backup OK: {encrypted_path} ({size:,} bytes)')
    return str(encrypted_path)


def upload_offsite(local_path: str) -> bool:
    """Upload encrypted backup to remote host via SCP."""
    remote_host = os.environ.get('BACKUP_REMOTE_HOST', '')
    remote_path = os.environ.get('BACKUP_REMOTE_PATH', '/backups/nms')

    if not remote_host:
        _log('WARNING: BACKUP_REMOTE_HOST not set — storing off-site backup locally only')
        return False

    remote_dest = f'{remote_host}:{remote_path}/'
    _log(f'Uploading to {remote_dest}...')

    result = subprocess.run(
        ['scp', '-o', 'StrictHostKeyChecking=accept-new',
         '-o', 'ConnectTimeout=10',
         local_path, remote_dest],
        capture_output=True, text=True, timeout=60
    )
    if result.returncode != 0:
        _log(f'ERROR: SCP upload failed: {result.stderr}')
        return False

    _log(f'Upload OK: {os.path.basename(local_path)} → {remote_dest}')
    return True


def prune_old_offsite():
    """Remove old off-site backups — keep last MAX_OFFSITE_BACKUPS."""
    if not OFFSITE_DIR.is_dir():
        return

    files = sorted(
        [f for f in OFFSITE_DIR.iterdir() if f.name.startswith('nms_') and f.name.endswith('.enc')],
        key=lambda f: f.stat().st_mtime,
        reverse=True
    )

    for old_file in files[MAX_OFFSITE_BACKUPS:]:
        old_file.unlink()
        _log(f'  Pruned old off-site backup: {old_file.name}')


def main():
    _log('Off-site encrypted backup starting...')

    # Step 1: Create encrypted backup
    encrypted_path = create_encrypted_backup()
    if not encrypted_path:
        _log('Off-site backup FAILED — no encrypted file created.')
        return

    # Step 2: Upload to remote
    upload_offsite(encrypted_path)

    # Step 3: Prune old backups
    prune_old_offsite()

    _log('Off-site encrypted backup done.')


if __name__ == '__main__':
    main()
