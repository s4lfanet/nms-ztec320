"""Regression test: WAN service 'Mode' must not silently claim 'Bridge /
ONU Webpage' when the OLT's pon-onu-mng config was never actually read.

Root cause (confirmed live against production, 2026-09-21): on OLTs with
enough ONUs, 'show running-config pon-onu-mng {iface}' is rejected outright
by the firmware (%Error 20201), and the documented fallback — fetching the
full 'show running-config' and extracting this ONU's section — silently
stops short: the OLT itself truncates that dump after ~120KB/~3900 lines
regardless of read timeout (a device-side limit, not a client timeout
issue — verified with a 90s timeout, same truncation point). Any ONU whose
pon-onu-mng section falls after that point never gets its section, and the
mode-detection code used to default to 'Bridge / ONU Webpage' in that case
— exactly as if it were a real, confirmed bridge-mode ONU — even when the
ONU is actually running PPPoE NAT with a live WAN IP.

Run with: py -3 -m pytest tests/test_wan_mode_truncated_config.py -v
"""
import os
import sys
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from telnet_client import TelnetCollector

IFACE = 'gpon-onu_1/1/8:6'

CFG_INTERFACE = f"""interface {IFACE}
  name monicaagustin@malandang
  tcont 1 name VLAN0030 profile UP-PPPOE
  gemport 1 tcont 1
  gemport 1 traffic-limit downstream DOWN-PPPOE
  service-port 1 vport 1 user-vlan 30 vlan 30
!
end"""

PONMNG_UNSUPPORTED = "                         ^\n%Error 20201: Invalid input detected at '^' marker.Invalid command key word"


def _make_dispatcher(global_cfg_text):
    def dispatch(self, tn, cmd, timeout=15):
        if cmd == f'show running-config pon-onu-mng {IFACE}':
            return PONMNG_UNSUPPORTED
        if cmd == 'show running-config':
            return global_cfg_text
        if cmd == f'show running-config interface {IFACE}':
            return CFG_INTERFACE
        return ''  # every other command: benign empty response
    return dispatch


def _collect():
    tc = TelnetCollector.__new__(TelnetCollector)  # skip __init__ (needs OLT creds)
    tn = MagicMock()
    tn.write = MagicMock()
    tn.close = MagicMock()
    tc._connect = lambda: tn
    return tc.collect_onu_detail(1, 1, 8, 6, is_epon=False)


class TestWanModeHonestWhenConfigTruncated:
    def test_mode_marked_unknown_when_ponmng_section_never_found(self):
        """The OLT's global dump got cut off before reaching this ONU's
        pon-onu-mng section entirely (simulates the real truncation) — the
        real mode (which could be PPPoE NAT) must not be guessed as Bridge."""
        global_cfg = (
            "Building configuration...\n"
            f"pon-onu-mng gpon-onu_1/1/3:30\n"
            "  service VLAN0030 gemport 1 iphost 1 vlan 30\n"
            "  pppoe 1 nat enable user someoneelse password secret\n"
            "!\n"
            # (dump 'ends' here — never reaches gpon-onu_1/1/8:6's section)
        )
        with patch.object(TelnetCollector, '_send_command', _make_dispatcher(global_cfg)):
            result = _collect()

        assert result['ponmng_data_available'] is False
        mode = result['wan_services']['service1']['mode']
        assert mode != 'Bridge / ONU Webpage', f"must not guess Bridge when data was never read — got: {mode!r}"
        assert 'unknown' in mode.lower(), f"expected an honest 'unknown' label, got: {mode!r}"

    def test_mode_stays_bridge_when_section_confirmed_empty(self):
        """Regression guard: a genuinely bridge-mode ONU (its pon-onu-mng
        section WAS found, just has no pppoe/wan-ip line in it) must still
        show 'Bridge / ONU Webpage' — this fix must not make that case
        say 'Unknown' too."""
        global_cfg = (
            "Building configuration...\n"
            f"pon-onu-mng {IFACE}\n"
            "  service VLAN0030 gemport 1 iphost 1 vlan 30\n"
            "  vlan port eth_0/1 mode tag vlan 30\n"
            "!\n"
            "pon-onu-mng gpon-onu_1/1/9:1\n"
            "  service VLAN0031 gemport 1 iphost 1 vlan 31\n"
            "!\n"
        )
        with patch.object(TelnetCollector, '_send_command', _make_dispatcher(global_cfg)):
            result = _collect()

        assert result['ponmng_data_available'] is True
        assert result['wan_services']['service1']['mode'] == 'Bridge / ONU Webpage'

    def test_mode_is_pppoe_when_ponmng_section_is_found(self):
        """Sanity check: when the section IS found and does contain a pppoe
        line, mode detection still works as before (this fix only changes
        the 'section never found' branch)."""
        global_cfg = (
            "Building configuration...\n"
            f"pon-onu-mng {IFACE}\n"
            "  service VLAN0030 gemport 1 iphost 1 vlan 30\n"
            "  pppoe 1 nat enable user monicaagustin@malandang password salfanet\n"
            "!\n"
        )
        with patch.object(TelnetCollector, '_send_command', _make_dispatcher(global_cfg)):
            result = _collect()

        assert result['ponmng_data_available'] is True
        assert result['wan_services']['service1']['mode'] == 'PPPoE NAT'
