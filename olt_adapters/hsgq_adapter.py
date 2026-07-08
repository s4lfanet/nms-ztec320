"""HSGQ OLT adapter — EPON standalone devices (HSGQ-XE04ID, etc.).

Uses SNMP for port/ONU data, Telnet for CLI operations.
Standalone form factor: single board, no fan tray, no modular slots.
"""

import logging
from models import OLT, ONU, OLTPort
from .base import BaseOLTAdapter
from .normalized import RackData, NormalizedSlot, NormalizedPort, NormalizedFan, NormalizedPsu

logger = logging.getLogger(__name__)


class HsgqAdapter(BaseOLTAdapter):
    """HSGQ EPON standalone adapter."""

    vendor = 'hsgq'
    supported_models = []  # All HSGQ models
    cli_protocol = 'telnet'

    def get_rack_data(self, refresh: bool = False) -> RackData:
        olt = self.olt

        rack = RackData(
            brand='HSGQ',
            model=olt.model,
            supported=True,
            standalone=True,
            uptime=self._get_uptime(),
        )

        # Load ONU data from DB for port stats
        onus = ONU.query.filter_by(olt_id=olt.id).all()
        pon_ports_db = OLTPort.query.filter_by(olt_id=olt.id).all()

        # Build port stats from ONUs
        port_stats = {}
        for onu in onus:
            key = f"1/{onu.port}"
            if key not in port_stats:
                port_stats[key] = {'total': 0, 'online': 0, 'offline': 0, 'los': 0, 'dyinggasp': 0}
            port_stats[key]['total'] += 1
            st = (onu.status or '').lower()
            if st == 'online':
                port_stats[key]['online'] += 1
            elif st == 'los':
                port_stats[key]['los'] += 1
            elif st == 'dyinggasp':
                port_stats[key]['dyinggasp'] += 1
            else:
                port_stats[key]['offline'] += 1

        # HSGQ is standalone — single slot with all ports
        ports = []
        for pp in pon_ports_db:
            key = f"1/{pp.port_number}"
            s = port_stats.get(key, {})
            port = NormalizedPort(
                port_index=pp.port_number,
                is_uplink=False,
                admin_up=(pp.admin_status or 'up').lower() == 'up',
                oper_up=pp.onu_online > 0 if pp.onu_online else s.get('online', 0) > 0,
                description=pp.name or None,
                total=s.get('total', pp.onu_count or 0),
                online=s.get('online', pp.onu_online or 0),
                offline=s.get('offline', 0),
                los=s.get('los', 0),
                dying_gasp=s.get('dyinggasp', 0),
            )
            ports.append(port)

        # Sort by port index
        ports.sort(key=lambda p: p.port_index)

        # Try to get uplink ports from SNMP (ifDescr walk)
        uplink_ports = self._collect_uplinks_from_snmp()
        for ul in uplink_ports:
            ports.append(ul)

        rack.pon_port_count = sum(1 for p in ports if not p.is_uplink)
        rack.uplink_port_count = sum(1 for p in ports if p.is_uplink)

        slot = NormalizedSlot(
            slot_index=1,
            card_type='HSGQ-EPON',
            is_present=True,
            card_status='inservice',
            oper_status='up',
            ports=ports,
        )
        rack.slots.append(slot)

        # HSGQ standalone — no fans, PSU is implicit
        rack.fans = []
        rack.psus = [NormalizedPsu(index=1, status='normal')]

        return rack

    def _get_uptime(self) -> str:
        try:
            from snmp_core import SNMPCollector
            sc = SNMPCollector(self.olt.ip_address, self.olt.snmp_community, self.olt.snmp_port or 161)
            info = sc.collect_system_info()
            return info.get('uptime_str') or None
        except Exception:
            return None

    def _collect_uplinks_from_snmp(self) -> list:
        """Walk ifDescr to find uplink ports (GE/XGE)."""
        uplinks = []
        try:
            from snmp_core import SNMPCollector
            sc = SNMPCollector(self.olt.ip_address, self.olt.snmp_community, self.olt.snmp_port or 161)

            # Walk ifDescr to find uplink interfaces
            results = sc._run(sc._walk_async('.1.3.6.1.2.1.2.2.1.2'))
            for if_index, descr in results.items():
                descr_str = str(descr).upper()
                if descr_str.startswith('GE') or descr_str.startswith('XGE') or descr_str.startswith('ETH'):
                    # This is likely an uplink port
                    is_xge = descr_str.startswith('XGE')
                    port = NormalizedPort(
                        port_index=if_index,
                        is_uplink=True,
                        admin_up=True,
                        oper_up=True,
                        description=str(descr),
                        source='ifmib',
                    )
                    uplinks.append(port)
        except Exception as e:
            logger.debug(f"HSGQ uplink SNMP walk failed: {e}")

        return uplinks

    def collect_onus(self) -> list:
        """Collect ONU data via SNMP for HSGQ EPON."""
        onus = []
        try:
            from snmp_core import SNMPCollector
            from olt_adapters.snmp_oids import VENDOR_OIDS
            oids = VENDOR_OIDS.get('hsgq', {})
            sc = SNMPCollector(self.olt.ip_address, self.olt.snmp_community, self.olt.snmp_port or 161)

            # Walk ONU name, status, MAC, distance, chip
            name_res = sc._run(sc._walk_async(oids['onu_name']))
            status_res = sc._run(sc._walk_async(oids['onu_status']))
            mac_res = sc._run(sc._walk_async(oids['onu_mac']))
            dist_res = sc._run(sc._walk_async(oids['onu_distance']))
            chip_res = sc._run(sc._walk_async(oids['onu_chip']))
            rx_res = sc._run(sc._walk_async(oids['olt_rx']))

            for idx, name in name_res.items():
                status_val = status_res.get(idx, 2)
                mac = mac_res.get(idx, b'')
                if isinstance(mac, bytes):
                    mac_str = ':'.join(f'{b:02x}' for b in mac)
                else:
                    mac_str = str(mac)
                onu = {
                    'serial_number': mac_str,
                    'name': str(name) if name else '',
                    'status': 'online' if status_val == 1 else 'offline',
                    'rx_power': round(rx_res.get(idx, 0) / 100.0, 2) if rx_res.get(idx) else None,
                    'distance': dist_res.get(idx, 0) or 0,
                    'actual_type': str(chip_res.get(idx, '')) if chip_res.get(idx) else '',
                    'onu_index': idx,
                }
                onus.append(onu)
            sc.close()
        except Exception as e:
            logger.error(f"HSGQ collect_onus failed: {e}")
        return onus

    def collect_chassis(self) -> dict:
        return {'slots': [], 'fans': [], 'psus': []}

    def poll_olt(self, progress_cb=None) -> dict:
        """Full sync for HSGQ EPON — SNMP-based collection."""
        def report(pct, msg):
            if progress_cb:
                progress_cb(pct, msg)
            logger.info(f"  [{pct}%] {msg}")

        result = {'system': {}, 'onus': [], 'chassis': {}, 'success': False, 'errors': []}

        if not self.olt.snmp_enabled:
            result['errors'].append('SNMP not enabled')
            return result

        try:
            report(5, 'Connecting SNMP...')
            from snmp_core import SNMPCollector
            from olt_adapters.snmp_oids import VENDOR_OIDS
            oids = VENDOR_OIDS.get('hsgq', {})
            sc = SNMPCollector(self.olt.ip_address, self.olt.snmp_community, self.olt.snmp_port or 161)

            report(10, 'Collecting system info...')
            result['system'] = sc.collect_system_info()

            report(25, 'Collecting ONU data via SNMP...')
            onus = self.collect_onus()
            result['onus'] = onus
            report(75, f'Found {len(onus)} ONUs')

            # Collect PON port info
            report(80, 'Collecting PON ports...')
            pon_ports = []
            try:
                port_names = sc._run(sc._walk_async(oids['pon_port_name']))
                port_status = sc._run(sc._walk_async(oids['pon_port_status']))
                for idx, name in port_names.items():
                    pon_ports.append({
                        'port_number': idx,
                        'port_name': str(name),
                        'admin_status': 'up',
                        'name': str(name),
                        'description': '',
                        'onu_count': 0,
                        'onu_online': 0,
                        'onu_offline': 0,
                    })
            except Exception as e:
                logger.debug(f"PON port walk failed: {e}")
            result['pon_ports'] = pon_ports

            # System health
            report(85, 'Collecting system health...')
            try:
                cpu = sc._run(sc._walk_async(oids['cpu_usage']))
                mem = sc._run(sc._walk_async(oids['mem_usage']))
                result['chassis'] = {
                    'temperature': None,
                    'fans': [],
                    'cards': [],
                    'cpu': list(cpu.values())[0] if cpu else None,
                    'memory': list(mem.values())[0] if mem else None,
                }
            except Exception:
                result['chassis'] = {'fans': [], 'cards': []}

            result['success'] = True
            report(98, 'Poll complete')
            sc.close()
        except Exception as e:
            result['errors'].append(f'SNMP: {str(e)}')
            logger.error(f"HSGQ poll_olt failed: {e}")

        return result
