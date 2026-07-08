"""
SNMP & Telnet collector — compatibility shim.

Actual code is split into:
- snmp_core.py: OIDs, decode/parse functions, SNMPCollector class
- telnet_client.py: SimpleTelnet class, TelnetCollector class

This module re-exports everything for backward compatibility.
All existing `from snmp_collector import X` will continue to work.
"""
import logging

# Re-export all public names from snmp_core
from snmp_core import (
    OID_SYS_DESCR, OID_SYS_UPTIME,
    OID_ONU_NAME, OID_ONU_DESCRIPTION, OID_ONU_SERIAL,
    OID_REG_STATUS, OID_OPER_STATE, OID_DEREG_REASON,
    OID_RX_POWER, OID_TX_POWER, OID_OLT_RX,
    BOARD1_BASE, BOARD2_BASE, PON_INCREMENT,
    decode_oper_state, decode_dereg_reason, decode_rx_power,
    decode_distance, format_uptime, parse_serial,
    detect_vendor_from_sn, detect_model_from_sn, parse_pon_index,
    SNMPCollector,
    # C300 exports
    decode_c300_run_status, decode_c300_onu_rx_power, decode_c300_olt_rx,
    parse_c300_ifindex, parse_c300_ponindex,
)

# Re-export all public names from telnet_client
from telnet_client import SimpleTelnet, TelnetCollector

logger = logging.getLogger(__name__)


def create_cli_collector(olt):
    """Factory: create CLI collector for ZTE OLT (Telnet for both C300 and C320).
    Returns TelnetCollector with Telnet transport."""
    port = olt.telnet_port or 23
    return TelnetCollector(olt.ip_address, olt.cli_username, olt.cli_password, port)


# ==================== COMBINED POLL ====================

