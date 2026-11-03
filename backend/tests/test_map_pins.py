"""Fase 4 — ONU map pin lock/unlock + Google Maps link parser + lightweight pins."""
import json
import pytest
from app import app, db
from models import OLT, ONU


@pytest.fixture
def client():
    import tempfile, os
    from sqlalchemy import create_engine as _create_engine
    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False
    app.config['SESSION_COOKIE_DOMAIN'] = None
    _tmpdb = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
    _tmpdb.close()
    _test_engine = _create_engine(f'sqlite:///{_tmpdb.name}')
    with app.app_context():
        _orig = db.engines.get(None)
        db.engines[None] = _test_engine
        db.create_all()
        from models import User, Role
        if not User.query.filter_by(username='admin').first():
            role = Role(name='Full Access', description='Full admin access',
                        permissions='all_olt', is_system=True)
            db.session.add(role); db.session.flush()
            admin = User(username='admin', full_name='Administrator',
                         is_super_admin=True, role_id=role.id)
            admin.set_password('admin123')
            db.session.add(admin); db.session.commit()
    with app.test_client() as client:
        yield client
    with app.app_context():
        db.drop_all()
        if _orig is not None: db.engines[None] = _orig
        else: db.engines.pop(None, None)
    _test_engine.dispose()
    try: os.unlink(_tmpdb.name)
    except OSError: pass


def _login(client):
    resp = client.post('/api/auth/login',
        data=json.dumps({'username': 'admin', 'password': 'admin123'}),
        content_type='application/json')
    assert resp.status_code == 200


class TestMapLock:
    def test_lock_onu(self, client):
        _login(client)
        with app.app_context():
            olt = OLT(name='T', ip_address='10.0.0.1', vendor='zte')
            db.session.add(olt); db.session.flush()
            onu = ONU(olt_id=olt.id, name='c1', serial_number='ZTEG1', status='online',
                      latitude=-6.2, longitude=106.8)
            db.session.add(onu); db.session.commit()
            onuid = onu.id
        resp = client.post(f'/api/onu/{onuid}/map-lock',
            data=json.dumps({'locked': True}),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert data['map_locked'] is True
        with app.app_context():
            o = db.session.get(ONU, onuid)
            assert o.map_locked is True

    def test_unlock_onu(self, client):
        _login(client)
        with app.app_context():
            olt = OLT(name='T2', ip_address='10.0.0.2', vendor='zte')
            db.session.add(olt); db.session.flush()
            onu = ONU(olt_id=olt.id, name='c2', serial_number='ZTEG2', status='online',
                      latitude=-6.3, longitude=106.9, map_locked=True)
            db.session.add(onu); db.session.commit()
            onuid = onu.id
        resp = client.post(f'/api/onu/{onuid}/map-lock',
            data=json.dumps({'locked': False}),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        assert resp.get_json()['map_locked'] is False

    def test_404_missing_onu(self, client):
        _login(client)
        resp = client.post('/api/onu/99999/map-lock',
            data=json.dumps({'locked': True}),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 404


class TestParseMapsLink:
    def test_parse_q_param(self, client):
        _login(client)
        resp = client.post('/api/ftth/parse-maps-link',
            data=json.dumps({'text': 'https://maps.google.com/?q=-6.2,106.8'}),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert abs(data['lat'] - (-6.2)) < 0.001
        assert abs(data['lng'] - 106.8) < 0.001

    def test_parse_at_coords(self, client):
        _login(client)
        resp = client.post('/api/ftth/parse-maps-link',
            data=json.dumps({'text': 'https://maps.google.com/@-6.2,106.8,15z'}),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert abs(data['lat'] - (-6.2)) < 0.001

    def test_parse_raw_latlng(self, client):
        _login(client)
        resp = client.post('/api/ftth/parse-maps-link',
            data=json.dumps({'text': '-6.2, 106.8'}),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True

    def test_parse_invalid(self, client):
        _login(client)
        resp = client.post('/api/ftth/parse-maps-link',
            data=json.dumps({'text': 'no coordinates here'}),
            content_type='application/json',
            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is False


class TestLightweightPins:
    def test_returns_only_onus_with_coords(self, client):
        _login(client)
        with app.app_context():
            olt = OLT(name='T3', ip_address='10.0.0.3', vendor='zte')
            db.session.add(olt); db.session.flush()
            db.session.add(ONU(olt_id=olt.id, name='with', serial_number='Z1',
                              status='online', latitude=-6.2, longitude=106.8))
            db.session.add(ONU(olt_id=olt.id, name='without', serial_number='Z2',
                              status='online', latitude=None, longitude=None))
            db.session.commit()
        resp = client.get('/api/ftth/map/onu-pins',
                          headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert len(data['pins']) == 1
        assert data['pins'][0]['name'] == 'with'
        assert 'map_locked' in data['pins'][0]
