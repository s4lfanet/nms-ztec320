import sqlite3
conn = sqlite3.connect('/opt/salfanet-nms/instance/nms.db')
c = conn.cursor()
c.execute("SELECT DISTINCT actual_type, COUNT(*) as cnt FROM onus WHERE actual_type IS NOT NULL AND actual_type != '' GROUP BY actual_type ORDER BY actual_type")
rows = c.fetchall()
print(f"Distinct actual_type from registered ONUs: {len(rows)}")
for r in rows:
    print(f"  {r[0]:30s} ({r[1]} ONUs)")
conn.close()
