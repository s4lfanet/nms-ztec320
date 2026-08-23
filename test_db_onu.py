import sqlite3
conn = sqlite3.connect('/opt/salfanet-nms/instance/nms.db')
c = conn.cursor()
c.execute("SELECT id, olt_id, type_name, pon_type, description FROM onu_types ORDER BY olt_id, type_name")
rows = c.fetchall()
print(f"Total ONU types in DB: {len(rows)}")
for row in rows:
    print(f"  olt_id={row[1]} type={row[2]:25s} pon={row[3]:8s} desc={row[4]}")
conn.close()
