"""Automated tests for ONU provisioning functionality.

Tests cover:
- API endpoint availability (no ModuleNotFoundError for ont_provisioner)
- Provisioning template validation (all 7 vendor templates)
- SNMP registration method signature and read-back verification
- Telnet registration method signatures
- Secret masking in logs (WiFi passwords, PPPoE credentials)
- DB save after provisioning

Run with: py -3 -m pytest tests/test_provisioning.py -v
"""
import os
import sys
import json
import pytest
from unittest.mock import patch, MagicMock

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import User, Role, OLT, ONU, Template

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
    """Client that is logged in as admin."""
    client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin123'})
    return client


@pytest.fixture
def test_olt(auth_client):
    """Create a test OLT in the DB. Uses auth_client for login + DB setup."""
    with app.app_context():
        olt = OLT(
            name='Test-OLT',
            ip_address='192.168.1.1',
            snmp_enabled=True,
            snmp_community='public',
            telnet_enabled=True,
            cli_username='admin',
            cli_password='admin',
            vendor='ZTE',
            model='C320',
        )
        db.session.add(olt)
        db.session.commit()
        return olt.id


# ==================== G1-G3/G8: Dead Endpoint Removal Tests ====================

class TestDeadEndpointRemoval:
    """Verify that ont_provisioner endpoints are removed (G1-G3/G8)."""

    def test_provision_vendors_endpoint_removed(self, auth_client):
        """GET /api/provision/vendors should return 404, not 500 (ModuleNotFoundError)."""
        resp = auth_client.get('/api/provision/vendors')
        assert resp.status_code == 404

    def test_provision_ont_endpoint_removed(self, auth_client, test_olt):
        """POST /api/provision/ont should not return 200 — endpoint removed."""
        resp = auth_client.post('/api/provision/ont', json={
            'olt_id': test_olt, 'serial_number': 'ZTEGC40DF35B',
            'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 1,
        }, headers={'X-Requested-With': 'XMLHttpRequest'})
        # Endpoint removed — Flask returns 404/405, error handler may convert to 500
        assert resp.status_code != 200
        assert resp.status_code in (404, 405, 500)

    def test_provision_status_endpoint_removed(self, auth_client, test_olt):
        """GET /api/provision/status/... should return 404, not 500."""
        resp = auth_client.get(f'/api/provision/status/{test_olt}/1/1/1/1')
        assert resp.status_code == 404


# ==================== Template Matrix Tests ====================

class TestTemplateMatrix:
    """Verify all 7 vendor templates are supported in register_vendor_template."""

    @pytest.mark.parametrize('template', [
        'bridge', 'pppoe', 'fiberhome_veip',
        'zte_full', 'zte_single', 'huawei_full', 'zte_multi',
    ])
    def test_template_accepted_by_pre_register(self, template, auth_client, test_olt):
        """POST /api/pre-register should accept all 7 template types without 500."""
        with patch('snmp_collector.create_cli_collector') as mock_create:
            mock_tc = MagicMock()
            mock_tc.register_vendor_template.return_value = (True, f'OK ({template})')
            mock_tc.register_and_configure.return_value = (True, 'OK')
            mock_tc.register_onu.return_value = (True, 'OK')
            mock_tc.configure_onu_profile.return_value = (True, 'OK')
            mock_create.return_value = mock_tc

            resp = auth_client.post('/api/pre-register', json={
                'olt_id': test_olt,
                'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 1,
                'serial': 'ZTEGC40DF35B',
                'onu_type': 'ZTE-F609',
                'template': template,
                'vlan': 100,
                'tcont_profile': '1G',
                'register_mode': 'telnet',
            }, headers={'X-Requested-With': 'XMLHttpRequest'})
        data = resp.get_json()
        assert resp.status_code == 200
        assert data['success'] is True


# ==================== SNMP Registration Tests ====================

