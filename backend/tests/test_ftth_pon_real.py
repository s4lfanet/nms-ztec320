"""Tests for GET /api/ftth/pon/real/<olt_id> — lists the PON ports already
discovered from a real OLT via SNMP/telnet sync (OLTPort table), so the
"Add PON Port" form in FTTH Infrastructure can offer a picker instead of
requiring frame/slot/port to be typed by hand.

Run with: py -3 -m pytest tests/test_ftth_pon_real.py -v
"""
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import User, Role, OLT, OLTPort, FTTHPonPort

app.config['TESTING'] = True
app.config['WTF_CSRF_ENABLED'] = False
app.config['SESSION_COOKIE_DOMAIN'] = None


@pytest.fixture(autouse=True)
def clear_rate_limits():
    from helpers import _login_attempts
    _login_attempts.clear()
    yield
    _login_attempts.clear()


@pytest.fixture
def client():
    import tempfile
    from sqlalchemy import create_engine as _create_engine

    _tmpdb = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
    _tmpdb.close()
    _test_engine = _create_engine(f'sqlite:///{_tmpdb.name}')

    with app.app_context():
        _orig_engine = db.engines.get(None)
        db.engines[None] = _test_engine
        db.create_all()
        if not User.query.filter_by(username='admin').first():
            role = Role.query.filter_by(name='Full Access').first()
            if not role:
                role = Role(name='Full Access', description='Full admin access',
                            permissions='all_olt', is_system=True)
                db.session.add(role)
                db.session.flush()
            admin = User(username='admin', full_name='Administrator',
                         is_super_admin=True, role_id=role.id)
            admin.set_password('admin123')
            db.session.add(admin)
            db.session.commit()

    with app.test_client() as client:
        yield client

    with app.app_context():
        db.drop_all()
        if _orig_engine is not None:
            db.engines[None] = _orig_engine
        else:
            db.engines.pop(None, None)
    try:
        os.unlink(_tmpdb.name)
    except (OSError, PermissionError):
        pass


@pytest.fixture
def auth_client(client):
    client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin123'})
    return client


@pytest.fixture
def olt_with_synced_ports(auth_client):
    with app.app_context():
        olt = OLT(name='OLT-REAL', ip_address='10.1.1.1', vendor='zte', model='C320')
        db.session.add(olt)
        db.session.flush()
        db.session.add(OLTPort(olt_id=olt.id, port_number=1, port_name='gpon-olt_1/1/1', onu_count=5, onu_online=4))
        db.session.add(OLTPort(olt_id=olt.id, port_number=2, port_name='gpon-olt_1/1/2', onu_count=0, onu_online=0))
        db.session.commit()
        return olt.id


class TestPonRealPorts:
    def test_returns_parsed_real_ports(self, auth_client, olt_with_synced_ports):
        resp = auth_client.get(f'/api/ftth/pon/real/{olt_with_synced_ports}')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['olt_name'] == 'OLT-REAL'
        ports = {p['port_name']: p for p in data['ports']}
        assert ports['gpon-olt_1/1/1']['frame'] == 1
        assert ports['gpon-olt_1/1/1']['slot'] == 1
        assert ports['gpon-olt_1/1/1']['port'] == 1
        assert ports['gpon-olt_1/1/1']['onu_count'] == 5
        assert ports['gpon-olt_1/1/1']['onu_online'] == 4
        assert ports['gpon-olt_1/1/1']['already_mapped'] is False

    def test_flags_already_mapped_ports(self, auth_client, olt_with_synced_ports):
        with app.app_context():
            db.session.add(FTTHPonPort(olt_id=olt_with_synced_ports, pon_name='gpon-olt_1/1/1', frame=1, slot=1, port=1))
            db.session.commit()
        resp = auth_client.get(f'/api/ftth/pon/real/{olt_with_synced_ports}')
        ports = {p['port_name']: p for p in resp.get_json()['ports']}
        assert ports['gpon-olt_1/1/1']['already_mapped'] is True
        assert ports['gpon-olt_1/1/2']['already_mapped'] is False

    def test_olt_not_found_404(self, auth_client):
        resp = auth_client.get('/api/ftth/pon/real/999999')
        assert resp.status_code == 404

    def test_empty_when_olt_never_synced(self, auth_client):
        with app.app_context():
            olt = OLT(name='OLT-UNSYNCED', ip_address='10.1.1.2', vendor='zte', model='C320')
            db.session.add(olt)
            db.session.commit()
            olt_id = olt.id
        resp = auth_client.get(f'/api/ftth/pon/real/{olt_id}')
        data = resp.get_json()
        assert data['ports'] == []
