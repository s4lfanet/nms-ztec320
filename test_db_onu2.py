import sqlite3
conn = sqlite3.connect('/opt/salfanet-nms/instance/nms.db')
c = conn.cursor()

# Check all tables
c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in c.fetchall()]
print("Tables:", tables)

# Check olts
c.execute("SELECT id, name, ip_address, telnet_enabled FROM olts")
print("\nOLTs:")
for row in c.fetchall():
    print(f"  id={row[0]} name={row[1]} ip={row[2]} telnet={row[3]}")

# Search for any table with 'onu' or 'type' in name
for t in tables:
    if 'onu' in t.lower() or 'type' in t.lower():
        c.execute(f"SELECT COUNT(*) FROM {t}")
        cnt = c.fetchone()[0]
        print(f"\n  Table '{t}': {cnt} rows")
        if cnt > 0 and cnt < 50:
            c.execute(f"SELECT * FROM {t} LIMIT 10")
            for r in c.fetchall():
                print(f"    {r}")

conn.close()