class TestSNMPRegistration:
    """Test SNMP registration method and read-back verification (G7)."""

    def test_register_onu_snmp_method_exists(self):
        """SNMPCollector should have register_onu_snmp method."""
        from snmp_core import SNMPCollector
        assert hasattr(SNMPCollector, 'register_onu_snmp')

    def test_deregister_onu_snmp_method_exists(self):
        """SNMPCollector should have deregister_onu_snmp method."""
        from snmp_core import SNMPCollector
        assert hasattr(SNMPCollector, 'deregister_onu_snmp')

    def test_scan_unconfigured_snmp_method_exists(self):
        """SNMPCollector should have scan_unconfigured_snmp method."""
        from snmp_core import SNMPCollector
        assert hasattr(SNMPCollector, 'scan_unconfigured_snmp')

    def test_snmp_read_back_verification_called(self):
        """register_onu_snmp should attempt read-back via batch_get."""
        from snmp_core import SNMPCollector, encode_pon_index, OID_REG_ENTRY_STATUS
        collector = SNMPCollector('192.168.1.1', 'public')
        pon_index = encode_pon_index(1, 1)
        suffix = f'.{pon_index}.1'
        read_back_oid = f'{OID_REG_ENTRY_STATUS}{suffix}'
        with patch.object(collector, 'snmp_set', return_value=(True, '')), \
             patch.object(collector, 'batch_get', return_value={
                 read_back_oid: 1
             }) as mock_get:
            ok, msg = collector.register_onu_snmp(
                1, 1, 1, 1, 'ZTEGC40DF35B',
                onu_type='ZTE-F609', name='Test', description='Desc',
            )
            assert ok is True
            assert 'state=active' in msg
            mock_get.assert_called_once()

    def test_snmp_read_back_not_found(self):
        """register_onu_snmp should still return True if read-back returns empty."""
        from snmp_core import SNMPCollector
        collector = SNMPCollector('192.168.1.1', 'public')
        with patch.object(collector, 'snmp_set', return_value=(True, '')), \
             patch.object(collector, 'batch_get', return_value={}) as mock_get:
            ok, msg = collector.register_onu_snmp(
                1, 1, 1, 1, 'ZTEGC40DF35B',
                onu_type='ZTE-F609',
            )
            assert ok is True
            assert 'registered via SNMP' in msg
            mock_get.assert_called_once()


# ==================== Telnet Registration Tests ====================

class TestTelnetRegistration:
    """Test Telnet registration methods and read-back verification (G7)."""

    def test_register_unified_method_exists(self):
        """TelnetCollector should have register_unified method."""
        from telnet_client import TelnetCollector
        assert hasattr(TelnetCollector, 'register_unified')

    def test_register_vendor_template_method_exists(self):
        """TelnetCollector should have register_vendor_template method."""
        from telnet_client import TelnetCollector
        assert hasattr(TelnetCollector, 'register_vendor_template')

    def test_register_and_configure_method_exists(self):
        """TelnetCollector should have register_and_configure method."""
        from telnet_client import TelnetCollector
        assert hasattr(TelnetCollector, 'register_and_configure')

    def test_verify_onu_registered_method_exists(self):
        """TelnetCollector should have _verify_onu_registered helper (G7)."""
        from telnet_client import TelnetCollector
        assert hasattr(TelnetCollector, '_verify_onu_registered')

    def test_verify_onu_registered_parses_state(self):
        """_verify_onu_registered should parse ONU state from CLI output."""
        from telnet_client import TelnetCollector
        tc = TelnetCollector('192.168.1.1', 'admin', 'admin')
        mock_tn = MagicMock()
        mock_tn.read_until.return_value = b''
        with patch.object(tc, '_connect', return_value=mock_tn), \
             patch.object(tc, '_send_command', side_effect=[
                 '',  # enable
                 'OnuID  Status   SN              Type\n'
                 '1      ready    ZTEGC40DF35B    ZTE-F609\n'
                 '2      offline  ZTEGTEST5678    ZTE-F609\n',  # show gpon onu state
             ]):
            mock_tn.close = MagicMock()
            result = tc._verify_onu_registered(1, 1, 1, 1)
            assert result == 'ready'

    def test_verify_onu_registered_not_found(self):
        """_verify_onu_registered should return None if ONU ID not in output."""
        from telnet_client import TelnetCollector
        tc = TelnetCollector('192.168.1.1', 'admin', 'admin')
        mock_tn = MagicMock()
        with patch.object(tc, '_connect', return_value=mock_tn), \
             patch.object(tc, '_send_command', side_effect=[
                 '',
                 'OnuID  Status   SN\n'
                 '1      ready    ZTEGC40DF35B\n',
             ]):
            mock_tn.close = MagicMock()
            result = tc._verify_onu_registered(1, 1, 1, 5)
            assert result is None


