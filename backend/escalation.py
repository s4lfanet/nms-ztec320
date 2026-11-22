"""Fase 4 — eskalasi insiden yang belum diterima + pengingat target TTR.

Dijalankan tiap siklus alert monitor:
  * insiden `open` yang belum diterima ≥ N menit → teknisi cadangan wilayah
    (TechnicianArea role=backup); belum juga ≥ N menit lagi → admin
    (super admin / izin manage_users yang punya nomor WA). Tanpa cadangan
    langsung ke admin.
  * insiden aktif yang melewati target TTR (default 3 jam) → satu pengingat
    ke penanggung jawab + admin.
Hanya baca/tulis DB + kirim WA; tidak ada perintah ke OLT.
"""
import json
from datetime import datetime, timezone

from extensions import logger
from models import db, SystemConfig, User, Incident, IncidentLog
from incidents import ACTIVE_STATUSES, add_log


def _naive(dt):
    return dt.replace(tzinfo=None) if dt is not None and dt.tzinfo else dt


def escalation_settings():
    keys = ['escalation_enabled', 'escalation_ack_minutes', 'escalation_ttr_hours']
    cfg = {c.key: c.value for c in SystemConfig.query.filter(SystemConfig.key.in_(keys)).all()}
    enabled = str(cfg.get('escalation_enabled', '1')).strip().lower() not in ('0', 'false', 'off', 'no')

    def _int(key, default, lo, hi):
        try:
            v = int(cfg.get(key) or default)
        except (TypeError, ValueError):
            v = default
        return max(lo, min(hi, v))
    return enabled, _int('escalation_ack_minutes', 15, 5, 240), _int('escalation_ttr_hours', 3, 1, 72)


def _admins():
    out = []
    for u in User.query.filter(User.phone != None, User.phone != '').all():  # noqa: E711
        if u.is_super_admin or (u.role and u.role.has_permission('manage_users')):
            out.append(u)
    return out


def _backups(inc):
    from alert_routing import load_areas, route_alert
    eligible = {u.id: u for u in User.query.filter(User.phone != None, User.phone != '').all()}  # noqa: E711
    alert = {'target_type': inc.node_type, 'target_id': inc.node_id, 'olt_id': inc.olt_id,
             'onu_ids': json.loads(inc.affected_onu_ids or '[]')[:50]}
    return route_alert(alert, load_areas(), eligible, role='backup')


def _assigned(inc):
    ids = [int(x) for x in (inc.assigned_user_ids or '').split(',') if x.strip().isdigit()]
    return [u for u in (db.session.get(User, i) for i in ids) if u and u.phone]


def _send(users, text):
    from alerts import _wa_send
    sent = []
    for u in users:
        if _wa_send(u.phone, text, label=u.username):
            sent.append(u.full_name or u.username)
    return sent


def check_escalations(olt_ids, now=None, send=None):
    """Returns a list of (incident_id, kind) actions taken (for tests/logs)."""
    enabled, ack_min, ttr_h = escalation_settings()
    if not enabled or not olt_ids:
        return []
    from alerts import _deep_link_url
    send = send or _send
    now = _naive(now or datetime.now(timezone.utc))
    actions = []
    rows = Incident.query.filter(Incident.status.in_(ACTIVE_STATUSES),
                                 Incident.olt_id.in_(list(olt_ids))).all()
    for inc in rows:
        link = _deep_link_url('incident', inc.id)
        opened = _naive(inc.opened_at) or now
        # ── belum diterima ──
        if inc.status == 'open' and (inc.escalation_level or 0) < 2:
            since = _naive(inc.last_escalated_at) or opened
            if (now - since).total_seconds() >= ack_min * 60:
                level = (inc.escalation_level or 0) + 1
                targets, who = [], ''
                if level == 1:
                    targets, who = _backups(inc), 'teknisi cadangan'
                    if not targets:
                        level = 2
                if level == 2:
                    targets, who = _admins(), 'admin'
                waited = int((now - opened).total_seconds() // 60)
                text = (f"⏰ ESKALASI — insiden #{inc.id} belum diterima {waited} menit\n\n"
                        f"{inc.title}\n"
                        f"Terdampak: {inc.affected_count} pelanggan\n"
                        + (f"🛠️ Terima: {link}" if link else ''))
                names = send(targets, text) if targets else []
                inc.escalation_level = level
                inc.last_escalated_at = now
                add_log(inc, 'system', note=f"Eskalasi ke {who}: {', '.join(names) or 'tidak ada nomor WA'}.")
                actions.append((inc.id, f'escalate_{level}'))
        # ── melewati target TTR ──
        if (now - opened).total_seconds() >= ttr_h * 3600 and \
                not IncidentLog.query.filter_by(incident_id=inc.id, action='ttr').first():
            targets = {u.id: u for u in _assigned(inc) + _admins()}.values()
            text = (f"⌛ Insiden #{inc.id} sudah lebih dari {ttr_h} jam belum selesai\n\n"
                    f"{inc.title}\nStatus: {inc.status}\n" + (f"🔗 {link}" if link else ''))
            names = send(list(targets), text)
            add_log(inc, 'ttr', note=f"Melewati target {ttr_h} jam. Pengingat ke: {', '.join(names) or '-'}.")
            actions.append((inc.id, 'ttr'))
    if actions:
        db.session.commit()
        logger.info(f"[ALERT] escalation actions: {actions}")
    return actions
