import sqlite3
c = sqlite3.connect('instance/nms.db')
r = c.execute('SELECT id,name,serial_number,card,frame,slot,port,onu_id,actual_type,onu_type,status FROM onus WHERE id=52').fetchone()
print(r)
