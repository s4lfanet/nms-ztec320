"""Fase 3 — siklus hidup insiden gangguan (dipanggil dari alert monitor)."""
import json

from models import db, Incident, IncidentLog

ACTIVE_STATUSES = ('open', 'acknowledged', 'en_route', 'on_site')
STATUS_ORDER = ('open', 'acknowledged', 'en_route', 'on_site', 'resolved')


def add_log(inc, action, note='', status='', username='', photo=''):
    db.session.add(IncidentLog(incident_id=inc.id, action=action, note=note or '',
                               status=status or '', username=username or '', photo=photo or ''))


def active_incident(node_type, node_id):
    return Incident.query.filter(
        Incident.node_type == node_type, Incident.node_id == node_id,
        Incident.status.in_(ACTIVE_STATUSES)).order_by(Incident.id.desc()).first()


def upsert_incident(node_type, node_id, node_name, category, cause, title, olt_id, down, now):
    """Open incident for this node (create when none). Returns (incident, created)."""
    inc = active_incident(node_type, node_id)
    ids = [o.id for o in down][:500]
    if inc:
        inc.affected_count = len(down)
        inc.peak_affected = max(inc.peak_affected or 0, len(down))
        inc.affected_onu_ids = json.dumps(sorted(set(json.loads(inc.affected_onu_ids or '[]')) | set(ids)))
        inc.title = title
        inc.cause = cause
        inc.recovered_at = None
        return inc, False
    inc = Incident(node_type=node_type, node_id=node_id, node_name=node_name or '',
                   category=category, cause=cause, title=title, olt_id=olt_id,
                   affected_count=len(down), peak_affected=len(down),
                   affected_onu_ids=json.dumps(ids), status='open', opened_at=now)
    db.session.add(inc)
    db.session.flush()
    add_log(inc, 'system', status='open', note=f'Insiden dibuat otomatis: {len(down)} ONU down.')
    return inc, True


def close_stale_incidents(olt_ids, root_set, still_down, threshold, parent_root, now):
    """Active incidents whose node is no longer a root: merged (a node above
    took over) or recovered (ONUs back online)."""
    if not olt_ids:
        return
    rows = Incident.query.filter(Incident.status.in_(ACTIVE_STATUSES),
                                 Incident.olt_id.in_(list(olt_ids))).all()
    for inc in rows:
        key = (inc.node_type, inc.node_id)
        if key in root_set:
            continue
        if still_down(key) >= threshold:
            parent = parent_root(key)
            target = active_incident(*parent) if parent else None
            if not target or target.id == inc.id:
                continue  # still down but no root above it yet — keep open
            inc.status = 'merged'
            inc.merged_into_id = target.id
            inc.resolved_at = now
            add_log(inc, 'system', status='merged',
                    note=f'Digabung ke insiden #{target.id} ({target.node_type.upper()} {target.node_name}).')
            who = f' Sudah diterima oleh {inc.acknowledged_by}.' if inc.acknowledged_by else ''
            add_log(target, 'system',
                    note=f'Insiden #{inc.id} ({inc.node_type.upper()} {inc.node_name}) digabung ke sini.{who}')
            continue
        if inc.recovered_at:
            continue
        inc.recovered_at = now
        inc.affected_count = 0
        if inc.status == 'open':
            inc.status = 'resolved'
            inc.resolved_at = now
            inc.resolution_note = 'Pulih sendiri sebelum insiden diterima teknisi.'
            add_log(inc, 'system', status='resolved', note=inc.resolution_note)
        else:
            add_log(inc, 'system', note='ONU terdampak sudah online lagi — konfirmasi penyebab lalu tutup insiden.')
