"""Denyut jaringan untuk dashboard: seri per jam (N jam terakhir) dari
`OnuStatusHistory` — berapa ONU putus/pulih per jam per OLT, dan perkiraan jumlah
ONU online di akhir tiap jam (direkonstruksi mundur dari jumlah online saat ini).
Hanya membaca database (tanpa Telnet/SNMP).
"""
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from models import ONU, OLT, OnuStatusHistory


def _naive(dt):
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


def level(drops, total):
    """0 tenang · 1 sedikit · 2 banyak · 3 parah (relatif terhadap jumlah ONU OLT)."""
    if drops <= 0:
        return 0
    ratio = drops / max(total, 1)
    if drops >= 10 or ratio >= 0.10:
        return 3
    if drops >= 3 or ratio >= 0.03:
        return 2
    return 1


def build_pulse(hours=24, now=None):
    hours = max(1, min(int(hours), 72))
    now = _naive(now or datetime.now(timezone.utc))
    start = now - timedelta(hours=hours)
    olts = OLT.query.all()
    total = defaultdict(int)
    online_now = defaultdict(int)
    for o in ONU.query.with_entities(ONU.olt_id, ONU.status).all():
        total[o.olt_id] += 1
        if o.status == 'online':
            online_now[o.olt_id] += 1

    drops = defaultdict(lambda: [0] * hours)
    recov = defaultdict(lambda: [0] * hours)
    rows = OnuStatusHistory.query.filter(OnuStatusHistory.created_at >= start).with_entities(
        OnuStatusHistory.olt_id, OnuStatusHistory.old_status, OnuStatusHistory.new_status,
        OnuStatusHistory.created_at).all()
    for olt_id, old, new, at in rows:
        if at is None:
            continue
        i = int((_naive(at) - start).total_seconds() // 3600)
        if not 0 <= i < hours:
            continue
        if old == 'online' and new != 'online':
            drops[olt_id][i] += 1
        elif new == 'online' and old != 'online':
            recov[olt_id][i] += 1

    out_olts = {}
    g_online = [0] * hours
    g_drops = [0] * hours
    for o in olts:
        d, r = drops[o.id], recov[o.id]
        series = [0] * hours
        cur = online_now[o.id]
        for i in range(hours - 1, -1, -1):  # akhir jam i = keadaan sekarang dikurangi perubahan sesudahnya
            series[i] = max(0, min(cur, total[o.id]))
            cur = cur - r[i] + d[i]
        out_olts[o.id] = {'drops': d, 'recovers': r, 'online': series,
                          'level': [level(x, total[o.id]) for x in d], 'total': total[o.id]}
        for i in range(hours):
            g_online[i] += series[i]
            g_drops[i] += d[i]
    return {
        'hours': hours,
        'start': start.isoformat() + 'Z',
        'buckets': [(start + timedelta(hours=i)).isoformat() + 'Z' for i in range(hours)],
        'total_onu': sum(total.values()),
        'online': g_online,
        'drops': g_drops,
        'olts': out_olts,
    }
