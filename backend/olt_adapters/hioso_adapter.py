"""HiOSO OLT Adapter (EPON HA7302/HA7304/HA7308, GPON HA7404/HA7408, and BDCOM-based variants).

Provides SNMP-based monitoring & alerting support:
- ONU discovery (MAC/SN, name, slot/port/onu_id, distance)
- Accurate status classification: online, los, dyinggasp, offline
- Optical signal measurement (RX/TX dBm) mapped to both rx_power and onu_rx_power
- OLT chassis health (temperature, CPU, memory, uptime) and PON/Uplink port discovery
"""

import logging
import re
from models import OLT, ONU, OLTPort, OLTCard, OLTUplink
from .base import BaseOLTAdapter
from .normalized import RackData, NormalizedSlot, NormalizedPort, NormalizedPsu
from .snmp_oids import VENDOR_OIDS

logger = logging.getLogger(__name__)


def format_mac_or_sn(val) -> str:
    """Format SNMP OctetString or string value into a readable MAC or Serial Number."""
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
                return ':'.join(f'{b:02X}' for b in raw)
            # Check if printable ASCII
            if all(32 <= b <= 126 for b in raw):
                s = raw.decode('ascii', errors='ignore').strip()
                if len(s) == 12 and all(c in '0123456789abcdefABCDEF' for c in s):
                    return ':'.join(s[i:i+2].upper() for i in range(0, 12, 2))
                return s
            return raw.hex().upper()
    except Exception:
        pass

    s = str(val).strip()
    if s.startswith('0x') or s.startswith('0X'):
        hex_part = s[2:]
        if len(hex_part) == 12 and all(c in '0123456789abcdefABCDEF' for c in hex_part):
            return ':'.join(hex_part[i:i+2].upper() for i in range(0, 12, 2))
        return hex_part.upper()
    if len(s) == 12 and all(c in '0123456789abcdefABCDEF' for c in s):
        return ':'.join(s[i:i+2].upper() for i in range(0, 12, 2))
    return s


def parse_optical_dbm(val):
    """Parse optical power value from SNMP (float string in dBm, or scaled int)."""
    if val is None:
        return None
    s = str(val).strip()
    if not s or s.lower() in ('none', 'null', 'n/a', '--', '-inf', 'inf'):
        return None
    # Extract numeric portion (e.g. "-19.45 dBm" -> "-19.45")
    m = re.search(r'[-+]?\d+(?:\.\d+)?', s)
    if not m:
        return None
    try:
        f = float(m.group(0))
    except ValueError:
        return None
    if f == 0.0 or f == 65535.0 or f == -65535.0 or f <= -9999:
        return None
    # Auto-scale integer representations (centi-dBm or milli-dBm)
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


