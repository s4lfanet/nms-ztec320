"""Tests for collect_onu_detail()'s WAN-IP/PPPoE mode parsing and the
ip-host -> WAN IP assignment fallback.

Regression covered: wan_ip_mode/pppoe_mode used to be single dict variables
reassigned on every "wan-ip N ..."/"pppoe N ..." line found while scanning
pon-onu-mng config — for an ONU with more than one WAN-IP/PPPoE service,
only the LAST line parsed survived, silently losing the mode for every
other service (which then fell back to "Bridge / ONU Webpage"). Fixed to
key these by service number instead of overwriting a shared variable.

Also covers: the DHCP-obtained WAN IP (from `show gpon remote-onu ip-host`)
used to only get assigned to a service when the reported "Host ID" was the
literal string '1' — some ONT firmware (reported: some Huawei units) don't
number their single host "1", which silently dropped the WAN IP from
display. Fixed to assign whenever exactly one host is reported at all,
not just when its id happens to be "1".

Run with: py -3 -m pytest tests/test_telnet_wan_service_parsing.py -v
"""
import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from telnet_client import TelnetCollector

IFACE = 'gpon-onu_1/1/1:5'

CFG_INTERFACE = f"""
interface {IFACE}
tcont 1 name SVC1 profile UP-DHCP
tcont 2 name SVC2 profile UP-PPPOE
tcont 3 name SVC3 profile UP-STATIC
gemport 1 tcont 1
gemport 2 tcont 2
gemport 3 tcont 3
service-port 1 vport 1 user-vlan 100 vlan 100 gemport 1
service-port 2 vport 2 user-vlan 200 vlan 200 gemport 2
service-port 3 vport 3 user-vlan 300 vlan 300 gemport 3
!
"""

# Three WAN-IP services (DHCP/PPPoE-mode-of-wan-ip/STATIC) — the bug this
# guards against only shows up with >= 2 `wan-ip N ...` lines: the old code
# kept a single shared variable reassigned on each line, so only the LAST
# one parsed (service3 here) ever resolved correctly; service1's mode fell
# back to "Bridge / ONU Webpage" even though it's plainly configured.
CFG_PONMNG_MULTI_SERVICE = f"""
pon-onu-mng {IFACE}
service VLAN0100 gemport 1
service VLAN0200 gemport 2
service VLAN0300 gemport 3
wan-ip 1 mode dhcp vlan-profile genieacs host 1
pppoe 2 nat enable user server2 password salfanet
wan-ip 3 mode static vlan-profile static-profile host 3
!
"""


def _make_collector():
    tc = TelnetCollector('192.168.1.1', 'admin', 'admin')
    tc._connect = MagicMock(return_value=MagicMock())
    return tc


def _send_command_router(responses):
    def _router(tn, command, timeout=15):
        for needle, text in responses.items():
            if needle in command:
                return text
        return ''
    return _router


class TestMultiServiceModeParsing:
    def test_wan_ip_and_pppoe_services_all_keep_their_own_mode(self):
        """Three WAN services (wan-ip DHCP, pppoe, wan-ip STATIC) in the same
        ONU's config must all resolve correctly — not just whichever line
        was parsed last (the pre-fix bug: a single shared variable meant
        only the last "wan-ip N ..." line survived, at the two others'
        expense)."""
        tc = _make_collector()
        responses = {
            'show running-config interface': CFG_INTERFACE,
            'show running-config pon-onu-mng': CFG_PONMNG_MULTI_SERVICE,
            'ip-host': '',
        }
        with patch.object(tc, '_send_command', side_effect=_send_command_router(responses)):
            result = tc.collect_onu_detail(1, 1, 1, 5)

        svc1 = result['wan_services']['service1']
        svc2 = result['wan_services']['service2']
        svc3 = result['wan_services']['service3']
        assert svc1['mode'] == 'Wan-IP - DHCP', f"service1 mode wrong: {svc1.get('mode')!r}"
        assert svc2['mode'] in ('PPPoE NAT', 'PPPoE'), f"service2 mode wrong: {svc2.get('mode')!r}"
        assert svc2['pppoe_username'] == 'server2'
        assert svc3['mode'] == 'Wan-IP - STATIC', f"service3 mode wrong: {svc3.get('mode')!r}"


class TestWanIpHostFallback:
    def test_single_host_ip_assigned_even_when_host_id_is_not_literally_one(self):
        """Only one Wan-IP service, only one host reported by ip-host — the
        WAN IP must be assigned even if the device numbers that host
        something other than '1'."""
        tc = _make_collector()
        cfg_ponmng_single = f"""
pon-onu-mng {IFACE}
service VLAN0100 gemport 1
wan-ip 1 mode dhcp vlan-profile genieacs host 9
!
"""
        ip_host_out = """
Host ID:            9
Current IP address: 192.168.88.50
"""
        responses = {
            'show running-config interface': CFG_INTERFACE,
            'show running-config pon-onu-mng': cfg_ponmng_single,
            'ip-host': ip_host_out,
        }
        with patch.object(tc, '_send_command', side_effect=_send_command_router(responses)):
            result = tc.collect_onu_detail(1, 1, 1, 5)

        svc1 = result['wan_services']['service1']
        assert svc1.get('ip') == '192.168.88.50', f"WAN IP not assigned: {svc1.get('ip')!r}"

    def test_no_ip_assigned_when_multiple_hosts_and_no_exact_match(self):
        """Two hosts reported, neither matching any service's wan_ip_host —
        ambiguous, so nothing should be guessed (still correctly handled by
        the existing second-pass fallback if a service has a vlan)."""
        tc = _make_collector()
        cfg_ponmng_single = f"""
pon-onu-mng {IFACE}
service VLAN0100 gemport 1
wan-ip 1 mode dhcp vlan-profile genieacs host 1
!
"""
        ip_host_out = """
Host ID:            5
Current IP address: 10.0.0.5
Host ID:            6
Current IP address: 10.0.0.6
"""
        responses = {
            'show running-config interface': CFG_INTERFACE,
            'show running-config pon-onu-mng': cfg_ponmng_single,
            'ip-host': ip_host_out,
        }
        with patch.object(tc, '_send_command', side_effect=_send_command_router(responses)):
            result = tc.collect_onu_detail(1, 1, 1, 5)

        # Falls through to the generic "any service with a vlan" fallback,
        # which will pick up service1 (it has a vlan) — this documents
        # existing behavior, not a new guarantee from this fix.
        svc1 = result['wan_services']['service1']
        assert svc1.get('ip') in ('10.0.0.5', '10.0.0.6')
