/**
 * HSGQ Rack Diagram — for HSGQ EPON standalone OLTs.
 * Flat form factor: single board with PON SFP ports + GE/XGE uplinks.
 * Consumes normalized RackData from /api/olt/:id/rack.
 */

import React, { useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRackData } from '../../hooks/useRackData';
import { useRackMetrics } from '../../hooks/useRackMetrics';
import type { RackDiagramProps, CardPort } from '../../types/rack';

interface PortColor {
  bg: string;
  ring: string;
  glow: string;
  led: string;
}

function ponColor(p: CardPort): PortColor {
  if (p.adminUp === false) return { bg: 'bg-gray-700', ring: 'ring-gray-600', glow: '', led: 'bg-gray-600' };
  if (p.operUp) return { bg: 'bg-emerald-500', ring: 'ring-emerald-400', glow: '#10b981', led: 'bg-emerald-400' };
  return { bg: 'bg-amber-500', ring: 'ring-amber-400', glow: '#f59e0b', led: 'bg-amber-400' };
}

function geColor(p: CardPort): PortColor {
  if (p.operUp) return { bg: 'bg-sky-500', ring: 'ring-sky-400', glow: '#0ea5e9', led: 'bg-sky-400' };
  return { bg: 'bg-gray-700', ring: 'ring-gray-600', glow: '', led: 'bg-gray-600' };
}

function xgeColor(p: CardPort): PortColor {
  if (p.operUp) return { bg: 'bg-violet-500', ring: 'ring-violet-400', glow: '#8b5cf6', led: 'bg-violet-400' };
  return { bg: 'bg-gray-700', ring: 'ring-gray-600', glow: '', led: 'bg-gray-600' };
}

