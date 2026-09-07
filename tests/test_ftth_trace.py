"""Tests for FTTH cable-trace features: full upstream path for a customer
ONU (/api/ftth/trace/onu/<id>) and downstream impact count for a given
node (/api/ftth/impact/<type>/<id>) — added so field staff can trace a
break from OLT down to a specific customer, or see how many customers a
break at a given OTB/JC/ODC/ODP would affect, across however many JC hops
sit in between.

Run with: py -3 -m pytest tests/test_ftth_trace.py -v
"""
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import User, Role, OLT, ONU, FTTHOTB, FTTHODC, FTTHODP, FTTHODPPort, FTTHJC, FTTHJCSplice, FTTHPonPort

app.config['TESTING'] = True
app.config['WTF_CSRF_ENABLED'] = False
app.config['SESSION_COOKIE_DOMAIN'] = None

H = {'X-Requested-With': 'XMLHttpRequest'}


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
def full_chain(auth_client):
    """OLT -(PON core5)-> OTB -(JC-1, splice5->3)-> ODC -(JC-2, splice2->7)->
    ODP(port1) -> ONU. Two JC hops on purpose, to prove the trace walks
    through however many sit in the chain, not just a fixed depth."""
    with app.app_context():
        olt = OLT(name='OLT-1', ip_address='10.0.0.1', vendor='zte', model='C320')
        db.session.add(olt)
        db.session.flush()
        otb = FTTHOTB(name='OTB-1', olt_id=olt.id, total_cores=12)
        db.session.add(otb)
        db.session.flush()
        pon = FTTHPonPort(olt_id=olt.id, olt_name='OLT-1', frame=1, slot=1, port=3,
                           pon_name='gpon-olt_1/1/3', otb_id=otb.id, otb_core_number=5)
        db.session.add(pon)
        jc1 = FTTHJC(name='JC-1', parent_type='otb', parent_id=otb.id)
        db.session.add(jc1)
        db.session.flush()
        db.session.add(FTTHJCSplice(jc_id=jc1.id, core_in=5, core_out=3))
        odc = FTTHODC(name='ODC-1', feed_source='jc', jc_id=jc1.id, jc_core_number=3, total_cores=8)
        db.session.add(odc)
        db.session.flush()
        jc2 = FTTHJC(name='JC-2', parent_type='odc', parent_id=odc.id)
        db.session.add(jc2)
        db.session.flush()
        db.session.add(FTTHJCSplice(jc_id=jc2.id, core_in=2, core_out=7))
        odp = FTTHODP(name='ODP-1', feed_source='jc', jc_id=jc2.id, jc_core_number=7, total_ports=4)
        db.session.add(odp)
        db.session.flush()
        for i in range(1, 5):
            db.session.add(FTTHODPPort(odp_id=odp.id, port_number=i, status='available'))
        db.session.commit()
        onu = ONU(name='Customer 1', serial_number='ZTEGTRACE1', olt_id=olt.id, status='online', frame=1, slot=1, port=3, onu_id=1)
        db.session.add(onu)
        db.session.commit()
        port1 = FTTHODPPort.query.filter_by(odp_id=odp.id, port_number=1).first()
        port1.onu_id = onu.id
        port1.status = 'used'
        db.session.commit()
        return {'olt_id': olt.id, 'otb_id': otb.id, 'jc1_id': jc1.id, 'odc_id': odc.id,
                'jc2_id': jc2.id, 'odp_id': odp.id, 'onu_id': onu.id}


class TestTraceOnu:
    def test_full_chain_traced_in_order(self, auth_client, full_chain):
        resp = auth_client.get(f'/api/ftth/trace/onu/{full_chain["onu_id"]}')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['complete'] is True
        types = [h['type'] for h in data['hops']]
        assert types == ['olt', 'otb', 'jc', 'odc', 'jc', 'odp', 'onu']

        otb_hop = next(h for h in data['hops'] if h['type'] == 'otb')
        assert otb_hop['core'] == 5
        jc1_hop = data['hops'][2]
        assert jc1_hop['name'] == 'JC-1'
        assert jc1_hop['core_in'] == 5 and jc1_hop['core_out'] == 3
        odp_hop = next(h for h in data['hops'] if h['type'] == 'odp')
        assert odp_hop['port'] == 1
        onu_hop = data['hops'][-1]
        assert onu_hop['serial'] == 'ZTEGTRACE1'

    def test_onu_without_odp_port_reports_incomplete(self, auth_client, full_chain):
        with app.app_context():
            onu = ONU(name='Unassigned', serial_number='ZTEGNOPORT', olt_id=full_chain['olt_id'], status='offline', frame=1, slot=1, port=1, onu_id=2)
            db.session.add(onu)
            db.session.commit()
            onu_id = onu.id
        resp = auth_client.get(f'/api/ftth/trace/onu/{onu_id}')
        data = resp.get_json()
        assert data['complete'] is False
        assert data['hops'] == []

    def test_broken_chain_reports_gap(self, auth_client, full_chain):
        """Detach JC-1 from its parent (simulating incomplete field data) —
        the trace should stop there with a 'gap' hop, not crash."""
        with app.app_context():
            jc1 = db.session.get(FTTHJC, full_chain['jc1_id'])
            jc1.parent_type = None
            jc1.parent_id = None
            db.session.commit()
        resp = auth_client.get(f'/api/ftth/trace/onu/{full_chain["onu_id"]}')
        data = resp.get_json()
        assert data['complete'] is False
        assert any(h['type'] == 'gap' for h in data['hops'])

    def test_unknown_onu_404(self, auth_client):
        resp = auth_client.get('/api/ftth/trace/onu/999999')
        assert resp.status_code == 404


class TestImpact:
    def test_impact_at_every_level_counts_the_one_customer(self, auth_client, full_chain):
        for node_type, key in [('otb', 'otb_id'), ('jc', 'jc1_id'), ('odc', 'odc_id'), ('jc', 'jc2_id'), ('odp', 'odp_id')]:
            resp = auth_client.get(f'/api/ftth/impact/{node_type}/{full_chain[key]}')
            data = resp.get_json()
            assert data['total'] == 1, f'{node_type}/{full_chain[key]} expected 1 downstream customer'
            assert data['online'] == 1
            assert data['customers'][0]['serial'] == 'ZTEGTRACE1'

    def test_impact_invalid_node_type(self, auth_client, full_chain):
        resp = auth_client.get(f'/api/ftth/impact/onu/{full_chain["onu_id"]}')
        assert resp.status_code == 400

    def test_impact_not_found(self, auth_client):
        resp = auth_client.get('/api/ftth/impact/otb/999999')
        assert resp.status_code == 404

    def test_impact_zero_when_nothing_downstream(self, auth_client, full_chain):
        with app.app_context():
            odc2 = FTTHODC(name='ODC-empty', feed_source='otb', otb_id=full_chain['otb_id'], otb_core_number=9, total_cores=8)
            db.session.add(odc2)
            db.session.commit()
            odc2_id = odc2.id
        resp = auth_client.get(f'/api/ftth/impact/odc/{odc2_id}')
        data = resp.get_json()
        assert data['total'] == 0
