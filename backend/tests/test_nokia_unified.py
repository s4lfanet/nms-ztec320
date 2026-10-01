"""Tests for Nokia ONT support in the unified provisioning path
(register_unified) and for extra.port_map input sanitization.

register_unified is exercised with a mocked Telnet connection that records
every command _send_command was asked to send — same capture technique as
TestVendorTemplateCommandSequences in test_basic.py (_send_cmd_check
delegates to _send_command, so one mock covers both).

Run with: py -3 -m pytest tests/test_nokia_unified.py -v
"""
import os
import sys
import pytest
from unittest.mock import patch, MagicMock

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from telnet_client import TelnetCollector
from cli_sanitize import CliValidationError
from routes_onu import _sanitize_provisioning_input


def _capture_unified(services, extra=None, serial='ALCL12345678', **kwargs):
    """Run register_unified with a mocked Telnet session; return (ok, msg, commands)."""
    tc = TelnetCollector('10.0.0.1', 'admin', 'admin')
    commands = []

    def fake_send_command(self, tn, command, timeout=15):
        commands.append(command)
        return ''

    with patch.object(TelnetCollector, '_connect', lambda self: MagicMock()), \
         patch.object(TelnetCollector, '_send_command', fake_send_command), \
         patch('time.sleep', lambda *a, **k: None):
        ok, msg = tc.register_unified(
            frame=1, slot=1, port=1, onu_id=5, serial=serial,
            onu_type='All', tcont_profile='1G',
            services=services, extra=extra, is_epon=False,
            **kwargs,
        )
    return ok, msg, commands


class TestNokiaUnified:
    """ont_style='nokia' in extra switches register_unified to Nokia-style
    service lines: named services on shared gemport 1 with cos, no iphost,
    and 'security-mgmt <port> ... protocol web' instead of the generic
    all-protocols line."""

    def test_nokia_named_services_shared_gemport(self):
        services = [
            {'service_type': 'internet', 'vlan': 300, 'name': 'DATA', 'wan_mode': 'bridge'},
            {'service_type': 'tr069', 'vlan': 100, 'name': 'ACS', 'wan_mode': 'bridge'},
        ]
        ok, msg, commands = _capture_unified(services, extra={'ont_style': 'nokia'})
        assert ok is True, f'expected success, got: {msg}'
        assert 'service DATA gemport 1 cos 0 vlan 300' in commands
        assert 'service ACS gemport 1 cos 0 vlan 100' in commands
        # Shared gemport: only one tcont/gemport pair is created
        assert commands.count('gemport 1 tcont 1') == 1
        assert not any(c.startswith('gemport 2') for c in commands)
        assert not any(c.startswith('tcont 2') for c in commands)
        # But each service still gets its own service-port
        assert 'service-port 1 vport 1 user-vlan 300 vlan 300' in commands
        assert 'service-port 2 vport 2 user-vlan 100 vlan 100' in commands
        # Nokia ONTs are VEIP-based
        assert 'vlan port veip_1 mode hybrid' in commands
        # No iphost service lines
        assert not any('iphost' in c for c in commands)
        # Nokia security-mgmt: port 212, web only — never the generic line
        assert not any(c.startswith('security-mgmt 1 ') for c in commands)
        assert 'security-mgmt 212 state enable mode forward protocol web' in commands
        # All-bridge services → no firewall line
        assert not any(c.startswith('firewall enable') for c in commands)

    def test_nokia_default_names_and_cos(self):
        """Missing svc.name falls back to service{n}; svc.cos overrides '0'."""
        services = [
            {'service_type': 'internet', 'vlan': 30, 'wan_mode': 'bridge'},
            {'service_type': 'internet', 'vlan': 151, 'name': 'VOIP', 'cos': '5', 'wan_mode': 'bridge'},
        ]
        ok, msg, commands = _capture_unified(services, extra={'ont_style': 'nokia'})
        assert ok is True, f'expected success, got: {msg}'
        assert 'service service1 gemport 1 cos 0 vlan 30' in commands
        assert 'service VOIP gemport 1 cos 5 vlan 151' in commands

    def test_nokia_security_web_port_override(self):
        services = [{'service_type': 'internet', 'vlan': 30, 'wan_mode': 'bridge'}]
        ok, msg, commands = _capture_unified(
            services, extra={'ont_style': 'nokia', 'security_web_port': '8080'})
        assert ok is True
        assert 'security-mgmt 8080 state enable mode forward protocol web' in commands

    def test_nokia_port_map_replaces_auto_tag(self):
        """A non-empty port_map replaces the auto-tag eth block entirely."""
        services = [{'service_type': 'internet', 'vlan': 30, 'wan_mode': 'bridge'}]
        extra = {
            'ont_style': 'nokia',
            'port_map': [
                {'port': 'eth_0/1', 'mode': 'tag', 'vlan': '30'},
                {'port': 'eth_0/2', 'mode': 'untag'},
                {'port': 'eth_0/4', 'mode': 'trunk'},
                {'port': 'eth_0/3', 'mode': 'skip'},
            ],
        }
        ok, msg, commands = _capture_unified(services, extra=extra)
        assert ok is True
        assert 'vlan port eth_0/1 mode tag vlan 30' in commands
        assert 'vlan port eth_0/2 mode untag' in commands
        assert 'vlan port eth_0/4 mode trunk' in commands
        # 'skip' entry emits nothing
        assert not any('vlan port eth_0/3' in c for c in commands)

    def test_port_map_json_string_form(self):
        """port_map may arrive JSON-encoded (same dual-format as lan_vlans)."""
        import json
        services = [{'service_type': 'internet', 'vlan': 30, 'wan_mode': 'bridge'}]
        extra = {
            'ont_style': 'nokia',
            'port_map': json.dumps([{'port': 'eth_0/1', 'mode': 'tag', 'vlan': '30'}]),
        }
        ok, msg, commands = _capture_unified(services, extra=extra)
        assert ok is True
        assert 'vlan port eth_0/1 mode tag vlan 30' in commands
        # JSON string counted as non-empty → auto-tag eth block replaced
        assert not any(c.startswith('vlan port eth_0/2') for c in commands)

    def test_default_style_unchanged(self):
        """Without ont_style the generic service/gemport/security lines remain."""
        services = [
            {'service_type': 'internet', 'vlan': 300, 'wan_mode': 'bridge'},
            {'service_type': 'tr069', 'vlan': 100, 'wan_mode': 'bridge'},
        ]
        ok, msg, commands = _capture_unified(services, extra={})
        assert ok is True
        assert 'gemport 2 tcont 2' in commands
        assert not any(' cos ' in c for c in commands)


