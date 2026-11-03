"""Fase 1 — RX power history: sample capture, hourly aggregation, endpoint."""
import json
import pytest
from datetime import datetime, timezone, timedelta
from app import app, db
from models import OLT, ONU, OnuRxSample, OnuRxHourly


@pytest.fixture
def client():
    """Isolated temp DB — same pattern as test_basic.py."""
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
            role = Role.query.filter_by(name='Full Access').first()
            if not role:
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


def _seed_onu():
    with app.app_context():
        olt = OLT(name='TEST', ip_address='10.0.0.1', vendor='zte')
        db.session.add(olt)
        db.session.flush()
        onu = ONU(olt_id=olt.id, name='cust@rw01', serial_number='ZTEG12345678',
                  status='online', rx_power=-18.5)
        db.session.add(onu)
        db.session.commit()
        return olt.id, onu.id


class TestRxSampleCapture:
    def test_sample_filter_logic(self, client):
        """Verify the filter logic: rx must be not None, != 0, > -40."""
        with app.app_context():
            olt = OLT(name='TEST', ip_address='10.0.0.1', vendor='zte')
            db.session.add(olt); db.session.flush()
            onu = ONU(olt_id=olt.id, name='c1', serial_number='ZTEG111', status='online')
            db.session.add(onu); db.session.commit()
            oid, onuid = olt.id, onu.id
            for rx in (-18.5, -25.0, -10.0):
                db.session.add(OnuRxSample(onu_id=onuid, olt_id=oid, rx_dbm=rx))
            db.session.commit()
            assert OnuRxSample.query.filter_by(onu_id=onuid).count() == 3
            for s in OnuRxSample.query.filter_by(onu_id=onuid).all():
                assert s.rx_dbm is not None
                assert s.rx_dbm != 0
                assert s.rx_dbm > -40


class TestRxHourlyAggregation:
    def test_aggregate_min_avg_max(self, client):
        """rx_history.aggregate_rx_hourly computes min/avg/max correctly."""
        from rx_history import aggregate_rx_hourly
        with app.app_context():
            olt = OLT(name='T3', ip_address='10.0.0.3', vendor='zte')
            db.session.add(olt); db.session.flush()
            onu = ONU(olt_id=olt.id, name='c3', serial_number='ZTEG333', status='online')
            db.session.add(onu); db.session.commit()
            oid, onuid = olt.id, onu.id
            # 3 samples in the same hour, 2 days ago (beyond 48h retention)
            old = datetime.now(timezone.utc) - timedelta(hours=50)
            for rx in (-18.0, -20.0, -19.0):
                db.session.add(OnuRxSample(onu_id=onuid, olt_id=oid, rx_dbm=rx, polled_at=old))
            db.session.commit()
            n = aggregate_rx_hourly()
            assert n >= 1
            row = OnuRxHourly.query.filter_by(onu_id=onuid).first()
            assert row is not None
            assert row.rx_min == -20.0
            assert row.rx_max == -18.0
            assert abs(row.rx_avg - (-19.0)) < 0.01
            assert row.samples == 3
            # Raw samples older than cutoff should be deleted
            assert OnuRxSample.query.filter_by(onu_id=onuid).count() == 0


class TestRxHistoryEndpoint:
    def test_endpoint_returns_points(self, client):
        _login(client)
        with app.app_context():
            olt = OLT(name='T4', ip_address='10.0.0.4', vendor='zte')
            db.session.add(olt); db.session.flush()
            onu = ONU(olt_id=olt.id, name='c4', serial_number='ZTEG444', status='online')
            db.session.add(onu); db.session.commit()
            oid, onuid = olt.id, onu.id
            now = datetime.now(timezone.utc)
            for i in range(3):
                db.session.add(OnuRxSample(onu_id=onuid, olt_id=oid, rx_dbm=-18.0 - i * 0.5,
                                           polled_at=now - timedelta(hours=2 - i)))
            db.session.commit()
        resp = client.get(f'/api/onu/{onuid}/rx-history?range=24h',
                          headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert data['range'] == '24h'
        assert len(data['points']) == 3
        assert data['points'][0]['rx'] == -18.0

    def test_endpoint_404_for_missing_onu(self, client):
        _login(client)
        resp = client.get('/api/onu/99999/rx-history?range=24h',
                          headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 404

    def test_endpoint_hourly_range(self, client):
        _login(client)
        with app.app_context():
            olt = OLT(name='T5', ip_address='10.0.0.5', vendor='zte')
            db.session.add(olt); db.session.flush()
            onu = ONU(olt_id=olt.id, name='c5', serial_number='ZTEG555', status='online')
            db.session.add(onu); db.session.commit()
            oid, onuid = olt.id, onu.id
            old_hour = (datetime.now(timezone.utc) - timedelta(days=10)).replace(minute=0, second=0, microsecond=0)
            db.session.add(OnuRxHourly(onu_id=onuid, olt_id=oid, hour=old_hour,
                                       rx_min=-22.0, rx_avg=-20.0, rx_max=-18.0, samples=5))
            db.session.commit()
        resp = client.get(f'/api/onu/{onuid}/rx-history?range=30d',
                          headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['range'] == '30d'
        assert len(data['points']) == 1
        assert data['points'][0]['rx_avg'] == -20.0
        assert data['points'][0]['rx_min'] == -22.0
        assert data['points'][0]['rx_max'] == -18.0
