"""Raisecom OLT adapter — ISCOM6820-GP, ISCOM5800E.

Modular chassis with GPON cards, fan tray, PSU.
SNMP for ONU/card health, Telnet for CLI operations.
"""

import logging
from models import OLT, ONU, OLTPort, OLTCard, Fan
from .base import BaseOLTAdapter
from .normalized import RackData, NormalizedSlot, NormalizedPort, NormalizedFan, NormalizedPsu

logger = logging.getLogger(__name__)


class RaisecomAdapter(BaseOLTAdapter):
    """Raisecom ISCOM6820-GP adapter."""

    vendor = 'raisecom'
    supported_models = ['ISCOM6820', 'ISCOM5800']
    cli_protocol = 'telnet'

    def get_rack_data(self, refresh: bool = False) -> RackData:
        olt = self.olt

        rack = RackData(
            brand='Raisecom',
            model=olt.model,
            supported=True,
            standalone=False,
            uptime=self._get_uptime(),
        )

        # Load DB data (populated by sync)
        cards = OLTCard.query.filter_by(olt_id=olt.id).all()
        onus = ONU.query.filter_by(olt_id=olt.id).all()
        fans = Fan.query.filter_by(olt_id=olt.id).all()
        pon_ports_db = OLTPort.query.filter_by(olt_id=olt.id).all()

        # Build port stats from ONUs
        port_stats = {}
        for onu in onus:
            key = f"{onu.slot}/{onu.port}"
            if key not in port_stats:
                port_stats[key] = {
                    'total': 0, 'online': 0, 'offline': 0,
                    'los': 0, 'dyinggasp': 0, 'authfail': 0,
                }
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

        # Build PON port lookup
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

        # Build slots from cards
        for card in cards:
            ct = (card.card_type or '').upper()
            slot = NormalizedSlot(
                slot_index=card.slot,
                card_type=card.card_type or 'EMPTY',
                is_present=True,
                card_status=(card.status or '').lower() if card.status else 'empty',
                oper_status='up' if (card.status or '').upper() == 'INSERVICE' else 'down',
                cpu_usage=card.cpu_usage or None,
                memory_usage=card.memory_usage or None,
                temperature=card.temperature,
            )

            # Build PON ports for GPON cards (GPSC, etc.)
            if 'GPSC' in ct or 'GPON' in ct or ct.startswith('GTG'):
                sidx = card.slot
                slot_pon = pon_by_slot.get(sidx, {})
                stat_ports = {int(k.split('/')[1]) for k in port_stats if k.split('/')[0] == str(sidx)}
                actual_ports = sorted(p for p in set(list(slot_pon.keys()) + list(stat_ports)) if p != 0)
                if not actual_ports:
                    actual_ports = list(range(1, (card.total_ports or 16) + 1))

                for p in actual_ports:
                    s = port_stats.get(f"{sidx}/{p}", {})
                    meta = slot_pon.get(p)
                    port = NormalizedPort(
                        port_index=p,
                        is_uplink=False,
                        admin_up=(meta.admin_status if meta and meta.admin_status else 'up').lower() == 'up',
                        oper_up=s.get('online', 0) > 0,
                        description=meta.name if meta else None,
                        total=s.get('total', meta.onu_count if meta else 0),
                        online=s.get('online', meta.onu_online if meta else 0),
                        offline=s.get('offline', 0),
                        los=s.get('los', 0),
                        dying_gasp=s.get('dyinggasp', 0),
                        auth_fail=s.get('authfail', 0),
                        source='onu-data',
                    )
                    slot.ports.append(port)

            slot.ports.sort(key=lambda p: p.port_index)
            rack.slots.append(slot)

        # Build fans
        for fan in fans:
            rack.fans.append(NormalizedFan(
                index=fan.fan_number,
                status='active' if (fan.status or '').lower() in ('online', 'normal', 'running') else 'inactive',
                rpm=fan.rpm,
            ))

        # PSU — Raisecom has PSU slots
        rack.psus = [NormalizedPsu(index=1, status='normal')]

        # Sort slots
        rack.slots.sort(key=lambda s: s.slot_index)

        # Count ports
        all_ports = [p for s in rack.slots for p in s.ports]
        rack.pon_port_count = sum(1 for p in all_ports if not p.is_uplink)
        rack.uplink_port_count = sum(1 for p in all_ports if p.is_uplink)

        return rack

    def _get_uptime(self) -> str:
        try:
            from snmp_core import SNMPCollector
            sc = SNMPCollector(self.olt.ip_address, self.olt.snmp_community, self.olt.snmp_port or 161)
            info = sc.collect_system_info()
            return info.get('uptime_str') or None
        except Exception:
            return None

    def collect_onus(self) -> list:
        """Collect ONU data via SNMP for Raisecom GPON."""
        onus = []
        try:
            from snmp_core import SNMPCollector
            from olt_adapters.snmp_oids import VENDOR_OIDS
            oids = VENDOR_OIDS.get('raisecom', {})
            sc = SNMPCollector(self.olt.ip_address, self.olt.snmp_community, self.olt.snmp_port or 161)

            # Walk ONU SN, status, description, distance, offline reason
            sn_res = sc._run(sc._walk_async(oids['onu_sn']))
            status_res = sc._run(sc._walk_async(oids['onu_status']))
            desc_res = sc._run(sc._walk_async(oids['onu_desc']))
            dist_res = sc._run(sc._walk_async(oids['onu_distance']))
            reason_res = sc._run(sc._walk_async(oids['onu_offline_reason']))
            rx_res = sc._run(sc._walk_async(oids['olt_rx']))

            # Offline reason code mapping
            reason_map = {2: 'los', 6: 'dyinggasp', 3: 'offline', 4: 'offline',
                          5: 'offline', 7: 'offline', 8: 'offline', 13: 'los', 24: 'offline'}

            for idx, sn in sn_res.items():
                status_val = status_res.get(idx, 3)
                reason_code = reason_res.get(idx, 0)
                rx_raw = rx_res.get(idx)
                # Raisecom RX: raw / 10 = dBm
                rx_power = None
                if rx_raw and rx_raw != 0:
                    rx_power = round(rx_raw / 10.0, 2)

                if status_val == 1:
                    status = 'online'
                elif reason_code == 6:
                    status = 'dyinggasp'
                elif reason_code == 2 or reason_code == 13:
                    status = 'los'
                else:
                    status = 'offline'

                onu = {
                    'serial_number': str(sn) if sn else '',
                    'name': str(desc_res.get(idx, '')) if desc_res.get(idx) else '',
                    'status': status,
                    'rx_power': rx_power,
                    'distance': dist_res.get(idx, 0) or 0,
                    'onu_index': idx,
                }
                onus.append(onu)
            sc.close()
        except Exception as e:
            logger.error(f"Raisecom collect_onus failed: {e}")
        return onus

    def collect_chassis(self) -> dict:
        return {'slots': [], 'fans': [], 'psus': []}

    def poll_olt(self, progress_cb=None) -> dict:
        """Full sync for Raisecom — SNMP-based collection."""
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
            oids = VENDOR_OIDS.get('raisecom', {})
            sc = SNMPCollector(self.olt.ip_address, self.olt.snmp_community, self.olt.snmp_port or 161)

            report(10, 'Collecting system info...')
            result['system'] = sc.collect_system_info()

            report(25, 'Collecting ONU data via SNMP...')
            onus = self.collect_onus()
            result['onus'] = onus
            report(75, f'Found {len(onus)} ONUs')

            # Collect board health
            report(80, 'Collecting board health...')
            try:
                temp_res = sc._run(sc._walk_async(oids['chassis_temp']))
                result['chassis'] = {
                    'temperature': list(temp_res.values())[0] if temp_res else None,
                    'fans': [],
                    'cards': [],
                }
            except Exception:
                result['chassis'] = {'fans': [], 'cards': []}

            result['success'] = True
            report(98, 'Poll complete')
            sc.close()
        except Exception as e:
            result['errors'].append(f'SNMP: {str(e)}')
            logger.error(f"Raisecom poll_olt failed: {e}")

        return result
