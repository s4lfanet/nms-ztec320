"""Registrasi gagal di tengah jalan harus dibatalkan di OLT (tidak jadi ghost)."""
import os
import sys
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from telnet_client import TelnetCollector

SVC = [{'service_type': 'internet', 'vlan': 300, 'wan_mode': 'bridge'}]


def _run(fail_on=None, register_fails=False, skip_registration=False):
    tc = TelnetCollector('10.0.0.1', 'admin', 'admin')
    cmds = []

    def fake_send(self, tn, command, timeout=15):
        cmds.append(command)
        if register_fails and command.startswith('onu 5 type'):
            return '%Error 1234: ONU already exists'
        if fail_on and command.startswith(fail_on):
            return '%Error 20202: invalid'
        return ''

    with patch.object(TelnetCollector, '_connect', lambda self: MagicMock()), \
         patch.object(TelnetCollector, '_send_command', fake_send), \
         patch.object(TelnetCollector, '_verify_onu_registered', lambda *a, **k: 'working'), \
         patch('time.sleep', lambda *a, **k: None):
        ok, msg = tc.register_unified(frame=1, slot=1, port=2, onu_id=5, serial='ZTEGC0FFEE01',
                                      onu_type='F609', tcont_profile='default', services=SVC,
                                      is_epon=False, skip_registration=skip_registration)
    return ok, msg, cmds


def test_service_failure_rolls_back_registration():
    ok, msg, cmds = _run(fail_on='gemport')
    assert ok is False and 'dibatalkan' in msg
    assert 'no onu 5' in cmds
    assert cmds[cmds.index('no onu 5') - 1] == 'interface gpon-olt_1/1/2'


def test_success_has_no_rollback():
    ok, msg, cmds = _run()
    assert ok is True and 'no onu 5' not in cmds


def test_register_command_failure_no_rollback():
    ok, msg, cmds = _run(register_fails=True)
    assert ok is False and 'no onu 5' not in cmds


def test_skip_registration_never_rolls_back():
    ok, msg, cmds = _run(fail_on='gemport', skip_registration=True)
    assert ok is False and 'no onu 5' not in cmds


def test_vendor_template_failure_rolls_back():
    tc = TelnetCollector('10.0.0.1', 'admin', 'admin')
    cmds = []

    def fake_send(self, tn, command, timeout=15):
        cmds.append(command)
        return '%Error 20202: invalid' if command.startswith('gemport') else ''

    with patch.object(TelnetCollector, '_connect', lambda self: MagicMock()), \
         patch.object(TelnetCollector, '_send_command', fake_send), \
         patch('time.sleep', lambda *a, **k: None):
        ok, msg = tc.register_vendor_template(frame=1, slot=1, port=3, onu_id=9,
                                              serial='ZTEGC1234567', template='bridge', vlan=200)
    assert ok is False and 'dibatalkan' in msg
    assert 'no onu 9' in cmds and cmds[cmds.index('no onu 9') - 1] == 'interface gpon-olt_1/1/3'
