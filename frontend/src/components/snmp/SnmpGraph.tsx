import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { fmtBps } from '../../lib/snmpFormat';

export type GraphRange = '6h' | '24h' | '7d' | '30d' | '1y';
export const RANGES: GraphRange[] = ['6h', '24h', '7d', '30d', '1y'];
export type GraphUnit = 'bps' | 'pct' | 'temp' | 'volt' | 'rpm' | 'watt' | 'amp' | 'err';

export interface GraphSeries { metric: string; label: string; color: string }

export function fmtValue(v: number | null | undefined, unit: GraphUnit): string {
  if (v == null) return '—';
  switch (unit) {
    case 'bps': return fmtBps(v);
    case 'pct': return `${v.toFixed(v < 10 ? 1 : 0)}%`;
    case 'temp': return `${v.toFixed(1)}°C`;
    case 'volt': return `${v.toFixed(1)} V`;
    case 'rpm': return `${Math.round(v)} rpm`;
    case 'watt': return `${v.toFixed(1)} W`;
    case 'amp': return `${v.toFixed(2)} A`;
    case 'err': return `${v.toFixed(2)}/s`;
  }
}

function tickTime(iso: string, range: GraphRange) {
  const d = new Date(iso);
  if (range === '6h' || range === '24h') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (range === '1y') return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** Pilihan rentang waktu (dipakai bersama oleh beberapa grafik). */
export function RangePicker({ value, onChange }: { value: GraphRange; onChange: (r: GraphRange) => void }) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex rounded-lg border border-brd overflow-hidden" role="radiogroup" aria-label={t('graph.range')}>
      {RANGES.map(r => (
        <button key={r} type="button" role="radio" aria-checked={value === r} onClick={() => onChange(r)}
          className={cn('px-2.5 py-1 text-xs', value === r ? 'bg-accent/15 text-accent' : 'text-tx3 hover:text-tx1')}>
          {t(`graph.r.${r}`)}
        </button>
      ))}
    </div>
  );
}

/**
 * Grafik riwayat ala Observium: area per seri + statistik
 * (sekarang / rata-rata / maks / 95th percentile).
 */
export function SnmpGraph({ deviceId, portId, series, unit, range, height = 180, title, showStats = true }: {
  deviceId: number; portId?: number; series: GraphSeries[]; unit: GraphUnit; range: GraphRange;
  height?: number; title?: string; showStats?: boolean;
}) {
  const { t } = useTranslation();
  const gid = useId().replace(/:/g, '');
  const metrics = series.map(s => s.metric).join(',');
  const { data, isLoading } = useQuery({
    queryKey: ['snmp-graph', deviceId, portId ?? null, metrics, range],
    queryFn: () => api.snmpGraph({ device_id: deviceId, port_id: portId, metrics, range }),
    refetchInterval: range === '6h' || range === '24h' ? 60_000 : 300_000,
  });

  // Gabungkan semua seri ke satu baris per waktu
  const rows: Record<string, Record<string, number | string>> = {};
  for (const s of series) {
    for (const p of data?.series?.[s.metric] || []) {
      const r = rows[p.t] || (rows[p.t] = { t: p.t });
      r[s.metric] = p.avg;
    }
  }
  const chart = Object.values(rows).sort((a, b) => String(a.t).localeCompare(String(b.t)));
  const empty = !isLoading && chart.length < 2;

  return (
    <div>
      {title && <p className="text-xs font-medium text-tx2 mb-1.5">{title}</p>}
      <div style={{ height }} className="relative">
        {empty ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-tx3 border border-dashed border-brd rounded-lg">
            {t('graph.noData')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
              <defs>
                {series.map(s => (
                  <linearGradient key={s.metric} id={`g-${gid}-${s.metric.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke="var(--border-color, rgba(255,255,255,.06))" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="t" tickFormatter={v => tickTime(String(v), range)} tick={{ fontSize: 10, fill: 'var(--color-tx3)' }}
                interval="preserveStartEnd" minTickGap={40} />
              <YAxis tickFormatter={v => fmtValue(Number(v), unit)} tick={{ fontSize: 10, fill: 'var(--color-tx3)' }} width={62}
                domain={unit === 'pct' ? [0, 100] : [0, 'auto']} allowDecimals />
              <Tooltip
                contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }}
                labelFormatter={v => new Date(String(v)).toLocaleString()}
                formatter={(v, name) => [fmtValue(Number(v), unit), series.find(s => s.metric === name)?.label || String(name)]}
              />
              {series.map(s => (
                <Area key={s.metric} type="monotone" dataKey={s.metric} stroke={s.color} strokeWidth={1.6}
                  fill={`url(#g-${gid}-${s.metric.replace(/[^a-z0-9]/gi, '')})`} dot={false} isAnimationActive={false} connectNulls />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {showStats && data?.stats && (
        <table className="w-full mt-2 text-[11px] tabular-nums">
          <thead>
            <tr className="text-tx3">
              <th className="text-left font-normal py-0.5"></th>
              <th className="text-right font-normal">{t('graph.now')}</th>
              <th className="text-right font-normal">{t('graph.avg')}</th>
              <th className="text-right font-normal">{t('graph.max')}</th>
              <th className="text-right font-normal">{t('graph.p95')}</th>
            </tr>
          </thead>
          <tbody>
            {series.map(s => {
              const st = data.stats[s.metric];
              return (
                <tr key={s.metric} className="text-tx1">
                  <td className="py-0.5"><span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle" style={{ background: s.color }} />{s.label}</td>
                  <td className="text-right">{fmtValue(st?.current, unit)}</td>
                  <td className="text-right">{fmtValue(st?.avg, unit)}</td>
                  <td className="text-right">{fmtValue(st?.max, unit)}</td>
                  <td className="text-right">{fmtValue(st?.p95, unit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
