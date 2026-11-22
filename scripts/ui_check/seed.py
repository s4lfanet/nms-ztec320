"""Isi database contoh untuk uji tampilan (3 OLT, 180 ONU, 1 super admin).

Pakai DB terpisah — JANGAN arahkan ke database produksi:
    DATABASE_URL=sqlite:////tmp/ui-check.db UI_CHECK_PASSWORD=... python scripts/ui_check/seed.py
"""
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'backend'))
if 'DATABASE_URL' not in os.environ:
    sys.exit('Set DATABASE_URL ke database uji (mis. sqlite:////tmp/ui-check.db)')

from app import app, db  # noqa: E402
from models import User, OLT, ONU  # noqa: E402

USER = os.environ.get('UI_CHECK_USER', 'uicheck')
PASSWORD = os.environ.get('UI_CHECK_PASSWORD', '')
if not PASSWORD:
    sys.exit('Set UI_CHECK_PASSWORD (password akun uji, bebas — mis. hasil openssl rand -hex 16)')

random.seed(4)
with app.app_context():
    db.create_all()
    if not User.query.filter_by(username=USER).first():
        u = User(username=USER, full_name='UI Check', is_super_admin=True, phone='081200000001')
        u.set_password(PASSWORD)
        u.must_change_password = False
        db.session.add(u)
    if not OLT.query.first():
        for i, n in enumerate(['C320-PASKA', 'C320-RW04', 'HIOSO 1']):
            o = OLT(name=n, ip_address=f'10.10.0.{i + 1}', vendor='hioso' if 'HIOSO' in n else 'zte',
                    model='HA7304' if 'HIOSO' in n else 'C320', is_online=(i != 2),
                    connection_status='connected' if i != 2 else 'offline', temperature=41 + i * 6)
            db.session.add(o)
            db.session.flush()
            st = {'online': 0, 'offline': 0, 'los': 0, 'dyinggasp': 0}
            for k in range(1, 61):
                s = random.choices(['online', 'offline', 'los', 'dyinggasp'], [88, 5, 4, 3])[0]
                st[s] += 1
                rx = round(random.uniform(-29, -16), 2) if s == 'online' else None
                db.session.add(ONU(
                    olt_id=o.id, frame=1, slot=1, port=(k % 4) + 1, onu_id=k,
                    name=random.choice(['budi', 'ani', 'yoga', 'sari', 'dedi', 'rina']) + f'@rw0{k % 9}',
                    pppoe=f'user{k}@rw0{k % 9}', serial_number=f'ZTEGC{random.randint(10**6, 10**7):07X}',
                    status=s, rx_power=rx, onu_rx_power=(rx - 1.2) if rx is not None else None,
                    tx_power=round(random.uniform(1, 3), 2) if s == 'online' else None,
                    distance=random.randint(80, 4200),
                    actual_type=random.choice(['F609', 'F670L', 'HG8145V5', 'EG8041V5'])))
            o.total_onu = 60
            o.online_onu, o.offline_onu = st['online'], st['offline']
            o.los_onu, o.dyinggasp_onu = st['los'], st['dyinggasp']
    db.session.commit()
print('seeded')
