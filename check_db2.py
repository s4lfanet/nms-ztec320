#!/usr/bin/env python3
"""Check distance and actual_type in DB."""
import sqlite3, sys
db_path = sys.argv[1] if len(sys.argv) > 1 else '/opt/salfanet-nms/instance/nms.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()
c.execute('SELECT serial_number, distance, actual_type, status FROM onus')
rows = c.fetchall()
total = len(rows)
has_dist = sum(1 for r in rows if r[1] is not None)
has_type = sum(1 for r in rows if r[2] and r[2] != '')
empty_type = sum(1 for r in rows if not r[2] or r[2] == '')
print(f'Total ONUs: {total}, with distance: {has_dist}, with type: {has_type}, empty type: {empty_type}')
print()
print('--- Unique actual_type values ---')
c.execute("SELECT DISTINCT actual_type FROM onus")
for r in c.fetchall():
    print(f'  type={repr(r[0])}')
print()
print('--- ONUs with empty type ---')
c.execute("SELECT serial_number, actual_type, status FROM onus WHERE actual_type = '' OR actual_type IS NULL LIMIT 10")
for r in c.fetchall():
    print(f'  SN={r[0]:20s} type={repr(r[1])}  status={r[2]}')
print()
print('--- Distance range ---')
c.execute("SELECT MIN(distance), MAX(distance), AVG(distance) FROM onus WHERE distance IS NOT NULL")
r = c.fetchone()
print(f'  min={r[0]}, max={r[1]}, avg={r[2]:.1f}')
conn.close()
