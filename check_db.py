import sqlite3, sys
db_path = sys.argv[1] if len(sys.argv) > 1 else 'instance/nms.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()

print('=== OLT TABLE ===')
c.execute('SELECT id, name, ip_address, snmp_enabled, telnet_enabled, cli_username, cli_password, is_online, connection_status FROM olts')
cols = [d[0] for d in c.description]
for row in c.fetchall():
    print(f'  id={row[0]} name={row[1]} ip={row[2]} snmp={row[3]} telnet={row[4]} cli_user={row[5]!r} cli_pass={row[6]!r} online={row[7]} status={row[8]}')

print()
print('=== ONU COUNT PER OLT ===')
c.execute('SELECT olt_id, COUNT(*), SUM(CASE WHEN oper_state="online" THEN 1 ELSE 0 END) as online_count FROM onus GROUP BY olt_id')
for row in c.fetchall():
    print(f'  olt_id={row[0]} total_onus={row[1]} online={row[2]}')

print()
print('=== ONU SAMPLE (first 10) ===')
c.execute('SELECT id, olt_id, name, serial_number, oper_state, frame, slot, port, onu_id FROM onus LIMIT 10')
for row in c.fetchall():
    print(f'  id={row[0]} olt={row[1]} name={row[2]} sn={row[3]} state={row[4]} f/s/p={row[5]}/{row[6]}/{row[7]} onu_id={row[8]}')

print()
print('=== SYNC STATUS ===')
c.execute('SELECT * FROM olt_sync_status')
for row in c.fetchall():
    print(f'  {row}')

print()
print('=== SPEED PROFILES ===')
c.execute('SELECT olt_id, profile_type, name FROM speed_profiles ORDER BY olt_id, profile_type')
for row in c.fetchall():
    print(f'  olt={row[0]} type={row[1]} name={row[2]}')

print()
print('=== ONU TYPES ===')
c.execute('SELECT olt_id, type_name FROM onu_types ORDER BY olt_id')
for row in c.fetchall():
    print(f'  olt={row[0]} type={row[1]}')

print()
print('=== VLANS ===')
c.execute('SELECT olt_id, vlan_id, vlan_name FROM onu_vlans ORDER BY olt_id, vlan_id')
for row in c.fetchall():
    print(f'  olt={row[0]} vlan={row[1]} name={row[2]}')

conn.close()
