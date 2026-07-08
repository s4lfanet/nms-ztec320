/**
 * ZTE Rack Diagram — for ZTE C300, C300 Mini (non-C320 models).
 * C320 uses the existing RackDiagram component (chassis endpoint).
 * Consumes normalized RackData from /api/olt/:id/rack.
 *
 * C300 chassis layout:
 *   - Slots 0/1 = PRWH (power/controller) stacked on left
 *   - Slots 2-18 = PON/service cards in middle
 *   - Slots 19/20 = HUVQ (uplink) stacked on right
 *   - Fan row on top
 */

import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Cpu, LockKeyhole, Shield, ArrowDownUp, ChevronsLeftRightEllipsis,
  X, Activity, Pause, Play, Wifi, WifiOff,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useRackData } from '../../hooks/useRackData';
import { useRackMetrics } from '../../hooks/useRackMetrics';
import type { RackDiagramProps, SlotCard, CardPort } from '../../types/rack';

const FAN_SPEED_LABELS: Record<number, string> = { 0: 'Stopped', 1: 'Low', 2: 'Normal', 3: 'High' };

function formatCardType(ct: string): string {
  if (!ct || ct.includes('No Such') || ct.includes('No more') || ct === 'EMPTY') return 'EMPTY';
  return ct.length > 10 ? ct.substring(0, 10) : ct;
}

type SelectedPort = { slot: SlotCard; port: CardPort } | null;

