"""Tests for ODP berjenjang / splitter cascade (Fase 4 adopsi struktur
salfanet-radius): an ODP can be fed from a PORT on another ODP instead of
a raw core (feed_source='odp', parent_odp_port_id), since an ODP's output
is already split light. Covers cycle prevention, recursive tree nesting,
multi-level trace/impact, port-conflict validation both directions, and
detach-not-cascade on delete.

Run with: py -3 -m pytest tests/test_ftth_odp_cascade.py -v
"""
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import User, Role, OLT, ONU, FTTHOTB, FTTHODC, FTTHODP, FTTHODPPort

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
def base_chain(auth_client):
    """OTB -> ODC -> ODP-Root (direct, 4 ports). No ODP cascade yet — tests
    build the cascade on top of odp_root's ports."""
    with app.app_context():
        otb = FTTHOTB(name='OTB-1', total_cores=12)
        db.session.add(otb)
        db.session.flush()
        odc = FTTHODC(name='ODC-1', feed_source='otb', otb_id=otb.id, otb_core_number=1, total_cores=8)
        db.session.add(odc)
        db.session.flush()
        odp_root = FTTHODP(name='ODP-Root', feed_source='odc', odc_id=odc.id, odc_core_number=1, total_ports=4)
        db.session.add(odp_root)
        db.session.flush()
        for i in range(1, 5):
            db.session.add(FTTHODPPort(odp_id=odp_root.id, port_number=i, status='available'))
        db.session.commit()
        return {'otb_id': otb.id, 'odc_id': odc.id, 'odp_root_id': odp_root.id}


def _root_port_id(odp_root_id, port_number=1):
    with app.app_context():
        return FTTHODPPort.query.filter_by(odp_id=odp_root_id, port_number=port_number).first().id


class TestOdpCascadeCrud:
    def test_create_odp_fed_from_parent_port(self, auth_client, base_chain):
        parent_port_id = _root_port_id(base_chain['odp_root_id'], 1)
        resp = auth_client.post('/api/ftth/odp', json={
            'name': 'ODP-Child', 'feed_source': 'odp', 'parent_odp_port_id': parent_port_id, 'total_ports': 8,
        }, headers=H)
        assert resp.status_code == 200
        item = resp.get_json()['item']
        assert item['feed_source'] == 'odp'
        assert item['parent_odp_port_id'] == parent_port_id
        assert item['parent_odp_id'] == base_chain['odp_root_id']
        assert item['parent_odp_name'] == 'ODP-Root'
        assert item['parent_odp_port_number'] == 1

        # The parent's port list (used by the frontend picker) must now show
        # this port as claimed, so it isn't offered as available to feed a
        # second child ODP.
        ports_resp = auth_client.get(f'/api/ftth/odp/{base_chain["odp_root_id"]}/ports')
        parent_port = next(p for p in ports_resp.get_json()['ports'] if p['id'] == parent_port_id)
        assert parent_port['fed_odp_id'] == item['id']
        assert parent_port['fed_odp_name'] == 'ODP-Child'


