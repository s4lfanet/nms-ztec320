#!/usr/bin/env python3
"""Auto-sync OLT via cronjob — runs poll_olt directly without HTTP/session.

Uses LIGHT SYNC (SNMP-only) by default for frequent auto-sync to minimize OLT CPU load.
Falls back to FULL SYNC (Telnet + config data) every 6 hours or when last full sync failed.
Also triggers alert check after sync so notification bell updates.
All poll_olt operations are read-only (show commands only).
Uses file lock to prevent overlapping cron runs.

OPTIMIZED: Syncs multiple OLTs in parallel using ThreadPoolExecutor (max 5 workers).
"""
import sys
sys.path.insert(0, '/opt/fibernms')
import os
os.chdir('/opt/fibernms')

import fcntl
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from app import app, db
from models import (OLT, ONU, OLTSyncStatus, OLTCard, OLTPort, OLTUplink,
                    ONUVlan, ONUType, SpeedProfile, WanIpProfile, Fan,
                    Notification)
from sync_helper import save_sync_result, check_unregistered_onus

FULL_SYNC_INTERVAL = timedelta(hours=6)
MAX_SYNC_WORKERS = 5

# File lock to prevent overlapping cron runs
_lock_fp = open('/tmp/auto_sync.lock', 'w')
try:
    fcntl.flock(_lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
except (IOError, OSError):
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Another auto_sync instance is running, skipping.')
    sys.exit(0)


def _sync_one_olt(olt_id, use_light):
    """Sync a single OLT — runs inside ThreadPoolExecutor worker.

    Each worker gets its own app context and SQLAlchemy session.
    Returns (olt_id, success: bool, message: str, onu_count: int).
    """
    with app.app_context():
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
            db.session.remove()


# ─── Determine sync mode for each OLT (read-only, no sync yet) ───
with app.app_context():
    olts = OLT.query.all()
    sync_tasks = []  # list of (olt_id, use_light)
    for olt in olts:
        if not olt.snmp_enabled:
            continue
        use_light = True
        last_sync = olt.last_sync
        if last_sync is None:
            use_light = False  # First sync = full
        else:
            if last_sync.tzinfo is None:
                last_sync = last_sync.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - last_sync > FULL_SYNC_INTERVAL:
                use_light = False  # Periodic full sync
        sync_tasks.append((olt.id, use_light))
    db.session.remove()

# ─── Parallel sync ───
if sync_tasks:
    print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Starting parallel sync for {len(sync_tasks)} OLT(s) with max {MAX_SYNC_WORKERS} workers')
    max_workers = min(MAX_SYNC_WORKERS, len(sync_tasks))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_sync_one_olt, olt_id, use_light): olt_id
            for olt_id, use_light in sync_tasks
        }
        for future in as_completed(futures):
            olt_id = futures[future]
            try:
                future.result()
            except Exception as e:
                print(f'  OLT {olt_id} unexpected exception: {e}')

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
