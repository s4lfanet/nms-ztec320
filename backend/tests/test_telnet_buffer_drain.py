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

    def close(self):
        pass


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


class TestResetOnuDrainsBeforeEachCommand:
    """reset_onu() (the ONU Reboot button) used to be the one CLI method in
    telnet_client.py written with raw tn.write()/tn.read_until() calls
    instead of _send_command()/_send_cmd_check() — meaning it never called
    drain(), leaving it exposed to the exact leak documented above: a
    context-switch command's response (e.g. entering pon-onu-mng) could
    still contain a stray unconsumed tail when the real 'reboot' command
    was sent, letting reset_onu silently read old buffered text (no error,
    no reboot) instead of the OLT's actual reboot confirmation. This is
    a silent failure — success/msg alone look identical either way — so
    the test spies on the 'reboot' command's own response to prove it's
    the genuine confirmation and not a leaked tail from the previous step."""

    def test_leftover_tail_does_not_shadow_reboot_confirmation(self):
        from unittest.mock import patch

        tc = TelnetCollector.__new__(TelnetCollector)  # skip __init__ (needs OLT creds)
        tn = FakeLeakyTn()
        tc._connect = lambda: tn

        tn.queue_response(b'configure terminal echo\nreal-prompt#')  # 1: configure terminal
        # 2: pon-onu-mng <iface> — contains a stray '#' mid-output, leaving a
        # tail (more junk + its own real prompt) unconsumed in the buffer.
        tn.queue_response(
            b'pon-onu-mng echo\nsome status#with-hash-embedded\n'
            b'more leftover junk\nreal-prompt#'
        )
        # 3: reboot — the genuine response that must actually be read.
        tn.queue_response(b'reboot echo\nStart to reboot the ONU!\nreal-prompt#')
        tn.queue_response(b'exit1-prompt#')  # 4: exit (pon-onu-mng)
        tn.queue_response(b'exit2-prompt#')  # 5: exit (config terminal)
        tn.queue_response(b'exit3-prompt#')  # 6: exit (privileged)

        captured = {}
        real_check = TelnetCollector._send_cmd_check

        def spy_check(self, tn_, command, timeout=15):
            output, err = real_check(self, tn_, command, timeout=timeout)
            if command == 'reboot':
                captured['output'] = output
            return output, err

        with patch.object(TelnetCollector, '_send_cmd_check', spy_check):
            success, msg = tc.reset_onu(1, 2, 3, 5, is_epon=False, serial_number='ZTEGC1234567')

        assert success is True, f'reset_onu unexpectedly failed: {msg}'
        reboot_output = captured.get('output', '')
        assert 'Start to reboot the ONU!' in reboot_output, (
            f"'reboot' command did not receive its own real response — got: {reboot_output!r}"
        )
        assert 'more leftover junk' not in reboot_output, (
            f"'reboot' command read a leftover tail from the previous command instead: {reboot_output!r}"
        )


class TestResetOnuAnswersRebootConfirmation:
    """Confirmed live against production (ZTE C320, 2026-09-21): this OLT's
    'reboot' command under pon-onu-mng doesn't reboot immediately — it
    prompts 'Confirm to reboot? [yes/no]:' and waits. The old code never
    answered it, so reset_onu moved straight on to 'exit' (itself then
    rejected as invalid input at that prompt) and reported success with
    the ONU never actually rebooting — confirmed by querying the OLT
    directly and seeing the ONU stay 'working' (online) the whole time.
    The fix must detect that prompt and answer 'yes'."""

    def test_sends_yes_when_olt_prompts_for_reboot_confirmation(self):
        tc = TelnetCollector.__new__(TelnetCollector)  # skip __init__ (needs OLT creds)
        tn = FakeLeakyTn()
        tc._connect = lambda: tn

        tn.queue_response(b'configure terminal echo\nreal-prompt#')  # 1: configure terminal
        tn.queue_response(b'pon-onu-mng echo\nreal-prompt#')  # 2: pon-onu-mng
        # 3: reboot — no '#' at all (the OLT is just sitting at the
        # confirmation prompt, matching the real device's raw response).
        tn.queue_response(b'reboot echo\nConfirm to reboot? [yes/no]:')
        # 4: yes — the confirmation being answered; genuine completion.
        tn.queue_response(b'yes echo\nreal-prompt#')
        tn.queue_response(b'exit1-prompt#')  # 5: exit (pon-onu-mng)
        tn.queue_response(b'exit2-prompt#')  # 6: exit (config terminal)
        tn.queue_response(b'exit3-prompt#')  # 7: exit (privileged)

        success, msg = tc.reset_onu(1, 1, 3, 2, is_epon=False, serial_number='ZTEGDD9BD0FD')

        assert success is True, f'reset_onu unexpectedly failed: {msg}'
        assert 'yes\n' in tn.writes, f"'yes' was never sent to answer the confirmation prompt — writes: {tn.writes!r}"
        # The confirmation write must come right after the 'reboot' write,
        # not get skipped over straight to 'exit'.
        reboot_idx = tn.writes.index('reboot\n')
        assert tn.writes[reboot_idx + 1] == 'yes\n', (
            f"expected 'yes' immediately after 'reboot', got: {tn.writes[reboot_idx:reboot_idx + 2]!r}"
        )

    def test_no_confirmation_prompt_still_works(self):
        """Some firmware may reboot immediately with no confirmation step —
        the fix must not send a stray 'yes' in that case."""
        tc = TelnetCollector.__new__(TelnetCollector)
        tn = FakeLeakyTn()
        tc._connect = lambda: tn

        tn.queue_response(b'configure terminal echo\nreal-prompt#')
        tn.queue_response(b'pon-onu-mng echo\nreal-prompt#')
        tn.queue_response(b'reboot echo\nStart to reboot the ONU!\nreal-prompt#')
        tn.queue_response(b'exit1-prompt#')
        tn.queue_response(b'exit2-prompt#')
        tn.queue_response(b'exit3-prompt#')

        success, msg = tc.reset_onu(1, 1, 3, 2, is_epon=False, serial_number='ZTEGDD9BD0FD')

        assert success is True, f'reset_onu unexpectedly failed: {msg}'
        assert 'yes\n' not in tn.writes, f"'yes' should not be sent when there was no confirmation prompt: {tn.writes!r}"