# ==================== Secret Masking Tests ====================

class TestSecretMasking:
    """Verify that secrets are masked in logs (G6 — already implemented)."""

    def test_wifi_password_masked_in_provision_unified(self, auth_client, test_olt):
        """WiFi passwords should be masked with *** in log output."""
        with patch('snmp_collector.create_cli_collector') as mock_create:
            mock_tc = MagicMock()
            mock_tc.register_unified.return_value = (True, 'OK')
            mock_create.return_value = mock_tc

            import logging
            from extensions import logger as app_logger
            log_messages = []
            class CaptureHandler(logging.Handler):
                def emit(self, record):
                    log_messages.append(record.getMessage())
            handler = CaptureHandler()
            handler.setLevel(logging.INFO)
            app_logger.addHandler(handler)

            try:
                resp = auth_client.post('/api/provision/unified', json={
                    'olt_id': test_olt,
                    'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 1,
                    'serial': 'ZTEGC40DF35B',
                    'onu_type': 'ZTE-F609',
                    'tcont_profile': '1G',
                    'services': [{'service_type': 'internet', 'vlan': 100}],
                    'register_mode': 'telnet',
                    'wifi_config': {
                        'ssids': [
                            {'name': 'MyWiFi', 'pass': 'secretpass123', 'auth': 'wpa2', 'port': 'wifi_0/1'}
                        ]
                    },
                }, headers={'X-Requested-With': 'XMLHttpRequest'})
            finally:
                app_logger.removeHandler(handler)

            data = resp.get_json()
            assert resp.status_code == 200
            # Check that no log message contains the actual password
            for msg in log_messages:
                assert 'secretpass123' not in msg, f"Password leaked in log: {msg}"

    def test_pppoe_credentials_not_in_response(self, auth_client, test_olt):
        """PPPoE credentials should not appear in API response messages."""
        with patch('snmp_collector.create_cli_collector') as mock_create:
            mock_tc = MagicMock()
            mock_tc.register_unified.return_value = (True, 'OK')
            mock_create.return_value = mock_tc

            resp = auth_client.post('/api/provision/unified', json={
                'olt_id': test_olt,
                'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 1,
                'serial': 'ZTEGC40DF35B',
                'onu_type': 'ZTE-F609',
                'tcont_profile': '1G',
                'services': [{
                    'service_type': 'internet', 'vlan': 100,
                    'wan_mode': 'nat', 'username': 'user@test', 'password': 'pppoesecret',
                }],
                'register_mode': 'telnet',
            }, headers={'X-Requested-With': 'XMLHttpRequest'})
            data = resp.get_json()
            assert resp.status_code == 200
            assert 'pppoesecret' not in json.dumps(data)


# ==================== DB Save Tests ====================

