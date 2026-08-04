"""
Telnet client and CLI collector for ZTE C320 OLT.
- Uses raw socket for Telnet (telnetlib removed in Python 3.13+)
- Contains: SimpleTelnet class, TelnetCollector class
"""
import re
import socket
import logging
import asyncio
from datetime import datetime

from snmp_core import (
    detect_vendor_from_sn,
    detect_model_from_sn,
    decode_rx_power,
    decode_oper_state,
    decode_dereg_reason,
    decode_distance,
    format_uptime,
    parse_serial,
    parse_pon_index,
    OID_OPER_STATE,
    OID_RX_POWER,
    OID_TX_POWER,
    OID_OLT_RX,
    OID_ONU_SERIAL,
    BOARD1_BASE,
    BOARD2_BASE,
    PON_INCREMENT,
)

logger = logging.getLogger(__name__)


def _rate_to_mbps(value, unit):
    """Convert a rate value with unit (Bps/Kbps/Mbps/Gbps) to Mbps.
    ZTE 'Bps' unit is Bytes-per-second; Kbps/Mbps/Gbps are bits-per-second."""
    unit = (unit or '').lower()
    if unit == 'bps':
        return (value * 8) / 1_000_000  # Bytes/s -> bits/s -> Mbps
    elif unit == 'kbps':
        return value / 1_000
    elif unit == 'mbps':
        return value
    elif unit == 'gbps':
        return value * 1_000
    return 0.0


# ==================== TELNET CLIENT ====================

class SimpleTelnet:
    """Minimal Telnet client using raw sockets"""
    def __init__(self, host, port=23, timeout=15):
        self.host = host
        self.port = int(port)
        self.timeout = timeout
        self.sock = None
        self.buffer = b''

    def connect(self):
        try:
            self.sock = socket.create_connection((self.host, self.port), timeout=self.timeout)
            self.sock.settimeout(self.timeout)
            return True
        except Exception as e:
            logger.error(f"Telnet connect {self.host}:{self.port} failed: {e}")
            return False

    def read_until(self, expected, timeout=None):
        if isinstance(expected, str):
            expected = expected.encode()
        timeout = timeout or self.timeout
        self.sock.settimeout(timeout)
        end_time = datetime.now().timestamp() + timeout
        while datetime.now().timestamp() < end_time:
            if expected in self.buffer:
                idx = self.buffer.index(expected)
                result = self.buffer[:idx + len(expected)]
                self.buffer = self.buffer[idx + len(expected):]
                return result
            try:
                data = self.sock.recv(4096)
                if not data: break
                self.buffer += self._handle_iac(data)
            except socket.timeout:
                break
            except Exception:
                break
        result = self.buffer
        self.buffer = b''
        return result

    def write(self, data):
        if isinstance(data, str):
            data = data.encode()
        # Telnet protocol requires \r\n (CR+LF) for line endings
        if data.endswith(b'\n') and not data.endswith(b'\r\n'):
            data = data[:-1] + b'\r\n'
        try:
            self.sock.sendall(data)
        except Exception as e:
            logger.error(f"Telnet write failed: {e}")

    def close(self):
        try:
            if self.sock: self.sock.close()
        except: pass
        self.sock = None

    def _handle_iac(self, data):
        result = bytearray()
        i = 0
        while i < len(data):
            if data[i] == 0xFF and i + 1 < len(data):
                cmd = data[i + 1]
                if cmd in (0xFB, 0xFC, 0xFD, 0xFE):
                    if i + 2 < len(data):
                        option = data[i + 2]
                        if cmd in (0xFB, 0xFD):
                            reply = bytes([0xFF, 0xFE if cmd == 0xFD else 0xFC, option])
                            try: self.sock.sendall(reply)
                            except: pass
                        i += 3; continue
                elif cmd == 0xFA:
                    i += 2
                    while i < len(data) and not (data[i] == 0xFF and i + 1 < len(data) and data[i + 1] == 0xF0):
                        i += 1
                    i += 2; continue
                elif cmd in (0xF1, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA):
                    i += 2; continue
                elif cmd == 0xFF:
                    result.append(0xFF); i += 2; continue
                else:
                    i += 2; continue
            result.append(data[i]); i += 1
        return bytes(result)


