"""List all OLTs from the NMS database (id, name, ip, vendor, model, community)."""
import sqlite3
import sys

db_path = sys.argv[1] if len(sys.argv) > 1 else 'instance/nms.db'
conn = sqlite3.connect(db_path)
rows = conn.execute(
    'SELECT id, name, ip_address, vendor, model, snmp_community, snmp_port, '
    'temperature FROM olts').fetchall()
if not rows:
    print('No OLTs in database')
for r in rows:
    print(f'id={r[0]} name={r[1]!r} ip={r[2]} vendor={r[3]!r} model={r[4]!r} '
          f'community={r[5]!r} port={r[6]} temp={r[7]}')
