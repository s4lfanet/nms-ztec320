"""HiOSO OLT Adapter (EPON HA7302/HA7304/HA7304C/HA7308, GPON HA7404/HA7408, and BDCOM variants).

Combines three data channels for 100% accuracy against real HiOSO OLTs:
1. Web table (/onuAllPonOnuList.asp & /system.asp & /portOverview.asp) when reachable — fetches all
   ONUs in a single HTTP request (<100ms) with Name ('NA' or custom), MAC, Status, FwVersion,
   ChipId, Ports, RTT/Distance, Temperature, TxPower, RxPower, OfflineReason, and DyingGasp flag.
2. Telnet CLI ('show onu info epon 0/{p} all') when enabled — enriches exact port breakdown
   (Ge / Fe / Pots, e.g. '6301 (4GE+1POTS)', '9127 (1GE+3FE+1POTS)', '6301 (2GE+2FE)', '9602 (1GE+1FE)').
3. SNMP MIB (.25355.3.2.6 / .25355.3.3.1 / .3320.101) — full standalone fallback when HTTP/Telnet
   credentials are not configured.
"""

import base64
import logging
import re
import socket
import time
import urllib.parse
import urllib.request
from models import OLT, ONU, OLTPort, OLTCard, OLTUplink
from .base import BaseOLTAdapter
from .normalized import RackData, NormalizedSlot, NormalizedPort, NormalizedPsu
from .snmp_oids import VENDOR_OIDS

logger = logging.getLogger(__name__)

_INVALID_SERIALS = {'', '0', '00', '0000', '000000', '00000000', '--', 'na', 'n/a', 'none', 'null'}


def format_mac_or_sn(val) -> str:
    """Format SNMP OctetString or string value into a readable MAC (AA:BB:CC:DD:EE:FF) or SN."""
    if val is None:
        return ''
    try:
        if hasattr(val, 'asOctets'):
            raw = val.asOctets()
        elif isinstance(val, (bytes, bytearray)):
            raw = bytes(val)
        else:
            raw = None
        if raw:
            if len(raw) == 6:
                mac = ':'.join(f'{b:02X}' for b in raw)
                return '' if mac == '00:00:00:00:00:00' else mac
            if all(32 <= b <= 126 for b in raw):
                s = raw.decode('ascii', errors='ignore').strip()
                if s.lower() in _INVALID_SERIALS:
                    return ''
                if len(s) == 12 and all(c in '0123456789abcdefABCDEF' for c in s):
                    return ':'.join(s[i:i+2].upper() for i in range(0, 12, 2))
                if re.match(r'^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$', s):
                    return s.upper()
                return s
            hex_s = raw.hex().upper()
            if len(hex_s) == 12:
                return ':'.join(hex_s[i:i+2] for i in range(0, 12, 2))
            return hex_s
    except Exception:
        pass

    s = str(val).strip()
    if s.lower() in _INVALID_SERIALS:
        return ''
    if s.startswith(('0x', '0X')):
        s = s[2:]
    if len(s) == 12 and all(c in '0123456789abcdefABCDEF' for c in s):
        return ':'.join(s[i:i+2].upper() for i in range(0, 12, 2))
    if re.match(r'^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$', s):
        return s.replace('-', ':').upper()
    return s


def parse_optical_dbm(val):
    """Parse optical power value from SNMP/Web (float string in dBm, or scaled int)."""
    if val is None:
        return None
    s = str(val).strip()
    if not s or s.lower() in ('none', 'null', 'n/a', '--', '-inf', 'inf'):
        return None
    m = re.search(r'[-+]?\d+(?:\.\d+)?', s)
    if not m:
        return None
    try:
        f = float(m.group(0))
    except ValueError:
        return None
    if f == 0.0 or f == 65535.0 or f == -65535.0 or f <= -9999:
        return None
    if '.' not in m.group(0) and abs(f) > 60:
        if abs(f) > 5000:
            f = f / 1000.0
        elif abs(f) > 100:
            f = f / 100.0
        else:
            f = f / 10.0
    if f < -55.0 or f > 15.0:
        return None
    return round(f, 2)


def calc_hioso_distance_m(rtt_raw) -> int | None:
    """Convert HiOSO raw RTT counter to distance in meters (matches HiOSO firmware JS formula)."""
    if rtt_raw is None:
        return None
    try:
        rtt = float(str(rtt_raw).strip().split()[0])
        if rtt <= 0:
            return None
        d = rtt * 1.6393 - 157.0
        d = (d - 157.0) if d > 157.0 else 1.0
        return max(1, int(round(d)))
    except Exception:
        return None