def parse_onu_suffix(suffix: str) -> tuple[int, int, int]:
    """Parse SNMP OID suffix into (slot, port, onu_id).

    Supports:
    - HiOSO 3-part index: '{board}.{pon}.{onu_id}' -> (board, pon, onu_id)
    - 2-part index: '{pon}.{onu_id}' -> (1, pon, onu_id)
    - Packed integer index (HSGQ / BDCOM / IF-MIB)
    """
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
        model = olt.model or 'HA7304'
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
            max_pon = max([ self._default_pon_count() ] + list(port_stats.keys()))
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
                    description=ul.port_name or f'GE{ul.port_number}',
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

    def _collect_from_mib(self, sc, oids: dict, mode: str) -> list:
        """Walk a specific HiOSO MIB tree ('epon', 'gpon', or 'bdcom') and build normalized ONU dicts."""
        name_res = sc._run(sc._walk_async(oids['onu_name'])) if oids.get('onu_name') else {}
        sn_res = sc._run(sc._walk_async(oids['onu_sn'])) if oids.get('onu_sn') else {}
        mac_res = sc._run(sc._walk_async(oids['onu_mac'])) if oids.get('onu_mac') else {}
        status_res = sc._run(sc._walk_async(oids['onu_status'])) if oids.get('onu_status') else {}
        reason_res = sc._run(sc._walk_async(oids['onu_down_reason'])) if oids.get('onu_down_reason') else {}
        dist_res = sc._run(sc._walk_async(oids['onu_distance'])) if oids.get('onu_distance') else {}
        rx_oid = oids.get('onu_rx') or oids.get('olt_rx')
        tx_oid = oids.get('onu_tx')
        rx_res = sc._run(sc._walk_async(rx_oid)) if rx_oid else {}
        tx_res = sc._run(sc._walk_async(tx_oid)) if tx_oid else {}

        all_keys = list(dict.fromkeys(
            list(status_res.keys()) + list(mac_res.keys()) + list(sn_res.keys()) + list(name_res.keys())
        ))
        if not all_keys:
            return []

        onus = []
        for key in all_keys:
            slot, port, onu_id = parse_onu_suffix(key)
            raw_mac = mac_res.get(key)
            raw_sn = sn_res.get(key)
            serial = format_mac_or_sn(raw_mac) or format_mac_or_sn(raw_sn)
            name = str(name_res.get(key, '') or '').strip()

            raw_status = status_res.get(key, 0)
            try:
                status_int = int(raw_status)
            except Exception:
                s_low = str(raw_status).strip().lower()
                status_int = 1 if s_low in ('1', 'up', 'online', 'working', 'true') else 0

            raw_reason = reason_res.get(key, 0)
            try:
                reason_int = int(raw_reason)
            except Exception:
                reason_int = 0

            rx_dbm = parse_optical_dbm(rx_res.get(key))
            tx_dbm = parse_optical_dbm(tx_res.get(key))

            # Status classification with down_reason support for accurate LOS / DyingGasp alerts
            if status_int == 1 or (mode == 'bdcom' and status_int == 3):
                status = 'online'
                dereg_reason = ''
            else:
                if reason_int == 1 or status_int == 2:
                    # HiOSO down_reason 1 = power-down (DyingGasp)
                    status = 'dyinggasp' if reason_int == 1 else 'offline'
                    dereg_reason = 'PowerOff' if reason_int == 1 else ''
                elif reason_int == 3:
                    status = 'los'
                    dereg_reason = 'LOS'
                else:
                    status = 'offline'
                    dereg_reason = ''

            dist_val = None
            if key in dist_res:
                try:
                    d = int(float(str(dist_res[key]).split()[0]))
                    if d >= 0:
                        dist_val = d
                except Exception:
                    pass

            onu_index = slot * 100000 + port * 1000 + onu_id
            onus.append({
                'frame': 1,
                'slot': slot,
                'port': port,
                'onu_id': onu_id,
                'onu_index': onu_index,
                'serial_number': serial or f'HIOSO-{slot}-{port}-{onu_id}',
                'name': name or f'ONU_{slot}/{port}:{onu_id}',
                'description': name,
                'status': status,
                'oper_state': 4 if status == 'online' else (6 if status == 'dyinggasp' else 2),
                'reg_status': 1,
                'rx_power': rx_dbm if status == 'online' else None,
                'onu_rx_power': rx_dbm if status == 'online' else None,
                'tx_power': tx_dbm if status == 'online' else None,
                'distance': dist_val,
                'actual_type': 'EPON-ONU' if mode != 'gpon' else 'GPON-ONT',
                'last_dereg_reason': dereg_reason,
                'pppoe': '',
            })
        return onus

    def collect_onus(self) -> list:
        """Collect ONU data via SNMP, auto-detecting HiOSO EPON, GPON, or BDCOM MIB trees."""
        try:
            from snmp_core import SNMPCollector
            sc = SNMPCollector(self.olt.ip_address, self.olt.snmp_community or 'public', self.olt.snmp_port or 161)
            model = (self.olt.model or '').upper()
            prefer_gpon = '74' in model or 'GPON' in model

            order = (
                [('gpon', VENDOR_OIDS['hioso_gpon']), ('epon', VENDOR_OIDS['hioso_epon']), ('bdcom', VENDOR_OIDS['hioso_bdcom'])]
                if prefer_gpon else
                [('epon', VENDOR_OIDS['hioso_epon']), ('gpon', VENDOR_OIDS['hioso_gpon']), ('bdcom', VENDOR_OIDS['hioso_bdcom'])]
            )
            for mode, oids in order:
                onus = self._collect_from_mib(sc, oids, mode)
                if onus:
                    logger.info(f"[HiOSO:{self.olt.name}] Collected {len(onus)} ONUs via {mode.upper()} MIB")
                    sc.close()
                    return onus
            sc.close()
        except Exception as e:
            logger.error(f"[HiOSO:{self.olt.name}] collect_onus failed: {e}")
        return []

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
                        if 5 <= val <= 110:
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
        """Full or light SNMP poll for HiOSO OLT."""
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

        if not self.olt.snmp_enabled:
            result['errors'].append('SNMP harus diaktifkan untuk OLT HiOSO')
            return result

        try:
            from snmp_core import SNMPCollector
            report(10, f'Menghubungi SNMP OLT HiOSO ({self.olt.ip_address})...')
            sc = SNMPCollector(self.olt.ip_address, self.olt.snmp_community or 'public', self.olt.snmp_port or 161)

            sys_info = sc.collect_system_info()
            result['system'] = sys_info

            report(30, 'Mengambil daftar ONU & redaman optik via SNMP...')
            onus = self.collect_onus()
            result['onus'] = onus

            # Verify SNMP actually responded (either sys_info or onus)
            if not sys_info.get('uptime') and not sys_info.get('description') and not onus:
                result['errors'].append(f'SNMP timeout ke {self.olt.ip_address}:{self.olt.snmp_port or 161}')
                sc.close()
                return result

            result['snmp_ok'] = True
            report(70, f'Terbaca {len(onus)} ONU')

            if not light:
                report(80, 'Mengambil informasi port PON, uplink, & kesehatan sasis...')
                health = self._collect_chassis_health(sc)
                model = (self.olt.model or 'HA7304').upper()
                is_gpon = '74' in model or 'GPON' in model
                card_type = 'GTGH' if is_gpon else 'ETGH'

                # Build PON ports from IF-MIB or discovered ONU ports
                pon_ports = []
                uplinks = []
                try:
                    if_descr = sc._run(sc._walk_async('.1.3.6.1.2.1.2.2.1.2'))
                    if_oper = sc._run(sc._walk_async('.1.3.6.1.2.1.2.2.1.8'))
                    pon_seq = 0
                    for idx_str, descr in if_descr.items():
                        d_str = str(descr).strip()
                        d_up = d_str.upper()
                        oper_val = int(if_oper.get(idx_str, 1)) if idx_str in if_oper else 1
                        if any(k in d_up for k in ('PON', 'EPON', 'GPON')):
                            pon_seq += 1
                            m = re.search(r'(\d+)$', d_str)
                            pnum = int(m.group(1)) if m else pon_seq
                            pon_ports.append({
                                'port_number': pnum,
                                'port_name': f"{'gpon' if is_gpon else 'epon'}-olt_1/1/{pnum}",
                                'admin_status': 'up',
                                'name': d_str,
                                'description': d_str,
                                'onu_count': 0,
                                'onu_online': 0,
                                'onu_offline': 0,
                            })
                        elif any(d_up.startswith(k) for k in ('G', 'GE', 'XGE', 'ETH', 'UPLINK')):
                            uplinks.append({
                                'port_name': d_str,
                                'speed': '1000M',
                                'duplex': 'full',
                                'admin_status': 'up',
                                'oper_status': 'up' if oper_val == 1 else 'down',
                                'line_protocol': 'up' if oper_val == 1 else 'down',
                            })
                except Exception as e:
                    logger.debug(f"[HiOSO:{self.olt.name}] IF-MIB walk skipped: {e}")

                if not pon_ports:
                    discovered_ports = sorted({o['port'] for o in onus} | set(range(1, self._default_pon_count() + 1)))
                    for pnum in discovered_ports:
                        pon_ports.append({
                            'port_number': pnum,
                            'port_name': f"{'gpon' if is_gpon else 'epon'}-olt_1/1/{pnum}",
                            'admin_status': 'up',
                            'name': f"{'GPON' if is_gpon else 'EPON'} 0/{pnum}",
                            'description': '',
                            'onu_count': sum(1 for o in onus if o['port'] == pnum),
                            'onu_online': sum(1 for o in onus if o['port'] == pnum and o['status'] == 'online'),
                            'onu_offline': sum(1 for o in onus if o['port'] == pnum and o['status'] != 'online'),
                        })

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
            result['errors'].append(f'SNMP: {str(e)}')
            logger.error(f"[HiOSO:{self.olt.name}] poll_olt failed: {e}")

        return result
