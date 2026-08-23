import sqlite3
conn = sqlite3.connect('/opt/salfanet-nms/instance/nms.db')
c = conn.cursor()
# Get column names
c.execute("PRAGMA table_info(onus)")
cols = c.fetchall()
print("ONU table columns:")
for col in cols:
    print(f"  {col[1]:25s} {col[2]}")

# Check if any type-related field has data
c.execute("SELECT * FROM onus LIMIT 3")
rows = c.fetchall()
col_names = [desc[0] for desc in c.description]
for row in rows:
    print("\n--- ONU ---")
    for i, val in enumerate(row):
        if val is not None and val != '':
            print(f"  {col_names[i]:25s} = {val!r}")
conn.close()