export default function HsgqRackDiagram({ oltId, onPortClick, onMetrics }: RackDiagramProps) {
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
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm gap-2">
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

  const allPorts = data.slots.flatMap(s => s.ports);
  const ponPorts = allPorts.filter(p => !p.isUplink).sort((a, b) => a.portIndex - b.portIndex);
  const gePorts = allPorts.filter(p => p.isUplink && (p.description ?? '').toUpperCase().startsWith('GE')).sort((a, b) => a.portIndex - b.portIndex);
  const xgePorts = allPorts.filter(p => p.isUplink && (p.description ?? '').toUpperCase().startsWith('XGE')).sort((a, b) => a.portIndex - b.portIndex);
  const otherUplinks = allPorts.filter(p => p.isUplink && !gePorts.includes(p) && !xgePorts.includes(p));

  const renderPonTip = (p: CardPort) => (
    <div className="text-[10px]">
      {p.description && <div className="font-semibold text-blue-300 mb-1">{p.description}</div>}
      <div className="font-bold text-teal-400">PON {p.portIndex}</div>
      <div>Admin: <span className={p.adminUp !== false ? 'text-green-400' : 'text-red-400'}>{p.adminUp !== false ? 'UP' : 'DOWN'}</span></div>
      <div>Oper: <span className={p.operUp ? 'text-green-400' : 'text-red-400'}>{p.operUp ? 'UP' : 'DOWN'}</span></div>
      <div className="border-t border-gray-700 mt-1 pt-1">
        <div>ONU: <span className="text-white font-semibold">{p.online}</span>/<span className="text-gray-400">{p.total}</span></div>
        {p.los > 0 && <div className="text-red-400">LOS: {p.los}</div>}
        {p.dyinggasp > 0 && <div className="text-purple-400">DyingGasp: {p.dyinggasp}</div>}
      </div>
    </div>
  );

  const renderUplinkTip = (p: CardPort, type: string) => (
    <div className="text-[10px]">
      {p.description && <div className="font-semibold text-blue-300 mb-1">{p.description}</div>}
      <div className="font-bold text-sky-400">{type} {p.portIndex}</div>
      <div>Oper: <span className={p.operUp ? 'text-green-400' : 'text-red-400'}>{p.operUp ? 'UP' : 'DOWN'}</span></div>
      {p.sfpVendor && <div>SFP: {p.sfpVendor}</div>}
      {p.sfpTxPower != null && <div>TX: {p.sfpTxPower.toFixed(3)} dBm</div>}
      {p.sfpTemperature != null && <div>Temp: {p.sfpTemperature.toFixed(1)} °C</div>}
    </div>
  );

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
                  HSGQ
                  <span className="text-gray-400 font-normal ml-1.5">{data.model}</span>
                </div>
                <div className="text-[9px] text-gray-500 mt-0.5 leading-none uppercase tracking-wider">
                  EPON OLT · {ponPorts.length}×PON · {gePorts.length}×GE · {xgePorts.length}×XGE
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

          {/* Faceplate */}
          <div className="rounded-lg p-3" style={{ background: 'linear-gradient(180deg, #0d1117 0%, #0f172a 100%)', border: '1px solid #2d3748' }}>
            {/* Section labels */}
            <div className="flex gap-3 mb-2">
              {ponPorts.length > 0 && (
                <div className="flex items-center gap-1.5" style={{ minWidth: `${ponPorts.length * 58}px` }}>
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, #14b8a655)' }} />
                  <span className="text-[8px] font-bold text-teal-500/70 uppercase tracking-[0.15em]">PON</span>
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, #14b8a655, transparent)' }} />
                </div>
              )}
              {(gePorts.length + xgePorts.length) > 0 && (
                <div className="flex items-center gap-1.5 flex-1">
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, #0ea5e955)' }} />
                  <span className="text-[8px] font-bold text-sky-500/70 uppercase tracking-[0.15em]">UPLINK</span>
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, #0ea5e955, transparent)' }} />
                </div>
              )}
            </div>

            {/* Port row */}
            <div className="flex items-end gap-3">
              {/* PON SFP ports */}
              {ponPorts.length > 0 && (
                <div className="flex gap-2.5">
                  {ponPorts.map(p => {
                    const label = p.description ?? `PON${p.portIndex}`;
                    const col = ponColor(p);
                    return (
                      <button
                        key={p.portIndex}
                        className="relative group flex flex-col items-center gap-1 cursor-pointer focus:outline-none"
                        onClick={() => onPortClick?.(1, p.portIndex)}
                        onMouseEnter={e => showTip(e, renderPonTip(p))}
                        onMouseLeave={hideTip}
                      >
                        <div
                          className={`relative w-[52px] h-[64px] rounded-[3px] border border-gray-600 group-hover:border-gray-500 transition-all group-hover:ring-2 ${col.ring}`}
                          style={{ background: 'linear-gradient(180deg, #374151 0%, #1f2937 25%, #111827 100%)' }}
                        >
                          <div className={`w-full h-[5px] rounded-t-[2px] ${col.bg}`} />
                          <div className="flex flex-col items-center justify-center gap-1.5 h-[calc(100%-5px)] px-1.5">
                            <div className="w-[36px] h-[36px] rounded-[3px] flex items-center justify-center"
                              style={{ background: '#050810', border: '1px solid #374151' }}>
                              <div className="w-[24px] h-[24px] rounded-full flex items-center justify-center"
                                style={{ background: '#0a0f1a', border: '1px solid #4b5563' }}>
                                <div className={`w-[12px] h-[12px] rounded-full ${col.bg}`} />
                              </div>
                            </div>
                            <span className={`text-[8px] font-mono font-bold leading-none ${p.operUp ? 'text-emerald-400' : 'text-gray-600'}`}>
                              {p.total > 0 ? `${p.online}/${p.total}` : '—'}
                            </span>
                          </div>
                          {p.los > 0 && (
                            <div className="absolute -top-1.5 -right-1.5 w-[14px] h-[14px] bg-red-500 border border-gray-900 rounded-full flex items-center justify-center text-[6px] font-black text-white">!</div>
                          )}
                          {p.dyinggasp > 0 && p.los === 0 && (
                            <div className="absolute -top-1.5 -right-1.5 w-[14px] h-[14px] bg-purple-600 border border-gray-900 rounded-full flex items-center justify-center text-[6px] font-black text-white">⚡</div>
                          )}
                        </div>
                        <span className="text-[8px] font-mono text-gray-500 group-hover:text-gray-300 leading-none whitespace-nowrap">{label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Separator */}
              {ponPorts.length > 0 && (gePorts.length + xgePorts.length) > 0 && (
                <div className="w-px self-stretch my-1" style={{ background: 'linear-gradient(180deg, transparent, #374151 30%, #374151 70%, transparent)' }} />
              )}

              {/* GE uplinks */}
              {gePorts.length > 0 && (
                <div className="flex flex-col gap-1">
                  <div className="text-[7px] font-bold text-sky-600/60 uppercase tracking-widest text-center">GE</div>
                  <div className="flex gap-2.5">
                    {gePorts.map(p => {
                      const label = p.description ?? `GE${p.portIndex}`;
                      const col = geColor(p);
                      return (
                        <div key={p.portIndex} className="relative group flex flex-col items-center gap-1"
                          onMouseEnter={e => showTip(e, renderUplinkTip(p, 'GE'))} onMouseLeave={hideTip}>
                          <div className={`relative w-[44px] h-[36px] rounded-[3px] border border-gray-600 group-hover:border-gray-500 group-hover:ring-2 ${col.ring}`}
                            style={{ background: 'linear-gradient(180deg, #374151 0%, #1f2937 25%, #111827 100%)' }}>
                            <div className={`absolute top-1 right-1 w-[5px] h-[5px] rounded-full ${col.led}`} />
                            <div className="flex items-end justify-center h-full pb-1.5 px-1.5 pt-3">
                              <div className="w-[30px] h-[20px] rounded-[2px]" style={{ background: '#050810', border: '1px solid #374151' }}>
                                <div className="flex justify-evenly items-end h-full px-[2px] pb-[2px]">
                                  {[...Array(8)].map((_, k) => (
                                    <div key={k} style={{ width: 2, height: 7 + (k % 2) * 2, background: '#d4a843', borderRadius: 1 }} />
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                          <span className="text-[7px] font-mono text-gray-500 group-hover:text-gray-300 leading-none whitespace-nowrap">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* XGE uplinks */}
              {xgePorts.length > 0 && (
                <div className="flex flex-col gap-1">
                  <div className="text-[7px] font-bold text-violet-600/60 uppercase tracking-widest text-center">XGE</div>
                  <div className="flex gap-2.5">
                    {xgePorts.map(p => {
                      const label = p.description ?? `XGE${p.portIndex}`;
                      const col = xgeColor(p);
                      return (
                        <div key={p.portIndex} className="relative group flex flex-col items-center gap-1"
                          onMouseEnter={e => showTip(e, renderUplinkTip(p, 'XGE'))} onMouseLeave={hideTip}>
                          <div className={`relative w-[44px] h-[56px] rounded-[3px] border border-gray-600 group-hover:border-gray-500 group-hover:ring-2 ${col.ring}`}
                            style={{ background: 'linear-gradient(180deg, #374151 0%, #1f2937 25%, #111827 100%)' }}>
                            <div className={`w-full h-[4px] rounded-t-[2px] ${col.bg}`} />
                            <div className="flex items-center justify-center h-[calc(100%-4px)] px-1">
                              <div className="w-[32px] h-[28px] rounded-[2px]" style={{ background: '#050810', border: '1px solid #374151' }}>
                                <div className="w-[18px] h-[14px] rounded-[2px] m-auto mt-1" style={{ background: '#0a0f1a', border: '1px solid #4b5563' }} />
                              </div>
                            </div>
                          </div>
                          <span className="text-[7px] font-mono text-gray-500 group-hover:text-gray-300 leading-none whitespace-nowrap">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Other uplinks */}
              {otherUplinks.length > 0 && (
                <div className="flex flex-col gap-1">
                  <div className="text-[7px] font-bold text-gray-600 uppercase tracking-widest text-center">ETH</div>
                  <div className="flex gap-2">
                    {otherUplinks.map(p => (
                      <div key={p.portIndex} className="flex flex-col items-center gap-1"
                        onMouseEnter={e => showTip(e, renderUplinkTip(p, 'ETH'))} onMouseLeave={hideTip}>
                        <div className={`w-[40px] h-[32px] rounded-[3px] border border-gray-600 ${p.operUp ? 'bg-green-600' : 'bg-gray-700'}`} />
                        <span className="text-[7px] font-mono text-gray-500">{p.description ?? p.portIndex}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* LEDs */}
              <div className="ml-auto flex flex-col items-end gap-1 self-stretch py-1">
                <div className="flex flex-col gap-1">
                  <div className="w-[6px] h-[6px] rounded-full bg-green-400 shadow-[0_0_4px_1px_rgba(74,222,128,0.7)]" title="PWR" />
                  <div className="w-[6px] h-[6px] rounded-full bg-green-400 shadow-[0_0_4px_1px_rgba(74,222,128,0.5)]" title="SYS" />
                </div>
              </div>
            </div>
          </div>

          {/* Summary */}
          {ponPorts.length > 0 && (() => {
            const totalOnu = ponPorts.reduce((s, p) => s + p.total, 0);
            const totalOnline = ponPorts.reduce((s, p) => s + p.online, 0);
            const totalLos = ponPorts.reduce((s, p) => s + p.los, 0);
            const ponUp = ponPorts.filter(p => p.operUp).length;
            return (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500 border-t border-gray-700/60 pt-2">
                <span>PON UP: <span className={ponUp > 0 ? 'text-emerald-400 font-semibold' : 'text-gray-600'}>{ponUp}/{ponPorts.length}</span></span>
                <span>ONU: <span className="text-white font-semibold">{totalOnline}</span>/<span className="text-gray-400">{totalOnu}</span></span>
                {totalLos > 0 && <span className="text-red-400 font-semibold">LOS: {totalLos}</span>}
              </div>
            );
          })()}
        </div>
        <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, transparent, #4a5568 30%, #6b7280 50%, #4a5568 70%, transparent)' }} />
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="fixed z-50 pointer-events-none bg-gray-900 border border-gray-700 rounded-lg p-2 shadow-xl"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14, maxWidth: 280 }}>
          {tooltip.content}
        </div>
      )}
    </div>
  );
}
