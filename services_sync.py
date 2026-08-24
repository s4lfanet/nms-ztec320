"""OLT sync service — core sync logic extracted from app.py route handlers.

These functions are called by route_olt.py to avoid blocking the request thread.
The actual SNMP/CLI collection is delegated to snmp_collector.py.
"""
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from models import db, OLT, OLTSyncStatus
from extensions import logger
from sync_lock import acquire_sync_lock, release_sync_lock

MAX_SYNC_WORKERS = 5


def run_single_sync(app, olt_id, sync_id, light=False):
    """Background thread function: sync a single OLT.
    
    When light=True: SNMP-only sync (no CLI, no config data).
    Used for auto-sync after ONU actions to minimize OLT load.
    """
    with app.app_context():
        olt = db.session.get(OLT, olt_id)
        sync = db.session.get(OLTSyncStatus, sync_id)
        if not olt or not sync:
            return

        # Acquire per-OLT sync lock
        lock_token = acquire_sync_lock(olt_id, timeout=0)
        if lock_token is None:
            sync.status = 'skipped'
            sync.message = 'Sync already in progress \u2014 skipped'
            sync.completed_at = datetime.now(timezone.utc)
            db.session.commit()
            logger.info(f"Sync skipped for OLT {olt_id} \u2014 already locked")
            return

        try:
            def update_progress(pct, msg):
                sync.progress = pct
                sync.message = msg
                db.session.commit()
                # Push to WebSocket clients (fire-and-forget)
                try:
                    from ws_bridge import ws_broadcast_sync
                    ws_broadcast_sync(olt_id, pct, msg, "running")
                except Exception as e:
                    logger.warning(f"[sync:{olt_id}] WebSocket broadcast (progress) failed: {e}")

            update_progress(5, 'Connecting to OLT...')

            from snmp_collector import poll_olt
            result = poll_olt(olt, progress_cb=update_progress, light=light)

            if result['success']:
                from sync_helper import save_sync_result, check_unregistered_onus
                onu_count, stale_count = save_sync_result(olt, result, sync, light=light)
                if stale_count:
                    update_progress(97, f'Removed {stale_count} deregistered ONUs')
                try:
                    check_unregistered_onus(olt)
                except Exception as e:
                    logger.warning(f"[sync:{olt_id}] check_unregistered_onus failed (non-critical): {e}")
                # Set final completed status AFTER all post-save work is done
                sync.progress = 100
                sync.status = 'completed'
                sync.message = f'Synced {onu_count} ONUs'
                sync.completed_at = datetime.now(timezone.utc)
                db.session.commit()
                # Invalidate caches so frontend sees fresh data
                try:
                    from cache import cache_clear
                    cache_clear("dashboard:*")
                    cache_clear(f"olt:{olt_id}:*")
                except Exception as e:
                    logger.warning(f"[sync:{olt_id}] cache_clear failed (non-critical): {e}")
                # Push completion to WebSocket
                try:
                    from ws_bridge import ws_broadcast_sync, ws_broadcast_dashboard
                    ws_broadcast_sync(olt_id, 100, "Sync complete", "done")
                    ws_broadcast_dashboard("onu_change", {"olt_id": olt_id, "action": "sync_complete"})
                except Exception as e:
                    logger.warning(f"[sync:{olt_id}] WebSocket broadcast (completion) failed: {e}")
            else:
                olt.is_online = False
                olt.connection_status = 'error'
                olt.snmp_status = 'disconnected'
                olt.telnet_status = 'disconnected'
                sync.status = 'error'
                sync.message = f'Sync failed: {"; ".join(result["errors"])}'
                sync.completed_at = datetime.now(timezone.utc)
                db.session.commit()
                # Push failure to WebSocket
                try:
                    from ws_bridge import ws_broadcast_sync
                    ws_broadcast_sync(olt_id, 0, sync.message, "error")
                except Exception as e:
                    logger.warning(f"[sync:{olt_id}] WebSocket broadcast (error) failed: {e}")
        except Exception as e:
            logger.error(f"Sync error: {e}")
            sync.status = 'error'
            sync.message = str(e)
            sync.completed_at = datetime.now(timezone.utc)
            db.session.commit()
        finally:
            release_sync_lock(olt_id, lock_token)


