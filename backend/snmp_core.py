"""
SNMP core collector for ZTE C320 OLT.
- Uses pysnmp 7.x Slim API (v1arch) - fast on Windows
- OIDs from salfanet-radius-go + oltc320 reference
- Contains: OIDs, decode/parse functions, SNMPCollector class
"""
import logging
import asyncio
import concurrent.futures
from typing import Any

logger = logging.getLogger(__name__)

# ==================== ZTE C320 SNMP OIDs ====================
OID_SYS_DESCR = '1.3.6.1.2.1.1.1.0'
OID_SYS_UPTIME = '1.3.6.1.2.1.1.3.0'
OID_SYS_NAME = '1.3.6.1.2.1.1.5.0'

# cfgTable (.3.28) - index: .ponIndex.onuId (2 components)
OID_ONU_NAME = '1.3.6.1.4.1.3902.1012.3.28.1.1.2'
OID_ONU_DESCRIPTION = '1.3.6.1.4.1.3902.1012.3.28.1.1.3'
OID_ONU_SERIAL = '1.3.6.1.4.1.3902.1012.3.28.1.1.5'

# regTable (.3.50.12) - index: .ponIndex.onuSlot.onuId (3 components)
OID_REG_STATUS = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.1'
OID_OPER_STATE = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.6'
OID_DEREG_REASON = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.7'
OID_RX_POWER = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.10'    # ONU RX (from OLT to ONU)
OID_TX_POWER = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.11'    # TX power
OID_DISTANCE = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.14'   # ONU distance (raw, decode with decode_distance)
OID_OLT_RX = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.18'      # OLT RX (from ONU to OLT)

BOARD1_BASE = 268500992
BOARD2_BASE = 268509184
PON_INCREMENT = 256

# ==================== ZTE C320 SNMP Registration OIDs ====================
# zxGponOntDevMgmtTable (.3.28.1.1) — index: .ponIndex.onuId
OID_REG_TYPE_NAME = '1.3.6.1.4.1.3902.1012.3.28.1.1.1'       # ONU type/profile (OctetString)
OID_REG_NAME = '1.3.6.1.4.1.3902.1012.3.28.1.1.2'            # ONU name (OctetString)
OID_REG_DESCRIPTION = '1.3.6.1.4.1.3902.1012.3.28.1.1.3'     # ONU description (OctetString)
OID_REG_SERIAL = '1.3.6.1.4.1.3902.1012.3.28.1.1.5'          # Serial number (OctetString hex)
OID_REG_ENTRY_STATUS = '1.3.6.1.4.1.3902.1012.3.28.1.1.9'    # RowStatus (4=createAndGo, 6=destroy)
OID_REG_MODE = '1.3.6.1.4.1.3902.1012.3.28.1.1.12'           # Auth mode (1=SN, 2=loid, 3=loid+password, 4=SN+password)

# Unconfigured ONU discovery — zxGponUnCfgSnOntInfoTable (.3.13.3.1) — index: .ponIndex.onuId
OID_UNCFG_SERIAL = '1.3.6.1.4.1.3902.1012.3.13.3.1.2'       # zxGponUnCfgSnOntSN — serial (OctetString hex)
OID_UNCFG_PASSWORD = '1.3.6.1.4.1.3902.1012.3.13.3.1.5'     # zxGponUnCfgSnOntPsw — password
OID_UNCFG_RID = '1.3.6.1.4.1.3902.1012.3.13.3.1.3'          # zxGponUnCfgSnOntRID — register ID
OID_UNCFG_STATE = '1.3.6.1.4.1.3902.1012.3.13.3.1.6'        # zxGponUnCfgSnOntState — state
OID_UNCFG_MODEL = '1.3.6.1.4.1.3902.1012.3.13.3.1.10'       # ONU type/model (extended column)

# ==================== ZTE C320 SNMP Profile OIDs ====================
# zxGponBandwidthProfileTable (.3.26.1) — TCONT profile (DBA bandwidth allocation)
# Index: profile index (Type 7 composite: 0x7{shelf:4}{0:8}{profileNo:16})
OID_BW_PROFILE_NAME = '1.3.6.1.4.1.3902.1012.3.26.1.1.2'       # zxGponBWProfileName (OctetString)
OID_BW_PROFILE_FIXED = '1.3.6.1.4.1.3902.1012.3.26.1.1.3'      # Fixed BW (kbps)
OID_BW_PROFILE_ASSURED = '1.3.6.1.4.1.3902.1012.3.26.1.1.4'    # Assured BW (kbps)
OID_BW_PROFILE_MAXIMUM = '1.3.6.1.4.1.3902.1012.3.26.1.1.5'    # Maximum BW (kbps)
OID_BW_PROFILE_TYPE = '1.3.6.1.4.1.3902.1012.3.26.1.1.6'       # TCONT type (1-5)

# zxGponTrafficProfileTable (.3.26.2) — GEM port traffic profile (SIR/PIR rate)
OID_TRAFFIC_PROFILE_NAME = '1.3.6.1.4.1.3902.1012.3.26.2.1.2'  # zxGponTrafficProfileName (OctetString)
OID_TRAFFIC_PROFILE_SIR = '1.3.6.1.4.1.3902.1012.3.26.2.1.3'   # SIR (kbps)
OID_TRAFFIC_PROFILE_PIR = '1.3.6.1.4.1.3902.1012.3.26.2.1.4'   # PIR (kbps)

# IEEE 802.1Q VLAN — dot1qVlanStaticTable (standard MIB, supported by ZTE)
OID_DOT1Q_VLAN_STATIC_NAME = '1.3.6.1.2.1.17.7.1.4.3.1.1'      # VLAN name (OctetString)
OID_DOT1Q_VLAN_STATIC_EGRESS = '1.3.6.1.2.1.17.7.1.4.3.1.2'    # Egress ports (HexString)
OID_DOT1Q_VLAN_STATIC_ROW_STATUS = '1.3.6.1.2.1.17.7.1.4.3.1.5' # RowStatus
OID_DOT1Q_VLAN_CURRENT_EGRESS = '1.3.6.1.2.1.17.7.1.4.2.1.1'   # Current egress ports
OID_DOT1Q_FDB_ID = '1.3.6.1.2.1.17.7.1.4.3.1.3'                # FDB ID


def encode_pon_index(slot, port):
    """Encode ZTE C320 PON index from slot and port (both 1-indexed CLI values).
    Reverse of parse_pon_index."""
    if slot >= 2:
        return BOARD2_BASE + port * PON_INCREMENT
    return BOARD1_BASE + port * PON_INCREMENT


def encode_sn_to_hex(serial_number):
    """Encode ZTE GPON serial number to hex OctetString for SNMP SET.
    GPON SN is 8 bytes: 4-byte vendor ID + 4-byte serial.
    e.g. 'ZTEGC40DF35B' -> bytes b'\\x5a\\x54\\x45\\x47\\xc4\\x0d\\xf3\\x5b'
    """
    sn = serial_number.strip().upper()
    # Already hex with 0x prefix
    if sn.startswith('0X'):
        hex_str = sn[2:]
        if len(hex_str) == 16:
            return bytes.fromhex(hex_str)
    # Standard GPON SN: 4 chars vendor + 8 hex chars
    if len(sn) == 12:
        vendor = sn[:4].encode('ascii')
        serial = bytes.fromhex(sn[4:])
        return vendor + serial
    # Fallback: pad/truncate to 8 bytes
    raw = sn.encode('ascii', errors='replace')
    return raw[:8].ljust(8, b'\\x00')

# ==================== ZTE C300 SNMP OIDs ====================
# C300 uses different OID trees than C320:
# - Tree .3902.1082 — ONU data (index: ifIndex.onuId)
# - Tree .3902.1015 — OLT-side optical (index: ponIndex.onuId)
# - Tree .3902.1082.500.20 — ONU-side optical (index: ifIndex.onuId.1)

# ONU data (index: ifIndex.onuId)
C300_OID_ONU_SERIAL_FMT = '1.3.6.1.4.1.3902.1082.500.10.2.3.3.1.18'    # Serial (formatted string)
C300_OID_ONU_SERIAL_HEX = '1.3.6.1.4.1.3902.1082.500.10.2.3.3.1.6'     # Serial (hex OctetString)
C300_OID_ONU_DESC = '1.3.6.1.4.1.3902.1082.500.10.2.3.3.1.2'           # Description
C300_OID_ONU_NAME = '1.3.6.1.4.1.3902.1082.500.10.2.3.3.1.3'           # ONU Name
C300_OID_ONU_MODEL = '1.3.6.1.4.1.3902.1082.500.20.2.1.2.1.8'          # Actual ONU Type/Model
C300_OID_RUN_STATUS = '1.3.6.1.4.1.3902.1082.500.10.2.3.8.1.4'         # Run Status (1=init,2=los,3=ranging,4=online,5=dyinggasp,6=offline,7=authfail)
C300_OID_DISTANCE = '1.3.6.1.4.1.3902.1082.500.10.2.3.10.1.2'          # Distance (meters)
C300_OID_PON_PORT_NAME = '1.3.6.1.4.1.3902.1082.500.10.2.2.3.1.1'      # PON Port Name (index: ifIndex)

# ONU-side optical power (index: ifIndex.onuId.1)
C300_OID_ONU_RX_POWER = '1.3.6.1.4.1.3902.1082.500.20.2.2.2.1.10'      # ONU Downstream RX (dBuW, (signed × 0.002) - 30 = dBm)
C300_OID_ONU_TX_POWER = '1.3.6.1.4.1.3902.1082.500.20.2.2.2.1.14'      # ONU Upstream TX (same formula)