def poll_olt(olt, progress_cb=None):
    """Poll OLT data. Telnet/SSH as primary, SNMP for signal power only.
    Auto-detects C300 vs C320 to select correct transport (SSH/Telnet) and SNMP OIDs."""
    def report(pct, msg):
        if progress_cb: progress_cb(pct, msg)
        logger.info(f"  [{pct}%] {msg}")

    result = {'system': {}, 'onus': [], 'chassis': {}, 'success': False, 'errors': []}

    # Detect model — C300 uses different SNMP OIDs (but same Telnet CLI)
    model = (olt.model or 'C320').upper()
    is_c300 = 'C300' in model

    # Step 1: SNMP - system info + signal power
    snmp_signal = {}  # keyed by serial number
    if olt.snmp_enabled:
        collector = None
        try:
            report(5, 'Connecting SNMP...')
            collector = SNMPCollector(olt.ip_address, olt.snmp_community, olt.snmp_port)
            result['system'] = collector.collect_system_info()
            report(10, f'SNMP connected: {result["system"].get("description", "")[:50]}')
            if is_c300:
                snmp_signal = collector.collect_onus_c300()
            else:
                snmp_signal = collector.collect_onus()  # C320 path (unchanged)
            report(25, f'SNMP signal data: {len(snmp_signal.get("by_sn", {}))} by SN, {len(snmp_signal.get("rx_list", []))} by position')
            result['success'] = True
        except Exception as e:
            result['errors'].append(f'SNMP: {str(e)}')
            logger.error(f"SNMP {olt.name} failed: {e}")
        finally:
            if collector: collector.close()

    # Step 2: CLI (Telnet for both C300 and C320) - PRIMARY source for ALL ONU data
    if olt.telnet_enabled or olt.ssh_enabled:
        try:
            port = olt.telnet_port or 23
            report(30, f'Connecting Telnet ({olt.ip_address}:{port})...')
            tc = TelnetCollector(olt.ip_address, olt.cli_username, olt.cli_password, port)

            # Get chassis info
            chassis = tc.collect_chassis_info()
            result['chassis'] = chassis
            report(35, f'CLI: temp={chassis.get("temperature")}C, fans={len(chassis.get("fans", []))}')

            # Get ALL ONU data from Telnet as primary source
            report(38, 'Collecting ONU data via Telnet (primary source)...')
            onus = tc.collect_all_onus()
            report(75, f'Telnet: found {len(onus)} ONUs')

            # Enrich with SNMP signal power data - match by SN first, then positional
            snmp_by_sn = snmp_signal.get('by_sn', {})
            snmp_rx_list = snmp_signal.get('rx_list', [])
            snmp_tx_list = snmp_signal.get('tx_list', [])
            matched = 0
            for i, onu in enumerate(onus):
                sn = onu.get('serial_number', '')
                onu_status = (onu.get('status') or '').lower()

                # Skip SNMP enrichment for non-online ONUs — SNMP returns cached/stale
                # RX/TX values for offline/dyinggasp/los ONUs which is misleading
                if onu_status != 'online':
                    onu['rx_power'] = None
                    onu['onu_rx_power'] = None
                    onu['tx_power'] = None
                    continue

                # Try SN match first
                if sn in snmp_by_sn:
                    sig = snmp_by_sn[sn]
                    # OID .10 = ONU RX (correct). OID .18 = WRONG on ZTE C320 V2.1.0.
                    # OLT RX (rx_power) is collected via Telnet 'show pon power attenuation'
                    # in enrich_onus_via_telnet above — do NOT overwrite with bad OID .18.
                    if onu.get('rx_power') is None:
                        onu['rx_power'] = sig.get('rx_power')    # fallback to OID .18 if Telnet failed
                    onu['onu_rx_power'] = sig.get('onu_rx_power') # ONU RX (OID .10) — correct
                    if onu.get('tx_power') is None:
                        onu['tx_power'] = sig.get('tx_power')    # ONU TX (OID .11)
                    onu['oper_state'] = sig.get('oper_state', 0)
                    matched += 1
                # Fallback: positional match (Telnet order = SNMP walk order)
                elif i < len(snmp_rx_list):
                    if onu.get('rx_power') is None:
                        onu['rx_power'] = snmp_rx_list[i]
                    if onu.get('tx_power') is None:
                        onu['tx_power'] = snmp_tx_list[i] if i < len(snmp_tx_list) else None
                    if onu.get('rx_power') is not None:
                        matched += 1

            report(90, f'SNMP signal matched: {matched}/{len(onus)} ONUs')

            result['onus'] = onus
            result['success'] = True

            # Step 3: Collect configuration data (VLANs, ONU Types, Speed Profiles, WAN IP, Uplinks)
            try:
                report(91, 'Collecting VLAN configuration...')
                vlans = tc.collect_vlans()
                result['vlans'] = vlans
                logger.info(f'  Collected {len(vlans)} VLANs')
            except Exception as e:
                logger.warning(f'VLAN collection failed: {e}')
                result['vlans'] = []

            try:
                report(92, 'Collecting ONU types...')
                onu_types = tc.collect_onu_types()
                result['onu_types'] = onu_types
                logger.info(f'  Collected {len(onu_types)} ONU types')
            except Exception as e:
                logger.warning(f'ONU type collection failed: {e}')
                result['onu_types'] = []

            try:
                report(93, 'Collecting speed profiles...')
                speed_profiles = tc.collect_speed_profiles()
                result['speed_profiles'] = speed_profiles
                logger.info(f'  Collected {len(speed_profiles.get("tcont", []))} TCONT + {len(speed_profiles.get("traffic", []))} traffic profiles')
            except Exception as e:
                logger.warning(f'Speed profile collection failed: {e}')
                result['speed_profiles'] = {'tcont': [], 'traffic': []}

            try:
                report(94, 'Collecting WAN IP profiles...')
                wan_profiles = tc.collect_wan_ip_profiles()
                result['wan_ip_profiles'] = wan_profiles
                logger.info(f'  Collected {len(wan_profiles)} WAN IP profiles')
            except Exception as e:
                logger.warning(f'WAN IP profile collection failed: {e}')
                result['wan_ip_profiles'] = []

            try:
                report(95, 'Collecting uplink ports...')
                uplinks = tc.collect_uplinks()
                result['uplinks'] = uplinks
                logger.info(f'  Collected {len(uplinks)} uplink ports')
            except Exception as e:
                logger.warning(f'Uplink collection failed: {e}')
                result['uplinks'] = []

            # Collect PON port details from GPON cards
            try:
                report(96, 'Collecting PON port data...')
                pon_cards = [c for c in chassis.get('cards', []) if c.get('type', '').upper().startswith('GTG')]
                all_pon_ports = []
                for card in pon_cards:
                    slot = card.get('slot', 1)
                    pon_ports = tc.collect_pon_port_stats(slot)
                    for pp in pon_ports:
                        all_pon_ports.append(pp)
                result['pon_ports'] = all_pon_ports
                logger.info(f'  Collected {len(all_pon_ports)} PON ports')
            except Exception as e:
                logger.warning(f'PON port collection failed: {e}')
                result['pon_ports'] = []

            report(97, f'Done: {len(onus)} ONUs with Telnet data + SNMP signal + config')

        except Exception as e:
            result['errors'].append(f'CLI: {str(e)}')
            logger.error(f"CLI {olt.name} failed: {e}")

    report(98, 'Poll complete')
    return result
