'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LockKeyhole, ArrowDownUp, ChevronsLeftRightEllipsis } from 'lucide-react';
import { api } from '@/lib/api';
import type { RackMetrics } from './ZteRackDiagram';

// ── Types ──────────────────────────────────────────────────────────────────────

interface CardPort {
  portIndex: number;
  adminStatus: 'up' | 'down' | 'testing';
  operStatus: 'up' | 'down' | 'testing';
  description?: string;
  onuCount: number;
  onlineOnu: number;
  offlineOnu: number;
  losOnu: number;
  dyingGaspOnu: number;
  unconfigOnu: number;
  sfpTxPower:     number | null;
  sfpBiasCurrent: number | null;
  sfpVoltage:     number | null;
  sfpTemperature: number | null;
}

interface SlotCard {
  slotIndex: number;
  cardType: string;
  isPresent: boolean;
  cardStatus: 'inservice' | 'fault' | 'empty';
  operStatus: 'up' | 'down' | 'testing';
  cpuUsage: number | null;
  memoryUsage: number | null;
  temperature: number | null;
  ports: CardPort[];
}

interface RackData {
  brand: string;
  model: string | null;
  supported: boolean;
  chassisTemp: number | null;
  uptime: string | null;
  slots: SlotCard[];
  fans: Array<{ index: number; status: string }>;
  psus: Array<unknown>;
}

