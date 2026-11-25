"""Dependency induk-anak & jendela pemeliharaan perangkat SNMP (gaya PRTG).

- Induk (`SnmpDevice.parent_id`) TURUN → alert perangkat/port/CPU anak ditahan; yang
  terkirim satu saja: "induk turun" (ditambah daftar anak yang ikut tak terjangkau).
- Jendela pemeliharaan (`SnmpMaintenance`) → alert perangkat itu ditahan selama aktif.
Hanya membaca tabel; tidak menghubungi perangkat."""
from datetime import datetime, timedelta, timezone

from models import db, SnmpDevice, SnmpMaintenance

MAX_DEPTH = 10


def _naive_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def parse_when(v):
    """ISO-8601 (boleh 'Z'/offset) → UTC naif. ValueError bila tidak valid."""
    s = str(v or '').strip()
    if not s:
        raise ValueError('waktu kosong')
    dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def would_cycle(device_id, parent_id, parents):
    """Apakah menjadikan `parent_id` induk dari `device_id` membuat lingkaran? `parents` = {id: parent_id}."""
    seen, cur = set(), parent_id
    while cur is not None and len(seen) <= MAX_DEPTH:
        if cur == device_id:
            return True
        if cur in seen:
            return True
        seen.add(cur)
        cur = parents.get(cur)
    return False


def down_ancestor(dev, by_id):
    """Induk terdekat yang berstatus 'down' (bukan perangkat itu sendiri), atau None."""
    seen, cur, depth = {dev.id}, by_id.get(dev.parent_id), 0
    while cur is not None and cur.id not in seen and depth < MAX_DEPTH:
        if cur.enabled and cur.status == 'down':
            return cur
        seen.add(cur.id)
        cur = by_id.get(cur.parent_id)
        depth += 1
    return None


def active_maintenance(now=None):
    """({device_id,...}, semua?) untuk jendela yang aktif sekarang."""
    now = now or _naive_now()
    rows = SnmpMaintenance.query.filter(SnmpMaintenance.start_time <= now,
                                        SnmpMaintenance.end_time >= now).all()
    return {r.device_id for r in rows if r.device_id is not None}, any(r.device_id is None for r in rows)


def descendants(dev_id, children):
    """Semua keturunan (id) dari `dev_id`; `children` = {id: [anak,...]}."""
    out, stack, seen = [], list(children.get(dev_id, [])), {dev_id}
    while stack:
        c = stack.pop()
        if c in seen:
            continue
        seen.add(c)
        out.append(c)
        stack.extend(children.get(c, []))
    return out


class Scope:
    """Satu kali muat per siklus alert: siapa yang ditahan dan kenapa."""

    def __init__(self, now=None):
        self.now = now or _naive_now()
        self.devs = SnmpDevice.query.all()
        self.by_id = {d.id: d for d in self.devs}
        self.children = {}
        for d in self.devs:
            if d.parent_id:
                self.children.setdefault(d.parent_id, []).append(d.id)
        self.maint_ids, self.maint_all = active_maintenance(self.now)

    def in_maintenance(self, dev):
        return self.maint_all or dev.id in self.maint_ids

    def parent_down(self, dev):
        return down_ancestor(dev, self.by_id)

    def suppressed(self, dev):
        """(ditahan?, alasan teks)"""
        if self.in_maintenance(dev):
            return True, 'pemeliharaan'
        p = self.parent_down(dev)
        if p is not None:
            return True, f'induk {p.name} turun'
        return False, ''

    def affected_children(self, dev):
        """Keturunan yang ikut tak terjangkau (status bukan 'up') saat `dev` turun."""
        return [self.by_id[i] for i in descendants(dev.id, self.children)
                if i in self.by_id and self.by_id[i].enabled and self.by_id[i].status != 'up']
