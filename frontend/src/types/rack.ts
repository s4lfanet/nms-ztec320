/**
 * Normalized rack data types — shared across all vendor rack diagram components.
 * This is the canonical contract between backend adapters and frontend renderers.
 */

export interface CardPort {
  portIndex: number;
  isUplink: boolean;
  adminUp: boolean | null;
  operUp: boolean | null;
  description: string | null;
  // ONU stats (PON ports only)
  total: number;
  online: number;
  offline: number;
  los: number;
  dyinggasp: number;
  unconfigCount: number;
  authfail: number;
  // SFP / DOM optical
  sfpTxPower: number | null;    // dBm
  sfpRxPower: number | null;    // dBm
  sfpBiasCurrent: number | null; // mA
  sfpVoltage: number | null;    // V
  sfpTemperature: number | null; // °C
  sfpWavelength: number | null; // nm
  sfpVendor: string | null;
  sfpModel: string | null;
  // Traffic
  inOctets: number | null;
  outOctets: number | null;
  // Metadata
  source: string | null;  // 'ifmib', 'onu-data', 'card-status'
  // DB IDs for toggle actions
  portId: number | null;    // OLTPort.id (PON ports)
  uplinkId: number | null;  // OLTUplink.id (uplink ports)
}

export interface SlotCard {
  slotIndex: number;
  cardType: string;
  isPresent: boolean;
  cardStatus: 'inservice' | 'fault' | 'empty';
  cardRole: 'main' | 'standby' | null;
  operStatus: 'up' | 'down';
  cpuUsage: number | null;
  memoryUsage: number | null;
  temperature: number | null;
  currentMa: number | null;   // ZTE PRWH
  voltageMv: number | null;   // ZTE PRWH
  ports: CardPort[];
}

export interface FanStatus {
  index: number;
  status: 'active' | 'inactive' | 'unknown';
  speedLevel: number | null;
  rpm: number | null;
}

export interface PsuStatus {
  index: number;
  status: 'normal' | 'fault' | 'unknown';
  current: number | null;
}

export interface RackData {
  brand: string;
  model: string | null;
  supported: boolean;
  standalone: boolean;
  chassisTemp: number | null;
  uptime: string | null;
  ponPortCount: number | null;
  uplinkPortCount: number | null;
  slots: SlotCard[];
  fans: FanStatus[];
  psus: PsuStatus[];
}

export interface RackMetrics {
  uptime: string | null;
  activeCards: number;
  fansActive: number;
  fansTotal: number;
  losTotal: number;
  supplyCurrentMa: number | null;
  supplyVoltageMv: number | null;
  psuStatus: 'normal' | 'fault' | 'unknown';
  portDescriptions: Record<string, string>;
  allPortKeys: string[];
}

export interface RackDiagramProps {
  oltId: string;
  onPortClick?: (slot: number, port: number) => void;
  onMetrics?: (m: RackMetrics) => void;
}
