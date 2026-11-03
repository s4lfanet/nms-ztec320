"""C-Data GPON adapter — Fase 13 Tahap 1 (monitoring SNMP read-only).

Berdasarkan peta OID terverifikasi di KusumaVision NMS (MIT):
docs/SMARTOLT_CDATA_GUIDE.md + docs/handbook/17-cdata-gpon-snmp-walk.md.

Jalur utama = tabel NSCRTV-FTTX-GPON-MIB `1.3.6.1.4.1.17409.2.8.4.*` —
satu-satunya jalur yang terverifikasi konsisten di FD1608S (V3.3.86) maupun
FD1601S (V3.2.5). Tabel `34592.*` dibiarkan ke adapter EPON standalone
(tidak andal di GPON: FD1601S terbaca 0 ONU, optik `.21` salah status).

PENTING: `sysObjectID` TIDAK dipakai — FD1608S GPON melapor `17409` sama
seperti EPON. Dispatch family ada di `CDataAdapter` (model/vendor string).
Provisioning/CLI write sengaja TIDAK diimplementasikan sampai ada output
CLI asli dari perangkat user.
"""
import logging
import re

from .standalone_epon_adapter import StandaloneEponAdapter
from .hioso_adapter import format_mac_or_sn

logger = logging.getLogger(__name__)

# ─── NSCRTV-FTTX-GPON-MIB (1.3.6.1.4.1.17409.2.8.4) ───
NS = '1.3.6.1.4.1.17409.2.8.4'
OID_ONU_NAME     = NS + '.1.1.2'    # "gpon F/S/P onu N <label>" — master index
OID_ONU_SERIAL   = NS + '.1.1.3'    # 8 byte: 4 ASCII vendor + 4 hex
OID_ONU_VENDOR   = NS + '.1.1.5'    # ZTEG, CDTC, ...
OID_ONU_EQUIP    = NS + '.1.1.6'    # F609V5.3 — actual_type
OID_ONU_STATUS   = NS + '.1.1.7'    # 1 up / 2 down
OID_ONU_DISTANCE = NS + '.1.1.9'    # meter
OID_ONU_DOWN_CAUSE = NS + '.1.1.103'  # LOS / dying-gasp / --
OID_ONU_RX       = NS + '.4.1.4'    # centi-dBm; -1 = offline
OID_ONU_MAC      = '1.3.6.1.4.1.17409.2.3.4.7.1.3'  # <onuIndex>.1 (kosong di FD1601S)

_ONU_INDEX_BASE = 0x480000  # onuIndex global = 0x480000 + seq → 4718593 = ONU pertama

_ONU_NAME_RE = re.compile(
    r'(?:gpon|epon)?\s*(\d+)\s*/\s*(\d+)\s*/\s*(\d+)\s+onu\s+(\d+)\s*(.*)',
    re.IGNORECASE)


def _raw_bytes(val) -> bytes | None:
    """Ambil bytes dari nilai SNMP (pysnmp OctetString / bytes / str)."""
    if val is None:
        return None
    try:
        if hasattr(val, 'asOctets'):
            return bytes(val.asOctets())
        if isinstance(val, (bytes, bytearray)):
            return bytes(val)
    except Exception:
        pass
    s = str(val)
    # '0x5a5445...' hex string
    if s.lower().startswith('0x'):
        try:
            return bytes.fromhex(s[2:].replace(' ', ''))
        except ValueError:
            return None
    return None


def _text(val) -> str:
    if val is None:
        return ''
    raw = _raw_bytes(val)
    if raw is not None:
        try:
            return raw.decode('ascii', errors='ignore').replace('\x00', '').strip()
        except Exception:
            return ''
    return str(val).replace('\x00', '').strip()


def parse_gpon_onu_name(val) -> tuple[int, int, int, int, str]:
    """Parse 'gpon F/S/P onu N <label>' → (frame, slot, port, onu_id, label).

    Frame/slot dari string adalah 0-based di firmware C-Data → disimpan
    1-based agar konsisten dengan konvensi ONU Salfanet.
    """
    name = _text(val)
    m = _ONU_NAME_RE.search(name)
    if m:
        return int(m.group(1)) + 1, int(m.group(2)) + 1, int(m.group(3)), int(m.group(4)), m.group(5).strip()
    # Fallback: nama tidak terparse (mis. Hex-STRING rusak) — pakai seq dari onuIndex.
    return 0, 0, 0, 0, name


def decode_gpon_serial(val) -> str:
    """Decode onuSerialNum: 8 byte = 4 ASCII vendor + 4 byte hex → 'ZTEG1A2B3C4D'."""
    raw = _raw_bytes(val)
    if raw and len(raw) >= 8:
        prefix = raw[:4].decode('ascii', errors='ignore').replace('\x00', '').strip()
        suffix = raw[4:8].hex().upper()
        return f'{prefix}{suffix}'
    s = _text(val)
    if s and s.lower() not in ('--', 'none', '0'):
        return s
    return ''


def parse_centi_dbm(val) -> float | None:
    """Rx ONU dalam centi-dBm (-2495 → -24.95). -1 / ≥0 dibuang."""
    if val is None:
        return None
    try:
        n = int(str(val).split()[0])
    except (ValueError, IndexError):
        try:
            n = int(val)
        except Exception:
            return None
    if n == -1 or n >= 0:
        return None
    return round(n / 100.0, 2)


