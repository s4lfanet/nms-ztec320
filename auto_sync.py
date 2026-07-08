#!/usr/bin/env python3
"""Auto-sync OLT via cronjob — runs poll_olt directly without HTTP/session.
Saves ALL ONU fields + config data (cards, fans, PON ports, VLANs, ONU types,
speed profiles, WAN IP, uplinks) — matching app.py's run_sync logic.
Also triggers alert check after sync so notification bell updates.
All poll_olt operations are read-only (show commands only)."""
import sys
sys.path.insert(0, '/opt/fibernms')
import os
os.chdir('/opt/fibernms')

import re
from datetime import datetime, timezone
from app import app, db
from models import (OLT, ONU, OLTSyncStatus, OLTCard, OLTPort, OLTUplink,
                    ONUVlan, ONUType, SpeedProfile, WanIpProfile, Fan,
                    Notification)
from sync_helper import save_sync_result, check_unregistered_onus


with app.app_context():
    olts = OLT.query.all()
    for olt in olts:
        if not olt.cli_username:
            continue
        print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Syncing OLT: {olt.name} ({olt.ip_address})')

        sync = OLTSyncStatus.query.filter_by(olt_id=olt.id).first()
        if not sync:
            sync = OLTSyncStatus(olt_id=olt.id)
            db.session.add(sync)
        sync.status = 'running'
        sync.progress = 0
        sync.message = 'Auto-sync started by cron'
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
                onu_count, stale_count = save_sync_result(olt, result, sync)
                print(f'  OK: {onu_count} ONUs synced' + (f', {stale_count} stale removed' if stale_count else ''))

                try:
                    unreg_count = check_unregistered_onus(olt)
                    if unreg_count:
                        print(f'  {unreg_count} unregistered ONU(s) detected')
                except Exception as e:
                    print(f'  Unregistered check error: {e}')

                try:
                    from alerts import _check_onus
                    _check_onus(force_send=False)
                    print(f'  Alert check completed')
                except Exception as e:
                    print(f'  Alert check error: {e}')

            else:
                sync.status = 'error'
                sync.message = result.get('message', 'Unknown error')
                sync.completed_at = datetime.now(timezone.utc)
                db.session.commit()
                print(f'  ERROR: {result.get("message", "Unknown")}')
        except Exception as e:
            sync.status = 'error'
            sync.message = str(e)[:200]
            sync.completed_at = datetime.now(timezone.utc)
            db.session.commit()
            print(f'  EXCEPTION: {e}')

print(f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] Auto-sync complete')
