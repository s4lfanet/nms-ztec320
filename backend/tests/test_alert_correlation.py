"""Fase 2 — Alert root-cause correlation: ODP outage, deep-link, friendly labels."""
import json
import pytest
from datetime import datetime, timezone
from app import app, db
from models import OLT, ONU, AlertHistory, Notification, FTTHODP, FTTHODPPort, SystemConfig


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
        from models import User, Role, AlertRule
        if not User.query.filter_by(username='admin').first():
            role = Role(name='Full Access', description='Full admin access',
                        permissions='all_olt', is_system=True)
            db.session.add(role); db.session.flush()
            admin = User(username='admin', full_name='Administrator',
                         is_super_admin=True, role_id=role.id)
            admin.set_password('admin123')
            db.session.add(admin)
        if not AlertRule.query.first():
            db.session.add(AlertRule(name='Default', enabled=True,
                                     check_offline=True, check_olt_offline=True))
        db.session.commit()
    with app.test_client() as client:
        yield client
    with app.app_context():
        db.drop_all()
        if _orig is not None: db.engines[None] = _orig
        else: db.engines.pop(None, None)
    _test_engine.dispose()
    try: os.unlink(_tmpdb.name)
    except OSError: pass


class TestOdpOutageCorrelation:
    def test_odp_outage_fires_when_threshold_met(self, client):
        """≥3 ONUs down in same ODP → one odp_outage alert + individual alerts suppressed."""
        from alerts import _check_odp_outages
        with app.app_context():
            olt = OLT(name='T', ip_address='10.0.0.1', vendor='zte', is_online=True,
                      monitoring_enabled=True)
            db.session.add(olt); db.session.flush()
            odp = FTTHODP(name='ODP-TEST', latitude=-6.2, longitude=106.8)
            db.session.add(odp); db.session.flush()
            # 3 ONUs down, linked to ODP ports
            for i in range(3):
                onu = ONU(olt_id=olt.id, name=f'c{i}', serial_number=f'ZTEG{i:08d}',
                          status='los', frame=1, slot=1, port=1, onu_id=i+1)
                db.session.add(onu); db.session.flush()
                db.session.add(FTTHODPPort(odp_id=odp.id, port_number=i+1,
                                           onu_id=onu.id, status='used'))
            # 1 ONU down in different ODP — should NOT trigger
            odp2 = FTTHODP(name='ODP-OTHER', latitude=-6.3, longitude=106.9)
            db.session.add(odp2); db.session.flush()
            onu2 = ONU(olt_id=olt.id, name='other', serial_number='ZTEG99999999',
                       status='los', frame=1, slot=1, port=2, onu_id=99)
            db.session.add(onu2); db.session.flush()
            db.session.add(FTTHODPPort(odp_id=odp2.id, port_number=1,
                                       onu_id=onu2.id, status='used'))
            db.session.commit()
            oid = olt.id

            notifs, alerts = [], []
            _check_odp_outages([olt], datetime.now(timezone.utc), notifs, alerts)
            # Should fire 1 ODP outage alert for ODP-TEST (3 down ≥ threshold)
            odp_alerts = [a for a in alerts if a['type'] == 'odp_outage']
            assert len(odp_alerts) == 1
            assert 'ODP-TEST' in odp_alerts[0]['title']
            assert odp_alerts[0]['target_type'] == 'odp'
            # ODP-OTHER has only 1 down — no alert
            assert not any('ODP-OTHER' in a['title'] for a in alerts)

    def test_below_threshold_no_alert(self, client):
        """2 ONUs down in same ODP (below default threshold 3) → no ODP alert."""
        from alerts import _check_odp_outages
        with app.app_context():
            olt = OLT(name='T2', ip_address='10.0.0.2', vendor='zte', is_online=True)
            db.session.add(olt); db.session.flush()
            odp = FTTHODP(name='ODP-2', latitude=-6.2, longitude=106.8)
            db.session.add(odp); db.session.flush()
            for i in range(2):
                onu = ONU(olt_id=olt.id, name=f'x{i}', serial_number=f'ZTEG{i:07d}',
                          status='offline', frame=1, slot=1, port=1, onu_id=i+1)
                db.session.add(onu); db.session.flush()
                db.session.add(FTTHODPPort(odp_id=odp.id, port_number=i+1,
                                           onu_id=onu.id, status='used'))
            db.session.commit()
            notifs, alerts = [], []
            _check_odp_outages([olt], datetime.now(timezone.utc), notifs, alerts)
            assert not any(a['type'] == 'odp_outage' for a in alerts)


class TestFriendlyLabel:
    def test_friendly_down_reason(self, client):
        from alerts import _friendly_down_reason
        assert 'LOS' in _friendly_down_reason('los')
        assert 'Dying Gasp' in _friendly_down_reason('dyinggasp')
        assert 'Offline' in _friendly_down_reason('offline')
        assert _friendly_down_reason('unknown') == 'unknown'


class TestDeepLink:
    def test_deep_link_url(self, client):
        from alerts import _deep_link_url
        with app.app_context():
            # Set a base_url so we get a predictable link
            cfg = SystemConfig.query.filter_by(key='base_url').first()
            if not cfg:
                cfg = SystemConfig(key='base_url', value='https://nms.test')
                db.session.add(cfg)
            else:
                cfg.value = 'https://nms.test'
            db.session.commit()
            url = _deep_link_url('onu', 42)
            assert 'nms.test' in url
            assert 'onu/42' in url
            url2 = _deep_link_url('odp', 7)
            assert 'odp=7' in url2
            assert _deep_link_url('', 1) == ''
            assert _deep_link_url('onu', None) == ''
