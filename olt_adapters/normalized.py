"""Normalized data types shared across all vendor adapters."""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class NormalizedPort:
    """Vendor-agnostic port representation."""
    port_index: int
    is_uplink: bool = False
    admin_up: Optional[bool] = None
    oper_up: Optional[bool] = None
    description: Optional[str] = None
    # ONU stats (PON ports only)
    total: int = 0
    online: int = 0
    offline: int = 0
    los: int = 0
    dying_gasp: int = 0
    unconfig: int = 0
    auth_fail: int = 0
    # SFP / DOM optical
    sfp_tx_power: Optional[float] = None    # dBm
    sfp_rx_power: Optional[float] = None    # dBm
    sfp_bias_current: Optional[float] = None  # mA
    sfp_voltage: Optional[float] = None     # V
    sfp_temperature: Optional[float] = None  # °C
    sfp_wavelength: Optional[float] = None  # nm
    sfp_vendor: Optional[str] = None
    sfp_model: Optional[str] = None
    # Traffic
    in_octets: Optional[int] = None
    out_octets: Optional[int] = None
    # DB IDs for toggle actions
    port_id: Optional[int] = None    # OLTPort.id (PON ports)
    uplink_id: Optional[int] = None  # OLTUplink.id (uplink ports)
    # Metadata
    source: Optional[str] = None  # 'ifmib', 'onu-data', 'card-status'

    def to_dict(self) -> dict:
        return {
            'portIndex': self.port_index,
            'isUplink': self.is_uplink,
            'adminUp': self.admin_up,
            'operUp': self.oper_up,
            'description': self.description,
            'total': self.total,
            'online': self.online,
            'offline': self.offline,
            'los': self.los,
            'dyinggasp': self.dying_gasp,
            'unconfigCount': self.unconfig,
            'authfail': self.auth_fail,
            'sfpTxPower': self.sfp_tx_power,
            'sfpRxPower': self.sfp_rx_power,
            'sfpBiasCurrent': self.sfp_bias_current,
            'sfpVoltage': self.sfp_voltage,
            'sfpTemperature': self.sfp_temperature,
            'sfpWavelength': self.sfp_wavelength,
            'sfpVendor': self.sfp_vendor,
            'sfpModel': self.sfp_model,
            'inOctets': self.in_octets,
            'outOctets': self.out_octets,
            'source': self.source,
            'portId': self.port_id,
            'uplinkId': self.uplink_id,
        }


@dataclass
class NormalizedSlot:
    """Vendor-agnostic slot/card representation."""
    slot_index: int
    card_type: str = 'EMPTY'
    is_present: bool = False
    card_status: str = 'empty'  # 'inservice', 'fault', 'empty'
    card_role: Optional[str] = None  # 'main', 'standby'
    oper_status: str = 'down'  # 'up', 'down'
    cpu_usage: Optional[float] = None
    memory_usage: Optional[float] = None
    temperature: Optional[float] = None
    current_ma: Optional[float] = None   # ZTE PRWH
    voltage_mv: Optional[float] = None   # ZTE PRWH
    ports: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            'slotIndex': self.slot_index,
            'cardType': self.card_type,
            'isPresent': self.is_present,
            'cardStatus': self.card_status,
            'cardRole': self.card_role,
            'operStatus': self.oper_status,
            'cpuUsage': self.cpu_usage,
            'memoryUsage': self.memory_usage,
            'temperature': self.temperature,
            'currentMa': self.current_ma,
            'voltageMv': self.voltage_mv,
            'ports': [p.to_dict() if isinstance(p, NormalizedPort) else p for p in self.ports],
        }


@dataclass
class NormalizedFan:
    index: int
    status: str = 'unknown'  # 'active', 'inactive', 'unknown'
    speed_level: Optional[int] = None
    rpm: Optional[int] = None

    def to_dict(self) -> dict:
        return {
            'index': self.index,
            'status': self.status,
            'speedLevel': self.speed_level,
            'rpm': self.rpm,
        }


@dataclass
class NormalizedPsu:
    index: int
    status: str = 'unknown'  # 'normal', 'fault', 'unknown'
    current: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            'index': self.index,
            'status': self.status,
            'current': self.current,
        }


@dataclass
class RackData:
    """Top-level normalized rack data returned to frontend."""
    brand: str = ''
    model: Optional[str] = None
    supported: bool = False
    standalone: bool = False
    chassis_temp: Optional[float] = None
    uptime: Optional[str] = None
    pon_port_count: Optional[int] = None
    uplink_port_count: Optional[int] = None
    slots: list = field(default_factory=list)
    fans: list = field(default_factory=list)
    psus: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            'brand': self.brand,
            'model': self.model,
            'supported': self.supported,
            'standalone': self.standalone,
            'chassisTemp': self.chassis_temp,
            'uptime': self.uptime,
            'ponPortCount': self.pon_port_count,
            'uplinkPortCount': self.uplink_port_count,
            'slots': [s.to_dict() if isinstance(s, NormalizedSlot) else s for s in self.slots],
            'fans': [f.to_dict() if isinstance(f, NormalizedFan) else f for f in self.fans],
            'psus': [p.to_dict() if isinstance(p, NormalizedPsu) else p for p in self.psus],
        }
