"""Tests for FTTH fiber-core status tracking (FTTHFiberCore) and its
assignment history (FTTHCoreAssignmentHistory) — Phase 3 of the
salfanet-radius structure adoption. Purely additive/supplementary: verifies
_touch_core()/_release_core() keep the tracking table in sync with the
existing feed_source/*_core_number fields whenever they're set/cleared via
the OTB/ODC/ODP/ODP-port/JC-splice endpoints, without touching the
authoritative topology itself (already covered by test_ftth_jc.py etc).

Run with: py -3 -m pytest tests/test_ftth_fiber_core.py -v
"""
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import User, Role, FTTHOTB, FTTHODC, FTTHFiberCore, FTTHCoreAssignmentHistory

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


class TestCoreTouchedOnAssign:
    def test_creating_odc_marks_otb_core_used(self, auth_client, test_otb):
        resp = auth_client.post('/api/ftth/odc', json={
            'name': 'ODC-1', 'otb_id': test_otb, 'otb_core_number': 5, 'feed_source': 'otb',
        }, headers=H)
        assert resp.status_code == 200
        odc_id = resp.get_json()['item']['id']

        cores_resp = auth_client.get(f'/api/ftth/cores/otb/{test_otb}', headers=H)
        cores = cores_resp.get_json()['cores']
        core5 = next(c for c in cores if c['core_number'] == 5)
        assert core5['status'] == 'used'
        assert core5['assigned_to_type'] == 'odc'
        assert core5['assigned_to_id'] == odc_id

    def test_history_records_assigned_action(self, auth_client, test_otb):
        resp = auth_client.post('/api/ftth/odc', json={
            'name': 'ODC-1', 'otb_id': test_otb, 'otb_core_number': 3, 'feed_source': 'otb',
        }, headers=H)
        assert resp.status_code == 200

        cores_resp = auth_client.get(f'/api/ftth/cores/otb/{test_otb}', headers=H)
        core3 = next(c for c in cores_resp.get_json()['cores'] if c['core_number'] == 3)

        hist_resp = auth_client.get(f'/api/ftth/cores/{core3["id"]}/history', headers=H)
        history = hist_resp.get_json()['history']
        assert len(history) == 1
        assert history[0]['action'] == 'assigned'
        assert history[0]['previous_status'] is None
        assert history[0]['new_status'] == 'used'
        assert history[0]['performed_by'] == 'admin'


class TestCoreReleasedOnUnassignOrDelete:
    def test_deleting_odc_releases_otb_core(self, auth_client, test_otb):
        resp = auth_client.post('/api/ftth/odc', json={
            'name': 'ODC-1', 'otb_id': test_otb, 'otb_core_number': 5, 'feed_source': 'otb',
        }, headers=H)
        odc_id = resp.get_json()['item']['id']

        del_resp = auth_client.delete(f'/api/ftth/odc/{odc_id}', headers=H)
        assert del_resp.status_code == 200

        cores_resp = auth_client.get(f'/api/ftth/cores/otb/{test_otb}', headers=H)
        core5 = next(c for c in cores_resp.get_json()['cores'] if c['core_number'] == 5)
        assert core5['status'] == 'available'
        assert core5['assigned_to_type'] is None

    def test_changing_odc_core_number_releases_old_and_claims_new(self, auth_client, test_otb):
        resp = auth_client.post('/api/ftth/odc', json={
            'name': 'ODC-1', 'otb_id': test_otb, 'otb_core_number': 5, 'feed_source': 'otb',
        }, headers=H)
        odc_id = resp.get_json()['item']['id']

        auth_client.put(f'/api/ftth/odc/{odc_id}', json={'otb_core_number': 7}, headers=H)

        cores_resp = auth_client.get(f'/api/ftth/cores/otb/{test_otb}', headers=H)
        cores = {c['core_number']: c for c in cores_resp.get_json()['cores']}
        assert cores[5]['status'] == 'available'
        assert cores[7]['status'] == 'used'
        assert cores[7]['assigned_to_id'] == odc_id


