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
