"""Regression test for a bug found while comparing this repo against a
production backup (backup-nms-2026-09-03): the backup's *uncommitted*
working tree had already fixed update_onu_field() to send EPON ONUs a
combined 'property description $$Name$$Desc' CLI command instead of
separate 'name'/'description' commands (EPON doesn't support those
separately). That fix is documented in CHANGELOG.md (2026-08-05) and is
correctly present in update_onu_field() (used by the View ONU page's
inline field editor) — but the *bulk* update_onu() endpoint
(POST /api/onu/<id>/update, used by the All ONUs page's Edit modal) never
got the same fix, so editing an EPON ONU's name/description from there
silently sent CLI commands the ONU doesn't understand.

Run with: py -3 -m pytest tests/test_onu_update_epon.py -v
"""
import os
import sys
import pytest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import User, Role, OLT, ONU

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
def test_olt(auth_client):
    with app.app_context():
        olt = OLT(
            name='Test-OLT', ip_address='192.168.1.1',
            telnet_enabled=True, cli_username='admin', cli_password='admin',
            vendor='ZTE', model='C320',
        )
        db.session.add(olt)
        db.session.commit()
        return olt.id


def _make_onu(olt_id, card):
    with app.app_context():
        onu = ONU(olt_id=olt_id, frame=1, slot=1, port=3, onu_id=2, card=card,
                   serial_number='ZTEGDD9BD0FD', name='Old Name', description='Old Desc')
        db.session.add(onu)
        db.session.commit()
        return onu.id


class TestBulkUpdateSendsCorrectCliForEpon:
    def test_epon_onu_uses_combined_property_description_command(self, auth_client, test_olt):
        onu_id = _make_onu(test_olt, card='EPON')
        with patch('snmp_collector.create_cli_collector') as mock_create:
            mock_tc = MagicMock()
            mock_tc._connect.return_value = MagicMock()  # truthy tn
            mock_create.return_value = mock_tc

            resp = auth_client.post(f'/api/onu/{onu_id}/update', json={
                'name': 'New Name', 'description': 'New Desc',
            }, headers=H)

        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

        sent_cmds = [call.args[1] for call in mock_tc._send_command.call_args_list]
        assert 'property description $$New Name$$New Desc' in sent_cmds, (
            f"expected combined EPON command, got: {sent_cmds!r}"
        )
        assert not any(c.startswith('name ') for c in sent_cmds), (
            f"EPON ONU should not get a separate 'name' command: {sent_cmds!r}"
        )
        assert not any(c.startswith('description ') for c in sent_cmds), (
            f"EPON ONU should not get a separate 'description' command: {sent_cmds!r}"
        )

    def test_gpon_onu_still_uses_separate_commands(self, auth_client, test_olt):
        """Regression guard: the fix must not change behavior for the common
        (non-EPON) case — separate name/description commands as before."""
        onu_id = _make_onu(test_olt, card='')
        with patch('snmp_collector.create_cli_collector') as mock_create:
            mock_tc = MagicMock()
            mock_tc._connect.return_value = MagicMock()
            mock_create.return_value = mock_tc

            resp = auth_client.post(f'/api/onu/{onu_id}/update', json={
                'name': 'New Name', 'description': 'New Desc',
            }, headers=H)

        assert resp.status_code == 200
        assert resp.get_json()['success'] is True

        sent_cmds = [call.args[1] for call in mock_tc._send_command.call_args_list]
        assert 'name New Name' in sent_cmds
        assert 'description New Desc' in sent_cmds
        assert not any('property description' in c for c in sent_cmds)

    def test_epon_onu_name_only_still_includes_existing_description(self, auth_client, test_olt):
        """Editing just the name on an EPON ONU must still send both halves
        of 'property description $$Name$$Desc' — the OLT command sets both
        at once, so the unedited description must be carried along from DB."""
        onu_id = _make_onu(test_olt, card='EPON')
        with patch('snmp_collector.create_cli_collector') as mock_create:
            mock_tc = MagicMock()
            mock_tc._connect.return_value = MagicMock()
            mock_create.return_value = mock_tc

            resp = auth_client.post(f'/api/onu/{onu_id}/update', json={
                'name': 'New Name Only',
            }, headers=H)

        assert resp.status_code == 200
        sent_cmds = [call.args[1] for call in mock_tc._send_command.call_args_list]
        assert 'property description $$New Name Only$$Old Desc' in sent_cmds, (
            f"got: {sent_cmds!r}"
        )
