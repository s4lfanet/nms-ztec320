#!/usr/bin/env python3
"""Check ONU status in DB — run on VPS."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from app import app, db
from models import ONU, OLT
from collections import Counter
from datetime import datetime, timezone

with app.app_context():
    olt = OLT.query.first()
    print(f"OLT: {olt.name} last_sync={olt.last_sync} last_full_sync={olt.last_full_sync}")
    onus = ONU.query.filter_by(olt_id=olt.id).all()
    print(f"Total ONUs: {len(onus)}")
    statuses = Counter(o.status for o in onus)
    print(f"Status counts: {dict(statuses)}")
    # Show ONUs with various statuses
    for o in onus[:10]:
        print(f"  ONU {o.id}: sn={o.serial_number} status={o.status} oper={o.oper_state} dist={o.distance} type={o.actual_type} rx={o.rx_power} onu_rx={o.onu_rx_power} last_seen={o.last_seen}")
    # Check if last_seen is recent
    now = datetime.now(timezone.utc)
    old = [o for o in onus if o.last_seen and (now - o.last_seen.replace(tzinfo=timezone.utc)).total_seconds() > 600]
    print(f"\nONUs with last_seen > 10min ago: {len(old)}")
    for o in old[:5]:
        print(f"  ONU {o.id}: sn={o.serial_number} status={o.status} last_seen={o.last_seen}")
