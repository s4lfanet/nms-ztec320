"""Fase 3 — insiden: dibuat dari korelasi, digabung, pulih, alur status, API."""
import io

from app import app, db
from models import User, ONU, FTTHODC, Incident, IncidentLog
from tests.test_alert_correlation import client  # noqa: F401  (fixture)
from tests.test_outage_hierarchy import _olt, _odp, _run

H = {'X-Requested-With': 'XMLHttpRequest'}


def _login(client):
    with app.app_context():
        uid = User.query.filter_by(username='admin').first().id
    with client.session_transaction() as sess:
        sess['_user_id'] = str(uid)
        sess['_fresh'] = True


class TestLifecycle:
    def test_created_once_with_link(self, client):
        with app.app_context():
            olt = _olt()
            odc = FTTHODC(name='ODC-I'); db.session.add(odc); db.session.flush()
            _odp('ODP-I1', olt, 3, ['los'] * 3, odc=odc, start=0)
            db.session.commit()
            _, alerts = _run(olt)
            inc = Incident.query.one()
            assert alerts[0]['incident_id'] == inc.id
            assert inc.status == 'open' and inc.affected_count == 3 and inc.node_type == 'odc'
            _run(olt)
            assert Incident.query.count() == 1

    def test_merge_into_parent(self, client):
        with app.app_context():
            olt = _olt()
            odc = FTTHODC(name='ODC-M'); db.session.add(odc); db.session.flush()
            _odp('ODP-M1', olt, 3, ['los'] * 3, odc=odc, start=0)
            _odp('ODP-M2', olt, 3, [], odc=odc, start=10)
            db.session.commit()
            _run(olt)
            first = Incident.query.one()
            assert first.node_type == 'odp'
            for o in ONU.query.all():
                o.status = 'los'
            db.session.commit()
            _run(olt)
            db.session.refresh(first)
            parent = Incident.query.filter_by(node_type='odc').one()
            assert first.status == 'merged' and first.merged_into_id == parent.id
            assert IncidentLog.query.filter_by(incident_id=parent.id).count() >= 2

    def test_recovery_auto_closes_unacknowledged(self, client):
        with app.app_context():
            olt = _olt()
            odc = FTTHODC(name='ODC-P'); db.session.add(odc); db.session.flush()
            _odp('ODP-P1', olt, 3, ['dyinggasp'] * 3, odc=odc, start=0)
            db.session.commit()
            _run(olt)
            for o in ONU.query.all():
                o.status = 'online'
            db.session.commit()
            _run(olt)
            inc = Incident.query.one()
            assert inc.status == 'resolved' and inc.recovered_at is not None

    def test_recovery_keeps_acknowledged_open(self, client):
        with app.app_context():
            olt = _olt()
            odc = FTTHODC(name='ODC-Q'); db.session.add(odc); db.session.flush()
            _odp('ODP-Q1', olt, 3, ['los'] * 3, odc=odc, start=0)
            db.session.commit()
            _run(olt)
            inc = Incident.query.one()
            inc.status = 'on_site'
            for o in ONU.query.all():
                o.status = 'online'
            db.session.commit()
            _run(olt)
            db.session.refresh(inc)
            assert inc.status == 'on_site' and inc.recovered_at is not None


