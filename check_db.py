#!/usr/bin/env python3
"""Quick DB check script — copy to VPS and run."""
import sqlite3, sys
db_path = sys.argv[1] if len(sys.argv) > 1 else '/opt/salfanet-nms/instance/nms.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()
c.execute('SELECT serial_number, distance, actual_type, status FROM onus LIMIT 20')
rows = c.fetchall()
for r in rows:
    print(f"SN={r[0]:20s}  distance={r[1]}  type={r[2]:30s}  status={r[3]}")
conn.close()
