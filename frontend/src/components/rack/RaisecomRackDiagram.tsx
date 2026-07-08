/**
 * Raisecom Rack Diagram — for ISCOM6820-GP, ISCOM5800E.
 * Modular chassis with GPON cards, fan tray, PSU.
 * Consumes normalized RackData from /api/olt/:id/rack.
 */

import React, { useState, useCallback } from 'react';
import { LockKeyhole, ArrowDownUp, RefreshCw } from 'lucide-react';
import { useRackData } from '../../hooks/useRackData';
import { useRackMetrics } from '../../hooks/useRackMetrics';
import type { RackDiagramProps, SlotCard, CardPort } from '../../types/rack';

function formatCardType(t: string | null): string {
  if (!t) return 'EMPTY';
  return t.toUpperCase();
}

export default function RaisecomRackDiagram({ oltId, onPortClick, onMetrics }: RackDiagramProps) {
  const { data, loading, refreshing, error, reload, refresh } = useRackData(oltId);
  const metrics = useRackMetrics(data);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [hoveredPort, setHoveredPort] = useState<{ slot: number; port: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);

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

  const renderPort = (slot: SlotCard, port: CardPort) => {
    const isHovered = hoveredPort?.slot === slot.slotIndex && hoveredPort?.port === port.portIndex;
    const isDisabled = port.adminUp === false;
    const isOnline = port.adminUp !== false && port.operUp === true;
    const isPonPort = !port.isUplink;

    let portBg = 'bg-gray-400';
    if (port.adminUp !== false) {
      portBg = port.operUp ? 'bg-green-500' : 'bg-yellow-500';
    }

    const tip = (
      <div className="text-[10px]">
        {port.description && <div className="font-semibold text-blue-300 mb-1">{port.description}</div>}
        <div className="font-bold text-teal-400">Port {slot.slotIndex}/{port.portIndex}</div>
        <div>Admin: <span className={port.adminUp !== false ? 'text-green-400' : 'text-red-400'}>{port.adminUp !== false ? 'UP' : 'DOWN'}</span></div>
        <div>Oper: <span className={port.operUp ? 'text-green-400' : 'text-red-400'}>{port.operUp ? 'UP' : 'DOWN'}</span></div>
        {isPonPort && (
          <div className="border-t border-brd mt-1 pt-1">
            <div>ONU: <span className="text-tx1 font-semibold">{port.online}</span>/<span className="text-tx3">{port.total}</span></div>
            {port.los > 0 && <div className="text-red-400">LOS: {port.los}</div>}
            {port.dyinggasp > 0 && <div className="text-purple-400">DyingGasp: {port.dyinggasp}</div>}
            {port.authfail > 0 && <div className="text-orange-400">AuthFail: {port.authfail}</div>}
          </div>
        )}
        {port.sfpVendor && (
          <div className="border-t border-brd mt-1 pt-1">
            <div className="font-semibold text-cyan-400">SFP</div>
            <div>OEM: {port.sfpVendor}</div>
            {port.sfpModel && <div>Model: {port.sfpModel}</div>}
            {port.sfpWavelength != null && <div>λ: {port.sfpWavelength} nm</div>}
          </div>
        )}
      </div>
    );

    return (
      <div
        key={`p-${slot.slotIndex}-${port.portIndex}`}
        className={`relative w-5 h-5 border border-brd ${portBg} cursor-pointer transition-all flex items-center justify-center flex-shrink-0 ${isHovered ? 'ring-1 ring-blue-400 z-20' : ''}`}
        onMouseEnter={(e) => { e.stopPropagation(); setHoveredSlot(null); setHoveredPort({ slot: slot.slotIndex, port: port.portIndex }); showTip(e, tip); }}
        onMouseLeave={() => { setHoveredPort(null); hideTip(); }}
        onClick={(e) => { e.stopPropagation(); onPortClick?.(slot.slotIndex, port.portIndex); }}
      >
        {isDisabled && <LockKeyhole className="w-3 h-3 text-gray-700" />}
        {isOnline && !isDisabled && <ArrowDownUp className="w-3 h-3 text-white" />}
        {isPonPort && port.los > 0 && (
          <div className="absolute -top-1.5 -left-1.5 bg-red-600 text-white text-[7px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center border border-white z-10">{port.los}</div>
        )}
        {isPonPort && port.dyinggasp > 0 && (
          <div className="absolute -top-1.5 -right-1.5 bg-purple-600 text-white text-[7px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center border border-white z-10">{port.dyinggasp}</div>
        )}
      </div>
    );
  };

  const renderSlot = (slot: SlotCard | undefined) => {
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
      : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700';
    const tempHeaderBg = slot.temperature == null ? 'bg-gray-800'
      : slot.temperature >= 65 ? 'bg-red-700'
      : slot.temperature >= 55 ? 'bg-orange-600'
      : 'bg-gray-800';

    const slotTip = (
      <div className="text-xs">
        <div className="font-bold text-teal-400 mb-1">{formatCardType(slot.cardType)} — Slot {slot.slotIndex}</div>
        <div className="text-[10px] space-y-0.5">
          <div>Status: <span className={slot.operStatus === 'up' ? 'text-green-400' : 'text-red-400'}>{slot.operStatus.toUpperCase()}</span></div>
          {slot.cpuUsage != null && <div>CPU: {slot.cpuUsage}%</div>}
          {slot.memoryUsage != null && <div>Memory: {slot.memoryUsage}%</div>}
          {slot.temperature != null && <div>Temp: {slot.temperature}°C</div>}
        </div>
      </div>
    );

    return (
      <div
        className={`relative w-full h-full ${statusBg} border flex flex-col items-center cursor-pointer overflow-visible ${isHovered ? 'ring-2 ring-blue-500 z-10' : ''}`}
        onMouseEnter={(e) => { if (!hoveredPort) { setHoveredSlot(slot.slotIndex); showTip(e, slotTip); } }}
        onMouseLeave={() => { setHoveredSlot(null); hideTip(); }}
        onClick={() => { if (!hoveredPort) onPortClick?.(slot.slotIndex, 0); }}
      >
        <div className={`${tempHeaderBg} text-white text-[8px] font-bold px-0.5 py-0.5 text-center border-b border-gray-700 w-full flex-shrink-0`}>
          {formatCardType(slot.cardType)}
          {slot.temperature != null && slot.temperature >= 50 && (
            <div className="text-[6px] font-normal leading-tight">{slot.temperature}°C</div>
          )}
        </div>
        <div className="flex-1 p-1 flex flex-col gap-0.5 items-center justify-start w-full overflow-visible">
          {slot.ports.map(port => renderPort(slot, port))}
        </div>
      </div>
    );
  };

  return (
    <div className="select-none">
      <div
        className="rounded-xl border-2 border-gray-600 overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #2d3748 0%, #1a202c 40%, #1a202c 60%, #2d3748 100%)' }}
      >
        <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, transparent, #4a5568 30%, #6b7280 50%, #4a5568 70%, transparent)' }} />
        <div className="px-4 py-3 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-green-400 shadow-[0_0_6px_2px_rgba(74,222,128,0.6)]" />
              <div>
                <div className="text-[12px] font-bold text-gray-100 tracking-wide leading-none">
                  Raisecom
                  <span className="text-gray-400 font-normal ml-1.5">{data.model}</span>
                </div>
                <div className="text-[9px] text-gray-500 mt-0.5 leading-none uppercase tracking-wider">
                  GPON OLT · {data.ponPortCount}×PON · {data.uplinkPortCount}×Uplink
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {data.uptime && <span className="text-[10px] text-gray-400 font-mono">{data.uptime}</span>}
              <button onClick={refresh} disabled={refreshing}
                className="p-1.5 rounded-md hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors">
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Chassis body */}
          <div className="rounded-lg p-3" style={{ background: 'linear-gradient(180deg, #0d1117 0%, #0f172a 100%)', border: '1px solid #2d3748' }}>
            <div className="flex gap-2">
              {/* Slots */}
              <div className="flex gap-2 flex-1">
                {slots.map(slot => (
                  <div key={slot.slotIndex} className="w-20 h-40">
                    {renderSlot(slot)}
                  </div>
                ))}
              </div>
              {/* Fan column */}
              {data.fans.length > 0 && (
                <div className="flex flex-col gap-1 w-12">
                  <div className="text-[7px] font-bold text-gray-500 uppercase tracking-widest text-center mb-1">FAN</div>
                  {data.fans.map(fan => (
                    <div key={`fan-${fan.index}`}
                      className="relative bg-glass border-brd px-1 py-0.5 text-center">
                      <span className="text-[8px] font-medium text-tx2">F{fan.index}</span>
                      <div className={`absolute top-0.5 right-0.5 w-2 h-2 rounded-full border ${
                        fan.status === 'active' ? 'bg-green-500 border-green-600' : 'bg-red-500 border-red-600'
                      }`} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Summary */}
          {metrics && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-tx3 border-t border-brd pt-2">
              <span>Cards: <span className="text-tx1 font-semibold">{metrics.activeCards}</span></span>
              <span>Fans: <span className={metrics.fansActive === metrics.fansTotal ? 'text-green-400' : 'text-red-400'}>{metrics.fansActive}/{metrics.fansTotal}</span></span>
              {metrics.losTotal > 0 && <span className="text-red-400 font-semibold">LOS: {metrics.losTotal}</span>}
            </div>
          )}
        </div>
        <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, transparent, #4a5568 30%, #6b7280 50%, #4a5568 70%, transparent)' }} />
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="fixed z-50 pointer-events-none bg-surface border-brd rounded-lg p-2 shadow-xl"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14, maxWidth: 280 }}>
          {tooltip.content}
        </div>
      )}
    </div>
  );
}
