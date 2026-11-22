"""Fase 4 — eskalasi insiden + pengingat TTR + maintenance per node."""
from datetime import datetime, timedelta, timezone

from app import app, db
from models import (User, Role, Incident, IncidentLog, TechnicianArea, FTTHODC, ONU,
                    MaintenanceWindow, Notification, SystemConfig)
from tests.test_alert_correlation import client  # noqa: F401  (fixture)
from tests.test_outage_hierarchy import _olt, _odp, _run


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _user(name, perms, phone='6281'):
    role = Role(name=f'r-{name}', permissions=perms)
    db.session.add(role); db.session.flush()
    u = User(username=name, full_name=name.title(), phone=phone, role_id=role.id)
    u.set_password('x-' + name)
    db.session.add(u); db.session.flush()
    return u


def _incident(minutes_ago, odc_id=1, olt_id=1):
    now = _now()
    inc = Incident(node_type='odc', node_id=odc_id, node_name='ODC-E', title='Gangguan ODC: ODC-E',
                   olt_id=olt_id, affected_count=5, status='open', opened_at=now - timedelta(minutes=minutes_ago))
    db.session.add(inc); db.session.commit()
    return inc


class FakeSend:
    def __init__(self):
        self.calls = []

    def __call__(self, users, text):
        self.calls.append(([u.username for u in users], text))
        return [u.username for u in users]


class TestEscalation:
    def test_backup_then_admin(self, client):
        from escalation import check_escalations
        with app.app_context():
            olt = _olt()
            odc = FTTHODC(name='ODC-E'); db.session.add(odc); db.session.flush()
            cadangan = _user('cadangan', 'receive_alerts')
            _user('bos', 'manage_users', phone='6289')
            db.session.add(TechnicianArea(user_id=cadangan.id, node_type='odc', node_id=odc.id, role='backup'))
            inc = _incident(20, odc.id, olt.id)
            send = FakeSend()
            now = _now()
            assert check_escalations({olt.id}, now, send) == [(inc.id, 'escalate_1')]
            assert send.calls[0][0] == ['cadangan'] and 'ESKALASI' in send.calls[0][1]
            assert check_escalations({olt.id}, now + timedelta(minutes=5), send) == []
            assert check_escalations({olt.id}, now + timedelta(minutes=16), send) == [(inc.id, 'escalate_2')]
            assert send.calls[-1][0] == ['bos']
            assert check_escalations({olt.id}, now + timedelta(minutes=60), send) == []

    def test_no_backup_goes_to_admin_and_ack_stops_it(self, client):
        from escalation import check_escalations
        with app.app_context():
            olt = _olt()
            _user('bos', 'manage_users')
            inc = _incident(16, olt_id=olt.id)
            send = FakeSend()
            assert check_escalations({olt.id}, _now(), send) == [(inc.id, 'escalate_2')]
            inc2 = _incident(30, odc_id=2, olt_id=olt.id)
            inc2.status = 'acknowledged'; db.session.commit()
            assert check_escalations({olt.id}, _now(), send) == []

    def test_ttr_reminder_once(self, client):
        from escalation import check_escalations
        with app.app_context():
            olt = _olt()
            bos = _user('bos', 'manage_users')
            inc = _incident(200, olt_id=olt.id)
            inc.status = 'on_site'; inc.assigned_user_ids = str(bos.id); db.session.commit()
            send = FakeSend()
            assert check_escalations({olt.id}, _now(), send) == [(inc.id, 'ttr')]
            assert check_escalations({olt.id}, _now(), send) == []
            assert IncidentLog.query.filter_by(incident_id=inc.id, action='ttr').count() == 1

    def test_disabled(self, client):
        from escalation import check_escalations
        with app.app_context():
            db.session.add(SystemConfig(key='escalation_enabled', value='0')); db.session.commit()
            olt = _olt()
            _incident(500, olt_id=olt.id)
            assert check_escalations({olt.id}, _now(), FakeSend()) == []


class TestNodeMaintenance:
    def test_maintained_odc_suppresses_and_does_not_recover(self, client):
        with app.app_context():
            olt = _olt()
            odc = FTTHODC(name='ODC-MT'); db.session.add(odc); db.session.flush()
            _odp('ODP-MT', olt, 3, ['los'] * 3, odc=odc, start=0)
            db.session.commit()
            _, first = _run(olt)
            assert len(first) == 1
            now = _now()
            db.session.add(MaintenanceWindow(node_type='odc', node_id=odc.id, start_time=now - timedelta(minutes=1),
                                             end_time=now + timedelta(hours=1), reason='ganti splitter'))
            db.session.commit()
            _, second = _run(olt)
            assert second == []  # no new alert, no "pulih"
            assert Notification.query.filter_by(resolved=False).count() == 1
            assert Incident.query.one().status == 'open'

    def test_node_window_is_not_global(self, client):
        """A node-level window (olt_id NULL) must not mute every OLT."""
        with app.app_context():
            olt = _olt()
            now = _now()
            db.session.add(MaintenanceWindow(node_type='odp', node_id=999, start_time=now - timedelta(minutes=1),
                                             end_time=now + timedelta(hours=1)))
            db.session.commit()
            from models import MaintenanceWindow as MW
            hit = MW.query.filter(MW.start_time <= now, MW.end_time >= now).filter(
                (MW.node_type.is_(None)) | (MW.node_type == '')).filter(
                (MW.olt_id == olt.id) | (MW.olt_id.is_(None))).first()
            assert hit is None
            assert ONU.query.count() == 0


class TestMaintenanceApi:
    def test_create_node_window(self, client):
        from tests.test_incidents import _login, H
        with app.app_context():
            odc = FTTHODC(name='ODC-API'); db.session.add(odc); db.session.commit()
            odc_id = odc.id
        _login(client)
        r = client.post('/api/maintenance', json={'node_type': 'odc', 'node_id': odc_id,
                                                  'start_time': '2026-01-01T00:00:00Z', 'end_time': '2026-01-01T02:00:00Z',
                                                  'reason': 'x'}, headers=H)
        assert r.get_json()['success']
        w = client.get('/api/maintenance').get_json()['windows'][0]
        assert w['node_type'] == 'odc' and w['node_name'] == 'ODC-API' and w['olt_id'] is None
        bad = client.post('/api/maintenance', json={'node_type': 'odc', 'node_id': 999,
                                                    'start_time': '2026-01-01T00:00:00Z', 'end_time': '2026-01-01T02:00:00Z'}, headers=H)
        assert bad.status_code == 400
        bad2 = client.post('/api/maintenance', json={'start_time': '2026-01-01T02:00:00Z', 'end_time': '2026-01-01T01:00:00Z'}, headers=H)
        assert bad2.status_code == 400
