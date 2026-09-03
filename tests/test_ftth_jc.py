"""Automated tests for FTTH JC (Joint Closure / titik sambungan) feature.

Covers: JC CRUD, splice CRUD (incl. duplicate core_out rejection), ODC/ODP
feed_source='jc' linking, cycle prevention in JC parent chains, and the
recursive /api/ftth/tree endpoint correctly nesting JC-fed nodes.

Run with: py -3 -m pytest tests/test_ftth_jc.py -v
"""
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import User, Role, FTTHOTB, FTTHODC, FTTHODP, FTTHJC, FTTHJCSplice

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
def test_otb(auth_client):
    with app.app_context():
        otb = FTTHOTB(name='OTB-1', total_cores=12)
        db.session.add(otb)
        db.session.commit()
        return otb.id


class TestJcCrud:
    def test_create_jc_fed_from_otb(self, auth_client, test_otb):
        resp = auth_client.post('/api/ftth/jc', json={
            'name': 'JC-A', 'parent_type': 'otb', 'parent_id': test_otb, 'total_cores': 12,
        }, headers=H)
        assert resp.status_code == 200
        item = resp.get_json()['item']
        assert item['parent_type'] == 'otb'
        assert item['parent_name'] == 'OTB-1'
        assert item['splice_count'] == 0
        assert item['fibers_per_tube'] == 12  # default when not specified

    def test_fibers_per_tube_optional_multi_tube(self, auth_client, test_otb):
        """A JC can span multiple tubes (e.g. 2 tubes x 12 cores = 24 cores) —
        fibers_per_tube is settable independently of total_cores."""
        resp = auth_client.post('/api/ftth/jc', json={
            'name': 'JC-multitube', 'parent_type': 'otb', 'parent_id': test_otb,
            'total_cores': 24, 'fibers_per_tube': 12,
        }, headers=H)
        item = resp.get_json()['item']
        assert item['total_cores'] == 24
        assert item['fibers_per_tube'] == 12

        upd = auth_client.put(f'/api/ftth/jc/{item["id"]}', json={'fibers_per_tube': 6}, headers=H)
        assert upd.get_json()['item']['fibers_per_tube'] == 6

    def test_delete_jc_detaches_but_does_not_cascade(self, auth_client, test_otb):
        jc_resp = auth_client.post('/api/ftth/jc', json={
            'name': 'JC-A', 'parent_type': 'otb', 'parent_id': test_otb,
        }, headers=H)
        jc_id = jc_resp.get_json()['item']['id']
        auth_client.post(f'/api/ftth/jc/{jc_id}/splice', json={'core_in': 1, 'core_out': 1}, headers=H)
        odc_resp = auth_client.post('/api/ftth/odc', json={
            'name': 'ODC-1', 'feed_source': 'jc', 'jc_id': jc_id, 'jc_core_number': 1,
        }, headers=H)
        odc_id = odc_resp.get_json()['item']['id']

        del_resp = auth_client.delete(f'/api/ftth/jc/{jc_id}', headers=H)
        assert del_resp.status_code == 200

        with app.app_context():
            odc = db.session.get(FTTHODC, odc_id)
            assert odc is not None  # not cascade-deleted
            assert odc.jc_id is None  # but detached
            assert odc.jc_core_number is None


class TestSpliceCrud:
    def test_duplicate_core_out_rejected(self, auth_client, test_otb):
        jc_resp = auth_client.post('/api/ftth/jc', json={
            'name': 'JC-A', 'parent_type': 'otb', 'parent_id': test_otb,
        }, headers=H)
        jc_id = jc_resp.get_json()['item']['id']
        r1 = auth_client.post(f'/api/ftth/jc/{jc_id}/splice', json={'core_in': 3, 'core_out': 5}, headers=H)
        assert r1.status_code == 200
        r2 = auth_client.post(f'/api/ftth/jc/{jc_id}/splice', json={'core_in': 4, 'core_out': 5}, headers=H)
        assert r2.status_code == 400
        assert 'already used' in r2.get_json()['message']

    def test_delete_splice_detaches_downstream_using_that_core(self, auth_client, test_otb):
        jc_resp = auth_client.post('/api/ftth/jc', json={
            'name': 'JC-A', 'parent_type': 'otb', 'parent_id': test_otb,
        }, headers=H)
        jc_id = jc_resp.get_json()['item']['id']
        splice_resp = auth_client.post(f'/api/ftth/jc/{jc_id}/splice', json={'core_in': 3, 'core_out': 5}, headers=H)
        splice_id = splice_resp.get_json()['splice']['id']
        odc_resp = auth_client.post('/api/ftth/odc', json={
            'name': 'ODC-1', 'feed_source': 'jc', 'jc_id': jc_id, 'jc_core_number': 5,
        }, headers=H)
        odc_id = odc_resp.get_json()['item']['id']

        auth_client.delete(f'/api/ftth/jc/{jc_id}/splice/{splice_id}', headers=H)

        with app.app_context():
            odc = db.session.get(FTTHODC, odc_id)
            assert odc.jc_id is None
            assert odc.jc_core_number is None