class TestOdpCyclePrevention:
    def test_self_parent_rejected(self, auth_client, base_chain):
        parent_port_id = _root_port_id(base_chain['odp_root_id'], 1)
        child_id = auth_client.post('/api/ftth/odp', json={
            'name': 'ODP-Child', 'feed_source': 'odp', 'parent_odp_port_id': parent_port_id, 'total_ports': 4,
        }, headers=H).get_json()['item']['id']
        with app.app_context():
            own_port_id = FTTHODPPort.query.filter_by(odp_id=child_id, port_number=1).first().id
        resp = auth_client.put(f'/api/ftth/odp/{child_id}', json={
            'feed_source': 'odp', 'parent_odp_port_id': own_port_id,
        }, headers=H)
        assert resp.status_code == 400
        assert 'circular' in resp.get_json()['message'].lower()

    def test_indirect_cycle_rejected(self, auth_client, base_chain):
        root_id = base_chain['odp_root_id']
        root_port1 = _root_port_id(root_id, 1)
        odp_b = auth_client.post('/api/ftth/odp', json={
            'name': 'ODP-B', 'feed_source': 'odp', 'parent_odp_port_id': root_port1, 'total_ports': 4,
        }, headers=H).get_json()['item']

        # ODP-Root -> parent ODP-B would close the loop Root -> B -> Root
        with app.app_context():
            b_port1 = FTTHODPPort.query.filter_by(odp_id=odp_b['id'], port_number=1).first().id
        resp = auth_client.put(f'/api/ftth/odp/{root_id}', json={
            'feed_source': 'odp', 'parent_odp_port_id': b_port1,
        }, headers=H)
        assert resp.status_code == 400
        assert 'circular' in resp.get_json()['message'].lower()

    def test_valid_two_level_chain_allowed(self, auth_client, base_chain):
        root_port1 = _root_port_id(base_chain['odp_root_id'], 1)
        odp_b = auth_client.post('/api/ftth/odp', json={
            'name': 'ODP-B', 'feed_source': 'odp', 'parent_odp_port_id': root_port1, 'total_ports': 4,
        }, headers=H).get_json()['item']
        with app.app_context():
            b_port1 = FTTHODPPort.query.filter_by(odp_id=odp_b['id'], port_number=1).first().id
        resp = auth_client.post('/api/ftth/odp', json={
            'name': 'ODP-C', 'feed_source': 'odp', 'parent_odp_port_id': b_port1, 'total_ports': 4,
        }, headers=H)
        assert resp.status_code == 200
        assert resp.get_json()['item']['parent_odp_name'] == 'ODP-B'


class TestPortConflictValidation:
    def test_assigning_odp_to_port_already_used_by_onu(self, auth_client, base_chain):
        root_id = base_chain['odp_root_id']
        port1_id = _root_port_id(root_id, 1)
        with app.app_context():
            olt = OLT(name='OLT-1', ip_address='10.0.0.1', vendor='zte', model='C320')
            db.session.add(olt)
            db.session.flush()
            onu = ONU(name='Cust', serial_number='ZTEG1', olt_id=olt.id, status='online', frame=1, slot=1, port=1, onu_id=1)
            db.session.add(onu)
            db.session.commit()
            port = db.session.get(FTTHODPPort, port1_id)
            port.onu_id = onu.id
            port.status = 'used'
            db.session.commit()

        resp = auth_client.post('/api/ftth/odp', json={
            'name': 'ODP-Child', 'feed_source': 'odp', 'parent_odp_port_id': port1_id, 'total_ports': 4,
        }, headers=H)
        assert resp.status_code == 400

    def test_assigning_onu_to_port_already_feeding_child_odp(self, auth_client, base_chain):
        root_id = base_chain['odp_root_id']
        port1_id = _root_port_id(root_id, 1)
        auth_client.post('/api/ftth/odp', json={
            'name': 'ODP-Child', 'feed_source': 'odp', 'parent_odp_port_id': port1_id, 'total_ports': 4,
        }, headers=H)
        with app.app_context():
            olt = OLT(name='OLT-1', ip_address='10.0.0.1', vendor='zte', model='C320')
            db.session.add(olt)
            db.session.flush()
            onu = ONU(name='Cust', serial_number='ZTEG1', olt_id=olt.id, status='online', frame=1, slot=1, port=1, onu_id=1)
            db.session.add(onu)
            db.session.commit()
            onu_id = onu.id

        resp = auth_client.put(f'/api/ftth/odp-port/{port1_id}', json={'onu_id': onu_id}, headers=H)
        assert resp.status_code == 400


