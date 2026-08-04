import { useState, useEffect, useCallback, useMemo } from 'react';
import { cn } from '../lib/utils';
import { RefreshCw, Zap, X, Wifi, WifiOff, Pause, Play, Activity, Cpu, HardDrive, Network } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChassisPort {
  port: number;
  portId?: number | null;
  portName?: string;
  name?: string;
  iface?: string | null;
  onuCount: number;
  onlineCount: number;
  losCount?: number;
  dyingGaspCount?: number;
  unregisteredCount?: number;
  hasOnus: boolean;
  avgRxPower?: number | null;
  adminStatus?: string;
  linkStatus?: string;
  speed?: string;
  duplex?: string;
  medium?: string;
  description?: string;
  physicalType?: string;
  isEnabled?: boolean;
  isLinked?: boolean;
  vlansTagged?: string;
  inputRate?: string;
  outputRate?: string;
  inputUtil?: string;
  outputUtil?: string;
  inputBytes?: number;
  outputBytes?: number;
  sfpVendor?: string;
  sfpType?: string;
  sfpRxPower?: string;
  sfpTxPower?: string;
  sfpTemp?: string;
  sfpWavelength?: string;
  id?: number;
}

type SelectedPort = { type: 'pon'; port: ChassisPort; slot: ChassisSlot } | { type: 'uplink'; port: ChassisPort; slot: ChassisSlot } | null;

interface ChassisSlot {
  index: number;
  label: string;
  type: 'service' | 'uplink' | 'mcud' | 'empty';
  present: boolean;
  cardType: string;
  cardStatus?: string;
  portCount: number;
  ports: ChassisPort[];
  temperature?: number | null;
  cpuUsage?: number | null;
  memoryUsage?: number | null;
}

interface FanInfo {
  number: number;
  status: string;
  rpm: number | null;
}

interface ChassisData {
  chassis: ChassisSlot[];
  fans: FanInfo[];
  fanSummary: string;
}

// ─── Color helpers ────────────────────────────────────────────────────────────


function uplinkPortColor(port: ChassisPort) {
  if (port.isEnabled === false)
    return { bg: 'var(--bg-glass)', border: 'var(--border-hover)', dot: 'var(--text-3)', text: 'var(--text-2)', state: 'DIS' };
  if (port.isEnabled && port.isLinked)
    return { bg: 'rgba(34, 211, 160, 0.12)', border: 'var(--color-success)', dot: 'var(--color-success)', text: 'var(--color-success)', state: 'UP' };
  if (port.isEnabled)
    return { bg: 'rgba(251, 176, 64, 0.12)', border: 'var(--color-warning)', dot: 'var(--color-warning)', text: 'var(--color-warning)', state: 'DOWN' };
  return { bg: 'var(--bg-surface)', border: 'var(--border-color)', dot: 'var(--text-3)', text: 'var(--text-3)', state: 'UNK' };
}

function ponPortTooltip(slot: ChassisSlot, port: ChassisPort): string {
  const lines = [
    `PON ${slot.index}/${port.port}`,
    port.name ? `Name: ${port.name}` : null,
    port.description ? `Desc: ${port.description}` : null,
    `Admin: ${(port.adminStatus || 'up').toUpperCase()}`,
  ];
  if (port.hasOnus) {
    lines.push('---');
    lines.push(`Total ONU : ${port.onuCount}`);
    lines.push(`Online    : ${port.onlineCount}`);
    lines.push(`Offline   : ${port.onuCount - port.onlineCount}`);
    lines.push(`LOS       : ${port.losCount ?? 0}`);
    lines.push(`DyingGasp : ${port.dyingGaspCount ?? 0}`);
    lines.push(`Unreg     : ${port.unregisteredCount ?? 0}`);
    if (port.avgRxPower != null) lines.push(`Avg RX    : ${port.avgRxPower} dBm`);
  } else {
    lines.push('(No ONU)');
  }
  if (slot.temperature != null) lines.push(`Card Temp : ${slot.temperature}°C`);
  return lines.filter(Boolean).join('\n');
}