class TestJcCyclePrevention:
    def test_direct_self_parent_rejected(self, auth_client, test_otb):
        jc_resp = auth_client.post('/api/ftth/jc', json={
            'name': 'JC-A', 'parent_type': 'otb', 'parent_id': test_otb,
        }, headers=H)
        jc_id = jc_resp.get_json()['item']['id']
        resp = auth_client.put(f'/api/ftth/jc/{jc_id}', json={'parent_type': 'jc', 'parent_id': jc_id}, headers=H)
        assert resp.status_code == 400

    def test_indirect_cycle_rejected(self, auth_client, test_otb):
        jc_a = auth_client.post('/api/ftth/jc', json={
            'name': 'JC-A', 'parent_type': 'otb', 'parent_id': test_otb,
        }, headers=H).get_json()['item']['id']
        jc_b = auth_client.post('/api/ftth/jc', json={
            'name': 'JC-B', 'parent_type': 'jc', 'parent_id': jc_a,
        }, headers=H).get_json()['item']['id']

        # JC-A -> parent JC-B would close the loop JC-A -> JC-B -> JC-A
        resp = auth_client.put(f'/api/ftth/jc/{jc_a}', json={'parent_type': 'jc', 'parent_id': jc_b}, headers=H)
        assert resp.status_code == 400
        assert 'circular' in resp.get_json()['message'].lower()

    def test_valid_chain_allowed(self, auth_client, test_otb):
        jc_a = auth_client.post('/api/ftth/jc', json={
            'name': 'JC-A', 'parent_type': 'otb', 'parent_id': test_otb,
        }, headers=H).get_json()['item']['id']
        resp = auth_client.post('/api/ftth/jc', json={
            'name': 'JC-B', 'parent_type': 'jc', 'parent_id': jc_a,
        }, headers=H)
        assert resp.status_code == 200
        assert resp.get_json()['item']['parent_name'] == 'JC-A'


class TestFtthTreeWithJc:
    def test_jc_fed_odc_nested_under_jc_not_otb(self, auth_client, test_otb):
        """An ODC with feed_source='jc' must NOT appear in otb.odcs (that's
        reserved for direct feed_source='otb' children — pre-existing
        consumers like ProvisionWizard rely on this staying unchanged) but
        must appear nested inside its JC's own 'odcs' list."""
        jc_id = auth_client.post('/api/ftth/jc', json={
            'name': 'JC-A', 'parent_type': 'otb', 'parent_id': test_otb,
        }, headers=H).get_json()['item']['id']
        auth_client.post(f'/api/ftth/jc/{jc_id}/splice', json={'core_in': 3, 'core_out': 5}, headers=H)
        odc_id = auth_client.post('/api/ftth/odc', json={
            'name': 'ODC-JC', 'feed_source': 'jc', 'jc_id': jc_id, 'jc_core_number': 5, 'total_cores': 8,
        }, headers=H).get_json()['item']['id']
        odp_id = auth_client.post('/api/ftth/odp', json={
            'name': 'ODP-JC', 'feed_source': 'odc', 'odc_id': odc_id, 'total_ports': 4,
        }, headers=H).get_json()['item']['id']

        tree = auth_client.get('/api/ftth/tree').get_json()['tree']
        otb_node = next(o for o in tree if o['id'] == test_otb)
        assert otb_node['odcs'] == []  # nothing fed directly from OTB
        assert len(otb_node['jcs']) == 1
        jc_node = otb_node['jcs'][0]
        assert jc_node['name'] == 'JC-A'
        assert len(jc_node['splices']) == 1
        assert jc_node['odcs'][0]['name'] == 'ODC-JC'
        odp_in_tree = jc_node['odcs'][0]['odps'][0]
        assert odp_in_tree['name'] == 'ODP-JC'
        assert len(odp_in_tree['ports']) == 4

    def test_direct_otb_to_odc_tree_shape_unchanged(self, auth_client, test_otb):
        """Regression guard: the default (non-JC) path must produce the exact
        same tree shape as before JC existed, since ProvisionWizard /
        RegisterWizard / AllOnus walk otb.odcs[].odps[].ports[] directly."""
        odc_id = auth_client.post('/api/ftth/odc', json={
            'name': 'ODC-direct', 'otb_id': test_otb, 'otb_core_number': 1, 'total_cores': 8,
        }, headers=H).get_json()['item']['id']
        auth_client.post('/api/ftth/odp', json={
            'name': 'ODP-direct', 'odc_id': odc_id, 'total_ports': 4,
        }, headers=H)

        tree = auth_client.get('/api/ftth/tree').get_json()['tree']
        otb_node = next(o for o in tree if o['id'] == test_otb)
        assert otb_node['jcs'] == []
        assert len(otb_node['odcs']) == 1
        assert otb_node['odcs'][0]['name'] == 'ODC-direct'
        assert otb_node['odcs'][0]['odps'][0]['name'] == 'ODP-direct'
        assert len(otb_node['odcs'][0]['odps'][0]['ports']) == 4
