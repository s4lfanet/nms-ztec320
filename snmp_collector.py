"""
SNMP & CLI collector — compatibility shim.

Actual code is split into:
- snmp_core.py: OIDs, decode/parse functions, SNMPCollector class
- telnet_client.py: SimpleTelnet/SimpleSSH class, TelnetCollector class (SSH or Telnet)

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
    decode_c300_run_status, classify_onu_status,
    SNMPCollector,
    # SNMP registration exports
    encode_pon_index, encode_sn_to_hex,
    OID_REG_TYPE_NAME, OID_REG_NAME, OID_REG_DESCRIPTION,
    OID_REG_SERIAL, OID_REG_ENTRY_STATUS, OID_REG_MODE,
    OID_UNCFG_SERIAL, OID_UNCFG_PASSWORD, OID_UNCFG_MODEL,
    # SNMP profile OIDs
    OID_BW_PROFILE_NAME, OID_BW_PROFILE_FIXED, OID_BW_PROFILE_ASSURED,
    OID_BW_PROFILE_MAXIMUM, OID_BW_PROFILE_TYPE,
    OID_TRAFFIC_PROFILE_NAME, OID_TRAFFIC_PROFILE_SIR, OID_TRAFFIC_PROFILE_PIR,
    OID_DOT1Q_VLAN_STATIC_NAME,
    # C300 exports
    decode_c300_run_status, decode_c300_onu_rx_power, decode_c300_olt_rx,
    parse_c300_ifindex, parse_c300_ponindex,
)

# Re-export all public names from telnet_client
from telnet_client import SimpleTelnet, TelnetCollector

logger = logging.getLogger(__name__)


def create_cli_collector(olt):
    """Factory: create CLI collector for ZTE OLT.
    Uses SSH if olt.ssh_enabled, otherwise Telnet.
    Returns TelnetCollector with appropriate transport."""
    if olt.ssh_enabled:
        port = olt.ssh_port or 22
        return TelnetCollector(
            olt.ip_address, olt.cli_username, olt.cli_password, port,
            use_ssh=True,
            snmp_community=olt.snmp_community or 'public',
            snmp_port=olt.snmp_port or 161)
    else:
        port = olt.telnet_port or 23
        return TelnetCollector(
            olt.ip_address, olt.cli_username, olt.cli_password, port,
            snmp_community=olt.snmp_community or 'public',
            snmp_port=olt.snmp_port or 161)


def create_snmp_collector(olt):
    """Factory: create SNMPCollector from OLT object.
    Uses read community for GET, write community for SET if configured."""
    return SNMPCollector(
        olt.ip_address,
        olt.snmp_community or 'public',
        olt.snmp_port or 161)


def get_write_community(olt):
    """Get SNMP write community from OLT, falling back to read community."""
    return olt.snmp_community_write or olt.snmp_community or 'private'


# ==================== COMBINED POLL ====================

def poll_olt(olt, progress_cb=None, light=False):
    """Poll OLT data. CLI (SSH or Telnet) as primary, SNMP for signal power.
    Auto-detects C300 vs C320 to select correct transport ( SNMP OIDs).
    
    When light=True: SNMP-only mode — collect ONU status/signal/name/serial via SNMP walks.
    No CLI connection, no config data (VLANs, profiles, uplinks). 
    Much lighter on OLT CPU/RAM. Used for frequent auto-sync.
    
    When light=False: Full sync — CLI (SSH or Telnet) for ONU data + config, SNMP for signal enrichment.
    """
    def report(pct, msg):
        if progress_cb: progress_cb(pct, msg)
        logger.info(f"  [{pct}%] {msg}")

    result = {'system': {}, 'onus': [], 'chassis': {}, 'success': False, 'errors': [], 'telnet_ok': False, 'snmp_ok': False}

    # Detect model
    model = (olt.model or 'C320').upper()
    is_c300 = 'C300' in model

    # ─── LIGHT SYNC: SNMP only, no CLI ───
    if light:
        if not olt.snmp_enabled:
            result['errors'].append('Light sync requires SNMP enabled')
            return result
        try:
            report(5, 'Light sync: connecting SNMP...')
            collector = SNMPCollector(olt.ip_address, olt.snmp_community, olt.snmp_port)
            result['system'] = collector.collect_system_info()
            report(20, 'Light sync: collecting ONUs via SNMP...')
            if is_c300:
                # C300 light sync — use C300 SNMP collection
                snmp_signal = collector.collect_onus_c300()
                # Build ONU list from C300 signal data
                onus = []
                for sn, sig in snmp_signal.get('by_sn', {}).items():
                    _status = decode_c300_run_status(sig.get('oper_state', 0))
                    _rx = sig.get('rx_power')
                    _onu_rx = sig.get('onu_rx_power')
                    onus.append({
                        'serial_number': sn,
                        'status': _status,
                        'oper_state': sig.get('oper_state', 0),
                        'rx_power': _rx,
                        'onu_rx_power': _onu_rx,
                        'tx_power': sig.get('tx_power'),
                        'distance': sig.get('distance'),
                        'actual_type': sig.get('actual_type', ''),
                        'name': '', 'description': '',
                        'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 0, 'onu_index': 0,
                        'reg_status': 0, 'last_dereg_reason': '', 'pppoe': '',
                    })
            else:
                onus = collector.collect_onus_light()
            collector.close()

            # EPON ONUs are invisible to SNMP — collect via CLI if enabled
            if olt.telnet_enabled or olt.ssh_enabled:
                try:
                    if olt.ssh_enabled:
                        port = olt.ssh_port or 22
                        report(50, f'Light sync: collecting EPON ONUs via SSH ({olt.ip_address}:{port})...')
                    else:
                        port = olt.telnet_port or 23
                        report(50, f'Light sync: collecting EPON ONUs via CLI/Telnet ({olt.ip_address}:{port})...')
                    tc_epon = create_cli_collector(olt)
                    epon_onus = tc_epon._collect_epon_onus_fast(olt.ip_address, olt.cli_username, olt.cli_password, port)
                    result['telnet_ok'] = True
                    if epon_onus:
                        onus.extend(epon_onus)
                        report(70, f'Light sync: +{len(epon_onus)} EPON ONUs via CLI')
                except Exception as e:
                    logger.debug(f"EPON light collection: {e}")

            result['onus'] = onus
            result['success'] = True
            result['snmp_ok'] = True
            report(90, f'Light sync: {len(onus)} ONUs collected')
        except Exception as e:
            result['errors'].append(f'SNMP light: {str(e)}')
            logger.error(f"Light sync {olt.name} failed: {e}")
        report(98, 'Light sync complete')
        return result

    # ─── FULL SYNC: CLI (SSH or Telnet) primary + SNMP signal + config data ───
    snmp_signal = {}  # keyed by serial number
    if olt.snmp_enabled:
        collector = None
        try:
            report(5, 'Connecting SNMP...')
            collector = SNMPCollector(olt.ip_address, olt.snmp_community, olt.snmp_port)
            result['system'] = collector.collect_system_info()
            result['snmp_ok'] = True
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

    # Step 2: CLI (SSH or Telnet for both C300 and C320) — PRIMARY source for ALL ONU data
    # If CLI not enabled, fall back to SNMP-only ONU collection (like light sync)
    if not (olt.telnet_enabled or olt.ssh_enabled):
        if olt.snmp_enabled and result.get('snmp_ok'):
            try:
                report(30, 'No CLI — collecting ONUs via SNMP...')
                snmp_col = SNMPCollector(olt.ip_address, olt.snmp_community, olt.snmp_port)
                if is_c300:
                    snmp_sig = snmp_col.collect_onus_c300()
                    onus = []
                    for sn, sig in snmp_sig.get('by_sn', {}).items():
                        _status = decode_c300_run_status(sig.get('oper_state', 0))
                        _rx = sig.get('rx_power')
                        _onu_rx = sig.get('onu_rx_power')
                        onus.append({
                            'serial_number': sn, 'status': _status,
                            'oper_state': sig.get('oper_state', 0),
                            'rx_power': _rx, 'onu_rx_power': _onu_rx,
                            'tx_power': sig.get('tx_power'),
                            'distance': sig.get('distance'),
                            'actual_type': sig.get('actual_type', ''),
                            'name': '', 'description': '',
                            'frame': 1, 'slot': 1, 'port': 1, 'onu_id': 0, 'onu_index': 0,
                            'reg_status': 0, 'last_dereg_reason': '', 'pppoe': '',
                        })
                else:
                    onus = snmp_col.collect_onus_light()
                snmp_col.close()
                result['onus'] = onus
                result['success'] = True
                report(75, f'SNMP: found {len(onus)} ONUs (no CLI)')
            except Exception as e:
                result['errors'].append(f'SNMP ONUs: {str(e)}')
                logger.error(f"SNMP ONU collection {olt.name} failed: {e}")
        report(90, 'SNMP-only sync: ONU data collected')

    if olt.telnet_enabled or olt.ssh_enabled:
        try:
            if olt.ssh_enabled:
                port = olt.ssh_port or 22
                report(30, f'Connecting SSH ({olt.ip_address}:{port})...')
            else:
                port = olt.telnet_port or 23
                report(30, f'Connecting Telnet ({olt.ip_address}:{port})...')
            tc = create_cli_collector(olt)

            # Get chassis info
            chassis = tc.collect_chassis_info()
            result['chassis'] = chassis
            result['telnet_ok'] = True
            report(35, f'CLI: temp={chassis.get("temperature")}C, fans={len(chassis.get("fans", []))}')

            # Get ALL ONU data from CLI as primary source
            report(38, 'Collecting ONU data via CLI (primary source)...')
            onus = tc.collect_all_onus()
            report(75, f'CLI: found {len(onus)} ONUs')

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

                # Skip SNMP enrichment for EPON ONUs — SNMP doesn't support EPON
                if onu.get('card_type') == 'epon':
                    continue

                # Try SN match first
                if sn in snmp_by_sn:
                    sig = snmp_by_sn[sn]
                    # OID .10 = ONU RX (correct). OID .18 = WRONG on ZTE C320 V2.1.0.
                    # OLT RX (rx_power) is collected via CLI 'show pon power attenuation'
                    # in enrich_onus above — do NOT overwrite with bad OID .18.
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
                pon_cards = [c for c in chassis.get('cards', []) if c.get('type', '').upper().startswith('GTG') or c.get('type', '').upper().startswith('ETG')]
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

            report(97, f'Done: {len(onus)} ONUs with CLI data + SNMP signal + config')

        except Exception as e:
            result['errors'].append(f'CLI: {str(e)}')
            logger.error(f"CLI {olt.name} failed: {e}")

    # ─── SNMP-ONLY CONFIG: If no CLI, collect config via SNMP ───
    if not result.get('telnet_ok') and olt.snmp_enabled:
        try:
            report(91, 'Collecting config via SNMP (no CLI)...')
            snmp_col = SNMPCollector(olt.ip_address, olt.snmp_community, olt.snmp_port)
            try:
                vlans = snmp_col.collect_vlans_snmp()
                if vlans:
                    result['vlans'] = vlans
                    logger.info(f'  SNMP: collected {len(vlans)} VLANs')
                report(92, 'Collecting TCONT profiles via SNMP...')
                tcont_profiles = snmp_col.collect_tcont_profiles_snmp()
                if tcont_profiles:
                    result['speed_profiles'] = {
                        'tcont': [{'name': p['name'], 'type': p['type'],
                                    'fixed_bandwidth': p['fixed'],
                                    'assured_bandwidth': p['assured'],
                                    'max_bandwidth': p['maximum']} for p in tcont_profiles],
                        'traffic': [],
                    }
                    logger.info(f'  SNMP: collected {len(tcont_profiles)} TCONT profiles')
                report(93, 'Collecting traffic profiles via SNMP...')
                traffic_profiles = snmp_col.collect_traffic_profiles_snmp()
                if traffic_profiles:
                    if 'speed_profiles' not in result:
                        result['speed_profiles'] = {'tcont': [], 'traffic': []}
                    result['speed_profiles']['traffic'] = [
                        {'name': p['name'], 'sir': p['sir'], 'pir': p['pir']} for p in traffic_profiles
                    ]
                    logger.info(f'  SNMP: collected {len(traffic_profiles)} traffic profiles')
                report(95, 'SNMP config collection done')
            finally:
                snmp_col.close()
        except Exception as e:
            logger.warning(f'SNMP config collection failed: {e}')

    report(98, 'Poll complete')
    return result