class TestDBSave:
    """Verify ONU is saved to DB after provisioning."""

    def test_snmp_provision_saves_to_db(self, auth_client, test_olt):
        """SNMP provision_unified should save ONU to DB."""
        with patch('snmp_collector.create_snmp_collector') as mock_snmp, \
             patch('snmp_collector.get_write_community', return_value='private'), \
             patch('snmp_collector.create_cli_collector') as mock_cli:

            mock_collector = MagicMock()
            mock_collector.register_onu_snmp.return_value = (True, 'OK')
            mock_collector.close = MagicMock()
            mock_snmp.return_value = mock_collector

            mock_tc = MagicMock()
            mock_tc.register_unified.return_value = (True, 'OK')
            mock_cli.return_value = mock_tc

            with patch('routes_onu._auto_sync_olt'), patch('routes_onu._auto_write_config'):
                resp = auth_client.post('/api/provision/unified', json={
                    'olt_id': test_olt,
                    'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 1,
                    'serial': 'ZTEGC40DF35B',
                    'onu_type': 'ZTE-F609',
                    'tcont_profile': '1G',
                    'services': [{'service_type': 'internet', 'vlan': 100}],
                    'register_mode': 'snmp',
                }, headers={'X-Requested-With': 'XMLHttpRequest'})

            data = resp.get_json()
            assert resp.status_code == 200
            assert data['success'] is True

            with app.app_context():
                onu = ONU.query.filter_by(
                    olt_id=test_olt, frame=1, slot=1, port=1, onu_id=1
                ).first()
                assert onu is not None
                assert onu.serial_number == 'ZTEGC40DF35B'


# ==================== SNMP+Telnet Fallback Tests (G4/G5) ====================

class TestSNMPTelnetFallback:
    """Verify SNMP registration auto-falls back to Telnet for service config (G4/G5)."""

    def test_snmp_provision_falls_back_to_telnet(self, auth_client, test_olt):
        """SNMP provision_unified should call Telnet register_unified after SNMP reg."""
        with patch('snmp_collector.create_snmp_collector') as mock_snmp, \
             patch('snmp_collector.get_write_community', return_value='private'), \
             patch('snmp_collector.create_cli_collector') as mock_cli:

            mock_collector = MagicMock()
            mock_collector.register_onu_snmp.return_value = (True, 'SNMP OK')
            mock_collector.close = MagicMock()
            mock_snmp.return_value = mock_collector

            mock_tc = MagicMock()
            mock_tc.register_unified.return_value = (True, 'Telnet OK')
            mock_cli.return_value = mock_tc

            with patch('routes_onu._auto_sync_olt'), patch('routes_onu._auto_write_config'):
                resp = auth_client.post('/api/provision/unified', json={
                    'olt_id': test_olt,
                    'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 1,
                    'serial': 'ZTEGC40DF35B',
                    'onu_type': 'ZTE-F609',
                    'tcont_profile': '1G',
                    'services': [{'service_type': 'internet', 'vlan': 100}],
                    'register_mode': 'snmp',
                }, headers={'X-Requested-With': 'XMLHttpRequest'})

            data = resp.get_json()
            assert resp.status_code == 200
            assert data['success'] is True
            assert 'SNMP' in data['message']
            assert 'Telnet' in data['message']
            mock_collector.register_onu_snmp.assert_called_once()
            mock_tc.register_unified.assert_called_once()

    def test_snmp_pre_register_falls_back_to_telnet(self, auth_client, test_olt):
        """SNMP pre_register should call CLI configure_onu_profile after SNMP reg."""
        with patch('snmp_collector.create_snmp_collector') as mock_snmp, \
             patch('snmp_collector.get_write_community', return_value='private'), \
             patch('snmp_collector.create_cli_collector') as mock_cli:

            mock_collector = MagicMock()
            mock_collector.register_onu_snmp.return_value = (True, 'SNMP OK')
            mock_collector.close = MagicMock()
            mock_snmp.return_value = mock_collector

            mock_tc = MagicMock()
            mock_tc.configure_onu_profile.return_value = (True, 'CLI config OK')
            mock_cli.return_value = mock_tc

            with patch('routes_onu._auto_write_config'):
                resp = auth_client.post('/api/pre-register', json={
                    'olt_id': test_olt,
                    'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 1,
                    'serial': 'ZTEGC40DF35B',
                    'onu_type': 'ZTE-F609',
                    'template': 'zte_full',
                    'vlan': 100,
                    'tcont_profile': 'default',
                    'register_mode': 'snmp',
                }, headers={'X-Requested-With': 'XMLHttpRequest'})

            data = resp.get_json()
            assert resp.status_code == 200
            assert data['success'] is True
            assert 'SNMP' in data['message']
            mock_tc.configure_onu_profile.assert_called_once()


