"""OLT sync service — core sync logic extracted from app.py route handlers.

These functions are called by route_olt.py to avoid blocking the request thread.
The actual SNMP/Telnet collection is delegated to snmp_collector.py.
"""
import threading
from datetime import datetime, timezone

from models import db, OLT, OLTSyncStatus
from extensions import logger


def run_single_sync(app, olt_id, sync_id):
    """Background thread function: sync a single OLT."""
    with app.app_context():
        olt = db.session.get(OLT, olt_id)
        sync = db.session.get(OLTSyncStatus, sync_id)
        if not olt or not sync:
            return
        try:
            def update_progress(pct, msg):
                sync.progress = pct
                sync.message = msg
                db.session.commit()

            update_progress(5, 'Connecting to OLT...')

            # Dispatch to vendor adapter if registered, else fallback to ZTE poll_olt
            from olt_adapters import RackAdapterRegistry
            adapter = RackAdapterRegistry.get_adapter(olt)
            if adapter and hasattr(adapter, 'poll_olt'):
                result = adapter.poll_olt(progress_cb=update_progress)
            else:
                from snmp_collector import poll_olt
                result = poll_olt(olt, progress_cb=update_progress)

            if result['success']:
                update_progress(76, 'Saving data...')
                from sync_helper import save_sync_result, check_unregistered_onus
                onu_count, stale_count = save_sync_result(olt, result, sync)
                if stale_count:
                    update_progress(96, f'Removed {stale_count} deregistered ONUs')
                try:
                    check_unregistered_onus(olt)
                except Exception:
                    pass
            else:
                olt.is_online = False
                olt.connection_status = 'error'
                sync.status = 'error'
                sync.message = f'Sync failed: {"; ".join(result["errors"])}'
                sync.completed_at = datetime.now(timezone.utc)
                db.session.commit()
        except Exception as e:
            logger.error(f"Sync error: {e}")
            sync.status = 'error'
            sync.message = str(e)
            sync.completed_at = datetime.now(timezone.utc)
            db.session.commit()


def run_sync_all(app, olt_ids):
    """Background thread function: sync multiple OLTs sequentially."""
    with app.app_context():
        for olt_id in olt_ids:
            olt = db.session.get(OLT, olt_id)
            if not olt:
                continue
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

            try:
                def update_progress(pct, msg):
                    sync.progress = pct
                    sync.message = msg
                    db.session.commit()

                # Dispatch to vendor adapter if registered, else fallback to ZTE poll_olt
                from olt_adapters import RackAdapterRegistry
                adapter = RackAdapterRegistry.get_adapter(olt)
                if adapter and hasattr(adapter, 'poll_olt'):
                    result = adapter.poll_olt(progress_cb=update_progress)
                else:
                    from snmp_collector import poll_olt
                    result = poll_olt(olt, progress_cb=update_progress)

                if result.get('success'):
                    from sync_helper import save_sync_result, check_unregistered_onus
                    onu_count, stale_count = save_sync_result(olt, result, sync)
                    try:
                        check_unregistered_onus(olt)
                    except Exception:
                        pass
                else:
                    olt.is_online = False
                    olt.connection_status = 'error'
                    sync.status = 'error'
                    sync.message = result.get('message', 'Sync failed')
                    sync.completed_at = datetime.now(timezone.utc)
                    db.session.commit()
            except Exception as e:
                logger.error(f"Sync-all error for OLT {olt_id}: {e}")
                sync.status = 'error'
                sync.message = str(e)[:200]
                sync.completed_at = datetime.now(timezone.utc)
                db.session.commit()


def start_single_sync(app, olt_id):
    """Create sync status record and start background sync thread.
    Returns (sync_record, thread)."""
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

    thread = threading.Thread(target=run_single_sync, args=(app, olt_id, sync.id), daemon=True)
    thread.start()
    return sync, thread


def start_sync_all(app, olt_ids):
    """Start background sync-all thread."""
    thread = threading.Thread(target=run_sync_all, args=(app, olt_ids), daemon=True)
    thread.start()
    return thread
