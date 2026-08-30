#!/usr/bin/env python3
"""Quick script to check ONU distance via Telnet and compare with SNMP."""
import sys
sys.path.insert(0, '/opt/salfanet-nms')
import sqlite3

conn = sqlite3.connect('/opt/salfanet-nms/instance/nms.db')
c = conn.cursor()
c.execute("SELECT id, ip_address, cli_username, cli_password, telnet_port, telnet_enabled, ssh_enabled, ssh_port FROM olts LIMIT 1")
olt = c.fetchone()
if not olt:
    print("No OLT found")
    sys.exit(1)
print(f"OLT: id={olt[0]} ip={olt[1]} telnet_user={olt[2]} telnet_enabled={olt[5]} ssh_enabled={olt[6]}")

# Get a few ONUs with their positions
c.execute("SELECT serial_number, frame, slot, port, onu_id, distance, actual_type FROM onus LIMIT 5")
onus = c.fetchall()
for onu in onus:
    print(f"  SN={onu[0]:20s} f/s/p={onu[1]}/{onu[2]}/{onu[3]} id={onu[4]} dist={onu[5]} type={onu[6]}")
conn.close()

# Now try Telnet to get actual distance
try:
    from snmp_collector import create_cli_collector
    from models import OLT
    from app import app, db
    
    with app.app_context():
        olt_obj = db.session.get(OLT, olt[0])
        tc = create_cli_collector(olt_obj)
        tc.connect()
        
        # Get detail for first few ONUs
        for onu in onus[:3]:
            iface = f"gpon-onu_{onu[1]}/{onu[2]}/{onu[3]}:{onu[4]}"
            print(f"\nGetting detail for {iface} (SN={onu[0]})...")
            detail = tc.get_onu_detail(iface)
            print(f"  CLI distance_m: {detail.get('distance_m')}")
            print(f"  DB distance: {onu[5]}")
            if onu[5]:
                print(f"  SNMP raw would be: {onu[5] / 0.112:.0f}")
                print(f"  decode_distance(raw) = {onu[5]}")
        
        tc.close()
except Exception as e:
    print(f"Telnet error: {e}")
    import traceback
    traceback.print_exc()
