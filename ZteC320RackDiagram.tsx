'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LockKeyhole, ArrowDownUp, ChevronsLeftRightEllipsis, Zap, Fan } from 'lucide-react';
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
  sfpTxPower: number | null;
  sfpBiasCurrent: number | null;
  sfpVoltage: number | null;
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
  currentMa: number | null;
  voltageMv: number | null;
  cardRole: string | null;
  ports: CardPort[];
}

interface RackData {
  brand: string;
  model: string | null;
  supported: boolean;
  chassisTemp: number | null;
  uptime: string | null;
  slots: SlotCard[];
  fans: Array<{ index: number; status: string; speedLevel?: number }>;
  psus: Array<{ index: number; status: string }>;
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
    currentMa: raw.currentMa ?? null,
    voltageMv: raw.voltageMv ?? null,
    cardRole: raw.cardRole ?? null,
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
      sfpTxPower: p.sfpTxPower ?? null,
      sfpBiasCurrent: p.sfpBiasCurrent ?? null,
      sfpVoltage: p.sfpVoltage ?? null,
      sfpTemperature: p.sfpTemperature ?? null,
    })),
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ZteC320RackDiagram({ oltId, onPortClick, onMetrics }: Props) {
  const [slots, setSlots] = useState<SlotCard[]>([]);
  const [meta, setMeta] = useState<{
    uptime: string | null;
    chassisTemp: number | null;
    avgCpu: number | null;
    avgMem: number | null;
    activeCards: number;
    fans: Array<{ index: number; status: string; speedLevel?: number }>;
    psus: Array<{ index: number; status: string }>;
  }>({ uptime: null, chassisTemp: null, avgCpu: null, avgMem: null, activeCards: 0, fans: [], psus: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

      const fans = result.fans ?? [];
      const psus = result.psus ?? [];
      setMeta({ uptime: result.uptime ?? null, chassisTemp: result.chassisTemp ?? null, avgCpu, avgMem, activeCards: active.length, fans, psus });

      if (onMetrics) {
        const allPorts = mappedSlots.flatMap((s: SlotCard) => s.ports);
        const losTotal = allPorts.reduce((sum: number, p: CardPort) => sum + p.losOnu, 0);
        const fansActive = fans.filter((f: { status: string }) => f.status === 'active').length;
        const portDescriptions: Record<string, string> = {};
        for (const slot of mappedSlots) {
          for (const port of slot.ports) {
            if (port.description) portDescriptions[`${slot.slotIndex}/${port.portIndex}`] = port.description;
          }
        }
        const firstPsu = psus[0] as { index: number; status: string } | undefined;
        const psuStatus = (firstPsu?.status === 'normal' ? 'normal' : firstPsu?.status === 'fault' ? 'fault' : 'unknown') as 'normal' | 'fault' | 'unknown';
        // Use SMXA slot voltage as supply voltage (from card voltage OID)
        const smxaSlot = mappedSlots.find((s: SlotCard) => s.cardType.toUpperCase().startsWith('SMXA'));
        const allPortKeys = mappedSlots.flatMap((s: SlotCard) =>
          s.ports.map((p: CardPort) => `${s.slotIndex}/${p.portIndex}`));
        onMetrics({
          uptime: result.uptime ?? null,
          activeCards: active.length,
          fansActive,
          fansTotal: fans.length,
          losTotal,
          supplyCurrentMa: smxaSlot?.currentMa ?? null,
          supplyVoltageMv: smxaSlot?.voltageMv ?? null,
          psuStatus,
          portDescriptions,
          allPortKeys,
        });
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

  const renderPort = (slot: SlotCard, port: CardPort, isUplink = false) => {
    const isDisabled = port.adminStatus === 'down';
    const isOnline = port.adminStatus === 'up' && port.operStatus === 'up';
    const isOffline = port.adminStatus === 'up' && port.operStatus !== 'up';

    // For uplink ports (SMXA), port status may be unknown (testing) - show as grey
    let portBg = 'bg-gray-400';
    if (port.adminStatus === 'up') {
      portBg = port.operStatus === 'up' ? 'bg-green-500' : 'bg-yellow-500';
    } else if (port.adminStatus === 'testing') {
      portBg = 'bg-gray-400';
    }

    const isPon = !isUplink && (slot.cardType.toUpperCase().includes('GTG') || slot.cardType.toUpperCase().includes('PON'));

    const tipContent = (
      <div className="text-[11px] space-y-0.5 min-w-[160px]">
        {port.description && <div className="text-teal-300 font-semibold mb-1">📍 {port.description}</div>}
        <div>{isUplink ? 'Uplink' : 'Port'} {port.portIndex} — Slot {slot.slotIndex}</div>
        <div>Admin: <span className={port.adminStatus === 'up' ? 'text-green-400' : port.adminStatus === 'down' ? 'text-red-400' : 'text-gray-400'}>{port.adminStatus.toUpperCase()}</span></div>
        <div>Oper: <span className={port.operStatus === 'up' ? 'text-green-400' : port.operStatus === 'down' ? 'text-red-400' : 'text-gray-400'}>{port.operStatus.toUpperCase()}</span></div>
        {port.sfpTxPower != null && <div>TX Power: <span className="text-yellow-300">{port.sfpTxPower.toFixed(2)} dBm</span></div>}
        {port.sfpTemperature != null && <div>SFP Temp: <span className="text-orange-300">{port.sfpTemperature.toFixed(1)}°C</span></div>}
        {isPon && (
          <div className="border-t border-gray-600 mt-1 pt-1 space-y-0.5">
            <div>Total ONU: <span className="font-medium">{port.onuCount}</span></div>
            {port.onlineOnu > 0 && <div className="text-green-400">✅ Online: {port.onlineOnu}</div>}
            {port.offlineOnu > 0 && <div className="text-gray-300">❌ Offline: {port.offlineOnu}</div>}
            {port.losOnu > 0 && <div className="text-red-400">📡 LOS: {port.losOnu}</div>}
            {port.dyingGaspOnu > 0 && <div className="text-purple-400">⚡ Dying Gasp: {port.dyingGaspOnu}</div>}
            {port.unconfigOnu > 0 && <div className="text-orange-400">⚙ Unconfig: {port.unconfigOnu}</div>}
          </div>
        )}
      </div>
    );

    return (
      <div
        key={`p-${slot.slotIndex}-${port.portIndex}-${isUplink ? 'ul' : 'pon'}`}
        className={`relative w-5 h-5 border border-gray-700 ${portBg} cursor-pointer transition-all flex items-center justify-center hover:ring-1 hover:ring-blue-400`}
        onMouseEnter={(e) => { e.stopPropagation(); setHoveredPort({ slot: slot.slotIndex, port: port.portIndex }); showTip(e, tipContent); }}
        onMouseLeave={() => { setHoveredPort(null); hideTip(); }}
        onClick={() => onPortClick ? onPortClick(slot.slotIndex, port.portIndex) : undefined}
      >
        {isDisabled && <LockKeyhole className="w-3 h-3 text-gray-700" />}
        {isOnline && <ArrowDownUp className="w-3 h-3 text-white" />}
        {isOffline && <ChevronsLeftRightEllipsis className="w-3 h-3 text-yellow-900" />}

        {/* Badges: LOS (top-left red) and Dying Gasp (top-right purple) — PON only */}
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

  // ── Slot renderer (PON cards) ─────────────────────────────────────────────────

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
        {slot.cpuUsage != null && <div>CPU: {slot.cpuUsage}%</div>}
        {slot.memoryUsage != null && <div>Memory: {slot.memoryUsage}%</div>}
        {slot.temperature != null && <div>Temp: <span className={slot.temperature >= 50 ? 'text-orange-400' : 'text-green-400'}>{slot.temperature}°C</span></div>}
        {slot.currentMa != null && <div>Current: {slot.currentMa} mA</div>}
        {slot.voltageMv != null && <div>Voltage: {(slot.voltageMv / 1000).toFixed(1)} V</div>}
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
        </div>
        {/* Ports */}
        <div className="flex-1 px-2 py-1 flex flex-wrap gap-1 items-center justify-center overflow-visible">
          {portsToRender.map(port => renderPort(slot, port))}
        </div>
      </div>
    );
  };

  // ── SMXA slot renderer (control card with PSU + uplink ports) ────────────────

  const renderSmxaSlot = (slotIndex: number) => {
    const slot = getSlot(slotIndex);
    const psus = meta.psus;

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

    // 3 uplink ports — they may not have adminUp/operUp data (IF-MIB index differs),
    // so we use existing slot.ports if available, else show as unknown (testing)
    const portDataMap = new Map((slot.ports ?? []).map((p: CardPort) => [p.portIndex, p]));
    const uplinkPorts: CardPort[] = [1, 2, 3].map(idx =>
      portDataMap.get(idx) ?? {
        portIndex: idx,
        adminStatus: 'testing' as const,
        operStatus: 'testing' as const,
        onuCount: 0, onlineOnu: 0, offlineOnu: 0, losOnu: 0, dyingGaspOnu: 0, unconfigOnu: 0,
        sfpTxPower: null, sfpBiasCurrent: null, sfpVoltage: null, sfpTemperature: null,
      }
    );

    const smxaTip = (
      <div className="text-[11px] space-y-0.5 min-w-[160px]">
        <div className="text-teal-300 font-semibold mb-1">SMXA — Slot {slot.slotIndex}</div>
        <div className="text-yellow-300 text-[10px]">Control / Uplink Card</div>
        <div>Status: <span className="text-green-400">{slot.operStatus.toUpperCase()}</span></div>
        {slot.cpuUsage != null && <div>CPU: {slot.cpuUsage}%</div>}
        {slot.memoryUsage != null && <div>Memory: {slot.memoryUsage}%</div>}
        {slot.temperature != null && <div>Temp: <span className={slot.temperature >= 50 ? 'text-orange-400' : 'text-green-400'}>{slot.temperature}°C</span></div>}
        {slot.currentMa != null && <div>Current: {slot.currentMa} mA</div>}
        {slot.voltageMv != null && <div>Voltage: {(slot.voltageMv / 1000).toFixed(1)} V</div>}
        <div className="border-t border-gray-600 mt-1 pt-1 font-medium">PSU (DC -48V):</div>
        <div className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${slot.operStatus === 'up' ? 'bg-green-400' : 'bg-gray-400'}`}></span>
          <span>DC: {slot.operStatus === 'up' ? 'normal' : 'unknown'}</span>
        </div>
        <div className="border-t border-gray-600 mt-1 pt-1 font-medium">Uplink Ports:</div>
        {uplinkPorts.map(p => (
          <div key={p.portIndex} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${p.operStatus === 'up' ? 'bg-green-400' : p.operStatus === 'down' ? 'bg-red-400' : 'bg-gray-400'}`}></span>
            <span>Port {p.portIndex}: {p.operStatus.toUpperCase()}</span>
          </div>
        ))}
      </div>
    );

    return (
      <div
        className={`relative h-14 flex-1 ${statusBg} border flex flex-row items-stretch overflow-visible transition-all ${hoveredSlot === slotIndex ? 'ring-2 ring-blue-500 z-10' : ''}`}
        onMouseEnter={(e) => { setHoveredSlot(slotIndex); if (!hoveredPort) showTip(e, smxaTip); }}
        onMouseLeave={() => { setHoveredSlot(null); hideTip(); }}
      >
        {/* Card type header — left sidebar */}
        <div className={`${tempHeaderBg} text-white text-[8px] font-bold flex flex-col items-center justify-center border-r border-gray-700 flex-shrink-0 px-1 gap-0.5 w-10`}>
          <span className="leading-none">SMXA</span>
          {slot.temperature != null && slot.temperature >= 50 && (
            <span className="text-[6px] font-normal leading-none">{slot.temperature}°C</span>
          )}
          {slot.cardRole === 'standby'
            ? <span className="bg-blue-400 text-white text-[6px] font-bold px-0.5 rounded leading-none">STBY</span>
            : <span className="bg-yellow-400 text-gray-900 text-[6px] font-bold px-0.5 rounded leading-none">CTRL</span>
          }
        </div>

        {/* PSU (absolute left) + uplink ports (centered) */}
        <div className="flex-1 px-2 py-1 relative flex items-center justify-center">
          {/* Single DC PSU — absolute left */}
          <div
            className={`absolute left-2 w-5 h-5 rounded flex items-center justify-center border-2 ${
              slot.operStatus === 'up'
                ? 'bg-teal-600 border-teal-300'
                : 'bg-gray-600 border-gray-400'
            }`}
            title={`DC -48V: ${slot.operStatus === 'up' ? 'normal' : 'unknown'}`}
          >
            <Zap className="w-3 h-3 text-white" />
          </div>
          {/* Uplink ports — centered */}
          <div className="flex gap-1 items-center">
            {uplinkPorts.map(port => renderPort(slot, port, true))}
          </div>
        </div>
      </div>
    );
  };

  // ── PRAM slot renderer (AC+DC power card, no uplink ports) ───────────────────

  const renderPramSlot = (slotIndex: number) => {
    const slot = getSlot(slotIndex);
    const psus = meta.psus;

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

    const psuAc = psus.find(p => p.index === 1);
    const psuDc = psus.find(p => p.index === 2);

    const pramTip = (
      <div className="text-[11px] space-y-0.5 min-w-[160px]">
        <div className="text-teal-300 font-semibold mb-1">PRAM — Slot {slot.slotIndex}</div>
        <div className="text-yellow-300 text-[10px]">Power Supply Card</div>
        <div>Status: <span className={slot.operStatus === 'up' ? 'text-green-400' : 'text-red-400'}>{slot.operStatus.toUpperCase()}</span></div>
        {slot.temperature != null && <div>Temp: <span className={slot.temperature >= 50 ? 'text-orange-400' : 'text-green-400'}>{slot.temperature}°C</span></div>}
        {slot.currentMa != null && <div>Current: {slot.currentMa} mA</div>}
        {slot.voltageMv != null && <div>Voltage: {(slot.voltageMv / 1000).toFixed(1)} V</div>}
        <div className="border-t border-gray-600 mt-1 pt-1 font-medium">PSU:</div>
        <div className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${psuAc?.status === 'normal' ? 'bg-green-400' : psuAc?.status === 'fault' ? 'bg-red-400' : 'bg-gray-400'}`}></span>
          <span>AC (100-240V): {psuAc?.status ?? 'unknown'}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${psuDc?.status === 'normal' ? 'bg-green-400' : psuDc?.status === 'fault' ? 'bg-red-400' : 'bg-gray-400'}`}></span>
          <span>DC (-48V): {psuDc?.status ?? 'unknown'}</span>
        </div>
      </div>
    );

    return (
      <div
        className={`relative h-14 flex-1 ${statusBg} border flex flex-row items-stretch overflow-visible transition-all ${hoveredSlot === slotIndex ? 'ring-2 ring-blue-500 z-10' : ''}`}
        onMouseEnter={(e) => { setHoveredSlot(slotIndex); showTip(e, pramTip); }}
        onMouseLeave={() => { setHoveredSlot(null); hideTip(); }}
      >
        {/* Card type header */}
        <div className={`${tempHeaderBg} text-white text-[8px] font-bold flex flex-col items-center justify-center border-r border-gray-700 flex-shrink-0 px-1 gap-0.5 w-10`}>
          <span className="leading-none">PRAM</span>
          {slot.temperature != null && slot.temperature >= 50 && (
            <span className="text-[6px] font-normal leading-none">{slot.temperature}°C</span>
          )}
          <span className="bg-blue-500 text-white text-[6px] font-bold px-0.5 rounded leading-none">PSU</span>
        </div>

        {/* AC + DC PSU indicators only — no uplink ports */}
        <div className="flex-1 px-2 py-1 flex items-center justify-center gap-2">
          {/* AC PSU */}
          <div className="flex flex-col items-center gap-0.5">
            <div
              className={`w-5 h-5 rounded flex items-center justify-center border ${
                psuAc?.status === 'normal' ? 'bg-green-500 border-green-600'
                : psuAc?.status === 'fault' ? 'bg-red-500 border-red-600'
                : 'bg-gray-500 border-gray-600'
              }`}
              title={`AC PSU: ${psuAc?.status ?? 'unknown'}`}
            >
              <Zap className="w-3 h-3 text-white" />
            </div>
            <span className="text-[7px] text-white font-bold leading-none">AC</span>
          </div>
          {/* DC PSU */}
          <div className="flex flex-col items-center gap-0.5">
            <div
              className={`w-5 h-5 rounded flex items-center justify-center border ${
                psuDc?.status === 'normal' ? 'bg-green-500 border-green-600'
                : psuDc?.status === 'fault' ? 'bg-red-500 border-red-600'
                : 'bg-gray-500 border-gray-600'
              }`}
              title={`DC PSU: ${psuDc?.status ?? 'unknown'}`}
            >
              <Zap className="w-3 h-3 text-white" />
            </div>
            <span className="text-[7px] text-white font-bold leading-none">DC</span>
          </div>
        </div>
      </div>
    );
  };

  // ── Fan section ───────────────────────────────────────────────────────────────

  const renderFanSection = () => {
    const fans = meta.fans;
    const activeFans = fans.filter(f => f.status === 'active').length;
    const totalFans = fans.length || 2;
    const allActive = fans.length > 0 && fans.every(f => f.status === 'active');

    const fanTip = (
      <div className="text-[11px] space-y-0.5 min-w-[120px]">
        <div className="text-teal-300 font-semibold mb-1">Fan Status</div>
        {[1, 2].map((fi) => {
          const fan = fans.find(f => f.index === fi);
          return (
            <div key={fi} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${fan?.status === 'active' ? 'bg-green-400' : 'bg-red-400'}`}></span>
              <span>Fan {fi}: {fan?.status ?? 'unknown'}</span>
              {fan?.speedLevel != null && <span className="text-gray-400">(lvl {fan.speedLevel})</span>}
            </div>
          );
        })}
        <div className="border-t border-gray-600 mt-1 pt-1">{activeFans}/{totalFans} active</div>
      </div>
    );

    return (
      <div
        className="bg-gray-100 dark:bg-gray-800 border border-gray-400 dark:border-gray-600 rounded p-1.5 flex flex-col items-center justify-center gap-1 w-10 flex-shrink-0 cursor-default"
        onMouseEnter={(e) => showTip(e, fanTip)}
        onMouseLeave={() => hideTip()}
      >
        <Fan className={`w-3.5 h-3.5 ${allActive ? 'text-green-500' : 'text-red-500'}`} />
        <div className="flex flex-col gap-0.5">
          {[1, 2].map((fi) => {
            const fan = fans.find(f => f.index === fi);
            const isActive = fan?.status === 'active';
            return (
              <div key={fi} className={`w-5 h-5 border border-gray-400 rounded flex items-center justify-center ${isActive ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                <div className={`w-3 h-3 rounded-sm ${isActive ? 'bg-green-400 dark:bg-green-600' : 'bg-red-400 dark:bg-red-600'}`}></div>
              </div>
            );
          })}
        </div>
        <span className="text-[8px] text-gray-500 dark:text-gray-400">{activeFans}/{totalFans}</span>
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
          ZTE C320 Rack Diagram
        </h3>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-3 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 transition-colors"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Rack container — C320 layout */}
      <div className="bg-white dark:bg-gray-900 p-3 sm:p-4 rounded-lg border border-gray-300 dark:border-gray-700 overflow-x-auto">
        <div className="min-w-[380px] flex flex-col gap-2">
          {/* Chassis: Fan column (left) + slots column (right) */}
          <div className="flex gap-2">
            {/* Fan section — spans all slot rows */}
            {renderFanSection()}

            {/* Slots column */}
            <div className="flex-1 flex flex-col gap-2">
              {/* Row 1: Slot 1 — PON (GTGOG, 8 ports) */}
              {renderRow('S-1 PON', renderSlot(1, 8))}

              {/* Row 2: Slot 2 — PON (GTGOG, 8 ports) */}
              {renderRow('S-2 PON', renderSlot(2, 8))}

              {/* Row 3: Slot 3 + Slot 4 — side by side (NetNumen layout) */}
              <div className="flex items-center gap-2">
                <div className="w-12 text-[10px] font-medium text-gray-500 dark:text-gray-400 flex-shrink-0">S-3/4</div>
                <div className="flex-1 flex gap-2">
                  {/* Slot 3 — PRAM, SMXA, or PON */}
                  {getSlot(3)?.cardType?.toUpperCase() === 'PRAM'
                    ? renderPramSlot(3)
                    : getSlot(3)?.cardType?.toUpperCase().startsWith('SMXA')
                    ? renderSmxaSlot(3)
                    : renderSlot(3, 4)}
                  {/* Slot 4 — PRAM, SMXA standby, PON, or empty */}
                  {getSlot(4)?.cardType?.toUpperCase() === 'PRAM'
                    ? renderPramSlot(4)
                    : getSlot(4)?.cardType?.toUpperCase().startsWith('SMXA')
                    ? renderSmxaSlot(4)
                    : renderSlot(4, 0)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-green-500 border border-gray-700 rounded-sm" /><span>Online</span></div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-gray-400 border border-gray-700 rounded-sm" /><span>Disabled</span></div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-yellow-500 border border-gray-700 rounded-sm" /><span>Admin UP / Port DOWN</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-red-600 rounded-full" /><span>LOS</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-purple-600 rounded-full" /><span>Dying Gasp</span></div>
        <div className="flex items-center gap-1.5"><Zap className="w-3 h-3 text-green-500" /><span>PSU OK</span></div>
        <div className="flex items-center gap-1.5"><Fan className="w-3 h-3 text-green-500" /><span>Fan Active</span></div>
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