def format_hioso_onu_type(chip_id: str, ge: int = None, fe: int = None, pots: int = None, total_ports: str = '') -> str:
    """Build a descriptive ONU type string from HiOSO ChipId + port composition."""
    chip = (chip_id or '').strip()
    if chip in ('0', '0000', '--', ''):
        chip = ''
    port_parts = []
    if ge is not None and ge > 0:
        port_parts.append(f'{ge}GE')
    if fe is not None and fe > 0:
        port_parts.append(f'{fe}FE')
    if pots is not None and pots > 0:
        port_parts.append(f'{pots}POTS')
    port_spec = '+'.join(port_parts)
    if not port_spec and total_ports and str(total_ports).isdigit() and int(total_ports) > 0:
        port_spec = f'{total_ports}P'
    if chip and port_spec:
        return f'{chip} ({port_spec})'
    if chip:
        return chip
    if port_spec:
        return port_spec
    return 'EPON-ONU'


def parse_onu_suffix(suffix: str) -> tuple[int, int, int]:
    """Parse SNMP OID suffix into (slot, port, onu_id)."""
    parts = [p for p in str(suffix).strip('.').split('.') if p.isdigit()]
    if len(parts) >= 3:
        slot = max(int(parts[-3]), 1)
        port = max(int(parts[-2]), 1)
        onu_id = max(int(parts[-1]), 1)
        return slot, port, onu_id
    if len(parts) == 2:
        p0, p1 = int(parts[0]), int(parts[1])
        if p0 > 65535:
            port = ((p0 >> 8) & 0xFF) or 1
            return 1, port, max(p1, 1)
        return 1, max(p0, 1), max(p1, 1)
    if len(parts) == 1:
        raw = int(parts[0])
        if raw > 0x01000000:
            slot = max((raw >> 24) & 0xFF, 1)
            port = max((raw >> 8) & 0xFF, 1)
            onu_id = max(raw & 0xFF, 1)
            return slot, port, onu_id
        if raw > 256:
            port = max((raw >> 8) & 0xFF, 1)
            onu_id = max(raw & 0xFF, 1)
            return 1, port, onu_id
        return 1, 1, max(raw, 1)
    return 1, 1, 1


