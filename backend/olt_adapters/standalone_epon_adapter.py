"""Multi-vendor SNMP OLT Adapter for HSGQ, VSOL, C-Data, BDCOM, Huawei, FiberHome, Raisecom, Dasan.

Provides SNMP-based ONU collection, optical RX/TX power normalization, and rack data
for monitoring and alerting.
"""

import logging
import re
from models import OLT, ONU, OLTPort, OLTUplink
from .base import BaseOLTAdapter
from .normalized import RackData, NormalizedSlot, NormalizedPort, NormalizedPsu
from .snmp_oids import VENDOR_OIDS
from .hioso_adapter import format_mac_or_sn, parse_optical_dbm, parse_onu_suffix

logger = logging.getLogger(__name__)


class StandaloneEponAdapter(BaseOLTAdapter):
    """Generic SNMP adapter for HSGQ, VSOL, C-Data, BDCOM, Huawei, FiberHome, Raisecom, Dasan."""

    vendor = 'standalone_epon'
    supported_models = []
    cli_protocol = 'telnet'

    def _default_pon_count(self) -> int:
        model = (self.olt.model or '').upper()
        if '16' in model:
            return 16
        if '8' in model:
            return 8
        if '2' in model and '2P' in model:
            return 2
        return 4

    def get_rack_data(self, refresh: bool = False) -> RackData:
        olt = self.olt
        brand = (olt.vendor or 'EPON').upper()
        if brand == 'STANDALONE_EPON':
            brand = 'EPON'

        rack = RackData(
            brand=brand,
            model=olt.model or 'OLT',
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
                    description=pp.name or pp.port_name or f'PON {pp.port_number}',
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
                    description=f'PON {pnum}',
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
                    description=f'GE{u_idx}',
                    source='default',
                ))

        rack.pon_port_count = sum(1 for p in ports if not p.is_uplink)
        rack.uplink_port_count = sum(1 for p in ports if p.is_uplink)

        slot = NormalizedSlot(
            slot_index=1,
            card_type=brand,
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

    def collect_onus(self) -> list:
        """Collect ONU data via SNMP using vendor-specific OIDs."""
        onus = []
        try:
            from snmp_core import SNMPCollector
            vendor = (self.olt.vendor or '').lower()
            oids = VENDOR_OIDS.get(vendor, {})
            if not oids:
                logger.warning(f"No SNMP OID mapping for vendor '{vendor}'")
                return []

            sc = SNMPCollector(self.olt.ip_address, self.olt.snmp_community or 'public', self.olt.snmp_port or 161)
            sn_oid = oids.get('onu_sn') or oids.get('onu_mac')
            name_oid = oids.get('onu_name') or oids.get('onu_desc')
            status_oid = oids.get('onu_status')
            rx_oid = oids.get('olt_rx') or oids.get('onu_rx')
            dist_oid = oids.get('onu_distance')

            sn_res = sc._run(sc._walk_async(sn_oid)) if sn_oid else {}
            name_res = sc._run(sc._walk_async(name_oid)) if name_oid else {}
            status_res = sc._run(sc._walk_async(status_oid)) if status_oid else {}
            rx_res = sc._run(sc._walk_async(rx_oid)) if rx_oid else {}
            dist_res = sc._run(sc._walk_async(dist_oid)) if dist_oid else {}

            all_keys = list(dict.fromkeys(list(status_res.keys()) + list(sn_res.keys()) + list(name_res.keys())))
            for key in all_keys:
                slot, port, onu_id = parse_onu_suffix(key)
                serial = format_mac_or_sn(sn_res.get(key))
                name = str(name_res.get(key, '') or '').strip()

                raw_st = status_res.get(key, 0)
                try:
                    st_int = int(raw_st)
                except Exception:
                    st_int = 1 if str(raw_st).strip().lower() in ('1', 'up', 'online', 'working') else 0

                if st_int == 1 or (vendor == 'bdcom' and st_int == 3):
                    status = 'online'
                else:
                    status = 'offline'

                rx_dbm = parse_optical_dbm(rx_res.get(key))
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
                    'serial_number': serial or f'{vendor.upper()}-{slot}-{port}-{onu_id}',
                    'name': name or f'ONU_{slot}/{port}:{onu_id}',
                    'description': name,
                    'status': status,
                    'oper_state': 4 if status == 'online' else 2,
                    'reg_status': 1,
                    'rx_power': rx_dbm if status == 'online' else None,
                    'onu_rx_power': rx_dbm if status == 'online' else None,
                    'tx_power': None,
                    'distance': dist_val,
                    'actual_type': '',
                    'last_dereg_reason': '',
                    'pppoe': '',
                })
            sc.close()
        except Exception as e:
            logger.error(f"[{self.olt.vendor}:{self.olt.name}] collect_onus failed: {e}")
        return onus

    def poll_olt(self, progress_cb=None, light=False) -> dict:
        """Full or light SNMP poll for non-ZTE OLT."""
        def report(pct, msg):
            if progress_cb:
                progress_cb(pct, msg)
            logger.info(f"  [{self.olt.vendor} {pct}%] {msg}")

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
            result['errors'].append('SNMP harus diaktifkan untuk OLT ini')
            return result

        try:
            from snmp_core import SNMPCollector
            report(10, f'Menghubungi SNMP OLT ({self.olt.ip_address})...')
            sc = SNMPCollector(self.olt.ip_address, self.olt.snmp_community or 'public', self.olt.snmp_port or 161)

            sys_info = sc.collect_system_info()
            result['system'] = sys_info

            report(30, 'Mengambil daftar ONU & sinyal optik via SNMP...')
            onus = self.collect_onus()
            result['onus'] = onus

            if not sys_info.get('uptime') and not sys_info.get('description') and not onus:
                result['errors'].append(f'SNMP timeout ke {self.olt.ip_address}:{self.olt.snmp_port or 161}')
                sc.close()
                return result

            result['snmp_ok'] = True
            report(75, f'Terbaca {len(onus)} ONU')

            if not light:
                discovered_ports = sorted({o['port'] for o in onus} | set(range(1, self._default_pon_count() + 1)))
                pon_ports = []
                for pnum in discovered_ports:
                    pon_ports.append({
                        'port_number': pnum,
                        'port_name': f'epon-olt_1/1/{pnum}',
                        'admin_status': 'up',
                        'name': f'PON 0/{pnum}',
                        'description': '',
                        'onu_count': sum(1 for o in onus if o['port'] == pnum),
                        'onu_online': sum(1 for o in onus if o['port'] == pnum and o['status'] == 'online'),
                        'onu_offline': sum(1 for o in onus if o['port'] == pnum and o['status'] != 'online'),
                    })
                result['pon_ports'] = pon_ports
                result['chassis'] = {
                    'temperature': None,
                    'fans': [],
                    'cards': [{
                        'slot': 1,
                        'type': 'ETGH',
                        'status': 'inservice',
                        'port_count': len(pon_ports),
                    }],
                }

            result['success'] = True
            report(98, 'Sinkronisasi selesai')
            sc.close()
        except Exception as e:
            result['errors'].append(f'SNMP: {str(e)}')
            logger.error(f"[{self.olt.vendor}:{self.olt.name}] poll_olt failed: {e}")

        return result
