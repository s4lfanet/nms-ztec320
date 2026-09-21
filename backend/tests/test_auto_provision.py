"""Tests for the ZTP auto-provisioning background pass (auto_provision.py).

Ported feature: this logic used to live only as an uncommitted script on a
production backup (backup-nms-2026-09-03), auto-registering unconfigured
GPON/EPON ONUs found on the OLT. Re-implemented here against the current
models/helpers (register_unified, ONUType.pon_type, _sanitize_provisioning_input)
rather than copied verbatim — these tests cover the EPON vs GPON branch,
the enable/allow-list gates, and duplicate-serial skip.

Run with: py -3 -m pytest tests/test_auto_provision.py -v
"""
import os
import sys
import pytest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import User, Role, OLT, ONU, ONUType, SystemConfig
from auto_provision import _run_ztp_pass

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


def _make_olt(**kwargs):
    with app.app_context():
        olt = OLT(name='ZTP-OLT', ip_address='192.168.1.1', telnet_enabled=True,
                  cli_username='admin', cli_password='admin', vendor='ZTE', model='C320', **kwargs)
        db.session.add(olt)
        db.session.commit()
        return olt.id


def _set_ztp_config(olt_id, enabled=True, vlan_mode='tag'):
    with app.app_context():
        for key, value in {
            'ztp_enabled': 'true' if enabled else 'false',
            'ztp_vlan': '150', 'ztp_vlan_mode': vlan_mode,
            'ztp_profile': 'UP-1G', 'ztp_traffic_profile': 'DOWN-1G', 'ztp_epon_sla': 'UP-1G',
            'ztp_allowed_olts': str(olt_id),
        }.items():
            db.session.add(SystemConfig(key=key, value=value))
        db.session.commit()


class TestZtpGates:
    def test_disabled_does_nothing(self, client):
        olt_id = _make_olt()
        _set_ztp_config(olt_id, enabled=False)
        with patch('snmp_collector.create_cli_collector') as mock_create:
            with app.app_context():
                _run_ztp_pass(app)
            mock_create.assert_not_called()

    def test_no_allowed_olts_does_nothing(self, client):
        _make_olt()
        with app.app_context():
            db.session.add(SystemConfig(key='ztp_enabled', value='true'))
            db.session.commit()
        with patch('snmp_collector.create_cli_collector') as mock_create:
            with app.app_context():
                _run_ztp_pass(app)
            mock_create.assert_not_called()


