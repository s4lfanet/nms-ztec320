"""Standalone EPON OLT adapter — generic for BDCOM, C-Data, VSOL, etc.

Flat form factor: single board, no fan tray, no modular slots.
Uses standard IF-MIB for port discovery + vendor-specific OIDs for ONU data.
"""

import logging
from models import OLT, ONU, OLTPort
from .base import BaseOLTAdapter
from .normalized import RackData, NormalizedSlot, NormalizedPort, NormalizedFan, NormalizedPsu

logger = logging.getLogger(__name__)


class StandaloneEponAdapter(BaseOLTAdapter):
    """Generic standalone EPON adapter (BDCOM, C-Data, VSOL, etc.)."""

    vendor = 'standalone_epon'
    supported_models = []  # All standalone EPON models
    cli_protocol = 'telnet'

    def get_rack_data(self, refresh: bool = False) -> RackData:
        olt = self.olt

        # Determine brand from vendor field or model
        brand = (olt.vendor or 'EPON').upper()
        if brand == 'STANDALONE_EPON':
            brand = 'EPON'

        rack = RackData(
            brand=brand,
            model=olt.model,
            supported=True,
            standalone=True,
            uptime=self._get_uptime(),
        )

        # Load ONU data from DB
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

        # Build PON ports
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

        ports.sort(key=lambda p: p.port_index)

        # Try to discover uplink ports via SNMP IF-MIB
        uplink_ports = self._collect_uplinks_from_snmp()
        ports.extend(uplink_ports)

        rack.pon_port_count = sum(1 for p in ports if not p.is_uplink)
        rack.uplink_port_count = sum(1 for p in ports if p.is_uplink)

        slot = NormalizedSlot(
            slot_index=1,
            card_type='EPON',
            is_present=True,
            card_status='inservice',
            oper_status='up',
            ports=ports,
        )
        rack.slots.append(slot)

        # Standalone — no fans, PSU implicit
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
        """Walk ifDescr to find uplink ports."""
        uplinks = []
        try:
            from snmp_core import SNMPCollector
            sc = SNMPCollector(self.olt.ip_address, self.olt.snmp_community, self.olt.snmp_port or 161)
            results = sc._run(sc._walk_async('.1.3.6.1.2.1.2.2.1.2'))
            for if_index, descr in results.items():
                descr_str = str(descr).upper()
                # Uplink ports typically have GE, XGE, ETH, or Ten in description
                if any(descr_str.startswith(p) for p in ('GE', 'XGE', 'ETH', 'TEN', 'GIG')):
                    if 'PON' not in descr_str:  # Exclude PON ports
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
            logger.debug(f"Standalone EPON uplink SNMP walk failed: {e}")

        return uplinks

    def _get_vendor_oids(self) -> dict:
        """Get vendor-specific OIDs based on OLT vendor field."""
        from olt_adapters.snmp_oids import VENDOR_OIDS
        vendor = (self.olt.vendor or 'standalone_epon').lower()
        return VENDOR_OIDS.get(vendor, VENDOR_OIDS.get('standalone_epon', {}))

    def collect_onus(self) -> list:
        """Collect ONU data via SNMP using vendor-specific OIDs."""
        onus = []
        try:
            from snmp_core import SNMPCollector
            oids = self._get_vendor_oids()
            sc = SNMPCollector(self.olt.ip_address, self.olt.snmp_community, self.olt.snmp_port or 161)

            # Walk ONU serial, status, RX power, description
            sn_oid = oids.get('onu_sn')
            status_oid = oids.get('onu_status')
            rx_oid = oids.get('olt_rx')
            desc_oid = oids.get('onu_desc')

            if not sn_oid or not status_oid:
                logger.warning(f"No ONU OIDs for vendor {self.olt.vendor}")
                sc.close()
                return []

            sn_res = sc._run(sc._walk_async(sn_oid))
            status_res = sc._run(sc._walk_async(status_oid))
            rx_res = sc._run(sc._walk_async(rx_oid)) if rx_oid else {}
            desc_res = sc._run(sc._walk_async(desc_oid)) if desc_oid else {}

            for idx, sn in sn_res.items():
                status_val = status_res.get(idx, 0)
                rx_raw = rx_res.get(idx)
                # RX power conversion: raw / 100 = dBm (for most EPON vendors)
                rx_power = None
                if rx_raw and rx_raw != 0:
                    rx_power = round(rx_raw / 100.0, 2)

                onu = {
                    'serial_number': str(sn) if sn else '',
                    'name': str(desc_res.get(idx, '')) if desc_res.get(idx) else '',
                    'status': 'online' if status_val == 1 else 'offline',
                    'rx_power': rx_power,
                    'onu_index': idx,
                }
                onus.append(onu)
            sc.close()
        except Exception as e:
            logger.error(f"Standalone EPON collect_onus failed: {e}")
        return onus

    def collect_chassis(self) -> dict:
        return {'slots': [], 'fans': [], 'psus': []}

    def poll_olt(self, progress_cb=None) -> dict:
        """Full sync for standalone EPON — SNMP-based collection."""
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
            sc = SNMPCollector(self.olt.ip_address, self.olt.snmp_community, self.olt.snmp_port or 161)

            report(10, 'Collecting system info...')
            result['system'] = sc.collect_system_info()

            report(25, 'Collecting ONU data via SNMP...')
            onus = self.collect_onus()
            result['onus'] = onus
            report(75, f'Found {len(onus)} ONUs')

            # Collect uplink/port info via IF-MIB
            report(80, 'Collecting port info...')
            pon_ports = []
            try:
                if_descr = sc._run(sc._walk_async('.1.3.6.1.2.1.2.2.1.2'))
                if_status = sc._run(sc._walk_async('.1.3.6.1.2.1.2.2.1.8'))
                for idx, descr in if_descr.items():
                    descr_str = str(descr).upper()
                    if 'PON' in descr_str or 'EPON' in descr_str:
                        pon_ports.append({
                            'port_number': idx,
                            'port_name': str(descr),
                            'admin_status': 'up',
                            'name': str(descr),
                            'description': '',
                            'onu_count': 0,
                            'onu_online': 0,
                            'onu_offline': 0,
                        })
            except Exception as e:
                logger.debug(f"Port walk failed: {e}")
            result['pon_ports'] = pon_ports

            result['chassis'] = {'fans': [], 'cards': []}
            result['success'] = True
            report(98, 'Poll complete')
            sc.close()
        except Exception as e:
            result['errors'].append(f'SNMP: {str(e)}')
            logger.error(f"Standalone EPON poll_olt failed: {e}")

        return result