class TelnetCollector:
    """CLI Collector for ZTE OLT (C300/C320 via Telnet).
    Same CLI commands work on both models."""
    def __init__(self, ip, username, password, port=23, use_ssh=False):
        self.ip = ip
        self.username = username
        self.password = password
        self.port = int(port)
        self.use_ssh = use_ssh

    def _connect(self):
        return self._connect_telnet()

    def _connect_telnet(self):
        tn = SimpleTelnet(self.ip, self.port, timeout=15)
        if not tn.connect(): return None
        try:
            # Read until Username prompt
            banner = tn.read_until(b'Username:', timeout=15)
            if b'Username:' not in banner:
                # Maybe already at prompt or different login flow
                tn.write('\n')
                banner = tn.read_until(b'Username:', timeout=5)
            tn.write(self.username + '\n')

            # Read until Password prompt
            resp = tn.read_until(b'Password:', timeout=10)
            if b'Password:' not in resp:
                logger.warning(f"Telnet {self.ip}: no Password prompt after username")
                tn.close()
                return None
            tn.write(self.password + '\n')

            # Read response after password — should get '#' or '>' prompt on success
            login_resp = tn.read_until(b'#', timeout=10)
            login_text = login_resp.decode('utf-8', errors='replace')

            # Check for login failure
            if 'Error' in login_text or 'Username:' in login_text or 'incorrect' in login_text.lower():
                logger.warning(f"Telnet login {self.ip} failed: {login_text.strip()[:100]}")
                tn.close()
                return None

            # Some OLTs use '>' instead of '#' for user mode
            if b'#' not in login_resp and b'>' not in login_resp:
                # Try reading more for '>' prompt
                extra = tn.read_until(b'>', timeout=5)
                login_text += extra.decode('utf-8', errors='replace')
                if b'>' not in extra and b'#' not in extra:
                    logger.warning(f"Telnet {self.ip}: no prompt after login: {login_text.strip()[:100]}")
                    tn.close()
                    return None

            # Try terminal length 0 (ZTE/Cisco style)
            try:
                tn.write('terminal length 0\n')
                tn.read_until(b'#', timeout=3)
            except Exception:
                pass
            return tn
        except Exception as e:
            logger.error(f"Telnet login {self.ip} failed: {e}")
            try: tn.close()
            except: pass
            return None

    def _send_command(self, tn, command, timeout=15):
        tn.write(command + '\n')
        output = tn.read_until(b'#', timeout=timeout).decode('utf-8', errors='replace')
        # If no '#' found, try reading for '>' prompt
        if '#' not in output:
            try:
                output += tn.read_until(b'>', timeout=5).decode('utf-8', errors='replace')
            except Exception:
                pass
        output = output.replace('\r\n', '\n').replace('\r', '')
        lines = output.split('\n')
        if lines: lines = lines[1:]
        if lines and (lines[-1].strip().endswith('#') or lines[-1].strip().endswith('>')): lines = lines[:-1]
        return '\n'.join(lines)

    def _send_cmd_check(self, tn, command, timeout=15):
        """Send command and check for CLI errors. Returns (output, error_msg)."""
        output = self._send_command(tn, command, timeout=timeout)
        if not output:
            return output, None
        low = output.lower().strip()
        if '%error' in low or '% invalid' in low or '%code' in low or 'incomplete command' in low or 'ambiguous command' in low or 'return error' in low:
            return output, output.strip()[:120]
        return output, None

    def collect_chassis_info(self):
        info = {'temperature': None, 'fans': [], 'cards': []}
        tn = self._connect()
        if not tn: return info
        try:
            output = self._send_command(tn, 'show card')
            info['cards'] = self._parse_show_card(output)
            fan_output = self._send_command(tn, 'show fan')
            info['fans'] = self._parse_show_fan(fan_output)
            temp_match = re.search(r'Environment Temperature\s*:\s*(\d+)', fan_output)
            if temp_match: info['temperature'] = int(temp_match.group(1))
            if not info['temperature']:
                temp_match2 = re.search(r'(\d+)\s*\u00b0?C', output)
                if temp_match2: info['temperature'] = int(temp_match2.group(1))
            tn.write('exit\n'); tn.close()
        except Exception as e:
            logger.error(f"Chassis info failed: {e}")
            try: tn.close()
            except: pass
        return info

    def enrich_onus_via_telnet(self, onus_list):
        """Enrich ONU list with actual type, SN, name from Telnet CLI.
        Only enriches GPON ONUs — EPON ONUs are enriched separately in _collect_epon_onus."""
        if not onus_list: return onus_list

        # Skip EPON ONUs — they don't support gpon CLI commands
        epon_onus = [o for o in onus_list if o.get('card_type') == 'epon']
        gpon_onus = [o for o in onus_list if o.get('card_type') != 'epon']
        if not gpon_onus:
            return onus_list

        port_groups = {}
        for onu in gpon_onus:
            key = (onu['frame'], onu['slot'], onu['port'])
            if key not in port_groups: port_groups[key] = []
            port_groups[key].append(onu)

        logger.info(f"CLI enrichment: {len(onus_list)} ONUs across {len(port_groups)} ports")
        tn = self._connect()
        if not tn:
            logger.warning("CLI enrichment failed: could not connect")
            return onus_list

        try:
            # Step 1: Bulk SN from baseinfo per port
            for (frame, slot, port), port_onus in port_groups.items():
                cmd = f'show gpon onu baseinfo gpon-olt_{frame}/{slot}/{port}'
                try:
                    output = self._send_command(tn, cmd, timeout=15)
                    sn_map = {}
                    for line in output.split('\n'):
                        line = line.strip()
                        if 'gpon-onu_' not in line: continue
                        onu_match = re.search(r'gpon-onu_\d+/\d+/(\d+):(\d+)', line)
                        if onu_match:
                            onu_id = int(onu_match.group(2))
                            sn_match = re.search(r'SN:([A-Za-z0-9]+)', line)
                            if sn_match: sn_map[onu_id] = sn_match.group(1)
                    for onu in port_onus:
                        if onu['onu_id'] in sn_map and sn_map[onu['onu_id']]:
                            onu['serial_number'] = sn_map[onu['onu_id']]
                except Exception as e:
                    logger.debug(f"baseinfo {frame}/{slot}/{port}: {e}")

            # Step 2: Get name, description from detail-info
            for (frame, slot, port), port_onus in port_groups.items():
                for onu in port_onus[:60]:
                    cmd = f'show gpon onu detail-info gpon-onu_{frame}/{slot}/{port}:{onu["onu_id"]}'
                    try:
                        output = self._send_command(tn, cmd, timeout=8)
                        for line in output.split('\n'):
                            line = line.strip()
                            if line.startswith('Name:') and not onu.get('name'):
                                n = line.split(':', 1)[1].strip()
                                if n: onu['name'] = n
                            elif line.startswith('Description:') and not onu.get('description'):
                                d = line.split(':', 1)[1].strip()
                                if d: onu['description'] = d
                            elif line.startswith('Serial number:') and not onu.get('serial_number'):
                                s = line.split(':', 1)[1].strip()
                                if s: onu['serial_number'] = s
                            elif 'ONU Distance:' in line:
                                dm = re.search(r'(\d+)', line)
                                if dm: onu['distance'] = int(dm.group(1))
                    except Exception as e:
                        logger.debug(f"detail {frame}/{slot}/{port}:{onu['onu_id']}: {e}")

            # Step 2b: Get ONU hardware model via 'show gpon remote-onu equip'
            # Uses OMCI to read Equipment ID directly from ONU — works on V2.1.0+
            # Offline ONUs won't respond; errors are caught silently
            _bad_models = {'', 'n/a', 'none', 'unknown', 'null', '-', 'not set', 'all', 'czte'}
            for (frame, slot, port), port_onus in port_groups.items():
                for onu in port_onus[:60]:
                    cmd = f'show gpon remote-onu equip gpon-onu_{frame}/{slot}/{port}:{onu["onu_id"]}'
                    try:
                        output = self._send_command(tn, cmd, timeout=10)
                        if '%Error' in output or 'Invalid' in output:
                            continue
                        for line in output.split('\n'):
                            line = line.strip()
                            if (line.startswith('Equipment ID:') or line.startswith('Model:')) and ':' in line:
                                val = line.split(':', 1)[1].strip()
                                if val.lower() not in _bad_models:
                                    onu['actual_type'] = val
                                    break
                    except Exception as e:
                        logger.debug(f"remote-onu equip {frame}/{slot}/{port}:{onu['onu_id']}: {e}")

            # Step 2c: Get OLT RX power via 'show pon power attenuation' (accurate source)
            # SNMP OID .18 gives wrong values on ZTE C320 V2.1.0 — Telnet is ground truth
            # (verified: Telnet matches rConfig 'Get Status' values exactly)
            for (frame, slot, port), port_onus in port_groups.items():
                for onu in port_onus[:60]:
                    iface_pw = f'gpon-onu_{frame}/{slot}/{port}:{onu["onu_id"]}'
                    try:
                        pw_out = self._send_command(tn, f'show pon power attenuation {iface_pw}', timeout=8)
                        if pw_out and '%Error' not in pw_out and 'Invalid' not in pw_out and 'Incomplete' not in pw_out:
                            for line in pw_out.split('\n'):
                                ls = line.strip()
                                ll = ls.lower()
                                if ll.startswith('up'):
                                    rx_m = re.search(r'Rx\s*:\s*([-]?\d+\.?\d*)', ls)
                                    tx_m = re.search(r'Tx\s*:\s*([-]?\d+\.?\d*)', ls)
                                    if rx_m: onu['rx_power'] = float(rx_m.group(1))    # OLT RX upstream
                                    if tx_m: onu['tx_power'] = float(tx_m.group(1))    # ONU TX upstream
                                elif ll.startswith('down'):
                                    rx_m = re.search(r'Rx\s*:\s*([-]?\d+\.?\d*)', ls)
                                    if rx_m: onu['onu_rx_power'] = float(rx_m.group(1)) # ONU RX downstream
                    except Exception as e:
                        logger.debug(f"power attenuation {iface_pw}: {e}")

            # Step 2d: Get PPPoE username from global running-config pon-onu-mng sections
            try:
                global_cfg = self._send_command(tn, 'show running-config', timeout=30)
                if global_cfg and '%Error' not in global_cfg:
                    current_iface = None
                    for line in global_cfg.split('\n'):
                        ls = line.strip()
                        if ls.startswith('pon-onu-mng gpon-onu_'):
                            m = re.match(r'pon-onu-mng gpon-onu_(\d+)/(\d+)/(\d+):(\d+)', ls)
                            if m:
                                current_iface = (int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4)))
                            else:
                                current_iface = None
                        elif ls == '!' or ls.startswith('interface ') or ls.startswith('pon-onu-mng '):
                            current_iface = None
                        elif current_iface and ls.startswith('pppoe ') and ' user ' in ls and ' password ' in ls:
                            m = re.match(r'pppoe\s+\d+\s+nat\s+\S+\s+user\s+(\S+)\s+password\s+(\S+)', ls)
                            if m:
                                f, s, p, oid = current_iface
                                for onu in onus_list:
                                    if (onu.get('frame') == f and onu.get('slot') == s and
                                        onu.get('port') == p and onu.get('onu_id') == oid):
                                        onu['pppoe'] = m.group(1)
                                        break
            except Exception as e:
                logger.debug(f"global running-config pppoe parse: {e}")

            # Step 3: Fallback — use vendor name from SN prefix when model still unavailable
            for onu in onus_list:
                sn = onu.get('serial_number', '')
                if not onu.get('actual_type') and sn:
                    vendor = detect_vendor_from_sn(sn)
                    if vendor and vendor != 'Unknown':
                        onu['actual_type'] = vendor

            tn.write('exit\n'); tn.close()
        except Exception as e:
            logger.error(f"CLI enrichment failed: {e}")
            try: tn.close()
            except: pass

        return onus_list

    def get_onu_live_data(self, frame, slot, port, onu_id, is_epon=False):
        """
        Fetch live ONU data from OLT via Telnet in a single session.
        Returns dict with: detail, equip, running_config, raw_config, error
        For EPON ONUs, only running-config is available (no detail-info/equip).
        """
        result = {
            'detail': {}, 'equip': {}, 'running_config': {},
            'raw_config': '', 'error': None
        }
        prefix = 'epon-onu' if is_epon else 'gpon-onu'
        onu_iface = f'{prefix}_{frame}/{slot}/{port}:{onu_id}'
        tn = self._connect()
        if not tn:
            result['error'] = 'Telnet connection failed'
            return result

        try:
            import re as _re

            if is_epon:
                # EPON: only running-config is available
                raw_cfg = self._send_command(tn, f'show running-config interface {onu_iface}', timeout=12)
                result['raw_config'] = raw_cfg.strip()
                # Parse service-ports from running-config
                svcports = []
                for line in raw_cfg.split('\n'):
                    ls = line.strip()
                    if ls.startswith('service-port '):
                        parts = ls.split()
                        sp = {'id': '', 'vport': '', 'user_vlan': '', 'vlan': ''}
                        if len(parts) > 1: sp['id'] = parts[1]
                        for i2, p in enumerate(parts):
                            if p == 'vport' and i2+1 < len(parts): sp['vport'] = parts[i2+1]
                            elif p == 'user-vlan' and i2+1 < len(parts): sp['user_vlan'] = parts[i2+1]
                            elif p == 'vlan' and i2+1 < len(parts) and (i2 == 0 or parts[i2-1] != 'user-vlan'):
                                sp['vlan'] = parts[i2+1]
                        svcports.append(sp)
                result['running_config'] = {'tconts': [], 'gemports': [], 'service_ports': svcports}
                tn.write('exit\n'); tn.close()
                return result

            # GPON path (unchanged)
            # 1. show gpon onu detail-info
            raw_detail = self._send_command(tn, f'show gpon onu detail-info {onu_iface}', timeout=10)
            d = {}
            history = []
            in_history = False
            for line in raw_detail.split('\n'):
                line_s = line.strip()
                if '------' in line_s:
                    in_history = True
                    continue
                if in_history and line_s:
                    parts = line_s.split()
                    if len(parts) >= 1 and parts[0].isdigit():
                        idx2 = int(parts[0])
                        auth_time = offline_time = cause = ''
                        if len(parts) >= 3 and _re.match(r'\d{4}-\d{2}-\d{2}', parts[1]):
                            auth_time = f"{parts[1]} {parts[2]}"
                            if len(parts) >= 5 and _re.match(r'\d{4}-\d{2}-\d{2}', parts[3]):
                                offline_time = f"{parts[3]} {parts[4]}"
                                cause = parts[5] if len(parts) > 5 else ''
                        if auth_time and '0000-00-00' not in auth_time:
                            history.append({'idx': idx2, 'auth_time': auth_time,
                                'offline_time': '' if '0000-00-00' in offline_time else offline_time,
                                'cause': cause})
                elif ':' in line_s and not in_history:
                    k2, _, v2 = line_s.partition(':')
                    key = k2.strip().lower().replace(' ', '_')
                    d[key] = v2.strip()
            result['detail'] = d
            result['detail']['history'] = history

            # 2. show gpon remote-onu equip
            raw_equip = self._send_command(tn, f'show gpon remote-onu equip {onu_iface}', timeout=12)
            eq = {}
            if '%Error' not in raw_equip and 'Invalid' not in raw_equip:
                for line in raw_equip.split('\n'):
                    if ':' in line:
                        k3, _, v3 = line.partition(':')
                        eq[k3.strip().lower().replace(' ', '_')] = v3.strip()
            result['equip'] = eq

            # 3. show running-config interface
            raw_cfg = self._send_command(tn, f'show running-config interface {onu_iface}', timeout=12)
            result['raw_config'] = raw_cfg.strip()

            tconts = []
            gemports = []
            svcports = []
            for line in raw_cfg.split('\n'):
                ls = line.strip()
                if ls.startswith('tcont '):
                    parts = ls.split()
                    tconts.append({'id': parts[1] if len(parts) > 1 else '?',
                                   'profile': parts[3] if len(parts) > 3 else ''})
                elif ls.startswith('gemport '):
                    parts = ls.split()
                    gemports.append({'id': parts[1] if len(parts) > 1 else '?',
                                     'tcont': parts[3] if len(parts) > 3 else ''})
                elif ls.startswith('service-port '):
                    parts = ls.split()
                    sp = {'id': '', 'vport': '', 'user_vlan': '', 'vlan': ''}
                    if len(parts) > 1: sp['id'] = parts[1]
                    for i2, p in enumerate(parts):
                        if p == 'vport' and i2+1 < len(parts): sp['vport'] = parts[i2+1]
                        elif p == 'user-vlan' and i2+1 < len(parts): sp['user_vlan'] = parts[i2+1]
                        elif p == 'vlan' and i2+1 < len(parts) and (i2 == 0 or parts[i2-1] != 'user-vlan'):
                            sp['vlan'] = parts[i2+1]
                    svcports.append(sp)
            result['running_config'] = {
                'tconts': tconts, 'gemports': gemports, 'service_ports': svcports
            }
            tn.write('exit\n'); tn.close()
        except Exception as e:
            logger.error(f"get_onu_live_data {onu_iface}: {e}")
            result['error'] = str(e)
            try: tn.close()
            except: pass

        return result


    def reset_onu(self, frame, slot, port, onu_id, is_epon=False):
        """Reboot/reset an ONU via CLI — uses pon-onu-mng context + reboot command.
        ZTE C320: configure terminal > pon-onu-mng gpon-onu_X/Y/Z:N > reboot
        EPON: configure terminal > pon-onu-mng epon-onu_X/Y/Z:N > reboot"""
        prefix = 'epon-onu' if is_epon else 'gpon-onu'
        iface = f'{prefix}_{frame}/{slot}/{port}:{onu_id}'
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'pon-onu-mng {iface}\n')
            tn.read_until(b'#', timeout=5)
            tn.write('reboot\n')
            output = tn.read_until(b'#', timeout=20).decode('utf-8', errors='replace')
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            if 'error' in output.lower() and 'ambiguous' not in output.lower():
                return False, f'CLI error: {output.strip()[:100]}'
            return True, f'ONU {iface} rebooted successfully'
        except Exception as e:
            logger.error(f"reset_onu failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def deregister_onu(self, frame, slot, port, onu_id, is_epon=False):
        """Delete/deregister an ONU from OLT - must be in interface gpon-olt/epon-olt context"""
        prefix = 'epon-onu' if is_epon else 'gpon-onu'
        iface = f'{prefix}_{frame}/{slot}/{port}:{onu_id}'
        olt_prefix = 'epon-olt' if is_epon else 'gpon-olt'
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'interface {olt_prefix}_{frame}/{slot}/{port}\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'no onu {onu_id}\n')
            output = tn.read_until(b'#', timeout=15).decode('utf-8', errors='replace')
            logger.info(f"deregister_onu: 'no onu {onu_id}' output for {iface}: {output.strip()[:200]}")
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            if 'error' in output.lower() and 'ambiguous' not in output.lower():
                return False, f'CLI error: {output.strip()[:100]}'
            return True, f'ONU {iface} deregistered successfully'
        except Exception as e:
            logger.error(f"deregister_onu failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def disable_onu(self, frame, slot, port, onu_id, is_epon=False):
        """Disable an ONU on the OLT (admin state down)"""
        prefix = 'epon-onu' if is_epon else 'gpon-onu'
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            self._send_command(tn, 'configure terminal')
            self._send_command(tn, f'interface {prefix}_{frame}/{slot}/{port}:{onu_id}')
            output, err = self._send_cmd_check(tn, 'shutdown')
            self._send_command(tn, 'exit')
            self._send_command(tn, 'exit')
            self._send_command(tn, 'exit')
            tn.close()
            if err:
                return False, f'CLI error: {err}'
            return True, f'ONU {frame}/{slot}/{port}:{onu_id} disabled'
        except Exception as e:
            logger.error(f"disable_onu failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def enable_onu(self, frame, slot, port, onu_id, is_epon=False):
        """Enable an ONU on the OLT (admin state up)"""
        prefix = 'epon-onu' if is_epon else 'gpon-onu'
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            self._send_command(tn, 'configure terminal')
            self._send_command(tn, f'interface {prefix}_{frame}/{slot}/{port}:{onu_id}')
            output, err = self._send_cmd_check(tn, 'no shutdown')
            self._send_command(tn, 'exit')
            self._send_command(tn, 'exit')
            self._send_command(tn, 'exit')
            tn.close()
            if err:
                return False, f'CLI error: {err}'
            return True, f'ONU {frame}/{slot}/{port}:{onu_id} enabled'
        except Exception as e:
            logger.error(f"enable_onu failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def clear_onu_config(self, frame, slot, port, onu_id, is_epon=False):
        """Clear ONU configuration (remove service-ports, tcont, gemport).

        IMPORTANT: Only removes service configuration, NOT the ONU itself.
        Does NOT send 'shutdown' — the ONU stays registered and online.
        """
        prefix = 'epon-onu' if is_epon else 'gpon-onu'
        iface = f'{prefix}_{frame}/{slot}/{port}:{onu_id}'
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            cfg = self._send_command(tn, f'show running-config interface {iface}', timeout=15)
            if not cfg or 'error' in cfg.lower():
                return False, 'Failed to read ONU running-config'

            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)

            # Remove service-ports from global context (NOT under interface)
            for line in cfg.split('\n'):
                ls = line.strip()
                if ls.startswith('service-port '):
                    parts = ls.split()
                    svc_num = parts[1] if len(parts) > 1 else ''
                    if svc_num:
                        tn.write(f'no service-port {svc_num}\n')
                        tn.read_until(b'#', timeout=5)

            # Enter interface context to remove gemport/tcont
            tn.write(f'interface {iface}\n')
            tn.read_until(b'#', timeout=5)

            # Remove gemports first (they depend on tcont)
            for line in cfg.split('\n'):
                ls = line.strip()
                if ls.startswith('gemport '):
                    parts = ls.split()
                    gem_id = parts[1] if len(parts) > 1 else ''
                    if gem_id:
                        tn.write(f'no gemport {gem_id}\n')
                        tn.read_until(b'#', timeout=5)

            # Remove tconts
            for line in cfg.split('\n'):
                ls = line.strip()
                if ls.startswith('tcont '):
                    parts = ls.split()
                    tcont_id = parts[1] if len(parts) > 1 else ''
                    if tcont_id:
                        tn.write(f'no tcont {tcont_id}\n')
                        tn.read_until(b'#', timeout=5)

            # DO NOT send 'shutdown' — ONU must stay online and registered
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()

            # Count what was cleared
            svc_count = sum(1 for line in cfg.split('\n') if line.strip().startswith('service-port '))
            gem_count = sum(1 for line in cfg.split('\n') if line.strip().startswith('gemport '))
            tcont_count = sum(1 for line in cfg.split('\n') if line.strip().startswith('tcont '))
            logger.info(f"clear_onu_config: {iface} — cleared {svc_count} service-port(s), {gem_count} gemport(s), {tcont_count} tcont(s)")
            return True, f'ONU {frame}/{slot}/{port}:{onu_id} config cleared — {svc_count} svc, {gem_count} gem, {tcont_count} tcont removed (ONU still registered)'
        except Exception as e:
            logger.error(f"clear_onu_config failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def restore_factory_onu(self, frame, slot, port, onu_id):
        """Factory reset an ONU — clears OLT-side config (service-ports, tconts, gemports)
        AND resets ONU's internal OMCI config via 'restore factory'.
        ONU stays registered but all service config is wiped from both sides."""
        iface = f'gpon-onu_{frame}/{slot}/{port}:{onu_id}'
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            # Step 1: Read current running-config to find service-ports, tconts, gemports
            cfg = self._send_command(tn, f'show running-config interface {iface}', timeout=15)
            if not cfg or 'error' in cfg.lower():
                logger.warning(f"restore_factory: could not read running-config for {iface}")
                cfg = ''

            # Step 2: Remove service-ports from global context
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)

            svc_count = 0
            for line in cfg.split('\n'):
                ls = line.strip()
                if ls.startswith('service-port '):
                    parts = ls.split()
                    svc_num = parts[1] if len(parts) > 1 else ''
                    if svc_num:
                        tn.write(f'no service-port {svc_num}\n')
                        tn.read_until(b'#', timeout=5)
                        svc_count += 1

            # Step 3: Enter interface context, remove gemports then tconts
            tn.write(f'interface {iface}\n')
            tn.read_until(b'#', timeout=5)

            gem_count = 0
            for line in cfg.split('\n'):
                ls = line.strip()
                if ls.startswith('gemport '):
                    parts = ls.split()
                    gem_id = parts[1] if len(parts) > 1 else ''
                    if gem_id:
                        tn.write(f'no gemport {gem_id}\n')
                        tn.read_until(b'#', timeout=5)
                        gem_count += 1

            tcont_count = 0
            for line in cfg.split('\n'):
                ls = line.strip()
                if ls.startswith('tcont '):
                    parts = ls.split()
                    tcont_id = parts[1] if len(parts) > 1 else ''
                    if tcont_id:
                        tn.write(f'no tcont {tcont_id}\n')
                        tn.read_until(b'#', timeout=5)
                        tcont_count += 1

            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)

            logger.info(f"restore_factory: cleared {svc_count} service-port(s), {gem_count} gemport(s), {tcont_count} tcont(s) for {iface}")

            # Step 4: Enter pon-onu-mng context and send 'restore factory' (OMCI reset)
            tn.write(f'pon-onu-mng {iface}\n')
            tn.read_until(b'#', timeout=5)
            tn.write('restore factory\n')
            output = tn.read_until(b'#', timeout=20).decode('utf-8', errors='replace')
            logger.info(f"restore_factory: 'restore factory' output for {iface}: {output.strip()[:200]}")

            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()

            if 'error' in output.lower() and 'ambiguous' not in output.lower():
                return False, f'CLI error: {output.strip()[:100]}'
            return True, f'ONU {iface} factory reset — {svc_count} svc, {gem_count} gem, {tcont_count} tcont cleared + OMCI reset'
        except Exception as e:
            logger.error(f"restore_factory_onu failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def restore_wifi_onu(self, frame, slot, port, onu_id):
        """Reset WiFi settings on an ONU via OMCI — only WiFi reset, other config stays."""
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'pon-onu-mng gpon-onu_{frame}/{slot}/{port}:{onu_id}\n')
            tn.read_until(b'#', timeout=5)
            tn.write('restore wifi\n')
            output = tn.read_until(b'#', timeout=15).decode('utf-8', errors='replace')
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            if 'error' in output.lower() and 'ambiguous' not in output.lower():
                return False, f'CLI error: {output.strip()[:100]}'
            return True, f'ONU {frame}/{slot}/{port}:{onu_id} WiFi reset successfully'
        except Exception as e:
            logger.error(f"restore_wifi_onu failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def register_onu(self, frame, slot, port, onu_id, onu_type='ZTE-F609', serial='', vlan=100, is_epon=False):
        """Pre-register a new ONU on the OLT"""
        olt_prefix = 'epon-olt' if is_epon else 'gpon-olt'
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'interface {olt_prefix}_{frame}/{slot}/{port}\n')
            tn.read_until(b'#', timeout=5)
            cmd = f'onu {onu_id} type {onu_type} sn {serial}'
            tn.write(cmd + '\n')
            tn.read_until(b'#', timeout=10)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            return True, f'ONU {frame}/{slot}/{port}:{onu_id} registered with SN {serial}'
        except Exception as e:
            logger.error(f"register_onu failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def configure_onu_profile(self, frame, slot, port, onu_id,
                               tcont_profile='1G', tcont_id=1, gemport_id=1,
                               user_vlan=100, service_vlan=100, service_port=1, vport=1,
                               name='', description='', is_epon=False):
        """Configure TCONT/GEM/service-port for an ONU after registration.
        Also sets name and description if provided.
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            onu_prefix = 'epon-onu' if is_epon else 'gpon-onu'
            onu_if = f'{onu_prefix}_{frame}/{slot}/{port}:{onu_id}'
            service_name = f'VLAN{user_vlan:04d}'

            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)

            # Enter ONU interface
            tn.write(f'interface {onu_if}\n')
            out = tn.read_until(b'#', timeout=5).decode(errors='replace')
            if 'error' in out.lower() or 'invalid' in out.lower():
                tn.write('exit\n'); tn.close()
                return False, f'Failed to enter interface {onu_if}: {out}'

            # Set name
            if name:
                tn.write(f'name {name}\n')
                tn.read_until(b'#', timeout=5)

            # Set description
            if description:
                tn.write(f'description {description}\n')
                tn.read_until(b'#', timeout=5)

            # TCONT
            tn.write(f'tcont {tcont_id} name {service_name} profile {tcont_profile}\n')
            out = tn.read_until(b'#', timeout=5).decode(errors='replace')
            if '%' in out and 'error' in out.lower():
                # Fallback without name
                tn.write(f'tcont {tcont_id} profile {tcont_profile}\n')
                tn.read_until(b'#', timeout=5)

            # GEM port
            tn.write(f'gemport {gemport_id} tcont {tcont_id}\n')
            tn.read_until(b'#', timeout=5)

            # Service port
            tn.write(f'service-port {service_port} vport {vport} user-vlan {user_vlan} vlan {service_vlan}\n')
            tn.read_until(b'#', timeout=5)

            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.close()
            return True, f'Profile configured for {onu_if}'
        except Exception as e:
            logger.error(f"configure_onu_profile failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def register_and_configure(self, frame, slot, port, onu_id, onu_type='All',
                                serial='', vlan=100, tcont_profile='1G',
                                name='', description='', is_epon=False):
        """Register ONU + configure profile matching oltc320 register_onu_stepbystep().
        Uses 'type All' (universal), step-by-step with error checking, 2s sleep.
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            service_name = f'VLAN{vlan:04d}'
            onu_prefix = 'epon-onu' if is_epon else 'gpon-onu'
            olt_prefix = 'epon-olt' if is_epon else 'gpon-olt'
            onu_if = f'{onu_prefix}_{frame}/{slot}/{port}:{onu_id}'
            pon_if = f'{olt_prefix}_{frame}/{slot}/{port}'

            # Step 1: end (clean state)
            self._send_command(tn, 'end')

            # Step 2: configure terminal
            self._send_command(tn, 'configure terminal')

            # Step 3: enter PON interface
            _, err = self._send_cmd_check(tn, f'interface {pon_if}')
            if err:
                tn.write('end\n'); tn.close()
                return False, f'Failed to enter PON interface: {err}'

            # Step 4: register ONU (type All per oltc320 reference)
            _, err = self._send_cmd_check(tn, f'onu {onu_id} type {onu_type} sn {serial}')
            if err:
                tn.write('end\n'); tn.close()
                return False, f'Registration failed: {err}'

            # Step 5: exit PON interface
            self._send_command(tn, 'exit')

            # Step 6: sleep 2s (oltc320 reference — ONU needs time to initialize)
            import time
            time.sleep(2)

            # Step 7: enter ONU interface
            _, err = self._send_cmd_check(tn, f'interface {onu_if}')
            if err:
                # ONU interface not ready — registration succeeded but config skipped
                logger.warning(f"ONU interface not ready after registration: {err}")
                self._send_command(tn, 'end')
                tn.close()
                return True, f'ONU {frame}/{slot}/{port}:{onu_id} registered (config skipped - ONU not ready)'

            # Step 8: set name/description if provided
            if name:
                self._send_command(tn, f'name {name}')
            if description:
                self._send_command(tn, f'description {description}')

            # Step 9: TCONT
            _, err = self._send_cmd_check(tn, f'tcont 1 name {service_name} profile {tcont_profile}')
            if err:
                # Try without name
                self._send_command(tn, f'tcont 1 profile {tcont_profile}')

            # Step 10: GEM port
            self._send_command(tn, 'gemport 1 tcont 1')

            # Step 11: service-port
            self._send_command(tn, f'service-port 1 vport 1 user-vlan {vlan} vlan {vlan}')

            # Step 12: exit and end
            self._send_command(tn, 'end')
            tn.close()
            return True, f'ONU {frame}/{slot}/{port}:{onu_id} registered and configured'
        except Exception as e:
            logger.error(f"register_and_configure failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def register_vendor_template(self, frame, slot, port, onu_id, serial,
                                  template='bridge', onu_type='All',
                                  tcont_profile='1G', vlan=100,
                                  name='', description='',
                                  extra=None, is_epon=False):
        """Register ONU with vendor-specific service template.
        Uses step-by-step commands matching oltc320 reference.
        Templates: bridge, pppoe, fiberhome_veip, zte_full, zte_single, huawei_full, zte_multi
        """
        extra = extra or {}
        # Auto-detect VEIP from serial: ZTE (ZTEG) = iphost, non-ZTE = VEIP
        sn_upper = (serial or '').upper()
        if sn_upper.startswith('ZTEG'):
            extra['use_veip'] = ''  # ZTE ONU → iphost mode
        else:
            extra['use_veip'] = 'true'  # non-ZTE ONU → VEIP mode
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            import time
            onu_prefix = 'epon-onu' if is_epon else 'gpon-onu'
            olt_prefix = 'epon-olt' if is_epon else 'gpon-olt'
            onu_if = f'{onu_prefix}_{frame}/{slot}/{port}:{onu_id}'
            pon_if = f'{olt_prefix}_{frame}/{slot}/{port}'
            service_name = f'VLAN{vlan:04d}'

            # Step 1: end + configure terminal
            self._send_command(tn, 'end')
            self._send_command(tn, 'configure terminal')

            # Step 2: Register ONU on PON interface
            _, err = self._send_cmd_check(tn, f'interface {pon_if}')
            if err:
                self._send_command(tn, 'end'); tn.close()
                return False, f'Failed to enter PON interface: {err}'

            _, err = self._send_cmd_check(tn, f'onu {onu_id} type {onu_type} sn {serial}')
            if err:
                self._send_command(tn, 'end'); tn.close()
                return False, f'Registration failed: {err}'

            self._send_command(tn, 'exit')

            # Step 2b: Ensure ONU type has wifi UNI ports defined (for OMCI SSID config)
            # This prevents 'UNI does not exist' error when configuring SSID
            # Parse dynamic SSID list from extra.ssids (JSON array) or fall back to old fields
            import json as _json_ssid
            ssids_raw = extra.get('ssids', '[]')
            if isinstance(ssids_raw, str):
                ssids_list = _json_ssid.loads(ssids_raw) if ssids_raw else []
            else:
                ssids_list = ssids_raw or []
            # Backward compat: build ssids_list from old ssid1/ssid2 fields if no dynamic list
            if not ssids_list:
                if template == 'zte_single' and extra.get('ssid_name'):
                    ssids_list = [{'port': 'wifi_0/1', 'name': extra.get('ssid_name', ''),
                                   'pass': extra.get('ssid_pass', ''), 'auth': extra.get('ssid_auth', 'wpa2'),
                                   'vlan': '', 'enabled': True, 'hidden': False}]
                elif template in ('zte_full', 'zte_multi'):
                    if extra.get('ssid1_name'):
                        ssids_list.append({'port': 'wifi_0/1', 'name': extra.get('ssid1_name', ''),
                                          'pass': extra.get('ssid1_pass', ''), 'auth': extra.get('ssid1_auth', 'wpa2'),
                                          'vlan': '', 'enabled': True, 'hidden': False})
                    if extra.get('ssid2_name'):
                        ssids_list.append({'port': 'wifi_0/5', 'name': extra.get('ssid2_name', ''),
                                          'pass': extra.get('ssid2_pass', ''), 'auth': extra.get('ssid2_auth', 'wpa2'),
                                          'vlan': '', 'enabled': True, 'hidden': False})
            needs_wifi = any(s.get('name') for s in ssids_list)
            if needs_wifi:
                self._send_command(tn, 'pon')
                # Collect unique wifi ports from ssids_list + defaults
                wifi_ports_set = set()
                for s in ssids_list:
                    port = s.get('port', 'wifi_0/1')
                    if s.get('name'):
                        wifi_ports_set.add(port)
                # Always include default ports for compatibility
                wifi_ports_set.update(['wifi_0/1', 'wifi_0/2'])
                if template in ('zte_full', 'zte_multi'):
                    wifi_ports_set.update(['wifi_0/5', 'wifi_0/6'])
                # Sort by port number
                wifi_ports = sorted(wifi_ports_set, key=lambda p: int(p.split('/')[-1]))
                for wp in wifi_ports:
                    _, werr = self._send_cmd_check(tn, f'onu-type-if {onu_type} {wp}', timeout=10)
                    if werr:
                        logger.info(f"[register] onu-type-if {onu_type} {wp}: {werr} (may already exist)")
                    else:
                        logger.info(f"[register] onu-type-if {onu_type} {wp}: OK")
                self._send_command(tn, 'exit')

            # Step 3: sleep 2s (ONU initialization)
            time.sleep(2)

            # Step 4: enter ONU interface
            _, err = self._send_cmd_check(tn, f'interface {onu_if}')
            if err:
                logger.warning(f"ONU interface not ready: {err}")
                self._send_command(tn, 'end'); tn.close()
                return True, f'ONU {frame}/{slot}/{port}:{onu_id} registered (config skipped)'

            # Helper: send command with error tracking
            last_err = None
            def sc(cmd):
                nonlocal last_err
                out, err = self._send_cmd_check(tn, cmd, timeout=10)
                if err:
                    logger.warning(f"[register_vendor_template] CMD FAILED: '{cmd}' -> {err}")
                    last_err = err
                else:
                    logger.info(f"[register_vendor_template] CMD OK: '{cmd}'")

            # Helper: send command but don't fail on error (e.g. wifi ssid not supported on all ONU models)
            def sc_warn(cmd):
                out, err = self._send_cmd_check(tn, cmd, timeout=10)
                if err:
                    logger.warning(f"[register_vendor_template] CMD WARN (non-fatal): '{cmd}' -> {err}")
                else:
                    logger.info(f"[register_vendor_template] CMD OK: '{cmd}'")

            # Set name/description on ONU interface
            if name:
                sc(f'name {name}')
            if description:
                sc(f'description {description}')

            if template == 'bridge':
                sc(f'tcont 1 name {service_name} profile {tcont_profile}')
                sc('gemport 1 tcont 1')
                sc(f'service-port 1 vport 1 user-vlan {vlan} vlan {vlan}')

            elif template == 'pppoe':
                sc(f'tcont 1 name {service_name} profile {tcont_profile}')
                sc('gemport 1 tcont 1')
                sc(f'service-port 1 vport 1 user-vlan {vlan} vlan {vlan}')
                self._send_command(tn, 'exit')  # exit ONU interface
                self._send_command(tn, f'pon-onu-mng {onu_if}')
                sc(f'service INTERNET gemport 1 vlan {vlan}')
                sc(f'vlan port eth_0/1 mode hybrid def-vlan {vlan}')
                sc(f'vlan port eth_0/2 mode hybrid def-vlan {vlan}')
                sc(f'vlan port eth_0/3 mode hybrid def-vlan {vlan}')
                sc(f'vlan port eth_0/4 mode hybrid def-vlan {vlan}')
                pppoe_user = extra.get('pppoe_user', '')
                pppoe_pass = extra.get('pppoe_pass', '')
                vlan_profile = extra.get('vlan_profile', 'pppoe')
                if pppoe_user:
                    sc(f'wan-ip 1 mode pppoe username {pppoe_user} password {pppoe_pass} vlan-profile {vlan_profile} host 1')
                else:
                    sc(f'wan-ip 1 mode pppoe vlan-profile {vlan_profile} host 1')

            elif template == 'fiberhome_veip':
                tr069_vlan = extra.get('tr069_vlan', 1010)
                internet_vlan = extra.get('internet_vlan', 30)
                voip_vlan = extra.get('voip_vlan', 151)
                acs_url = extra.get('acs_url', '') or 'http://192.168.54.254:7547'
                acs_user = extra.get('acs_user', '') or 'acs'
                acs_pass = extra.get('acs_pass', '') or 'acs'
                traffic_profile = extra.get('traffic_profile', '')
                # sn-bind enable sn
                sc('sn-bind enable sn')
                # TCONTs (no name — matching running-config)
                sc(f'tcont 1 profile {tcont_profile}')
                sc('gemport 1 tcont 1')
                if traffic_profile:
                    sc(f'gemport 1 traffic-limit downstream {traffic_profile}')
                sc(f'tcont 2 profile {tcont_profile}')
                sc('gemport 2 tcont 2')
                sc(f'tcont 3 profile {tcont_profile}')
                sc('gemport 3 tcont 3')
                sc(f'service-port 1 vport 1 user-vlan {tr069_vlan} vlan {tr069_vlan}')
                sc(f'service-port 2 vport 2 user-vlan {internet_vlan} vlan {internet_vlan}')
                sc(f'service-port 3 vport 3 user-vlan {voip_vlan} vlan {voip_vlan}')
                self._send_command(tn, 'exit')
                self._send_command(tn, f'pon-onu-mng {onu_if}')
                # Safe-replace: delete old service entries to prevent error 63869
                for sn in ['service1', 'service2', 'service3']:
                    self._send_command(tn, f'no service {sn}', timeout=10)
                for n in [1, 2, 3]:
                    self._send_command(tn, f'no wan {n} service', timeout=10)
                    self._send_command(tn, f'no wan-ip {n}', timeout=10)
                    self._send_command(tn, f'no pppoe {n}', timeout=10)
                import time as _t; _t.sleep(1)
                # Service names matching running-config: service1, 2, 3
                sc(f'service service1 gemport 1 vlan {tr069_vlan}')
                sc(f'service 2 gemport 2 vlan {internet_vlan}')
                sc(f'service 3 gemport 3 vlan {voip_vlan}')
                sc('vlan port veip_1 mode hybrid')
                sc(f'vlan port eth_0/1 mode tag vlan {internet_vlan}')
                sc(f'vlan port eth_0/2 mode tag vlan {internet_vlan}')
                sc(f'vlan port eth_0/3 mode tag vlan {internet_vlan}')
                sc(f'vlan port eth_0/4 mode tag vlan {internet_vlan}')
                sc(f'vlan port wifi_0/1 mode tag vlan {internet_vlan}')
                sc('tr069-mgmt 1 state unlock')
                sc(f'tr069-mgmt 1 acs {acs_url} validate basic username {acs_user} password {acs_pass}')
                sc(f'tr069-mgmt 1 tag pri 0 vlan {tr069_vlan}')

            elif template == 'zte_full':
                primary_vlan = int(extra.get('primary_vlan') or 30)
                secondary_vlan = int(extra.get('secondary_vlan') or 151)
                enable_dual_ssid = extra.get('enable_dual_ssid', 'true') == 'true'
                ssid1_name = extra.get('ssid1_name', '')
                ssid1_pass = extra.get('ssid1_pass', '12345678')
                ssid1_auth = extra.get('ssid1_auth', 'wpa2')
                ssid2_name = extra.get('ssid2_name', '')
                ssid2_pass = extra.get('ssid2_pass', '')
                ssid2_auth = extra.get('ssid2_auth', 'open')
                enable_pppoe = extra.get('enable_pppoe', '') == 'true'
                pppoe_user = extra.get('pppoe_user', '')
                pppoe_pass = extra.get('pppoe_pass', '')
                enable_tr069 = extra.get('enable_tr069', '') == 'true'
                acs_url = extra.get('acs_url', '') or 'http://192.168.54.254:7547'
                acs_user = extra.get('acs_user', '') or 'acs'
                acs_pass = extra.get('acs_pass', '') or 'acs'
                tr069_vlan = int(extra.get('tr069_vlan') or 0)
                enable_firewall = extra.get('enable_firewall', '') == 'true'
                firewall_level = extra.get('firewall_level', 'low')
                traffic_profile = extra.get('traffic_profile', '')

                # Interface config: TCONT, Gemport, Service-port
                tcont1_name = f'VLAN{primary_vlan:04d}'
                sc(f'tcont 1 name {tcont1_name} profile {tcont_profile}')
                sc('gemport 1 tcont 1')
                if traffic_profile:
                    sc(f'gemport 1 traffic-limit downstream {traffic_profile}')
                tcont2_name = f'VLAN{secondary_vlan}'
                sc(f'tcont 2 name {tcont2_name} profile {tcont_profile}')
                sc('gemport 2 tcont 2')
                if traffic_profile:
                    sc(f'gemport 2 traffic-limit downstream {traffic_profile}')
                sc(f'service-port 1 vport 1 user-vlan {primary_vlan} vlan {primary_vlan}')
                sc(f'service-port 2 vport 2 user-vlan {secondary_vlan} vlan {secondary_vlan}')
                self._send_command(tn, 'exit')

                # pon-onu-mng config
                self._send_command(tn, f'pon-onu-mng {onu_if}')
                # Safe-replace: delete old service entries to prevent error 63869
                for n in [1, 2]:
                    self._send_command(tn, f'no service VLAN{n:04d}', timeout=10)
                    self._send_command(tn, f'no service service{n}', timeout=10)
                    self._send_command(tn, f'no wan {n} service', timeout=10)
                    self._send_command(tn, f'no wan-ip {n}', timeout=10)
                    self._send_command(tn, f'no pppoe {n}', timeout=10)
                import time as _t; _t.sleep(1)
                service1_name = f'VLAN{primary_vlan:04d}'
                use_veip = extra.get('use_veip', '') == 'true'
                if use_veip:
                    sc(f'service {service1_name} gemport 1 vlan {primary_vlan}')
                else:
                    sc(f'service {service1_name} gemport 1 iphost 1 vlan {primary_vlan}')
                service2_name = f'VLAN{secondary_vlan}'
                sc(f'service {service2_name} gemport 2 vlan {secondary_vlan}')
                if use_veip:
                    sc('vlan port veip_1 mode hybrid')
                    sc('vlan port veip_1 vlan 1')

                # PPPoE first (creates WAN connection)
                if enable_pppoe and pppoe_user and pppoe_pass:
                    sc(f'pppoe 1 nat enable user {pppoe_user} password {pppoe_pass}')

                # WAN service AFTER pppoe so service type is not overridden
                # Include tr069 in service type when TR069 is enabled so GenieACS can connect
                if enable_tr069:
                    sc('wan 1 service tr069 internet host 1')
                else:
                    sc('wan 1 service internet host 1')

                # ETH port VLAN tagging — use lan_vlans if provided, else default to primary_vlan
                lan_vlans_raw = extra.get('lan_vlans', '[]')
                if isinstance(lan_vlans_raw, str):
                    lan_vlans = _json_ssid.loads(lan_vlans_raw) if lan_vlans_raw else []
                else:
                    lan_vlans = lan_vlans_raw or []
                for eth_port in range(1, 5):
                    port_vlan = lan_vlans[eth_port - 1] if eth_port - 1 < len(lan_vlans) and lan_vlans[eth_port - 1] else primary_vlan
                    sc(f'vlan port eth_0/{eth_port} mode tag vlan {port_vlan}')

                # WiFi VLAN tagging — use per-SSID VLAN from ssids_list if provided
                for s in ssids_list:
                    if s.get('name') and s.get('vlan'):
                        wp = s.get('port', 'wifi_0/1')
                        sc_warn(f'vlan port {wp} mode tag vlan {s["vlan"]}')
                # Default: tag wifi_0/1 and wifi_0/5 to primary_vlan if no per-SSID VLAN
                if not any(s.get('vlan') for s in ssids_list if s.get('name')):
                    sc_warn(f'vlan port wifi_0/1 mode tag vlan {primary_vlan}')  # 2.4GHz
                    sc_warn(f'vlan port wifi_0/5 mode tag vlan {primary_vlan}')  # 5GHz
                    if enable_dual_ssid:
                        sc_warn(f'vlan port wifi_0/2 mode tag vlan {secondary_vlan}')  # 2.4GHz guest

                # Firewall
                if enable_firewall:
                    sc(f'firewall enable level {firewall_level} anti-hack disable')

                # TR069
                if enable_tr069:
                    sc('tr069-mgmt 1 state unlock')
                    sc(f'tr069-mgmt 1 acs {acs_url} validate basic username {acs_user} password {acs_pass}')
                    tr069_vlan_mode = extra.get('tr069_vlan_mode', 'untag')
                    if tr069_vlan_mode == 'tag' and tr069_vlan:
                        sc(f'tr069-mgmt 1 tag pri 0 vlan {tr069_vlan}')
                    else:
                        sc('tr069-mgmt 1 untag')

                # Security management (enable remote access: web ftp telnet ssh https snmp tr069)
                sc('security-mgmt 1 state enable mode forward protocol web ftp telnet ssh https snmp tr069')

            elif template == 'zte_single':
                ssid_name = extra.get('ssid_name', '')
                ssid_pass = extra.get('ssid_pass', '')
                ssid_auth = extra.get('ssid_auth', 'wpa2')
                enable_pppoe = extra.get('enable_pppoe', '') == 'true'
                pppoe_user = extra.get('pppoe_user', '')
                pppoe_pass = extra.get('pppoe_pass', '')
                enable_tr069 = extra.get('enable_tr069', '') == 'true'
                acs_url = extra.get('acs_url', '') or 'http://192.168.54.254:7547'
                acs_user = extra.get('acs_user', '') or 'acs'
                acs_pass = extra.get('acs_pass', '') or 'acs'
                tr069_vlan = int(extra.get('tr069_vlan') or 0)
                enable_firewall = extra.get('enable_firewall', '') == 'true'
                firewall_level = extra.get('firewall_level', 'low')
                traffic_profile = extra.get('traffic_profile', '')

                sc(f'tcont 1 name {service_name} profile {tcont_profile}')
                sc('gemport 1 tcont 1')
                if traffic_profile:
                    sc(f'gemport 1 traffic-limit downstream {traffic_profile}')
                sc(f'service-port 1 vport 1 user-vlan {vlan} vlan {vlan}')
                self._send_command(tn, 'exit')
                self._send_command(tn, f'pon-onu-mng {onu_if}')
                # Safe-replace: delete old service entries to prevent error 63869
                self._send_command(tn, 'no service INTERNET', timeout=10)
                self._send_command(tn, 'no service service1', timeout=10)
                self._send_command(tn, 'no wan 1 service', timeout=10)
                self._send_command(tn, 'no wan-ip 1', timeout=10)
                self._send_command(tn, 'no pppoe 1', timeout=10)
                import time as _t; _t.sleep(1)
                use_veip = extra.get('use_veip', '') == 'true'
                if use_veip:
                    sc(f'service INTERNET gemport 1 vlan {vlan}')
                    sc('vlan port veip_1 mode hybrid')
                    sc('vlan port veip_1 vlan 1')
                else:
                    sc(f'service INTERNET gemport 1 iphost 1 vlan {vlan}')

                # PPPoE first (creates WAN connection)
                if enable_pppoe and pppoe_user and pppoe_pass:
                    sc(f'pppoe 1 nat enable user {pppoe_user} password {pppoe_pass}')

                # WAN service AFTER pppoe so service type is not overridden
                # Include tr069 in service type when TR069 is enabled so GenieACS can connect
                if enable_tr069:
                    sc('wan 1 service tr069 internet host 1')
                else:
                    sc('wan 1 service internet host 1')

                # ETH port VLAN
                sc(f'vlan port eth_0/1 mode hybrid def-vlan {vlan}')
                sc(f'vlan port eth_0/2 mode hybrid def-vlan {vlan}')
                sc(f'vlan port eth_0/3 mode hybrid def-vlan {vlan}')
                sc(f'vlan port eth_0/4 mode hybrid def-vlan {vlan}')

                # WiFi VLAN tagging (non-fatal: wifi port may not exist in ONU type)
                if ssid_name:
                    sc_warn(f'vlan port wifi_0/1 mode tag vlan {vlan}')

                # Firewall
                if enable_firewall:
                    sc(f'firewall enable level {firewall_level} anti-hack disable')

                # TR069
                if enable_tr069:
                    sc('tr069-mgmt 1 state unlock')
                    sc(f'tr069-mgmt 1 acs {acs_url} validate basic username {acs_user} password {acs_pass}')
                    tr069_vlan_mode = extra.get('tr069_vlan_mode', 'untag')
                    if tr069_vlan_mode == 'tag' and tr069_vlan:
                        sc(f'tr069-mgmt 1 tag pri 0 vlan {tr069_vlan}')
                    else:
                        sc('tr069-mgmt 1 untag')

                # Security management (enable remote access: web ftp telnet ssh https snmp tr069)
                sc('security-mgmt 1 state enable mode forward protocol web ftp telnet ssh https snmp tr069')

            elif template == 'huawei_full':
                vlan_profile = extra.get('vlan_profile', 'genieacs')
                # Dynamic VLAN list from extra.vlans (array of {vlan, label})
                # Backward compat: if no vlans list, build from old mgmt/internet/voip fields
                vlans_raw = extra.get('vlans', [])
                if not vlans_raw:
                    vlans_raw = [
                        {'vlan': extra.get('mgmt_vlan', 1010), 'label': 'Mgmt'},
                        {'vlan': extra.get('internet_vlan', 30), 'label': 'Internet'},
                        {'vlan': extra.get('voip_vlan', 151), 'label': 'VoIP'},
                    ]
                # sn-bind enable sn
                sc('sn-bind enable sn')
                # Single TCONT/GEM — all service-ports share vport 1
                sc(f'tcont 1 profile {tcont_profile}')
                sc('gemport 1 tcont 1')
                for idx, v in enumerate(vlans_raw, 1):
                    vid = v.get('vlan', v) if isinstance(v, dict) else v
                    sc(f'service-port {idx} vport 1 user-vlan {vid} vlan {vid}')
                self._send_command(tn, 'exit')
                self._send_command(tn, f'pon-onu-mng {onu_if}')
                # Service binding — no VLAN in service definition (matching running-config)
                sc('service ServiceONU1 gemport 1')
                # WAN IP via DHCP with VLAN profile (GenieACS manages TR069)
                sc(f'wan-ip 1 mode dhcp vlan-profile {vlan_profile} host 1')

            elif template == 'zte_multi':
                # Multi-service WAN config (matching r-config CLI output exactly)
                # Service types: internet, tr069, iptv, bridge
                # TR069 service type: wan-ip mode dhcp with VLAN profile + separate tr069-mgmt config
                # WAN modes: wan (WAN-IP), nat (PPPoE NAT), webpage (setup via ONT)
                import json as _json
                services_raw = extra.get('services', '[]')
                if isinstance(services_raw, str):
                    services = _json.loads(services_raw)
                else:
                    services = services_raw
                services = [s for s in services if s.get('enabled')]

                # Per-service download/upload profiles (fallback to global)
                global_download = extra.get('traffic_profile', '') or traffic_profile
                global_upload = tcont_profile

                # Determine if any non-bridge service exists (for firewall/security-mgmt)
                has_non_bridge = any(s.get('service_type', 'internet') != 'bridge' for s in services)
                # Determine if TR069 profile is enabled
                tr069_enabled = extra.get('enable_tr069') == 'true'

                # Phase 1: Interface config — TCONT, Gemport, Service-port per service
                for idx, svc in enumerate(services):
                    n = idx + 1
                    svc_vlans = svc.get('vlans', [])
                    primary_vlan = int(svc_vlans[0]) if svc_vlans else vlan
                    svc_type = svc.get('service_type', 'internet')
                    # Service name: simple "service{N}" matching r-config output
                    svc_name = f'service{n}'
                    # Upload profile (TCONT) — per-service or global
                    up_profile = svc.get('profile_upload', '') or global_upload
                    down_profile = svc.get('profile_download', '') or global_download
                    sc(f'tcont {n} name {svc_name} profile {up_profile}')
                    sc(f'gemport {n} tcont {n}')
                    if down_profile:
                        sc(f'gemport {n} traffic-limit downstream {down_profile}')
                    # IPTV: service-port uses MVLAN as VLAN (not selected VLAN)
                    if svc_type == 'iptv':
                        mvlan = int(svc.get('mvlan', 0))
                        if mvlan:
                            sc(f'service-port {n} vport {n} user-vlan {mvlan} vlan {mvlan}')
                        else:
                            sc(f'service-port {n} vport {n} user-vlan {primary_vlan} vlan {primary_vlan}')
                    else:
                        sc(f'service-port {n} vport {n} user-vlan {primary_vlan} vlan {primary_vlan}')
                self._send_command(tn, 'exit')  # exit ONU interface

                # Phase 2: pon-onu-mng config
                self._send_command(tn, f'pon-onu-mng {onu_if}')
                use_veip = extra.get('use_veip', '') == 'true'
                for idx, svc in enumerate(services):
                    n = idx + 1
                    svc_vlans = svc.get('vlans', [])
                    primary_vlan = int(svc_vlans[0]) if svc_vlans else vlan
                    svc_type = svc.get('service_type', 'internet')
                    wan_mode = svc.get('wan_mode', 'webpage')
                    wan_ip_mode = svc.get('wan_ip_mode', 'PPPoE')
                    vlan_profile = svc.get('vlan_profile', '')
                    username = svc.get('username', '')
                    password = svc.get('password', '')
                    svc_name = f'service{n}'

                    # Calculate VLAN for service definition
                    if svc_type == 'iptv':
                        mvlan = int(svc.get('mvlan', 0))
                        svc_vlan_for_service = mvlan if mvlan else primary_vlan
                    else:
                        svc_vlan_for_service = primary_vlan

                    # Service definition — services with WAN-IP/PPPoE need iphost, bridge/iptv don't
                    needs_iphost = (not use_veip) and (svc_type in ('internet', 'tr069') and wan_mode in ('nat', 'wan'))
                    if needs_iphost:
                        sc(f'service {svc_name} gemport {n} iphost {n} vlan {svc_vlan_for_service}')
                    elif not use_veip and n == 1:
                        sc(f'service {svc_name} gemport {n} iphost 1 vlan {svc_vlan_for_service}')
                    else:
                        sc(f'service {svc_name} gemport {n} vlan {svc_vlan_for_service}')

                    # WAN config based on service type and wan_mode
                    if svc_type == 'bridge':
                        # Bridge: no wan-ip, but apply VLAN to ETH ports so traffic flows
                        if not use_veip:
                            for eth_port in (1, 2, 3, 4):
                                sc(f'vlan port eth_0/{eth_port} mode hybrid def-vlan {svc_vlan_for_service}')
                    elif svc_type == 'tr069' and vlan_profile:
                        # TR069: force DHCP via WAN-IP with VLAN profile
                        sc(f'wan-ip {n} mode dhcp vlan-profile {vlan_profile} host {n}')
                        sc(f'wan-ip {n} ping-response enable traceroute-response enable')
                    elif svc_type == 'internet' and wan_mode == 'nat':
                        # PPPoE NAT
                        if username:
                            sc(f'pppoe {n} nat enable user {username} password {password}')
                            sc(f'wan {n} service internet host {n}')
                    elif svc_type == 'internet' and wan_mode == 'wan':
                        if wan_ip_mode == 'PPPoE' and username:
                            sc(f'wan-ip {n} mode pppoe username {username} password {password} vlan-profile {vlan_profile} host {n}')
                            sc(f'wan-ip {n} ping-response enable traceroute-response enable')
                        elif wan_ip_mode == 'DHCP':
                            sc(f'wan-ip {n} mode dhcp vlan-profile {vlan_profile} host {n}')
                            sc(f'wan-ip {n} ping-response enable traceroute-response enable')
                        elif wan_ip_mode == 'STATIC':
                            ip_addr = svc.get('ip_address', '')
                            subnet_mask = svc.get('subnet_mask', '')
                            ip_profile = svc.get('ip_profile', '')
                            if ip_profile:
                                sc(f'wan-ip {n} mode static ip-profile {ip_profile} vlan-profile {vlan_profile} host {n}')
                            elif ip_addr:
                                sc(f'wan-ip {n} mode static ip-address {ip_addr} mask {subnet_mask} vlan-profile {vlan_profile} host {n}')
                            sc(f'wan-ip {n} ping-response enable traceroute-response enable')
                    # webpage mode = setup via ONT — no wan-ip command

                # VEIP config (only for non-ZTE ONUs)
                if use_veip:
                    sc('vlan port veip_1 mode hybrid')
                    sc('vlan port veip_1 vlan 1')

                # LAN port VLAN tagging — use lan_vlans if provided, else auto-tag from services
                lan_vlans_raw = extra.get('lan_vlans', '[]')
                if isinstance(lan_vlans_raw, str):
                    lan_vlans = _json_ssid.loads(lan_vlans_raw) if lan_vlans_raw else []
                else:
                    lan_vlans = lan_vlans_raw or []
                if lan_vlans:
                    for eth_port in range(1, 5):
                        port_vlan = lan_vlans[eth_port - 1] if eth_port - 1 < len(lan_vlans) and lan_vlans[eth_port - 1] else None
                        if port_vlan:
                            sc(f'vlan port eth_0/{eth_port} mode tag vlan {port_vlan}')
                else:
                    # Auto-tag: ETH port N → service N VLAN (if not already tagged by bridge service)
                    for idx, svc in enumerate(services):
                        n = idx + 1
                        if n <= 4:
                            svc_vlans = svc.get('vlans', [])
                            pv = int(svc_vlans[0]) if svc_vlans else vlan
                            svc_type = svc.get('service_type', 'internet')
                            if svc_type != 'bridge':  # bridge already tagged above
                                sc(f'vlan port eth_0/{n} mode tag vlan {pv}')

                # WiFi VLAN tagging — per-SSID VLAN from ssids_list
                for s in ssids_list:
                    if s.get('name') and s.get('vlan'):
                        wp = s.get('port', 'wifi_0/1')
                        sc_warn(f'vlan port {wp} mode tag vlan {s["vlan"]}')

                # Global: firewall + security-mgmt (only if non-bridge service exists)
                if has_non_bridge:
                    sc('firewall enable level low')
                    sc('security-mgmt 1 state enable mode forward protocol web ftp telnet ssh https snmp tr069')

                # TR069 management (if TR069 profile enabled globally)
                if tr069_enabled:
                    sc('tr069-mgmt 1 state unlock')
                    acs_url = extra.get('acs_url', '') or 'http://192.168.54.254:7547'
                    acs_user = extra.get('acs_user', '') or 'acs'
                    acs_pass = extra.get('acs_pass', '') or 'acs'
                    sc(f'tr069-mgmt 1 acs {acs_url} validate basic username {acs_user} password {acs_pass}')
                    tr069_vlan = extra.get('tr069_vlan', '') or extra.get('acs_vlan', '')
                    tr069_vlan_mode = extra.get('tr069_vlan_mode', 'tag')
                    if tr069_vlan and tr069_vlan_mode == 'tag':
                        sc(f'tr069-mgmt 1 tag pri 0 vlan {tr069_vlan}')
                    else:
                        sc('tr069-mgmt 1 untag')

            # Step 5: SSID config — separate session after delay for ONU config state "success"
            # OMCI SSID commands require ONU to have processed initial config first
            ssid_needed = any(s.get('name') for s in ssids_list)
            if ssid_needed:
                self._send_command(tn, 'end')
                logger.info("[register] Waiting 5s for ONU config state to reach 'success' before SSID config...")
                time.sleep(5)
                self._send_command(tn, 'configure terminal')
                self._send_command(tn, f'pon-onu-mng {onu_if}')

                # Dynamic SSID config — iterate over all SSIDs in ssids_list
                for s in ssids_list:
                    ssid_name = (s.get('name') or '').replace(' ', '_')
                    if not ssid_name:
                        continue
                    wp = s.get('port', 'wifi_0/1')
                    ssid_pass = s.get('pass', '')
                    ssid_auth = s.get('auth', 'wpa2')
                    ssid_enabled = s.get('enabled', True)
                    ssid_hidden = s.get('hidden', False)
                    # Enable/disable WiFi radio interface
                    if ssid_enabled:
                        sc_warn(f'interface wifi {wp} state unlock')
                    else:
                        sc_warn(f'interface wifi {wp} state lock')
                        continue  # No need to config SSID if disabled
                    # Set SSID name + hide/show
                    hide_str = 'enable' if ssid_hidden else 'disable'
                    sc_warn(f'ssid ctrl {wp} name {ssid_name} hide {hide_str}')
                    if ssid_auth != 'open':
                        auth_mode = {'wpa2': 'wpa2-psk', 'wpa': 'wpa-psk', 'mixed': 'wpa-wpa2-psk'}.get(ssid_auth, 'wpa2-psk')
                        sc_warn(f'ssid auth wpa {wp} {auth_mode}')
                        sc_warn(f'ssid auth wpa {wp} encrypt aes')
                        if ssid_pass:
                            sc_warn(f'ssid auth wpa {wp} key {ssid_pass}')
                    else:
                        # Open auth: set WEP open-system (ZTE's way of truly open auth)
                        # Also clear any previous WPA config to override stale settings
                        sc_warn(f'ssid auth wpa {wp} no-auth')
                        sc_warn(f'ssid auth wpa {wp} encrypt none')
                        sc_warn(f'ssid auth wpa {wp} no-key')
                        sc_warn(f'ssid auth wep {wp} open-system')
                        logger.info(f'[register_onu_template] Open auth set for {wp}: no-auth, encrypt none, no-key, wep open-system')

            # Exit all contexts
            self._send_command(tn, 'end')
            tn.close()
            if last_err:
                return False, f'CLI error: {last_err}'
            return True, f'ONU {frame}/{slot}/{port}:{onu_id} registered ({template})'
        except Exception as e:
            logger.error(f"register_vendor_template failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def register_unified(self, frame, slot, port, onu_id, serial, onu_type,
                         tcont_profile, services, use_veip=None,
                         traffic_profile='', wifi_config=None,
                         tr069_config=None, name='', description='',
                         extra=None, is_epon=False):
        """Unified ONU registration — works for all vendors.
        
        Args:
            services: list of dicts, each with:
                - service_type: 'internet'|'iptv'|'tr069'|'bridge'
                - vlan: int (primary VLAN)
                - wan_mode: 'bridge'|'nat'|'wan' (default: 'bridge')
                - wan_ip_mode: 'PPPoE'|'DHCP'|'STATIC' (when wan_mode='wan')
                - pppoe_user, pppoe_pass: PPPoE credentials (when wan_mode='nat' or wan_ip_mode='PPPoE')
                - vlan_profile: str (wan-ip profile name for DHCP/PPPoE/STATIC)
                - mvlan: int (multicast VLAN for IPTV)
                - ip_address, subnet_mask: for STATIC mode
                - ip_profile: wan-ip profile name for STATIC mode
            use_veip: bool or None (None = auto-detect from SN: ZTE→False, non-ZTE→True)
            wifi_config: dict with ssid1_name, ssid1_pass, ssid1_auth, ssid2_name, ssid2_pass, ssid2_auth
            tr069_config: dict with acs_url, acs_user, acs_pass, tr069_vlan, tr069_vlan_mode
        """
        extra = extra or {}
        # Auto-detect VEIP
        if use_veip is None:
            use_veip = not (serial or '').upper().startswith('ZTEG')

        tn = self._connect()
        if not tn:
            return False, 'Telnet connection failed'
        try:
            import time
            onu_prefix = 'epon-onu' if is_epon else 'gpon-onu'
            olt_prefix = 'epon-olt' if is_epon else 'gpon-olt'
            onu_if = f'{onu_prefix}_{frame}/{slot}/{port}:{onu_id}'
            pon_if = f'{olt_prefix}_{frame}/{slot}/{port}'

            last_err = None
            def sc(cmd):
                nonlocal last_err
                out, err = self._send_cmd_check(tn, cmd, timeout=10)
                if err:
                    logger.warning(f"[register_unified] CMD FAIL: '{cmd}' -> {err}")
                    last_err = err
                else:
                    logger.info(f"[register_unified] CMD OK: '{cmd}'")

            def sc_warn(cmd):
                out, err = self._send_cmd_check(tn, cmd, timeout=10)
                if err:
                    logger.warning(f"[register_unified] WARN: '{cmd}' -> {err}")

            # Step 1: Enter config
            self._send_command(tn, 'end')
            self._send_command(tn, 'configure terminal')

            # Step 2: Register ONU on PON interface
            _, err = self._send_cmd_check(tn, f'interface {pon_if}')
            if err:
                self._send_command(tn, 'end'); tn.close()
                return False, f'PON interface error: {err}'

            _, err = self._send_cmd_check(tn, f'onu {onu_id} type {onu_type} sn {serial}')
            if err:
                self._send_command(tn, 'end'); tn.close()
                return False, f'Registration failed: {err}'
            self._send_command(tn, 'exit')

            # Step 2b: Ensure WiFi UNI ports exist if WiFi config provided
            # Parse dynamic SSID list from wifi_config.ssids or fall back to old fields
            import json as _json_pw
            pw_ssids_raw = wifi_config.get('ssids', '[]') if wifi_config else '[]'
            if isinstance(pw_ssids_raw, str):
                pw_ssids = _json_pw.loads(pw_ssids_raw) if pw_ssids_raw else []
            else:
                pw_ssids = pw_ssids_raw or []
            # Backward compat: build from old ssid1/ssid2 fields
            if not pw_ssids and wifi_config:
                if wifi_config.get('ssid1_name'):
                    pw_ssids.append({'port': 'wifi_0/1', 'name': wifi_config.get('ssid1_name', ''),
                                    'pass': wifi_config.get('ssid1_pass', ''), 'auth': wifi_config.get('ssid1_auth', 'wpa2'),
                                    'vlan': '', 'enabled': True, 'hidden': False})
                if wifi_config.get('ssid2_name'):
                    pw_ssids.append({'port': 'wifi_0/5', 'name': wifi_config.get('ssid2_name', ''),
                                    'pass': wifi_config.get('ssid2_pass', ''), 'auth': wifi_config.get('ssid2_auth', 'wpa2'),
                                    'vlan': '', 'enabled': True, 'hidden': False})
            pw_needs_wifi = any(s.get('name') for s in pw_ssids)
            if pw_needs_wifi:
                self._send_command(tn, 'pon')
                pw_ports = set()
                for s in pw_ssids:
                    if s.get('name'):
                        pw_ports.add(s.get('port', 'wifi_0/1'))
                pw_ports.update(['wifi_0/1', 'wifi_0/2', 'wifi_0/5', 'wifi_0/6'])
                for wp in sorted(pw_ports, key=lambda p: int(p.split('/')[-1])):
                    self._send_cmd_check(tn, f'onu-type-if {onu_type} {wp}', timeout=10)
                self._send_command(tn, 'exit')

            # Step 3: Wait for ONU init
            time.sleep(2)

            # Step 4: Enter ONU interface — TCONT + GEM + service-port
            _, err = self._send_cmd_check(tn, f'interface {onu_if}')
            if err:
                self._send_command(tn, 'end'); tn.close()
                return True, f'ONU registered but config skipped (interface not ready)'

            if name:
                sc(f'name {name}')
            if description:
                sc(f'description {description}')
            if traffic_profile:
                pass  # applied per-gemport below

            for idx, svc in enumerate(services):
                n = idx + 1
                svc_vlan = int(svc.get('vlan', 100))
                svc_name = f'service{n}'
                tcont = tcont_profile
                down_profile = svc.get('traffic_profile', '') or traffic_profile

                sc(f'tcont {n} name {svc_name} profile {tcont}')
                sc(f'gemport {n} tcont {n}')
                if down_profile:
                    sc(f'gemport {n} traffic-limit downstream {down_profile}')

                svc_type = svc.get('service_type', 'internet')
                if svc_type == 'iptv':
                    mvlan = int(svc.get('mvlan', 0))
                    sc(f'service-port {n} vport {n} user-vlan {mvlan or svc_vlan} vlan {mvlan or svc_vlan}')
                else:
                    sc(f'service-port {n} vport {n} user-vlan {svc_vlan} vlan {svc_vlan}')

            self._send_command(tn, 'exit')

            # Step 5: pon-onu-mng config
            self._send_command(tn, f'pon-onu-mng {onu_if}')

            # Safe-replace: clean up any existing ONU-side service entries to prevent
            # error 63869 "Record already exists" when re-provisioning
            for idx, svc in enumerate(services):
                n = idx + 1
                svc_name = f'service{n}'
                self._send_command(tn, f'no service {svc_name}', timeout=10)
                self._send_command(tn, f'no wan {n} service', timeout=10)
                self._send_command(tn, f'no wan-ip {n}', timeout=10)
                self._send_command(tn, f'no pppoe {n}', timeout=10)
            time.sleep(1)  # Brief pause for OLT to process OMCI deletions

            has_non_bridge = False
            for idx, svc in enumerate(services):
                n = idx + 1
                svc_vlan = int(svc.get('vlan', 100))
                svc_type = svc.get('service_type', 'internet')
                wan_mode = svc.get('wan_mode', 'bridge')
                wan_ip_mode = svc.get('wan_ip_mode', 'PPPoE')
                vlan_profile = svc.get('vlan_profile', '')
                username = svc.get('pppoe_user', '') or svc.get('username', '')
                password = svc.get('pppoe_pass', '') or svc.get('password', '')
                svc_name = f'service{n}'

                # Service definition
                needs_iphost = (not use_veip) and svc_type in ('internet', 'tr069') and wan_mode in ('nat', 'wan')
                if needs_iphost:
                    sc(f'service {svc_name} gemport {n} iphost {n} vlan {svc_vlan}')
                elif not use_veip and n == 1:
                    sc(f'service {svc_name} gemport {n} iphost 1 vlan {svc_vlan}')
                else:
                    sc(f'service {svc_name} gemport {n} vlan {svc_vlan}')

                # WAN config
                if svc_type == 'bridge':
                    pass
                elif svc_type == 'tr069' and vlan_profile:
                    sc(f'wan-ip {n} mode dhcp vlan-profile {vlan_profile} host {n}')
                    sc(f'wan-ip {n} ping-response enable traceroute-response enable')
                    has_non_bridge = True
                elif svc_type == 'iptv':
                    pass  # bridge-like
                elif wan_mode == 'nat':
                    if username:
                        sc(f'pppoe {n} nat enable user {username} password {password}')
                        sc(f'wan {n} service internet host {n}')
                        has_non_bridge = True
                elif wan_mode == 'wan':
                    if wan_ip_mode == 'PPPoE' and username:
                        sc(f'wan-ip {n} mode pppoe username {username} password {password} vlan-profile {vlan_profile} host {n}')
                        sc(f'wan-ip {n} ping-response enable traceroute-response enable')
                        has_non_bridge = True
                    elif wan_ip_mode == 'DHCP':
                        sc(f'wan-ip {n} mode dhcp vlan-profile {vlan_profile} host {n}')
                        sc(f'wan-ip {n} ping-response enable traceroute-response enable')
                        has_non_bridge = True
                    elif wan_ip_mode == 'STATIC':
                        ip_addr = svc.get('ip_address', '')
                        subnet = svc.get('subnet_mask', '')
                        ip_prof = svc.get('ip_profile', '')
                        if ip_prof:
                            sc(f'wan-ip {n} mode static ip-profile {ip_prof} vlan-profile {vlan_profile} host {n}')
                        elif ip_addr:
                            sc(f'wan-ip {n} mode static ip-address {ip_addr} mask {subnet} vlan-profile {vlan_profile} host {n}')
                        sc(f'wan-ip {n} ping-response enable traceroute-response enable')
                        has_non_bridge = True

            # VEIP config (non-ZTE)
            if use_veip:
                sc('vlan port veip_1 mode hybrid')
                sc('vlan port veip_1 vlan 1')

            # Auto-tag LAN ports to matching service VLAN
            # eth_0/1 → service 1 VLAN, eth_0/2 → service 2 VLAN, etc.
            # Remaining ports → primary (first) service VLAN
            if services:
                primary_vlan = int(services[0].get('vlan', 100))
                for lp in range(1, 5):  # eth_0/1 through eth_0/4
                    svc_idx = lp - 1
                    if svc_idx < len(services):
                        port_vlan = int(services[svc_idx].get('vlan', primary_vlan))
                    else:
                        port_vlan = primary_vlan
                    sc_warn(f'vlan port eth_0/{lp} mode tag vlan {port_vlan}')

            # WiFi VLAN tagging — per-SSID VLAN if provided, else use first service VLAN
            if pw_ssids:
                wifi_vlan = int(services[0].get('vlan', 100)) if services else 100
                has_per_ssid_vlan = any(s.get('vlan') for s in pw_ssids if s.get('name'))
                if has_per_ssid_vlan:
                    for s in pw_ssids:
                        if s.get('name') and s.get('vlan'):
                            wp = s.get('port', 'wifi_0/1')
                            sc_warn(f'vlan port {wp} mode tag vlan {s["vlan"]}')
                else:
                    for s in pw_ssids:
                        if s.get('name'):
                            wp = s.get('port', 'wifi_0/1')
                            sc_warn(f'vlan port {wp} mode tag vlan {wifi_vlan}')

            # Firewall + security (if any non-bridge service)
            if has_non_bridge:
                sc('firewall enable level low')
                sc('security-mgmt 1 state enable mode forward protocol web ftp telnet ssh https snmp tr069')

            # TR069 global
            if tr069_config and tr069_config.get('enabled'):
                sc('tr069-mgmt 1 state unlock')
                acs_url = tr069_config.get('acs_url', '') or 'http://192.168.54.254:7547'
                acs_user = tr069_config.get('acs_user', '') or 'acs'
                acs_pass = tr069_config.get('acs_pass', '') or 'acs'
                sc(f'tr069-mgmt 1 acs {acs_url} validate basic username {acs_user} password {acs_pass}')
                tr069_vlan = tr069_config.get('tr069_vlan', '')
                tr069_vlan_mode = tr069_config.get('tr069_vlan_mode', 'tag')
                if tr069_vlan and tr069_vlan_mode == 'tag':
                    sc(f'tr069-mgmt 1 tag pri 0 vlan {tr069_vlan}')
                else:
                    sc('tr069-mgmt 1 untag')

            # WiFi config (ZTE only — after pon-onu-mng) — dynamic SSID list
            for s in pw_ssids:
                ssid_name = (s.get('name') or '').replace(' ', '_')
                if not ssid_name:
                    continue
                wp = s.get('port', 'wifi_0/1')
                ssid_pass = s.get('pass', '')
                ssid_auth = s.get('auth', 'wpa2')
                ssid_enabled = s.get('enabled', True)
                ssid_hidden = s.get('hidden', False)
                # Enable/disable WiFi radio interface
                if ssid_enabled:
                    sc_warn(f'interface wifi {wp} state unlock')
                else:
                    sc_warn(f'interface wifi {wp} state lock')
                    continue  # No need to config SSID if disabled
                # Set SSID name + hide/show
                hide_str = 'enable' if ssid_hidden else 'disable'
                sc_warn(f'ssid ctrl {wp} name {ssid_name} hide {hide_str}')
                if ssid_auth != 'open':
                    auth_mode = {'wpa2': 'wpa2-psk', 'wpa': 'wpa-psk', 'mixed': 'wpa-wpa2-psk'}.get(ssid_auth, 'wpa2-psk')
                    sc_warn(f'ssid auth wpa {wp} {auth_mode}')
                    sc_warn(f'ssid auth wpa {wp} encrypt aes')
                    if ssid_pass:
                        sc_warn(f'ssid auth wpa {wp} key {ssid_pass}')
                else:
                    # Open auth: set WEP open-system (ZTE's way of truly open auth)
                    # Also clear any previous WPA config to override stale settings
                    sc_warn(f'ssid auth wpa {wp} no-auth')
                    sc_warn(f'ssid auth wpa {wp} encrypt none')
                    sc_warn(f'ssid auth wpa {wp} no-key')
                    sc_warn(f'ssid auth wep {wp} open-system')
                    logger.info(f'[register_unified] Open auth set for {wp}: no-auth, encrypt none, no-key, wep open-system')

            self._send_command(tn, 'end')
            tn.close()
            if last_err:
                return False, f'CLI error: {last_err}'
            return True, f'ONU {frame}/{slot}/{port}:{onu_id} registered (unified, {"VEIP" if use_veip else "iphost"})'
        except Exception as e:
            logger.error(f"register_unified failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def collect_vlans(self):
        """Collect VLAN configuration from ZTE C320.
        Sources:
        - 'show vlan summary' for VLAN ID list
        - 'show running-config' for VLAN names, interface VLANs, ONU profiles
        """
        vlans = []
        tn = self._connect()
        if not tn: return vlans
        try:
            # Step 1: Get VLAN IDs from 'show vlan summary'
            output = self._send_command(tn, 'show vlan summary', timeout=20)
            vlan_ids = []
            for line in output.split('\n'):
                line = line.strip()
                if ',' in line or (line and line.replace(' ', '').isdigit()):
                    ids_str = line.replace(' ', '')
                    for part in ids_str.split(','):
                        part = part.strip()
                        if part.isdigit():
                            vlan_ids.append(int(part))
                        elif '-' in part:
                            # Handle ranges like '88-89'
                            try:
                                lo, hi = part.split('-')
                                lo, hi = int(lo), int(hi)
                                vlan_ids.extend(range(lo, hi + 1))
                            except ValueError:
                                continue

            # Step 2: Get VLAN names from running-config 'vlan database' section
            vlan_names = {}
            svi_vlans = set()  # VLANs with L3 interface
            onu_profiles = []  # ONU profile VLAN mappings

            cfg = self._send_command(tn, 'show running-config', timeout=30)
            cfg_lines = cfg.split('\n')
            in_vlan_db = False
            current_vlan = None

            for line in cfg_lines:
                ls = line.strip()

                # Detect vlan database section
                if ls == 'vlan database':
                    in_vlan_db = True
                    continue

                if in_vlan_db:
                    # vlan 1,30,69,88,100,151
                    if ls.startswith('vlan ') and ',' in ls:
                        continue  # bulk declaration, no name
                    # vlan 151
                    elif ls.startswith('vlan ') and ls[5:].isdigit():
                        current_vlan = int(ls[5:])
                    # name VLAN151 (within vlan database context)
                    elif ls.startswith('name ') and current_vlan:
                        vlan_names[current_vlan] = ls.split(' ', 1)[1].strip()
                    # Exit vlan database on blank or other section
                    elif ls and not ls.startswith('name') and not ls.startswith('vlan'):
                        if not ls.startswith('!'):
                            in_vlan_db = False
                            current_vlan = None

                # Detect interface vlan (L3 SVI)
                if ls.startswith('interface vlan '):
                    try:
                        vid = int(ls.split()[-1])
                        svi_vlans.add(vid)
                    except ValueError:
                        pass

                # Detect ONU profile VLAN references
                if ls.startswith('onu profile vlan '):
                    parts = ls.split()
                    if len(parts) >= 8:
                        profile_name = parts[3]
                        cvlan = ''
                        for i, p in enumerate(parts):
                            if p == 'cvlan' and i + 1 < len(parts):
                                cvlan = parts[i + 1]
                        if cvlan:
                            try:
                                onu_profiles.append({
                                    'profile': profile_name,
                                    'vlan_id': int(cvlan)
                                })
                            except ValueError:
                                pass

            # Step 3: Build VLAN list
            for vid in sorted(vlan_ids):
                name = vlan_names.get(vid, f'VLAN-{vid}')
                vlan_type = 'L3 (SVI)' if vid in svi_vlans else 'L2'
                # Find ONU profiles using this VLAN
                profiles_using = [p['profile'] for p in onu_profiles if p['vlan_id'] == vid]
                profiles_str = ', '.join(profiles_using) if profiles_using else ''

                vlans.append({
                    'vlan_id': vid,
                    'name': name,
                    'vlan_name': name,
                    'vlan_type': vlan_type,
                    'onu_profiles': profiles_str,
                })

            tn.write('exit\n'); tn.close()
        except Exception as e:
            logger.error(f"collect_vlans failed: {e}")
            try: tn.close()
            except: pass
        return vlans

    def collect_onu_types(self):
        """Collect supported ONU types from OLT via 'show onu-type'.
        Output is multi-line blocks per type:
          ONU type name:          F660
          PON type:               gpon
          Description:            4GE,2POTS,WIFI
          Max T-CONT:             8
          Max GEM port:           32
          Max switch per slot:    8
          Max IP host:            5
          Max VEIP:               0(default: 1 VEIP)
        """
        onu_types = []
        tn = self._connect()
        if not tn: return onu_types
        try:
            output = self._send_command(tn, 'show onu-type', timeout=30)
            current = {}
            for line in output.split('\n'):
                line = line.strip()
                if not line:
                    if current.get('type_name'):
                        onu_types.append(current)
                        current = {}
                    continue
                if ':' in line:
                    key, _, val = line.partition(':')
                    key = key.strip()
                    val = val.strip()
                    if key == 'ONU type name':
                        if current.get('type_name'):
                            onu_types.append(current)
                        current = {'type_name': val, 'pon_type': '', 'description': '',
                                   'max_tcont': 0, 'max_gem': 0, 'max_switch': 0,
                                   'max_ip_host': 0, 'max_veip': 0}
                    elif key == 'PON type':
                        current['pon_type'] = val
                    elif key == 'Description':
                        current['description'] = val
                    elif key == 'Max T-CONT':
                        try: current['max_tcont'] = int(val)
                        except: current['max_tcont'] = 0
                    elif key == 'Max GEM port':
                        try: current['max_gem'] = int(val)
                        except: current['max_gem'] = 0
                    elif key == 'Max switch per slot':
                        try: current['max_switch'] = int(val)
                        except: current['max_switch'] = 0
                    elif key == 'Max IP host':
                        try: current['max_ip_host'] = int(val)
                        except: current['max_ip_host'] = 0
                    elif key == 'Max VEIP':
                        m = re.search(r'(\d+)', val)
                        current['max_veip'] = int(m.group(1)) if m else 0
            if current.get('type_name'):
                onu_types.append(current)
            tn.write('exit\n'); tn.close()
        except Exception as e:
            logger.error(f"collect_onu_types failed: {e}")
            try: tn.close()
            except: pass
        return onu_types

    def collect_speed_profiles(self):
        """Collect TCONT and traffic profiles from ZTE C320.
        Format: 'Profile name :xxx' then data row(s).
        TCONT: ' 1   10000   0   0   N/A   N/A'
        Traffic: ' 9953280   9953280   default   default'
        """
        profiles = {'tcont': [], 'traffic': []}
        tn = self._connect()
        if not tn: return profiles
        try:
            # --- TCONT profiles ---
            output = self._send_command(tn, 'show gpon profile tcont', timeout=20)
            current_profile = ''
            for line in output.split('\n'):
                stripped = line.strip()
                if not stripped: continue
                # Detect profile name: 'Profile name :default'
                if stripped.lower().startswith('profile name'):
                    parts = stripped.split(':', 1)
                    current_profile = parts[1].strip() if len(parts) > 1 else ''
                    continue
                # Skip header lines
                if any(kw in stripped.upper() for kw in ['TYPE', 'FBW', 'ABW', 'MBW', 'PRIORITY', 'WEIGHT', '---']):
                    continue
                # Parse data row: ' 1   10000   0   0   N/A   N/A'
                parts = stripped.split()
                if len(parts) >= 4 and current_profile:
                    try:
                        type_val = parts[0]
                        fixed = parts[1]
                        assure = parts[2]
                        max_bw = parts[3]
                        profiles['tcont'].append({
                            'name': current_profile, 'type': type_val,
                            'fixed_bandwidth': fixed, 'assured_bandwidth': assure,
                            'max_bandwidth': max_bw
                        })
                    except (ValueError, IndexError):
                        pass

            # --- Traffic profiles ---
            output = self._send_command(tn, 'show gpon profile traffic', timeout=20)
            current_profile = ''
            for line in output.split('\n'):
                stripped = line.strip()
                if not stripped: continue
                # Detect profile name: 'Profile name :default'
                if stripped.lower().startswith('profile name'):
                    parts = stripped.split(':', 1)
                    current_profile = parts[1].strip() if len(parts) > 1 else ''
                    continue
                # Skip header lines
                if any(kw in stripped.upper() for kw in ['SIR', 'PIR', 'CBS', 'PBS', '---']):
                    continue
                # Parse data row: ' 9953280   9953280   default   default'
                parts = stripped.split()
                if len(parts) >= 2 and current_profile:
                    try:
                        sir = parts[0]
                        pir = parts[1]
                        profiles['traffic'].append({
                            'name': current_profile, 'sir': sir, 'pir': pir
                        })
                    except (ValueError, IndexError):
                        pass

            tn.write('exit\n'); tn.close()
        except Exception as e:
            logger.error(f"collect_speed_profiles failed: {e}")
            try: tn.close()
            except: pass
        return profiles

    def collect_wan_ip_profiles(self):
        """Collect WAN IP profiles from OLT.
        Primary: 'show gpon profile wan-ip' (may not be supported on all firmware)
        Fallback: parse 'onu profile vlan <name> tag-mode tag cvlan <N>' from gpon running-config
                  These are the provisioning profiles used by ONUs for WAN IP configuration.
        """
        wan_profiles = []
        tn = self._connect()
        if not tn: return wan_profiles
        try:
            output = self._send_command(tn, 'show gpon profile wan-ip', timeout=20)
            if '%Error' not in output and '%Code' not in output:
                # Primary command worked - parse profile blocks
                current_name = ''
                for line in output.split('\n'):
                    line = line.strip()
                    if not line or '---' in line or line.startswith('Total'): continue
                    if line.lower().startswith('profile name'):
                        parts = line.split(':', 1)
                        current_name = parts[1].strip() if len(parts) > 1 else ''
                        continue
                    if any(kw in line for kw in ['IP Address', 'Netmask', 'Gateway', 'DNS']):
                        continue
                    parts = line.split()
                    if len(parts) >= 1 and current_name:
                        ip_addr = parts[0] if len(parts) > 0 else ''
                        mask = parts[1] if len(parts) > 1 else ''
                        gw = parts[2] if len(parts) > 2 else ''
                        dns1 = parts[3] if len(parts) > 3 else ''
                        dns2 = parts[4] if len(parts) > 4 else ''
                        if '.' in ip_addr or ip_addr == '-':
                            wan_profiles.append({
                                'name': current_name, 'ip_address': ip_addr, 'netmask': mask,
                                'gateway': gw, 'dns1': dns1, 'dns2': dns2
                            })
                            current_name = ''
            else:
                # Fallback: parse 'onu profile vlan <name>' from global running-config
                # show running-config works from EXEC mode — no need to enter configure terminal
                logger.debug('WAN IP profile command not supported, falling back to running-config')
                try:
                    cfg = self._send_command(tn, 'show running-config', timeout=30)
                    # Parse 'onu profile vlan <name> tag-mode tag cvlan <N> [pri <N>]'
                    for line in cfg.split('\n'):
                        ls = line.strip()
                        if ls.startswith('onu profile vlan '):
                            parts = ls.split()
                            # onu profile vlan pppoe tag-mode tag cvlan 30 pri 1
                            if len(parts) >= 7:
                                name = parts[3]  # pppoe
                                cvlan = ''
                                pri = ''
                                for i, p in enumerate(parts):
                                    if p == 'cvlan' and i + 1 < len(parts):
                                        cvlan = parts[i + 1]
                                    if p == 'pri' and i + 1 < len(parts):
                                        pri = parts[i + 1]
                                wan_profiles.append({
                                    'name': name,
                                    'ip_address': 'dhcp',
                                    'netmask': '-',
                                    'gateway': '-',
                                    'dns1': f'cvlan:{cvlan}' if cvlan else '-',
                                    'dns2': f'pri:{pri}' if pri else '-',
                                })
                except Exception as e:
                    logger.warning(f'WAN IP running-config fallback failed: {e}')

            tn.write('exit\n'); tn.close()
        except Exception as e:
            logger.error(f"collect_wan_ip_profiles failed: {e}")
            try: tn.close()
            except: pass
        return wan_profiles

    def collect_uplinks(self):
        """Collect detailed uplink port info from ZTE C320 SMXA / C300 SCXN cards.
        Uses 'show card' to find uplink card slots, then:
        - 'show running-config interface <port>' for config (speed, duplex, VLANs, etc.)
        - 'show interface <port>' for status & statistics (oper status, traffic, counters)
        """
        uplinks = []
        tn = self._connect()
        if not tn: return uplinks
        try:
            # Step 1: Find uplink card slots from 'show card'
            # C320: SMXA  |  C300: SCXN, SCXM, SCXO, HUVQ  |  Also: GICF, GISF
            output = self._send_command(tn, 'show card', timeout=20)
            uplink_slots = []
            for line in output.split('\n'):
                line = line.strip()
                if not line or line.startswith('-') or line.startswith('Rack') or line.startswith('Slot'):
                    continue
                parts = line.split()
                if len(parts) >= 4:
                    try:
                        slot = int(parts[2])
                        cfg_type = parts[3].upper()
                        real_type = parts[4].upper() if len(parts) > 4 and parts[4].isalpha() else ''
                        card_type = real_type if real_type else cfg_type
                        if 'SMXA' in card_type or 'SCXN' in card_type or 'SCXM' in card_type or 'SCXO' in card_type or 'HUVQ' in card_type or 'GICF' in card_type or 'GISF' in card_type:
                            status = parts[-1].upper()
                            port_count = int(parts[5]) if len(parts) > 5 and parts[5].isdigit() else 4
                            uplink_slots.append({'slot': slot, 'ports': port_count, 'status': status})
                    except (ValueError, IndexError):
                        continue

            # Step 1.5: Collect VLAN interface IPs and default gateway
            vlan_ip_map = {}  # vlan_id -> {ip, mask}
            default_gw = ''
            try:
                ip_brief = self._send_command(tn, 'show ip interface brief', timeout=10)
                for line in ip_brief.split('\n'):
                    ls = line.strip()
                    if ls.startswith('vlan') and 'unassigned' not in ls:
                        parts = ls.split()
                        if len(parts) >= 4:
                            vid = parts[0].replace('vlan', '')
                            if vid.isdigit():
                                vlan_ip_map[int(vid)] = {'ip': parts[1], 'mask': parts[2]}
                # Get default gateway from ip route
                route_out = self._send_command(tn, 'show ip route', timeout=10)
                for line in route_out.split('\n'):
                    parts = line.split()
                    if len(parts) >= 4 and parts[0] == '0.0.0.0' and parts[1] == '0.0.0.0':
                        default_gw = parts[2]
                        break
            except Exception as e:
                logger.debug(f"collect_uplinks: ip interface brief failed: {e}")

            # Step 2: For each SMXA slot, get config + stats for each port
            for card in uplink_slots:
                slot = card['slot']
                for port_num in range(1, card['ports'] + 1):
                    for iftype in ['gei', 'xgei']:
                        port_name = f'{iftype}_1/{slot}/{port_num}'

                        # --- Get running-config ---
                        cmd = f'show running-config interface {port_name}'
                        try:
                            cfg_out = self._send_command(tn, cmd, timeout=10)
                            if '%Error' in cfg_out or len(cfg_out.strip()) < 20:
                                continue
                        except Exception:
                            continue

                        info = {
                            'port_name': port_name,
                            'admin_status': 'up',
                            'speed': '',
                            'duplex': 'full',
                            'medium': '',
                            'description': '',
                            'negotiation': 'disable',
                            'flowcontrol': 'disable',
                            'switchport_mode': 'trunk',
                            'vlans_tagged': '',
                            'oper_status': 'down',
                            'line_protocol': 'down',
                            'phy_attribute': '',
                            'linktrap': 'enable',
                            'port_protect': 'disable',
                            'uplink_isolate': 'disable',
                            'port_type': '',
                            'input_rate': '0 Bps',
                            'output_rate': '0 Bps',
                            'input_utilization': '0%',
                            'output_utilization': '0%',
                            'input_packets': 0,
                            'output_packets': 0,
                            'input_bytes': 0,
                            'output_bytes': 0,
                            'crc_errors': 0,
                            'dropped': 0,
                            'ip_vlan_id': 0,
                            'ip_address': '',
                            'ip_mask': '',
                            'ip_gateway': '',
                        }

                        vlan_parts = []
                        for line in cfg_out.split('\n'):
                            ls = line.strip()
                            if ls == 'shutdown':
                                info['admin_status'] = 'down'
                            elif ls == 'no shutdown':
                                info['admin_status'] = 'up'
                            elif ls.startswith('speed '):
                                spd = ls.split()[1] if len(ls.split()) > 1 else ''
                                if spd == '10000': info['speed'] = '10G'
                                elif spd == '1000': info['speed'] = '1G'
                                elif spd == '100': info['speed'] = '100M'
                                else: info['speed'] = spd
                            elif ls.startswith('duplex '):
                                info['duplex'] = ls.split()[1] if len(ls.split()) > 1 else 'full'
                            elif ls.startswith('description '):
                                info['description'] = ls.split(' ', 1)[1] if ' ' in ls else ''
                            elif ls.startswith('hybrid-attribute '):
                                info['medium'] = ls.split()[1] if len(ls.split()) > 1 else ''
                            elif ls.startswith('negotiation '):
                                info['negotiation'] = ls.split()[1] if len(ls.split()) > 1 else 'disable'
                            elif ls.startswith('flowcontrol '):
                                info['flowcontrol'] = ls.split()[1] if len(ls.split()) > 1 else 'disable'
                            elif ls.startswith('switchport mode '):
                                info['switchport_mode'] = ls.split()[2] if len(ls.split()) > 2 else 'trunk'
                            elif ls.startswith('switchport vlan '):
                                v = ls.split('vlan ', 1)[1] if 'vlan ' in ls else ''
                                v = v.replace(' tag', '').strip()
                                if v: vlan_parts.append(v)
                            elif ls.startswith('phy-attribute '):
                                info['phy_attribute'] = ls.split()[1] if len(ls.split()) > 1 else ''
                            elif ls.startswith('linktrap '):
                                info['linktrap'] = ls.split()[1] if len(ls.split()) > 1 else 'enable'
                            elif ls.startswith('port-protect '):
                                info['port_protect'] = ls.split()[1] if len(ls.split()) > 1 else 'disable'
                            elif ls.startswith('uplink-isolate '):
                                info['uplink_isolate'] = ls.split()[1] if len(ls.split()) > 1 else 'disable'

                        info['vlans_tagged'] = ','.join(vlan_parts) if vlan_parts else ''

                        # Match tagged VLANs with VLAN interface IPs
                        for vid_str in vlan_parts:
                            for vid in vid_str.split(','):
                                vid = vid.strip()
                                if vid.isdigit() and int(vid) in vlan_ip_map:
                                    info['ip_vlan_id'] = int(vid)
                                    info['ip_address'] = vlan_ip_map[int(vid)]['ip']
                                    info['ip_mask'] = vlan_ip_map[int(vid)]['mask']
                                    info['ip_gateway'] = default_gw
                                    break

                        # --- Get interface status & stats ---
                        try:
                            intf_out = self._send_command(tn, f'show interface {port_name}', timeout=10)
                            if '%Error' not in intf_out and len(intf_out.strip()) > 20:
                                first_line = intf_out.split('\n')[0].strip() if intf_out.strip() else ''
                                # Parse "xgei_1/3/2 is up, line protocol is up"
                                if 'is up' in first_line.lower():
                                    info['oper_status'] = 'up'
                                else:
                                    info['oper_status'] = 'down'
                                if 'line protocol is up' in first_line.lower():
                                    info['line_protocol'] = 'up'
                                else:
                                    info['line_protocol'] = 'down'
                                # Parse "The port is optical" or "The port is electric"
                                if 'the port is optical' in intf_out.lower():
                                    info['port_type'] = 'optical'
                                elif 'the port is electric' in intf_out.lower():
                                    info['port_type'] = 'electrical'

                                for line in intf_out.split('\n'):
                                    ls = line.strip()
                                    # Parse speed from show interface (e.g. "Speed : 10000" or "Port rate: 10000 Mbps")
                                    if not info['speed']:
                                        m = re.search(r'(?:speed|port rate)\s*[:\s]\s*(\d+)\s*(mbps)?', ls, re.IGNORECASE)
                                        if m:
                                            spd = int(m.group(1))
                                            if spd >= 10000: info['speed'] = '10G'
                                            elif spd >= 1000: info['speed'] = '1G'
                                            elif spd >= 100: info['speed'] = '100M'
                                            else: info['speed'] = str(spd)
                                    # Parse duplex from show interface
                                    if not info['duplex'] or info['duplex'] == 'full':
                                        m = re.search(r'duplex\s*[:\s]\s*(\w+)', ls, re.IGNORECASE)
                                        if m: info['duplex'] = m.group(1).lower()
                                    # Parse medium from show interface
                                    if not info['medium']:
                                        if 'optical' in ls.lower() and 'port' in ls.lower():
                                            info['medium'] = 'fiber'
                                        elif 'electric' in ls.lower() and 'port' in ls.lower():
                                            info['medium'] = 'copper'
                                    # Parse "20 seconds input rate : 9448969 Bps, 7670 pps"
                                    if 'input rate' in ls.lower() and 'seconds' in ls.lower():
                                        m = re.search(r':\s+([\d]+)\s+(Bps|Kbps|Mbps|Gbps)', ls)
                                        if m: info['input_rate'] = f'{m.group(1)} {m.group(2)}'
                                    elif 'output rate' in ls.lower() and 'seconds' in ls.lower():
                                        m = re.search(r':\s+([\d]+)\s+(Bps|Kbps|Mbps|Gbps)', ls)
                                        if m: info['output_rate'] = f'{m.group(1)} {m.group(2)}'
                                    elif 'input' in ls.lower() and 'utilization' in ls.lower():
                                        m = re.search(r'input\s+([\d.]+)%', ls)
                                        if m: info['input_utilization'] = f'{m.group(1)}%'
                                        m2 = re.search(r'output\s+([\d.]+)%', ls)
                                        if m2: info['output_utilization'] = f'{m2.group(1)}%'
                                    elif ls.startswith('Packets') and 'Bytes' in ls:
                                        # Input counters line: Packets : 0  Bytes : 0
                                        p_match = re.search(r'Packets\s*:\s*(\d+)', ls)
                                        b_match = re.search(r'Bytes\s*:\s*(\d+)', ls)
                                        if p_match: info['input_packets'] = int(p_match.group(1))
                                        if b_match: info['input_bytes'] = int(b_match.group(1))
                                    elif 'CRC-ERROR' in ls:
                                        m = re.search(r'CRC-ERROR\s*:\s*(\d+)', ls)
                                        if m: info['crc_errors'] = int(m.group(1))
                                    elif 'Droppeds' in ls or 'Dropped' in ls:
                                        m = re.search(r'Dropped\w*\s*:\s*(\d+)', ls)
                                        if m: info['dropped'] = int(m.group(1))

                        except Exception as e:
                            logger.debug(f'show interface {port_name}: {e}')

                        # --- Get SFP optical module info via Telnet ---
                        # Command: show interface optical-module-info <port_name>
                        # Works for both uplink (xgei/gei) and PON (gpon-olt) ports
                        try:
                            opt_out = self._send_command(tn, f'show interface optical-module-info {port_name}', timeout=10)
                            if '%Error' not in opt_out and '%Invalid' not in opt_out and 'Optical module' in opt_out:
                                def _clean_val(v):
                                    """Remove unit suffixes like (dbm), (km), (v), (mA), (c), (nm)"""
                                    v = re.sub(r'\s*\([^)]*\)\s*$', '', v).strip()
                                    v = re.sub(r'\(dbm\)', '', v, flags=re.IGNORECASE).strip()
                                    v = re.sub(r'\(km\)', '', v, flags=re.IGNORECASE).strip()
                                    v = re.sub(r'\(v\)', '', v, flags=re.IGNORECASE).strip()
                                    v = re.sub(r'\(ma\)', '', v, flags=re.IGNORECASE).strip()
                                    v = re.sub(r'\(c\)', '', v, flags=re.IGNORECASE).strip()
                                    v = re.sub(r'\(nm\)', '', v, flags=re.IGNORECASE).strip()
                                    return v.strip()
                                for line in opt_out.split('\n'):
                                    ls = line.strip()
                                    if not ls or '---' in ls: continue
                                    pairs = re.findall(r'(\S+(?:-\S+)*)\s*:\s*(.+?)(?:\s{2,}|\s*$)', ls)
                                    for key, val in pairs:
                                        key = key.strip().lower()
                                        val = _clean_val(val.strip())
                                        if not val or val == 'N/A': continue
                                        if 'vendor-name' in key: info['sfp_vendor'] = val
                                        elif 'vendor-pn' in key: info['sfp_type'] = val
                                        elif 'vendor-sn' in key: info['sfp_serial'] = val
                                        elif 'module-type' in key and not info.get('sfp_type'): info['sfp_type'] = val
                                        elif 'wavelength' in key: info['sfp_wavelength'] = val
                                        elif 'connector' in key: info['sfp_connector'] = val
                                        elif 'trans-distance' in key: info['sfp_distance'] = val
                                        elif 'rxpower' in key and 'upper' not in key and 'lower' not in key: info['sfp_rx_power'] = val
                                        elif 'txpower' in key and 'upper' not in key and 'lower' not in key: info['sfp_tx_power'] = val
                                        elif 'txbias' in key: info['sfp_bias_current'] = val
                                        elif 'temperature' in key and 'upper' not in key and 'lower' not in key: info['sfp_temperature'] = val
                                        elif 'supply-vol' in key: info['sfp_voltage'] = val
                        except Exception as e:
                            logger.debug(f'optical-module-info {port_name}: {e}')

                        uplinks.append(info)

            tn.write('exit\n'); tn.close()
        except Exception as e:
            logger.error(f"collect_uplinks failed: {e}")
            try: tn.close()
            except: pass
        return uplinks

    def get_ports_traffic_rate(self, port_names):
        """Fetch instantaneous input/output rate (in Mbps) for a list of arbitrary
        port names (uplink gei_x/xgei_x or PON gpon-olt_x) in a single Telnet session.
        Returns dict: {port_name: {'in_mbps': float, 'out_mbps': float}}.
        Works off the '20 seconds input/output rate : X Bps' counters exposed by
        'show interface <port>' on ZTE C320/C300."""
        result = {}
        tn = self._connect()
        if not tn:
            return {pn: {'in_mbps': 0.0, 'out_mbps': 0.0} for pn in port_names}
        try:
            for port_name in port_names:
                in_mbps = out_mbps = 0.0
                try:
                    out = self._send_command(tn, f'show interface {port_name}', timeout=10)
                    if out.strip() and '%Error' not in out:
                        for line in out.split('\n'):
                            ls = line.strip()
                            if 'input rate' in ls.lower():
                                m = re.search(r':\s+([\d.]+)\s+(Bps|Kbps|Mbps|Gbps)', ls, re.IGNORECASE)
                                if m:
                                    in_mbps = _rate_to_mbps(float(m.group(1)), m.group(2))
                            elif 'output rate' in ls.lower():
                                m = re.search(r':\s+([\d.]+)\s+(Bps|Kbps|Mbps|Gbps)', ls, re.IGNORECASE)
                                if m:
                                    out_mbps = _rate_to_mbps(float(m.group(1)), m.group(2))
                except Exception as e:
                    logger.debug(f'get_ports_traffic_rate {port_name}: {e}')
                result[port_name] = {'in_mbps': round(in_mbps, 3), 'out_mbps': round(out_mbps, 3)}
            try:
                tn.write('exit\n')
                tn.close()
            except Exception:
                pass
        except Exception as e:
            logger.error(f'get_ports_traffic_rate failed: {e}')
            try:
                tn.close()
            except Exception:
                pass
        for pn in port_names:
            result.setdefault(pn, {'in_mbps': 0.0, 'out_mbps': 0.0})
        return result

    def get_uplinks_live_traffic(self, port_ids):
        """Fetch live traffic rates for uplink ports in a single Telnet session.
        port_ids: list of (db_id, port_name) tuples
        Returns list of dicts with live rate data for each port.
        """
        result = []
        tn = self._connect()
        if not tn:
            return [{'id': db_id, 'port_name': pn, 'in_rate_str': '0 Bps', 'out_rate_str': '0 Bps',
                     'in_util': '0%', 'out_util': '0%', 'total_in': 0, 'total_out': 0} for db_id, pn in port_ids]
        try:
            for db_id, port_name in port_ids:
                entry = {
                    'id': db_id, 'port_name': port_name,
                    'in_rate_str': '0 Bps', 'out_rate_str': '0 Bps',
                    'in_util': '0%', 'out_util': '0%',
                    'total_in': 0, 'total_out': 0,
                }
                try:
                    out = self._send_command(tn, f'show interface {port_name}', timeout=10)
                    if not out.strip() or '%Error' in out:
                        result.append(entry)
                        continue
                    byte_vals = []  # collect Bytes values in order (input then output)
                    for line in out.split('\n'):
                        ls = line.strip()
                        if 'input rate' in ls.lower() and 'seconds' in ls.lower():
                            m = re.search(r':\s+([\d]+)\s+(Bps|Kbps|Mbps|Gbps)', ls)
                            if m:
                                entry['in_rate_str'] = f'{m.group(1)} {m.group(2)}'
                        elif 'output rate' in ls.lower() and 'seconds' in ls.lower():
                            m = re.search(r':\s+([\d]+)\s+(Bps|Kbps|Mbps|Gbps)', ls)
                            if m:
                                entry['out_rate_str'] = f'{m.group(1)} {m.group(2)}'
                        elif 'utilization' in ls.lower():
                            mi = re.search(r'input\s+([\d.]+)%', ls)
                            if mi:
                                entry['in_util'] = f'{mi.group(1)}%'
                            mo = re.search(r'output\s+([\d.]+)%', ls)
                            if mo:
                                entry['out_util'] = f'{mo.group(1)}%'
                        elif 'Packets' in ls and 'Bytes' in ls:
                            bm = re.search(r'Bytes\s*:\s*(\d+)', ls)
                            if bm:
                                byte_vals.append(int(bm.group(1)))
                    if len(byte_vals) >= 1:
                        entry['total_in'] = byte_vals[0]
                    if len(byte_vals) >= 2:
                        entry['total_out'] = byte_vals[1]
                except Exception:
                    pass
                result.append(entry)
            try:
                tn.write('exit\n')
                tn.close()
            except Exception:
                pass
        except Exception as e:
            logger.error(f'get_uplinks_live_traffic failed: {e}')
            try:
                tn.close()
            except Exception:
                pass
        return result

    def enable_port(self, port_name):
        """Enable a port via CLI: configure terminal > interface <port> > no shutdown"""
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'interface {port_name}\n')
            tn.read_until(b'#', timeout=5)
            tn.write('no shutdown\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            return True, f'Port {port_name} enabled'
        except Exception as e:
            logger.error(f"enable_port {port_name} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def disable_port(self, port_name):
        """Disable a port via CLI: configure terminal > interface <port> > shutdown"""
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'interface {port_name}\n')
            tn.read_until(b'#', timeout=5)
            tn.write('shutdown\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            return True, f'Port {port_name} disabled'
        except Exception as e:
            logger.error(f"disable_port {port_name} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def set_port_description(self, port_name, description):
        """Set port description via CLI"""
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'interface {port_name}\n')
            tn.read_until(b'#', timeout=5)
            if description:
                tn.write(f'description {description}\n')
            else:
                tn.write('no description\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            return True, f'Port {port_name} description updated'
        except Exception as e:
            logger.error(f"set_port_description {port_name} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def configure_port(self, port_name, speed=None, duplex=None, negotiation=None,
                       flowcontrol=None, description=None):
        """Apply multiple port configuration changes in one session.
        CLI syntax (ZTE C320):
          speed 10|100|1000|10000
          duplex full|half
          negotiation auto / no negotiation auto
          flowcontrol enable|disable
          description <text> / no description
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'interface {port_name}\n')
            tn.read_until(b'#', timeout=5)
            cmds = []
            if speed is not None:
                cmds.append(f'speed {speed}')
            if duplex is not None:
                cmds.append(f'duplex {duplex}')
            if negotiation is not None:
                if negotiation == 'auto':
                    cmds.append('negotiation auto')
                else:
                    cmds.append('no negotiation auto')
            if flowcontrol is not None:
                cmds.append(f'flowcontrol {flowcontrol}')
            if description is not None:
                if description:
                    cmds.append(f'description {description}')
                else:
                    cmds.append('no description')

            for cmd in cmds:
                tn.write(cmd + '\n')
                tn.read_until(b'#', timeout=5)

            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.close()
            return True, f'Port {port_name} configured: {", ".join(cmds)}'
        except Exception as e:
            logger.error(f"configure_port {port_name} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def set_uplink_ip(self, port_name, vlan_id, ip_address, ip_mask, gateway=None):
        """Set or remove IP address on a VLAN interface (SVI) tagged on an uplink port.
        CLI syntax (ZTE C320/C300):
          interface vlan <id>
            ip address <ip> <mask>   /   no ip address
          interface <port>
            switchport vlan <id> tag
          ip route 0.0.0.0 0.0.0.0 <gateway>
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)

            if ip_address and ip_mask and vlan_id:
                # Create/configure VLAN interface
                tn.write(f'interface vlan {vlan_id}\n')
                resp = tn.read_until(b'#', timeout=5)
                if b'Error' in resp or b'Invalid' in resp:
                    tn.close()
                    return False, f'Failed to create vlan{vlan_id} interface'
                tn.write(f'ip address {ip_address} {ip_mask}\n')
                tn.read_until(b'#', timeout=5)
                tn.write('exit\n')
                tn.read_until(b'#', timeout=5)

                # Make sure VLAN is tagged on the uplink port
                tn.write(f'interface {port_name}\n')
                tn.read_until(b'#', timeout=5)
                tn.write(f'switchport vlan {vlan_id} tag\n')
                tn.read_until(b'#', timeout=5)
                tn.write('exit\n')
                tn.read_until(b'#', timeout=5)

                # Set default gateway
                if gateway:
                    tn.write(f'ip route 0.0.0.0 0.0.0.0 {gateway}\n')
                    tn.read_until(b'#', timeout=5)
            else:
                # Remove IP from VLAN interface
                if vlan_id:
                    tn.write(f'interface vlan {vlan_id}\n')
                    resp = tn.read_until(b'#', timeout=5)
                    if b'Error' not in resp:
                        tn.write('no ip address\n')
                        tn.read_until(b'#', timeout=5)
                        tn.write('exit\n')
                        tn.read_until(b'#', timeout=5)

            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.close()
            if ip_address:
                return True, f'IP {ip_address}/{ip_mask} set on vlan{vlan_id}, tagged to {port_name}'
            else:
                return True, f'IP removed from vlan{vlan_id}'
        except Exception as e:
            logger.error(f"set_uplink_ip {port_name} vlan{vlan_id} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def set_vlan_trunk(self, port_name, vlan_ids, mode='trunk'):
        """Set VLAN trunk configuration on a port.
        CLI syntax (ZTE C320):
          switchport mode trunk|access|hybrid
          switchport vlan <IDs> tag    — add VLANs (comma-separated)
          no switchport vlan <IDs>     — remove VLANs
        This method removes all current VLANs then adds the specified ones.
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'interface {port_name}\n')
            tn.read_until(b'#', timeout=5)

            # Set mode
            tn.write(f'switchport mode {mode}\n')
            tn.read_until(b'#', timeout=5)

            # Get current VLANs to remove them
            tn.write('show running-config\n')
            cfg = tn.read_until(b'#', timeout=10).decode('utf-8', errors='replace')
            current_vlans = []
            for line in cfg.split('\n'):
                line = line.strip()
                if line.startswith('switchport vlan ') and 'tag' in line:
                    v_part = line.replace('switchport vlan ', '').replace(' tag', '').strip()
                    for v in v_part.split(','):
                        v = v.strip()
                        if v.isdigit():
                            current_vlans.append(v)

            # Remove current VLANs
            if current_vlans:
                tn.write(f'no switchport vlan {",".join(current_vlans)}\n')
                tn.read_until(b'#', timeout=5)

            # Add new VLANs
            if vlan_ids:
                vlans_str = ','.join(vlan_ids)
                tn.write(f'switchport vlan {vlans_str} tag\n')
                tn.read_until(b'#', timeout=5)

            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.close()
            return True, f'Port {port_name} VLAN trunk updated: {",".join(vlan_ids) if vlan_ids else "none"}'
        except Exception as e:
            logger.error(f"set_vlan_trunk {port_name} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def remove_vlan_from_port(self, port_name, vlan_ids):
        """Remove specific VLAN IDs from a port.
        CLI syntax: no switchport vlan <IDs>
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'interface {port_name}\n')
            tn.read_until(b'#', timeout=5)
            vlans_str = ','.join(vlan_ids)
            tn.write(f'no switchport vlan {vlans_str}\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.close()
            return True, f'Removed VLANs {vlans_str} from {port_name}'
        except Exception as e:
            logger.error(f"remove_vlan_from_port {port_name} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def create_vlan(self, vlan_id, vlan_name=''):
        """Create a VLAN.
        CLI: configure terminal > vlan database > vlan <id> [name <name>]
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write('vlan database\n')
            resp = tn.read_until(b'#', timeout=5)
            cmd = f'vlan {vlan_id}'
            if vlan_name:
                cmd += f' name {vlan_name}'
            tn.write(cmd + '\n')
            resp = tn.read_until(b'#', timeout=5)
            resp_str = resp.decode('utf-8', errors='replace')
            logger.info(f"[create_vlan] vlan {vlan_id} response: {resp_str.strip()}")
            if 'Error' in resp_str or 'Invalid' in resp_str or 'incomplete' in resp_str.lower():
                tn.write('exit\n')
                tn.read_until(b'#', timeout=3)
                tn.write('exit\n'); tn.close()
                return False, f'OLT rejected VLAN {vlan_id}: {resp_str.strip()}'
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            return True, f'VLAN {vlan_id} created'
        except Exception as e:
            logger.error(f"create_vlan {vlan_id} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def rename_vlan(self, vlan_id, new_name):
        """Rename a VLAN.
        CLI: configure terminal > vlan database > vlan <id> name <name>
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write('vlan database\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'vlan {vlan_id} name {new_name}\n')
            resp = tn.read_until(b'#', timeout=5)
            resp_str = resp.decode('utf-8', errors='replace')
            logger.info(f"[rename_vlan] vlan {vlan_id} response: {resp_str.strip()}")
            if 'Error' in resp_str or 'Invalid' in resp_str:
                tn.write('exit\n')
                tn.read_until(b'#', timeout=3)
                tn.write('exit\n'); tn.close()
                return False, f'OLT rejected rename: {resp_str.strip()}'
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            return True, f'VLAN {vlan_id} renamed to {new_name}'
        except Exception as e:
            logger.error(f"rename_vlan {vlan_id} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def delete_vlan(self, vlan_id):
        """Delete a VLAN.
        CLI: configure terminal > vlan database > no vlan <id>
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write('vlan database\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'no vlan {vlan_id}\n')
            resp = tn.read_until(b'#', timeout=10)
            resp_str = resp.decode('utf-8', errors='replace')
            logger.info(f"[delete_vlan] vlan {vlan_id} response: {resp_str.strip()}")
            if 'Error' in resp_str or 'Invalid' in resp_str:
                tn.write('exit\n')
                tn.read_until(b'#', timeout=3)
                tn.write('exit\n'); tn.close()
                return False, f'OLT rejected delete: {resp_str.strip()}'
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            return True, f'VLAN {vlan_id} deleted'
        except Exception as e:
            logger.error(f"delete_vlan {vlan_id} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def add_onu_type(self, type_name, pon_type='gpon', description='', max_tcont=8, max_gem=32,
                     max_switch=8, max_flow=32, max_ip_host=5, interfaces=None):
        """Add a new ONU type with full CLI commands.
        CLI sequence:
          configure terminal > pon
          onu-type <name> gpon description <desc>
          onu-type <name> gpon max-tcont <N>
          onu-type <name> gpon max-gemport <N>
          onu-type <name> gpon max-switch-perslot <N>
          onu-type <name> gpon max-flow-perswitch <N>
          onu-type <name> gpon max-iphost <N>
          onu-type-if <name> eth_0/1
          onu-type-if <name> wifi_0/1
          ...
          exit > exit > exit
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write('pon\n')
            tn.read_until(b'#', timeout=5)
            # 1. Create type with description
            cmd = f'onu-type {type_name} {pon_type}'
            if description:
                cmd += f' description {description}'
            tn.write(cmd + '\n')
            out = tn.read_until(b'#', timeout=5).decode('utf-8', errors='replace')
            if 'Error' in out or 'error' in out:
                tn.write('exit\n'); tn.read_until(b'#', timeout=5)
                tn.write('exit\n'); tn.read_until(b'#', timeout=5)
                tn.write('exit\n'); tn.close()
                return False, f'CLI error: {out.strip()[:200]}'
            # 2. Set max-tcont
            if max_tcont:
                tn.write(f'onu-type {type_name} {pon_type} max-tcont {max_tcont}\n')
                tn.read_until(b'#', timeout=5)
            # 3. Set max-gemport
            if max_gem:
                tn.write(f'onu-type {type_name} {pon_type} max-gemport {max_gem}\n')
                tn.read_until(b'#', timeout=5)
            # 4. Set max-switch-perslot
            if max_switch:
                tn.write(f'onu-type {type_name} {pon_type} max-switch-perslot {max_switch}\n')
                tn.read_until(b'#', timeout=5)
            # 5. Set max-flow-perswitch
            if max_flow:
                tn.write(f'onu-type {type_name} {pon_type} max-flow-perswitch {max_flow}\n')
                tn.read_until(b'#', timeout=5)
            # 6. Set max-iphost
            if max_ip_host:
                tn.write(f'onu-type {type_name} {pon_type} max-iphost {max_ip_host}\n')
                tn.read_until(b'#', timeout=5)
            # 7. Add interfaces (onu-type-if)
            if interfaces:
                for iface in interfaces:
                    iface = iface.strip()
                    if iface:
                        tn.write(f'onu-type-if {type_name} {iface}\n')
                        tn.read_until(b'#', timeout=5)
            # Exit: pon > configure > enable
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            return True, f'ONU type {type_name} added'
        except Exception as e:
            logger.error(f"add_onu_type {type_name} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def delete_onu_type(self, type_name):
        """Delete an ONU type.
        CLI: configure terminal > pon > no onu-type <name>
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write('pon\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'no onu-type {type_name}\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            return True, f'ONU type {type_name} deleted'
        except Exception as e:
            logger.error(f"delete_onu_type {type_name} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def create_tcont_profile(self, name, tcont_type='1', max_bw='0'):
        """Create a TCONT profile.
        CLI: configure terminal > gpon > profile tcont <name> type <N> maximum <bw>
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write('gpon\n')
            tn.read_until(b'#', timeout=5)
            cmd = f'profile tcont {name} type {tcont_type}'
            if max_bw and max_bw != '0':
                cmd += f' maximum {max_bw}'
            tn.write(cmd + '\n')
            out = tn.read_until(b'#', timeout=5).decode('utf-8', errors='replace')
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            if 'Successful' in out:
                return True, f'TCONT profile {name} created'
            return False, f'CLI error: {out.strip()[:100]}'
        except Exception as e:
            logger.error(f"create_tcont_profile {name} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def delete_tcont_profile(self, name):
        """Delete a TCONT profile.
        CLI: configure terminal > gpon > no profile tcont <name>
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write('gpon\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'no profile tcont {name}\n')
            out = tn.read_until(b'#', timeout=5).decode('utf-8', errors='replace')
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            if 'Successful' in out or 'ok' in out.lower():
                return True, f'TCONT profile {name} deleted'
            return False, f'CLI error: {out.strip()[:100]}'
        except Exception as e:
            logger.error(f"delete_tcont_profile {name} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def create_traffic_profile(self, name, sir='0', pir='0'):
        """Create a Traffic profile.
        CLI: configure terminal > gpon > profile traffic <name> sir <sir> pir <pir>
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write('gpon\n')
            tn.read_until(b'#', timeout=5)
            cmd = f'profile traffic {name} sir {sir} pir {pir}'
            tn.write(cmd + '\n')
            out = tn.read_until(b'#', timeout=5).decode('utf-8', errors='replace')
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            if 'Successful' in out:
                return True, f'Traffic profile {name} created'
            return False, f'CLI error: {out.strip()[:100]}'
        except Exception as e:
            logger.error(f"create_traffic_profile {name} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def delete_traffic_profile(self, name):
        """Delete a Traffic profile.
        CLI: configure terminal > gpon > no profile traffic <name>
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write('gpon\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'no profile traffic {name}\n')
            out = tn.read_until(b'#', timeout=5).decode('utf-8', errors='replace')
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            if 'Successful' in out or 'ok' in out.lower():
                return True, f'Traffic profile {name} deleted'
            return False, f'CLI error: {out.strip()[:100]}'
        except Exception as e:
            logger.error(f"delete_traffic_profile {name} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def create_wan_ip_profile(self, name, ip_address='', netmask='', gateway='', dns1='', dns2=''):
        """Create a WAN IP profile.
        CLI: configure terminal > gpon > profile wan-ip <name> ipaddress <ip> netmask <mask> gateway <gw>
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write('gpon\n')
            tn.read_until(b'#', timeout=5)
            cmd = f'profile wan-ip {name} ipaddress {ip_address} netmask {netmask} gateway {gateway}'
            if dns1:
                cmd += f' primary-dns {dns1}'
            if dns2:
                cmd += f' secondary-dns {dns2}'
            tn.write(cmd + '\n')
            out = tn.read_until(b'#', timeout=5).decode('utf-8', errors='replace')
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            if 'Successful' in out or '[ok]' in out.lower():
                return True, f'WAN IP profile {name} created'
            return False, f'CLI error: {out.strip()[:100]}'
        except Exception as e:
            logger.error(f"create_wan_ip_profile {name} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def delete_wan_ip_profile(self, name):
        """Delete a WAN IP profile.
        CLI: configure terminal > gpon > no profile wan-ip <name>
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write('gpon\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'no profile wan-ip {name}\n')
            out = tn.read_until(b'#', timeout=5).decode('utf-8', errors='replace')
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            if 'Successful' in out or 'ok' in out.lower():
                return True, f'WAN IP profile {name} deleted'
            return False, f'CLI error: {out.strip()[:100]}'
        except Exception as e:
            logger.error(f"delete_wan_ip_profile {name} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def collect_pon_port_stats(self, slot):
        """Collect per-port PON port info including ONU stats and config.
        Uses:
        - 'show gpon onu state gpon-olt_1/<slot>/<port>' for ONU counts (GPON)
        - 'show epon onu state epon-olt_1/<slot>/<port>' for ONU counts (EPON)
        - 'show running-config interface gpon-olt_1/<slot>/<port>' for port config
        Returns list of dicts."""
        ports = []
        tn = self._connect()
        if not tn: return ports
        try:
            output = self._send_command(tn, 'show card', timeout=10)
            port_count = 16  # default
            is_epon_card = False
            for line in output.split('\n'):
                line = line.strip()
                parts = line.split()
                if len(parts) >= 6:
                    try:
                        s = int(parts[2])
                        if s == slot:
                            pc = parts[5]
                            if pc.isdigit():
                                port_count = int(pc)
                            cfg_type = parts[3].upper() if len(parts) > 3 else ''
                            if cfg_type.startswith('ETG'):
                                is_epon_card = True
                    except (ValueError, IndexError):
                        continue

            prefix = 'epon-olt' if is_epon_card else 'gpon-olt'
            onu_cmd = 'show epon onu state' if is_epon_card else 'show gpon onu state'

            for port_num in range(1, port_count + 1):
                port_info = {
                    'port_number': port_num,
                    'port_name': f'{prefix}_1/{slot}/{port_num}',
                    'admin_status': 'up',
                    'name': '',
                    'description': '',
                    'linktrap': 'disable',
                    'onu_count': 0,
                    'onu_online': 0,
                    'onu_offline': 0,
                }
                try:
                    # Get ONU state counts
                    cmd = f'{onu_cmd} {prefix}_1/{slot}/{port_num}'
                    out = self._send_command(tn, cmd, timeout=10)
                    total = online = offline = dyinggasp = 0
                    for line in out.split('\n'):
                        line = line.strip()
                        if not line or '---' in line or line.startswith('OnuIndex'): continue
                        # Skip summary line like "ONU Number: 39/40"
                        if line.startswith('ONU'): continue
                        parts = line.split()
                        if len(parts) < 4 or '/' not in parts[0] or ':' not in parts[0]: continue
                        import re as _re
                        if is_epon_card:
                            # EPON format: epon-onu_1/2/2:1  online  ...  MAC
                            if not _re.match(r'^epon-onu_\d+/\d+/\d+:\d+$', parts[0]): continue
                            total += 1
                            status_word = parts[1].lower() if len(parts) > 1 else ''
                            if 'online' in status_word:
                                online += 1
                            elif 'dying' in status_word:
                                dyinggasp += 1
                                offline += 1
                            else:
                                offline += 1
                        else:
                            # GPON format: 1/1/1:1  ...  ready
                            if not _re.match(r'^\d+/\d+/\d+:\d+$', parts[0]): continue
                            total += 1
                            phase = parts[3].lower() if len(parts) > 3 else ''
                            if 'working' in phase:
                                online += 1
                            elif 'dyinggasp' in phase:
                                dyinggasp += 1
                                offline += 1
                            else:
                                offline += 1
                    port_info['onu_count'] = total
                    port_info['onu_online'] = online
                    port_info['onu_offline'] = offline
                except Exception as e:
                    logger.debug(f'pon state {slot}/{port_num}: {e}')

                try:
                    # Get port config
                    cmd = f'show running-config interface {prefix}_1/{slot}/{port_num}'
                    out = self._send_command(tn, cmd, timeout=10)
                    if '%Error' not in out and len(out.strip()) > 20:
                        for line in out.split('\n'):
                            ls = line.strip()
                            if ls == 'shutdown':
                                port_info['admin_status'] = 'down'
                            elif ls == 'no shutdown':
                                port_info['admin_status'] = 'up'
                            elif ls.startswith('name ') and not ls.startswith('name onu'):
                                port_info['name'] = ls.split(' ', 1)[1] if ' ' in ls else ''
                            elif ls.startswith('description '):
                                port_info['description'] = ls.split(' ', 1)[1] if ' ' in ls else ''
                            elif ls.startswith('linktrap enable'):
                                port_info['linktrap'] = 'enable'
                            elif ls.startswith('linktrap disable'):
                                port_info['linktrap'] = 'disable'
                except Exception as e:
                    logger.debug(f'pon config {slot}/{port_num}: {e}')

                # Get optical module info for this PON port
                try:
                    pon_name = f'{prefix}_1/{slot}/{port_num}'
                    opt_out = self._send_command(tn, f'show interface optical-module-info {pon_name}', timeout=10)
                    if '%Error' not in opt_out and 'Optical module' in opt_out:
                        def _clean_pon_val(v):
                            v = re.sub(r'\s*\([^)]*\)\s*$', '', v).strip()
                            v = re.sub(r'\(dbm\)', '', v, flags=re.IGNORECASE).strip()
                            v = re.sub(r'\(km\)', '', v, flags=re.IGNORECASE).strip()
                            v = re.sub(r'\(v\)', '', v, flags=re.IGNORECASE).strip()
                            v = re.sub(r'\(ma\)', '', v, flags=re.IGNORECASE).strip()
                            v = re.sub(r'\(c\)', '', v, flags=re.IGNORECASE).strip()
                            v = re.sub(r'\(nm\)', '', v, flags=re.IGNORECASE).strip()
                            return v.strip()
                        for line in opt_out.split('\n'):
                            ls = line.strip()
                            if not ls: continue
                            pairs = re.findall(r'(\S+(?:-\S+)*)\s*:\s*(.+?)(?:\s{2,}|\s*$)', ls)
                            for key, val in pairs:
                                key = key.strip().lower()
                                val = _clean_pon_val(val.strip())
                                if not val or val == 'N/A': continue
                                if 'vendor-name' in key: port_info['sfp_vendor'] = val
                                elif 'vendor-pn' in key: port_info['sfp_type'] = val
                                elif 'vendor-sn' in key: port_info['sfp_serial'] = val
                                elif 'wavelength' in key: port_info['sfp_wavelength'] = val
                                elif 'connector' in key: port_info['sfp_connector'] = val
                                elif 'trans-distance' in key: port_info['sfp_distance'] = val
                                elif 'txpower' in key and 'upper' not in key and 'lower' not in key: port_info['sfp_tx_power'] = val
                                elif 'temperature' in key and 'upper' not in key and 'lower' not in key: port_info['sfp_temperature'] = val
                                elif 'supply-vol' in key: port_info['sfp_voltage'] = val
                                elif 'txbias' in key: port_info['sfp_bias_current'] = val
                                elif 'rxpower' in key and 'upper' not in key and 'lower' not in key: port_info['sfp_rx_power'] = val
                except Exception as e:
                    logger.debug(f'pon optical-module-info {slot}/{port_num}: {e}')

                ports.append(port_info)

            tn.write('exit\n'); tn.close()
        except Exception as e:
            logger.error(f"collect_pon_port_stats slot {slot} failed: {e}")
            try: tn.close()
            except: pass
        return ports

    def toggle_pon_port(self, port_name, enable=True):
        """Enable or disable a PON port.
        CLI: configure terminal > interface gpon-olt_1/1/1 > no shutdown | shutdown
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'interface {port_name}\n')
            tn.read_until(b'#', timeout=5)
            tn.write(('no shutdown' if enable else 'shutdown') + '\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            return True, f'PON port {port_name} {"enabled" if enable else "disabled"}'
        except Exception as e:
            logger.error(f"toggle_pon_port {port_name} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def set_pon_port_name(self, port_name, new_name):
        """Set PON port alias name.
        CLI: configure terminal > interface gpon-olt_1/1/1 > name <text>
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'interface {port_name}\n')
            tn.read_until(b'#', timeout=5)
            if new_name:
                tn.write(f'name {new_name}\n')
            else:
                tn.write('no name\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            return True, f'PON port {port_name} name updated'
        except Exception as e:
            logger.error(f"set_pon_port_name {port_name} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def set_pon_port_description(self, port_name, description):
        """Set PON port description.
        CLI: configure terminal > interface gpon-olt_1/1/1 > description <text>
        """
        tn = self._connect()
        if not tn: return False, 'Telnet connection failed'
        try:
            tn.write('configure terminal\n')
            tn.read_until(b'#', timeout=5)
            tn.write(f'interface {port_name}\n')
            tn.read_until(b'#', timeout=5)
            if description:
                tn.write(f'description {description}\n')
            else:
                tn.write('no description\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n')
            tn.read_until(b'#', timeout=5)
            tn.write('exit\n'); tn.close()
            return True, f'PON port {port_name} description updated'
        except Exception as e:
            logger.error(f"set_pon_port_description {port_name} failed: {e}")
            try: tn.close()
            except: pass
            return False, str(e)

    def collect_onu_detail(self, frame, slot, port, onu_id, is_epon=False):
        """Collect ALL ONU data using ZTE C320 Telnet commands.

        Key discovery: ZTE C320 stores ONU config in TWO sections of 'show running-config':
          1. interface gpon-onu_X/Y/Z:N — tcont, gemport, service-port, name, description
          2. pon-onu-mng gpon-onu_X/Y/Z:N — service-to-vlan mapping, VEIP mode,
             eth_0/N vlan mode, wifi_0/N vlan mode, tr069-mgmt

        R-Config reads BOTH sections. We must do the same.
        For EPON ONUs, only running-config is available (no detail-info/equip).
        """
        result = {}
        tn = self._connect()
        if not tn: return result
        try:
            prefix = 'epon-onu' if is_epon else 'gpon-onu'
            olt_prefix = 'epon-olt' if is_epon else 'gpon-olt'
            iface = f'{prefix}_{frame}/{slot}/{port}:{onu_id}'
            olt_iface = f'{olt_prefix}_{frame}/{slot}/{port}'

            if is_epon:
                # EPON: only running-config is available — parse name/desc/service-port
                cfg = self._send_command(tn, f'show running-config interface {iface}', timeout=12)
                result['raw_config'] = cfg.strip()
                for line in cfg.split('\n'):
                    ls = line.strip()
                    if ls.startswith('property description'):
                        desc_raw = ls.split('description', 1)[1].strip() if 'description' in ls else ''
                        if desc_raw:
                            parts = desc_raw.split('$$')
                            parts = [p.strip() for p in parts if p.strip()]
                            if len(parts) >= 2:
                                result['name'] = parts[0]
                                result['description'] = parts[1]
                            elif len(parts) == 1:
                                result['name'] = parts[0]
                tn.write('exit\n'); tn.close()
                return result

            # ── 1. detail-info: name, status, distance, power, history ──
            output = self._send_command(tn, f'show gpon onu detail-info {iface}', timeout=15)
            in_history = False
            for line in output.split('\n'):
                ls = line.strip()
                if '------' in ls:
                    in_history = True
                    continue
                if in_history:
                    hm = re.match(r'\s*\d+\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*(.*)', ls)
                    if hm:
                        offline_time = hm.group(2).strip()
                        cause = hm.group(3).strip() or 'Online'
                        # Match R-Config: show all entries including 0000-00-00
                        if '0000-00-00' in offline_time:
                            # ONU is currently online — show with cause as "-"
                            result.setdefault('history_raw', []).append({'timestamp': hm.group(1).strip(), 'status': '-'})
                        else:
                            result.setdefault('history_raw', []).append({'timestamp': offline_time, 'status': cause})
                    continue
                if ':' in ls:
                    key = ls.split(':', 1)[0].strip()
                    val = ls.split(':', 1)[1].strip()
                    if key == 'Name': result['name'] = val
                    elif key == 'Type': result['onu_type'] = val
                    elif key == 'State': result['state'] = val
                    elif key == 'Admin state': result['admin_state'] = val
                    elif key == 'Phase state': result['phase_state'] = val
                    elif key == 'Config state': result['config_state'] = val
                    elif key == 'Authentication mode': result['auth_mode'] = val
                    elif key == 'Serial number': result['serial'] = val
                    elif key == 'Description': result['description'] = val
                    elif key == 'ONU Distance':
                        dm = re.search(r'(\d+)', val)
                        result['distance_m'] = int(dm.group(1)) if dm else 0
                    elif key == 'Online Duration': result['online_duration'] = val
                    elif key in ('RX Power', 'Rx Power'):
                        pm = re.search(r'[-]?[\d.]+', val)
                        if pm: result['rx_power'] = float(pm.group())
                    elif key in ('TX Power', 'Tx Power'):
                        pm = re.search(r'[-]?[\d.]+', val)
                        if pm: result['tx_power'] = float(pm.group())
                    elif key == 'FEC': result['fec'] = val
                    elif key == 'DBA Mode': result['dba_mode'] = val

            # ── 2. remote-onu equip: model, actual_type ──
            equip = self._send_command(tn, f'show gpon remote-onu equip {iface}', timeout=10)
            if 'Error' not in equip and 'Invalid' not in equip:
                for line in equip.split('\n'):
                    ls = line.strip()
                    if ':' in ls:
                        k = ls.split(':', 1)[0].strip()
                        v = ls.split(':', 1)[1].strip()
                        if k == 'Equipment ID': result['actual_type'] = v
                        elif k == 'Vendor ID': result['vendor_id'] = v
                        elif k == 'Model': result['model'] = v

            # ── 2b. Get RX/TX power via Telnet (show pon power attenuation) ──
            # This is the most accurate source, matching R-Config Get Status.
            # ZTE C320 V2.1.0 detail-info does NOT report RX/TX Power fields.
            # Run if either rx_power (OLT RX) or onu_rx_power (ONU RX) is missing.
            if 'rx_power' not in result or 'onu_rx_power' not in result:
                try:
                    opt_out = self._send_command(tn, f'show pon power attenuation {iface}', timeout=10)
                    if opt_out and 'Error' not in opt_out and 'Incomplete' not in opt_out:
                        for line in opt_out.split('\n'):
                            ls = line.strip()
                            ll = ls.lower()
                            if ll.startswith('up'):
                                rx_m = re.search(r'Rx\s*:\s*([-]?\d+\.?\d*)', ls)
                                tx_m = re.search(r'Tx\s*:\s*([-]?\d+\.?\d*)', ls)
                                if rx_m:
                                    result['rx_power'] = float(rx_m.group(1))      # OLT RX (upstream)
                                if tx_m:
                                    result['tx_power'] = float(tx_m.group(1))       # ONU TX (upstream)
                            elif ll.startswith('down'):
                                rx_m = re.search(r'Rx\s*:\s*([-]?\d+\.?\d*)', ls)
                                tx_m = re.search(r'Tx\s*:\s*([-]?\d+\.?\d*)', ls)
                                if rx_m:
                                    result['onu_rx_power'] = float(rx_m.group(1))   # ONU RX (downstream)
                                if tx_m:
                                    pass  # OLT TX not stored in DB
                except Exception:
                    pass

            # ── 2c. SNMP fallback if Telnet power attenuation didn't work ──
            if 'rx_power' not in result or 'onu_rx_power' not in result:
                try:
                    import asyncio as _aio
                    from pysnmp.hlapi.v1arch.asyncio import Slim as _Slim, ObjectType as _OT, ObjectIdentity as _OI
                    BOARD1_BASE = 268500992
                    PON_INCREMENT = 256
                    pon_index = BOARD1_BASE + port * PON_INCREMENT
                    oid_onu_rx = f'1.3.6.1.4.1.3902.1012.3.50.12.1.1.10.{pon_index}.{onu_id}.1'
                    oid_tx = f'1.3.6.1.4.1.3902.1012.3.50.12.1.1.11.{pon_index}.{onu_id}.1'
                    oid_olt_rx = f'1.3.6.1.4.1.3902.1012.3.50.12.1.1.18.{pon_index}.{onu_id}.1'
                    async def _get_signal():
                        slim = _Slim(1)
                        try:
                            ei, es, eidx, vb = await slim.get(
                                'public', self.ip, 161,
                                _OT(_OI(oid_onu_rx)),
                                _OT(_OI(oid_tx)),
                                _OT(_OI(oid_olt_rx)),
                                timeout=5, retries=2)
                            if not ei and not es:
                                return (int(vb[0][1]), int(vb[1][1]), int(vb[2][1]))
                        finally:
                            slim.close()
                        return None
                    loop = _aio.new_event_loop()
                    try:
                        sig = loop.run_until_complete(_get_signal())
                        if sig:
                            olt_rx_val = decode_rx_power(sig[2])  # OLT RX (OID .18) — WRONG on V2.1.0, fallback only
                            onu_rx_val = decode_rx_power(sig[0])  # ONU RX (OID .10) — correct
                            tx_val = decode_rx_power(sig[1])      # TX (OID .11)
                            # Only fill rx_power from SNMP if Telnet didn't provide it.
                            # OID .18 value will be inaccurate but better than None for offline ONUs.
                            if 'rx_power' not in result and olt_rx_val is not None:
                                result['rx_power'] = olt_rx_val
                            if 'onu_rx_power' not in result and onu_rx_val is not None:
                                result['onu_rx_power'] = onu_rx_val
                            if 'tx_power' not in result and tx_val is not None:
                                result['tx_power'] = tx_val
                    finally:
                        loop.close()
                except Exception:
                    pass  # SNMP fallback failed, keep rx_power absent

            # ── 3. running-config: use per-interface command (fast) + fallback ──
            # 'show running-config interface {iface}' works on all firmware
            cfg_interface = self._send_command(tn, f'show running-config interface {iface}', timeout=15)

            # 'show running-config pon-onu-mng {iface}' does NOT work on V2.1.0
            # Try it first (fast on newer firmware), fall back to full running-config
            cfg_ponmng = self._send_command(tn, f'show running-config pon-onu-mng {iface}', timeout=15)
            if '%Error' in cfg_ponmng or 'Invalid' in cfg_ponmng:
                # Fallback: full running-config, extract only pon-onu-mng section
                global_cfg = self._send_command(tn, 'show running-config', timeout=30)
                cfg_ponmng = ''
                in_section = False
                for line in global_cfg.split('\n'):
                    ls = line.strip()
                    if ls == f'pon-onu-mng {iface}':
                        in_section = True
                        cfg_ponmng += line + '\n'
                        continue
                    elif in_section and (ls.startswith('pon-onu-mng ') or ls == '!' or ls == 'end'):
                        if ls == '!':
                            cfg_ponmng += line + '\n'
                        in_section = False
                        continue
                    if in_section:
                        cfg_ponmng += line + '\n'

            result['running_config_raw'] = cfg_interface.strip()
            result['ponmng_config_raw'] = cfg_ponmng.strip()

            # ── 4. Parse interface section: tcont, gemport, service-port ──
            result['services'] = []
            result['tcont_profiles'] = []
            result['gemports'] = []
            result['wan_services'] = {'service1': {}, 'service2': {}, 'service3': {}, 'service4': {}}
            wan_svc_idx = 0

            for line in cfg_interface.split('\n'):
                ls = line.strip()
                if not ls or ls.startswith('!') or ls.startswith('end') or ls.startswith('interface'):
                    continue
                if ls.startswith('service-port '):
                    result['services'].append(ls)
                    parts = ls.split()
                    svc = {}
                    for i, p in enumerate(parts):
                        if p == 'vport' and i+1 < len(parts): svc['vport'] = parts[i+1]
                        elif p == 'user-vlan' and i+1 < len(parts): svc['user_vlan'] = parts[i+1]
                        elif p == 'vlan' and i+1 < len(parts): svc['vlan'] = parts[i+1]
                        elif p == 'gemport' and i+1 < len(parts): svc['gemport'] = parts[i+1]
                    if wan_svc_idx < 4:
                        result['wan_services'][f'service{wan_svc_idx+1}'] = svc
                        wan_svc_idx += 1
                elif ls.startswith('tcont '):
                    result['tcont_profiles'].append(ls)
                elif ls.startswith('gemport '):
                    result['gemports'].append(ls)

            # ── 5. Parse pon-onu-mng section ──
            # This is the GOLDEN source for VEIP mode, WiFi, Ethernet, TR069, WAN mode
            result['veip_entries'] = []
            result['tr069_entries'] = []
            result['wifi_entries'] = []
            result['eth_entries'] = []
            result['remote_access'] = []
            wan_ip_mode = None  # Track wan-ip config from pon-onu-mng
            pppoe_mode = None   # Track pppoe config from pon-onu-mng
            has_veip_vlan = False  # Track if veip has vlan port config
            eth_by_port = {}  # Dedup: keep last entry per port number
            eth_locked_ports = set()  # Track locked ports (processed after vlan lines)

            # Fix line wrapping: join continuation lines (non-indented lines that aren't section headers)
            cfg_ponmng_fixed = self._join_wrapped_lines(cfg_ponmng)

            for line in cfg_ponmng_fixed.split('\n'):
                ls = line.strip()
                if not ls or ls.startswith('!') or ls.startswith('pon-onu-mng'):
                    continue

                # vlan port veip_1 mode hybrid
                if ls.startswith('vlan port veip'):
                    m = re.match(r'vlan port veip_(\d+)\s+mode\s+(\S+)', ls)
                    if m:
                        has_veip_vlan = True
                        result['veip_entries'].append({
                            'veip_id': m.group(1),
                            'status': 'UP',
                            'mode': m.group(2).capitalize(),
                            'vlan': '',
                            'priority': '0',
                            'iana': 'N/A'
                        })

                # vlan port eth_0/1 mode tag vlan 30
                elif ls.startswith('vlan port eth_'):
                    m = re.match(r'vlan port eth_0/(\d+)\s+mode\s+(\S+)(?:\s+vlan\s+(\S+))?', ls)
                    if m:
                        port_num = m.group(1)
                        mode = m.group(2)
                        vlan = m.group(3) or ''
                        # Keep only the LAST entry per port (dedup duplicate lines)
                        eth_by_port[port_num] = {
                            'gemport': port_num,
                            'status': 'up',
                            'mode': 'Access' if mode == 'tag' else mode.capitalize(),
                            'access_vlan': vlan or '--',
                            'dhcp_mode': 'Auto',
                            'changes': '0'
                        }

                # interface eth eth_0/2 state lock  (detect locked/disabled ports)
                elif ls.startswith('interface eth eth_0/') and 'state lock' in ls:
                    m = re.match(r'interface eth eth_0/(\d+)\s+state\s+lock', ls)
                    if m:
                        eth_locked_ports.add(m.group(1))

                # ssid ctrl wifi_0/1 name MySSID — actual SSID name set via OMCI
                elif ls.startswith('ssid ctrl wifi_'):
                    m = re.match(r'ssid ctrl wifi_0/(\d+)\s+name\s+(.+)', ls)
                    if m:
                        wifi_num = m.group(1)
                        ssid_name = m.group(2).strip()
                        # Update existing entry or create new one
                        existing = next((w for w in result['wifi_entries'] if w.get('wifi_num') == wifi_num), None)
                        if existing:
                            existing['ssid_name'] = ssid_name
                        else:
                            result['wifi_entries'].append({
                                'wifi_num': wifi_num,
                                'ssid_name': ssid_name,
                                'status': 'up',
                                'mode': 'DHCP From Onu',
                                'vlan': '',
                                'priority': '0'
                            })

                # vlan port wifi_0/1 mode tag vlan 30
                elif ls.startswith('vlan port wifi_'):
                    m = re.match(r'vlan port wifi_0/(\d+)\s+mode\s+(\S+)(?:\s+vlan\s+(\S+))?', ls)
                    if m:
                        wifi_num = m.group(1)
                        mode = m.group(2)
                        vlan = m.group(3) or ''
                        wifi_mode = 'Access' if mode in ('tag', 'tagged') else 'DHCP From Onu'
                        # Update existing entry (from ssid ctrl) or create new
                        existing = next((w for w in result['wifi_entries'] if w.get('wifi_num') == wifi_num), None)
                        if existing:
                            existing['mode'] = wifi_mode
                            if vlan:
                                existing['vlan'] = vlan
                        else:
                            result['wifi_entries'].append({
                                'wifi_num': wifi_num,
                                'ssid_name': f'Wifi {wifi_num}',
                                'status': 'up',
                                'mode': wifi_mode,
                                'vlan': vlan or '',
                                'priority': '0'
                            })

                # vlan port wifi_0/1 priority 5
                elif ls.startswith('vlan port wifi_') and 'priority' in ls:
                    m = re.match(r'vlan port wifi_0/(\d+)\s+priority\s+(\d+)', ls)
                    if m:
                        wifi_num = m.group(1)
                        pri = m.group(2)
                        existing = next((w for w in result['wifi_entries'] if w.get('wifi_num') == wifi_num), None)
                        if existing:
                            existing['priority'] = pri

                # ssid auth wpa wifi_0/1 encrypt aes key fatimah1 — ZTE typical format (WPA2-PSK implied)
                # ssid auth wpa wifi_0/1 wpa2-psk — explicit auth type (some firmware versions)
                # ssid auth wpa wifi_0/1 encrypt aes — encryption only (no key = no password set)
                # ssid auth wpa wifi_0/1 key MyPassword — password on separate line
                # ssid auth wpa wifi_0/1 no-auth — open auth (no password)
                # ssid auth wep wifi_0/2 open-system — WEP open-system (also open auth)
                elif ls.startswith('ssid auth ') and 'wifi_' in ls:
                    m = re.match(r'ssid auth (\w+) wifi_0/(\d+)\s+(.*)', ls)
                    if m:
                        auth_proto = m.group(1)  # 'wpa' or 'wep'
                        wifi_num = m.group(2)
                        rest = m.group(3).strip()
                        existing = next((w for w in result['wifi_entries'] if w.get('wifi_num') == wifi_num), None)
                        if existing:
                            first_word = rest.split()[0] if rest.split() else ''
                            # Auth type detection — normalize to canonical values
                            if first_word in ('wpa2-psk', 'wpa-psk', 'wpa-wpa2-psk'):
                                existing['ssid_auth_type'] = first_word
                            elif first_word in ('no-auth', 'open', 'open-system'):
                                existing['ssid_auth_type'] = 'open'
                            elif first_word in ('encrypt', 'key') or not first_word:
                                # ZTE typical: 'ssid auth wpa wifi_0/N encrypt aes key PASS'
                                # No explicit auth mode → WPA with AES = WPA2-PSK
                                if auth_proto == 'wpa':
                                    existing['ssid_auth_type'] = existing.get('ssid_auth_type', 'wpa2-psk')
                                elif auth_proto == 'wep':
                                    existing['ssid_auth_type'] = 'open'
                            # Password: "encrypt aes key MyPassword" (combined) or "key MyPassword" (separate)
                            km = re.match(r'encrypt\s+\S+\s+key\s+(.+)', rest)
                            if km:
                                existing['ssid_password'] = km.group(1).strip()
                            else:
                                km2 = re.match(r'key\s+(.+)', rest)
                                if km2:
                                    existing['ssid_password'] = km2.group(1).strip()

                # tr069-mgmt 1 state unlock
                elif ls.startswith('tr069-mgmt') and 'state' in ls and 'acs' not in ls:
                    m = re.match(r'tr069-mgmt\s+(\d+)\s+state\s+(\S+)', ls)
                    if m:
                        result.setdefault('_tr069_state', {})[m.group(1)] = m.group(2)

                # tr069-mgmt 1 acs http://... validate basic username acs password acs
                elif ls.startswith('tr069-mgmt') and 'acs' in ls:
                    m = re.match(r'tr069-mgmt\s+(\d+)\s+acs\s+(\S+)\s+validate\s+\S+\s+username\s+(\S+)\s+password\s+(.+)', ls)
                    if m:
                        tid = m.group(1)
                        state = result.get('_tr069_state', {}).get(tid, 'unlock')
                        result['tr069_entries'].append({
                            'veip_id': tid,
                            'acs_url': m.group(2),
                            'username': m.group(3),
                            'password': m.group(4).strip(),
                            'vlan': 'untag',
                            'admin_status': state
                        })

                # service VLAN0030 gemport 1 iphost 1 vlan 30
                elif ls.startswith('service ') and 'gemport' in ls:
                    m = re.match(r'service\s+(\S+)\s+gemport\s+(\d+)', ls)
                    if m:
                        result.setdefault('ponmng_services', []).append({
                            'service_number': m.group(1),
                            'gem_port': m.group(2),
                        })

                # wan-ip 1 mode dhcp vlan-profile genieacs host 1
                # wan-ip 1 mode pppoe vlan-profile pppoe host 1
                elif ls.startswith('wan-ip '):
                    m = re.match(r'wan-ip\s+(\d+)\s+mode\s+(\S+)', ls)
                    if m:
                        svc_num = m.group(1)
                        mode = m.group(2)
                        wan_ip_mode = {'svc_num': svc_num, 'mode': mode}
                        vp = re.search(r'vlan-profile\s+(\S+)', ls)
                        if vp: wan_ip_mode['vlan_profile'] = vp.group(1)
                        host = re.search(r'host\s+(\S+)', ls)
                        if host: wan_ip_mode['host'] = host.group(1)

                # pppoe 1 nat enable user server2 password salfanet
                elif ls.startswith('pppoe '):
                    m = re.match(r'pppoe\s+(\d+)\s+nat\s+(\S+)\s+user\s+(\S+)\s+password\s+(\S+)', ls)
                    if m:
                        pppoe_mode = {
                            'host_id': m.group(1),
                            'nat': m.group(2),
                            'username': m.group(3),
                            'password': m.group(4),
                        }

            # ── 6. Use remote-onu commands as primary/enrichment data ──
            # VEIP: remote-onu veip is primary source for status + IANA
            veip_out = self._send_command(tn, f'show gpon remote-onu veip {iface}', timeout=10)
            if veip_out.strip() and 'Error' not in veip_out and 'Invalid' not in veip_out and 'No relate' not in veip_out:
                veip_admin = 'unlock'
                veip_iana = 'N/A'
                for line in veip_out.split('\n'):
                    ls = line.strip()
                    if ':' in ls:
                        k = ls.split(':', 1)[0].strip()
                        v = ls.split(':', 1)[1].strip()
                        if k == 'Admin status': veip_admin = v
                        elif k == 'IANA assigned port' and v and v.lower() != 'none': veip_iana = v
                if not result['veip_entries']:
                    # No vlan port veip in pon-onu-mng → mode = N/A (R-Config shows N/A)
                    result['veip_entries'].append({
                        'veip_id': '1', 'status': 'UP' if veip_admin == 'unlock' else 'DOWN',
                        'mode': 'N/A', 'vlan': '', 'priority': '0', 'iana': veip_iana
                    })
                else:
                    result['veip_entries'][0]['status'] = 'UP' if veip_admin == 'unlock' else 'DOWN'
                    result['veip_entries'][0]['iana'] = veip_iana

            # TR069: always use remote-onu as primary source (even if disabled/lock)
            tr069_out = self._send_command(tn, f'show gpon remote-onu tr069 {iface}', timeout=10)
            if tr069_out.strip() and 'Error' not in tr069_out and 'Invalid' not in tr069_out:
                t9 = {}
                for line in tr069_out.split('\n'):
                    ls = line.strip()
                    if ':' in ls:
                        k = ls.split(':', 1)[0].strip()
                        v = ls.split(':', 1)[1].strip()
                        if k == 'Admin status': t9['admin_status'] = v
                        elif k == 'ACS': t9['acs_url'] = v
                        elif k == 'Username': t9['username'] = v
                        elif k == 'Password': t9['password'] = v
                        elif k == 'Tag':
                            # Format: "priority : 0, vlan : 1010" or "untag"
                            if 'vlan' in v.lower() and 'priority' in v.lower():
                                # Parse "priority : 0, vlan : 1010"
                                import re as _re
                                vlan_m = _re.search(r'vlan\s*:\s*(\d+)', v, _re.IGNORECASE)
                                pri_m = _re.search(r'priority\s*:\s*(\d+)', v, _re.IGNORECASE)
                                t9['vlan'] = vlan_m.group(1) if vlan_m else 'untag'
                                t9['priority'] = pri_m.group(1) if pri_m else '0'
                            else:
                                t9['vlan'] = 'untag'
                                t9['priority'] = '0'
                if result['tr069_entries']:
                    result['tr069_entries'][0]['admin_status'] = t9.get('admin_status', 'unlock')
                    result['tr069_entries'][0]['vlan'] = t9.get('vlan', 'untag')
                    result['tr069_entries'][0]['priority'] = t9.get('priority', '0')
                    if t9.get('acs_url'):
                        result['tr069_entries'][0]['acs_url'] = t9['acs_url']
                    if t9.get('username'):
                        result['tr069_entries'][0]['username'] = t9['username']
                    if t9.get('password'):
                        result['tr069_entries'][0]['password'] = t9['password']
                else:
                    result['tr069_entries'].append({
                        'veip_id': '1',
                        'acs_url': t9.get('acs_url', '') or '',
                        'username': t9.get('username', '') or '',
                        'password': t9.get('password', '') or '',
                        'vlan': t9.get('vlan', 'untag') or 'untag',
                        'priority': t9.get('priority', '0') or '0',
                        'admin_status': t9.get('admin_status', 'unlock') or 'unlock'
                    })

            # ── 8. Build WAN service details ──
            # Parse tcont profiles from interface section
            tcont_map = {}  # tcont_id -> profile_name
            tcont_name_map = {}  # tcont_id -> service_name
            gem_tcont = {}  # gem_id -> tcont_id
            gem_downstream = {}  # gem_id -> downstream_profile

            for l in cfg_interface.split('\n'):
                ls = l.strip()
                # tcont 1 name VLAN0030 profile UP-PPPOE
                m = re.match(r'tcont\s+(\d+)\s+name\s+(\S+)\s+profile\s+(\S+)', ls)
                if m:
                    tcont_name_map[m.group(1)] = m.group(2)
                    tcont_map[m.group(1)] = m.group(3)
                    continue
                # tcont 1 profile UP-PPPOE (no name)
                m = re.match(r'tcont\s+(\d+)\s+profile\s+(\S+)', ls)
                if m:
                    tcont_map[m.group(1)] = m.group(2)
                    continue
                # gemport 1 tcont 1  OR  gemport 1 name <name> tcont 1
                m = re.match(r'gemport\s+(\d+)(?:\s+name\s+\S+)?\s+tcont\s+(\d+)', ls)
                if m:
                    gem_tcont[m.group(1)] = m.group(2)
                    continue
                # gemport 1 traffic-limit downstream DOWN-PPPOE
                m = re.match(r'gemport\s+(\d+)\s+traffic-limit\s+downstream\s+(\S+)', ls)
                if m:
                    gem_downstream[m.group(1)] = m.group(2)
                    continue

            # Parse service names from pon-onu-mng
            # Build ordered list of (service_name, gem_id, vlan) from pon-onu-mng
            ponmng_services_ordered = []
            for l in cfg_ponmng.split('\n'):
                ls = l.strip()
                # service ACS gemport 1 cos 0 vlan 100
                # service 200 gemport 1 cos 0 vlan 200
                m = re.match(r'service\s+(\S+)\s+gemport\s+(\d+)(?:\s+.*?vlan\s+(\d+))?', ls)
                if m:
                    ponmng_services_ordered.append({
                        'name': m.group(1),
                        'gem_id': m.group(2),
                        'vlan': m.group(3) or '',
                    })

            # Build final WAN services
            for svc_idx in range(1, 5):
                svc_key = f'service{svc_idx}'
                svc = result['wan_services'].get(svc_key, {})
                if svc:
                    # service-port uses 'vport' which maps 1:1 to gemport in ZTE GPON
                    gem_id = svc.get('gemport') or svc.get('vport') or str(svc_idx)
                    tcont_id = gem_tcont.get(gem_id)

                    # Upload profile = tcont profile name (UP-PPPOE)
                    svc['upload_profile'] = tcont_map.get(tcont_id, '-')

                    # Download profile = traffic-limit downstream if exists, else 'default'
                    svc['download_profile'] = gem_downstream.get(gem_id, 'default')

                    # Service name from pon-onu-mng — match by order (service-port idx ↔ ponmng service idx)
                    if svc_idx <= len(ponmng_services_ordered):
                        pms = ponmng_services_ordered[svc_idx - 1]
                        svc['service_name'] = pms['name']
                        # Also fill VLAN from pon-onu-mng if not already set
                        if not svc.get('vlan') and pms['vlan']:
                            svc['vlan'] = pms['vlan']
                    else:
                        svc['service_name'] = f'service{svc_idx}'

                    # Determine mode from wan-ip or pppoe config in pon-onu-mng
                    if wan_ip_mode and str(wan_ip_mode.get('svc_num')) == str(svc_idx):
                        # wan-ip 1 mode dhcp → "Wan-IP - DHCP"
                        # wan-ip 1 mode pppoe → "Wan-IP - PPPOE"
                        ip_mode = wan_ip_mode.get('mode', 'dhcp').upper()
                        svc['mode'] = f'Wan-IP - {ip_mode}'
                        svc['wan_ip_profile'] = wan_ip_mode.get('vlan_profile', '')
                        svc['wan_ip_host'] = wan_ip_mode.get('host', '')
                    elif pppoe_mode and str(pppoe_mode.get('host_id', svc_idx)) == str(svc_idx):
                        # pppoe 1 nat enable user X password Y → "PPPoE NAT" (only for matching service)
                        nat = pppoe_mode.get('nat', 'enable')
                        svc['mode'] = 'PPPoE NAT' if nat == 'enable' else 'PPPoE'
                        svc['pppoe_username'] = pppoe_mode.get('username', '')
                        svc['pppoe_password'] = pppoe_mode.get('password', '')
                        svc['pppoe_nat'] = nat
                        svc['pppoe_host'] = pppoe_mode.get('host_id', '1')
                    else:
                        svc['mode'] = 'Bridge / ONU Webpage'

            # ── 8b. Fetch actual WAN IP via show gpon onu iphost ──
            # ── 8b. Fetch actual WAN IP via show gpon remote-onu ip-host ──
            iphost_out = self._send_command(tn, f'show gpon remote-onu ip-host {iface}', timeout=15)
            if iphost_out.strip() and 'Error' not in iphost_out and 'Invalid' not in iphost_out and 'No relate' not in iphost_out:
                # Parse multi-block format:
                # Host ID:            1
                # Current IP address: 172.16.8.2
                # ... (repeats for each host)
                host_ips = {}  # host_id -> current_ip
                current_host_id = None
                for line in iphost_out.split('\n'):
                    ls = line.strip()
                    if ':' in ls:
                        k = ls.split(':', 1)[0].strip()
                        v = ls.split(':', 1)[1].strip()
                        if k == 'Host ID':
                            current_host_id = v
                        elif k == 'Current IP address' and current_host_id:
                            if v and v != '0.0.0.0' and '.' in v:
                                host_ips[current_host_id] = v
                # Assign IP to matching WAN services
                for host_id, host_ip in host_ips.items():
                    # Try exact match via wan_ip_host
                    assigned = False
                    for svc_idx2 in range(1, 5):
                        svc_key2 = f'service{svc_idx2}'
                        svc2 = result['wan_services'].get(svc_key2, {})
                        if svc2 and str(svc2.get('wan_ip_host', '')) == str(host_id):
                            svc2['ip'] = host_ip
                            assigned = True
                            break
                    if not assigned and host_id == '1':
                        # Default: host 1 → first Wan-IP service without IP
                        for svc_idx3 in range(1, 5):
                            svc_key3 = f'service{svc_idx3}'
                            svc3 = result['wan_services'].get(svc_key3, {})
                            if svc3 and svc3.get('mode', '').startswith('Wan-IP') and not svc3.get('ip'):
                                svc3['ip'] = host_ip
                                break
            # Fallback: if no Wan-IP services found, try assigning to any active service
            if not any(s.get('ip') for s in result['wan_services'].values() if s):
                iphost_out2 = self._send_command(tn, f'show gpon remote-onu ip-host {iface}', timeout=15)
                if iphost_out2.strip() and 'Error' not in iphost_out2:
                    for line in iphost_out2.split('\n'):
                        ls = line.strip()
                        if ':' in ls:
                            k = ls.split(':', 1)[0].strip()
                            v = ls.split(':', 1)[1].strip()
                            if k == 'Current IP address' and v and v != '0.0.0.0' and '.' in v:
                                for svc_idx4 in range(1, 5):
                                    svc_key4 = f'service{svc_idx4}'
                                    svc4 = result['wan_services'].get(svc_key4, {})
                                    if svc4 and svc4.get('vlan') and not svc4.get('ip'):
                                        svc4['ip'] = v
                                        break
                                break

            # Note: Remote Access (security-mgmt) is NOT parsed from pon-onu-mng
            # because pon-onu-mng only has partial data (no protocol/ingress details).
            # Full data comes from 'show gpon remote-onu security-mgmt'.

            # ── 9. Get Remote Access from remote-onu security-mgmt ──
            # pon-onu-mng only has "security-mgmt 1 state enable mode forward" (no details)
            # The actual service list and ingress type come from: show gpon remote-onu security-mgmt
            sec_out = self._send_command(tn, f'show gpon remote-onu security-mgmt {iface}', timeout=10)
            if sec_out.strip() and 'Error' not in sec_out and 'Invalid' not in sec_out and 'No relate' not in sec_out:
                acl_entry = {}
                for line in sec_out.split('\n'):
                    ls = line.strip()
                    if ':' in ls:
                        k = ls.split(':', 1)[0].strip()
                        v = ls.split(':', 1)[1].strip()
                        if k == 'Service control index':
                            if acl_entry and acl_entry.get('acl_id'):
                                result['remote_access'].append(acl_entry)
                            acl_entry = {'acl_id': v}
                        elif k == 'Status':
                            acl_entry['state'] = v
                        elif k == 'Control mode':
                            acl_entry['mode'] = 'forward' if v in ('permit', 'forward') else 'block'
                        elif k == 'Service list':
                            acl_entry['service_list'] = v.strip()
                        elif k == 'Ingress type':
                            acl_entry['ingress_type'] = v.upper()
                        elif k == 'Start source IP':
                            acl_entry['start_ip'] = v
                        elif k == 'End source IP':
                            acl_entry['end_ip'] = v
                if acl_entry and acl_entry.get('acl_id'):
                    result['remote_access'].append(acl_entry)

            # Convert dedup dict to list (keep last entry per port)
            # Apply locked ports AFTER all vlan lines are parsed
            if eth_by_port:
                for port_num in eth_locked_ports:
                    if port_num in eth_by_port:
                        eth_by_port[port_num]['status'] = 'down'
                    else:
                        eth_by_port[port_num] = {
                            'gemport': port_num, 'status': 'down',
                            'mode': 'N/A', 'access_vlan': '--',
                            'dhcp_mode': 'Auto', 'changes': '0'
                        }
                result['eth_entries'] = [eth_by_port[k] for k in sorted(eth_by_port.keys(), key=int)]

            # ── 10. If no eth_entries from pon-onu-mng, build from gemport ──
            # Only map bridge services to LAN — WAN-IP/PPPoE/TR069 services use iphost, not LAN
            if not result['eth_entries'] and result['gemports']:
                # Determine which service indices use iphost (WAN services) vs bridge
                iphost_services = set()
                for l in cfg_ponmng.split('\n'):
                    ls = l.strip()
                    if ls.startswith('service ') and ' iphost ' in ls:
                        m = re.match(r'service\s+\S+\s+gemport\s+(\d+)\s+iphost\s+\d+', ls)
                        if m:
                            iphost_services.add(m.group(1))
                vport_vlan = {}
                for svc in result.get('services', []):
                    parts = svc.split()
                    vport = vlan = None
                    for i, p in enumerate(parts):
                        if p == 'vport' and i+1 < len(parts): vport = parts[i+1]
                        elif p == 'vlan' and i+1 < len(parts) and (i > 0 and parts[i-1] != 'user-vlan'): vlan = parts[i+1]
                    if vport and vlan: vport_vlan[vport] = vlan
                seen_gids = set()
                for gem in result['gemports']:
                    gp = gem.split()
                    gid = gp[1] if len(gp) > 1 else None
                    if gid and gid.isdigit() and 1 <= int(gid) <= 4 and gid not in seen_gids:
                        seen_gids.add(gid)
                        # Skip services that use iphost (WAN-IP/PPPoE/TR069) — they don't map to LAN
                        if gid in iphost_services:
                            result['eth_entries'].append({
                                'gemport': gid, 'status': 'down', 'mode': 'N/A',
                                'access_vlan': '--', 'dhcp_mode': 'Auto', 'changes': '0'
                            })
                        else:
                            vlan = vport_vlan.get(gid, '--')
                            result['eth_entries'].append({
                                'gemport': gid, 'status': 'up' if vlan != '--' else 'down',
                                'mode': 'Access' if vlan != '--' else 'N/A',
                                'access_vlan': vlan, 'dhcp_mode': 'Auto', 'changes': '0'
                            })

            # ── 10. Ensure WiFi entries ──
            # Only add defaults if NO wifi config found at all (neither ssid ctrl nor vlan port)
            has_real_ssid = any(not w.get('ssid_name', '').startswith('Wifi ') for w in result['wifi_entries'])
            if not result['wifi_entries']:
                # No WiFi config at all — show default Wifi 1 & 2
                result['wifi_entries'] = [
                    {'wifi_num': '1', 'ssid_name': 'Wifi 1', 'status': 'up', 'mode': 'DHCP From Onu', 'vlan': '', 'priority': '0'},
                    {'wifi_num': '2', 'ssid_name': 'Wifi 2', 'status': 'up', 'mode': 'DHCP From Onu', 'vlan': '', 'priority': '0'}
                ]
            elif not has_real_ssid and len(result['wifi_entries']) == 1:
                # Only 1 entry with generic name — add a second default
                existing_num = result['wifi_entries'][0].get('wifi_num', '1')
                missing_num = '2' if existing_num == '1' else '1'
                result['wifi_entries'].append({'wifi_num': missing_num, 'ssid_name': f'Wifi {missing_num}', 'status': 'up', 'mode': 'DHCP From Onu', 'vlan': '', 'priority': '0'})
            # Sort by wifi_num
            result['wifi_entries'].sort(key=lambda x: int(x.get('wifi_num', 1)))
            # Ensure every WiFi entry has ssid_auth_type — default to 'open' if no auth line was found
            for w in result['wifi_entries']:
                if not w.get('ssid_auth_type'):
                    w['ssid_auth_type'] = 'open'

            # ── 10b. Ensure Ethernet always has 4 LAN ports (R-Config always shows LAN 1-4) ──
            existing_eth = {e.get('gemport') for e in result['eth_entries']}
            for i in range(1, 5):
                gid = str(i)
                if gid not in existing_eth:
                    result['eth_entries'].append({
                        'gemport': gid, 'status': 'down', 'mode': 'N/A',
                        'access_vlan': '--', 'dhcp_mode': 'Auto', 'changes': '0'
                    })

            # ── 11. Full running config for Show Config button ──
            full_cfg_parts = []

            # Get OLT interface line (just this ONU's registration)
            olt_cfg = self._send_command(tn, f'show running-config interface {olt_iface}', timeout=10)
            if olt_cfg.strip():
                onu_reg_line = None
                for line in olt_cfg.split('\n'):
                    ls = line.strip()
                    if f'onu {onu_id}' in ls:
                        onu_reg_line = ls
                        break
                if onu_reg_line:
                    full_cfg_parts.append(f'interface {olt_iface}\n  {onu_reg_line}\n!')

            # Add ONU interface section (tcont, gemport, service-port)
            if cfg_interface.strip():
                iface_lines = []
                for line in cfg_interface.split('\n'):
                    ls = line.strip()
                    # Skip the 'interface gpon-onu...' header and '!' - we add our own
                    if ls and ls != '!' and not ls.startswith('interface gpon-onu'):
                        iface_lines.append('  ' + ls)
                if iface_lines:
                    full_cfg_parts.append(f'interface {iface}\n' + '\n'.join(iface_lines) + '\n!')

            # Add pon-onu-mng section
            if cfg_ponmng.strip():
                mng_lines = []
                for line in cfg_ponmng.split('\n'):
                    ls = line.strip()
                    # Skip the 'pon-onu-mng...' header - we add our own
                    if ls and ls != '!' and not ls.startswith('pon-onu-mng'):
                        mng_lines.append('  ' + ls)
                if mng_lines:
                    full_cfg_parts.append(f'pon-onu-mng {iface}\n' + '\n'.join(mng_lines) + '\n!')

            result['running_config_raw'] = '\n'.join(full_cfg_parts) if full_cfg_parts else f'(no running config for {iface})'

            # ── 13. Collect Total Bytes for traffic cache seeding ──
            intf_out = self._send_command(tn, f'show interface {iface}', timeout=10)
            in_sec = False; out_sec = False
            for line in intf_out.split('\n'):
                ls = line.strip()
                if 'Input:' in ls and 'Total' not in ls:
                    in_sec = True; out_sec = False
                elif 'Output:' in ls:
                    in_sec = False; out_sec = True
                elif ls.startswith('Bytes:'):
                    try:
                        val = int(ls.split(':', 1)[1].strip().split()[0])
                        if in_sec: result['input_bytes'] = val
                        elif out_sec: result['output_bytes'] = val
                    except: pass

            tn.write('exit\n'); tn.close()
        except Exception as e:
            logger.error(f"collect_onu_detail failed: {e}")
            try: tn.close()
            except: pass
        return result

    def collect_onu_history(self, frame, slot, port, onu_id):
        """Collect ONU event history (last 10 events: online/offline/dyinggasp).
        Uses 'show gpon onu history gpon-onu_X/Y/Z:N' or SNMP alarm log."""
        events = []
        tn = self._connect()
        if not tn: return events
        try:
            # Try gpon onu history command
            output = self._send_command(tn, f'show gpon onu history gpon-onu_{frame}/{slot}/{port}:{onu_id}', timeout=10)
            for line in output.split('\n'):
                ls = line.strip()
                if not ls or '---' in ls or 'History' in ls:
                    continue
                # Parse: "2026-06-10 20:41:10   Online" or "2026-06-04 14:16:43 DyingGasp"
                m = re.match(r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.*)', ls)
                if m:
                    events.append({'timestamp': m.group(1).strip(), 'status': m.group(2).strip()})
                else:
                    # Try alternate format: "Online  2026-06-10 20:41:10"
                    m2 = re.match(r'(\S+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})', ls)
                    if m2:
                        events.append({'timestamp': m2.group(2).strip(), 'status': m2.group(1).strip()})
            if not events:
                # Fallback: try to read from event-log
                output2 = self._send_command(tn, f'show gpon onu event-log gpon-onu_{frame}/{slot}/{port}:{onu_id}', timeout=10)
                for line in output2.split('\n'):
                    ls = line.strip()
                    m = re.match(r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.*)', ls)
                    if m:
                        events.append({'timestamp': m.group(1).strip(), 'status': m.group(2).strip()})
            tn.write('exit\n'); tn.close()
        except Exception as e:
            logger.error(f"collect_onu_history failed: {e}")
            try: tn.close()
            except: pass
        return events[:10]

    @staticmethod
    def _join_wrapped_lines(text):
        """Join continuation lines from OLT terminal-width wrapping.
        ZTE C320 wraps long lines at ~80 chars. Both indented and non-indented
        continuation lines need joining. Known config keywords start a new line."""
        lines = text.split('\n')
        result = []
        # Known pon-onu-mng config keywords that start new lines
        config_keywords = (
            'vlan port ', 'interface eth ', 'tr069-mgmt', 'pppoe ', 'wan-ip ',
            'service ', 'name ', 'description ', 'switchport ', 'wifi ',
            'security-mgmt', 'reboot', 'restore', 'firewall', 'igmp',
            'pon-onu-mng ', 'interface ', '!', 'end', 'ZXAN', '#',
            'ssid ctrl ', 'ssid auth ', 'interface wifi ', 'wan ',
        )
        for line in lines:
            stripped = line.strip()
            if not result or not stripped:
                result.append(line)
                continue
            # Check if this line starts with a known config keyword
            starts_keyword = any(stripped.startswith(kw) for kw in config_keywords)
            if starts_keyword:
                result.append(line)
            else:
                # Continuation of previous wrapped line — join
                result[-1] = result[-1].rstrip() + ' ' + stripped
        return '\n'.join(result)

    def collect_onu_traffic(self, frame, slot, port, onu_id):
        """Collect live traffic bandwidth for an ONU via Telnet.
        Returns dict with upstream/downstream rates parsed from OLT interface counters."""
        traffic = {'downstream_kbps': '0 Kbps', 'upstream_kbps': '0 Kbps'}
        tn = self._connect()
        if not tn: return traffic
        try:
            # Try to get ONU traffic from running interface stats
            output = self._send_command(tn, f'show gpon onu bandwidth gpon-onu_{frame}/{slot}/{port}:{onu_id}', timeout=10)
            for line in output.split('\n'):
                ls = line.strip()
                # Parse bandwidth output: "DBA Bandwidth: downstream ... upstream ..."
                if 'downstream' in ls.lower() or 'rx' in ls.lower():
                    m = re.search(r'(\d+[\.\d]*)\s*(Kbps|Mbps|kbps|mbps)', ls)
                    if m:
                        traffic['downstream_kbps'] = m.group(0)
                if 'upstream' in ls.lower() or 'tx' in ls.lower():
                    m = re.search(r'(\d+[\.\d]*)\s*(Kbps|Mbps|kbps|mbps)', ls)
                    if m:
                        traffic['upstream_kbps'] = m.group(0)
            # If no bandwidth command, try interface counters
            if traffic['downstream_kbps'] == '0 Kbps':
                output2 = self._send_command(tn, f'show gpon onu performance gpon-onu_{frame}/{slot}/{port}:{onu_id}', timeout=10)
                for line in output2.split('\n'):
                    ls = line.strip()
                    if 'rx-bps' in ls.lower() or 'downstream' in ls.lower():
                        m = re.search(r'(\d+[\.\d]*)\s*(Kbps|Mbps|kbps|mbps|bps)', ls)
                        if m: traffic['downstream_kbps'] = m.group(0)
                    if 'tx-bps' in ls.lower() or 'upstream' in ls.lower():
                        m = re.search(r'(\d+[\.\d]*)\s*(Kbps|Mbps|kbps|mbps|bps)', ls)
                        if m: traffic['upstream_kbps'] = m.group(0)
            tn.write('exit\n'); tn.close()
        except Exception as e:
            logger.error(f"collect_onu_traffic failed: {e}")
            try: tn.close()
            except: pass
        return traffic

    def collect_unregistered_onus(self):
        """Discover unconfigured ONUs matching oltc320 reference implementation.
        Uses 'show pon onu uncfg' (not 'show gpon onu uncfg') per ZTE C320 firmware 2.1+.
        Output format:
            OltIndex            Model                SN                 PW
            -----------------------------------------------------------------------
            gpon-olt_1/1/5      F670LV9.0            ZTEGDC79F447       GDC79F447
        """
        import re as _re
        onus = []
        tn = self._connect()
        if not tn: return onus
        try:
            # Try 'show pon onu uncfg' first (oltc320 reference, firmware 2.1+)
            output = self._send_command(tn, 'show pon onu uncfg')
            # Clean telnet IAC bytes and control characters
            output = output.replace('\x00', '').replace('\xff', '')
            output = _re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', output)

            # If first command fails or returns empty, fallback to 'show gpon onu uncfg'
            if not output.strip() or 'error' in output.lower() or '%code' in output.lower():
                output = self._send_command(tn, 'show gpon onu uncfg')
                output = output.replace('\x00', '').replace('\xff', '')
                output = _re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', output)

            logger.info(f"[uncfg raw] {output[:500]}")

            if not output.strip() or 'no unconfigured' in output.lower() or 'no related' in output.lower():
                tn.write('exit\n'); tn.close()
                return onus

            for line in output.split('\n'):
                line = line.strip('\r').strip()
                if not line:
                    continue
                # Skip header/separator lines
                if '---' in line or '===' in line:
                    continue
                ll = line.lower()
                if 'oltindex' in ll or 'onuindex' in ll or 'f/s/p' in ll or 'onuid' in ll or 'onutype' in ll:
                    continue
                if ll.startswith('pon port') or ll.startswith('slot') or ll.startswith('no '):
                    continue

                # Format 1 (oltc320 reference): "gpon-olt_1/1/5    F670LV9.0    ZTEGDC79F447    GDC79F447"
                # Columns: OltIndex, Model, SN, PW (password/code)
                if 'gpon-olt' in ll or 'gpon_olt' in ll:
                    match = _re.search(r'gpon[_-]olt[_-](\d+/\d+/\d+)\s+(\S+)\s+(\S+)', line)
                    if match:
                        pon_port = match.group(1)
                        model_or_sn = match.group(2)
                        sn_or_model = match.group(3)
                        # Determine which is SN and which is model
                        # SN usually starts with vendor prefix (ZTEG, HWTC, FHTT, etc.)
                        # Model is like F670LV9.0, EG8041V5, HG8245H5, etc.
                        sn_match = _re.match(r'^[A-Z]{4}[0-9A-Fa-f]{4,}', model_or_sn)
                        if sn_match:
                            sn = model_or_sn
                            model = sn_or_model
                        else:
                            sn = sn_or_model
                            model = model_or_sn
                        if sn and len(sn) >= 8:
                            onus.append({
                                'pon_port': pon_port,
                                'sn': sn,
                                'vendor': detect_vendor_from_sn(sn),
                                'model': model if not _re.match(r'^[A-Z]{4}[0-9A-Fa-f]+$', model) else '',
                            })

                # Format 1b (EPON): "epon-olt_1/2/1    F670LV9.0    ZTEGDC79F447    GDC79F447"
                elif 'epon-olt' in ll or 'epon_olt' in ll:
                    match = _re.search(r'epon[_-]olt[_-](\d+/\d+/\d+)\s+(\S+)\s+(\S+)', line)
                    if match:
                        pon_port = match.group(1)
                        model_or_sn = match.group(2)
                        sn_or_model = match.group(3)
                        sn_match = _re.match(r'^[A-Z]{4}[0-9A-Fa-f]{4,}', model_or_sn)
                        if sn_match:
                            sn = model_or_sn
                            model = sn_or_model
                        else:
                            sn = sn_or_model
                            model = model_or_sn
                        # EPON ONUs may use MAC address as SN (no vendor prefix)
                        if not sn_match and len(model_or_sn) == 12 and _re.match(r'^[0-9A-Fa-f]{12}$', model_or_sn):
                            sn = model_or_sn
                            model = sn_or_model
                        if sn and len(sn) >= 8:
                            onus.append({
                                'pon_port': pon_port,
                                'sn': sn,
                                'vendor': detect_vendor_from_sn(sn) if _re.match(r'^[A-Z]{4}', sn) else 'Unknown',
                                'model': model if not _re.match(r'^[A-Z]{4}[0-9A-Fa-f]+$', model) else '',
                                'is_epon': True,
                            })

                # Format 2: "gpon-onu_1/1/5:1  ZTEGDC79F447  unknown" (show gpon onu uncfg)
                elif 'gpon-onu' in ll or 'gpon_onu' in ll:
                    parts = line.split()
                    if len(parts) >= 2:
                        onu_match = _re.search(r'gpon-onu_(\d+/\d+/\d+):(\d+)', parts[0])
                        if onu_match:
                            pon_port = onu_match.group(1)
                            onu_id_val = int(onu_match.group(2))
                            sn = parts[1] if len(parts) > 1 else ''
                            if sn and len(sn) >= 8:
                                onus.append({
                                    'pon_port': pon_port,
                                    'sn': sn,
                                    'vendor': detect_vendor_from_sn(sn),
                                    'model': '',
                                    'onu_id': onu_id_val,
                                })

                # Format 2b: "epon-onu_1/2/1:1  ZTEGDC79F447  unknown" (EPON uncfg)
                elif 'epon-onu' in ll or 'epon_onu' in ll:
                    parts = line.split()
                    if len(parts) >= 2:
                        onu_match = _re.search(r'epon-onu_(\d+/\d+/\d+):(\d+)', parts[0])
                        if onu_match:
                            pon_port = onu_match.group(1)
                            onu_id_val = int(onu_match.group(2))
                            sn = parts[1] if len(parts) > 1 else ''
                            # EPON may use MAC as SN (12 hex chars)
                            if sn and len(sn) >= 8:
                                onus.append({
                                    'pon_port': pon_port,
                                    'sn': sn,
                                    'vendor': detect_vendor_from_sn(sn) if _re.match(r'^[A-Z]{4}', sn) else 'Unknown',
                                    'model': '',
                                    'onu_id': onu_id_val,
                                    'is_epon': True,
                                })

                # Format 3: Table with pipes
                elif '|' in line:
                    parts = [p.strip() for p in line.split('|')]
                    if len(parts) >= 3:
                        pon_port = parts[1].strip()
                        sn = parts[2].strip()
                        model = parts[3].strip() if len(parts) > 3 and parts[3].strip() not in ('-', '') else ''
                        if sn and len(sn) >= 8:
                            onus.append({
                                'pon_port': pon_port,
                                'sn': sn,
                                'vendor': detect_vendor_from_sn(sn),
                                'model': model,
                            })

            # Deduplicate by SN
            seen = set()
            unique = []
            for o in onus:
                if o['sn'] not in seen:
                    seen.add(o['sn'])
                    unique.append(o)
            onus = unique

            logger.info(f"[uncfg parsed] Found {len(onus)} unconfigured ONU(s)")
            tn.write('exit\n'); tn.close()
        except Exception as e:
            logger.error(f"Unregistered ONU failed: {e}")
            try: tn.close()
            except: pass
        return onus

    def get_next_available_onu_id(self, frame, slot, port):
        """Get next available ONU ID on a PON port.
        Parses 'show gpon onu baseinfo' to find used IDs, returns first free (1-128).
        Matches oltc320 reference: get_next_available_onu_id()
        """
        import re as _re
        tn = self._connect()
        if not tn: return None
        try:
            cmd = f'show gpon onu baseinfo gpon-olt_{frame}/{slot}/{port}'
            output = self._send_command(tn, cmd, timeout=15)
            tn.write('exit\n'); tn.close()

            used_ids = set()
            for line in output.split('\n'):
                m = _re.search(r'gpon-onu_\d+/\d+/\d+:(\d+)', line)
                if m:
                    used_ids.add(int(m.group(1)))

            # Find first available ID (1-128)
            for onu_id in range(1, 129):
                if onu_id not in used_ids:
                    return onu_id
            return None  # All 128 slots used
        except Exception as e:
            logger.error(f"get_next_available_onu_id failed: {e}")
            try: tn.close()
            except: pass
            return None

    def collect_all_onus(self):
        """Collect ALL ONU data via Telnet as primary source.
        Uses baseinfo for SN, detail-info for name/desc, state for status."""
        onus = []
        tn = self._connect()
        if not tn:
            logger.warning("Telnet collect_all_onus: could not connect")
            return onus

        try:
            # Step 1: Discover GPON and EPON card slots from 'show card'
            # Format: Rack Shelf Slot CfgType RealType Port HardVer SoftVer Status
            # Example: 1 1 1 GTGO GTGOG 8 V1.0.0 V2.1.0 INSERVICE
            #          1 1 2 ETGO ETGOD 8 V1.0.0 V2.1.0 INSERVICE
            output = self._send_command(tn, 'show card')
            gpon_cards = []
            epon_cards = []
            for line in output.split('\n'):
                line = line.strip()
                if not line or line.startswith('-') or line.startswith('Rack') or line.startswith('Slot'):
                    continue
                parts = line.split()
                if len(parts) >= 6:
                    try:
                        rack = int(parts[0])
                        shelf = int(parts[1])
                        slot = int(parts[2])
                        cfg_type = parts[3]
                        port_count = int(parts[5]) if parts[5].isdigit() else 16
                        # GPON card types: GTGH, GTGHG, GTGO, GTGOG, etc.
                        if cfg_type.upper().startswith('GTG'):
                            gpon_cards.append({'frame': rack, 'slot': slot, 'ports': port_count})
                        # EPON card types: ETGO, ETGOD, etc.
                        elif cfg_type.upper().startswith('ETG'):
                            epon_cards.append({'frame': rack, 'slot': slot, 'ports': port_count})
                    except (ValueError, IndexError):
                        continue

            # Build PON port list from GPON cards
            pon_ports = []
            for card in gpon_cards:
                for port in range(1, card['ports'] + 1):
                    pon_ports.append((card['frame'], card['slot'], port))
            logger.info(f"  Found {len(gpon_cards)} GPON cards, {len(pon_ports)} PON ports")
            logger.info(f"  Found {len(epon_cards)} EPON cards")

            # Step 2: Get baseinfo (SN + onu_id) per port
            onu_list = []
            for frame, slot, port in pon_ports:
                cmd = f'show gpon onu baseinfo gpon-olt_{frame}/{slot}/{port}'
                try:
                    output = self._send_command(tn, cmd, timeout=15)
                    for line in output.split('\n'):
                        line = line.strip()
                        if 'gpon-onu_' not in line: continue
                        m = re.search(r'gpon-onu_\d+/\d+/(\d+):(\d+)', line)
                        if m:
                            onu_id = int(m.group(2))
                            sn_match = re.search(r'SN:([A-Za-z0-9]+)', line)
                            sn = sn_match.group(1) if sn_match else ''
                            onu_list.append({
                                'frame': frame, 'slot': slot, 'port': port,
                                'onu_id': onu_id,
                                'onu_index': frame * 100000 + slot * 10000 + port * 100 + onu_id,
                                'serial_number': sn,
                                'name': '', 'description': '', 'pppoe': '',
                                'status': 'offline', 'actual_type': '',
                                'rx_power': None, 'tx_power': None, 'distance': None,
                                'last_dereg_reason': '', 'oper_state': 0, 'reg_status': 0,
                            })
                except Exception as e:
                    logger.debug(f"baseinfo {frame}/{slot}/{port}: {e}")

            # Step 3: Get state per port for status
            for frame, slot, port in pon_ports:
                cmd = f'show gpon onu state gpon-olt_{frame}/{slot}/{port}'
                try:
                    output = self._send_command(tn, cmd, timeout=15)
                    state_map = {}
                    for line in output.split('\n'):
                        line = line.strip()
                        if not line or '---' in line or line.startswith('OnuIndex'): continue
                        if line.startswith('ONU'): continue  # skip "ONU Number: X/Y" summary
                        parts = line.split()
                        if len(parts) >= 4:
                            try:
                                onu_idx = parts[0]
                                if '/' in onu_idx and ':' in onu_idx:
                                    oid = int(onu_idx.split(':')[-1])
                                    phase = parts[3].lower() if len(parts) > 3 else ''
                                    if 'working' in phase:
                                        state_map[oid] = 'online'
                                    elif 'logging' in phase or 'active' in phase:
                                        state_map[oid] = 'online'
                                    elif 'dyinggasp' in phase:
                                        state_map[oid] = 'dyinggasp'
                                    elif 'los' in phase:
                                        state_map[oid] = 'los'
                                    else:
                                        state_map[oid] = 'offline'
                            except ValueError:
                                continue
                    for onu in onu_list:
                        if onu['slot'] == slot and onu['port'] == port and onu['onu_id'] in state_map:
                            onu['status'] = state_map[onu['onu_id']]
                except Exception as e:
                    logger.debug(f"state {frame}/{slot}/{port}: {e}")

            # Step 4: Get name, description from detail-info
            # Process up to 60 ONUs per port for performance
            port_groups = {}
            for onu in onu_list:
                k = (onu['frame'], onu['slot'], onu['port'])
                if k not in port_groups: port_groups[k] = []
                port_groups[k].append(onu)

            for (frame, slot, port), p_onus in port_groups.items():
                for onu in p_onus[:60]:
                    cmd = f'show gpon onu detail-info gpon-onu_{frame}/{slot}/{port}:{onu["onu_id"]}'
                    try:
                        output = self._send_command(tn, cmd, timeout=8)
                        for line in output.split('\n'):
                            line = line.strip()
                            if line.startswith('Name:') and not onu.get('name'):
                                onu['name'] = line.split(':', 1)[1].strip()
                            elif line.startswith('Description:') and not onu.get('description'):
                                onu['description'] = line.split(':', 1)[1].strip()
                            elif line.startswith('Serial number:') and not onu.get('serial_number'):
                                onu['serial_number'] = line.split(':', 1)[1].strip()
                            elif 'ONU Distance:' in line:
                                dm = re.search(r'(\d+)', line)
                                if dm:
                                    onu['distance'] = int(dm.group(1))
                    except Exception as e:
                        logger.debug(f"detail {frame}/{slot}/{port}:{onu['onu_id']}: {e}")

            # Step 4b: Get ONU hardware model via 'show gpon remote-onu equip'
            # Uses OMCI to read Equipment ID directly from ONU — works on V2.1.0+
            # Offline ONUs won't respond; errors are caught silently
            _bad_models = {'', 'n/a', 'none', 'unknown', 'null', '-', 'not set', 'all', 'czte'}
            for (frame, slot, port), p_onus in port_groups.items():
                for onu in p_onus[:60]:
                    cmd = f'show gpon remote-onu equip gpon-onu_{frame}/{slot}/{port}:{onu["onu_id"]}'
                    try:
                        output = self._send_command(tn, cmd, timeout=10)
                        if '%Error' in output or 'Invalid' in output:
                            continue
                        for line in output.split('\n'):
                            line = line.strip()
                            if (line.startswith('Equipment ID:') or line.startswith('Model:')) and ':' in line:
                                val = line.split(':', 1)[1].strip()
                                if val.lower() not in _bad_models:
                                    onu['actual_type'] = val
                                    break
                    except Exception as e:
                        logger.debug(f"remote-onu equip {frame}/{slot}/{port}:{onu['onu_id']}: {e}")

            # Step 4c: Get OLT RX power via 'show pon power attenuation' (accurate source)
            # SNMP OID .18 gives wrong values on ZTE C320 V2.1.0 — Telnet is ground truth
            # (verified: Telnet 'up Rx' matches rConfig 'Get Status' values exactly)
            for (frame, slot, port), p_onus in port_groups.items():
                for onu in p_onus[:60]:
                    iface_pw = f'gpon-onu_{frame}/{slot}/{port}:{onu["onu_id"]}'
                    try:
                        pw_out = self._send_command(tn, f'show pon power attenuation {iface_pw}', timeout=8)
                        if pw_out and '%Error' not in pw_out and 'Invalid' not in pw_out and 'Incomplete' not in pw_out:
                            for line in pw_out.split('\n'):
                                ls = line.strip()
                                ll = ls.lower()
                                if ll.startswith('up'):
                                    rx_m = re.search(r'Rx\s*:\s*([-]?\d+\.?\d*)', ls)
                                    tx_m = re.search(r'Tx\s*:\s*([-]?\d+\.?\d*)', ls)
                                    if rx_m: onu['rx_power'] = float(rx_m.group(1))    # OLT RX upstream
                                    if tx_m: onu['tx_power'] = float(tx_m.group(1))    # ONU TX upstream
                                elif ll.startswith('down'):
                                    rx_m = re.search(r'Rx\s*:\s*([-]?\d+\.?\d*)', ls)
                                    if rx_m: onu['onu_rx_power'] = float(rx_m.group(1)) # ONU RX downstream
                    except Exception as e:
                        logger.debug(f"power attenuation {iface_pw}: {e}")

            # Step 4d: Get PPPoE username from global running-config pon-onu-mng sections
            # 'show running-config' contains blocks like:
            #   pon-onu-mng gpon-onu_1/1/5:1
            #     ...
            #     pppoe 1 nat enable user server2 password salfanet
            #     !
            try:
                global_cfg = self._send_command(tn, 'show running-config', timeout=30)
                if global_cfg and '%Error' not in global_cfg:
                    # Parse pon-onu-mng blocks to extract PPPoE per ONU
                    current_iface = None
                    for line in global_cfg.split('\n'):
                        ls = line.strip()
                        if ls.startswith('pon-onu-mng gpon-onu_'):
                            # Extract frame/slot/port/onu_id from interface name
                            m = re.match(r'pon-onu-mng gpon-onu_(\d+)/(\d+)/(\d+):(\d+)', ls)
                            if m:
                                current_iface = (int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4)))
                            else:
                                current_iface = None
                        elif ls == '!' or ls.startswith('interface ') or ls.startswith('pon-onu-mng '):
                            current_iface = None
                        elif current_iface and ls.startswith('pppoe ') and ' user ' in ls and ' password ' in ls:
                            m = re.match(r'pppoe\s+\d+\s+nat\s+\S+\s+user\s+(\S+)\s+password\s+(\S+)', ls)
                            if m:
                                f, s, p, oid = current_iface
                                # Find matching ONU in onu_list
                                for onu in onu_list:
                                    if (onu.get('frame') == f and onu.get('slot') == s and
                                        onu.get('port') == p and onu.get('onu_id') == oid):
                                        onu['pppoe'] = m.group(1)
                                        break
            except Exception as e:
                logger.debug(f"global running-config pppoe parse: {e}")

            # Step 5: Fallback — use vendor name from SN prefix when model still unavailable
            for onu in onu_list:
                sn = onu.get('serial_number', '')
                if not onu.get('actual_type') and sn:
                    vendor = detect_vendor_from_sn(sn)
                    if vendor and vendor != 'Unknown':
                        onu['actual_type'] = vendor

            # Step 6: Collect EPON ONUs (if any EPON cards exist)
            if epon_cards:
                epon_onus = self._collect_epon_onus(tn, epon_cards)
                onu_list.extend(epon_onus)
                logger.info(f"  EPON: collected {len(epon_onus)} ONUs")

            onus = onu_list
            tn.write('exit\n')
            tn.close()
        except Exception as e:
            logger.error(f"collect_all_onus failed: {e}")
            try: tn.close()
            except: pass

        return onus

    def _collect_epon_onus(self, tn, epon_cards):
        """Collect EPON ONUs via 'show epon onu state' + running-config + optical info.
        EPON ONUs use MAC address instead of serial number.
        RX/TX power collected via 'show epon onu optical-info'."""
        epon_onus = []

        # Step 1: Get all EPON ONU states in one command
        # Output format:
        # OnuIndex               OnlineStatus  OamStatus   RegMac
        # epon-onu_1/2/2:1       Online       complete     543e.6496.f469
        try:
            state_output = self._send_command(tn, 'show epon onu state', timeout=20)
        except Exception as e:
            logger.debug(f"epon onu state failed: {e}")
            return epon_onus

        # Parse state output
        for line in state_output.split('\n'):
            line = line.strip()
            if not line or line.startswith('---') or line.startswith('OnuIndex') or line.startswith('ONU Number'):
                continue
            # epon-onu_1/2/2:1       Online       complete     543e.6496.f469
            m = re.match(r'epon-onu_(\d+)/(\d+)/(\d+):(\d+)\s+(\S+)\s+(\S+)\s+(\S+)', line)
            if m:
                frame = int(m.group(1))
                slot = int(m.group(2))
                port = int(m.group(3))
                onu_id = int(m.group(4))
                online_status = m.group(5).lower()
                reg_mac = m.group(7)

                # Map status
                if 'online' in online_status:
                    status = 'online'
                elif 'power' in online_status or 'off' in online_status:
                    status = 'offline'
                elif 'los' in online_status:
                    status = 'los'
                elif 'dying' in online_status:
                    status = 'dyinggasp'
                else:
                    status = 'offline'

                # Use MAC as serial_number substitute (EPON doesn't have SN)
                # Format: remove dots, uppercase → e.g. 543E6496F469
                mac_clean = reg_mac.replace('.', '').upper() if reg_mac and reg_mac != '0000.0000.0000' else ''

                epon_onus.append({
                    'frame': frame, 'slot': slot, 'port': port,
                    'onu_id': onu_id,
                    'onu_index': frame * 100000 + slot * 10000 + port * 100 + onu_id,
                    'serial_number': mac_clean,
                    'name': '', 'description': '', 'pppoe': '',
                    'status': status, 'actual_type': '',
                    'rx_power': None, 'tx_power': None, 'distance': None,
                    'last_dereg_reason': '', 'oper_state': 0, 'reg_status': 0,
                    'card_type': 'epon',
                })

        if not epon_onus:
            return epon_onus

        # Step 2: Get name/description from running-config per ONU
        # show running-config interface epon-onu_1/2/2:1
        # Output:
        # interface epon-onu_1/2/2:1
        #   property description $$Sienny$$Jl. Cepaka
        #   ems-autocfg-request disable
        #   sla-profile EPON vport 1
        #   encrypt direction downstream  enable  vport 1
        #   service-port 1 vport 1 user-vlan 110 vlan 110
        for onu in epon_onus:
            iface = f"epon-onu_{onu['frame']}/{onu['slot']}/{onu['port']}:{onu['onu_id']}"
            try:
                cfg_out = self._send_command(tn, f'show running-config interface {iface}', timeout=8)
                if cfg_out and '%Error' not in cfg_out:
                    for line in cfg_out.split('\n'):
                        ls = line.strip()
                        if ls.startswith('property description'):
                            # property description $$Name$$Description
                            desc_raw = ls.split('description', 1)[1].strip() if 'description' in ls else ''
                            if desc_raw:
                                # ZTE uses $$ separator: $$Name$$Description
                                parts = desc_raw.split('$$')
                                parts = [p.strip() for p in parts if p.strip()]
                                if len(parts) >= 2:
                                    onu['name'] = parts[0]
                                    onu['description'] = parts[1]
                                elif len(parts) == 1:
                                    onu['name'] = parts[0]
                        elif ls.startswith('service-port') and 'vlan' in ls:
                            # Extract VLAN for reference
                            vm = re.search(r'vlan\s+(\d+)', ls)
                            if vm and not onu.get('vlan'):
                                onu['vlan'] = int(vm.group(1))
            except Exception as e:
                logger.debug(f"epon running-config {iface}: {e}")

        # Step 3: Detect vendor from MAC OUI prefix
        for onu in epon_onus:
            if not onu.get('actual_type') and onu.get('serial_number'):
                mac = onu['serial_number']
                # Common OUI prefixes
                oui_map = {
                    '543E64': 'ZTE',
                    '002FD9': 'ZTE',
                    'EC6CB5': 'ZTE',
                    '001141': 'ZTE',
                    '00D48F': 'ZTE',
                    'B03055': 'ZTE',
                    '688B0F': 'ZTE',
                    '6CD2B2': 'ZTE',
                    '442295': 'ZTE',
                    '74B57E': 'ZTE',
                    '802278': 'ZTE',
                    '28BF89': 'ZTE',
                    '1C784E': 'ZTE',
                    'A09B12': 'ZTE',
                    'B05365': 'ZTE',
                    'FC8E5B': 'ZTE',
                    'B0B194': 'ZTE',
                    '6458AD': 'ZTE',
                }
                oui = mac[:6].upper()
                if oui in oui_map:
                    onu['actual_type'] = oui_map[oui]

        # Step 4: Collect RX/TX power for online EPON ONUs
        # ZTE C320 EPON supports 'show pon power attenuation epon-onu_X/Y/Z:N'
        # Same output format as GPON:
        #   up    Rx :-20.915(dbm)   Tx:1.279(dbm)    Attenuation:22.194(dB)
        #   down  Tx :7.547(dbm)     Rx:-15.590(dbm)  Attenuation:23.137(dB)
        for onu in epon_onus:
            if onu['status'] != 'online':
                continue
            iface = f"epon-onu_{onu['frame']}/{onu['slot']}/{onu['port']}:{onu['onu_id']}"
            try:
                pw_out = self._send_command(tn, f'show pon power attenuation {iface}', timeout=8)
                if pw_out and '%Error' not in pw_out and 'Invalid' not in pw_out:
                    for line in pw_out.split('\n'):
                        ls = line.strip()
                        ll = ls.lower()
                        if ll.startswith('up'):
                            rx_m = re.search(r'Rx\s*:\s*([-]?\d+\.?\d*)', ls)
                            tx_m = re.search(r'Tx\s*:\s*([-]?\d+\.?\d*)', ls)
                            if rx_m: onu['rx_power'] = float(rx_m.group(1))    # OLT RX upstream
                            if tx_m: onu['tx_power'] = float(tx_m.group(1))    # ONU TX upstream
                        elif ll.startswith('down'):
                            rx_m = re.search(r'Rx\s*:\s*([-]?\d+\.?\d*)', ls)
                            if rx_m: onu['onu_rx_power'] = float(rx_m.group(1))  # ONU RX downstream
            except Exception as e:
                logger.debug(f"epon power attenuation {iface}: {e}")

        return epon_onus

    def _collect_epon_onus_fast(self, ip=None, username=None, password=None, port=None):
        """Lightweight EPON ONU collection — only 'show epon onu state', no running-config.
        Used by light sync to get EPON ONU status without slow per-ONU Telnet calls.
        Can be called standalone (creates own connection) or reuse existing."""
        epon_onus = []
        if ip:
            tc = TelnetCollector(ip, username, password, port)
        else:
            tc = self
        tn = tc._connect()
        if not tn:
            return epon_onus
        try:
            state_output = tc._send_command(tn, 'show epon onu state', timeout=20)
            for line in state_output.split('\n'):
                line = line.strip()
                if not line or line.startswith('---') or line.startswith('OnuIndex') or line.startswith('ONU Number'):
                    continue
                m = re.match(r'epon-onu_(\d+)/(\d+)/(\d+):(\d+)\s+(\S+)\s+(\S+)\s+(\S+)', line)
                if m:
                    frame = int(m.group(1))
                    slot = int(m.group(2))
                    port = int(m.group(3))
                    onu_id = int(m.group(4))
                    online_status = m.group(5).lower()
                    reg_mac = m.group(7)
                    if 'online' in online_status:
                        status = 'online'
                    elif 'power' in online_status or 'off' in online_status:
                        status = 'offline'
                    elif 'los' in online_status:
                        status = 'los'
                    elif 'dying' in online_status:
                        status = 'dyinggasp'
                    else:
                        status = 'offline'
                    mac_clean = reg_mac.replace('.', '').upper() if reg_mac and reg_mac != '0000.0000.0000' else ''
                    epon_onus.append({
                        'frame': frame, 'slot': slot, 'port': port,
                        'onu_id': onu_id,
                        'onu_index': frame * 100000 + slot * 10000 + port * 100 + onu_id,
                        'serial_number': mac_clean,
                        'name': '', 'description': '', 'pppoe': '',
                        'status': status, 'actual_type': '',
                        'rx_power': None, 'tx_power': None, 'distance': None,
                        'last_dereg_reason': '', 'oper_state': 0, 'reg_status': 0,
                        'card_type': 'epon',
                    })
            tn.write('exit\n')
            tn.close()
        except Exception as e:
            logger.debug(f"_collect_epon_onus_fast: {e}")
            try: tn.close()
            except: pass
        return epon_onus

    def _parse_show_card(self, output):
        cards = []
        for line in output.split('\n'):
            line = line.strip()
            if not line or line.startswith('-') or line.startswith('Rack') or line.startswith('Slot'): continue
            parts = line.split()
            if len(parts) >= 4:
                try:
                    rack, shelf, slot = int(parts[0]), int(parts[1]), int(parts[2])
                    cfg_type = parts[3] if len(parts) > 3 else ''
                    real_type = ''
                    status = 'UNKNOWN'
                    port_count = 0
                    if len(parts) > 4 and parts[4].isalpha():
                        real_type = parts[4]
                        # parts[5] is port count
                        if len(parts) > 5 and parts[5].isdigit():
                            port_count = int(parts[5])
                        status = parts[-1].upper()
                    else:
                        if len(parts) > 5 and parts[5].isdigit():
                            port_count = int(parts[5])
                        status = parts[-1].upper()
                    cards.append({'slot': slot, 'rack': rack, 'shelf': shelf,
                                  'type': real_type if real_type else cfg_type,
                                  'cfg_type': cfg_type, 'real_type': real_type,
                                  'status': status, 'port_count': port_count})
                except (ValueError, IndexError): continue
        return cards

    def _parse_show_fan(self, output):
        fans = []
        in_fan_table = False
        for line in output.split('\n'):
            line = line.strip()
            if 'FanUnitId' in line and 'ActualSpeed' in line:
                in_fan_table = True; continue
            if line.startswith('---') and in_fan_table: continue
            if in_fan_table and line:
                parts = line.split()
                if len(parts) >= 3:
                    try:
                        fan_num = int(parts[0])
                        speed_level = parts[1]
                        rpm = int(parts[2])
                        fans.append({'number': fan_num, 'status': 'online' if rpm > 0 else 'offline',
                                     'rpm': rpm, 'speed_level': f'Standard ({speed_level})'})
                    except (ValueError, IndexError): in_fan_table = False
                elif line and not line[0].isdigit(): in_fan_table = False
        return fans
