import sqlite3
conn = sqlite3.connect('instance/nms.db')
c = conn.cursor()

print('=== ONU oper_state distribution ===')
c.execute('SELECT oper_state, COUNT(*) FROM onus GROUP BY oper_state')
for row in c.fetchall():
    print(f'  oper_state={row[0]} count={row[1]}')

print()
print('=== Distinct frame/slot/port ===')
c.execute('SELECT DISTINCT frame, slot, port FROM onus ORDER BY frame, slot, port')
for row in c.fetchall():
    print(f'  f={row[0]} s={row[1]} p={row[2]}')

print()
print('=== ONU with last_seen ===')
c.execute('SELECT COUNT(*), MIN(last_seen), MAX(last_seen) FROM onus')
row = c.fetchone()
print(f'  total={row[0]} min_seen={row[1]} max_seen={row[2]}')

print()
print('=== ONU types table ===')
c.execute('SELECT * FROM onu_types')
for row in c.fetchall():
    print(f'  {row}')

conn.close()
