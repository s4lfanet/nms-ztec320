"""Fase 2 — wilayah teknisi: routing alert + API."""
from app import app, db
from models import (User, Role, OLT, ONU, FTTHODC, FTTHODP, FTTHODPPort, TechnicianArea)
from tests.test_alert_correlation import client  # noqa: F401  (fixture)


def _tech(name, phone):
    role = Role.query.filter_by(name='Teknisi').first()
    if not role:
        role = Role(name='Teknisi', permissions='view_dashboard,receive_alerts')
        db.session.add(role); db.session.flush()
    u = User(username=name, full_name=name.title(), phone=phone, role_id=role.id)
    u.set_password('x-' + name)
    db.session.add(u); db.session.flush()
    return u


def _topo():
    olt = OLT(name='OLT-R', ip_address='127.0.0.21', vendor='zte')
    db.session.add(olt); db.session.flush()
    odc = FTTHODC(name='ODC-R'); db.session.add(odc); db.session.flush()
    odp = FTTHODP(name='ODP-R', odc_id=odc.id, feed_source='odc'); db.session.add(odp); db.session.flush()
    onu = ONU(olt_id=olt.id, name='cust', serial_number='ZTEGR0000001', status='los',
              frame=1, slot=1, port=1, onu_id=1)
    db.session.add(onu); db.session.flush()
    db.session.add(FTTHODPPort(odp_id=odp.id, port_number=1, onu_id=onu.id, status='used'))
    db.session.commit()
    return olt, odc, odp, onu


class TestRouting:
    def test_no_areas_everyone_gets_everything(self, client):
        from alerts import _technician_recipients
        with app.app_context():
            a, b = _tech('andi', '62811'), _tech('budi', '62812')
            olt, odc, odp, onu = _topo()
            out = _technician_recipients([{'message': 'x', 'olt_id': olt.id, 'onu_ids': [onu.id]}])
            assert set(u.username for u in out) == {'andi', 'budi'}

    def test_area_routes_to_nearest_and_noc_still_gets_it(self, client):
        from alerts import _technician_recipients
        with app.app_context():
            andi, budi, noc = _tech('andi', '62811'), _tech('budi', '62812'), _tech('noc', '62813')
            olt, odc, odp, onu = _topo()
            db.session.add(TechnicianArea(user_id=andi.id, node_type='odc', node_id=odc.id))
            db.session.add(TechnicianArea(user_id=budi.id, node_type='olt', node_id=olt.id))
            db.session.commit()
            alert = {'message': 'x', 'olt_id': olt.id, 'onu_ids': [onu.id]}
            out = _technician_recipients([alert])
            assert set(u.username for u in out) == {'andi', 'noc'}
            assert alert['assigned_user_ids'] == [andi.id]
            # outage alert on the ODC node itself
            alert2 = {'message': 'y', 'target_type': 'odc', 'target_id': odc.id, 'olt_id': olt.id}
            out2 = _technician_recipients([alert2])
            assert set(u.username for u in out2) == {'andi', 'noc'}

    def test_falls_back_to_olt_then_everyone(self, client):
        from alerts import _technician_recipients
        with app.app_context():
            budi = _tech('budi', '62812')
            olt, odc, odp, onu = _topo()
            db.session.add(TechnicianArea(user_id=budi.id, node_type='olt', node_id=olt.id))
            other = OLT(name='OLT-X', ip_address='127.0.0.22', vendor='zte')
            db.session.add(other); db.session.commit()
            out = _technician_recipients([{'message': 'x', 'olt_id': olt.id, 'onu_ids': [onu.id]}])
            assert [u.username for u in out] == ['budi']
            # unmatched alert, no NOC users → everyone so it is not lost
            out2 = _technician_recipients([{'message': 'z', 'olt_id': other.id}])
            assert [u.username for u in out2] == ['budi']

    def test_onu_technician_first(self, client):
        from alerts import _technician_recipients
        with app.app_context():
            andi, cici = _tech('andi', '62811'), _tech('cici', '62814')
            olt, odc, odp, onu = _topo()
            db.session.add(TechnicianArea(user_id=andi.id, node_type='odp', node_id=odp.id))
            db.session.add(TechnicianArea(user_id=cici.id, node_type='olt', node_id=olt.id, role='backup'))
            onu.technician_id = cici.id
            db.session.commit()
            alert = {'message': 'x', 'target_type': 'onu', 'target_id': onu.id, 'olt_id': olt.id}
            out = _technician_recipients([alert])
            assert [u.username for u in out] == ['cici']

    def test_backup_not_used_for_primary_routing(self, client):
        from alert_routing import load_areas, route_alert
        with app.app_context():
            andi = _tech('andi', '62811')
            olt, odc, odp, onu = _topo()
            db.session.add(TechnicianArea(user_id=andi.id, node_type='odc', node_id=odc.id, role='backup'))
            db.session.commit()
            alert = {'target_type': 'odc', 'target_id': odc.id}
            idx = load_areas()
            assert route_alert(alert, idx, {andi.id: andi}) == []
            assert route_alert(alert, idx, {andi.id: andi}, role='backup') == [andi]


class TestApi:
    H = {'X-Requested-With': 'XMLHttpRequest'}

    def _login(self, client):
        with app.app_context():
            uid = User.query.filter_by(username='admin').first().id
        with client.session_transaction() as sess:
            sess['_user_id'] = str(uid)
            sess['_fresh'] = True

    def test_crud(self, client):
        self._login(client)
        with app.app_context():
            andi = _tech('andi', '62811')
            olt, odc, odp, onu = _topo()
            uid, odc_id = andi.id, odc.id
        r = client.get('/api/technician-areas/nodes').get_json()
        assert {'type': 'odc', 'id': odc_id, 'name': 'ODC-R'} in r['nodes']
        r = client.post('/api/technician-areas', json={'user_id': uid, 'node_type': 'odc', 'node_id': odc_id}, headers=self.H)
        assert r.get_json()['success'], r.get_json()
        aid = r.get_json()['area']['id']
        assert r.get_json()['area']['node_name'] == 'ODC-R'
        # same pair again just updates role
        r = client.post('/api/technician-areas', json={'user_id': uid, 'node_type': 'odc', 'node_id': odc_id, 'role': 'backup'}, headers=self.H)
        assert r.get_json()['area']['id'] == aid and r.get_json()['area']['role'] == 'backup'
        assert client.post('/api/technician-areas', json={'user_id': uid, 'node_type': 'pon', 'node_id': 1}, headers=self.H).status_code == 400
        assert client.post('/api/technician-areas', json={'user_id': uid, 'node_type': 'odc', 'node_id': 999}, headers=self.H).status_code == 404
        rows = client.get('/api/technician-areas').get_json()['areas']
        assert len(rows) == 1 and rows[0]['user_name'] == 'Andi'
        assert client.delete(f'/api/technician-areas/{aid}', headers=self.H).get_json()['success']
        assert client.get('/api/technician-areas').get_json()['areas'] == []