# ==================== CLI Injection Prevention ====================

class TestCLIInjectionPrevention:
    """SimpleTelnet.write()/SimpleSSH.write() must strip embedded CR/LF/control
    bytes so a value concatenated into a command string upstream (e.g. an ONU
    name or description field from the API) cannot inject additional CLI
    commands into an already-privileged OLT session."""

    def test_telnet_write_strips_embedded_newline(self):
        from telnet_client import SimpleTelnet

        tn = SimpleTelnet('127.0.0.1')
        tn.sock = MagicMock()
        tn.write('name evil\nusername backdoor password x123 level 15\n')

        sent = tn.sock.sendall.call_args[0][0]
        # Exactly one line terminator (the trailing one write() manages itself) —
        # the injected text can no longer start its own CLI command line.
        assert sent.count(b'\n') == 1, f"expected exactly one line terminator, got: {sent!r}"
        assert b'\nusername backdoor' not in sent
        assert sent == b'name evilusername backdoor password x123 level 15\r\n'

    def test_telnet_write_strips_bare_carriage_return(self):
        from telnet_client import SimpleTelnet

        tn = SimpleTelnet('127.0.0.1')
        tn.sock = MagicMock()
        tn.write('description foo\rexit\r')

        sent = tn.sock.sendall.call_args[0][0]
        assert b'\r' not in sent[:-2]  # only the trailing \r\n terminator may remain

    def test_ssh_write_strips_embedded_newline(self):
        from telnet_client import SimpleSSH

        ssh = SimpleSSH('127.0.0.1')
        ssh.shell = MagicMock()
        ssh.write('name evil\nusername backdoor password x123 level 15\n')

        sent = ssh.shell.send.call_args[0][0]
        assert sent.count(b'\n') == 1
        assert b'\nusername backdoor' not in sent

    def test_telnet_write_normal_command_unaffected(self):
        """A well-formed single-line command must pass through unchanged."""
        from telnet_client import SimpleTelnet

        tn = SimpleTelnet('127.0.0.1')
        tn.sock = MagicMock()
        tn.write('interface gpon-onu_1/1/1:1\n')

        sent = tn.sock.sendall.call_args[0][0]
        assert sent == b'interface gpon-onu_1/1/1:1\r\n'


