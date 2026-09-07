"""Tests for JC-flexibility on the two remaining FTTH chain segments:
OLT/PON -> OTB (a JC can now sit on the feeder trunk before the OTB) and
ODP -> client (a JC can now sit on the drop cable before the customer).
Covers trace ordering, downstream impact counting, and the detach-on-delete
safety nets for JC/splice/PON-port/ODP-port deletion.

Run with: py -3 -m pytest tests/test_ftth_jc_flex_segments.py -v
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
    """OLT -> PON -(JC-0, splice9->4)-> OTB (feed_source=jc) -> ODC (direct,
    otb core 4) -> ODP (direct) -> port1 -(JC-drop, splice1->6)-> ONU.
    Exercises a JC on the feeder trunk (OLT/PON->OTB) *and* a JC on the
    drop cable (ODP->client) in the same chain."""
    with app.app_context():
        olt = OLT(name='OLT-1', ip_address='10.0.0.1', vendor='zte', model='C320')
        db.session.add(olt)
        db.session.flush()
        pon = FTTHPonPort(olt_id=olt.id, olt_name='OLT-1', frame=1, slot=1, port=3,
                           pon_name='gpon-olt_1/1/3', otb_core_number=9)
        db.session.add(pon)
        db.session.flush()
        jc0 = FTTHJC(name='JC-0-Feeder', parent_type='pon', parent_id=pon.id)
        db.session.add(jc0)
        db.session.flush()
        db.session.add(FTTHJCSplice(jc_id=jc0.id, core_in=9, core_out=4))
        otb = FTTHOTB(name='OTB-1', feed_source='jc', jc_id=jc0.id, jc_core_number=4, total_cores=12)
        db.session.add(otb)
        db.session.flush()
        odc = FTTHODC(name='ODC-1', feed_source='otb', otb_id=otb.id, otb_core_number=2, total_cores=8)
        db.session.add(odc)
        db.session.flush()
        odp = FTTHODP(name='ODP-1', feed_source='odc', odc_id=odc.id, odc_core_number=1, total_ports=4)
        db.session.add(odp)
        db.session.flush()
        for i in range(1, 5):
            db.session.add(FTTHODPPort(odp_id=odp.id, port_number=i, status='available'))
        db.session.commit()
        jc_drop = FTTHJC(name='JC-Drop', parent_type='odp_port', parent_id=FTTHODPPort.query.filter_by(odp_id=odp.id, port_number=1).first().id)
        db.session.add(jc_drop)
        db.session.flush()
        db.session.add(FTTHJCSplice(jc_id=jc_drop.id, core_in=1, core_out=6))
        db.session.commit()
        onu = ONU(name='Customer 1', serial_number='ZTEGFLEX1', olt_id=olt.id, status='online', frame=1, slot=1, port=3, onu_id=1)
        db.session.add(onu)
        db.session.commit()
        port1 = FTTHODPPort.query.filter_by(odp_id=odp.id, port_number=1).first()
        port1.onu_id = onu.id
        port1.status = 'used'
        port1.feed_source = 'jc'
        port1.jc_id = jc_drop.id
        port1.jc_core_number = 6
        db.session.commit()
        return {'olt_id': olt.id, 'pon_id': pon.id, 'jc0_id': jc0.id, 'otb_id': otb.id,
                'odc_id': odc.id, 'odp_id': odp.id, 'port1_id': port1.id,
                'jc_drop_id': jc_drop.id, 'onu_id': onu.id}


class TestTraceWithFlexSegments:
    def test_full_chain_traced_in_order(self, auth_client, full_chain):
        resp = auth_client.get(f'/api/ftth/trace/onu/{full_chain["onu_id"]}')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['complete'] is True
        types = [h['type'] for h in data['hops']]
        assert types == ['olt', 'jc', 'otb', 'odc', 'odp', 'jc', 'onu']

        olt_hop = data['hops'][0]
        assert olt_hop['name'] == 'OLT-1'
        assert olt_hop['detail'] == 'gpon-olt_1/1/3'

        jc0_hop = data['hops'][1]
        assert jc0_hop['name'] == 'JC-0-Feeder'
        assert jc0_hop['core_in'] == 9 and jc0_hop['core_out'] == 4

        otb_hop = data['hops'][2]
        assert otb_hop['name'] == 'OTB-1'
        # 'core' is the OTB-side core feeding the *next* hop (ODC), not the
        # incoming JC core (that's otb.jc_core_number == 4 on the OTB itself)
        assert otb_hop['core'] == 2

        drop_jc_hop = data['hops'][-2]
        assert drop_jc_hop['type'] == 'jc'
        assert drop_jc_hop['name'] == 'JC-Drop'
        assert drop_jc_hop['core_in'] == 1 and drop_jc_hop['core_out'] == 6

        onu_hop = data['hops'][-1]
        assert onu_hop['serial'] == 'ZTEGFLEX1'

    def test_otb_fed_directly_by_pon_when_not_jc(self, auth_client, full_chain):
        """An OTB with feed_source='pon' (the default/original behavior)
        still resolves the OLT hop straight from FTTHPonPort, unaffected
        by the new feed_source branch."""
        with app.app_context():
            otb2 = FTTHOTB(name='OTB-2', feed_source='pon', total_cores=8)
            db.session.add(otb2)
            db.session.flush()
            olt = db.session.get(OLT, full_chain['olt_id'])
            pon2 = FTTHPonPort(olt_id=olt.id, olt_name=olt.name, frame=1, slot=1, port=4,
                                pon_name='gpon-olt_1/1/4', otb_id=otb2.id, otb_core_number=1)
            db.session.add(pon2)
            odc2 = FTTHODC(name='ODC-2', feed_source='otb', otb_id=otb2.id, otb_core_number=1, total_cores=8)
            db.session.add(odc2)
            db.session.flush()
            odp2 = FTTHODP(name='ODP-2', feed_source='odc', odc_id=odc2.id, odc_core_number=1, total_ports=2)
            db.session.add(odp2)
            db.session.flush()
            for i in range(1, 3):
                db.session.add(FTTHODPPort(odp_id=odp2.id, port_number=i, status='available'))
            db.session.commit()
            onu2 = ONU(name='Customer 2', serial_number='ZTEGFLEX2', olt_id=olt.id, status='online', frame=1, slot=1, port=4, onu_id=2)
            db.session.add(onu2)
            db.session.commit()
            port = FTTHODPPort.query.filter_by(odp_id=odp2.id, port_number=1).first()
            port.onu_id = onu2.id
            port.status = 'used'
            db.session.commit()
            onu2_id = onu2.id
        resp = auth_client.get(f'/api/ftth/trace/onu/{onu2_id}')
        data = resp.get_json()
        assert data['complete'] is True
        types = [h['type'] for h in data['hops']]
        assert types == ['olt', 'otb', 'odc', 'odp', 'onu']


class TestImpactWithFlexSegments:
    def test_impact_at_every_level_counts_the_one_customer(self, auth_client, full_chain):
        for node_type, key in [('jc', 'jc0_id'), ('otb', 'otb_id'), ('odc', 'odc_id'),
                                ('odp', 'odp_id'), ('jc', 'jc_drop_id')]:
            resp = auth_client.get(f'/api/ftth/impact/{node_type}/{full_chain[key]}')
            data = resp.get_json()
            assert data['total'] == 1, f'{node_type}/{full_chain[key]} expected 1 downstream customer'
            assert data['customers'][0]['serial'] == 'ZTEGFLEX1'


class TestDetachOnDelete:
    def test_deleting_feeder_jc_detaches_otb(self, auth_client, full_chain):
        resp = auth_client.delete(f'/api/ftth/jc/{full_chain["jc0_id"]}', headers=H)
        assert resp.status_code == 200
        with app.app_context():
            otb = db.session.get(FTTHOTB, full_chain['otb_id'])
            assert otb.jc_id is None and otb.jc_core_number is None

    def test_deleting_drop_jc_detaches_odp_port(self, auth_client, full_chain):
        resp = auth_client.delete(f'/api/ftth/jc/{full_chain["jc_drop_id"]}', headers=H)
        assert resp.status_code == 200
        with app.app_context():
            port = db.session.get(FTTHODPPort, full_chain['port1_id'])
            assert port.jc_id is None and port.jc_core_number is None
            # ONU assignment itself is untouched — only the JC waypoint is detached
            assert port.onu_id == full_chain['onu_id']

    def test_deleting_feeder_splice_detaches_otb(self, auth_client, full_chain):
        with app.app_context():
            splice = FTTHJCSplice.query.filter_by(jc_id=full_chain['jc0_id'], core_out=4).first()
            splice_id = splice.id
        resp = auth_client.delete(f'/api/ftth/jc/{full_chain["jc0_id"]}/splice/{splice_id}', headers=H)
        assert resp.status_code == 200
        with app.app_context():
            otb = db.session.get(FTTHOTB, full_chain['otb_id'])
            assert otb.jc_id is None

    def test_deleting_pon_port_detaches_jc_parent(self, auth_client, full_chain):
        resp = auth_client.delete(f'/api/ftth/pon/{full_chain["pon_id"]}', headers=H)
        assert resp.status_code == 200
        with app.app_context():
            jc0 = db.session.get(FTTHJC, full_chain['jc0_id'])
            assert jc0.parent_type is None and jc0.parent_id is None

    def test_deleting_odp_port_detaches_jc_parent(self, auth_client, full_chain):
        resp = auth_client.delete(f'/api/ftth/odp-port/{full_chain["port1_id"]}', headers=H)
        assert resp.status_code == 200
        with app.app_context():
            jc_drop = db.session.get(FTTHJC, full_chain['jc_drop_id'])
            assert jc_drop.parent_type is None and jc_drop.parent_id is None
