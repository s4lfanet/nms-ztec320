import sqlite3
conn = sqlite3.connect('/opt/salfanet-nms/instance/nms.db')
c = conn.cursor()
c.execute("SELECT id, name, ip_address, cli_username, cli_password, telnet_enabled, telnet_port FROM olts")
for row in c.fetchall():
    print(f"id={row[0]} name={row[1]} ip={row[2]} user={row[3]!r} pass={row[4]!r} telnet={row[5]} port={row[6]}")
conn.close()
