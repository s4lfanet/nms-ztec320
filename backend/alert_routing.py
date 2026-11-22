"""Fase 2 — route alert ke teknisi wilayah.

Urutan pencarian penerima untuk satu alert (yang paling dekat dulu):
  1. teknisi ONU (`ONU.technician_id`) bila alert hanya tentang 1 ONU,
  2. teknisi `primary` di node gangguan / ODP ONU, lalu node di atasnya
     (ODP induk → ODC/JC → OTB), lalu OLT.
Teknisi tanpa wilayah sama sekali (admin/NOC) tetap menerima semua alert,
jadi tanpa data wilayah perilakunya sama dengan sebelum fitur ini.
Hanya membaca DB.
"""
from models import db, ONU, TechnicianArea
from ftth_topology import NODE_MODELS, get_node, parents_of, onu_leaf_nodes

_MAX_LEVELS = 25


def _levels_from(start_nodes):
    """BFS up the topology; returns [set(level0), set(level1), ...]."""
    levels, seen = [], set()
    frontier = [n for n in start_nodes if n not in seen]
    while frontier and len(levels) < _MAX_LEVELS:
        cur = set(frontier)
        seen |= cur
        levels.append(cur)
        nxt = []
        for t, i in cur:
            for p in parents_of(t, get_node(t, i)):
                if p not in seen:
                    nxt.append(p)
        frontier = nxt
    return levels


def alert_levels(alert):
    """Candidate area nodes for an alert, nearest first (list of sets)."""
    start = []
    tt, tid = alert.get('target_type'), alert.get('target_id')
    if tt in NODE_MODELS and tid:
        start.append((tt, tid))
    onu_ids = list(alert.get('onu_ids') or [])
    if tt == 'onu' and tid and tid not in onu_ids:
        onu_ids.append(tid)
    olt_ids = set()
    if alert.get('olt_id'):
        olt_ids.add(alert['olt_id'])
    if not start:
        for oid in onu_ids[:200]:
            onu = db.session.get(ONU, oid)
            if not onu:
                continue
            olt_ids.add(onu.olt_id)
            start.extend(onu_leaf_nodes(onu))
    levels = _levels_from(start) if start else []
    if olt_ids:
        levels.append({('olt', i) for i in olt_ids})
    return levels


def load_areas():
    idx = {}
    for a in TechnicianArea.query.all():
        idx.setdefault((a.node_type, a.node_id), []).append(a)
    return idx


def route_alert(alert, idx, eligible, role='primary'):
    """User objects (subset of `eligible`, keyed by id) responsible for this
    alert, or [] when nobody is assigned."""
    onu_ids = list(alert.get('onu_ids') or [])
    if alert.get('target_type') == 'onu' and alert.get('target_id'):
        onu_ids = [alert['target_id']]
    if role == 'primary' and len(onu_ids) == 1:
        onu = db.session.get(ONU, onu_ids[0])
        if onu and onu.technician_id in eligible:
            return [eligible[onu.technician_id]]
    for level in alert_levels(alert):
        found = []
        for node in level:
            for a in idx.get(node, []):
                if a.role == role and a.user_id in eligible and eligible[a.user_id] not in found:
                    found.append(eligible[a.user_id])
        if found:
            return found
    return []
