"""Sanitizes free-text fields before they're interpolated into ZTE OLT CLI
commands sent over Telnet/SSH (see telnet_client.py).

Every command in a CLI session is exactly one line
(`tn.write(command + '\n')` / `tn.write(command + '\n')`) — the OLT's CLI
parser treats a newline as the end of one command and the start of the
next. A newline or carriage return smuggled through a user-supplied field
(ONU name, description, WiFi SSID name/password, PPPoE credentials, TR069
ACS URL, ...) therefore lets an attacker with only `add_onu` permission
inject a second, arbitrary CLI command into the same authenticated Telnet
session — e.g. rebooting the OLT or tearing down another ONU's service-port
on the same board. This module is the single choke point every such field
must pass through before it reaches an f-string CLI command.

Whitelist, not blacklist: rather than trying to enumerate every dangerous
character, only a known-safe set is allowed through. That way a character
nobody thought of yet still gets rejected instead of silently interpolated.
"""
import json as _json

# Printable ASCII, minus control characters (0x00-0x1F, 0x7F) and the CLI/
# shell metacharacters below. This is deliberately generous — WiFi/PPPoE
# passwords need a wide character set for entropy — but a raw space, quote,
# backtick, or shell-redirection/pipe character is never something a CLI
# token (as opposed to a quoted shell string) legitimately needs, so they're
# excluded rather than risk a parser quirk on the OLT side treating them
# specially.
_DANGEROUS_CHARS = frozenset(';|&`$<>"\'\\')
_CONTROL_CHARS = frozenset(chr(c) for c in range(0x00, 0x20)) | {chr(0x7f)}
_DISALLOWED_CHARS = _CONTROL_CHARS | _DANGEROUS_CHARS

# Known tighter limits for specific fields, keyed by the dict key name as it
# appears in wifi_config/tr069_config/extra/services payloads. Anything not
# listed falls back to the generic default passed to sanitize_cli_dict().
FIELD_MAX_LEN = {
    'name': 32,          # WiFi SSID name (ZTE C320 CLI limit)
    'pass': 63,           # WPA2 passphrase — spec max is 63 printable chars
    'ssid_name': 32,
    'ssid1_name': 32,
    'ssid2_name': 32,
    'ssid_pass': 63,
    'ssid1_pass': 63,
    'ssid2_pass': 63,
    'pppoe_user': 64,
    'pppoe_pass': 64,
    'username': 64,
    'password': 64,
    'acs_user': 64,
    'acs_pass': 64,
    'acs_url': 128,
}

# Some legacy provisioning fields carry a JSON-encoded array as a STRING
# value rather than an already-parsed list — e.g. extra['services'] arrives
# as '[{"enabled": true, "username": "...", ...}]' because the frontend
# double-encodes it (see RegisterWizard.tsx: `services: JSON.stringify(...)`)
# and telnet_client.py json.loads()s it itself. Treating a value like that
# as an ordinary free-text field would reject it outright — the quote
# characters JSON requires trip the dangerous-character check, and a
# multi-service payload easily blows past the generic length cap. For these
# specific field names, parse the JSON first and sanitize the resulting
# structure's actual string leaves instead of the raw encoded text.
JSON_CONTAINER_FIELDS = frozenset({'services', 'vlans', 'ssids', 'lan_vlans'})


class CliValidationError(ValueError):
    """Raised when a field fails CLI-safety validation. HTTP route handlers
    should catch this and return 400 with str(e) as the message — never
    silently strip/truncate and send the value on anyway."""

    def __init__(self, field_name, reason):
        self.field_name = field_name
        self.reason = reason
        super().__init__(f"{field_name}: {reason}")


def sanitize_cli_text(value, field_name, max_len=64, allow_empty=True, default=''):
    """Validate and clean one free-text field bound for a ZTE CLI command.

    Raises CliValidationError (never silently truncates) so the caller can
    surface a clear error instead of sending a mangled/dangerous command to
    the OLT. Returns the cleaned string on success.
    """
    if value is None:
        value = default
    if not isinstance(value, str):
        raise CliValidationError(field_name, f"harus berupa teks, bukan {type(value).__name__}")

    value = value.strip()
    if not value:
        if allow_empty:
            return default
        raise CliValidationError(field_name, "tidak boleh kosong")

    if len(value) > max_len:
        raise CliValidationError(field_name, f"maksimal {max_len} karakter (saat ini {len(value)})")

    bad = sorted(set(value) & _DISALLOWED_CHARS)
    if bad:
        raise CliValidationError(field_name, f"mengandung karakter yang tidak diizinkan: {bad!r}")

    # A literal space breaks ZTE's space-delimited CLI argument syntax —
    # not a security boundary by itself (the check above already ruled out
    # anything that could inject a new command or CLI metacharacter), so
    # collapse it rather than reject, matching the SSID-name convention
    # this codebase already used before this fix.
    return value.replace(' ', '_')


def sanitize_cli_int(value, field_name, min_val=None, max_val=None, default=None):
    """Cast a field to int for CLI interpolation (VLAN IDs, TCONT/gemport
    indices, thresholds, ...). Raises CliValidationError rather than letting
    a non-numeric value reach an f-string CLI command unchanged."""
    if value is None or value == '':
        if default is not None:
            return default
        raise CliValidationError(field_name, "wajib diisi dan berupa angka")
    try:
        n = int(value)
    except (TypeError, ValueError):
        raise CliValidationError(field_name, f"harus berupa angka, dapat: {value!r}")
    if min_val is not None and n < min_val:
        raise CliValidationError(field_name, f"minimal {min_val}")
    if max_val is not None and n > max_val:
        raise CliValidationError(field_name, f"maksimal {max_val}")
    return n


def sanitize_cli_dict(value, default_max_len=64, _path=''):
    """Recursively sanitize every string value found in a dict/list
    structure (wifi_config, tr069_config, extra, a `services` entry, ...)
    that will eventually be interpolated into ZTE CLI commands.

    Returns a new, cleaned structure — non-string leaves (int, bool, None)
    pass through unchanged, so callers that need a leaf to actually BE a
    number should additionally validate it with sanitize_cli_int; a stray
    digit-string here is still just a string. Raises CliValidationError
    naming the exact offending field path (e.g. "wifi_config.ssids[0].name")
    on the first invalid value found.
    """
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            key_path = f'{_path}.{k}' if _path else str(k)
            max_len = FIELD_MAX_LEN.get(k, default_max_len)
            if isinstance(v, str) and k in JSON_CONTAINER_FIELDS:
                try:
                    parsed = _json.loads(v)
                except (TypeError, ValueError):
                    raise CliValidationError(key_path, "harus berupa JSON array yang valid")
                out[k] = sanitize_cli_dict(parsed, default_max_len, key_path)
            elif isinstance(v, str):
                out[k] = sanitize_cli_text(v, key_path, max_len=max_len)
            elif isinstance(v, (dict, list)):
                out[k] = sanitize_cli_dict(v, max_len, key_path)
            else:
                out[k] = v
        return out
    if isinstance(value, list):
        return [
            sanitize_cli_dict(v, default_max_len, f'{_path}[{i}]') if isinstance(v, (dict, list))
            else (sanitize_cli_text(v, f'{_path}[{i}]', max_len=default_max_len) if isinstance(v, str) else v)
            for i, v in enumerate(value)
        ]
    if isinstance(value, str):
        return sanitize_cli_text(value, _path or 'value', max_len=default_max_len)
    return value
