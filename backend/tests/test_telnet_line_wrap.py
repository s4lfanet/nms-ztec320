"""Test for _join_wrapped_lines() — ZTE C320 wraps long running-config lines
at a fixed ~80-char column with no regard for word boundaries, so a long
tr069-mgmt line can get cut in the middle of a token:

    tr069-mgmt 1 acs http://...:7547 validate basic username acs passwo
    rd ***

Reported live: a real ONU's TR069 section never showed up in the app even
though `tr069-mgmt 1 acs ... password ...` was plainly present in its
running-config — traced to _join_wrapped_lines() rejoining the two physical
lines with an inserted space ("passwo" + " " + "rd ***"), so the literal
keyword "password" the parsing regex looks for never actually appears in
the reassembled line.

Run with: py -3 -m pytest tests/test_telnet_line_wrap.py -v
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from telnet_client import TelnetCollector

# Exact pon-onu-mng dump reported by a user, reproducing the wrap exactly as
# the OLT sent it (line 1 is 80 chars, cutting "password" mid-word).
PONMNG_WITH_WRAPPED_TR069_LINE = """pon-onu-mng gpon-onu_1/1/1:60
  service VLAN0030 gemport 1 iphost 1 vlan 30
  service VLAN151 gemport 2 vlan 151
  pppoe 1 nat enable user edisetiadi@rw03 password salfanet
  vlan port eth_0/1 mode tag vlan 30
  tr069-mgmt 1 state unlock
  tr069-mgmt 1 acs http://192.168.54.254:7547 validate basic username acs passwo
  rd ***
  tr069-mgmt 1 tag pri 0 vlan 1010
  security-mgmt 1 state enable mode forward
!"""


class TestJoinWrappedLines:
    def test_mid_word_wrap_reassembles_without_inserted_space(self):
        joined = TelnetCollector._join_wrapped_lines(PONMNG_WITH_WRAPPED_TR069_LINE)
        assert 'passwo rd' not in joined, "wrap was joined with a spurious space, splitting 'password'"
        assert 'validate basic username acs password ***' in joined

    def test_tr069_acs_regex_matches_after_rejoin(self):
        import re
        joined = TelnetCollector._join_wrapped_lines(PONMNG_WITH_WRAPPED_TR069_LINE)
        acs_line = next(l for l in joined.split('\n') if l.strip().startswith('tr069-mgmt') and 'acs' in l)
        m = re.match(
            r'tr069-mgmt\s+(\d+)\s+acs\s+(\S+)\s+validate\s+\S+\s+username\s+(\S+)\s+password\s+(.+)',
            acs_line.strip(),
        )
        assert m is not None, f"tr069 acs regex failed to match rejoined line: {acs_line!r}"
        assert m.group(2) == 'http://192.168.54.254:7547'
        assert m.group(4) == '***'


# ── Interface-section coverage: cfg_interface (tcont/gemport/service-port)
# used to never go through _join_wrapped_lines at all, and even after fixing
# that, the keyword list didn't include 'tcont ', 'gemport ', or
# 'service-port ' — so naively applying the fixer would have wrongly merged
# every genuinely separate interface-section line into the one before it
# (none of them started with a keyword the function recognized).
INTERFACE_SECTION_MULTIPLE_SERVICES = """interface gpon-onu_1/1/6:29
  Building configuration...
  name amalianuriski@rw01
  tcont 1 name VLAN0030 profile UP-PPPOE
  tcont 2 name VLAN151 profile UP-PPPOE
  gemport 1 tcont 1
  gemport 1 traffic-limit downstream DOWN-PPPOE
  gemport 2 tcont 2
  gemport 2 traffic-limit downstream DOWN-PPPOE
  service-port 1 vport 1 user-vlan 30 vlan 30
  service-port 2 vport 2 user-vlan 151 vlan 151
  end
!"""


class TestInterfaceSectionKeywordCoverage:
    def test_separate_tcont_gemport_service_port_lines_stay_separate(self):
        """Regression guard: tcont/gemport/service-port must each be
        recognized as their own new line, not merged into whatever
        preceded them."""
        joined = TelnetCollector._join_wrapped_lines(INTERFACE_SECTION_MULTIPLE_SERVICES)
        lines = [l.strip() for l in joined.split('\n') if l.strip()]
        assert 'tcont 1 name VLAN0030 profile UP-PPPOE' in lines
        assert 'tcont 2 name VLAN151 profile UP-PPPOE' in lines
        assert 'gemport 1 tcont 1' in lines
        assert 'gemport 2 tcont 2' in lines
        assert 'service-port 1 vport 1 user-vlan 30 vlan 30' in lines
        assert 'service-port 2 vport 2 user-vlan 151 vlan 151' in lines

    def test_wrapped_service_port_line_reassembles(self):
        """A service-port (or tcont/gemport) line long enough to hit the
        same ~80-char wrap column must reassemble the same way tr069-mgmt
        does — no inserted space at the cut."""
        cfg = (
            "interface gpon-onu_1/1/1:1\n"
            "  tcont 1 name A-VERY-LONG-VLAN-PROFILE-NAME-THAT-WRAPS profile UP-VERYLONGPROF\n"
            "  ILE-NAME\n"
            "  gemport 1 tcont 1\n"
            "!"
        )
        joined = TelnetCollector._join_wrapped_lines(cfg)
        assert 'UP-VERYLONGPROFILE-NAME' in joined
        assert 'UP-VERYLONGPROF ILE-NAME' not in joined