# OLT-side optical power (index: ponIndex.onuId)
C300_OID_OLT_RX = '1.3.6.1.4.1.3902.1015.1010.11.2.1.2'                # OLT RX from ONT (raw / 1000 = dBm)
C300_OID_ONT_TX = '1.3.6.1.4.1.3902.1015.1010.11.2.1.3'                # ONT TX Power (raw / 1000 = dBm)

# Card / Board health (index: slot)
C300_OID_CARD_TYPE = '1.3.6.1.4.1.3902.1082.10.1.2.4.1.4.1.1'          # Card Type Name
C300_OID_CARD_STATUS = '1.3.6.1.4.1.3902.1082.10.1.2.4.1.5.1.1'        # Card Status (1=inservice)
C300_OID_CARD_CPU = '1.3.6.1.4.1.3902.1082.10.1.2.4.1.9.1.1'           # CPU Load %
C300_OID_CARD_MEM = '1.3.6.1.4.1.3902.1082.10.1.2.4.1.11.1.1'          # Memory Usage %
C300_OID_CARD_ROLE = '1.3.6.1.4.1.3902.1082.10.1.2.4.1.13.1.1'         # Role (1=main, 2=standby)
C300_OID_CARD_TEMP = '1.3.6.1.4.1.3902.1082.10.10.2.1.6.1.2.1.1'       # Temperature °C
C300_OID_FAN_SPEED = '1.3.6.1.4.1.3902.1082.10.10.2.1.6.1.5.1.1'       # Fan Speed RPM
C300_OID_PSU_VOLTAGE = '1.3.6.1.4.1.3902.1082.10.10.2.3.11.1.2.1.1'    # PSU Input Voltage


def decode_c300_run_status(value):
    """Decode C300 run status integer to status string."""
    m = {1: 'init', 2: 'los', 3: 'ranging', 4: 'online',
         5: 'dyinggasp', 6: 'offline', 7: 'authfail'}
    return m.get(value, 'offline')


def decode_c300_onu_rx_power(raw):
    """Decode C300 ONU-side RX/TX power (dBuW unsigned 16-bit).
    Formula: (signed_value × 0.002) - 30 = dBm
    0xFFFF (65535) = offline/not available."""
    if raw is None or raw == 0 or raw == 0xFFFF or raw == 65535:
        return None
    # Treat as signed 16-bit
    if raw >= 32768:
        raw = raw - 65536
    return round(raw * 0.002 - 30.0, 2)


def decode_c300_olt_rx(raw):
    """Decode C300 OLT-side RX power (raw / 1000 = dBm)."""
    if raw is None or raw == 0:
        return None
    # Treat as signed 32-bit
    if raw >= 2147483648:
        raw = raw - 4294967296
    return round(raw / 1000.0, 2)


def parse_c300_ifindex(if_index):
    """Parse C300 ifIndex to (slot, port).
    Format: 0x11{slot}{00}{port} — e.g. 0x11020001 = slot 2, port 1."""
    if if_index >= 0x11000000:
        slot = (if_index >> 16) & 0xFF
        port = if_index & 0xFFFF
        # port may be packed as {port}{00} — extract low byte
        if port >= 256:
            port = port >> 8
        return slot, port
    return 0, 0


def parse_c300_ponindex(pon_index):
    """Parse C300 ponIndex to (slot, port).
    Format: 0x10{slot}{port}{00} — e.g. 0x10020100 = slot 2, port 1."""
    if pon_index >= 0x10000000:
        slot = (pon_index >> 16) & 0xFF
        port = (pon_index >> 8) & 0xFF
        return slot, port
    return 0, 0


def decode_oper_state(value):
    """Decode ZTE C320 oper_state integer to status string.

    ZTE C320 V2.1.0 firmware mapping (verified via SNMP walk + CLI):
      1=not_present, 2=inactive, 3=activating, 4=online, 5=online, 6=dyinggasp

    Note: oper_state=5 means 'online' on C320 V2.1.0, NOT 'dyinggasp'.
    The C300 uses a different OID (C300_OID_RUN_STATUS) with different values.
    """
    m = {1: 'not_present', 2: 'inactive', 3: 'activating', 4: 'online', 5: 'online', 6: 'dyinggasp'}
    return m.get(value, 'offline')


def decode_dereg_reason(value):
    m = {0: '', 1: 'Unknown', 2: 'LOS', 3: 'LOSi', 4: 'LOFi', 5: 'SFi', 6: 'LOAi', 7: 'LOAMi',
         8: 'AuthFail', 9: 'PowerOff', 10: 'DeactiveSucc', 11: 'DeactiveFail', 12: 'Reboot', 13: 'Shutdown'}
    return m.get(value, f'Unknown({value})')


def classify_onu_status(oper_state, dereg_reason=0, olt_rx=None, onu_rx=None):
    """Classify ONU status using oper_state + dereg_reason + RX power.

    ZTE C320 V2.1.0 SNMP oper_state:
      1=not_present, 2=inactive, 3=activating, 4=online, 5=registered, 6=dyinggasp

    IMPORTANT: oper_state=5 means "registered" on C320 V2.1.0, NOT "online".
    All ONUs (online AND dyinggasp) report oper_state=5. The only way to
    distinguish via SNMP is RX power: dyinggasp ONUs have olt_rx=None AND
    onu_rx=None (raw values 0 or 65535), while online ONUs have valid signal.

    dereg_reason is a LATCHED value — it records the reason for the ONU's
    *last* deregistration and persists even after the ONU comes back online.
    Therefore dereg_reason should ONLY be used when the ONU has no signal
    (offline/dyinggasp), not when it's actively online.

    When oper_state=2 (inactive) or oper_state=5 with no signal, use
    dereg_reason to distinguish:
      LOS (2/3) → 'los' (fiber cut)
      PowerOff (9) → 'dyinggasp' (ONU powered down)
      AuthFail (8) → 'offline'
      other → 'offline'
    """
    status = decode_oper_state(oper_state)

    # oper_state=5 on C320 V2.1.0 means "registered" — could be online or dyinggasp.
    # Check RX power to determine actual state.
    if status == 'online':
        if olt_rx is None and onu_rx is None:
            # No signal — ONU is not truly online. Use dereg_reason to classify.
            dr = decode_dereg_reason(dereg_reason)
            if 'LOS' in dr:
                status = 'los'
            elif dr == 'PowerOff':
                status = 'dyinggasp'
            else:
                status = 'offline'

    # If inactive, use dereg_reason to distinguish los/dyinggasp/offline
    if status == 'inactive':
        dr = decode_dereg_reason(dereg_reason)
        if 'LOS' in dr:
            status = 'los'
        elif dr == 'PowerOff':
            status = 'dyinggasp'
        elif dr == 'AuthFail':
            status = 'offline'
        else:
            status = 'offline'

    return status


def decode_rx_power(raw):
    if raw is None or raw == 0 or raw == 0xFFFF or raw == 65535:
        return None
    return round(raw / 500.0 - 30.0, 2)


def decode_distance(raw):
    if raw is None:
        return None
    return int(raw * 0.112)


def format_uptime(centiseconds):
    if not centiseconds:
        return ''
    ts = centiseconds // 100
    return f'{ts // 86400} days {(ts % 86400) // 3600} hours {(ts % 3600) // 60} minutes'


def parse_serial(val):
    """Parse ZTE ONU serial from SNMP OctetString: first 4 bytes ASCII vendor, rest hex"""
    try:
        raw = bytes(val)
    except Exception:
        raw = val if isinstance(val, bytes) else str(val).encode()
    if isinstance(raw, bytes) and len(raw) >= 8:
        vendor = raw[:4].decode('ascii', errors='replace')
        sn_hex = raw[4:].hex().upper()
        return f'{vendor}{sn_hex}'
    if isinstance(val, str):
        s = val.strip()
        if s.startswith('0x'):
            s = s[2:]
            if len(s) >= 8:
                try:
                    vendor = bytes.fromhex(s[:8]).decode('ascii', errors='replace')
                    sn_hex = s[8:].upper()
                    return f'{vendor}{sn_hex}'
                except:
                    pass
        return s
    return str(val)


def detect_vendor_from_sn(sn):
    """Detect ONU vendor from serial number prefix.
    GPON SN format: 4 bytes ASCII vendor + 4+ bytes serial.
    Based on ITU-T L.162 standard + known ZTE C320 registered vendors."""
    if not sn:
        return 'Unknown'
    sn = sn.upper()
    prefix = sn[:4]
    VENDOR_MAP = {
        'FHTT': 'Fiberhome', 'FHTC': 'Fiberhome', 'FHHT': 'Fiberhome',
        'HWTC': 'Huawei', 'HWTB': 'Huawei', 'HWTD': 'Huawei', 'HWT9': 'Huawei',
        'ZTEG': 'ZTE', 'ZICG': 'ZTE', 'ZTES': 'ZTE', 'ZTEI': 'ZTE',
        'ALCL': 'Alcatel-Lucent', 'ALCF': 'Alcatel-Lucent',
        'ECRG': 'ECI', 'ECI0': 'ECI',
        'UBNT': 'Ubiquiti', 'SCOM': 'Sercomm', 'CXNK': 'Calix',
        'DLNK': 'D-Link', 'TPNK': 'TP-Link', 'GSWD': 'Genexis',
        'SPEN': 'Sagemcom', 'PRTL': 'Planet',
    }
    for known_prefix, vendor in VENDOR_MAP.items():
        if sn.startswith(known_prefix):
            return vendor
    # Fallback: use first 4 chars if they look like ASCII letters
    if prefix.isalpha() and len(prefix) == 4:
        return prefix
    return 'Unknown'


