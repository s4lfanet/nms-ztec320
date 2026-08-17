#!/usr/bin/env python3
"""Auto-sync OLT via cronjob — runs poll_olt directly without HTTP/session.

Uses LIGHT SYNC (SNMP-only) by default for frequent auto-sync to minimize OLT CPU load.
Falls back to FULL SYNC (Telnet + config data) every 6 hours or when last full sync failed.
Also triggers alert check after sync so notification bell updates.
All poll_olt operations are read-only (show commands only).
Uses file lock to prevent overlapping cron runs.

OPTIMIZED: Syncs multiple OLTs in parallel using ThreadPoolExecutor (max 5 workers).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

import fcntl
import time
from datetime import datetime, timezone, timedelta
from concurrent.futures import (ThreadPoolExecutor, as_completed,
                                TimeoutError as FuturesTimeoutError)
from app import app, db
from models import (OLT, ONU, OLTSyncStatus, OLTCard, OLTPort, OLTUplink,
                    ONUVlan, ONUType, SpeedProfile, WanIpProfile, Fan,
                    Notification)
from sync_helper import save_sync_result, check_unregistered_onus
from sync_lock import acquire_sync_lock, release_sync_lock

FULL_SYNC_INTERVAL = timedelta(hours=6)
MAX_SYNC_WORKERS = 5

# Hard ceiling for one cron run. Without it a hung poll_olt keeps the lock held
# forever and every later run exits silently, so auto-sync stops for good.
MAX_RUNTIME_SEC = int(os.environ.get('AUTO_SYNC_TIMEOUT', 1800))
# A lock held far longer than a normal run almost certainly belongs to a stuck
# process — say so loudly instead of skipping without explanation.
STALE_LOCK_SEC = MAX_RUNTIME_SEC * 2
LOCK_PATH = os.environ.get('AUTO_SYNC_LOCK', '/tmp/auto_sync.lock')


def _ts():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def _open_lock(path):
    """Open (or create) the lock file, world-writable.

    Falls back to a per-uid path when the shared file is owned by another user:
    plain open(path, 'w') raised an uncaught PermissionError there, which killed
    the run before it produced any diagnostic output.
    """
    try:
        return os.fdopen(os.open(path, os.O_RDWR | os.O_CREAT, 0o666), 'r+'), path
    except OSError as e:
        alt = f'/tmp/auto_sync.{os.getuid()}.lock'
        print(f'[{_ts()}] Cannot use lock file {path} ({e}); falling back to {alt}')
        return os.fdopen(os.open(alt, os.O_RDWR | os.O_CREAT, 0o666), 'r+'), alt


# File lock to prevent overlapping cron runs
_lock_fp, LOCK_PATH = _open_lock(LOCK_PATH)
try:
    fcntl.flock(_lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
except (IOError, OSError):
    try:
        holder = _lock_fp.read().strip() or 'unknown'
        held_for = int(time.time() - os.path.getmtime(LOCK_PATH))
    except OSError:
        holder, held_for = 'unknown', 0
    print(f'[{_ts()}] Another auto_sync instance is running '
          f'(pid {holder}, {held_for}s), skipping.')
    if held_for > STALE_LOCK_SEC:
        print(f'[{_ts()}] WARNING: lock held for {held_for}s — the holder looks '
              f'stuck. Inspect with: fuser -v {LOCK_PATH}')
    sys.exit(0)

# Record our pid so the next contender can name the holder.
_lock_fp.seek(0)
_lock_fp.truncate()
_lock_fp.write(str(os.getpid()))
_lock_fp.flush()


def _sync_one_olt(olt_id, use_light):
    """Sync a single OLT — runs inside ThreadPoolExecutor worker.

    Each worker gets its own app context and SQLAlchemy session.
    Returns (olt_id, success: bool, message: str, onu_count: int).
    """
    with app.app_context():
        # Acquire per-OLT sync lock
        lock_token = acquire_sync_lock(olt_id, timeout=0)
        if lock_token is None:
            print(f'  OLT {olt_id}: Skipped — already syncing')
            return olt_id, False, "Skipped — already syncing", 0

        try:
            olt = db.session.get(OLT, olt_id)
            if not olt:
                return olt_id, False, "OLT not found", 0

            sync_mode = 'light (SNMP-only)' if use_light else 'full (Telnet+config)'
            print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Syncing OLT: {olt.name} ({olt.ip_address}) — {sync_mode}')

            sync = OLTSyncStatus.query.filter_by(olt_id=olt.id).first()
            if not sync:
                sync = OLTSyncStatus(olt_id=olt.id)
                db.session.add(sync)
            sync.status = 'running'
            sync.progress = 0
            sync.message = f'Auto-sync ({sync_mode}) started by cron'
            sync.started_at = datetime.now(timezone.utc)
            sync.completed_at = None
            db.session.commit()

            def update_progress(pct, msg):
                sync.progress = pct
                sync.message = msg
                db.session.commit()

            from snmp_collector import poll_olt
            result = poll_olt(olt, progress_cb=update_progress, light=use_light)

            if result.get('success'):
                onu_count, stale_count = save_sync_result(olt, result, sync, light=use_light)
                print(f'  {olt.name}: OK — {onu_count} ONUs synced' + (f', {stale_count} stale removed' if stale_count else ''))

                # Only check unregistered ONUs via Telnet in full mode
                if not use_light:
                    try:
                        unreg_count = check_unregistered_onus(olt)
                        if unreg_count:
                            print(f'  {olt.name}: {unreg_count} unregistered ONU(s) detected')
                    except Exception as e:
                        print(f'  {olt.name}: Unregistered check error: {e}')

                # Set final completed status AFTER all post-save work
                sync.progress = 100
                sync.status = 'completed'
                sync.message = f'Synced {onu_count} ONUs'
                sync.completed_at = datetime.now(timezone.utc)
                db.session.commit()

                # Push WebSocket events so frontend refreshes immediately
                try:
                    from ws_bridge import ws_broadcast_sync, ws_broadcast_dashboard
                    ws_broadcast_sync(olt_id, 100, "Sync complete", "done")
                    ws_broadcast_dashboard("onu_change", {"olt_id": olt_id, "action": "sync_complete"})
                except Exception:
                    pass

                return olt_id, True, f"OK: {onu_count} ONUs", onu_count
            else:
                sync.status = 'error'
                sync.message = result.get('message', 'Unknown error')
                sync.completed_at = datetime.now(timezone.utc)
                db.session.commit()
                # Push error to WebSocket
                try:
                    from ws_bridge import ws_broadcast_sync
                    ws_broadcast_sync(olt_id, 0, sync.message, "error")
                except Exception:
                    pass
                print(f'  {olt.name}: ERROR: {result.get("message", "Unknown")}')
                return olt_id, False, result.get('message', 'Unknown'), 0
        except Exception as e:
            try:
                sync = OLTSyncStatus.query.filter_by(olt_id=olt_id).first()
                if sync:
                    sync.status = 'error'
                    sync.message = str(e)[:200]
                    sync.completed_at = datetime.now(timezone.utc)
                    db.session.commit()
            except Exception:
                pass
            print(f'  EXCEPTION: {e}')
            return olt_id, False, str(e)[:200], 0
        finally:
            release_sync_lock(olt_id, lock_token)
            db.session.remove()


# ─── Determine sync mode for each OLT (read-only, no sync yet) ───
with app.app_context():
    olts = OLT.query.all()
    sync_tasks = []  # list of (olt_id, use_light)
    for olt in olts:
        if not olt.snmp_enabled:
            continue
        use_light = True
        # Use last_full_sync (not last_sync) — last_sync is refreshed by every
        # light sync, so basing the interval on it means a full sync would never
        # fire again once the 5-minute cron is running.
        last_full = olt.last_full_sync
        if last_full is None:
            use_light = False  # Never had a full sync = full
        else:
            if last_full.tzinfo is None:
                last_full = last_full.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - last_full > FULL_SYNC_INTERVAL:
                use_light = False  # Periodic full sync
        sync_tasks.append((olt.id, use_light))
    db.session.remove()

# ─── Parallel sync ───
if sync_tasks:
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Starting parallel sync for {len(sync_tasks)} OLT(s) with max {MAX_SYNC_WORKERS} workers')
    max_workers = min(MAX_SYNC_WORKERS, len(sync_tasks))
    executor = ThreadPoolExecutor(max_workers=max_workers)
    futures = {
        executor.submit(_sync_one_olt, olt_id, use_light): olt_id
        for olt_id, use_light in sync_tasks
    }
    try:
        for future in as_completed(futures, timeout=MAX_RUNTIME_SEC):
            olt_id = futures[future]
            try:
                future.result()
            except Exception as e:
                print(f'  OLT {olt_id} unexpected exception: {e}')
    except FuturesTimeoutError:
        stuck = [futures[f] for f in futures if not f.done()]
        print(f'[{_ts()}] TIMEOUT after {MAX_RUNTIME_SEC}s — OLT id(s) still running: {stuck}')
        print(f'[{_ts()}] Aborting so the lock is released and the next run can start.')
        sys.stdout.flush()
        # Worker threads are non-daemon; a normal exit would join them and hang
        # forever on the stuck one, defeating the whole purpose of the timeout.
        os._exit(1)
    executor.shutdown(wait=True)

    # ─── Alert check: run once after all syncs complete ───
    with app.app_context():
        try:
            from alerts import _check_onus
            _check_onus(force_send=False)
            print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Alert check completed')
        except Exception as e:
            print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Alert check error: {e}')
        db.session.remove()
else:
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] No OLTs to sync')

print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Auto-sync complete')