interface Props {
  oltId: string;
  onPortClick?: (slot: number, port: number) => void;
  onMetrics?: (m: Partial<RackMetrics>) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCardType(ct: string): string {
  if (!ct || ct.includes('No Such') || ct.includes('No more') || ct === 'EMPTY') return 'EMPTY';
  return ct.length > 8 ? ct.substring(0, 8) : ct;
}

/** Map raw backend slot → normalized SlotCard */
function mapSlot(raw: any): SlotCard {
  const cardStatus = raw.cardStatus ?? 'empty';
  const operStatus = cardStatus === 'inservice' ? 'up' : cardStatus === 'fault' ? 'down' : 'testing';
  return {
    slotIndex: raw.slotIndex,
    cardType: raw.cardType ?? 'EMPTY',
    isPresent: raw.isPresent ?? false,
    cardStatus,
    operStatus,
    cpuUsage: raw.cpuUsage ?? null,
    memoryUsage: raw.memUsage ?? null,
    temperature: raw.temperature ?? null,
    ports: (raw.ports ?? []).map((p: any): CardPort => ({
      portIndex: p.portIndex,
      adminStatus: p.adminUp === false ? 'down' : p.adminUp === true ? 'up' : 'testing',
      operStatus: p.operUp === false ? 'down' : p.operUp === true ? 'up' : 'testing',
      description: p.description ?? undefined,
      onuCount: p.total ?? 0,
      onlineOnu: p.online ?? 0,
      offlineOnu: p.offline ?? 0,
      losOnu: p.los ?? 0,
      dyingGaspOnu: p.dyinggasp ?? 0,
      unconfigOnu: p.unconfigCount ?? 0,
      sfpTxPower:     p.sfpTxPower     ?? null,
      sfpBiasCurrent: p.sfpBiasCurrent ?? null,
      sfpVoltage:     p.sfpVoltage     ?? null,
      sfpTemperature: p.sfpTemperature ?? null,
    })),
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ZteC300MiniRackDiagram({ oltId, onPortClick, onMetrics }: Props) {
  const [slots, setSlots]       = useState<SlotCard[]>([]);
  const [meta, setMeta]         = useState<{ uptime: string | null; chassisTemp: number | null; avgCpu: number | null; avgMem: number | null; activeCards: number; psuStatus: 'normal' | 'fault' | 'unknown' }>({
    uptime: null, chassisTemp: null, avgCpu: null, avgMem: null, activeCards: 0, psuStatus: 'unknown',
  });
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [hoveredPort, setHoveredPort] = useState<{ slot: number; port: number } | null>(null);
  const [fixedTooltip, setFixedTooltip] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);

  const showTip = (e: React.MouseEvent, content: React.ReactNode) => {
    setFixedTooltip({ x: e.clientX, y: e.clientY, content });
  };
  const hideTip = () => setFixedTooltip(null);

  const loadData = async (forceRefresh = false) => {
    try {
      setError(null);
      const url = forceRefresh ? `/api/olt/${oltId}/rack?refresh=true` : `/api/olt/${oltId}/rack`;
      const result = await api.get<any>(url);
      const mappedSlots = (result.slots ?? []).map(mapSlot);
      setSlots(mappedSlots);

      const active = mappedSlots.filter((s: SlotCard) => s.isPresent && s.cardStatus === 'inservice');
      const cpuList = active.map((s: SlotCard) => s.cpuUsage).filter((v: number | null): v is number => v != null);
      const memList = active.map((s: SlotCard) => s.memoryUsage).filter((v: number | null): v is number => v != null);
      const avgCpu = cpuList.length ? Math.round(cpuList.reduce((a: number, b: number) => a + b) / cpuList.length) : null;
      const avgMem = memList.length ? Math.round(memList.reduce((a: number, b: number) => a + b) / memList.length) : null;

      const psu = (result.psus ?? [])[0];
      setMeta({ uptime: result.uptime ?? null, chassisTemp: result.chassisTemp ?? null, avgCpu, avgMem, activeCards: active.length, psuStatus: psu?.status ?? 'unknown' });

      if (onMetrics) {
        const losTotal = mappedSlots.flatMap((s: SlotCard) => s.ports).reduce((sum: number, p: CardPort) => sum + p.losOnu, 0);
        const portDescriptions: Record<string, string> = {};
        for (const slot of mappedSlots) {
          for (const port of slot.ports) {
            if (port.description) portDescriptions[`${slot.slotIndex}/${port.portIndex}`] = port.description;
          }
        }
        const allPortKeys = mappedSlots.flatMap((s: SlotCard) =>
          s.ports.map((p: CardPort) => `${s.slotIndex}/${p.portIndex}`));
        onMetrics({ uptime: result.uptime ?? null, activeCards: active.length, fansActive: 0, fansTotal: 0, losTotal, supplyCurrentMa: null, supplyVoltageMv: null, psuStatus: psu?.status ?? 'unknown', portDescriptions, allPortKeys });
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [oltId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  };

  const getSlot = (index: number) => slots.find(s => s.slotIndex === index);

  // ── Port renderer ────────────────────────────────────────────────────────────

  const renderPort = (slot: SlotCard, port: CardPort) => {
    const isDisabled = port.adminStatus === 'down';
    const isOnline   = port.adminStatus === 'up' && port.operStatus === 'up';
    const isOffline  = port.adminStatus === 'up' && port.operStatus !== 'up';

    let portBg = 'bg-gray-400';
    if (port.adminStatus === 'up') {
      portBg = port.operStatus === 'up' ? 'bg-green-500' : 'bg-yellow-500';
    }

    const isPon = slot.cardType === 'GTGHG' || slot.cardType === 'GTGH' || slot.cardType === 'GTGO';

    const tipContent = (
      <div className="text-[11px] space-y-0.5 min-w-[160px]">
        {port.description && <div className="text-teal-300 font-semibold mb-1">📍 {port.description}</div>}
        <div>Port {port.portIndex} — Slot {slot.slotIndex}</div>
        <div>Admin: <span className={port.adminStatus === 'up' ? 'text-green-400' : 'text-red-400'}>{port.adminStatus.toUpperCase()}</span></div>
        <div>Oper: <span className={port.operStatus === 'up' ? 'text-green-400' : 'text-red-400'}>{port.operStatus.toUpperCase()}</span></div>
        {port.sfpTxPower != null && <div>TX Power: <span className="text-yellow-300">{port.sfpTxPower.toFixed(2)} dBm</span></div>}
        {port.sfpTemperature != null && <div>SFP Temp: <span className="text-orange-300">{port.sfpTemperature.toFixed(1)}°C</span></div>}
        {isPon && (
          <div className="border-t border-gray-600 mt-1 pt-1 space-y-0.5">
            <div>Total ONU: <span className="font-medium">{port.onuCount}</span></div>
            {port.onlineOnu   > 0 && <div className="text-green-400">✅ Online: {port.onlineOnu}</div>}
            {port.offlineOnu  > 0 && <div className="text-gray-300">❌ Offline: {port.offlineOnu}</div>}
            {port.losOnu      > 0 && <div className="text-red-400">📡 LOS: {port.losOnu}</div>}
            {port.dyingGaspOnu > 0 && <div className="text-purple-400">⚡ Dying Gasp: {port.dyingGaspOnu}</div>}
            {port.unconfigOnu > 0 && <div className="text-orange-400">⚙ Unconfig: {port.unconfigOnu}</div>}
          </div>
        )}
      </div>
    );

    return (
      <div
        key={`p-${slot.slotIndex}-${port.portIndex}`}
        className={`relative w-5 h-5 border border-gray-700 ${portBg} cursor-pointer transition-all flex items-center justify-center hover:ring-1 hover:ring-blue-400`}
        onMouseEnter={(e) => { e.stopPropagation(); setHoveredPort({ slot: slot.slotIndex, port: port.portIndex }); showTip(e, tipContent); }}
        onMouseLeave={() => { setHoveredPort(null); hideTip(); }}
        onClick={() => onPortClick ? onPortClick(slot.slotIndex, port.portIndex) : undefined}
      >
        {isDisabled && <LockKeyhole className="w-3 h-3 text-gray-700" />}
        {isOnline   && <ArrowDownUp className="w-3 h-3 text-white" />}
        {isOffline  && <ChevronsLeftRightEllipsis className="w-3 h-3 text-yellow-900" />}

        {/* Badges: hanya LOS dan Dying Gasp (PON ports only) */}
        {isPon && (
          <>
            {port.losOnu > 0 && (
              <span className="absolute -top-1.5 -left-1.5 bg-red-600 text-white text-[6px] font-bold rounded-full w-3 h-3 flex items-center justify-center border border-white z-10">
                {port.losOnu}
              </span>
            )}
            {port.dyingGaspOnu > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-purple-600 text-white text-[6px] font-bold rounded-full w-3 h-3 flex items-center justify-center border border-white z-10">
                {port.dyingGaspOnu}
              </span>
            )}
          </>
        )}
      </div>
    );
  };

  // ── Slot renderer ────────────────────────────────────────────────────────────

  const renderSlot = (slotIndex: number, fallbackPorts = 0) => {
    const slot = getSlot(slotIndex);

    if (!slot || !slot.isPresent) {
      return (
        <div className="h-14 flex-1 bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 rounded flex items-center justify-center">
          <span className="text-[10px] text-gray-400">EMPTY</span>
        </div>
      );
    }

    const statusBg = slot.operStatus === 'up'
      ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
      : slot.operStatus === 'down'
      ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
      : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600';

    const tempHeaderBg = slot.temperature == null ? 'bg-gray-800'
      : slot.temperature >= 65 ? 'bg-red-700'
      : slot.temperature >= 55 ? 'bg-orange-600'
      : slot.temperature >= 50 ? 'bg-amber-600'
      : 'bg-gray-800';

    const cardTypeUpper = (slot.cardType ?? '').toUpperCase();
    const isControl = cardTypeUpper.startsWith('SCXN') || cardTypeUpper.startsWith('SCUN');
    const roleLabel = slot.cardStatus === 'inservice' && isControl ? 'CTRL' : null;

    const placeholderPorts: CardPort[] = Array.from({ length: fallbackPorts }, (_, i) => ({
      portIndex: i + 1, adminStatus: 'down', operStatus: 'down',
      onuCount: 0, onlineOnu: 0, offlineOnu: 0, losOnu: 0, dyingGaspOnu: 0, unconfigOnu: 0,
      sfpTxPower: null, sfpBiasCurrent: null, sfpVoltage: null, sfpTemperature: null,
    }));
    const portsToRender = slot.ports.length > 0 ? slot.ports : placeholderPorts;

    const slotTip = (
      <div className="text-[11px] space-y-0.5 min-w-[150px]">
        <div className="text-teal-300 font-semibold mb-1">{formatCardType(slot.cardType)} — Slot {slot.slotIndex}</div>
        <div>Status: <span className={slot.operStatus === 'up' ? 'text-green-400' : 'text-red-400'}>{slot.operStatus.toUpperCase()}</span></div>
        {slot.cpuUsage    != null && <div>CPU: {slot.cpuUsage}%</div>}
        {slot.memoryUsage != null && <div>Memory: {slot.memoryUsage}%</div>}
        {slot.temperature != null && <div>Temp: <span className={slot.temperature >= 50 ? 'text-orange-400' : 'text-green-400'}>{slot.temperature}°C</span></div>}
        <div className="border-t border-gray-600 mt-1 pt-1">Ports: {portsToRender.length}</div>
        {portsToRender.length > 0 && (
          <div>ONUs: {portsToRender.reduce((a, p) => a + p.onuCount, 0)} ({portsToRender.reduce((a, p) => a + p.onlineOnu, 0)} online)</div>
        )}
      </div>
    );

    return (
      <div
        className={`relative h-14 flex-1 ${statusBg} border flex flex-row items-stretch overflow-visible transition-all ${hoveredSlot === slotIndex ? 'ring-2 ring-blue-500 z-10' : ''}`}
        onMouseEnter={(e) => { setHoveredSlot(slotIndex); if (!hoveredPort) showTip(e, slotTip); }}
        onMouseLeave={() => { setHoveredSlot(null); hideTip(); }}
      >
        {/* Card type header — left sidebar, temperature-colored */}
        <div className={`${tempHeaderBg} text-white text-[8px] font-bold flex flex-col items-center justify-center border-r border-gray-700 flex-shrink-0 px-1 gap-0.5 w-10`}>
          <span className="leading-none">{formatCardType(slot.cardType)}</span>
          {slot.temperature != null && slot.temperature >= 50 && (
            <span className="text-[6px] font-normal leading-none">{slot.temperature}°C</span>
          )}
          {roleLabel && (
            <span className="bg-yellow-400 text-gray-900 text-[6px] font-bold px-0.5 rounded leading-none">{roleLabel}</span>
          )}
        </div>
        {/* Ports */}
        <div className="flex-1 px-2 py-1 flex flex-wrap gap-1 items-center justify-center overflow-visible">
          {portsToRender.map(port => renderPort(slot, port))}
        </div>
      </div>
    );
  };

  // ── Slot row with label ──────────────────────────────────────────────────────

  const renderRow = (label: string, children: React.ReactNode) => (
    <div className="flex items-center gap-2">
      <div className="w-12 text-[10px] font-medium text-gray-500 dark:text-gray-400 flex-shrink-0">{label}</div>
      <div className="flex-1 flex gap-2">{children}</div>
    </div>
  );

  // ── States ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="flex items-center gap-2 text-gray-500">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm">Memuat rack diagram...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <p className="text-sm text-red-500">{error}</p>
        <button onClick={handleRefresh} className="px-4 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">
          Coba Lagi
        </button>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          ZTE C300-MINI Rack Diagram
        </h3>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-3 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 transition-colors"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Rack container — C300-MINI layout */}
      <div className="bg-white dark:bg-gray-900 p-3 sm:p-4 rounded-lg border border-gray-300 dark:border-gray-700 overflow-x-auto">
        <div className="min-w-[480px] flex flex-col gap-2">

          {/* Row 1: Slot 19 + 20 — Uplink (HUVQ), side by side */}
          {renderRow('S-19/20', <>{renderSlot(19, 4)}{renderSlot(20, 4)}</>)}

          {/* Row 2: Slot 10 — Control (SCXN, 4 ports) */}
          {renderRow('S-10 Ctrl', renderSlot(10, 4))}

          {/* Row 3: Slot 3 — PON (GTGHG, 16 ports) */}
          {renderRow('S-3 PON', renderSlot(3, 16))}

          {/* Row 4: Slot 2 — PON (GTGHG, 16 ports) */}
          {renderRow('S-2 PON', renderSlot(2, 16))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-green-500 border border-gray-700 rounded-sm" /><span>Online</span></div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-gray-400 border border-gray-700 rounded-sm" /><span>Disabled</span></div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-yellow-500 border border-gray-700 rounded-sm" /><span>Admin UP / Port DOWN</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-red-600 rounded-full" /><span>LOS</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-purple-600 rounded-full" /><span>Dying Gasp</span></div>
      </div>

      {/* Portal tooltip */}
      {fixedTooltip && typeof document !== 'undefined' && createPortal(
        <div
          style={{ position: 'fixed', left: fixedTooltip.x + 12, top: fixedTooltip.y + 12, zIndex: 9999 }}
          className="bg-gray-900 text-white text-xs p-3 rounded-lg shadow-xl border border-gray-700 pointer-events-none max-w-[220px]"
        >
          {fixedTooltip.content}
        </div>,
        document.body,
      )}
    </div>
  );
}
