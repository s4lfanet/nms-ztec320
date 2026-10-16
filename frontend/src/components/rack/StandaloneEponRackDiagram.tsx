/**
 * Standalone / Multi-Vendor OLT Rack Diagram — for HiOSO, HSGQ, VSOL, C-Data, BDCOM, Huawei, FiberHome.
 * Renders a 1U rack-mount chassis with interactive PON and Uplink port LEDs,
 * consuming normalized RackData from /api/olt/:id/rack.
 */

import React, { useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRackData } from '../../hooks/useRackData';
import { useRackMetrics } from '../../hooks/useRackMetrics';
import type { RackDiagramProps, CardPort } from '../../types/rack';

function portColor(p: CardPort): { bg: string; ring: string; glow: string } {
  if (p.adminUp === false) return { bg: 'bg-slate-700', ring: 'ring-slate-600', glow: '' };
  if ((p.los || 0) > 0 && (p.online || 0) === 0) {
    return { bg: 'bg-red-500', ring: 'ring-red-400', glow: '#ef4444' };
  }
  if (p.operUp) return { bg: 'bg-emerald-500', ring: 'ring-emerald-400', glow: '#10b981' };
  if ((p.total || 0) > 0) return { bg: 'bg-amber-500', ring: 'ring-amber-400', glow: '#f59e0b' };
  return { bg: 'bg-slate-700', ring: 'ring-slate-600', glow: '' };
}

function uplColor(p: CardPort): { bg: string; ring: string; glow: string } {
  if (p.operUp) return { bg: 'bg-sky-500', ring: 'ring-sky-400', glow: '#0ea5e9' };
  return { bg: 'bg-slate-700', ring: 'ring-slate-600', glow: '' };
}

export default function StandaloneEponRackDiagram({ oltId, onPortClick, onMetrics }: RackDiagramProps) {
  const { data, loading, refreshing, error, reload, refresh } = useRackData(oltId);
  const metrics = useRackMetrics(data);
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
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        Memuat sasis OLT...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-xs text-danger">
        Gagal memuat sasis: {error}
        <button onClick={() => reload()} className="ml-3 underline font-medium">Coba lagi</button>
      </div>
    );
  }

  if (!data || !data.supported) {
    return (
      <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-xs text-warning">
        Visualisasi sasis belum tersedia untuk perangkat ini ({data?.brand || 'OLT'}).
      </div>
    );
  }

  const allPorts = data.slots.flatMap(s => s.ports);
  const ponPorts = allPorts.filter(p => !p.isUplink).sort((a, b) => a.portIndex - b.portIndex);
  const uplinkPorts = allPorts.filter(p => p.isUplink).sort((a, b) => a.portIndex - b.portIndex);

  const renderPonTip = (p: CardPort) => (
    <div className="text-[11px] space-y-0.5">
      <div className="font-semibold text-accent">{p.description || `PON ${p.portIndex}`}</div>
      <div className="text-tx2">Status: <span className={p.operUp ? 'text-success font-medium' : 'text-tx3'}>{p.operUp ? 'ACTIVE' : 'IDLE'}</span></div>
      <div className="border-t border-brd mt-1 pt-1 tabular-nums">
        <div>ONU Online: <span className="text-tx1 font-semibold">{p.online}</span> / {p.total}</div>
        {(p.los || 0) > 0 && <div className="text-danger">LOS: {p.los}</div>}
        {(p.dyinggasp || 0) > 0 && <div className="text-warning">DyingGasp: {p.dyinggasp}</div>}
        {p.sfpRxPower != null && <div className="text-tx2 font-mono">Avg RX: {p.sfpRxPower} dBm</div>}
      </div>
    </div>
  );

  const renderUplinkTip = (p: CardPort) => (
    <div className="text-[11px]">
      <div className="font-semibold text-info">{p.description || `GE ${p.portIndex}`}</div>
      <div>Link: <span className={p.operUp ? 'text-success font-medium' : 'text-tx3'}>{p.operUp ? 'UP' : 'DOWN'}</span></div>
    </div>
  );

  return (
    <div className="select-none">
      <div className="rounded-xl border border-brd bg-surface overflow-hidden">
        <div className="px-4 py-3 space-y-3">
          {/* Chassis Header */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-success" />
              <div>
                <div className="text-xs font-bold text-tx1 tracking-wide leading-none">
                  {data.brand} <span className="text-tx2 font-normal ml-1">{data.model}</span>
                </div>
                <div className="text-[10px] text-tx3 mt-1 font-mono">
                  {ponPorts.length} PON · {uplinkPorts.length} Uplink
                  {data.chassisTemp != null ? ` · ${data.chassisTemp}°C` : ''}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              {data.uptime && <span className="text-[11px] text-tx3 font-mono">{data.uptime}</span>}
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className="p-1.5 rounded-md hover:bg-glass text-tx3 hover:text-tx1 transition-colors"
                title="Refresh rack status"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Ports Panel */}
          <div className="flex flex-wrap items-center gap-4 p-3 rounded-lg bg-glass border border-brd">
            {/* PON Ports */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-tx3">PON Ports</div>
              <div className="flex flex-wrap gap-2">
                {ponPorts.map(p => {
                  const c = portColor(p);
                  return (
                    <button
                      key={`pon-${p.portIndex}`}
                      type="button"
                      onClick={() => onPortClick?.(1, p.portIndex)}
                      onMouseEnter={e => showTip(e, renderPonTip(p))}
                      onMouseLeave={hideTip}
                      className="group flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-md bg-surface border border-brd hover:border-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ring-2 ${c.bg} ${c.ring}`}
                          style={c.glow ? { boxShadow: `0 0 6px ${c.glow}` } : undefined}
                        />
                        <span className="text-[11px] font-mono font-semibold text-tx1">P{p.portIndex}</span>
                      </div>
                      <span className="text-[10px] font-mono tabular-nums text-tx3">
                        {p.online}/{p.total}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Uplink Ports */}
            {uplinkPorts.length > 0 && (
              <div className="space-y-1.5 pl-3 border-l border-brd">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-tx3">Uplink</div>
                <div className="flex flex-wrap gap-2">
                  {uplinkPorts.map(p => {
                    const c = uplColor(p);
                    return (
                      <div
                        key={`upl-${p.portIndex}`}
                        onMouseEnter={e => showTip(e, renderUplinkTip(p))}
                        onMouseLeave={hideTip}
                        className="flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-md bg-surface border border-brd"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ring-2 ${c.bg} ${c.ring}`} />
                          <span className="text-[11px] font-mono font-semibold text-tx2">
                            {p.description || `G${p.portIndex}`}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-tx3">
                          {p.operUp ? 'UP' : 'DOWN'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 rounded-lg bg-surface border border-brd shadow-xl"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}