def detect_model_from_sn(sn, vendor):
    """Detect ONU model from serial number and vendor.
    On ZTE C320 V2.1 firmware, 'show gpon onu detail-info' reports Type='All' for all ONUs.
    Actual Equipment ID/Model is only available via SNMP V2.2+ OIDs.
    We use vendor-based known model mapping for the most common ONU types
    deployed in Indonesian FTTH networks."""
    if not sn or not vendor or vendor == 'Unknown':
        return ''
    MODELS = {
        'Fiberhome': 'HG6145D2',
        'Huawei': 'HG8145V5',
        'ZTE': 'F663NV3A',
        'Alcatel-Lucent': 'I-240G',
        'ECI': 'ONT-1G',
    }
    return MODELS.get(vendor, '')


def parse_pon_index(pon_index):
    if pon_index >= BOARD2_BASE:
        return 2, (pon_index - BOARD2_BASE) // PON_INCREMENT
    return 1, (pon_index - BOARD1_BASE) // PON_INCREMENT


# ==================== SNMP COLLECTOR (Slim API) ====================

class SNMPCollector:
    """Fast SNMP collector using pysnmp v1arch Slim API"""

    def __init__(self, ip, community='public', port=161, use_walk=False, max_repetitions=50):
        self.ip = ip
        self.community = community
        self.port = int(port)
        self.use_walk = use_walk  # Force GetNext for lossy/high-latency links
        self.max_repetitions = max_repetitions

    def close(self):
        pass

    # Module-level cache for SNMP counter samples (keyed by ip:ifIndex)
    # ZTE SNMP agent caches counters ~10s, so we store previous sample
    # and compute rate from delta between successive calls.
    # Cache entry: (in_octets, out_octets, timestamp, last_in_mbps, last_out_mbps)
    _snmp_counter_cache = {}
    _RATE_TTL = 60  # seconds before a stale rate is considered expired

    def get_port_traffic_rates_snmp(self, port_names, interval=3.0, double_read=False):
        """Get instantaneous traffic rates (Mbps) for ports via SNMP ifInOctets/ifOutOctets.
        Uses a cached previous sample to compute rate delta — ZTE SNMP agent only
        updates counters every ~10s, so when delta=0 we return the last known rate.
        port_names: list of SNMP ifName values (e.g. 'gpon_1/1/1', 'gei_1/3/1')
        double_read: if True, do a 2nd read after 'interval' seconds when no cache exists,
                     so first call returns real data instead of 0.0 (adds ~2s latency on first call only)
        Returns dict: {port_name: {'in_mbps': float, 'out_mbps': float}}"""
        result = {pn: {'in_mbps': 0.0, 'out_mbps': 0.0} for pn in port_names}
        try:
            loop = asyncio.new_event_loop()
            try:
                rates = loop.run_until_complete(self._get_port_rates_cached(port_names, interval=interval, double_read=double_read))
                for pn, r in rates.items():
                    result[pn] = r
            finally:
                loop.close()
        except Exception as e:
            logger.error(f"get_port_traffic_rates_snmp failed: {e}")
        return result

    @staticmethod
    def _zte_ifindex(port_name):
        """Compute ZTE ifIndex from ifName (e.g. 'gpon_1/1/1' -> 285278465).
        Format: {type}_{rack}/{slot}/{port} -> ifIndex = 0x11{slot}{type_id}{port}
        type_id: 1 for gpon, 0 for gei/xgei uplink ports."""
        try:
            prefix = port_name.split('_')[0].lower()
            parts = port_name.split('_')[1].split('/')
            slot = int(parts[1])
            port = int(parts[2])
            type_id = 1 if prefix == 'gpon' else 0
            return 0x11000000 | (slot << 16) | (type_id << 8) | port
        except Exception:
            return None

    async def _get_port_rates_cached(self, port_names, interval=2.0, double_read=False):
        from pysnmp.hlapi.v1arch.asyncio import Slim, ObjectType, ObjectIdentity
        import time as _time

        OID_IF_IN_OCT = '1.3.6.1.2.1.2.2.1.10'
        OID_IF_OUT_OCT = '1.3.6.1.2.1.2.2.1.16'

        name_to_idx = {}
        for pn in port_names:
            idx = self._zte_ifindex(pn)
            if idx is not None:
                name_to_idx[pn] = str(idx)

        if not name_to_idx:
            return {pn: {'in_mbps': 0.0, 'out_mbps': 0.0} for pn in port_names}

        async def get_one(slim, oid):
            try:
                ei, es, eidx, vb = await slim.get(
                    self.community, self.ip, self.port,
                    ObjectType(ObjectIdentity(oid)), timeout=5, retries=2)
                if not ei and not es:
                    return int(vb[0][1])
            except Exception:
                pass
            return None

        now = _time.time()
        result = {}
        slim = Slim(1)
        try:
            # First read — collect counters for all ports
            first_read = {}
            needs_double = []
            for pn, idx in name_to_idx.items():
                cache_key = f'{self.ip}:{idx}'
                in_oct = await get_one(slim, f'{OID_IF_IN_OCT}.{idx}')
                out_oct = await get_one(slim, f'{OID_IF_OUT_OCT}.{idx}')
                if in_oct is None or out_oct is None:
                    prev = self._snmp_counter_cache.get(cache_key)
                    if prev and (now - prev[2]) < self._RATE_TTL:
                        result[pn] = {'in_mbps': prev[3], 'out_mbps': prev[4]}
                    else:
                        result[pn] = {'in_mbps': 0.0, 'out_mbps': 0.0}
                    continue

                prev = self._snmp_counter_cache.get(cache_key)
                if prev:
                    pi, po, pt, last_in, last_out = prev
                    dt = now - pt
                    if dt > 0:
                        di = in_oct - pi
                        do = out_oct - po
                        if di < 0: di += 2**32
                        if do < 0: do += 2**32
                        in_mbps = (di * 8 / dt) / 1e6
                        out_mbps = (do * 8 / dt) / 1e6
                        if di == 0:
                            in_mbps = last_in
                        else:
                            in_mbps = round(in_mbps, 3)
                        if do == 0:
                            out_mbps = last_out
                        else:
                            out_mbps = round(out_mbps, 3)
                        self._snmp_counter_cache[cache_key] = (in_oct, out_oct, now, in_mbps, out_mbps)
                        result[pn] = {'in_mbps': in_mbps, 'out_mbps': out_mbps}
                    else:
                        result[pn] = {'in_mbps': last_in, 'out_mbps': last_out}
                else:
                    # First sample — no rate yet
                    if double_read:
                        first_read[pn] = (cache_key, in_oct, out_oct, now)
                        needs_double.append((pn, idx))
                        result[pn] = {'in_mbps': 0.0, 'out_mbps': 0.0}
                    else:
                        self._snmp_counter_cache[cache_key] = (in_oct, out_oct, now, 0.0, 0.0)
                        result[pn] = {'in_mbps': 0.0, 'out_mbps': 0.0}

            # Double read: wait 'interval' seconds then read again for ports without cache
            if double_read and needs_double:
                await asyncio.sleep(interval)
                now2 = _time.time()
                for pn, idx in needs_double:
                    cache_key, in_oct1, out_oct1, ts1 = first_read[pn]
                    in_oct2 = await get_one(slim, f'{OID_IF_IN_OCT}.{idx}')
                    out_oct2 = await get_one(slim, f'{OID_IF_OUT_OCT}.{idx}')
                    if in_oct2 is None or out_oct2 is None:
                        self._snmp_counter_cache[cache_key] = (in_oct1, out_oct1, ts1, 0.0, 0.0)
                        result[pn] = {'in_mbps': 0.0, 'out_mbps': 0.0}
                        continue
                    dt = now2 - ts1
                    if dt > 0:
                        di = in_oct2 - in_oct1
                        do = out_oct2 - out_oct1
                        if di < 0: di += 2**32
                        if do < 0: do += 2**32
                        in_mbps = round((di * 8 / dt) / 1e6, 3) if di > 0 else 0.0
                        out_mbps = round((do * 8 / dt) / 1e6, 3) if do > 0 else 0.0
                        self._snmp_counter_cache[cache_key] = (in_oct2, out_oct2, now2, in_mbps, out_mbps)
                        result[pn] = {'in_mbps': in_mbps, 'out_mbps': out_mbps}
                    else:
                        self._snmp_counter_cache[cache_key] = (in_oct2, out_oct2, now2, 0.0, 0.0)
                        result[pn] = {'in_mbps': 0.0, 'out_mbps': 0.0}
        finally:
            slim.close()

        for pn in port_names:
            result.setdefault(pn, {'in_mbps': 0.0, 'out_mbps': 0.0})
        return result

    def get_traffic_rates_by_ifindex(self, port_map, interval=3.0, double_read=False):
        """Get instantaneous traffic rates (Mbps) for ports by ifIndex (generic, non-ZTE).
        port_map: dict of {port_name: ifIndex_int} — e.g. {'Pon-Nni1': 1, 'G1': 5}
        Uses 32-bit ifInOctets/ifOutOctets with cached delta calculation.
        Returns dict: {port_name: {'in_mbps': float, 'out_mbps': float}}"""
        result = {pn: {'in_mbps': 0.0, 'out_mbps': 0.0} for pn in port_map}
        if not port_map:
            return result
        try:
            loop = asyncio.new_event_loop()
            try:
                rates = loop.run_until_complete(
                    self._get_rates_by_ifindex_cached(port_map, interval=interval, double_read=double_read))
                for pn, r in rates.items():
                    result[pn] = r
            finally:
                loop.close()
        except Exception as e:
            logger.error(f"get_traffic_rates_by_ifindex failed: {e}")
        return result

    async def _get_rates_by_ifindex_cached(self, port_map, interval=2.0, double_read=False):
        from pysnmp.hlapi.v1arch.asyncio import Slim, ObjectType, ObjectIdentity
        import time as _time

        OID_IF_IN_OCT = '1.3.6.1.2.1.2.2.1.10'
        OID_IF_OUT_OCT = '1.3.6.1.2.1.2.2.1.16'

        async def get_one(slim, oid):
            try:
                ei, es, eidx, vb = await slim.get(
                    self.community, self.ip, self.port,
                    ObjectType(ObjectIdentity(oid)), timeout=5, retries=2)
                if not ei and not es:
                    return int(vb[0][1])
            except Exception:
                pass
            return None

        now = _time.time()
        result = {}
        slim = Slim(1)
        try:
            first_read = {}
            needs_double = []
            for pn, idx in port_map.items():
                cache_key = f'{self.ip}:{idx}'
                in_oct = await get_one(slim, f'{OID_IF_IN_OCT}.{idx}')
                out_oct = await get_one(slim, f'{OID_IF_OUT_OCT}.{idx}')
                if in_oct is None or out_oct is None:
                    prev = self._snmp_counter_cache.get(cache_key)
                    if prev and (now - prev[2]) < self._RATE_TTL:
                        result[pn] = {'in_mbps': prev[3], 'out_mbps': prev[4]}
                    else:
                        result[pn] = {'in_mbps': 0.0, 'out_mbps': 0.0}
                    continue

                prev = self._snmp_counter_cache.get(cache_key)
                if prev:
                    pi, po, pt, last_in, last_out = prev
                    dt = now - pt
                    if dt > 0:
                        di = in_oct - pi
                        do = out_oct - po
                        if di < 0: di += 2**32
                        if do < 0: do += 2**32
                        in_mbps = (di * 8 / dt) / 1e6
                        out_mbps = (do * 8 / dt) / 1e6
                        if di == 0: in_mbps = last_in
                        else: in_mbps = round(in_mbps, 3)
                        if do == 0: out_mbps = last_out
                        else: out_mbps = round(out_mbps, 3)
                        self._snmp_counter_cache[cache_key] = (in_oct, out_oct, now, in_mbps, out_mbps)
                        result[pn] = {'in_mbps': in_mbps, 'out_mbps': out_mbps}
                    else:
                        result[pn] = {'in_mbps': last_in, 'out_mbps': last_out}
                else:
                    if double_read:
                        first_read[pn] = (cache_key, in_oct, out_oct, now)
                        needs_double.append((pn, idx))
                        result[pn] = {'in_mbps': 0.0, 'out_mbps': 0.0}
                    else:
                        self._snmp_counter_cache[cache_key] = (in_oct, out_oct, now, 0.0, 0.0)
                        result[pn] = {'in_mbps': 0.0, 'out_mbps': 0.0}

            if double_read and needs_double:
                await asyncio.sleep(interval)
                now2 = _time.time()
                for pn, idx in needs_double:
                    cache_key, in_oct1, out_oct1, ts1 = first_read[pn]
                    in_oct2 = await get_one(slim, f'{OID_IF_IN_OCT}.{idx}')
                    out_oct2 = await get_one(slim, f'{OID_IF_OUT_OCT}.{idx}')
                    if in_oct2 is None or out_oct2 is None:
                        self._snmp_counter_cache[cache_key] = (in_oct1, out_oct1, ts1, 0.0, 0.0)
                        result[pn] = {'in_mbps': 0.0, 'out_mbps': 0.0}
                        continue
                    dt = now2 - ts1
                    if dt > 0:
                        di = in_oct2 - in_oct1
                        do = out_oct2 - out_oct1
                        if di < 0: di += 2**32
                        if do < 0: do += 2**32
                        in_mbps = round((di * 8 / dt) / 1e6, 3) if di > 0 else 0.0
                        out_mbps = round((do * 8 / dt) / 1e6, 3) if do > 0 else 0.0
                        self._snmp_counter_cache[cache_key] = (in_oct2, out_oct2, now2, in_mbps, out_mbps)
                        result[pn] = {'in_mbps': in_mbps, 'out_mbps': out_mbps}
                    else:
                        self._snmp_counter_cache[cache_key] = (in_oct2, out_oct2, now2, 0.0, 0.0)
                        result[pn] = {'in_mbps': 0.0, 'out_mbps': 0.0}
        finally:
            slim.close()

        for pn in port_map:
            result.setdefault(pn, {'in_mbps': 0.0, 'out_mbps': 0.0})
        return result

    def _run(self, coro):
        try:
            loop = asyncio.get_running_loop()
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                return pool.submit(asyncio.run, coro).result(timeout=180)
        except RuntimeError:
            return asyncio.run(coro)

    # ==================== Batch SNMP GET ====================

    async def _batch_get_async(self, oids: list[str]) -> dict[str, Any]:
        """Fetch multiple OIDs in a single SNMP GET request.

        Instead of N separate get() calls (one per OID), this sends 1 GET
        with all OIDs — reducing network round-trips from N to 1.

        Returns dict {oid: value} for successfully retrieved OIDs.
        """
        from pysnmp.hlapi.v1arch.asyncio import Slim, ObjectType, ObjectIdentity

        result = {}
        slim = Slim(1)
        try:
            # pysnmp Slim.get() accepts multiple ObjectType args in one call
            obj_types = [ObjectType(ObjectIdentity(oid)) for oid in oids]
            ei, es, eidx, vb = await slim.get(
                self.community, self.ip, self.port,
                *obj_types, timeout=10, retries=3
            )
            if not ei and not es and vb:
                for var_bind in vb:
                    oid_str = str(var_bind[0])
                    val = var_bind[1]
                    val_str = str(val)
                    if 'noSuch' not in val_str:
                        result[oid_str] = val
        except Exception as e:
            logger.error(f"Batch GET failed ({len(oids)} OIDs): {e}")
        finally:
            slim.close()
        return result

    def batch_get(self, oids: list[str]) -> dict[str, Any]:
        """Synchronous wrapper for _batch_get_async.

        Fetch multiple OIDs in 1 SNMP GET request.
        Returns dict {oid: raw_value} for successfully retrieved OIDs.
        """
        if not oids:
            return {}
        try:
            return self._run(self._batch_get_async(oids))
        except Exception as e:
            logger.error(f"batch_get failed: {e}")
            return {}

    def collect_onu_detail_batch(self, pon_index: int, onu_slot: int) -> dict:
        """Fetch ONU detail (name, serial, status, rx, tx, olt_rx, description)
        in a SINGLE batch GET request instead of 7 sequential walks.

        This is the optimized equivalent of walking 7 separate OID tables
        for one ONU — reduces SNMP round-trips from 7 to 1.

        Args:
            pon_index: ZTE PON index (e.g. 268500992 for board 1 port 0)
            onu_slot: ONU slot/ID on that PON port

        Returns:
            Dict with keys: name, serial, status, rx_power, tx_power,
            olt_rx, description, oper_state
        """
        # cfgTable OIDs: suffix = .ponIndex.onuSlot
        # regTable OIDs: suffix = .ponIndex.onuSlot.onuId (onuId=1 for ZTE C320)
        cfg_suffix = f'.{pon_index}.{onu_slot}'
        reg_suffix = f'.{pon_index}.{onu_slot}.1'

        oids = [
            f'{OID_ONU_NAME}{cfg_suffix}',
            f'{OID_ONU_SERIAL}{cfg_suffix}',
            f'{OID_ONU_DESCRIPTION}{cfg_suffix}',
            f'{OID_OPER_STATE}{reg_suffix}',
            f'{OID_DEREG_REASON}{reg_suffix}',
            f'{OID_RX_POWER}{reg_suffix}',
            f'{OID_TX_POWER}{reg_suffix}',
            f'{OID_OLT_RX}{reg_suffix}',
        ]

        raw = self.batch_get(oids)

        # Parse results
        name = ''
        serial = ''
        description = ''
        oper_state = 0
        dereg_reason = 0
        rx_power = None
        tx_power = None
        olt_rx = None
        distance = None

        for oid, val in raw.items():
            if oid.startswith(OID_ONU_NAME):
                name = str(val)
            elif oid.startswith(OID_ONU_SERIAL):
                serial = parse_serial(val)
            elif oid.startswith(OID_ONU_DESCRIPTION):
                description = str(val)
            elif oid.startswith(OID_OPER_STATE):
                try: oper_state = int(val)
                except: pass
            elif oid.startswith(OID_DEREG_REASON):
                try: dereg_reason = int(val)
                except: pass
            elif oid.startswith(OID_RX_POWER):
                try: rx_power = decode_rx_power(int(val))
                except: pass
            elif oid.startswith(OID_TX_POWER):
                try: tx_power = decode_rx_power(int(val))
                except: pass
            elif oid.startswith(OID_OLT_RX):
                try: olt_rx = decode_rx_power(int(val))
                except: pass

        status = classify_onu_status(oper_state, dereg_reason, olt_rx, rx_power)

        return {
            'name': name,
            'serial_number': serial,
            'description': description,
            'status': status,
            'oper_state': oper_state,
            'dereg_reason': decode_dereg_reason(dereg_reason),
            'rx_power': olt_rx,
            'onu_rx_power': rx_power,
            'tx_power': tx_power,
            'distance': None,
        }

    def collect_onus_batch(self, onu_keys: list[tuple[int, int]]) -> list[dict]:
        """Fetch detail for multiple ONUs using batch GET per ONU.

        Instead of 7 concurrent walks across the entire OLT, this does
        1 batch GET (7 OIDs) per ONU — much faster for small ONU counts
        and avoids walking the entire OID tree.

        Args:
            onu_keys: List of (pon_index, onu_slot) tuples

        Returns:
            List of ONU dicts with position, status, signal, name, serial
        """
        onus = []
        for pon_index, onu_slot in onu_keys:
            frame, port = parse_pon_index(pon_index)
            if frame == 0:
                continue

            detail = self.collect_onu_detail_batch(pon_index, onu_slot)
            if not detail['serial_number']:
                continue

            onu = {
                'frame': frame,
                'slot': frame,
                'port': port,
                'onu_id': onu_slot,
                'onu_index': frame * 100000 + frame * 10000 + port * 100 + onu_slot,
                'serial_number': detail['serial_number'],
                'name': detail['name'],
                'description': detail['description'],
                'status': detail['status'],
                'oper_state': detail['oper_state'],
                'reg_status': 0,
                'rx_power': detail['rx_power'],
                'onu_rx_power': detail['onu_rx_power'],
                'tx_power': detail['tx_power'],
                'distance': detail.get('distance'),
                'actual_type': '',
                'last_dereg_reason': detail.get('dereg_reason', ''),
                'pppoe': '',
            }
            onus.append(onu)

        logger.info(f"SNMP batch GET: collected {len(onus)} ONUs ({len(onu_keys)} keys)")
        return onus

    async def _bulk_walk(self, oid, max_repetitions=None):
        """SNMP GETBULK walk — fetches up to max_repetitions OIDs per packet.
        
        Falls back to GETNEXT (1 OID per packet) if GETBULK fails.
        When self.use_walk=True, always uses GETNEXT (for lossy/high-latency links).
        Returns list of (oid_str, raw_val, str_val) tuples.
        """
        from pysnmp.hlapi.v1arch.asyncio import Slim, ObjectType, ObjectIdentity

        if max_repetitions is None:
            max_repetitions = self.max_repetitions

        results = []
        slim = Slim(1)
        cur = oid
        errors = 0
        use_bulk = not self.use_walk  # If use_walk=True, start with GetNext
        try:
            while True:
                try:
                    if use_bulk:
                        ei, es, eidx, vb = await slim.get_bulk(
                            self.community, self.ip, self.port,
                            ObjectType(ObjectIdentity(cur)),
                            nonRepeaters=0, maxRepetitions=max_repetitions,
                            timeout=10, retries=3)
                    else:
                        ei, es, eidx, vb = await slim.next(
                            self.community, self.ip, self.port,
                            ObjectType(ObjectIdentity(cur)), timeout=10, retries=3)
                except Exception:
                    if use_bulk:
                        use_bulk = False
                        continue
                    break
                if ei:
                    errors += 1
                    if errors > 10:
                        break
                    continue
                if es:
                    break
                if not vb:
                    break
                done = False
                for var_bind in vb:
                    roid = str(var_bind[0])
                    if not roid.startswith(oid):
                        done = True
                        break
                    val = var_bind[1]
                    val_str = str(val)
                    if 'noSuch' in val_str:
                        done = True
                        break
                    results.append((roid, val, val_str))
                    cur = roid
                if done:
                    break
                errors = 0
        finally:
            slim.close()
        return results

    async def _walk_async(self, oid):
        """Walk an OID and return dict {index_suffix: value}.

        Accepts both full OIDs (e.g. '1.3.6.1.2.1.2.2.1.2') and relative
        enterprise OIDs (e.g. '.25355.3.2.6.3.2.1.37') — relative OIDs are
        auto-prefixed with '1.3.6.1.4.1'.
        """
        # Auto-prepend enterprise prefix for relative OIDs
        if oid.startswith('.') and not oid.startswith('.1.3.6.1'):
            oid = '1.3.6.1.4.1' + oid
        # Strip leading dot — pysnmp returns OIDs without leading dots
        oid = oid.lstrip('.')
        # Also strip from the comparison base
        oid_base = oid

        raw = await self._bulk_walk(oid_base)
        result = {}
        for oid_str, val, val_str in raw:
            # Extract index suffix (everything after the base OID)
            if oid_str.startswith(oid_base):
                suffix = oid_str[len(oid_base):].lstrip('.')
            else:
                suffix = oid_str
            result[suffix] = val
        return result

    def collect_system_info(self):
        info = {'description': '', 'uptime': 0, 'uptime_str': '', 'sys_name': ''}
        try:
            async def _do():
                from pysnmp.hlapi.v1arch.asyncio import Slim, ObjectType, ObjectIdentity
                slim = Slim(1)
                try:
                    ei, es, eidx, vb = await slim.get(
                        self.community, self.ip, self.port,
                        ObjectType(ObjectIdentity(OID_SYS_UPTIME)), timeout=5, retries=2)
                    if not ei and not es:
                        raw = int(vb[0][1])
                        info['uptime'] = raw // 100
                        info['uptime_str'] = format_uptime(raw)
                    ei, es, eidx, vb = await slim.get(
                        self.community, self.ip, self.port,
                        ObjectType(ObjectIdentity(OID_SYS_DESCR)), timeout=5, retries=2)
                    if not ei and not es:
                        info['description'] = str(vb[0][1]).strip()
                    ei, es, eidx, vb = await slim.get(
                        self.community, self.ip, self.port,
                        ObjectType(ObjectIdentity(OID_SYS_NAME)), timeout=5, retries=2)
                    if not ei and not es:
                        info['sys_name'] = str(vb[0][1]).strip()
                finally:
                    slim.close()
            self._run(_do())
        except Exception as e:
            logger.error(f"System info failed: {e}")
        return info

    def collect_onus_light(self):
        """SNMP-only light collection — returns full ONU list with position, status, signal.
        No Telnet needed. Used for frequent auto-sync to minimize OLT CPU load."""
        import time as _time
        _t0 = _time.time()
        try:
            logger.info(f"SNMP light: collecting ONU data from {self.ip}...")
            onus = self._run(self._collect_onus_light_async())
            _dur = _time.time() - _t0
            logger.info(f"SNMP light: found {len(onus)} ONUs ({_dur:.1f}s)")
            try:
                from metrics_service import track_snmp_poll
                track_snmp_poll(0, 'light', _dur)
            except Exception:
                pass
            return onus
        except Exception as e:
            _dur = _time.time() - _t0
            logger.error(f"SNMP light collection failed: {e}")
            try:
                from metrics_service import track_snmp_poll
                track_snmp_poll(0, 'light', _dur, error=type(e).__name__)
            except Exception:
                pass
            return []

    def collect_onus(self):
        """Collect all ONU data - Telnet primary, SNMP for signal"""
        try:
            logger.info(f"SNMP: collecting signal data from {self.ip}...")
            onus = self._run(self._collect_onus_async())
            logger.info(f"SNMP: found {len(onus)} ONU signal entries")
            return onus
        except Exception as e:
            logger.error(f"ONU collection failed: {e}")
            return []

    async def _collect_onus_light_async(self):
        """SNMP-only light collection — walk name+serial+status+signal tables.
        Returns list of ONU dicts with position (frame/slot/port), status, signal, name, serial.
        No Telnet needed — much lighter on OLT CPU.

        OPTIMIZED: Uses GETBULK (50 OIDs/packet) + asyncio.gather for concurrent walks.
        """
        # Walk all 8 tables concurrently with GETBULK
        name_raw, serial_raw, oper_raw, dereg_raw, rx_raw, tx_raw, olt_rx_raw, desc_raw = \
            await asyncio.gather(
                self._bulk_walk(OID_ONU_NAME),
                self._bulk_walk(OID_ONU_SERIAL),
                self._bulk_walk(OID_OPER_STATE),
                self._bulk_walk(OID_DEREG_REASON),
                self._bulk_walk(OID_RX_POWER),
                self._bulk_walk(OID_TX_POWER),
                self._bulk_walk(OID_OLT_RX),
                self._bulk_walk(OID_ONU_DESCRIPTION),
            )
        logger.info(f"  SNMP light: name={len(name_raw)} serial={len(serial_raw)} oper={len(oper_raw)} dereg={len(dereg_raw)} rx={len(rx_raw)} tx={len(tx_raw)} olt_rx={len(olt_rx_raw)} desc={len(desc_raw)}")

        # Parse cfgTable (name, description, serial): suffix .ponIndex.cfgId
        # cfgId == onuSlot (sequential ONU ID on that PON port)
        name_by_key = {}    # (ponIndex, cfgId) -> name
        desc_by_key = {}    # (ponIndex, cfgId) -> description
        sn_by_key = {}      # (ponIndex, cfgId) -> serial

        for oid_str, val, val_str in name_raw:
            suffix = oid_str[len(OID_ONU_NAME):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 2:
                try: name_by_key[(int(parts[0]), int(parts[1]))] = val_str
                except: pass

        for oid_str, val, val_str in desc_raw:
            suffix = oid_str[len(OID_ONU_DESCRIPTION):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 2:
                try: desc_by_key[(int(parts[0]), int(parts[1]))] = val_str
                except: pass

        for oid_str, val, val_str in serial_raw:
            suffix = oid_str[len(OID_ONU_SERIAL):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 2:
                try: sn_by_key[(int(parts[0]), int(parts[1]))] = parse_serial(val)
                except: pass

        # Parse regTable (oper_state, dereg_reason, rx, tx, olt_rx): suffix .ponIndex.onuSlot.onuId
        oper_by_key = {}
        dereg_by_key = {}
        rx_by_key = {}
        tx_by_key = {}
        olt_rx_by_key = {}

        for oid_str, val, val_str in oper_raw:
            suffix = oid_str[len(OID_OPER_STATE):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 3:
                try: oper_by_key[(int(parts[0]), int(parts[1]))] = int(val)
                except: pass

        for oid_str, val, val_str in dereg_raw:
            suffix = oid_str[len(OID_DEREG_REASON):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 3:
                try: dereg_by_key[(int(parts[0]), int(parts[1]))] = int(val)
                except: pass

        for oid_str, val, val_str in rx_raw:
            suffix = oid_str[len(OID_RX_POWER):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 3:
                try: rx_by_key[(int(parts[0]), int(parts[1]))] = decode_rx_power(int(val))
                except: pass

        for oid_str, val, val_str in tx_raw:
            suffix = oid_str[len(OID_TX_POWER):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 3:
                try: tx_by_key[(int(parts[0]), int(parts[1]))] = decode_rx_power(int(val))
                except: pass

        for oid_str, val, val_str in olt_rx_raw:
            suffix = oid_str[len(OID_OLT_RX):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 3:
                try: olt_rx_by_key[(int(parts[0]), int(parts[1]))] = decode_rx_power(int(val))
                except: pass

        # Build ONU list — cfgTable and regTable share same (ponIndex, onuSlot) key
        all_keys = set(name_by_key.keys()) | set(sn_by_key.keys()) | set(oper_by_key.keys())
        onus = []
        for key in sorted(all_keys):
            pon_index, onu_slot = key
            frame, port = parse_pon_index(pon_index)
            if frame == 0: continue  # invalid ponIndex

            sn = sn_by_key.get(key, '')
            if not sn: continue  # skip entries without serial

            oper_val = oper_by_key.get(key, 0)
            dereg_val = dereg_by_key.get(key, 0)

            olt_rx = olt_rx_by_key.get(key)
            onu_rx = rx_by_key.get(key)
            tx = tx_by_key.get(key)

            status = classify_onu_status(oper_val, dereg_val, olt_rx, onu_rx)

            onu = {
                'frame': frame,
                'slot': frame,  # ZTE C320: board 1 = slot 1, board 2 = slot 2
                'port': port,
                'onu_id': onu_slot,
                'onu_index': frame * 100000 + frame * 10000 + port * 100 + onu_slot,
                'serial_number': sn,
                'name': name_by_key.get(key, ''),
                'description': desc_by_key.get(key, ''),
                'status': status,
                'oper_state': oper_val,
                'reg_status': 0,
                'rx_power': olt_rx,      # OLT RX (upstream)
                'onu_rx_power': onu_rx,   # ONU RX (downstream)
                'tx_power': tx,
                'distance': None,
                'actual_type': '',
                'last_dereg_reason': decode_dereg_reason(dereg_val),
                'pppoe': '',
            }
            onus.append(onu)

        logger.info(f"  SNMP light: built {len(onus)} ONU records")
        return onus

    async def _collect_onus_async(self):
        """Walk signal tables only — uses GETBULK + asyncio.gather for concurrent walks."""
        # Walk all 5 signal tables concurrently with GETBULK
        oper_raw, rx_raw, tx_raw, olt_rx_raw, serial_raw = \
            await asyncio.gather(
                self._bulk_walk(OID_OPER_STATE),
                self._bulk_walk(OID_RX_POWER),
                self._bulk_walk(OID_TX_POWER),
                self._bulk_walk(OID_OLT_RX),
                self._bulk_walk(OID_ONU_SERIAL),
            )
        logger.info(f"  SNMP signal: oper={len(oper_raw)} rx={len(rx_raw)} tx={len(tx_raw)} olt_rx={len(olt_rx_raw)} serial={len(serial_raw)}")

        # Parse SNMP data using composite key (ponIndex, onuSlot) to avoid
        # cross-port collision. Multiple PON ports share the same onuSlot values
        # (e.g. port 1/1/1 and 1/1/3 both have onuSlot=1..12), so using only
        # onuSlot as key causes later ports to overwrite earlier ports' data.
        #
        # regTable OID suffix: .ponIndex.onuSlot.onuId  -> key = (ponIndex, onuSlot)
        # cfgTable OID suffix: .ponIndex.cfgId          -> key = (ponIndex, cfgId)
        # cfgId == onuSlot for ZTE C320 (same per-port sequential numbering)

        oper_by_key = {}   # (ponIndex, onuSlot) -> oper_state int
        rx_by_key   = {}   # (ponIndex, onuSlot) -> ONU RX power float|None
        tx_by_key   = {}   # (ponIndex, onuSlot) -> TX power float|None
        olt_rx_by_key = {} # (ponIndex, onuSlot) -> OLT RX power float|None
        sn_by_key   = {}   # (ponIndex, cfgId)   -> serial string

        for oid_str, val, val_str in oper_raw:
            suffix = oid_str[len(OID_OPER_STATE):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 3:
                try: oper_by_key[(int(parts[0]), int(parts[1]))] = int(val)
                except: pass

        for oid_str, val, val_str in rx_raw:
            suffix = oid_str[len(OID_RX_POWER):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 3:
                try: rx_by_key[(int(parts[0]), int(parts[1]))] = decode_rx_power(int(val))
                except: pass

        for oid_str, val, val_str in tx_raw:
            suffix = oid_str[len(OID_TX_POWER):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 3:
                try: tx_by_key[(int(parts[0]), int(parts[1]))] = decode_rx_power(int(val))
                except: pass

        for oid_str, val, val_str in olt_rx_raw:
            suffix = oid_str[len(OID_OLT_RX):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 3:
                try: olt_rx_by_key[(int(parts[0]), int(parts[1]))] = decode_rx_power(int(val))
                except: pass

        for oid_str, val, val_str in serial_raw:
            suffix = oid_str[len(OID_ONU_SERIAL):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 2:
                try: sn_by_key[(int(parts[0]), int(parts[1]))] = parse_serial(val)
                except ValueError: pass

        # Build signal map keyed by SN for Telnet matching
        # rx_power = OLT RX (OID .18) = what OLT receives from ONU (upstream) — "RX OLT" in r-config
        # onu_rx_power = ONU RX (OID .10) = what ONU receives from OLT (downstream) — "RX ONU" in r-config
        # tx_power = TX (OID .11)
        snmp_signal = {}
        for key in olt_rx_by_key:
            sn = sn_by_key.get(key, '')
            if sn:
                snmp_signal[sn] = {
                    'rx_power':     olt_rx_by_key.get(key),    # OLT RX (OID .18) — upstream
                    'onu_rx_power': rx_by_key.get(key),        # ONU RX (OID .10) — downstream
                    'tx_power':     tx_by_key.get(key),
                    'oper_state':   oper_by_key.get(key, 0),
                }
        # Fallback: if OLT RX not available, still record ONU RX and TX
        for key in rx_by_key:
            sn = sn_by_key.get(key, '')
            if sn and sn not in snmp_signal:
                snmp_signal[sn] = {
                    'rx_power':     None,                        # OLT RX not available
                    'onu_rx_power': rx_by_key.get(key),          # ONU RX (OID .10)
                    'tx_power':     tx_by_key.get(key),
                    'oper_state':   oper_by_key.get(key, 0),
                }

        logger.info(f"  SNMP signal map: {len(snmp_signal)} by SN (composite-key, no port collision)")

        # Positional fallback no longer needed - composite-key SN matching covers all ONUs
        return {'by_sn': snmp_signal, 'rx_list': [], 'tx_list': []}

    # ==================== C300 SNMP Collection ====================

    def collect_onus_c300(self):
        """Collect ONU signal data from ZTE C300 using .3902.1082 / .3902.1015 OID trees."""
        try:
            logger.info(f"SNMP C300: collecting signal data from {self.ip}...")
            onus = self._run(self._collect_onus_c300_async())
            logger.info(f"SNMP C300: found {len(onus)} ONU signal entries")
            return onus
        except Exception as e:
            logger.error(f"C300 ONU collection failed: {e}")
            return {'by_sn': {}, 'rx_list': [], 'tx_list': []}

    async def _collect_onus_c300_async(self):
        """Walk C300 signal tables — index format: ifIndex.onuId (2 components)
        Uses GETBULK + asyncio.gather for concurrent walks."""
        # Walk all 8 C300 tables concurrently with GETBULK
        serial_raw, run_status_raw, onu_rx_raw, onu_tx_raw, \
            olt_rx_raw, ont_tx_raw, distance_raw, model_raw = \
            await asyncio.gather(
                self._bulk_walk(C300_OID_ONU_SERIAL_FMT),
                self._bulk_walk(C300_OID_RUN_STATUS),
                self._bulk_walk(C300_OID_ONU_RX_POWER),
                self._bulk_walk(C300_OID_ONU_TX_POWER),
                self._bulk_walk(C300_OID_OLT_RX),
                self._bulk_walk(C300_OID_ONT_TX),
                self._bulk_walk(C300_OID_DISTANCE),
                self._bulk_walk(C300_OID_ONU_MODEL),
            )
        logger.info(f"  C300 SNMP: serial={len(serial_raw)} run={len(run_status_raw)} onu_rx={len(onu_rx_raw)} onu_tx={len(onu_tx_raw)} olt_rx={len(olt_rx_raw)} dist={len(distance_raw)} model={len(model_raw)}")

        # C300 index format: ifIndex.onuId (2 components for ONU data)
        # ONU-side optical: ifIndex.onuId.1 (3 components)
        # OLT-side optical: ponIndex.onuId (2 components)

        # Parse serial: key = (ifIndex, onuId)
        sn_by_key = {}
        for oid_str, val, val_str in serial_raw:
            suffix = oid_str[len(C300_OID_ONU_SERIAL_FMT):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 2:
                try:
                    key = (int(parts[0]), int(parts[1]))
                    # C300 serial is formatted string like "1,HWTC7C9A0A9B"
                    sn_str = val_str.strip()
                    if sn_str.startswith('1,'):
                        sn_str = sn_str[2:]
                    elif sn_str.startswith('0,'):
                        sn_str = sn_str[2:]
                    sn_by_key[key] = sn_str
                except (ValueError, IndexError):
                    pass

        # Parse run status: key = (ifIndex, onuId)
        status_by_key = {}
        for oid_str, val, val_str in run_status_raw:
            suffix = oid_str[len(C300_OID_RUN_STATUS):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 2:
                try: status_by_key[(int(parts[0]), int(parts[1]))] = int(val)
                except: pass

        # Parse ONU-side RX: index ifIndex.onuId.1 (3 components)
        onu_rx_by_key = {}
        for oid_str, val, val_str in onu_rx_raw:
            suffix = oid_str[len(C300_OID_ONU_RX_POWER):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 2:
                try: onu_rx_by_key[(int(parts[0]), int(parts[1]))] = decode_c300_onu_rx_power(int(val))
                except: pass

        # Parse ONU-side TX: index ifIndex.onuId.1 (3 components)
        onu_tx_by_key = {}
        for oid_str, val, val_str in onu_tx_raw:
            suffix = oid_str[len(C300_OID_ONU_TX_POWER):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 2:
                try: onu_tx_by_key[(int(parts[0]), int(parts[1]))] = decode_c300_onu_rx_power(int(val))
                except: pass

        # Parse OLT-side RX: index ponIndex.onuId (2 components)
        olt_rx_by_key = {}
        for oid_str, val, val_str in olt_rx_raw:
            suffix = oid_str[len(C300_OID_OLT_RX):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 2:
                try: olt_rx_by_key[(int(parts[0]), int(parts[1]))] = decode_c300_olt_rx(int(val))
                except: pass

        # Parse distance: key = (ifIndex, onuId)
        dist_by_key = {}
        for oid_str, val, val_str in distance_raw:
            suffix = oid_str[len(C300_OID_DISTANCE):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 2:
                try: dist_by_key[(int(parts[0]), int(parts[1]))] = decode_distance(int(val))
                except: pass

        # Parse model: key = (ifIndex, onuId)
        model_by_key = {}
        for oid_str, val, val_str in model_raw:
            suffix = oid_str[len(C300_OID_ONU_MODEL):]
            parts = suffix.lstrip('.').split('.')
            if len(parts) >= 2:
                try: model_by_key[(int(parts[0]), int(parts[1]))] = val_str.strip()
                except: pass

        # Build signal map keyed by SN — match ONU data (ifIndex) with OLT data (ponIndex)
        # We need to convert between ifIndex and ponIndex to join ONU-side and OLT-side data
        # For now, key everything by (ifIndex, onuId) and match SN from serial
        snmp_signal = {}
        all_keys = set(sn_by_key.keys()) | set(status_by_key.keys()) | set(onu_rx_by_key.keys()) | set(onu_tx_by_key.keys()) | set(dist_by_key.keys()) | set(model_by_key.keys())

        for key in all_keys:
            sn = sn_by_key.get(key, '')
            if not sn:
                continue
            snmp_signal[sn] = {
                'rx_power':     olt_rx_by_key.get(key),      # OLT RX (upstream) — may not match if index differs
                'onu_rx_power': onu_rx_by_key.get(key),      # ONU RX (downstream)
                'tx_power':     onu_tx_by_key.get(key),      # ONU TX (upstream)
                'oper_state':   status_by_key.get(key, 0),
                'distance':     dist_by_key.get(key),
                'actual_type':  model_by_key.get(key, ''),
            }

        # Also try matching OLT RX by ponIndex — build ifIndex↔ponIndex mapping
        # ifIndex format: 0x11{slot}{00}{port}, ponIndex format: 0x10{slot}{port}{00}
        # For each ifIndex, compute corresponding ponIndex and look up OLT RX
        for key in all_keys:
            sn = sn_by_key.get(key, '')
            if not sn or sn in snmp_signal and snmp_signal[sn].get('rx_power') is not None:
                continue
            if_index = key[0]
            slot, port = parse_c300_ifindex(if_index)
            if slot > 0:
                # Compute ponIndex: 0x10{slot}{port}{00}
                pon_index = (0x10 << 24) | (slot << 16) | (port << 8)
                olt_rx = olt_rx_by_key.get((pon_index, key[1]))
                if olt_rx is not None and sn in snmp_signal:
                    snmp_signal[sn]['rx_power'] = olt_rx
                elif olt_rx is not None and sn not in snmp_signal:
                    snmp_signal[sn] = {
                        'rx_power':     olt_rx,
                        'onu_rx_power': onu_rx_by_key.get(key),
                        'tx_power':     onu_tx_by_key.get(key),
                        'oper_state':   status_by_key.get(key, 0),
                        'distance':     dist_by_key.get(key),
                        'actual_type':  model_by_key.get(key, ''),
                    }

        logger.info(f"  C300 SNMP signal map: {len(snmp_signal)} by SN")
        return {'by_sn': snmp_signal, 'rx_list': [], 'tx_list': []}

    # ==================== SNMP SET (Registration) ====================

    async def _snmp_set_async(self, oid_value_pairs, write_community=None):
        """SNMP SET one or more OID-value pairs.
        Args:
            oid_value_pairs: list of (oid_str, value, type_hint) tuples
                type_hint: 'i' (Integer), 's' (OctetString), 'x' (hex OctetString)
            write_community: write community string (falls back to read community)
        Returns: (success: bool, error_msg: str or None)
        """
        from pysnmp.hlapi.v1arch.asyncio import Slim, ObjectType, ObjectIdentity
        from pysnmp.proto import rfc1902

        community = write_community or self.community
        slim = Slim(1)
        try:
            obj_types = []
            for oid, value, vtype in oid_value_pairs:
                if vtype == 'i':
                    obj = ObjectType(ObjectIdentity(oid), rfc1902.Integer(int(value)))
                elif vtype == 's':
                    obj = ObjectType(ObjectIdentity(oid), rfc1902.OctetString(str(value)))
                elif vtype == 'x':
                    obj = ObjectType(ObjectIdentity(oid), rfc1902.OctetString(value))
                else:
                    obj = ObjectType(ObjectIdentity(oid), value)
                obj_types.append(obj)

            ei, es, eidx, vb = await slim.set(
                community, self.ip, self.port,
                *obj_types, timeout=10, retries=3
            )
            if ei:
                return False, f'SNMP SET error: {ei}'
            if es:
                idx_info = eidx and vb[int(eidx) - 1][0] or '?'
                return False, f'SNMP SET error: {es} at {idx_info}'
            return True, None
        except Exception as e:
            return False, f'SNMP SET exception: {e}'
        finally:
            slim.close()

    def snmp_set(self, oid_value_pairs, write_community=None):
        """Synchronous wrapper for SNMP SET.
        Args:
            oid_value_pairs: list of (oid_str, value, type_hint) tuples
            write_community: write community string
        Returns: (success: bool, error_msg: str or None)
        """
        try:
            return self._run(self._snmp_set_async(oid_value_pairs, write_community))
        except Exception as e:
            return False, f'SNMP SET failed: {e}'

    def register_onu_snmp(self, frame, slot, port, onu_id, serial_number,
                           onu_type='All', name='', description='',
                           write_community=None):
        """Register a GPON ONU via SNMP SET on ZTE C320.

        Uses createAndWait (5) to create the row without activating,
        sets all required fields (serial, type, reg mode, name, description),
        then activates with active (1).

        Args:
            frame: OLT frame (always 1 for C320)
            slot: OLT slot/board (1 or 2)
            port: PON port (1-indexed)
            onu_id: ONU ID on this PON port (1-indexed)
            serial_number: GPON serial number (e.g. 'ZTEGC40DF35B')
            onu_type: ONU type name registered on OLT (e.g. 'ZTE-F609')
            name: ONU name (optional)
            description: ONU description (optional)
            write_community: SNMP write community string

        Returns: (success: bool, message: str)
        """
        pon_index = encode_pon_index(slot, port)
        suffix = f'.{pon_index}.{onu_id}'
        sn_hex = encode_sn_to_hex(serial_number)

        # ZTE C320 only supports createAndGo (4) — createAndWait (5) returns genErr.
        # Use a single multi-varbind SET to atomically create + set all fields.
        # This ensures serial & reg mode are set when the row is activated.

        # Build all varbinds for atomic SET
        varbinds = [
            (f'{OID_REG_SERIAL}{suffix}', sn_hex, 'x'),       # Serial number
            (f'{OID_REG_MODE}{suffix}', 1, 'i'),              # Auth mode = SN
            (f'{OID_REG_ENTRY_STATUS}{suffix}', 4, 'i'),      # createAndGo
        ]
        # Add ONU type if specified
        if onu_type and onu_type != 'All':
            varbinds.append((f'{OID_REG_TYPE_NAME}{suffix}', onu_type, 's'))
        # Add name if specified
        if name:
            varbinds.append((f'{OID_REG_NAME}{suffix}', name, 's'))
        # Add description if specified
        if description:
            varbinds.append((f'{OID_REG_DESCRIPTION}{suffix}', description, 's'))

        # Attempt atomic createAndGo with all fields
        ok, err = self.snmp_set(varbinds, write_community)
        if not ok:
            # Entry may already exist — destroy and retry
            logger.info(f'Atomic createAndGo failed ({err}), trying cleanup and retry...')
            self.snmp_set([(f'{OID_REG_ENTRY_STATUS}{suffix}', 6, 'i')], write_community)
            import time as _time
            _time.sleep(0.5)
            ok, err = self.snmp_set(varbinds, write_community)
            if not ok:
                return False, f'Create entry failed (after cleanup retry): {err}'

        logger.info(f'SNMP register: ONU {frame}/{slot}/{port}:{onu_id} SN={serial_number} type={onu_type}')

        # Read-back verification
        try:
            result = self.batch_get([f'{OID_REG_ENTRY_STATUS}{suffix}'])
            status_val = result.get(f'{OID_REG_ENTRY_STATUS}{suffix}')
            if status_val is not None:
                status_map = {1: 'active', 2: 'notInService', 3: 'notReady', 4: 'createAndGo', 5: 'createAndWait', 6: 'destroy'}
                state = status_map.get(int(status_val), f'unknown({status_val})')
                logger.info(f'SNMP read-back: ONU {frame}/{slot}/{port}:{onu_id} entry status={state}')
                return True, f'ONU {frame}/{slot}/{port}:{onu_id} registered via SNMP with SN {serial_number} (state={state})'
            else:
                logger.warning(f'SNMP read-back: ONU {frame}/{slot}/{port}:{onu_id} entry not found in GET')
        except Exception as e:
            logger.warning(f'SNMP read-back failed: {e}')

        return True, f'ONU {frame}/{slot}/{port}:{onu_id} registered via SNMP with SN {serial_number}'

    def deregister_onu_snmp(self, frame, slot, port, onu_id, write_community=None):
        """Deregister a GPON ONU via SNMP SET (destroy = 6).

        Returns: (success: bool, message: str)
        """
        pon_index = encode_pon_index(slot, port)
        suffix = f'.{pon_index}.{onu_id}'

        ok, err = self.snmp_set([
            (f'{OID_REG_ENTRY_STATUS}{suffix}', 6, 'i'),
        ], write_community)
        if not ok:
            return False, f'Deregister failed: {err}'

        logger.info(f'SNMP deregister: ONU {frame}/{slot}/{port}:{onu_id}')
        return True, f'ONU {frame}/{slot}/{port}:{onu_id} deregistered via SNMP'

    def set_onu_name_snmp(self, frame, slot, port, onu_id, name, write_community=None):
        """Set ONU name via SNMP SET.

        Returns: (success: bool, message: str)
        """
        pon_index = encode_pon_index(slot, port)
        suffix = f'.{pon_index}.{onu_id}'

        ok, err = self.snmp_set([
            (f'{OID_REG_NAME}{suffix}', name, 's'),
        ], write_community)
        if not ok:
            return False, f'Set name failed: {err}'
        return True, f'Name set to "{name}"'

    def set_onu_description_snmp(self, frame, slot, port, onu_id, description, write_community=None):
        """Set ONU description via SNMP SET.

        Returns: (success: bool, message: str)
        """
        pon_index = encode_pon_index(slot, port)
        suffix = f'.{pon_index}.{onu_id}'

        ok, err = self.snmp_set([
            (f'{OID_REG_DESCRIPTION}{suffix}', description, 's'),
        ], write_community)
        if not ok:
            return False, f'Set description failed: {err}'
        return True, f'Description set to "{description}"'

    def scan_unconfigured_snmp(self, write_community=None):
        """Scan for unconfigured ONUs via SNMP walk on the zxGponUnCfgSnOntInfoTable.

        Returns: list of dicts with keys: pon_port, sn, model, onu_id
        """
        try:
            uncfg_raw = self._run(self._bulk_walk(OID_UNCFG_SERIAL))
            # Also walk model OID (may not exist on all firmware versions)
            model_raw = self._run(self._bulk_walk(OID_UNCFG_MODEL))
            model_map = {}
            for oid_str, val, val_str in model_raw:
                suffix = oid_str[len(OID_UNCFG_MODEL):].lstrip('.')
                model_map[suffix] = val_str

            results = []
            for oid_str, val, val_str in uncfg_raw:
                suffix = oid_str[len(OID_UNCFG_SERIAL):].lstrip('.')
                parts = suffix.split('.')
                if len(parts) >= 2:
                    try:
                        pon_index = int(parts[0])
                        onu_slot = int(parts[1])
                        frame, port = parse_pon_index(pon_index)
                        if frame == 0:
                            continue
                        sn = parse_serial(val)
                        if not sn:
                            continue
                        model = model_map.get(suffix, '')
                        results.append({
                            'pon_port': f'1/{frame}/{port}',
                            'sn': sn,
                            'model': model,
                            'onu_id': onu_slot,
                        })
                    except (ValueError, IndexError):
                        pass
            logger.info(f'SNMP scan unconfigured: found {len(results)} ONUs')
            return results
        except Exception as e:
            logger.error(f'SNMP scan unconfigured failed: {e}')
            return []

    # ==================== SNMP Profile/Config Collection ====================

    def collect_tcont_profiles_snmp(self):
        """Collect TCONT (bandwidth) profile names via SNMP walk.
        Returns list of {'name': str, 'fixed': int, 'assured': int, 'maximum': int, 'type': int}."""
        try:
            return self._run(self._collect_tcont_profiles_async())
        except Exception as e:
            logger.error(f'SNMP TCONT profile collection failed: {e}')
            return []

    async def _collect_tcont_profiles_async(self):
        name_raw, fixed_raw, assured_raw, max_raw, type_raw = \
            await asyncio.gather(
                self._bulk_walk(OID_BW_PROFILE_NAME),
                self._bulk_walk(OID_BW_PROFILE_FIXED),
                self._bulk_walk(OID_BW_PROFILE_ASSURED),
                self._bulk_walk(OID_BW_PROFILE_MAXIMUM),
                self._bulk_walk(OID_BW_PROFILE_TYPE),
            )
        profiles = []
        for oid_str, val, val_str in name_raw:
            suffix = oid_str[len(OID_BW_PROFILE_NAME):]
            name = val_str.strip().strip('"')
            if not name:
                continue
            fixed = _extract_int(fixed_raw, suffix, OID_BW_PROFILE_FIXED)
            assured = _extract_int(assured_raw, suffix, OID_BW_PROFILE_ASSURED)
            maximum = _extract_int(max_raw, suffix, OID_BW_PROFILE_MAXIMUM)
            ptype = _extract_int(type_raw, suffix, OID_BW_PROFILE_TYPE)
            profiles.append({
                'name': name, 'fixed': fixed, 'assured': assured,
                'maximum': maximum, 'type': ptype,
            })
        logger.info(f'SNMP TCONT profiles: {len(profiles)}')
        return profiles

    def collect_traffic_profiles_snmp(self):
        """Collect traffic profile names via SNMP walk.
        Returns list of {'name': str, 'sir': int, 'pir': int}."""
        try:
            return self._run(self._collect_traffic_profiles_async())
        except Exception as e:
            logger.error(f'SNMP traffic profile collection failed: {e}')
            return []

    async def _collect_traffic_profiles_async(self):
        name_raw, sir_raw, pir_raw = \
            await asyncio.gather(
                self._bulk_walk(OID_TRAFFIC_PROFILE_NAME),
                self._bulk_walk(OID_TRAFFIC_PROFILE_SIR),
                self._bulk_walk(OID_TRAFFIC_PROFILE_PIR),
            )
        profiles = []
        for oid_str, val, val_str in name_raw:
            suffix = oid_str[len(OID_TRAFFIC_PROFILE_NAME):]
            name = val_str.strip().strip('"')
            if not name:
                continue
            sir = _extract_int(sir_raw, suffix, OID_TRAFFIC_PROFILE_SIR)
            pir = _extract_int(pir_raw, suffix, OID_TRAFFIC_PROFILE_PIR)
            profiles.append({'name': name, 'sir': sir, 'pir': pir})
        logger.info(f'SNMP traffic profiles: {len(profiles)}')
        return profiles

    def collect_vlans_snmp(self):
        """Collect VLAN list via SNMP walk on dot1qVlanStaticTable.
        Returns list of {'vlan_id': int, 'name': str}."""
        try:
            return self._run(self._collect_vlans_async())
        except Exception as e:
            logger.error(f'SNMP VLAN collection failed: {e}')
            return []

    async def _collect_vlans_async(self):
        name_raw = await self._bulk_walk(OID_DOT1Q_VLAN_STATIC_NAME)
        vlans = []
        for oid_str, val, val_str in name_raw:
            suffix = oid_str[len(OID_DOT1Q_VLAN_STATIC_NAME):]
            parts = suffix.lstrip('.').split('.')
            if not parts:
                continue
            try:
                vlan_id = int(parts[-1])
            except ValueError:
                continue
            if vlan_id == 1:
                continue
            name = val_str.strip().strip('"')
            vlans.append({'vlan_id': vlan_id, 'name': name})
        logger.info(f'SNMP VLANs: {len(vlans)}')
        return vlans

    def collect_onu_types_snmp(self):
        """Collect ONU type names via SNMP by walking registered ONU type field.
        ZTE C320 does not expose an ONU type table via SNMP, but each registered
        ONU has its type name stored at OID_REG_TYPE_NAME (.28.1.1.1).
        We extract distinct type names from all registered ONUs.
        Returns list of {'type_name': str, 'pon_type': str}."""
        try:
            return self._run(self._collect_onu_types_async())
        except Exception as e:
            logger.error(f'SNMP ONU types collection failed: {e}')
            return []

    async def _collect_onu_types_async(self):
        type_raw = await self._bulk_walk(OID_REG_TYPE_NAME)
        type_names = set()
        for oid_str, val, val_str in type_raw:
            name = val_str.strip().strip('"')
            if name and name != 'All':
                type_names.add(name)
        # Build result list — all GPON since OID_REG_TYPE_NAME is in GPON table
        result = [{'type_name': t, 'pon_type': 'gpon'} for t in sorted(type_names)]
        logger.info(f'SNMP ONU types: {len(result)} (from {len(type_raw)} registered ONUs)')
        return result


def _extract_int(raw_list, suffix, base_oid):
    """Helper: extract integer value from walk results matching the given suffix."""
    for oid_str, val, val_str in raw_list:
        if oid_str[len(base_oid):] == suffix:
            try:
                return int(val)
            except (ValueError, TypeError):
                try:
                    return int(val_str)
                except (ValueError, TypeError):
                    return 0
    return 0