def _sync_one_olt(app, olt_id):
    """Sync a single OLT — designed to run inside a ThreadPoolExecutor worker.

    Each worker gets its own app context and SQLAlchemy session.
    Returns (olt_id, success: bool, message: str).
    """
    with app.app_context():
        # Acquire per-OLT sync lock
        lock_token = acquire_sync_lock(olt_id, timeout=0)
        if lock_token is None:
            sync = OLTSyncStatus.query.filter_by(olt_id=olt_id).first()
            if sync:
                sync.status = 'skipped'
                sync.message = 'Sync already in progress \u2014 skipped'
                sync.completed_at = datetime.now(timezone.utc)
                db.session.commit()
            logger.info(f"Sync-all skipped OLT {olt_id} \u2014 already locked")
            return olt_id, False, "Skipped \u2014 already syncing"

        try:
            olt = db.session.get(OLT, olt_id)
            if not olt:
                return olt_id, False, "OLT not found"

            sync = OLTSyncStatus.query.filter_by(olt_id=olt_id).first()
            if not sync:
                sync = OLTSyncStatus(olt_id=olt_id)
                db.session.add(sync)
            sync.status = 'running'
            sync.progress = 0
            sync.message = 'Syncing (Sync All)...'
            sync.started_at = datetime.now(timezone.utc)
            sync.completed_at = None
            db.session.commit()

            def update_progress(pct, msg):
                sync.progress = pct
                sync.message = msg
                db.session.commit()

            from snmp_collector import poll_olt
            result = poll_olt(olt, progress_cb=update_progress, light=False)

            if result.get('success'):
                from sync_helper import save_sync_result, check_unregistered_onus
                onu_count, stale_count = save_sync_result(olt, result, sync)
                try:
                    check_unregistered_onus(olt)
                except Exception as e:
                    logger.warning(f"[sync-all:{olt_id}] check_unregistered_onus failed (non-critical): {e}")
                # Set final completed status
                sync.progress = 100
                sync.status = 'completed'
                sync.message = f'Synced {onu_count} ONUs'
                sync.completed_at = datetime.now(timezone.utc)
                db.session.commit()
                # Invalidate caches so frontend sees fresh data
                try:
                    from cache import cache_clear
                    cache_clear("dashboard:*")
                    cache_clear(f"olt:{olt_id}:*")
                except Exception as e:
                    logger.warning(f"[sync-all:{olt_id}] cache_clear failed (non-critical): {e}")
                # Broadcast WebSocket events so frontend refreshes immediately
                try:
                    from ws_bridge import ws_broadcast_sync, ws_broadcast_dashboard
                    ws_broadcast_sync(olt_id, 100, "Sync complete", "done")
                    ws_broadcast_dashboard("onu_change", {"olt_id": olt_id, "action": "sync_complete"})
                except Exception as e:
                    logger.warning(f"[sync-all:{olt_id}] WebSocket broadcast (completion) failed: {e}")
                return olt_id, True, f"OK: {onu_count} ONUs"
            else:
                olt.is_online = False
                olt.connection_status = 'error'
                olt.snmp_status = 'disconnected'
                olt.telnet_status = 'disconnected'
                sync.status = 'error'
                sync.message = result.get('message', 'Sync failed')
                sync.completed_at = datetime.now(timezone.utc)
                db.session.commit()
                return olt_id, False, sync.message
        except Exception as e:
            logger.error(f"Sync-all error for OLT {olt_id}: {e}")
            try:
                sync = OLTSyncStatus.query.filter_by(olt_id=olt_id).first()
                if sync:
                    sync.status = 'error'
                    sync.message = str(e)[:200]
                    sync.completed_at = datetime.now(timezone.utc)
                    db.session.commit()
            except Exception as inner_e:
                logger.error(f"[sync-all:{olt_id}] Failed to update sync status after error: {inner_e}")
            return olt_id, False, str(e)[:200]
        finally:
            release_sync_lock(olt_id, lock_token)
            db.session.remove()



def run_sync_all(app, olt_ids):
    """Background thread function: sync multiple OLTs in parallel.

    Uses ThreadPoolExecutor with MAX_SYNC_WORKERS limit.
    Each OLT is synced in its own thread with isolated DB session.
    """
    with app.app_context():
        # Mark all OLTs as 'queued' upfront so UI shows correct status
        for olt_id in olt_ids:
            sync = OLTSyncStatus.query.filter_by(olt_id=olt_id).first()
            if not sync:
                sync = OLTSyncStatus(olt_id=olt_id)
                db.session.add(sync)
            sync.status = 'running'
            sync.progress = 0
            sync.message = 'Queued for parallel sync...'
            sync.started_at = datetime.now(timezone.utc)
            sync.completed_at = None
            db.session.commit()
        db.session.remove()

        # Parallel sync — each worker gets its own app context + DB session
        max_workers = min(MAX_SYNC_WORKERS, len(olt_ids)) if olt_ids else 1
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(_sync_one_olt, app, olt_id): olt_id
                for olt_id in olt_ids
            }
            for future in as_completed(futures):
                olt_id = futures[future]
                try:
                    olt_id, success, msg = future.result()
                    status_str = "OK" if success else "FAIL"
                    logger.info(f"Sync-all OLT {olt_id}: {status_str} — {msg}")
                except Exception as e:
                    logger.error(f"Sync-all OLT {olt_id} unexpected exception: {e}")


def start_single_sync(app, olt_id, light=False):
    """Create sync status record and start background sync thread.
    Returns (sync_record, thread).
    
    When light=True: SNMP-only sync (no Telnet, no config data).
    """
    sync = OLTSyncStatus.query.filter_by(olt_id=olt_id).first()
    if not sync:
        sync = OLTSyncStatus(olt_id=olt_id)
        db.session.add(sync)
    sync.status = 'running'
    sync.progress = 0
    sync.message = 'Starting synchronization...'
    sync.started_at = datetime.now(timezone.utc)
    sync.completed_at = None
    db.session.commit()

    thread = threading.Thread(target=run_single_sync, args=(app, olt_id, sync.id, light), daemon=True)
    thread.start()
    return sync, thread


def start_sync_all(app, olt_ids):
    """Start background sync-all thread."""
    thread = threading.Thread(target=run_sync_all, args=(app, olt_ids), daemon=True)
    thread.start()
    return thread