class TestApi:
    def _make(self):
        with app.app_context():
            olt = _olt()
            odc = FTTHODC(name='ODC-A', latitude=-6.5, longitude=106.5); db.session.add(odc); db.session.flush()
            _odp('ODP-A1', olt, 3, ['los'] * 3, odc=odc, start=0)
            db.session.commit()
            _run(olt)
            return Incident.query.one().id

    def test_status_flow_and_detail(self, client):
        iid = self._make()
        _login(client)
        lst = client.get('/api/incidents').get_json()
        assert lst['active_count'] == 1 and lst['incidents'][0]['id'] == iid
        d = client.get(f'/api/incidents/{iid}').get_json()['incident']
        assert d['maps_url'] == 'https://maps.google.com/?q=-6.5,106.5'
        assert len(d['onus']) == 3 and d['can_handle']
        r = client.post(f'/api/incidents/{iid}/status', json={'status': 'on_site'}, headers=H).get_json()
        assert r['success'] and r['incident']['acknowledged_at'] and r['incident']['en_route_at']
        assert client.post(f'/api/incidents/{iid}/status', json={'status': 'acknowledged'}, headers=H).status_code == 400
        assert client.post(f'/api/incidents/{iid}/status', json={'status': 'resolved'}, headers=H).status_code == 400
        r = client.post(f'/api/incidents/{iid}/status', json={'status': 'resolved', 'note': 'Kabel digigit tikus, sambung ulang'}, headers=H).get_json()
        assert r['incident']['status'] == 'resolved'
        assert client.get('/api/incidents').get_json()['active_count'] == 0
        assert client.get('/api/incidents?status=closed').get_json()['incidents'][0]['resolution_note'].startswith('Kabel')

    def test_notes_and_photos(self, client):
        iid = self._make()
        _login(client)
        assert client.post(f'/api/incidents/{iid}/notes', json={'note': 'OTW'}, headers=H).get_json()['success']
        png = b'\x89PNG\r\n\x1a\n' + b'0' * 32
        r = client.post(f'/api/incidents/{iid}/photos', data={'photo': (io.BytesIO(png), 'a.png'), 'note': 'tiang'},
                        headers=H, content_type='multipart/form-data').get_json()
        assert r['success']
        name = r['photo']
        assert client.get(f'/api/incidents/{iid}/photos/{name}').status_code == 200
        assert client.get(f'/api/incidents/{iid}/photos/../../nms.db').status_code == 404
        bad = client.post(f'/api/incidents/{iid}/photos', data={'photo': (io.BytesIO(b'hello'), 'x.png')},
                          headers=H, content_type='multipart/form-data')
        assert bad.status_code == 400
        logs = client.get(f'/api/incidents/{iid}').get_json()['incident']['logs']
        assert [lg['action'] for lg in logs][-2:] == ['note', 'photo']


class TestReport:
    def test_report_numbers(self, client):
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        with app.app_context():
            def mk(**kw):
                base = dict(node_type='odc', node_id=1, node_name='ODC-X', olt_id=1, title='t', peak_affected=4)
                base.update(kw)
                db.session.add(Incident(**base))
            mk(cause='fiber', status='resolved', opened_at=now - timedelta(hours=5), acknowledged_at=now - timedelta(hours=4, minutes=50),
               resolved_at=now - timedelta(hours=4), resolved_by='Andi')
            mk(cause='fiber', status='resolved', opened_at=now - timedelta(hours=10), acknowledged_at=now - timedelta(hours=9, minutes=30),
               resolved_at=now - timedelta(hours=6), resolved_by='Andi')
            mk(cause='power', status='resolved', opened_at=now - timedelta(hours=2), resolved_at=now - timedelta(hours=1, minutes=50),
               node_type='odp', node_id=5, node_name='ODP-Y')
            mk(cause='mixed', status='open', opened_at=now - timedelta(minutes=30), node_id=2, node_name='ODC-Z')
            mk(cause='fiber', status='merged', opened_at=now - timedelta(hours=1))
            mk(cause='fiber', status='resolved', opened_at=now - timedelta(days=60), resolved_at=now - timedelta(days=59), resolved_by='Lama')
            db.session.commit()
        _login(client)
        r = client.get('/api/incidents/report?days=30').get_json()
        assert r['total'] == 4 and r['active'] == 1
        assert r['resolved_handled'] == 2 and r['resolved_self'] == 1
        assert r['mttr_minutes'] == 150  # (60 + 240) / 2
        assert r['mtta_minutes'] == 20   # (10 + 30) / 2
        assert r['ttr_breaches'] == 1    # 4 jam > 3 jam
        assert r['causes'] == {'power': 1, 'fiber': 2, 'mixed': 1}
        assert r['top_nodes'][0]['node_name'] == 'ODC-X' and r['top_nodes'][0]['count'] == 2
        assert r['technicians'] == [{'name': 'Andi', 'resolved': 2, 'avg_minutes': 150}]