class TestTreeNesting:
    def test_child_odp_appears_nested_under_parent(self, auth_client, base_chain):
        root_id = base_chain['odp_root_id']
        port1_id = _root_port_id(root_id, 1)
        auth_client.post('/api/ftth/odp', json={
            'name': 'ODP-Child', 'feed_source': 'odp', 'parent_odp_port_id': port1_id, 'total_ports': 4,
        }, headers=H)

        tree = auth_client.get('/api/ftth/tree').get_json()['tree']
        otb_node = next(o for o in tree if o['id'] == base_chain['otb_id'])
        odp_root_node = otb_node['odcs'][0]['odps'][0]
        assert odp_root_node['name'] == 'ODP-Root'
        assert len(odp_root_node['odps']) == 1
        assert odp_root_node['odps'][0]['name'] == 'ODP-Child'

    def test_non_cascading_tree_shape_unchanged(self, auth_client, base_chain):
        """Regression guard: an ODP with no cascade children still gets an
        empty 'odps' list, and its own shape ('ports' etc) is unaffected."""
        tree = auth_client.get('/api/ftth/tree').get_json()['tree']
        otb_node = next(o for o in tree if o['id'] == base_chain['otb_id'])
        odp_root_node = otb_node['odcs'][0]['odps'][0]
        assert odp_root_node['odps'] == []
        assert len(odp_root_node['ports']) == 4


class TestTraceAndImpactThroughCascade:
    @pytest.fixture
    def two_level_cascade(self, auth_client, base_chain):
        root_id = base_chain['odp_root_id']
        root_port1 = _root_port_id(root_id, 1)
        odp_b = auth_client.post('/api/ftth/odp', json={
            'name': 'ODP-B', 'feed_source': 'odp', 'parent_odp_port_id': root_port1, 'total_ports': 4,
        }, headers=H).get_json()['item']
        with app.app_context():
            b_port1 = FTTHODPPort.query.filter_by(odp_id=odp_b['id'], port_number=1).first().id
        odp_c = auth_client.post('/api/ftth/odp', json={
            'name': 'ODP-C', 'feed_source': 'odp', 'parent_odp_port_id': b_port1, 'total_ports': 4,
        }, headers=H).get_json()['item']

        with app.app_context():
            olt = OLT(name='OLT-1', ip_address='10.0.0.1', vendor='zte', model='C320')
            db.session.add(olt)
            db.session.flush()
            onu = ONU(name='Cust', serial_number='ZTEG1', olt_id=olt.id, status='online', frame=1, slot=1, port=1, onu_id=1)
            db.session.add(onu)
            db.session.commit()
            c_port1 = FTTHODPPort.query.filter_by(odp_id=odp_c['id'], port_number=1).first()
            c_port1.onu_id = onu.id
            c_port1.status = 'used'
            db.session.commit()
            onu_id = onu.id
        return {**base_chain, 'odp_b_id': odp_b['id'], 'odp_c_id': odp_c['id'], 'onu_id': onu_id}

    def test_trace_walks_two_odp_hops(self, auth_client, two_level_cascade):
        resp = auth_client.get(f'/api/ftth/trace/onu/{two_level_cascade["onu_id"]}')
        data = resp.get_json()
        assert data['complete'] is True
        types = [h['type'] for h in data['hops']]
        assert types.count('odp') == 3  # ODP-Root, ODP-B, ODP-C
        names = [h.get('name') for h in data['hops'] if h['type'] == 'odp']
        assert names == ['ODP-Root', 'ODP-B', 'ODP-C']

    def test_impact_through_two_odp_levels(self, auth_client, two_level_cascade):
        for key in ('odp_root_id', 'odp_b_id', 'odp_c_id'):
            resp = auth_client.get(f'/api/ftth/impact/odp/{two_level_cascade[key]}')
            data = resp.get_json()
            assert data['total'] == 1, f'{key} expected 1 downstream customer'
            assert data['customers'][0]['serial'] == 'ZTEG1'


class TestDeleteDetachNotCascade:
    def test_deleting_parent_odp_detaches_child_but_does_not_delete_it(self, auth_client, base_chain):
        root_id = base_chain['odp_root_id']
        port1_id = _root_port_id(root_id, 1)
        child_id = auth_client.post('/api/ftth/odp', json={
            'name': 'ODP-Child', 'feed_source': 'odp', 'parent_odp_port_id': port1_id, 'total_ports': 4,
        }, headers=H).get_json()['item']['id']

        resp = auth_client.delete(f'/api/ftth/odp/{root_id}', headers=H)
        assert resp.status_code == 200

        with app.app_context():
            child = db.session.get(FTTHODP, child_id)
            assert child is not None  # not cascade-deleted
            assert child.parent_odp_port_id is None  # but detached