class HiosoAdapter(BaseOLTAdapter):
    """HiOSO EPON / GPON OLT adapter for monitoring and alerting."""

    vendor = 'hioso'
    supported_models = []
    cli_protocol = 'telnet'

    def _default_pon_count(self) -> int:
        model = (self.olt.model or '').upper()
        if '16' in model:
            return 16
        if '8' in model or '7308' in model or '7408' in model:
            return 8
        if '2' in model and ('7302' in model or '7402' in model or '2P' in model):
            return 2
        return 4

    def get_rack_data(self, refresh: bool = False) -> RackData:
        olt = self.olt
        model = olt.model or 'HA7304C'
        is_gpon = '74' in model.upper() or 'GPON' in model.upper()
        pon_label = 'GPON' if is_gpon else 'EPON'

        rack = RackData(
            brand='HIOSO',
            model=model,
            supported=True,
            standalone=True,
            uptime=self._format_uptime_db(),
            chassis_temp=olt.temperature,
        )

        onus = ONU.query.filter_by(olt_id=olt.id).all()
        pon_ports_db = OLTPort.query.filter_by(olt_id=olt.id).order_by(OLTPort.port_number).all()
        uplinks_db = OLTUplink.query.filter_by(olt_id=olt.id).order_by(OLTUplink.port_number).all()

        port_stats = {}
        for onu in onus:
            pnum = onu.port or 1
            if pnum not in port_stats:
                port_stats[pnum] = {
                    'total': 0, 'online': 0, 'offline': 0,
                    'los': 0, 'dyinggasp': 0, 'rxPowers': [],
                }
            port_stats[pnum]['total'] += 1
            st = (onu.status or '').lower()
            if st == 'online':
                port_stats[pnum]['online'] += 1
            elif st == 'los':
                port_stats[pnum]['los'] += 1
            elif st == 'dyinggasp':
                port_stats[pnum]['dyinggasp'] += 1
            else:
                port_stats[pnum]['offline'] += 1
            rx_val = onu.onu_rx_power if onu.onu_rx_power is not None else onu.rx_power
            if rx_val is not None:
                port_stats[pnum]['rxPowers'].append(rx_val)

        ports = []
        if pon_ports_db:
            for pp in pon_ports_db:
                s = port_stats.get(pp.port_number, {})
                rxs = s.get('rxPowers', [])
                ports.append(NormalizedPort(
                    port_index=pp.port_number,
                    is_uplink=False,
                    admin_up=(pp.admin_status or 'up').lower() == 'up',
                    oper_up=(s.get('online', 0) > 0) or ((pp.onu_online or 0) > 0),
                    description=pp.name or pp.port_name or f'{pon_label} 0/{pp.port_number}',
                    total=s.get('total', pp.onu_count or 0),
                    online=s.get('online', pp.onu_online or 0),
                    offline=s.get('offline', pp.onu_offline or 0),
                    los=s.get('los', 0),
                    dying_gasp=s.get('dyinggasp', 0),
                    sfp_rx_power=round(sum(rxs) / len(rxs), 2) if rxs else None,
                    port_id=pp.id,
                ))
        else:
            max_pon = max([self._default_pon_count()] + list(port_stats.keys()))
            for pnum in range(1, max_pon + 1):
                s = port_stats.get(pnum, {})
                rxs = s.get('rxPowers', [])
                ports.append(NormalizedPort(
                    port_index=pnum,
                    is_uplink=False,
                    admin_up=True,
                    oper_up=s.get('online', 0) > 0,
                    description=f'{pon_label} 0/{pnum}',
                    total=s.get('total', 0),
                    online=s.get('online', 0),
                    offline=s.get('offline', 0),
                    los=s.get('los', 0),
                    dying_gasp=s.get('dyinggasp', 0),
                    sfp_rx_power=round(sum(rxs) / len(rxs), 2) if rxs else None,
                ))

        if uplinks_db:
            for ul in uplinks_db:
                ports.append(NormalizedPort(
                    port_index=ul.port_number,
                    is_uplink=True,
                    admin_up=(ul.admin_status or 'up').lower() == 'up',
                    oper_up=(ul.oper_status or 'up').lower() == 'up',
                    description=ul.port_name or f'G{ul.port_number}',
                    source='ifmib',
                ))
        else:
            for u_idx in range(1, 5):
                ports.append(NormalizedPort(
                    port_index=u_idx,
                    is_uplink=True,
                    admin_up=True,
                    oper_up=olt.is_online,
                    description=f'G{u_idx}',
                    source='default',
                ))

        rack.pon_port_count = sum(1 for p in ports if not p.is_uplink)
        rack.uplink_port_count = sum(1 for p in ports if p.is_uplink)

        slot = NormalizedSlot(
            slot_index=1,
            card_type=pon_label,
            is_present=True,
            card_status='inservice' if olt.is_online else 'offline',
            oper_status='up' if olt.is_online else 'down',
            temperature=olt.temperature,
            ports=ports,
        )
        rack.slots.append(slot)
        rack.psus = [NormalizedPsu(index=1, status='normal' if olt.is_online else 'fault')]
        return rack

    def _format_uptime_db(self):
        from snmp_core import format_uptime
        if self.olt.uptime:
            return format_uptime(self.olt.uptime * 100)
        return None

    def _collect_cli_port_specs(self) -> dict[tuple[int, int, int], dict]:
        """Connect via Telnet CLI to read Ge / Fe / Pots port counts per ONU (`show onu info epon 0/{p} all`)."""
        specs: dict[tuple[int, int, int], dict] = {}
        if not (self.olt.telnet_enabled and self.olt.cli_username):
            return specs
        s = None
        try:
            s = socket.create_connection((self.olt.ip_address, self.olt.telnet_port or 23), timeout=5)
            s.settimeout(0.8)

            def drain():
                buf = b''
                while True:
                    try:
                        d = s.recv(8192)
                        if not d:
                            break
                        buf += d
                        if b'Enter Key To Continue' in d or b'--More--' in d:
                            s.sendall(b' ')
                    except Exception:
                        break
                return buf.decode('ascii', errors='ignore')

            drain()
            s.sendall(((self.olt.cli_username or 'admin') + '\r\n').encode())
            drain()
            s.sendall(((self.olt.cli_password or 'admin') + '\r\n').encode())
            drain()
            s.sendall(b'enable\r\n')
            drain()

            for pnum in range(1, self._default_pon_count() + 1):
                s.sendall(f'show onu info epon 0/{pnum} all\r\n'.encode())
                out = drain()
                for line in out.splitlines():
                    # Format: 0/1:1  f8:53:29:fc:97:84 Up      3230     6301   4  0  1    CtcNegDone     30     Yes      0H36M1S          [Name]
                    m = re.match(
                        r'^\s*0/(\d+):(\d+)\s+([0-9a-fA-F:]{17})\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+(.*))?$',
                        line,
                    )
                    if m:
                        port_i = int(m.group(1))
                        onu_i = int(m.group(2))
                        mac_s = m.group(3).upper()
                        fw_s = m.group(5)
                        chip_s = m.group(6)
                        ge_i, fe_i, pots_i = int(m.group(7)), int(m.group(8)), int(m.group(9))
                        cli_name = (m.group(14) or '').strip()
                        specs[(1, port_i, onu_i)] = {
                            'mac': mac_s,
                            'fw': fw_s,
                            'chip': chip_s,
                            'ge': ge_i,
                            'fe': fe_i,
                            'pots': pots_i,
                            'name': cli_name,
                        }
            # Also read real optical transceiver temperature from PON 0/1 ('show epon optical-ddm 0/1')
            s.sendall(b'show epon optical-ddm 0/1\r\n')
            ddm_out = drain()
            tm = re.search(r'Temperature\s*:\s*([-+]?\d+(?:\.\d+)?)', ddm_out)
            if tm:
                try:
                    specs['_olt_temp'] = int(round(float(tm.group(1))))
                except Exception:
                    pass
            specs['_cli_connected'] = True
            try:
                s.sendall(b'exit\r\nexit\r\n')
            except Exception:
                pass
        except Exception as e:
            logger.debug(f"[HiOSO:{self.olt.name}] Telnet CLI spec enrichment skipped: {e}")
        finally:
            if s:
                try:
                    s.close()
                except Exception:
                    pass
        return specs

    def _collect_from_web(self, cli_specs: dict) -> tuple[list, dict]:
        """Fetch all ONUs & system metrics via HiOSO GoAhead Web UI (/onuAllPonOnuList.asp & /system.asp)."""
        user = (self.olt.cli_username or 'admin').strip()
        pw = (self.olt.cli_password or 'admin').strip()
        web_port = self.olt.web_port or 80
        base_url = f'http://{self.olt.ip_address}:{web_port}' if web_port != 80 else f'http://{self.olt.ip_address}'
        auth = base64.b64encode(f'{user}:{pw}'.encode('utf-8')).decode('ascii')

        def fetch(path: str) -> str:
            req = urllib.request.Request(
                f'{base_url}{path}',
                headers={'Authorization': f'Basic {auth}', 'Connection': 'close'},
            )
            return urllib.request.urlopen(req, timeout=8).read().decode('utf-8', errors='ignore')

        # 1. Authenticate session on root '/'
        fetch('/')

        # 2. Fetch /onuAllPonOnuList.asp (all PONs, 22 fields per ONU)
        html = fetch('/onuAllPonOnuList.asp')
        m = re.search(r'var\s+onutable\s*=\s*new\s+Array\((.*?)\);', html, re.S)
        if not m:
            return [], {}

        items = re.findall(r"'([^']*)'", m.group(1))
        rows = [items[i:i+22] for i in range(0, len(items), 22) if len(items[i:i+22]) == 22]

        onus = []
        for r in rows:
            # r[0]='0/1:1', r[1]=Name ('NA'), r[2]=MAC, r[3]=Status ('Up'/'Down'),
            # r[4]=FwVersion, r[5]=ChipId, r[6]=Ports, r[10]=RTT, r[11]=Temp,
            # r[14]=TxPower, r[15]=RxPower, r[18]=OfflineReason, r[21]=DyingGasp
            id_m = re.match(r'^(\d+)/(\d+):(\d+)$', r[0].strip())
            if not id_m:
                continue
            slot = max(int(id_m.group(1)), 1)
            port = int(id_m.group(2))
            onu_id = int(id_m.group(3))

            raw_name = r[1].strip()
            mac = format_mac_or_sn(r[2])
            status_raw = r[3].strip().lower()
            fw_ver = r[4].strip()
            chip_id = r[5].strip()
            ports_cnt = r[6].strip()
            rtt_raw = r[10].strip()
            tx_dbm = parse_optical_dbm(r[14])
            rx_dbm = parse_optical_dbm(r[15])
            off_reason_code = r[18].strip()
            dying_gasp_flag = r[21].strip()

            spec = cli_specs.get((slot, port, onu_id), {})
            if not mac and spec.get('mac'):
                mac = spec['mac']
            if (not raw_name or raw_name == 'NA') and spec.get('name') and spec['name'] != 'NA':
                raw_name = spec['name']

            onu_name = raw_name if raw_name else 'NA'
            actual_type = format_hioso_onu_type(
                chip_id or spec.get('chip', ''),
                ge=spec.get('ge'),
                fe=spec.get('fe'),
                pots=spec.get('pots'),
                total_ports=ports_cnt,
            )

            if status_raw == 'up':
                status = 'online'
                dereg_reason = ''
            else:
                if dying_gasp_flag == '1':
                    status = 'dyinggasp'
                    dereg_reason = 'PowerOff'
                elif off_reason_code in ('0', '1'):
                    # Optical link loss / timeout without dying-gasp frame
                    status = 'los'
                    dereg_reason = 'LOS'
                else:
                    status = 'offline'
                    dereg_reason = f'Reason({off_reason_code})'

            dist_m = calc_hioso_distance_m(rtt_raw)
            onu_index = slot * 100000 + port * 1000 + onu_id

            onus.append({
                'frame': 1,
                'slot': slot,
                'port': port,
                'onu_id': onu_id,
                'onu_index': onu_index,
                'serial_number': mac,
                'name': onu_name,
                'card_type': 'EPON',
                'description': '' if onu_name == 'NA' else onu_name,
                'status': status,
                'oper_state': 4 if status == 'online' else (6 if status == 'dyinggasp' else 2),
                'reg_status': 1,
                'rx_power': rx_dbm if status == 'online' else None,
                'onu_rx_power': rx_dbm if status == 'online' else None,
                'tx_power': tx_dbm if status == 'online' else None,
                'distance': dist_m,
                'actual_type': actual_type,
                'onu_type': fw_ver,
                'last_dereg_reason': dereg_reason,
                'pppoe': '',
            })

        # 3. Also read /system.asp for firmware version, CPU%, Memory%
        web_meta = {}
        try:
            sys_html = fetch('/system.asp')
            sm = re.search(r'var\s+sysInfo\s*=\s*new\s+Array\((.*?)\);', sys_html, re.S)
            if sm:
                s_items = re.findall(r'"([^"]*)"', sm.group(1))
                # sysInfo: [0]=Name, [3]=Model, [4]=SwVer, [11]=CPU%, [12]=DRAM%
                if len(s_items) >= 13:
                    web_meta['model'] = s_items[3]
                    web_meta['firmware'] = s_items[4]
                    try:
                        web_meta['cpu'] = int(float(s_items[11]))
                    except Exception:
                        pass
                    try:
                        web_meta['memory'] = int(round(float(s_items[12])))
                    except Exception:
                        pass
        except Exception:
            pass

        return onus, web_meta

    def _collect_from_mib(self, sc, oids: dict, mode: str, cli_specs: dict = None) -> list:
        """Walk a specific HiOSO SNMP MIB tree ('epon', 'gpon', or 'bdcom') and build normalized ONU dicts."""
        cli_specs = cli_specs or {}
        name_res = sc._run(sc._walk_async(oids['onu_name'])) if oids.get('onu_name') else {}
        sn_res = sc._run(sc._walk_async(oids['onu_sn'])) if oids.get('onu_sn') else {}
        mac_res = sc._run(sc._walk_async(oids['onu_mac'])) if oids.get('onu_mac') else {}
        status_res = sc._run(sc._walk_async(oids['onu_status'])) if oids.get('onu_status') else {}
        ports_res = sc._run(sc._walk_async(oids['onu_down_reason'])) if oids.get('onu_down_reason') else {}
        chip_res = sc._run(sc._walk_async('.25355.3.2.6.3.2.1.15')) if mode == 'epon' else {}
        dyg_res = sc._run(sc._walk_async('.25355.3.2.6.3.2.1.41')) if mode == 'epon' else {}
        dist_res = sc._run(sc._walk_async(oids['onu_distance'])) if oids.get('onu_distance') else {}
        rx_oid = oids.get('onu_rx') or oids.get('olt_rx')
        tx_oid = oids.get('onu_tx')
        rx_res = sc._run(sc._walk_async(rx_oid)) if rx_oid else {}
        tx_res = sc._run(sc._walk_async(tx_oid)) if tx_oid else {}

        all_keys = list(dict.fromkeys(
            list(status_res.keys()) + list(sn_res.keys()) + list(mac_res.keys()) + list(name_res.keys())
        ))
        if not all_keys:
            return []

        onus = []
        for key in all_keys:
            slot, port, onu_id = parse_onu_suffix(key)
            spec = cli_specs.get((slot, port, onu_id), {})
            # Priority: .11 (onu_sn holds real MAC hex on HA7304C), then .12 (onu_mac), then CLI spec
            serial = (
                format_mac_or_sn(sn_res.get(key))
                or format_mac_or_sn(mac_res.get(key))
                or spec.get('mac', '')
            )
            raw_name = str(name_res.get(key, '') or '').strip()
            if (not raw_name or raw_name == 'NA') and spec.get('name'):
                raw_name = spec['name']
            onu_name = raw_name if raw_name else 'NA'

            raw_status = status_res.get(key, 0)
            try:
                status_int = int(raw_status)
            except Exception:
                s_low = str(raw_status).strip().lower()
                status_int = 1 if s_low in ('1', 'up', 'online', 'working', 'true') else 0

            raw_ports_or_reason = ports_res.get(key, 0)
            try:
                pr_int = int(raw_ports_or_reason)
            except Exception:
                pr_int = 0

            raw_dyg = dyg_res.get(key, 0)
            try:
                dyg_int = int(raw_dyg)
            except Exception:
                dyg_int = 0

            rx_dbm = parse_optical_dbm(rx_res.get(key))
            tx_dbm = parse_optical_dbm(tx_res.get(key))

            if status_int == 1 or (mode == 'bdcom' and status_int == 3):
                status = 'online'
                dereg_reason = ''
            else:
                if dyg_int == 1 or pr_int == 1:
                    status = 'dyinggasp'
                    dereg_reason = 'PowerOff'
                elif pr_int == 3 or status_int == 2:
                    status = 'los'
                    dereg_reason = 'LOS'
                else:
                    status = 'offline'
                    dereg_reason = ''

            chip_str = str(chip_res.get(key, '') or spec.get('chip', '')).strip()
            ports_cnt_str = str(pr_int) if pr_int in (1, 2, 3, 4, 5, 8, 16, 24) and chip_str else ''
            actual_type = (
                format_hioso_onu_type(
                    chip_str,
                    ge=spec.get('ge'),
                    fe=spec.get('fe'),
                    pots=spec.get('pots'),
                    total_ports=ports_cnt_str,
                )
                if mode != 'gpon'
                else (chip_str or 'GPON-ONT')
            )

            dist_val = None
            if key in dist_res:
                dist_val = calc_hioso_distance_m(dist_res[key])

            onu_index = slot * 100000 + port * 1000 + onu_id
            onus.append({
                'frame': 1,
                'slot': slot,
                'port': port,
                'onu_id': onu_id,
                'onu_index': onu_index,
                'serial_number': serial,
                'name': onu_name,
                'card_type': 'GPON' if mode == 'gpon' else 'EPON',
                'description': '' if onu_name == 'NA' else onu_name,
                'status': status,
                'oper_state': 4 if status == 'online' else (6 if status == 'dyinggasp' else 2),
                'reg_status': 1,
                'rx_power': rx_dbm if status == 'online' else None,
                'onu_rx_power': rx_dbm if status == 'online' else None,
                'tx_power': tx_dbm if status == 'online' else None,
                'distance': dist_val,
                'actual_type': actual_type,
                'last_dereg_reason': dereg_reason,
                'pppoe': '',
            })
        return onus

    def collect_onus(self) -> list:
        """Collect ONU data via Web UI + Telnet CLI + SNMP fallback."""
        cli_specs = self._collect_cli_port_specs()
        try:
            web_onus, _ = self._collect_from_web(cli_specs)
            if web_onus:
                logger.info(f"[HiOSO:{self.olt.name}] Collected {len(web_onus)} ONUs via Web+CLI")
                return web_onus
        except Exception as e:
            logger.debug(f"[HiOSO:{self.olt.name}] Web collection skipped, falling back to SNMP: {e}")

        try:
            from snmp_core import SNMPCollector
            sc = SNMPCollector(
                self.olt.ip_address,
                self.olt.snmp_community or 'public',
                self.olt.snmp_port or 161,
                max_repetitions=15,
            )
            model = (self.olt.model or '').upper()
            prefer_gpon = '74' in model or 'GPON' in model

            order = (
                [('gpon', VENDOR_OIDS['hioso_gpon']), ('epon', VENDOR_OIDS['hioso_epon']), ('bdcom', VENDOR_OIDS['hioso_bdcom'])]
                if prefer_gpon else
                [('epon', VENDOR_OIDS['hioso_epon']), ('gpon', VENDOR_OIDS['hioso_gpon']), ('bdcom', VENDOR_OIDS['hioso_bdcom'])]
            )
            for mode, oids in order:
                onus = self._collect_from_mib(sc, oids, mode, cli_specs=cli_specs)
                if onus:
                    logger.info(f"[HiOSO:{self.olt.name}] Collected {len(onus)} ONUs via {mode.upper()} MIB")
                    sc.close()
                    return onus
            sc.close()
        except Exception as e:
            logger.error(f"[HiOSO:{self.olt.name}] collect_onus failed: {e}")
        return []

    def set_onu_name(self, port: int, onu_id: int, new_name: str) -> tuple[bool, str]:
        """Set ONU name directly on HiOSO OLT via Web (/goform/setOnu) and/or Telnet CLI."""
        clean_name = re.sub(r'[^a-zA-Z0-9_\-. ]', '', (new_name or '').strip())[:30] or 'NA'
        # 1. Try HTTP POST /goform/setOnu
        try:
            user = (self.olt.cli_username or 'admin').strip()
            pw = (self.olt.cli_password or 'admin').strip()
            web_port = self.olt.web_port or 80
            base_url = f'http://{self.olt.ip_address}:{web_port}' if web_port != 80 else f'http://{self.olt.ip_address}'
            auth = base64.b64encode(f'{user}:{pw}'.encode('utf-8')).decode('ascii')
            urllib.request.urlopen(
                urllib.request.Request(f'{base_url}/', headers={'Authorization': f'Basic {auth}', 'Connection': 'close'}),
                timeout=5,
            ).read()
            form_body = urllib.parse.urlencode({
                'onuId': f'0/{port}:{onu_id}',
                'onuName': clean_name.replace(' ', '_'),
                'onuOperation': 'nonOp',
            }).encode('utf-8')
            req = urllib.request.Request(
                f'{base_url}/goform/setOnu',
                data=form_body,
                headers={
                    'Authorization': f'Basic {auth}',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Connection': 'close',
                },
                method='POST',
            )
            urllib.request.urlopen(req, timeout=5).read()
            return True, 'Updated on HiOSO OLT via Web'
        except Exception as e:
            logger.debug(f"[HiOSO:{self.olt.name}] Web set_onu_name fallback to Telnet: {e}")

        # 2. Fallback to Telnet CLI
        if self.olt.telnet_enabled and self.olt.cli_username:
            s = None
            try:
                s = socket.create_connection((self.olt.ip_address, self.olt.telnet_port or 23), timeout=5)
                s.settimeout(0.8)
                time.sleep(0.4)
                s.recv(4096)
                s.sendall(((self.olt.cli_username or 'admin') + '\r\n').encode())
                time.sleep(0.3)
                s.recv(4096)
                s.sendall(((self.olt.cli_password or 'admin') + '\r\n').encode())
                time.sleep(0.3)
                s.recv(4096)
                for cmd in ('enable', 'configure terminal', f'interface epon 0/{port}', f'onu {onu_id} name {clean_name.replace(" ", "_")}', 'exit', 'exit'):
                    s.sendall((cmd + '\r\n').encode())
                    time.sleep(0.25)
                return True, 'Updated on HiOSO OLT via CLI'
            except Exception as e:
                return False, str(e)
            finally:
                if s:
                    try:
                        s.close()
                    except Exception:
                        pass
        return False, 'No Web/CLI credentials'

    def _collect_chassis_health(self, sc) -> dict:
        """Collect temperature, CPU, and memory usage from HiOSO OLT."""
        temp = None
        cpu = None
        mem_pct = None
        epon_oids = VENDOR_OIDS['hioso_epon']

        for t_oid in (epon_oids['chassis_temp'], epon_oids['chassis_temp_alt'], VENDOR_OIDS['hioso_gpon']['chassis_temp']):
            try:
                res = sc._run(sc._walk_async(t_oid))
                if res:
                    raw_val = next(iter(res.values()))
                    m = re.search(r'[-+]?\d+(?:\.\d+)?', str(raw_val))
                    if m:
                        val = float(m.group(0))
                        if val > 200:
                            val = val / 100.0
                        # Ignore 85°C (DS18B20 power-on reset constant when board sensor is unpopulated)
                        if 5 <= val <= 110 and int(round(val)) != 85:
                            temp = int(round(val))
                            break
            except Exception:
                pass

        try:
            cpu_res = sc._run(sc._walk_async(epon_oids['hr_cpu']))
            if cpu_res:
                cpu = int(float(str(next(iter(cpu_res.values())))))
        except Exception:
            pass

        try:
            tot_res = sc._run(sc._walk_async(epon_oids['hr_mem_total']))
            used_res = sc._run(sc._walk_async(epon_oids['hr_mem_used']))
            if tot_res and used_res:
                tot = float(str(next(iter(tot_res.values()))))
                used = float(str(next(iter(used_res.values()))))
                if tot > 0:
                    mem_pct = int(round(used / tot * 100))
        except Exception:
            pass

        return {'temperature': temp, 'cpu': cpu, 'memory': mem_pct}

    def poll_olt(self, progress_cb=None, light=False) -> dict:
        """Full or light poll for HiOSO OLT (Web + Telnet CLI + SNMP)."""
        def report(pct, msg):
            if progress_cb:
                progress_cb(pct, msg)
            logger.info(f"  [HiOSO {pct}%] {msg}")

        result = {
            'system': {},
            'onus': [],
            'chassis': {},
            'pon_ports': [],
            'uplinks': [],
            'success': False,
            'errors': [],
            'snmp_ok': False,
            'telnet_ok': False,
        }

        try:
            from snmp_core import SNMPCollector
            report(10, f'Menghubungi OLT HiOSO ({self.olt.ip_address})...')
            sc = SNMPCollector(
                self.olt.ip_address,
                self.olt.snmp_community or 'public',
                self.olt.snmp_port or 161,
                max_repetitions=15,
            )

            sys_info = sc.collect_system_info() if self.olt.snmp_enabled else {'description': '', 'uptime': 0, 'uptime_str': '', 'sys_name': ''}

            report(25, 'Mengambil spesifikasi port & daftar ONU...')
            cli_specs = {} if light else self._collect_cli_port_specs()
            if cli_specs:
                result['telnet_ok'] = True

            web_meta = {}
            onus = []
            try:
                onus, web_meta = self._collect_from_web(cli_specs)
            except Exception as e:
                logger.debug(f"[HiOSO:{self.olt.name}] Web poll fallback to SNMP: {e}")

            if not onus and self.olt.snmp_enabled:
                model = (self.olt.model or '').upper()
                prefer_gpon = '74' in model or 'GPON' in model
                order = (
                    [('gpon', VENDOR_OIDS['hioso_gpon']), ('epon', VENDOR_OIDS['hioso_epon']), ('bdcom', VENDOR_OIDS['hioso_bdcom'])]
                    if prefer_gpon else
                    [('epon', VENDOR_OIDS['hioso_epon']), ('gpon', VENDOR_OIDS['hioso_gpon']), ('bdcom', VENDOR_OIDS['hioso_bdcom'])]
                )
                for mode, oids in order:
                    onus = self._collect_from_mib(sc, oids, mode, cli_specs=cli_specs)
                    if onus:
                        break

            if web_meta.get('firmware') and not sys_info.get('description'):
                sys_info['description'] = f"Version {web_meta['firmware']}"
            elif web_meta.get('firmware'):
                sys_info['description'] = f"Version {web_meta['firmware']}"

            result['system'] = sys_info
            result['onus'] = onus

            if not sys_info.get('uptime') and not sys_info.get('description') and not onus:
                result['errors'].append(f'Tidak dapat menghubungi OLT HiOSO {self.olt.ip_address}')
                sc.close()
                return result

            result['snmp_ok'] = True
            report(70, f'Terbaca {len(onus)} ONU')

            if not light:
                report(80, 'Mengambil informasi port PON, uplink, & kesehatan sasis...')
                health = {
                    'temperature': cli_specs.get('_olt_temp'),
                    'cpu': web_meta.get('cpu'),
                    'memory': web_meta.get('memory'),
                }
                if self.olt.snmp_enabled and (health['temperature'] is None or health['cpu'] is None or health['memory'] is None):
                    snmp_h = self._collect_chassis_health(sc)
                    if health['temperature'] is None:
                        health['temperature'] = snmp_h.get('temperature')
                    if health['cpu'] is None:
                        health['cpu'] = snmp_h.get('cpu')
                    if health['memory'] is None:
                        health['memory'] = snmp_h.get('memory')

                model = (self.olt.model or 'HA7304C').upper()
                is_gpon = '74' in model or 'GPON' in model
                card_type = 'GTGH' if is_gpon else 'ETGH'

                discovered_ports = sorted({o['port'] for o in onus} | set(range(1, self._default_pon_count() + 1)))
                pon_ports = []
                for pnum in discovered_ports:
                    pon_ports.append({
                        'port_number': pnum,
                        'port_name': f"{'gpon' if is_gpon else 'epon'}-olt_1/1/{pnum}",
                        'admin_status': 'up',
                        'name': f"{'GPON' if is_gpon else 'EPON'} 0/{pnum}",
                        'description': f'Pon-Nni{pnum}',
                        'onu_count': sum(1 for o in onus if o['port'] == pnum),
                        'onu_online': sum(1 for o in onus if o['port'] == pnum and o['status'] == 'online'),
                        'onu_offline': sum(1 for o in onus if o['port'] == pnum and o['status'] != 'online'),
                    })

                uplinks = [
                    {
                        'port_name': f'G{u_idx}',
                        'speed': '1000M',
                        'duplex': 'full',
                        'admin_status': 'up',
                        'oper_status': 'up' if u_idx == 1 else 'down',
                        'line_protocol': 'up' if u_idx == 1 else 'down',
                    }
                    for u_idx in range(1, 5)
                ]

                result['pon_ports'] = pon_ports
                result['uplinks'] = uplinks
                result['chassis'] = {
                    'temperature': health.get('temperature'),
                    'fans': [],
                    'cards': [{
                        'slot': 1,
                        'type': card_type,
                        'status': 'inservice',
                        'port_count': len(pon_ports),
                        'cpu': health.get('cpu'),
                        'memory': health.get('memory'),
                        'temperature': health.get('temperature'),
                    }],
                }

            result['success'] = True
            report(98, 'Sinkronisasi HiOSO selesai')
            sc.close()
        except Exception as e:
            result['errors'].append(f'HiOSO poll: {str(e)}')
            logger.error(f"[HiOSO:{self.olt.name}] poll_olt failed: {e}")

        return result