class TestPortMapSanitizer:
    """_sanitize_provisioning_input whitelist-validates extra.port_map
    entries before they reach 'vlan port' CLI commands."""

    def test_rejects_unknown_port(self):
        with pytest.raises(CliValidationError):
            _sanitize_provisioning_input(
                extra={'port_map': [{'port': 'evil', 'mode': 'tag', 'vlan': '30'}]})

    def test_rejects_invalid_mode(self):
        with pytest.raises(CliValidationError):
            _sanitize_provisioning_input(
                extra={'port_map': [{'port': 'eth_0/1', 'mode': 'bogus', 'vlan': '30'}]})

    def test_rejects_missing_vlan_for_tag(self):
        with pytest.raises(CliValidationError):
            _sanitize_provisioning_input(
                extra={'port_map': [{'port': 'eth_0/1', 'mode': 'tag'}]})

    def test_valid_port_map_passes(self):
        out = _sanitize_provisioning_input(extra={
            'port_map': [
                {'port': 'eth_0/1', 'mode': 'tag', 'vlan': '30'},
                {'port': 'wifi_0/1', 'mode': 'hybrid', 'vlan': '30'},
                {'port': 'veip_1', 'mode': 'untag'},
                {'port': 'eth_0/4', 'mode': 'skip'},
            ],
        })
        pm = out['extra']['port_map']
        assert pm[0]['port'] == 'eth_0/1' and pm[0]['vlan'] == 30
        assert pm[1]['port'] == 'wifi_0/1' and pm[1]['vlan'] == 30
        assert pm[2]['mode'] == 'untag'

    def test_port_map_json_string_parsed(self):
        import json
        out = _sanitize_provisioning_input(extra={
            'port_map': json.dumps([{'port': 'eth_0/1', 'mode': 'tag', 'vlan': '30'}]),
        })
        assert out['extra']['port_map'][0]['port'] == 'eth_0/1'