class TestOrphanCleanupOnDelete:
    """Deleting an OLT/user must not leave orphaned rows in related tables
    (regression test for the missing cleanup entries found in audit)."""

    def test_delete_olt_cleans_up_config_backup_and_metric_history(self, auth_client, test_olt):
        from models import OLTConfigBackup, MetricHistory, TrafficLogHourly, MaintenanceWindow
        from datetime import datetime, timezone

        with app.app_context():
            db.session.add(OLTConfigBackup(
                olt_id=test_olt, config_text='interface x', config_size=12,
                backup_type='manual', status='success',
            ))
            db.session.add(MetricHistory(
                olt_id=test_olt, metric_type='olt_cpu', value=42.0,
                recorded_at=datetime.now(timezone.utc),
            ))
            db.session.add(TrafficLogHourly(
                olt_id=test_olt, port_type='uplink', port_name='xgei_1/1/1',
                hour_start=datetime.now(timezone.utc),
            ))
            db.session.add(MaintenanceWindow(
                olt_id=test_olt,
                start_time=datetime.now(timezone.utc), end_time=datetime.now(timezone.utc),
            ))
            db.session.commit()

        resp = auth_client.delete(f'/api/olt/{test_olt}', headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

        with app.app_context():
            assert OLTConfigBackup.query.filter_by(olt_id=test_olt).count() == 0
            assert MetricHistory.query.filter_by(olt_id=test_olt).count() == 0
            assert TrafficLogHourly.query.filter_by(olt_id=test_olt).count() == 0
            assert MaintenanceWindow.query.filter_by(olt_id=test_olt).count() == 0

    def test_delete_user_unassigns_technician_from_onus(self, auth_client, test_olt):
        from models import Role, User, ONU

        with app.app_context():
            role = Role.query.filter_by(name='Full Access').first()
            tech = User(username='tech1', full_name='Technician One', role_id=role.id)
            tech.set_password('tech12345')
            db.session.add(tech)
            db.session.flush()
            tech_id = tech.id

            onu = ONU(
                olt_id=test_olt, serial_number='ZTEGCTEST01', frame=1, slot=1, port=1, onu_id=1,
                technician_id=tech_id,
            )
            db.session.add(onu)
            db.session.commit()
            onu_id = onu.id

        resp = auth_client.delete(f'/api/user/{tech_id}', headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

        with app.app_context():
            onu = db.session.get(ONU, onu_id)
            assert onu.technician_id is None


class TestCLISecretMaskingHelper:
    """_mask_cli_secrets() redacts password/secret values before they're logged."""

    def test_masks_pppoe_password(self):
        from telnet_client import _mask_cli_secrets

        cmd = 'pppoe 2 nat enable user bob password hunter2'
        masked = _mask_cli_secrets(cmd)
        assert 'hunter2' not in masked
        assert 'password ***' in masked
        assert 'user bob' in masked  # username is not a secret, stays visible

    def test_masks_password_followed_by_more_args(self):
        from telnet_client import _mask_cli_secrets

        cmd = 'wan-ip 1 mode pppoe username bob password hunter2 vlan-profile p1 host 1'
        masked = _mask_cli_secrets(cmd)
        assert 'hunter2' not in masked
        assert 'vlan-profile p1 host 1' in masked

    def test_masks_acs_password(self):
        from telnet_client import _mask_cli_secrets

        cmd = 'tr069-mgmt 1 acs http://acs.example password s3cret'
        assert 's3cret' not in _mask_cli_secrets(cmd)

    def test_leaves_password_free_command_unchanged(self):
        from telnet_client import _mask_cli_secrets

        cmd = 'interface gpon-onu_1/1/1:1'
        assert _mask_cli_secrets(cmd) == cmd


class TestOltBackupDownloadPermission:
    """Downloading an OLT's full running-config backup must require
    settings_ip_olts, not just being logged in (regression test — this
    endpoint used to be @login_required only, exposing VLAN plans, WAN
    topology, and ACS URLs to any authenticated user of any role)."""

    def test_viewer_without_permission_cannot_download_backup(self, auth_client, test_olt):
        from models import Role, User, OLTConfigBackup

        with app.app_context():
            viewer_role = Role(name='BackupDownloadViewer', permissions='')
            db.session.add(viewer_role)
            viewer = User(username='backupviewer', full_name='Backup Viewer', role=viewer_role)
            viewer.set_password('viewer12345')
            db.session.add(viewer)
            backup = OLTConfigBackup(
                olt_id=test_olt, config_text='interface x\nvlan 100',
                config_size=20, backup_type='manual', status='success',
            )
            db.session.add(backup)
            db.session.commit()
            backup_id = backup.id

        auth_client.post('/api/auth/logout', headers={'X-Requested-With': 'XMLHttpRequest'})
        auth_client.post('/api/auth/login', json={'username': 'backupviewer', 'password': 'viewer12345'})
        resp = auth_client.get(f'/api/olt/{test_olt}/backup/{backup_id}/download')
        assert resp.status_code == 403

    def test_admin_with_permission_can_download_backup(self, auth_client, test_olt):
        from models import OLTConfigBackup

        with app.app_context():
            backup = OLTConfigBackup(
                olt_id=test_olt, config_text='interface x\nvlan 100',
                config_size=20, backup_type='manual', status='success',
            )
            db.session.add(backup)
            db.session.commit()
            backup_id = backup.id

        resp = auth_client.get(f'/api/olt/{test_olt}/backup/{backup_id}/download')
        assert resp.status_code == 200
