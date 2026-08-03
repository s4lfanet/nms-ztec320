"""
SNMP core collector for ZTE C320 OLT.
- Uses pysnmp 7.x Slim API (v1arch) - fast on Windows
- OIDs from salfanet-radius-go + oltc320 reference
- Contains: OIDs, decode/parse functions, SNMPCollector class
"""
import logging
import asyncio
import concurrent.futures

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
OID_OLT_RX = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.18'      # OLT RX (from ONU to OLT)

BOARD1_BASE = 268500992
BOARD2_BASE = 268509184
PON_INCREMENT = 256

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
    m = {1: 'not_present', 2: 'inactive', 3: 'activating', 4: 'online', 5: 'online', 6: 'dyinggasp'}
    return m.get(value, 'offline')


def decode_dereg_reason(value):
    m = {0: '', 1: 'Unknown', 2: 'LOS', 3: 'LOSi', 4: 'LOFi', 5: 'SFi', 6: 'LOAi', 7: 'LOAMi',
         8: 'AuthFail', 9: 'PowerOff', 10: 'DeactiveSucc', 11: 'DeactiveFail', 12: 'Reboot', 13: 'Shutdown'}
    return m.get(value, f'Unknown({value})')


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

    def __init__(self, ip, community='public', port=161):
        self.ip = ip
        self.community = community
        self.port = int(port)

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

    async def _bulk_walk(self, oid, max_repetitions=50):
        """SNMP GETBULK walk — fetches up to max_repetitions OIDs per packet.
        
        Falls back to GETNEXT (1 OID per packet) if GETBULK fails.
        Returns list of (oid_str, raw_val, str_val) tuples.
        """
        from pysnmp.hlapi.v1arch.asyncio import Slim, ObjectType, ObjectIdentity

        results = []
        slim = Slim(1)
        cur = oid
        errors = 0
        use_bulk = True
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
        try:
            logger.info(f"SNMP light: collecting ONU data from {self.ip}...")
            onus = self._run(self._collect_onus_light_async())
            logger.info(f"SNMP light: found {len(onus)} ONUs")
            return onus
        except Exception as e:
            logger.error(f"SNMP light collection failed: {e}")
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
        # Walk all 7 tables concurrently with GETBULK
        name_raw, serial_raw, oper_raw, rx_raw, tx_raw, olt_rx_raw, desc_raw = \
            await asyncio.gather(
                self._bulk_walk(OID_ONU_NAME),
                self._bulk_walk(OID_ONU_SERIAL),
                self._bulk_walk(OID_OPER_STATE),
                self._bulk_walk(OID_RX_POWER),
                self._bulk_walk(OID_TX_POWER),
                self._bulk_walk(OID_OLT_RX),
                self._bulk_walk(OID_ONU_DESCRIPTION),
            )
        logger.info(f"  SNMP light: name={len(name_raw)} serial={len(serial_raw)} oper={len(oper_raw)} rx={len(rx_raw)} tx={len(tx_raw)} olt_rx={len(olt_rx_raw)} desc={len(desc_raw)}")

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

        # Parse regTable (oper_state, rx, tx, olt_rx): suffix .ponIndex.onuSlot.onuId
        oper_by_key = {}
        rx_by_key = {}
        tx_by_key = {}
        olt_rx_by_key = {}

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
            status = decode_oper_state(oper_val)

            olt_rx = olt_rx_by_key.get(key)
            onu_rx = rx_by_key.get(key)
            tx = tx_by_key.get(key)

            # ZTE C320 SNMP oper_state=5 covers both 'online' and 'dyinggasp'.
            # A truly online ONU always has RX power values from SNMP.
            # A DyingGasp ONU has rx_power=None but may still have tx_power.
            # If oper_state says online but both RX values are None, mark as dyinggasp.
            if status == 'online' and olt_rx is None and onu_rx is None:
                status = 'dyinggasp'

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
                'last_dereg_reason': '',
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
                try: dist_by_key[(int(parts[0]), int(parts[1]))] = int(val)
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