class TestLazyCreateNoDuplicates:
    def test_touching_same_core_twice_does_not_duplicate_row(self, auth_client, test_otb):
        with app.app_context():
            from routes_ftth import _touch_core
            _touch_core('otb', test_otb, 5, 'used', 'odc', 1)
            _touch_core('otb', test_otb, 5, 'used', 'odc', 1)
            db.session.commit()
            count = FTTHFiberCore.query.filter_by(owner_type='otb', owner_id=test_otb, core_number=5).count()
            assert count == 1

    def test_unique_constraint_enforced_at_db_level(self, auth_client, test_otb):
        with app.app_context():
            db.session.add(FTTHFiberCore(owner_type='otb', owner_id=test_otb, core_number=1, status='available'))
            db.session.commit()
            db.session.add(FTTHFiberCore(owner_type='otb', owner_id=test_otb, core_number=1, status='available'))
            with pytest.raises(Exception):
                db.session.commit()
            db.session.rollback()


class TestJcSpliceTouchesBothSides:
    def test_splice_create_touches_jc_core_out_and_parent_core_in(self, auth_client, test_otb):
        jc_resp = auth_client.post('/api/ftth/jc', json={
            'name': 'JC-A', 'parent_type': 'otb', 'parent_id': test_otb, 'total_cores': 12,
        }, headers=H)
        jc_id = jc_resp.get_json()['item']['id']

        splice_resp = auth_client.post(f'/api/ftth/jc/{jc_id}/splice', json={
            'core_in': 5, 'core_out': 3,
        }, headers=H)
        assert splice_resp.status_code == 200
        splice_id = splice_resp.get_json()['splice']['id']

        jc_cores = auth_client.get(f'/api/ftth/cores/jc/{jc_id}', headers=H).get_json()['cores']
        core_out3 = next(c for c in jc_cores if c['core_number'] == 3)
        assert core_out3['status'] == 'used'
        assert core_out3['assigned_to_type'] == 'jc_splice'
        assert core_out3['assigned_to_id'] == splice_id

        otb_cores = auth_client.get(f'/api/ftth/cores/otb/{test_otb}', headers=H).get_json()['cores']
        core_in5 = next(c for c in otb_cores if c['core_number'] == 5)
        assert core_in5['status'] == 'used'
        assert core_in5['assigned_to_type'] == 'jc'
        assert core_in5['assigned_to_id'] == jc_id

    def test_splice_delete_releases_both_sides(self, auth_client, test_otb):
        jc_resp = auth_client.post('/api/ftth/jc', json={
            'name': 'JC-A', 'parent_type': 'otb', 'parent_id': test_otb, 'total_cores': 12,
        }, headers=H)
        jc_id = jc_resp.get_json()['item']['id']
        splice_resp = auth_client.post(f'/api/ftth/jc/{jc_id}/splice', json={
            'core_in': 5, 'core_out': 3,
        }, headers=H)
        splice_id = splice_resp.get_json()['splice']['id']

        del_resp = auth_client.delete(f'/api/ftth/jc/{jc_id}/splice/{splice_id}', headers=H)
        assert del_resp.status_code == 200

        jc_cores = auth_client.get(f'/api/ftth/cores/jc/{jc_id}', headers=H).get_json()['cores']
        assert next(c for c in jc_cores if c['core_number'] == 3)['status'] == 'available'
        otb_cores = auth_client.get(f'/api/ftth/cores/otb/{test_otb}', headers=H).get_json()['cores']
        assert next(c for c in otb_cores if c['core_number'] == 5)['status'] == 'available'


class TestCoresEndpointValidation:
    def test_invalid_owner_type_rejected(self, auth_client, test_otb):
        resp = auth_client.get('/api/ftth/cores/onu/1', headers=H)
        assert resp.status_code == 400

    def test_history_not_found(self, auth_client):
        resp = auth_client.get('/api/ftth/cores/99999/history', headers=H)
        assert resp.status_code == 404