function PortToggleButton({ oltId, port, onClose, onRefresh }: {
  oltId: string; port: CardPort; onClose: () => void; onRefresh: () => void;
}) {
  const [toggling, setToggling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const isUplink = port.isUplink;
  const isUp = port.adminUp !== false;
  const toggleId = isUplink ? port.uplinkId : port.portId;

  const doToggle = async () => {
    if (!toggleId) return;
    setToggling(true); setMsg(null);
    try {
      const action = isUp ? 'disable' : 'enable';
      const url = isUplink
        ? `/api/olt/${oltId}/uplink/${toggleId}/toggle`
        : `/api/olt/${oltId}/pon-port/${toggleId}/toggle`;
      const r = await fetch(url, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const j = await r.json();
      setMsg(j.success ? `✓ Port ${action}d` : `Error: ${j.message}`);
      if (j.success) { setTimeout(() => { onClose(); onRefresh(); }, 800); }
    } catch { setMsg('Network error'); }
    finally { setToggling(false); }
  };

  return (
    <>
      <button onClick={doToggle} disabled={toggling}
        className={cn('w-full py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50',
          isUp ? 'bg-red-950/60 border border-red-800 hover:bg-red-900/60 text-red-400'
               : 'bg-green-950/60 border border-green-800 hover:bg-green-900/60 text-green-400')}>
        {isUplink ? (isUp ? <WifiOff size={13} /> : <Wifi size={13} />)
                  : (isUp ? <Pause size={13} /> : <Play size={13} />)}
        {toggling ? 'Processing...' : isUp ? 'Disable Port' : 'Enable Port'}
      </button>
      {msg && (
        <div className={cn('text-xs p-2 rounded', msg.startsWith('✓') ? 'bg-green-950/40 text-green-400 border border-green-900' : 'bg-red-950/40 text-red-400 border border-red-900')}>
          {msg}
        </div>
      )}
    </>
  );
}

export default function ZteRackDiagram({ oltId, onPortClick, onMetrics }: RackDiagramProps) {
  const { data, loading, refreshing, error, reload, refresh } = useRackData(oltId);
  const metrics = useRackMetrics(data);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [hoveredPort, setHoveredPort] = useState<{ slot: number; port: number } | null>(null);
  const [, setHoveredFan] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const [selectedPort, setSelectedPort] = useState<SelectedPort>(null);

  const showTip = useCallback((e: React.MouseEvent, content: React.ReactNode) => {
    setTooltip({ x: e.clientX, y: e.clientY, content });
  }, []);
  const hideTip = useCallback(() => setTooltip(null), []);

  React.useEffect(() => {
    if (metrics && onMetrics) onMetrics(metrics);
  }, [metrics, onMetrics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-tx3 text-sm gap-2">
        <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        Memuat data rack...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-600 dark:text-red-400">
        Gagal memuat: {error}
        <button onClick={() => reload()} className="ml-3 underline">Coba lagi</button>
      </div>
    );
  }

  if (!data || !data.supported) {
    return (
      <div className="rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 p-4 text-sm text-yellow-700 dark:text-yellow-400">
        Rack diagram belum tersedia untuk OLT ini ({data?.brand}).
      </div>
    );
  }

  const slots = data.slots;
  const modelUpper = (data.model ?? 'C300').toUpperCase();
  const isMini = modelUpper.includes('MINI');

  const getSlot = (idx: number) => slots.find(s => s.slotIndex === idx);

  // ── Port block ────────────────────────────────────────────────────────────────

  const renderPort = (slot: SlotCard, port: CardPort) => {
    const isHovered = hoveredPort?.slot === slot.slotIndex && hoveredPort?.port === port.portIndex;
    const isDisabled = port.adminUp === false;
    const isOnline = port.adminUp !== false && port.operUp === true;
    const isOperDown = port.adminUp !== false && port.operUp !== true;
    const isCardStatus = port.source === 'card-status';
    const cardTypeUpper = (slot.cardType ?? '').toUpperCase();
    const isPonPort = !port.isUplink;
    const isControlPort = cardTypeUpper.includes('SCXN') || cardTypeUpper.includes('SCUN');
    const isUplinkPort = cardTypeUpper.includes('HUVQ');

    let portBg = 'bg-gray-400';
    let portIcon: React.ReactNode = null;
    if (isCardStatus && isControlPort) {
      portBg = slot.cardStatus === 'inservice' ? 'bg-blue-500' : 'bg-gray-400';
      portIcon = slot.cardStatus === 'inservice' ? <Cpu className="w-3 h-3 text-white" /> : <LockKeyhole className="w-3 h-3 text-gray-700" />;
    } else if (isCardStatus && isUplinkPort) {
      portBg = slot.cardStatus === 'inservice' ? 'bg-blue-500' : 'bg-gray-400';
      portIcon = slot.cardStatus === 'inservice' ? <Shield className="w-3 h-3 text-white" /> : <LockKeyhole className="w-3 h-3 text-gray-700" />;
    } else if (isCardStatus) {
      portBg = slot.cardStatus === 'inservice' ? 'bg-blue-500' : 'bg-gray-400';
      portIcon = slot.cardStatus === 'inservice' ? <Cpu className="w-3 h-3 text-white" /> : <LockKeyhole className="w-3 h-3 text-gray-700" />;
    } else if (port.adminUp !== false) {
      portBg = port.operUp === true ? 'bg-green-500' : 'bg-yellow-500';
    }

    const sourceLabel = port.source === 'ifmib' ? 'IF-MIB (SNMP)' : port.source === 'onu-data' ? 'Data ONU (DB)' : port.source === 'card-status' ? 'Status Kartu' : 'Unknown';

    const tooltipContent = (
      <div className="text-[10px]">
        {port.description && <div className="font-semibold text-blue-300 mb-1">{port.description}</div>}
        <div className="font-bold text-teal-400 mb-1">Port {slot.slotIndex}/{port.portIndex}</div>
        {isCardStatus ? (
          <>
            <div>Kartu: <span className={slot.cardStatus === 'inservice' ? 'text-green-400' : 'text-red-400'}>{slot.cardStatus?.toUpperCase()}</span></div>
            {slot.cardRole && <div>Role: <span className="text-yellow-400">{slot.cardRole === 'main' ? 'Main (Aktif)' : 'Standby'}</span></div>}
            <div className="text-[9px] text-tx3 mt-1">Port detail tidak tersedia via SNMP</div>
          </>
        ) : (
          <>
            <div>Admin: <span className={port.adminUp !== false ? 'text-green-400' : 'text-red-400'}>{port.adminUp !== false ? 'UP' : 'DOWN'}</span></div>
            <div>Oper: <span className={port.operUp === true ? 'text-green-400' : 'text-red-400'}>{port.operUp === true ? 'UP' : 'DOWN'}</span></div>
          </>
        )}
        <div className="text-[9px] text-tx3 mt-0.5">Sumber: {sourceLabel}</div>
        {isPonPort && (
          <div className="border-t border-gray-700 mt-1 pt-1 space-y-0.5">
            <div>Total ONU: <span className="font-medium">{port.total}</span></div>
            {port.online > 0 && <div className="text-green-400">Online: {port.online}</div>}
            {port.offline > 0 && <div className="text-gray-300">Offline: {port.offline}</div>}
            {port.los > 0 && <div className="text-red-400">LOS: {port.los}</div>}
            {port.dyinggasp > 0 && <div className="text-purple-400">Dying Gasp: {port.dyinggasp}</div>}
            {port.unconfigCount > 0 && <div className="text-orange-400">Unconfig: {port.unconfigCount}</div>}
          </div>
        )}
        {port.sfpTxPower != null && (
          <div className="border-t border-gray-700 mt-1 pt-1 space-y-0.5">
            <div className="font-semibold text-cyan-400 mb-0.5">SFP / OPTICAL</div>
            <div>TX: <span className="text-cyan-300">{port.sfpTxPower.toFixed(3)} dBm</span></div>
            {port.sfpRxPower != null && <div>RX: <span className="text-cyan-300">{port.sfpRxPower.toFixed(3)} dBm</span></div>}
            {port.sfpTemperature != null && <div>Temp: <span className="text-orange-300">{port.sfpTemperature.toFixed(1)} °C</span></div>}
            {port.sfpBiasCurrent != null && <div>Bias: <span className="text-yellow-300">{port.sfpBiasCurrent.toFixed(1)} mA</span></div>}
            {port.sfpVoltage != null && <div>VCC: <span className="text-green-300">{port.sfpVoltage.toFixed(3)} V</span></div>}
            {port.sfpWavelength != null && <div>λ: <span className="text-purple-300">{port.sfpWavelength} nm</span></div>}
            {port.sfpVendor && <div>OEM: <span className="text-gray-300">{port.sfpVendor}</span></div>}
            {port.sfpModel && <div>Model: <span className="text-gray-300">{port.sfpModel}</span></div>}
          </div>
        )}
      </div>
    );

    return (
      <div
        key={`p-${slot.slotIndex}-${port.portIndex}`}
        className={`relative w-4 h-4 border border-brd ${portBg} cursor-pointer transition-all flex items-center justify-center flex-shrink-0 ${isHovered ? 'ring-1 ring-blue-400 z-20' : ''}`}
        onMouseEnter={(e) => { e.stopPropagation(); setHoveredSlot(null); setHoveredPort({ slot: slot.slotIndex, port: port.portIndex }); showTip(e, tooltipContent); }}
        onMouseLeave={() => { setHoveredPort(null); hideTip(); }}
        onClick={(e) => { e.stopPropagation(); if (onPortClick) { onPortClick(slot.slotIndex, port.portIndex); } else { setSelectedPort({ slot, port }); } }}
      >
        {isDisabled && !isCardStatus && <LockKeyhole className="w-2.5 h-2.5 text-gray-700" />}
        {isOnline && !isCardStatus && <ArrowDownUp className="w-2.5 h-2.5 text-white" />}
        {isOperDown && !isCardStatus && <ChevronsLeftRightEllipsis className="w-2.5 h-2.5 text-yellow-900" />}
        {isCardStatus && portIcon}

        {isPonPort && (
          <>
            {port.los > 0 && (
              <div className="absolute -top-1 -left-1 bg-red-600 text-white text-[6px] font-bold rounded-full w-3 h-3 flex items-center justify-center border border-white z-10">
                {port.los}
              </div>
            )}
            {port.dyinggasp > 0 && (
              <div className="absolute -top-1 -right-1 bg-purple-600 text-white text-[6px] font-bold rounded-full w-3 h-3 flex items-center justify-center border border-white z-10">
                {port.dyinggasp}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // ── Slot card content ─────────────────────────────────────────────────────────

  const renderSlotContent = (slot: SlotCard | undefined) => {
    if (!slot || !slot.isPresent) {
      return (
        <div className="w-full h-full bg-glass-hover border-brd flex items-center justify-center">
          <span className="text-tx3 text-[10px] font-medium">
            {slot ? formatCardType(slot.cardType) : 'EMPTY'}
          </span>
        </div>
      );
    }

    const isHovered = hoveredSlot === slot.slotIndex && !hoveredPort;
    const statusBg = slot.operStatus === 'up'
      ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
      : slot.operStatus === 'down'
      ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
      : 'bg-glass border-brd';
    const tempHeaderBg = slot.temperature == null ? 'bg-gray-800'
      : slot.temperature >= 65 ? 'bg-red-700'
      : slot.temperature >= 55 ? 'bg-orange-600'
      : slot.temperature >= 50 ? 'bg-amber-600'
      : 'bg-gray-800';
    const cardTypeUpper = (slot.cardType ?? '').toUpperCase();
    const isControl = cardTypeUpper.startsWith('SCXN') || cardTypeUpper.startsWith('SCUN') || cardTypeUpper.startsWith('SMXA');
    const roleLabel = slot.cardRole === 'main' ? 'MAIN' : slot.cardRole === 'standby' ? 'STB' : isControl ? 'CTRL' : null;

    const slotTooltipContent = (
      <div className="text-xs">
        <div className="font-bold text-teal-400 mb-1">{formatCardType(slot.cardType)} — Slot {slot.slotIndex}</div>
        <div className="text-[10px] space-y-0.5">
          <div>Status: <span className={slot.operStatus === 'up' ? 'text-green-400' : 'text-red-400'}>{slot.operStatus.toUpperCase()}</span></div>
          {slot.cardRole && <div>Role: <span className="text-amber-400">{slot.cardRole.toUpperCase()}</span></div>}
          {slot.cpuUsage != null && <div>CPU: {slot.cpuUsage}%</div>}
          {slot.memoryUsage != null && <div>Memory: {slot.memoryUsage}%</div>}
          {slot.temperature != null && <div>Temp: {slot.temperature}°C</div>}
          {slot.voltageMv != null && <div>Voltage: {(slot.voltageMv / 1000).toFixed(1)} V</div>}
          {slot.currentMa != null && <div>Current: {(slot.currentMa / 1000).toFixed(2)} A</div>}
          <div className="border-t border-gray-700 mt-1 pt-1">Ports: {slot.ports.length}</div>
          {slot.ports.length > 0 && (
            <div>ONUs: {slot.ports.reduce((a, p) => a + p.total, 0)} ({slot.ports.reduce((a, p) => a + p.online, 0)} online)</div>
          )}
        </div>
      </div>
    );

    return (
      <div
        className={`relative w-full h-full ${statusBg} border flex flex-col items-center cursor-pointer overflow-visible ${isHovered ? 'ring-2 ring-blue-500 z-10' : ''}`}
        onMouseEnter={(e) => { if (!hoveredPort) { setHoveredSlot(slot.slotIndex); showTip(e, slotTooltipContent); } }}
        onMouseLeave={() => { setHoveredSlot(null); hideTip(); }}
        onClick={() => { if (!hoveredPort) { if (onPortClick) { onPortClick(slot.slotIndex, 0); } else if (slot.ports.length > 0) { setSelectedPort({ slot, port: slot.ports[0] }); } } }}
      >
        <div className={`${tempHeaderBg} text-white text-[8px] font-bold px-0.5 py-0.5 text-center border-b border-gray-700 w-full flex-shrink-0`}>
          {formatCardType(slot.cardType)}
          {slot.temperature != null && slot.temperature >= 50 && (
            <div className="text-[6px] font-normal leading-tight">{slot.temperature}°C</div>
          )}
        </div>
        {roleLabel && (
          <div className="bg-yellow-400 text-gray-900 text-[7px] text-center py-0.5 font-bold border-b border-gray-700 w-full flex-shrink-0">
            {roleLabel}
          </div>
        )}
        <div className="flex-1 p-0.5 flex flex-col gap-0 items-center justify-start w-full overflow-visible">
          {slot.ports.map(port => renderPort(slot, port))}
        </div>
      </div>
    );
  };

  // ── Fan block ─────────────────────────────────────────────────────────────────

  const renderFanBlock = (fan: { index: number; status: string; rpm: number | null; speedLevel: number | null }) => {
    const fanTooltipContent = (
      <div className="text-[10px]">
        <div className="font-bold text-teal-400">FAN {fan.index}</div>
        <div>Status: <span className={fan.status === 'active' ? 'text-green-400' : 'text-red-400'}>{fan.status.toUpperCase()}</span></div>
        {fan.rpm != null && <div>RPM: {fan.rpm}</div>}
        {fan.speedLevel != null && <div>Speed: {FAN_SPEED_LABELS[fan.speedLevel] ?? `Level ${fan.speedLevel}`}</div>}
      </div>
    );
    return (
      <div
        key={`fan-${fan.index}`}
        className="relative bg-glass border-brd px-1 py-0.5 text-center cursor-pointer hover:ring-1 hover:ring-blue-400 transition-all flex-1"
        onMouseEnter={(e) => { setHoveredFan(fan.index); showTip(e, fanTooltipContent); }}
        onMouseLeave={() => { setHoveredFan(null); hideTip(); }}
      >
        <span className="text-[8px] font-medium text-tx2">F{fan.index}</span>
        <div className={`absolute top-0.5 right-0.5 w-2 h-2 rounded-full border ${
          fan.status === 'active' ? 'bg-green-500 border-green-600' :
          fan.status === 'inactive' ? 'bg-red-500 border-red-600' :
          'bg-gray-400 border-gray-500'
        }`} />
      </div>
    );
  };

  // ── C300 Layout (20 slots) ────────────────────────────────────────────────────
  // Slot 0/1 = PRWH stacked on left
  // Slot 2-18 = PON cards horizontal in middle
  // Slot 19/20 = HUVQ stacked on right

  const renderC300 = () => {
    const leftSlots = [getSlot(0), getSlot(1)];
    const rightSlots = [getSlot(19), getSlot(20)];
    // Always render all middle slots 2-18, even if empty, to match real C300 chassis
    const midSlots: (SlotCard | undefined)[] = Array.from({ length: 17 }, (_, i) => getSlot(i + 2));

    return (
      <div className="flex gap-0 items-stretch">
        {/* Left: stacked 0/1 */}
        <div className="flex flex-col items-center flex-shrink-0" style={{ width: 40 }}>
          <div className="flex flex-col gap-0 w-full" style={{ height: 360 }}>
            <div className="flex-1">{renderSlotContent(leftSlots[0])}</div>
            <div className="flex-1">{renderSlotContent(leftSlots[1])}</div>
          </div>
          <div className="text-[10px] text-tx2 mt-1 font-medium">0/1</div>
        </div>

        {/* Middle: slots 2-18 (always render, including empty) */}
        {midSlots.map((slot, idx) => (
          <div
            key={idx + 2}
            className="flex flex-col items-center flex-shrink-0"
            style={{ width: 40 }}
          >
            <div style={{ height: 360 }} className="w-full">{renderSlotContent(slot)}</div>
            <div className="text-[10px] text-tx2 mt-1 font-medium">{idx + 2}</div>
          </div>
        ))}

        {/* Right: stacked 19/20 */}
        <div className="flex flex-col items-center flex-shrink-0" style={{ width: 40 }}>
          <div className="flex flex-col gap-0 w-full" style={{ height: 360 }}>
            <div className="flex-1">{renderSlotContent(rightSlots[0])}</div>
            <div className="flex-1">{renderSlotContent(rightSlots[1])}</div>
          </div>
          <div className="text-[10px] text-tx2 mt-1 font-medium">19/20</div>
        </div>
      </div>
    );
  };

  // ── C300-MINI Layout (slots 2, 3, 10, 19) ────────────────────────────────────

  const renderC300Mini = () => {
    const miniSlots = slots.filter(s => [2, 3, 10, 19].includes(s.slotIndex));
    return (
      <div className="flex gap-0.5 items-stretch">
        {miniSlots.map((slot) => (
          <div key={slot.slotIndex} className="flex flex-col items-center" style={{ minWidth: 44, flex: 1 }}>
            <div style={{ height: 300 }}>{renderSlotContent(slot)}</div>
            <div className="text-[10px] text-tx2 mt-1 font-medium">{slot.slotIndex}</div>
          </div>
        ))}
      </div>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────────

  // ── Port detail panel ────────────────────────────────────────────────────────

  const renderPortPanel = () => {
    if (!selectedPort) return null;
    const { slot, port } = selectedPort;
    const isPon = !port.isUplink;
    const isDisabled = port.adminUp === false;
    const isOnline = port.adminUp !== false && port.operUp === true;
    const isCardStatus = port.source === 'card-status';

    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedPort(null)}>
        <div className="w-[calc(100vw-2rem)] max-w-sm mx-4 rounded-xl border shadow-2xl overflow-y-auto max-h-[90vh]"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-hover)' }}
          onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <div>
              <div className="text-sm font-bold text-tx1 font-mono">
                {isPon ? `PON ${slot.slotIndex}/${port.portIndex}` : `Uplink ${slot.slotIndex}/${port.portIndex}`}
              </div>
              <div className="text-[10px] text-blue-400">{slot.cardType} — Slot {slot.slotIndex}</div>
            </div>
            <button onClick={() => setSelectedPort(null)} className="text-tx3 hover:text-tx1"><X size={16} /></button>
          </div>
          <div className="p-4 space-y-3">
            {/* Status */}
            <div className="flex items-center gap-3 p-3 rounded-lg" style={{
              background: isDisabled ? 'var(--bg-glass)' : isOnline ? '#052e16' : '#451a03',
              border: `1px solid ${isDisabled ? 'var(--border-color)' : isOnline ? '#16a34a' : '#f59e0b'}`
            }}>
              <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0',
                isDisabled ? 'bg-gray-500' : isOnline ? 'bg-green-400 animate-pulse' : 'bg-amber-400')} />
              <div>
                <div className={cn('text-sm font-bold',
                  isDisabled ? 'text-tx2' : isOnline ? 'text-green-400' : 'text-amber-400')}>
                  {isDisabled ? 'Disabled' : isOnline ? 'Online' : 'Admin UP / Oper DOWN'}
                </div>
                {isCardStatus && <div className="text-[10px] text-tx3">Card status: {slot.cardStatus?.toUpperCase()}</div>}
                {!isCardStatus && <div className="text-[10px] text-tx3">
                  Admin: {port.adminUp === false ? 'DOWN' : 'UP'} · Oper: {port.operUp === true ? 'UP' : 'DOWN'}
                </div>}
              </div>
            </div>

            {/* PON ONU Stats */}
            {isPon && !isCardStatus && (
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  ['Total', port.total, 'text-tx1'],
                  ['Online', port.online, 'text-green-400'],
                  ['Offline', port.offline, port.offline > 0 ? 'text-red-400' : 'text-tx3'],
                  ['LOS', port.los, port.los > 0 ? 'text-red-400' : 'text-tx3'],
                ].map(([label, val, cls]) => (
                  <div key={String(label)} className="p-2 rounded" style={{ background: 'var(--bg-glass)' }}>
                    <div className={cn('text-lg font-bold', String(cls))}>{String(val)}</div>
                    <div className="text-[9px] text-tx3">{String(label)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* PON progress bar */}
            {isPon && port.total > 0 && (
              <div>
                <div className="flex justify-between text-[10px] text-tx3 mb-1">
                  <span>ONU Online</span>
                  <span>{port.online}/{port.total} ({Math.round(port.online / port.total * 100)}%)</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-color)' }}>
                  <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.round(port.online / port.total * 100)}%` }} />
                </div>
              </div>
            )}

            {/* Additional ONU stats */}
            {isPon && (port.dyinggasp > 0 || port.unconfigCount > 0) && (
              <div className="flex gap-2 text-[10px]">
                {port.dyinggasp > 0 && <span className="text-purple-400">Dying Gasp: {port.dyinggasp}</span>}
                {port.unconfigCount > 0 && <span className="text-orange-400">Unconfig: {port.unconfigCount}</span>}
              </div>
            )}

            {/* SFP / Optical */}
            {port.sfpTxPower != null && (
              <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-hover)' }}>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-400">
                  <Activity size={12} /> Optical Module
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
                  {port.sfpVendor && (<><span className="text-tx3">Vendor</span><span className="text-tx1 font-mono text-right">{port.sfpVendor}</span></>)}
                  {port.sfpModel && (<><span className="text-tx3">Model</span><span className="text-tx1 font-mono text-right">{port.sfpModel}</span></>)}
                  {port.sfpWavelength != null && (<><span className="text-tx3">Wavelength</span><span className="text-tx1 font-mono text-right">{port.sfpWavelength} nm</span></>)}
                  {port.sfpTxPower != null && (<><span className="text-tx3">TX Power</span><span className="text-green-400 font-mono text-right">{port.sfpTxPower.toFixed(3)} dBm</span></>)}
                  {port.sfpRxPower != null && (<><span className="text-tx3">RX Power</span><span className="text-green-400 font-mono text-right">{port.sfpRxPower.toFixed(3)} dBm</span></>)}
                  {port.sfpTemperature != null && (<><span className="text-tx3">Temperature</span><span className="text-amber-400 font-mono text-right">{port.sfpTemperature.toFixed(1)} °C</span></>)}
                  {port.sfpBiasCurrent != null && (<><span className="text-tx3">Bias Current</span><span className="text-tx1 font-mono text-right">{port.sfpBiasCurrent.toFixed(1)} mA</span></>)}
                  {port.sfpVoltage != null && (<><span className="text-tx3">Voltage</span><span className="text-tx1 font-mono text-right">{port.sfpVoltage.toFixed(3)} V</span></>)}
                </div>
              </div>
            )}

            {/* Card info (for card-status ports) */}
            {isCardStatus && (
              <div className="p-3 rounded-lg space-y-1.5 text-[10px]" style={{ background: 'var(--bg-glass)' }}>
                <div className="text-tx2 font-semibold mb-1">Card Info</div>
                <div className="flex justify-between"><span className="text-tx3">Card Type</span><span className="text-tx1 font-mono">{slot.cardType}</span></div>
                <div className="flex justify-between"><span className="text-tx3">Status</span><span className={slot.cardStatus === 'inservice' ? 'text-green-400' : 'text-red-400'}>{slot.cardStatus?.toUpperCase()}</span></div>
                {slot.cardRole && <div className="flex justify-between"><span className="text-tx3">Role</span><span className="text-amber-400">{slot.cardRole.toUpperCase()}</span></div>}
                {slot.cpuUsage != null && <div className="flex justify-between"><span className="text-tx3">CPU</span><span className="text-tx1">{slot.cpuUsage}%</span></div>}
                {slot.memoryUsage != null && <div className="flex justify-between"><span className="text-tx3">Memory</span><span className="text-tx1">{slot.memoryUsage}%</span></div>}
                {slot.temperature != null && <div className="flex justify-between"><span className="text-tx3">Temp</span><span className="text-amber-400">{slot.temperature}°C</span></div>}
                <div className="text-[9px] text-tx3 mt-1">Port detail not available via SNMP — showing card-level info</div>
              </div>
            )}

            {/* Traffic (uplink) */}
            {!isPon && (port.inOctets != null || port.outOctets != null) && (
              <div className="p-3 rounded-lg space-y-1.5" style={{ background: 'var(--bg-glass)' }}>
                <div className="text-[10px] text-tx2 flex items-center gap-1"><Activity size={10} /> Traffic</div>
                {port.inOctets != null && <div className="flex justify-between text-[11px]"><span className="text-tx3">↓ In</span><span className="text-green-400 font-mono">{(port.inOctets / 1e6).toFixed(2)} MB</span></div>}
                {port.outOctets != null && <div className="flex justify-between text-[11px]"><span className="text-tx3">↑ Out</span><span className="text-blue-400 font-mono">{(port.outOctets / 1e6).toFixed(2)} MB</span></div>}
              </div>
            )}

            {/* Toggle button */}
            {!isCardStatus && (port.portId || port.uplinkId) && (
              <PortToggleButton oltId={oltId} port={port} onClose={() => setSelectedPort(null)} onRefresh={refresh} />
            )}

            {/* Source */}
            <div className="text-[9px] text-tx3 text-center">
              Source: {port.source === 'ifmib' ? 'IF-MIB (SNMP)' : port.source === 'onu-data' ? 'ONU Data (DB)' : port.source === 'card-status' ? 'Card Status' : 'Unknown'}
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  };

  return (
    <div className="w-full select-none">
      {/* Port detail panel */}
      {renderPortPanel()}

      {/* Portal tooltip */}
      {typeof window !== 'undefined' && tooltip && createPortal(
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 12,
            top: tooltip.y - 8,
            transform: 'translateY(-100%)',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
          className="bg-surface p-2 rounded shadow-xl whitespace-nowrap border-brd"
        >
          {tooltip.content}
        </div>,
        document.body,
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-xs sm:text-sm font-semibold text-tx1 truncate">
          Rack Diagram — ZTE {data.model ?? ''}
        </h3>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 transition-colors flex-shrink-0"
        >
          {refreshing ? '...' : 'Refresh'}
        </button>
      </div>

      {/* Rack container */}
      <div className="bg-surface p-2 sm:p-3 rounded border-brd w-full overflow-x-auto">
        <div className={isMini ? 'min-w-[320px]' : 'min-w-[480px]'}>
          {/* FAN row */}
          {data.fans.length > 0 && (
            <div className="mb-2">
              <div className="text-[9px] font-semibold text-tx3 mb-0.5">FAN</div>
              <div className="flex gap-0 w-full">
                {data.fans.map(fan => renderFanBlock(fan))}
              </div>
            </div>
          )}

          {/* Rack slots */}
          {isMini ? renderC300Mini() : renderC300()}
        </div>
      </div>

      {/* Summary bar */}
      {metrics && (
        <div className="mt-2 flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-1 text-[10px] text-tx3">
          <span>Cards: <span className="text-tx1">{metrics.activeCards}</span></span>
          <span>Fans: <span className={metrics.fansActive === metrics.fansTotal ? 'text-green-400' : 'text-red-400'}>{metrics.fansActive}/{metrics.fansTotal}</span></span>
          {metrics.losTotal > 0 && <span className="text-red-400 font-semibold">LOS: {metrics.losTotal}</span>}
          {metrics.supplyCurrentMa != null && <span>PWR: {(metrics.supplyCurrentMa / 1000).toFixed(1)}A</span>}
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-2 sm:gap-4 text-[10px] text-tx3">
        {[
          { color: 'bg-green-500', Icon: ArrowDownUp, label: 'Online' },
          { color: 'bg-gray-400', Icon: LockKeyhole, label: 'Disabled' },
          { color: 'bg-yellow-500', Icon: ChevronsLeftRightEllipsis, label: 'Admin UP / Port DOWN' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <div className={`w-4 h-4 ${l.color} border-brd rounded-sm flex items-center justify-center`}>
              <l.Icon className="w-2.5 h-2.5 text-white" />
            </div>
            <span>{l.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <div className="w-3.5 h-3.5 bg-red-600 rounded-full flex items-center justify-center border border-white">
            <span className="text-[6px] text-white font-bold">!</span>
          </div>
          <span>LOS</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3.5 h-3.5 bg-purple-600 rounded-full flex items-center justify-center border border-white">
            <span className="text-[6px] text-white font-bold">⚡</span>
          </div>
          <span>Dying Gasp</span>
        </div>
      </div>
    </div>
  );
}
