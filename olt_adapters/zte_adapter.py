"""ZTE OLT adapter — wraps existing telnet_client.py + snmp_core.py.

Supports ZTE C300, C320, C300 Mini models.
Uses Telnet for CLI (both C300 and C320), SNMP for signal/health data.
C300 uses different SNMP OID trees (.3902.1082 / .3902.1015) vs C320 (.3902.1012).
"""

import logging
from models import OLT, OLTCard, OLTUplink, ONU, Fan, OLTPort
from extensions import db
from .base import BaseOLTAdapter
from .normalized import RackData, NormalizedSlot, NormalizedPort, NormalizedFan, NormalizedPsu

logger = logging.getLogger(__name__)


class ZteAdapter(BaseOLTAdapter):
    """ZTE C300/C320/C300 Mini adapter — reuses existing DB data + collectors."""

    vendor = 'zte'
    supported_models = []  # Empty = supports all ZTE models
    cli_protocol = 'telnet'

    def get_rack_data(self, refresh: bool = False) -> RackData:
        """Build normalized RackData from DB (populated by sync)."""
        olt = self.olt
        model = (olt.model or 'C320').upper()
        is_mini = 'MINI' in model

        rack = RackData(
            brand='ZTE',
            model=olt.model or 'C320',
            supported=True,
            standalone=is_mini,
            uptime=self._get_uptime(),
            chassis_temp=None,
        )

        # Load DB data
        cards = OLTCard.query.filter_by(olt_id=olt.id).all()
        uplinks = OLTUplink.query.filter_by(olt_id=olt.id).all()
        onus = ONU.query.filter_by(olt_id=olt.id).all()
        fans = Fan.query.filter_by(olt_id=olt.id).all()
        pon_ports_db = OLTPort.query.filter_by(olt_id=olt.id).all()

        # Build per-port ONU stats (key = "slot/port")
        port_stats = {}
        for onu in onus:
            key = f"{onu.slot}/{onu.port}"
            if key not in port_stats:
                port_stats[key] = {
                    'total': 0, 'online': 0, 'los': 0,
                    'dyinggasp': 0, 'unregistered': 0, 'rxPowers': []
                }
            port_stats[key]['total'] += 1
            st = (onu.status or '').lower()
            if st == 'online':
                port_stats[key]['online'] += 1
            elif st == 'los':
                port_stats[key]['los'] += 1
            elif st == 'dyinggasp':
                port_stats[key]['dyinggasp'] += 1
            if onu.rx_power is not None:
                port_stats[key]['rxPowers'].append(onu.rx_power)

        # Build PON port lookup by slot
        pon_by_slot = {}
        for pp in pon_ports_db:
            parts = (pp.port_name or '').replace('gpon-olt_', '').split('/')
            try:
                sidx_p = int(parts[1]) if len(parts) >= 3 else 0
                pidx_p = int(parts[2]) if len(parts) >= 3 else pp.port_number
            except (ValueError, IndexError):
                sidx_p, pidx_p = 0, pp.port_number
            if sidx_p not in pon_by_slot:
                pon_by_slot[sidx_p] = {}
            pon_by_slot[sidx_p][pidx_p] = pp

        # Group uplinks by slot
        uplink_by_slot = {}
        for ul in uplinks:
            name = ul.port_name or ''
            stripped = name.replace('xgei_1/', '').replace('gei_1/', '')
            parts = stripped.split('/')
            if len(parts) >= 2:
                try:
                    slot_idx = int(parts[0])
                    port_idx = int(parts[1])
                except ValueError:
                    continue
                if slot_idx not in uplink_by_slot:
                    uplink_by_slot[slot_idx] = []
                uplink_by_slot[slot_idx].append((port_idx, ul))

        # Build slots
        for card in cards:
            slot = self._build_slot(card, port_stats, pon_by_slot, uplink_by_slot)
            rack.slots.append(slot)

        # Build fans
        for fan in fans:
            rack.fans.append(NormalizedFan(
                index=fan.fan_number,
                status='active' if (fan.status or '').lower() in ('online', 'normal', 'running') else 'inactive',
                rpm=fan.rpm,
            ))

        # ZTE C320 has PSU (PRWH card) — extract from slot data
        for s in rack.slots:
            if s.slot_index <= 1 and s.is_present and s.current_ma is not None:
                rack.psus.append(NormalizedPsu(
                    index=1,
                    status='normal' if s.card_status == 'inservice' else 'fault',
                    current=s.current_ma,
                ))

        # Sort slots by index
        rack.slots.sort(key=lambda s: s.slot_index)

        # Count ports
        all_ports = [p for s in rack.slots for p in s.ports]
        rack.pon_port_count = sum(1 for p in all_ports if not p.is_uplink)
        rack.uplink_port_count = sum(1 for p in all_ports if p.is_uplink)

        return rack

    def _get_uptime(self) -> str:
        """Get uptime string from SNMP or DB."""
        try:
            from snmp_core import SNMPCollector
            sc = SNMPCollector(self.olt.ip_address, self.olt.snmp_community, self.olt.snmp_port or 161)
            info = sc.collect_system_info()
            return info.get('uptime_str') or None
        except Exception:
            return None

    def _build_slot(self, card: OLTCard, port_stats: dict,
                    pon_by_slot: dict, uplink_by_slot: dict) -> NormalizedSlot:
        """Build a NormalizedSlot from OLTCard + port stats."""
        ct = (card.card_type or '').upper()
        is_service = ct.startswith('GTG') or ct.startswith('GTC')
        # C320 uplink: SMXA, GICF, GISF  |  C300 uplink/control: SCXN, SCXM, SCXO
        is_uplink = ct.startswith('SMXA') or ct in ('GICF', 'GISF', 'SMXA-A', 'SMXA-B', 'SCXN', 'SCXM', 'SCXO', 'HUVQ')

        slot = NormalizedSlot(
            slot_index=card.slot,
            card_type=card.card_type or 'EMPTY',
            is_present=True,
            card_status=(card.status or 'offline').lower().replace('hwoffline', 'fault') if card.status else 'empty',
            oper_status='up' if (card.status or '').upper() == 'INSERVICE' else 'down',
            cpu_usage=card.cpu_usage or None,
            memory_usage=card.memory_usage or None,
            temperature=card.temperature,
        )

        if is_service:
            slot.ports = self._build_pon_ports(card, port_stats, pon_by_slot)
        elif is_uplink:
            slot.ports = self._build_uplink_ports(card, uplink_by_slot)
            # If no uplinks in DB for this slot, create placeholder ports from card port count
            if not slot.ports:
                for p in range(1, (card.total_ports or 4) + 1):
                    slot.ports.append(NormalizedPort(
                        port_index=p, is_uplink=True,
                        admin_up=None, oper_up=None,
                        source='card-status',
                    ))

        return slot

    def _build_pon_ports(self, card: OLTCard, port_stats: dict,
                         pon_by_slot: dict) -> list:
        """Build normalized PON ports for a service card."""
        sidx = card.slot
        port_count = card.total_ports or 16
        slot_pon = pon_by_slot.get(sidx, {})
        stat_ports = {int(k.split('/')[1]) for k in port_stats if k.split('/')[0] == str(sidx)}
        actual_ports = sorted(p for p in set(list(slot_pon.keys()) + list(stat_ports)) if p != 0)
        if not actual_ports:
            actual_ports = list(range(1, port_count + 1))

        ports = []
        for p in actual_ports:
            s = port_stats.get(f"{sidx}/{p}", {})
            meta = slot_pon.get(p)
            port = NormalizedPort(
                port_index=p,
                is_uplink=False,
                admin_up=(meta.admin_status if meta and meta.admin_status else 'up').lower() == 'up',
                oper_up=s.get('total', 0) > 0,
                description=meta.name if meta else None,
                total=s.get('total', meta.onu_count if meta else 0),
                online=s.get('online', meta.onu_online if meta else 0),
                offline=s.get('total', 0) - s.get('online', 0),
                los=s.get('los', 0),
                dying_gasp=s.get('dyinggasp', 0),
                unconfig=s.get('unregistered', 0),
                source='onu-data',
                port_id=meta.id if meta else None,
                sfp_tx_power=float(meta.sfp_tx_power) if meta and meta.sfp_tx_power and meta.sfp_tx_power.replace('.', '').replace('-', '').isdigit() else None,
                sfp_rx_power=float(meta.sfp_rx_power) if meta and meta.sfp_rx_power and meta.sfp_rx_power.replace('.', '').replace('-', '').isdigit() else None,
                sfp_bias_current=float(meta.sfp_bias_current) if meta and meta.sfp_bias_current and meta.sfp_bias_current.replace('.', '').isdigit() else None,
                sfp_voltage=float(meta.sfp_voltage) if meta and meta.sfp_voltage and meta.sfp_voltage.replace('.', '').isdigit() else None,
                sfp_temperature=float(meta.sfp_temperature) if meta and meta.sfp_temperature and meta.sfp_temperature.replace('.', '').replace('-', '').isdigit() else None,
                sfp_wavelength=float(meta.sfp_wavelength) if meta and meta.sfp_wavelength and meta.sfp_wavelength.replace('.', '').isdigit() else None,
                sfp_vendor=meta.sfp_vendor if meta and meta.sfp_vendor else None,
                sfp_model=meta.sfp_type if meta and meta.sfp_type else None,
            )
            ports.append(port)
        return ports

    def _build_uplink_ports(self, card: OLTCard, uplink_by_slot: dict) -> list:
        """Build normalized uplink ports for an uplink card."""
        sidx = card.slot
        ul_list = sorted(uplink_by_slot.get(sidx, []), key=lambda x: x[0])
        ports = []
        for port_idx, ul in ul_list:
            port = NormalizedPort(
                port_index=port_idx,
                is_uplink=True,
                admin_up=(ul.admin_status or 'up').lower() == 'up',
                oper_up=(ul.oper_status or 'down').lower() == 'up',
                description=ul.description or None,
                uplink_id=ul.id,
                sfp_vendor=ul.sfp_vendor or None,
                sfp_model=ul.sfp_type or None,
                sfp_wavelength=float(ul.sfp_wavelength) if ul.sfp_wavelength and ul.sfp_wavelength.replace('.', '').isdigit() else None,
                sfp_temperature=float(ul.sfp_temperature) if ul.sfp_temperature and ul.sfp_temperature.replace('.', '').replace('-', '').isdigit() else None,
                sfp_tx_power=float(ul.sfp_tx_power) if ul.sfp_tx_power and ul.sfp_tx_power.replace('.', '').replace('-', '').isdigit() else None,
                sfp_rx_power=float(ul.sfp_rx_power) if ul.sfp_rx_power and ul.sfp_rx_power.replace('.', '').replace('-', '').isdigit() else None,
                sfp_bias_current=float(ul.sfp_bias_current) if ul.sfp_bias_current and ul.sfp_bias_current.replace('.', '').isdigit() else None,
                sfp_voltage=float(ul.sfp_voltage) if ul.sfp_voltage and ul.sfp_voltage.replace('.', '').isdigit() else None,
                source='ifmib',
            )
            ports.append(port)
        return ports

    def collect_onus(self) -> list:
        """Collect ONU data using TelnetCollector (Telnet for both C300 and C320)."""
        try:
            from snmp_collector import create_cli_collector
            tc = create_cli_collector(self.olt)
            return tc.collect_all_onus()
        except Exception as e:
            logger.error(f"ZTE collect_onus failed: {e}")
            return []

    def collect_chassis(self) -> dict:
        """Collect chassis data using TelnetCollector (Telnet for both C300 and C320)."""
        try:
            from snmp_collector import create_cli_collector
            tc = create_cli_collector(self.olt)
            tn = tc._connect()
            if not tn:
                return {'slots': [], 'fans': [], 'psus': []}
            try:
                cards = tc._parse_show_card(tc._send_command(tn, 'show card'))
                fans = tc._parse_show_fan(tc._send_command(tn, 'show fan'))
                return {'slots': cards, 'fans': fans, 'psus': []}
            finally:
                tn.write('exit\n')
                tn.close()
        except Exception as e:
            logger.error(f"ZTE collect_chassis failed: {e}")
            return {'slots': [], 'fans': [], 'psus': []}

    def poll_olt(self, progress_cb=None) -> dict:
        """Full sync — delegates to existing snmp_collector.poll_olt."""
        from snmp_collector import poll_olt as zte_poll
        return zte_poll(self.olt, progress_cb=progress_cb)