function uplinkTooltip(slot: ChassisSlot, port: ChassisPort): string {
  const lines = [
    `${slot.cardType}`,
    `Port ${port.port}: ${port.linkStatus ?? 'Unknown'}`,
    `Admin : ${port.adminStatus ?? 'Unknown'}`,
  ];
  if (port.speed) lines.push(`Speed : ${port.speed}`);
  if (port.iface) lines.push(`Iface : ${port.iface}`);
  if (port.description) lines.push(`Desc  : ${port.description}`);
  return lines.join('\n');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// ─── PON Port Detail Panel ───────────────────────────────────────────────────

function PonPortPanel({ oltId, port, slot, onClose, onRefresh }: {
  oltId: number; port: ChassisPort; slot: ChassisSlot;
  onClose: () => void; onRefresh: () => void;
}) {
  const [toggling, setToggling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [optical, setOptical] = useState<Record<string, string> | null>(null);
  const [opticalLoading, setOpticalLoading] = useState(false);
  const isUp = (port.adminStatus || 'up').toLowerCase() === 'up';
  const offline = port.onuCount - port.onlineCount;

  // Fetch optical module info on open
  useEffect(() => {
    if (!port.portId) return;
    setOpticalLoading(true);
    fetch(`/api/olt/${oltId}/pon-port/${port.portId}/optical`, { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (j.success) setOptical(j.optical || {}); })
      .catch(() => {})
      .finally(() => setOpticalLoading(false));
  }, [oltId, port.portId]);

  const doToggle = async () => {
    if (!port.portId) return;
    setToggling(true); setMsg(null);
    try {
      const action = isUp ? 'disable' : 'enable';
      const r = await fetch(`/api/olt/${oltId}/pon-port/${port.portId}/toggle`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const j = await r.json();
      setMsg(j.success ? `✓ Port ${action}d` : `Error: ${j.message}`);
      if (j.success) { setTimeout(() => { onClose(); onRefresh(); }, 800); }
    } catch (e) { setMsg('Network error'); }
    finally { setToggling(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-overlay" />
      <div className="relative w-full max-w-sm mx-4 rounded-xl border shadow-2xl"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-hover)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div>
            <div className="text-sm font-bold text-tx1">{port.portName || `PON ${slot.index}/${port.port}`}</div>
            {port.name && <div className="text-[11px] text-success">{port.name}</div>}
          </div>
          <button onClick={onClose} className="text-tx3 hover:text-tx1"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          {/* Status */}
          <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: isUp ? 'rgba(34, 211, 160, 0.12)' : 'rgba(255, 87, 87, 0.12)', border: `1px solid ${isUp ? 'var(--color-success)' : 'var(--color-danger)'}` }}>
            <div className={cn('w-2.5 h-2.5 rounded-full', isUp ? 'bg-success animate-pulse' : 'bg-danger')} />
            <div>
              <div className={cn('text-sm font-bold', isUp ? 'text-success' : 'text-danger')}>
                Admin {isUp ? 'UP' : 'DOWN'}
              </div>
              {port.description && <div className="text-[10px] text-tx3">{port.description}</div>}
            </div>
          </div>

          {/* ONU Stats */}
          <div className="grid grid-cols-4 gap-2 text-center">
            {[['Total', port.onuCount, 'text-tx1'], ['Online', port.onlineCount, 'text-success'],
              ['Offline', offline, offline > 0 ? 'text-danger' : 'text-tx3'],
              ['LOS', port.losCount ?? 0, (port.losCount ?? 0) > 0 ? 'text-danger' : 'text-tx3']
            ].map(([label, val, cls]) => (
              <div key={String(label)} className="p-2 rounded" style={{ background: 'var(--bg-glass)' }}>
                <div className={cn('text-lg font-bold', String(cls))}>{String(val)}</div>
                <div className="text-[9px] text-tx3">{String(label)}</div>
              </div>
            ))}
          </div>

          {/* Progress */}
          {port.onuCount > 0 && (
            <div>
              <div className="flex justify-between text-[10px] text-tx3 mb-1">
                <span>ONU Online</span>
                <span>{port.onlineCount}/{port.onuCount} ({Math.round(port.onlineCount / port.onuCount * 100)}%)</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-color)' }}>
                <div className="h-full rounded-full bg-success"
                  style={{ width: `${Math.round(port.onlineCount / port.onuCount * 100)}%` }} />
              </div>
            </div>
          )}

          {/* Avg RX */}
          {port.avgRxPower != null && (
            <div className="flex justify-between text-xs" style={{ color: 'var(--text-2)' }}>
              <span>Avg RX Power</span>
              <span className="font-mono text-success">{port.avgRxPower} dBm</span>
            </div>
          )}

          {/* Optical Module Info */}
          {opticalLoading && (
            <div className="flex items-center gap-2 text-xs text-tx3 p-2 rounded" style={{ background: 'var(--bg-glass)' }}>
              <RefreshCw size={12} className="animate-spin" /> Loading optical module...
            </div>
          )}
          {optical && !opticalLoading && Object.keys(optical).length > 0 && (
            <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-hover)' }}>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-info">
                <Activity size={12} /> Optical Module Info
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
                {optical.vendor && (<><span className="text-tx3">Vendor</span><span className="text-tx1 font-mono text-right">{optical.vendor}</span></>)}
                {optical.type && (<><span className="text-tx3">Part Number</span><span className="text-tx1 font-mono text-right">{optical.type}</span></>)}
                {optical.serial && (<><span className="text-tx3">Serial</span><span className="text-tx1 font-mono text-right">{optical.serial}</span></>)}
                {optical.wavelength && (<><span className="text-tx3">Wavelength</span><span className="text-tx1 font-mono text-right">{optical.wavelength} nm</span></>)}
                {optical.connector && (<><span className="text-tx3">Connector</span><span className="text-tx1 font-mono text-right">{optical.connector}</span></>)}
                {optical.distance && (<><span className="text-tx3">Trans. Distance</span><span className="text-tx1 font-mono text-right">{optical.distance} km</span></>)}
                {optical.tx_power && (<><span className="text-tx3">TX Power</span><span className="text-success font-mono text-right">{optical.tx_power} dBm</span></>)}
                {optical.rx_power && (<><span className="text-tx3">RX Power</span><span className="text-success font-mono text-right">{optical.rx_power} dBm</span></>)}
                {optical.temperature && (<><span className="text-tx3">Temperature</span><span className="text-warning font-mono text-right">{optical.temperature} °C</span></>)}
                {optical.voltage && (<><span className="text-tx3">Supply Voltage</span><span className="text-tx1 font-mono text-right">{optical.voltage} V</span></>)}
                {optical.bias_current && (<><span className="text-tx3">Bias Current</span><span className="text-tx1 font-mono text-right">{optical.bias_current} mA</span></>)}
              </div>
            </div>
          )}
          {optical && !opticalLoading && Object.keys(optical).length === 0 && (
            <div className="text-[10px] text-tx3 text-center p-2 rounded" style={{ background: 'var(--bg-glass)' }}>
              No optical module data available
            </div>
          )}

          {/* Action */}
          {port.portId && (
            <button onClick={doToggle} disabled={toggling}
              className={cn('w-full py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50',
                isUp ? 'bg-danger/10 border border-danger/40 hover:bg-danger/20 text-danger'
                      : 'bg-success/10 border border-success/40 hover:bg-success/20 text-success')}>
              {isUp ? <Pause size={13} /> : <Play size={13} />}
              {toggling ? 'Processing...' : isUp ? 'Disable Port' : 'Enable Port'}
            </button>
          )}
          {msg && (
            <div className={cn('text-xs p-2 rounded', msg.startsWith('✓') ? 'bg-success/10 text-success border border-success/30' : 'bg-danger/10 text-danger border border-danger/30')}>
              {msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Uplink Port Detail Panel ─────────────────────────────────────────────────

function UplinkPanel({ oltId, port, slot, onClose, onRefresh }: {
  oltId: number; port: ChassisPort; slot: ChassisSlot;
  onClose: () => void; onRefresh: () => void;
}) {
  const [toggling, setToggling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const isEnabled = port.isEnabled !== false;
  const isLinked = port.isLinked === true;

  const statusColor = !isEnabled
    ? { bg: 'var(--bg-surface)', border: 'var(--border-hover)', dot: 'bg-tx3', label: 'Disabled', text: 'text-tx2' }
    : isLinked
      ? { bg: 'rgba(34, 211, 160, 0.12)', border: 'var(--color-success)', dot: 'bg-success animate-pulse', label: 'Online', text: 'text-success' }
      : { bg: 'rgba(251, 176, 64, 0.12)', border: 'var(--color-warning)', dot: 'bg-warning', label: 'Admin UP / Link DOWN', text: 'text-warning' };

  const doToggle = async () => {
    if (!port.id) return;
    setToggling(true); setMsg(null);
    try {
      const action = isEnabled ? 'disable' : 'enable';
      const r = await fetch(`/api/olt/${oltId}/uplink/${port.id}/toggle`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const j = await r.json();
      setMsg(j.success ? `✓ Port ${action}d` : `Error: ${j.message}`);
      if (j.success) { setTimeout(() => { onClose(); onRefresh(); }, 800); }
    } catch (e) { setMsg('Network error'); }
    finally { setToggling(false); }
  };

  const vlans = (port.vlansTagged || '').split(',').filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-overlay" />
      <div className="relative w-full max-w-sm mx-4 rounded-xl border shadow-2xl overflow-y-auto max-h-[90vh]"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-hover)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div>
            <div className="text-sm font-bold text-tx1 font-mono">{port.iface || `Uplink ${port.port}`}</div>
            <div className="text-[10px] text-info">{slot.cardType}</div>
          </div>
          <button onClick={onClose} className="text-tx3 hover:text-tx1"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          {/* Status */}
          <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: statusColor.bg, border: `1px solid ${statusColor.border}` }}>
            <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', statusColor.dot)} />
            <div className="min-w-0">
              <div className={cn('text-sm font-bold', statusColor.text)}>{statusColor.label}</div>
              <div className="text-[10px] text-tx3 truncate">
                Admin: {port.adminStatus ?? '—'} · Link: {port.linkStatus ?? '—'} · {port.speed || '—'}
              </div>
            </div>
          </div>

          {/* Port details */}
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Speed', port.speed || '—'],
              ['Duplex', port.duplex || '—'],
              ['Medium', port.medium || '—'],
              ['Type', port.physicalType === 'xge' ? '10GE' : 'GE'],
            ].map(([k, v]) => (
              <div key={String(k)} className="p-2 rounded" style={{ background: 'var(--bg-glass)' }}>
                <div className="text-[9px] text-tx3 uppercase">{String(k)}</div>
                <div className="text-xs text-tx1 font-mono mt-0.5">{String(v)}</div>
              </div>
            ))}
          </div>

          {/* Traffic */}
          {(port.inputRate || port.outputRate) && (
            <div className="p-3 rounded-lg space-y-1.5" style={{ background: 'var(--bg-glass)' }}>
              <div className="text-[10px] text-tx2 flex items-center gap-1"><Activity size={10} /> Traffic</div>
              <div className="flex justify-between text-[11px]">
                <span className="text-tx3">↓ In</span>
                <span className="text-success font-mono">{port.inputRate} <span className="text-tx3">({port.inputUtil})</span></span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-tx3">↑ Out</span>
                <span className="text-info font-mono">{port.outputRate} <span className="text-tx3">({port.outputUtil})</span></span>
              </div>
            </div>
          )}

          {/* VLANs */}
          {vlans.length > 0 && (
            <div>
              <div className="text-[10px] text-tx3 mb-1.5">VLANs ({vlans.length})</div>
              <div className="flex flex-wrap gap-1">
                {vlans.slice(0, 30).map(v => (
                  <span key={v} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-info/10 border border-info/30 text-info">{v}</span>
                ))}
                {vlans.length > 30 && <span className="text-[9px] text-tx3">+{vlans.length - 30} more</span>}
              </div>
            </div>
          )}

          {/* SFP */}
          {port.sfpVendor && (
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-glass)' }}>
              <div className="text-[10px] text-tx2 mb-1.5">SFP / Transceiver</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
                {port.sfpVendor && <><span className="text-tx3">Vendor</span><span className="text-tx1">{port.sfpVendor}</span></>}
                {port.sfpType && <><span className="text-tx3">Type</span><span className="text-tx1">{port.sfpType}</span></>}
                {port.sfpWavelength && <><span className="text-tx3">λ</span><span className="text-tx1">{port.sfpWavelength}</span></>}
                {port.sfpTemp && <><span className="text-tx3">Temp</span><span className="text-warning">{port.sfpTemp}</span></>}
                {port.sfpRxPower && <><span className="text-tx3">RX</span><span className="text-success">{port.sfpRxPower}</span></>}
                {port.sfpTxPower && <><span className="text-tx3">TX</span><span className="text-info">{port.sfpTxPower}</span></>}
              </div>
            </div>
          )}

          {/* Toggle */}
          {port.id && (
            <button onClick={doToggle} disabled={toggling}
              className={cn('w-full py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-2 disabled:opacity-50',
                isEnabled ? 'bg-danger/10 border border-danger/40 hover:bg-danger/20 text-danger'
                           : 'bg-success/10 border border-success/40 hover:bg-success/20 text-success')}>
              {isEnabled ? <WifiOff size={13} /> : <Wifi size={13} />}
              {toggling ? 'Processing...' : isEnabled ? 'Disable Port' : 'Enable Port'}
            </button>
          )}
          {msg && (
            <div className={cn('text-xs p-2 rounded', msg.startsWith('✓') ? 'bg-success/10 text-success border border-success/30' : 'bg-danger/10 text-danger border border-danger/30')}>
              {msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Fan Column ───────────────────────────────────────────────────────────────

function FanColumn({ fans, summary, isOnline }: { fans: FanInfo[]; summary: string; isOnline?: boolean }) {
  const fanList = fans.length > 0 ? fans : [{ number: 1, status: 'unknown', rpm: null }, { number: 2, status: 'unknown', rpm: null }];
  return (
    <div className="flex flex-col items-center justify-between py-2 px-1 sm:px-2 sm:py-3 rounded select-none flex-shrink-0"
      style={{ minWidth: 32, background: 'var(--bg-glass)', border: '1px solid var(--border-color)' }}>
      <div className="flex items-center gap-0.5 sm:gap-1">
        <Zap className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-info" />
        <span className="text-[8px] sm:text-[9px] text-tx2 font-mono font-bold">FAN</span>
      </div>
      <div className="flex flex-col items-center gap-2 sm:gap-3 my-1 sm:my-2">
        {fanList.map(f => {
          const active = (f.status || '').toLowerCase() in { online: 1, normal: 1, running: 1 } || isOnline;
          return (
            <div key={f.number} className="flex flex-col items-center gap-0.5" title={f.rpm ? `Fan ${f.number}: ${f.rpm} RPM` : `Fan ${f.number}`}>
              <div className="relative w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full" style={{ border: `2px solid ${active ? 'var(--color-success)' : 'var(--border-hover)'}` }} />
                <div className={active ? 'animate-spin' : ''} style={{ animationDuration: '2.5s' }}>
                  <svg width="16" height="16" viewBox="0 0 20 20" className="sm:w-5 sm:h-5">
                    <path d="M10 4 Q14 8 10 10 Q14 12 10 16 Q6 12 10 10 Q6 8 10 4Z" fill={active ? 'var(--color-success)' : 'var(--text-3)'} opacity="0.8" />
                    <path d="M4 10 Q8 6 10 10 Q8 14 4 10Z M16 10 Q12 14 10 10 Q12 6 16 10Z" fill={active ? 'var(--color-success)' : 'var(--bg-glass-hover)'} opacity="0.5" />
                  </svg>
                </div>
              </div>
              <span className="text-[7px] sm:text-[8px] font-mono" style={{ color: active ? 'var(--color-success)' : 'var(--text-3)' }}>{f.number}</span>
            </div>
          );
        })}
      </div>
      <div className="text-center">
        <div className="text-[9px] sm:text-[10px] font-bold font-mono" style={{ color: isOnline ? 'var(--color-success)' : 'var(--text-3)' }}>{summary || '—'}</div>
        <div className="text-[7px] sm:text-[8px] text-tx3">Active</div>
      </div>
    </div>
  );
}

function SlotRow({ slot, onSelectPort }: { slot: ChassisSlot; onSelectPort: (port: ChassisPort, slot: ChassisSlot) => void }) {
  const isUplink = slot.type === 'uplink';
  const isActive = slot.present && slot.type !== 'empty';
  const ct = (slot.cardType || '').toUpperCase();
  const isSmxa = isUplink && (ct.startsWith('SMXA') || ct.startsWith('SCX') || ct.startsWith('HUVQ'));
  const isControl = isUplink && (ct.startsWith('SMXA') || ct.startsWith('SCX'));
  const rowBg = !isActive ? 'var(--bg-surface)' : 'var(--bg-glass)';
  const rowBorder = !isActive ? 'var(--border-color)' : isUplink ? 'var(--color-info)' : 'var(--color-success)';
  const labelColor = isUplink ? 'var(--color-info)' : 'var(--color-success)';

  // Temperature-based accent color
  const temp = slot.temperature;
  const accentColor = !isActive ? 'var(--border-color)'
    : temp == null ? rowBorder
    : temp >= 65 ? 'var(--color-danger)'
    : temp >= 55 ? 'var(--color-danger)'
    : temp >= 50 ? 'var(--color-warning)'
    : rowBorder;

  return (
    <div className="flex items-center gap-0 rounded-lg overflow-hidden select-none"
      style={{ background: rowBg, border: `1.5px solid ${rowBorder}`, minHeight: 44 }}>
      {/* Left accent bar — temperature-colored */}
      <div style={{ width: 3, alignSelf: 'stretch', background: accentColor }} />

      {/* Card type label */}
      <div className="flex items-center justify-start gap-1 px-1 sm:px-2" style={{ minWidth: 48 }}>
        {isActive ? (
          <>
            {isUplink ? (
              <Network size={11} className="flex-shrink-0 sm:hidden" style={{ color: labelColor }} />
            ) : slot.type === 'mcud' ? (
              <Cpu size={11} className="flex-shrink-0 sm:hidden" style={{ color: labelColor }} />
            ) : (
              <HardDrive size={11} className="flex-shrink-0 sm:hidden" style={{ color: labelColor }} />
            )}
            {isUplink ? (
              <Network size={13} className="hidden sm:block flex-shrink-0" style={{ color: labelColor }} />
            ) : slot.type === 'mcud' ? (
              <Cpu size={13} className="hidden sm:block flex-shrink-0" style={{ color: labelColor }} />
            ) : (
              <HardDrive size={13} className="hidden sm:block flex-shrink-0" style={{ color: labelColor }} />
            )}
            <div className="flex flex-col">
              <span className="text-[10px] sm:text-xs font-bold font-mono tracking-wider" style={{ color: labelColor }}>{slot.cardType}</span>
              {temp != null && temp >= 50 && (
                <span className="text-[7px] sm:text-[8px] font-mono leading-none" style={{ color: temp >= 65 ? 'var(--color-danger)' : temp >= 55 ? 'var(--color-warning)' : 'var(--color-warning)' }}>{temp}°C</span>
              )}
              {isControl && (
                <span className="text-[7px] sm:text-[8px] font-mono leading-none text-info">CTRL</span>
              )}
            </div>
            {/* PSU indicator for SMXA — right next to label */}
            {isSmxa && (
              <div className="flex items-center justify-center flex-shrink-0 ml-0.5"
                title="DC -48V PSU"
                style={{ width: 16, height: 16, borderRadius: 3, background: 'var(--bg-surface)', border: '1px solid var(--color-info)' }}>
                <Zap size={9} className="text-info" />
              </div>
            )}
          </>
        ) : (
          <span className="text-[10px] sm:text-xs text-tx3 font-mono">—</span>
        )}
      </div>

      {/* Port area */}
      <div className={cn('py-1.5 sm:py-2 pl-0.5 pr-1 sm:pr-2 overflow-x-auto', 'flex-1')}>
        {!isActive ? (
          <div className="flex items-center h-full text-xs text-tx3 tracking-[0.3em] justify-center">EMPTY</div>
        ) : (isSmxa || isUplink) ? (
          /* Uplink ports — clickable, inline layout */
          <div className="flex items-center gap-0.5 sm:gap-1 flex-nowrap">
              {slot.ports.map((port) => {
              const v = uplinkPortColor(port);
              const iface = port.iface ?? `port_${port.port}`;
              const isXGE = (port.iface || '').startsWith('xgei') || port.physicalType === 'xge';
              const shortLabel = isXGE
                ? iface.replace(/^xgei_1\/\d+\//, 'X/')
                : iface.replace(/^gei_1\//, 'B ');
              return (
                <button key={iface}
                  onClick={() => onSelectPort(port, slot)}
                  className="flex flex-col items-center px-1 sm:px-1.5 py-0.5 sm:py-1 rounded border transition-all hover:brightness-125 hover:scale-105 cursor-pointer"
                  style={{ background: v.bg, borderColor: v.border, minWidth: 30 }}
                  title={uplinkTooltip(slot, port)}>
                  <div className="w-1.5 h-1.5 rounded-full mb-0.5" style={{ background: v.dot }} />
                  <span className="text-[7px] sm:text-[8px] font-mono leading-none whitespace-nowrap font-bold" style={{ color: v.text }}>{shortLabel}</span>
                  <span className="text-[6px] sm:text-[7px] font-mono" style={{ color: v.text }}>{v.state}</span>
                </button>
              );
            })}
          </div>
        ) : (
          /* PON ports (GPON + EPON) — LED indicator boxes with badges */
          <div className="flex items-center gap-1 sm:gap-1.5 flex-nowrap">
            {slot.ports.filter(p => p.port !== 0).map((port) => {
              const hasOnu = port.hasOnus && port.onuCount > 0;
              const isDown = (port.adminStatus || 'up').toLowerCase() !== 'up';
              const boxBg = isDown
                ? 'var(--bg-glass)'
                : hasOnu ? 'rgba(34, 211, 160, 0.12)' : 'var(--bg-surface)';
              const boxBorder = isDown
                ? 'var(--border-color)'
                : hasOnu ? 'var(--color-success)' : 'var(--border-color)';
              const dotColor = isDown
                ? 'var(--text-3)'
                : hasOnu ? 'var(--color-success)' : 'var(--text-3)';
              const glow = hasOnu && !isDown
                ? `0 0 6px 2px rgba(34,211,160,0.4)`
                : 'none';
              const losCount = port.losCount ?? 0;
              const dgCount = port.dyingGaspCount ?? 0;
              const uncfgCount = port.unregisteredCount ?? 0;
              return (
                <div key={port.port} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  <button
                    onClick={() => onSelectPort(port, slot)}
                    title={ponPortTooltip(slot, port)}
                    style={{
                      width: 28, height: 28,
                    minWidth: 28, minHeight: 28,
                      background: boxBg,
                      border: `1.5px solid ${boxBorder}`,
                      borderRadius: 5,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', position: 'relative',
                      transition: 'transform 0.1s, filter 0.1s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.15)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}>
                    <div style={{
                      width: 14, height: 14,
                      borderRadius: '50%',
                      background: dotColor,
                      boxShadow: glow,
                    }} />
                    {/* LOS badge — top-left red */}
                    {losCount > 0 && (
                      <span style={{
                        position: 'absolute', top: -5, left: -5,
                        minWidth: 14, height: 14, padding: '0 3px',
                        borderRadius: 7,
                        background: 'var(--color-danger)', border: '1px solid var(--bg-surface)',
                        color: 'var(--text-1)', fontSize: 8, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 2,
                      }}>{losCount}</span>
                    )}
                    {/* DyingGasp badge — top-right purple */}
                    {dgCount > 0 && (
                      <span style={{
                        position: 'absolute', top: -5, right: -5,
                        minWidth: 14, height: 14, padding: '0 3px',
                        borderRadius: 7,
                        background: '#7c3aed', border: '1px solid var(--bg-surface)',
                        color: 'var(--text-1)', fontSize: 8, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 2,
                      }}>{dgCount}</span>
                    )}
                    {/* Unconfigured badge — bottom-right yellow */}
                    {uncfgCount > 0 && (
                      <span style={{
                        position: 'absolute', bottom: -4, right: -4,
                        width: 8, height: 8, borderRadius: '50%',
                        background: 'var(--color-warning)', border: '1px solid var(--color-warning)',
                        zIndex: 2,
                      }} />
                    )}
                  </button>
                  <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'monospace', lineHeight: 1 }}>{port.port}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Slot number */}
      <div className="px-1.5 sm:px-3 text-right" style={{ minWidth: 24 }}>
        <span className="text-[9px] sm:text-xs text-tx3 font-mono">{slot.index}</span>
      </div>
    </div>
  );
}

// ─── Main RackDiagram component ───────────────────────────────────────────────

interface RackDiagramProps {
  oltId: number;
  oltName?: string;
  oltIp?: string;
  isOnline?: boolean;
  lastSync?: string | null;
}

export function RackDiagram({ oltId, oltName, oltIp, isOnline, lastSync }: RackDiagramProps) {
  const [data, setData] = useState<ChassisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChassis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/olt/${oltId}/chassis`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        setError(json.message || 'Failed to load chassis');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [oltId]);

  useEffect(() => { fetchChassis(); }, [fetchChassis]);

  // Build per-port stats for "Detail Per Port PON" section
  const portStats: Record<string, ChassisPort> = {};
  if (data) {
    for (const slot of data.chassis) {
      if (slot.type === 'service') {
        for (const port of slot.ports) {
          if (port.port === 0) continue;
          portStats[`${slot.index}/${port.port}`] = port;
        }
      }
    }
  }

  // Build diagram slots dynamically — works for both C320 and C300
  // Merge standby uplink slots into active uplink slots of same card type
  // Group: service cards as full-width rows, uplink cards side-by-side
  const { serviceSlots, uplinkSlots, mcudSlots } = useMemo(() => {
    if (!data || data.chassis.length === 0) return { serviceSlots: [], uplinkSlots: [], mcudSlots: [] };
    const all = data.chassis;
    const services = all.filter(s => s.type === 'service');
    const uplinks = all.filter(s => s.type === 'uplink');
    const mcuds = all.filter(s => s.type === 'mcud');

    // Merge standby uplink slot ports into active uplink slot of same card type
    // C320: SMXA card has 6 ports named gei_1/3/x + gei_1/4/x — all belong to slot 3 card
    // The standby slot remains visible as an EMPTY placeholder
    const activeUplinks = uplinks.filter(s => (s.cardStatus || '').toUpperCase() === 'INSERVICE');
    const standbyUplinks = uplinks.filter(s => (s.cardStatus || '').toUpperCase() !== 'INSERVICE');
    const merged: ChassisSlot[] = activeUplinks.map(s => ({ ...s }));
    for (const standby of standbyUplinks) {
      // Find an active uplink with the same card type to merge ports into
      const target = standby.cardType ? merged.find(s => s.cardType === standby.cardType) : undefined;
      if (target) {
        target.ports = [...target.ports, ...standby.ports].sort((a, b) => a.port - b.port);
        target.portCount = target.ports.length;
        // Keep the standby slot visible as EMPTY
        merged.push({ ...standby, present: false, cardType: '', cardStatus: '', ports: [], portCount: 0 });
      } else {
        // No matching active card — add as standalone (may be empty placeholder)
        merged.push({ ...standby });
      }
    }
    merged.sort((a, b) => a.index - b.index);

    return { serviceSlots: services, uplinkSlots: merged, mcudSlots: mcuds };
  }, [data]);

  // All slots for the port stats section
  const diagramSlots: ChassisSlot[] = useMemo(() => {
    return [...serviceSlots, ...uplinkSlots, ...mcudSlots];
  }, [serviceSlots, uplinkSlots, mcudSlots]);

  const fans = data?.fans ?? [];
  const fanSummary = data?.fanSummary ?? (isOnline ? '2/2' : '0/2');
  const [selected, setSelected] = useState<SelectedPort>(null);
  const handleSelectPort = (port: ChassisPort, slot: ChassisSlot) => {
    const type = slot.type === 'uplink' ? 'uplink' : 'pon';
    setSelected({ type, port, slot });
  };
  const handleClose = () => setSelected(null);

  const LEGEND = [
    { bg: 'rgba(34, 211, 160, 0.12)', border: 'var(--color-success)', dot: 'var(--color-success)', label: 'Online' },
    { bg: 'var(--bg-glass)', border: 'var(--border-hover)', dot: 'var(--text-3)', label: 'Disabled' },
    { bg: 'rgba(251, 176, 64, 0.12)', border: 'var(--color-warning)', dot: 'var(--color-warning)', label: 'Admin UP / Port DOWN' },
    { bg: 'var(--color-danger)', border: 'var(--bg-surface)', dot: 'var(--text-1)', label: 'LOS', isBadge: true },
    { bg: '#7c3aed', border: 'var(--bg-surface)', dot: 'var(--text-1)', label: 'DyingGasp', isBadge: true },
    { bg: 'rgba(251, 176, 64, 0.15)', border: 'var(--color-warning)', dot: 'var(--color-warning)', label: 'Unconfigured' },
  ];

  return (
    <div className="space-y-4">
      {/* Port detail modals */}
      {selected?.type === 'pon' && (
        <PonPortPanel oltId={oltId} port={selected.port} slot={selected.slot}
          onClose={handleClose} onRefresh={fetchChassis} />
      )}
      {selected?.type === 'uplink' && (
        <UplinkPanel oltId={oltId} port={selected.port} slot={selected.slot}
          onClose={handleClose} onRefresh={fetchChassis} />
      )}

      {/* Rack panel */}
      <div className="rounded-xl overflow-hidden shadow-xl border"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b"
          style={{ borderColor: 'var(--border-color)' }}>
          <div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-success" />
              <span className="font-semibold text-xs sm:text-sm text-tx1">ZTE — Port Map</span>
              {oltName && <span className="text-[10px] sm:text-xs text-tx2 ml-1 truncate">— {oltName}</span>}
            </div>
            <div className="text-[10px] sm:text-[11px] text-tx3 mt-0.5">
              Sinkron: {lastSync ? new Date(lastSync).toLocaleTimeString('id-ID') : '—'}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 mt-1.5 sm:mt-0">
            {oltIp && <span className="text-[10px] sm:text-xs text-tx3 font-mono">{oltIp}</span>}
            <button onClick={fetchChassis} disabled={loading}
              className="inline-flex items-center justify-center gap-1 p-1.5 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs rounded-lg border text-tx2 hover:bg-glass-hover disabled:opacity-50"
              style={{ borderColor: 'var(--border-hover)' }}>
              <RefreshCw className={cn('w-3.5 h-3.5 sm:w-3 sm:h-3', loading && 'animate-spin')} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Body */}
        {loading && !data ? (
          <div className="flex items-center justify-center py-16 text-tx3 text-sm">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Memuat chassis...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-danger text-sm">{error}</div>
        ) : diagramSlots.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-tx3 text-sm">
            Belum ada data kartu — lakukan Sync OLT terlebih dahulu
          </div>
        ) : (
          <div className="p-2 sm:p-3 md:p-4 flex gap-2 sm:gap-3 overflow-x-auto">
            {/* FAN column — hidden on mobile to save horizontal space */}
            <div className="hidden sm:block">
              <FanColumn fans={fans} summary={fanSummary} isOnline={isOnline} />
            </div>
            {/* Slot rows — dynamic layout for any ZTE model */}
            <div className="flex-1 flex flex-col gap-1 sm:gap-1.5" style={{ minWidth: 260 }}>
              {/* Service (GPON) cards — full width rows */}
              {serviceSlots.map(slot => (
                <SlotRow key={slot.index} slot={slot} onSelectPort={handleSelectPort} />
              ))}
              {/* MCUD/PRWH cards — full width rows */}
              {mcudSlots.map(slot => (
                <SlotRow key={slot.index} slot={slot} onSelectPort={handleSelectPort} />
              ))}
              {/* Uplink cards — stacked on mobile, side by side on sm+ */}
              {uplinkSlots.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-1 sm:gap-1.5">
                  {uplinkSlots.map(slot => (
                    <div key={slot.index} className="flex-1 min-w-0">
                      <SlotRow slot={slot} onSelectPort={handleSelectPort} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-2 sm:py-2.5 flex-wrap border-t" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-glass)' }}>
          {LEGEND.map(item => (
            <div key={item.label} className="flex items-center gap-1 sm:gap-1.5">
              {item.isBadge ? (
                <span className="flex items-center justify-center text-tx1 font-bold"
                  style={{ minWidth: 14, height: 14, padding: '0 3px', borderRadius: 7, background: item.bg, border: '1px solid var(--bg-surface)', fontSize: 8 }}>
                  N
                </span>
              ) : (
                <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-sm border flex items-center justify-center"
                  style={{ background: item.bg, borderColor: item.border }}>
                  <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full" style={{ background: item.dot }} />
                </div>
              )}
              <span className="text-[8px] sm:text-[9px] text-tx2">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Detail Per Port PON */}
      {Object.keys(portStats).length > 0 && (
        <div className="glass-card p-3 md:p-4">
          <h3 className="text-xs md:text-sm font-semibold mb-2 md:mb-3">Detail Per Port PON</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5 md:gap-2">
            {Object.entries(portStats)
              .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
              .map(([key, port]) => {
                const total = port.onuCount;
                const online = port.onlineCount;
                const pct = total > 0 ? (online / total) * 100 : 0;
                const isEmpty = total === 0;
                return (
                  <div key={key} className={cn('border rounded-lg p-2.5', isEmpty ? 'border-brd opacity-60' : 'border-brd')}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs font-semibold text-tx2">PON {key}</span>
                      {isEmpty ? (
                        <span className="text-[10px] text-tx3">—</span>
                      ) : (
                        <span className={cn('text-[10px] font-bold',
                          pct === 100 ? 'text-success' : pct === 0 ? 'text-danger' : 'text-warning')}>
                          {online}/{total}
                        </span>
                      )}
                    </div>
                    {isEmpty ? (
                      <div className="text-[9px] text-tx3 text-center py-1">No ONU</div>
                    ) : (
                      <>
                        <div className="w-full bg-glass rounded-full h-1.5 mb-1 overflow-hidden">
                          <div className={cn('h-1.5 rounded-full transition-all',
                            pct === 100 ? 'bg-success' : pct === 0 ? 'bg-danger' : 'bg-warning')}
                            style={{ width: `${Math.max(pct, 4)}%` }} />
                        </div>
                        <div className="flex justify-between text-[9px] text-tx3 gap-1">
                          <span>
                            {total} ONU
                            {(port.losCount ?? 0) > 0 && ` · ${port.losCount} LOS`}
                            {(port.dyingGaspCount ?? 0) > 0 && ` · ${port.dyingGaspCount} DG`}
                          </span>
                          {port.avgRxPower != null && <span>{port.avgRxPower} dBm</span>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
