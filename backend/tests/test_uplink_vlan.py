"""Tests for TelnetCollector.set_vlan_trunk / remove_vlan_from_port —
diff-based switchport updates with CLI error checking and verification."""
from unittest.mock import MagicMock

import pytest

from telnet_client import TelnetCollector


def make_tc(script):
    """Build a TelnetCollector whose _connect/_send_command are faked.
    `script` maps command -> output (str) or callable receiving call-count."""
    tc = TelnetCollector('10.0.0.1', 'zte', 'zte')
    tn = MagicMock()
    tc._connect = MagicMock(return_value=tn)
    tc.commands = []
    counts = {}

    def fake_send(conn, cmd, timeout=15):
        tc.commands.append(cmd)
        i = counts.get(cmd, 0)
        counts[cmd] = i + 1
        val = script.get(cmd, '')
        if callable(val):
            return val(i)
        if isinstance(val, (list, tuple)):
            return val[min(i, len(val) - 1)]
        return val

    tc._send_command = fake_send
    return tc


def port_cfg(vlans, mode='trunk'):
    lines = ['interface gei_1/3/3']
    if mode:
        lines.append(f'  switchport mode {mode}')
    if vlans:
        lines.append(f'  switchport vlan {",".join(vlans)} tag')
    return '\n'.join(lines) + '\n'


class TestSetVlanTrunk:
    PORT = 'gei_1/3/3'
    SHOW = 'show running-config interface gei_1/3/3'

    def test_add_vlan_only(self):
        tc = make_tc({self.SHOW: [port_cfg(['1', '30']), port_cfg(['1', '30', '100'])]})
        ok, msg = tc.set_vlan_trunk(self.PORT, ['1', '30', '100'], 'trunk')
        assert ok is True
        assert 'switchport vlan 100 tag' in tc.commands
        assert not any(c.startswith('no switchport') for c in tc.commands)
        assert not any(c.startswith('switchport mode') for c in tc.commands)
        assert tc.last_port_vlans == ['1', '30', '100']
        assert tc.last_port_mode == 'trunk'

    def test_remove_and_add(self):
        tc = make_tc({self.SHOW: [port_cfg(['1', '30']), port_cfg(['1', '100'])]})
        ok, msg = tc.set_vlan_trunk(self.PORT, ['1', '100'], 'trunk')
        assert ok is True
        assert 'no switchport vlan 30' in tc.commands
        assert 'switchport vlan 100 tag' in tc.commands
        assert tc.commands.index('no switchport vlan 30') < tc.commands.index('switchport vlan 100 tag')

    def test_error_aborts(self):
        tc = make_tc({
            self.SHOW: port_cfg(['1', '30']),
            'switchport vlan 100 tag': '%Error 20202: Invalid input detected at "^" marker.',
        })
        ok, msg = tc.set_vlan_trunk(self.PORT, ['1', '30', '100'], 'trunk')
        assert ok is False
        assert '20202' in msg
        # Nothing but exits after the failed command
        tail = tc.commands[tc.commands.index('switchport vlan 100 tag') + 1:]
        assert all(c == 'exit' for c in tail)

    def test_code_60550_benign(self):
        tc = make_tc({
            self.SHOW: port_cfg(['1', '30', '100']),
            'switchport vlan 100 tag': '%Code 60550: MsVlan: Port already in the vlan.',
        })
        ok, msg = tc.set_vlan_trunk(self.PORT, ['1', '30', '100'], 'trunk')
        assert ok is True

    def test_verification_failure(self):
        tc = make_tc({self.SHOW: [port_cfg(['1', '30']), port_cfg(['1', '30'])]})
        ok, msg = tc.set_vlan_trunk(self.PORT, ['1', '30', '100'], 'trunk')
        assert ok is False
        assert 'Verifikasi' in msg

    def test_invalid_vlan_id(self):
        tc = make_tc({self.SHOW: port_cfg(['1', '30'])})
        ok, msg = tc.set_vlan_trunk(self.PORT, ['abc'], 'trunk')
        assert ok is False
        assert 'tidak valid' in msg
        assert 'configure terminal' not in tc.commands


class TestRemoveVlanFromPort:
    PORT = 'gei_1/3/3'
    SHOW = 'show running-config interface gei_1/3/3'

    def test_remove_present_vlan(self):
        tc = make_tc({self.SHOW: [port_cfg(['1', '30']), port_cfg(['1'])]})
        ok, msg = tc.remove_vlan_from_port(self.PORT, ['30'])
        assert ok is True
        assert 'no switchport vlan 30' in tc.commands
        assert tc.last_port_vlans == ['1']

    def test_remove_absent_vlan_noop(self):
        tc = make_tc({self.SHOW: port_cfg(['1', '30'])})
        ok, msg = tc.remove_vlan_from_port(self.PORT, ['99'])
        assert ok is True
        assert not any(c.startswith('no switchport') for c in tc.commands)