def _gpon_model(olt) -> bool:
    """True bila OLT C-Data adalah family GPON (fd16xx/fd1216/fd1616 atau kata 'gpon')."""
    probe = f"{getattr(olt, 'model', '') or ''} {getattr(olt, 'name', '') or ''}".lower()
    return any(k in probe for k in ('gpon', 'fd16', 'fd1216', 'fd1616'))


class CDataAdapter(StandaloneEponAdapter):
    """Dispatch vendor 'cdata': model GPON → CDataGponAdapter, selain itu EPON.

    sysObjectID tidak bisa dipercaya (FD1608S GPON melapor 17409 = EPON),
    jadi pemilihan family murni dari string model/nama yang diisi operator
    (mis. type 'CDATA-FD1608S' → vendor 'cdata', model 'FD1608S').
    """
    def __new__(cls, olt):
        if cls is CDataAdapter and _gpon_model(olt):
            return CDataGponAdapter(olt)
        return super().__new__(cls)


class CDataGponAdapter(StandaloneEponAdapter):
    """SNMP read-only monitoring untuk OLT C-Data GPON (FD1601S/1602S/1608S/1216S/1616GS)."""

    vendor = 'cdata-gpon'
    pon_port_prefix = 'gpon-olt_1/1/'

    def _default_pon_count(self) -> int:
        model = (self.olt.model or '').upper()
        if 'FD1616' in model:
            return 16
        if 'FD1601' in model or 'FD1216' in model:
            return 1 if 'FD1601' in model else 16
        if 'FD1602' in model:
            return 2
        return 8  # FD1608S & fallback

    def collect_onus(self) -> list:
        onus = []
        try:
            from snmp_core import SNMPCollector
            sc = SNMPCollector(self.olt.ip_address, self.olt.snmp_community or 'public',
                               self.olt.snmp_port or 161)
            walk = lambda oid: sc._run(sc._walk_async(oid))

            names   = walk(OID_ONU_NAME)
            if not names:
                sc.close()
                logger.warning(f'[{self.olt.vendor}:{self.olt.name}] C-Data GPON: tabel ONU kosong/timeout')
                return []
            serials = walk(OID_ONU_SERIAL)
            vendors = walk(OID_ONU_VENDOR)
            equips  = walk(OID_ONU_EQUIP)
            statuses = walk(OID_ONU_STATUS)
            dists   = walk(OID_ONU_DISTANCE)
            causes  = walk(OID_ONU_DOWN_CAUSE)
            rxs     = walk(OID_ONU_RX)
            macs    = walk(OID_ONU_MAC)
            sc.close()

            # rx & mac di-index <onuIndex>.<extra> — pakai segmen pertama saja
            rx_by_idx  = {str(k).split('.')[0]: v for k, v in rxs.items()}
            mac_by_idx = {str(k).split('.')[0]: v for k, v in macs.items()}

            for idx, raw_name in names.items():
                frame, slot, port, onu_id, label = parse_gpon_onu_name(raw_name)
                if not onu_id:
                    try:
                        onu_id = max(int(idx) - _ONU_INDEX_BASE, 1)
                    except Exception:
                        onu_id = 1
                    frame, slot, port = 1, 1, 1
                serial = decode_gpon_serial(serials.get(idx)) \
                    or format_mac_or_sn(mac_by_idx.get(idx)) \
                    or f'CDATA-{slot}-{port}-{onu_id}'

                try:
                    st = int(str(statuses.get(idx, '2')).split()[0])
                except Exception:
                    st = 2
                cause = _text(causes.get(idx))
                cause_l = cause.lower()
                if st == 1:
                    status = 'online'
                elif 'dying' in cause_l:
                    status = 'dyinggasp'
                elif 'los' in cause_l:
                    status = 'los'
                else:
                    status = 'offline'

                rx_dbm = parse_centi_dbm(rx_by_idx.get(str(idx))) if status == 'online' else None
                dist_val = None
                try:
                    d = int(str(dists.get(idx, '')).split()[0])
                    if d >= 0:
                        dist_val = d
                except Exception:
                    pass

                onus.append({
                    'frame': frame or 1,
                    'slot': slot or 1,
                    'port': port or 1,
                    'onu_id': onu_id,
                    'onu_index': (slot or 1) * 100000 + (port or 1) * 1000 + onu_id,
                    'serial_number': serial,
                    'name': label or f'ONU_{slot}/{port}:{onu_id}',
                    'description': label,
                    'status': status,
                    'oper_state': 4 if status == 'online' else 2,
                    'reg_status': 1,
                    'rx_power': rx_dbm,
                    'onu_rx_power': rx_dbm,
                    'tx_power': None,
                    'distance': dist_val,
                    'actual_type': _text(equips.get(idx)),
                    'vendor_id': _text(vendors.get(idx)),
                    'last_dereg_reason': cause if status != 'online' else '',
                    'pppoe': '',
                })
        except Exception as e:
            logger.error(f'[{self.olt.vendor}:{self.olt.name}] C-Data GPON collect_onus failed: {e}')
        return onus
