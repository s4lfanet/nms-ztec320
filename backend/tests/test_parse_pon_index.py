"""parse_pon_index: legacy bases and the 0x10{slot}{port}00 layout (GTGH).

Regression: GTGH slot 2 ponIndex 0x10020100.. was decoded as port 225..240.

Run with: python -m pytest tests/test_parse_pon_index.py -v
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from snmp_core import parse_pon_index, encode_pon_index


@pytest.mark.parametrize('port', range(1, 17))
def test_gtgh_slot2_ports_not_offset(port):
    assert parse_pon_index(0x10020000 | (port << 8)) == (2, port)


def test_gtgh_slot3_and_4():
    assert parse_pon_index(0x10030100) == (3, 1)
    assert parse_pon_index(0x10041000) == (4, 16)


@pytest.mark.parametrize('slot', [1, 2])
@pytest.mark.parametrize('port', range(1, 17))
def test_legacy_roundtrip_unchanged(slot, port):
    assert parse_pon_index(encode_pon_index(slot, port)) == (slot, port)


def test_slot1_new_layout_matches_legacy():
    # 0x10010100 is both "slot 1 port 1" and BOARD1_BASE + 256.
    assert parse_pon_index(0x10010100) == (1, 1)


# --- encode_pon_index(layout='slot_port'): opt-in, default unchanged -------

def test_encode_default_is_legacy_and_unchanged():
    assert encode_pon_index(1, 1) == 268500992 + 256
    assert encode_pon_index(2, 1) == 268509184 + 256


@pytest.mark.parametrize('slot', [2, 3, 4])
@pytest.mark.parametrize('port', range(1, 17))
def test_encode_slot_port_roundtrip(slot, port):
    idx = encode_pon_index(slot, port, layout='slot_port')
    assert parse_pon_index(idx) == (slot, port)


def test_encode_slot_port_known_value():
    assert encode_pon_index(2, 1, layout='slot_port') == 0x10020100