class TestZtpRegistersUnconfiguredOnus:
    def test_epon_onu_registered_with_all_epon_type(self, client):
        olt_id = _make_olt()
        _set_ztp_config(olt_id)
        with patch('snmp_collector.create_cli_collector') as mock_create:
            mock_tc = MagicMock()
            mock_tc.collect_unregistered_onus.return_value = [
                {'pon_port': '1/2/1', 'sn': 'ZTEGDD9BD0FD', 'is_epon': True, 'model': ''},
            ]
            mock_tc.get_next_available_onu_id.return_value = 5
            mock_tc.register_unified.return_value = (True, 'OK')
            mock_create.return_value = mock_tc

            with app.app_context():
                _run_ztp_pass(app)

            call = mock_tc.register_unified.call_args
            assert call.kwargs['onu_type'] == 'ALL-EPON'
            assert call.kwargs['is_epon'] is True
            assert call.kwargs['frame'] == 1 and call.kwargs['slot'] == 2 and call.kwargs['port'] == 1
            assert call.kwargs['onu_id'] == 5

        with app.app_context():
            onu = ONU.query.filter_by(serial_number='ZTEGDD9BD0FD').first()
            assert onu is not None
            assert onu.card == 'epon'
            assert onu.onu_type == 'ALL-EPON'

    def test_gpon_onu_matched_against_registered_types(self, client):
        olt_id = _make_olt()
        _set_ztp_config(olt_id)
        with app.app_context():
            db.session.add(ONUType(olt_id=olt_id, type_name='F670L', pon_type='gpon'))
            db.session.commit()
        with patch('snmp_collector.create_cli_collector') as mock_create:
            mock_tc = MagicMock()
            mock_tc.collect_unregistered_onus.return_value = [
                {'pon_port': '1/1/3', 'sn': 'ZTEGC40DF35B', 'is_epon': False, 'model': 'F670LV9.0'},
            ]
            mock_tc.get_next_available_onu_id.return_value = 2
            mock_tc.register_unified.return_value = (True, 'OK')
            mock_create.return_value = mock_tc

            with app.app_context():
                _run_ztp_pass(app)

            call = mock_tc.register_unified.call_args
            assert call.kwargs['onu_type'] == 'F670L'
            assert call.kwargs['is_epon'] is False

        with app.app_context():
            onu = ONU.query.filter_by(serial_number='ZTEGC40DF35B').first()
            assert onu is not None
            assert onu.card == ''

    def test_gpon_onu_falls_back_to_all_when_no_types_registered(self, client):
        olt_id = _make_olt()
        _set_ztp_config(olt_id)
        with patch('snmp_collector.create_cli_collector') as mock_create:
            mock_tc = MagicMock()
            mock_tc.collect_unregistered_onus.return_value = [
                {'pon_port': '1/1/3', 'sn': 'HWTCB9BC02AE', 'is_epon': False, 'model': 'Unknown'},
            ]
            mock_tc.get_next_available_onu_id.return_value = 1
            mock_tc.register_unified.return_value = (True, 'OK')
            mock_create.return_value = mock_tc

            with app.app_context():
                _run_ztp_pass(app)

            assert mock_tc.register_unified.call_args.kwargs['onu_type'] == 'All'

    def test_services_payload_carries_vlan_mode(self, client):
        olt_id = _make_olt()
        _set_ztp_config(olt_id, vlan_mode='untag')
        with patch('snmp_collector.create_cli_collector') as mock_create:
            mock_tc = MagicMock()
            mock_tc.collect_unregistered_onus.return_value = [
                {'pon_port': '1/1/3', 'sn': 'ZTEGC40DF35B', 'is_epon': False, 'model': ''},
            ]
            mock_tc.get_next_available_onu_id.return_value = 1
            mock_tc.register_unified.return_value = (True, 'OK')
            mock_create.return_value = mock_tc

            with app.app_context():
                _run_ztp_pass(app)

            services = mock_tc.register_unified.call_args.kwargs['services']
            assert services[0]['vlan_mode'] == 'untag'
            assert services[0]['vlan'] == 150


class TestZtpSkipsAlreadyKnownOnus:
    def test_skips_serial_already_in_db(self, client):
        olt_id = _make_olt()
        _set_ztp_config(olt_id)
        with app.app_context():
            db.session.add(ONU(olt_id=olt_id, frame=1, slot=1, port=1, onu_id=9, serial_number='ZTEGEXIST01'))
            db.session.commit()
        with patch('snmp_collector.create_cli_collector') as mock_create:
            mock_tc = MagicMock()
            mock_tc.collect_unregistered_onus.return_value = [
                {'pon_port': '1/1/3', 'sn': 'ZTEGEXIST01', 'is_epon': False, 'model': ''},
            ]
            mock_create.return_value = mock_tc

            with app.app_context():
                _run_ztp_pass(app)

            mock_tc.register_unified.assert_not_called()

    def test_registration_failure_is_not_saved_to_db(self, client):
        olt_id = _make_olt()
        _set_ztp_config(olt_id)
        with patch('snmp_collector.create_cli_collector') as mock_create:
            mock_tc = MagicMock()
            mock_tc.collect_unregistered_onus.return_value = [
                {'pon_port': '1/1/3', 'sn': 'ZTEGFAIL001', 'is_epon': False, 'model': ''},
            ]
            mock_tc.get_next_available_onu_id.return_value = 1
            mock_tc.register_unified.return_value = (False, 'CLI error: no free tcont')
            mock_create.return_value = mock_tc

            with app.app_context():
                _run_ztp_pass(app)

        with app.app_context():
            assert ONU.query.filter_by(serial_number='ZTEGFAIL001').first() is None
