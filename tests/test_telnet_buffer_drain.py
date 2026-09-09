"""Tests for the telnet/SSH read buffer drain fix.

Root cause (confirmed live against production): SimpleTelnet.read_until()
and SimpleSSH.read_until() do a plain substring search for the prompt
character ('#' or '>') anywhere in the accumulated buffer. If that
character happens to appear inside a command's own *output* rather than
the real shell prompt, read_until() returns early and the true rest of
that response — including the real prompt — stays sitting in
self.buffer. The next _send_command() call then reads that leftover tail
first, silently returning a mix of the previous command's response and
the new one.

Confirmed on the live OLT: `show gpon remote-onu veip <iface>` (or
`... tr069 <iface>`) leaking into the immediately following
`show gpon remote-onu ip-host <iface>` call, which then found no
Host ID/Current IP address lines (because it was reading someone else's
response) and silently dropped the WAN IP that should have been assigned.

Fix: drain() clears any stale buffered bytes before each new command is
written, so a previous command's leftover tail can never bleed into the
next one's result.

Run with: py -3 -m pytest tests/test_telnet_buffer_drain.py -v
"""
import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from telnet_client import SimpleTelnet, SimpleSSH, TelnetCollector


class TestDrainMethod:
    def test_simple_telnet_drain_clears_buffer(self):
        tn = SimpleTelnet('127.0.0.1')
        tn.buffer = b'leftover response tail\n#'
        tn.drain()
        assert tn.buffer == b''

    def test_simple_ssh_drain_clears_buffer(self):
        ssh = SimpleSSH('127.0.0.1')
        ssh.buffer = b'leftover response tail\n#'
        ssh.drain()
        assert ssh.buffer == b''


class FakeLeakyTn:
    """Simulates the exact bug: read_until() matches '#' inside a
    response's own content and leaves the true remainder buffered for
    whoever reads next — unless drain() is called first."""
    def __init__(self):
        self.buffer = b''
        self.writes = []
        # Queue of full raw responses the "device" would send for each
        # write, in order. Each includes a stray '#' partway through its
        # own content (simulating output data that happens to contain the
        # prompt character), followed by more content, ending in the real
        # prompt.
        self._pending_full_responses = []

    def queue_response(self, raw: bytes):
        self._pending_full_responses.append(raw)

    def drain(self):
        self.buffer = b''

    def write(self, data):
        self.writes.append(data)
        # Simulate the device eagerly sending its full response the moment
        # a command is written, all landing in the socket buffer at once.
        if self._pending_full_responses:
            self.buffer += self._pending_full_responses.pop(0)

    def read_until(self, expected, timeout=None):
        if isinstance(expected, str):
            expected = expected.encode()
        if expected in self.buffer:
            idx = self.buffer.index(expected)
            result = self.buffer[:idx + len(expected)]
            self.buffer = self.buffer[idx + len(expected):]
            return result
        result = self.buffer
        self.buffer = b''
        return result


class TestSendCommandDrainsBeforeEachCommand:
    def test_leftover_tail_does_not_leak_into_next_command(self):
        tc = TelnetCollector.__new__(TelnetCollector)  # skip __init__ (needs OLT creds)
        tn = FakeLeakyTn()

        # Command 1's response contains a stray '#' mid-output (e.g. an
        # embedded literal character in some field) — read_until() stops
        # right there, leaving everything after it (more veip lines, then
        # the real prompt) as an unconsumed tail in the buffer.
        tn.queue_response(
            b'cmd1 echo\nVEIP ID: 1\nsome-field: value#with-hash-embedded\n'
            b'more veip line1\nmore veip line2\nreal-prompt#'
        )
        # Command 2 (ip-host) — its own genuine response.
        tn.queue_response(b'cmd2 echo\nHost ID: 1\nCurrent IP address: 172.16.8.22\nreal-prompt#')

        out1 = tc._send_command(tn, 'show gpon remote-onu veip x', timeout=1)
        out2 = tc._send_command(tn, 'show gpon remote-onu ip-host x', timeout=1)

        assert 'VEIP ID' in out1
        # The critical assertion: command 2's result must be its own real
        # response, not the leftover tail from command 1 ("more veip data").
        assert 'more veip data' not in out2, f"leftover from command 1 leaked into command 2: {out2!r}"
        assert 'Current IP address: 172.16.8.22' in out2
