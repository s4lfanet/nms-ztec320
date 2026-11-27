import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Copy, Download, Power, Upload, Users } from 'lucide-react';
import { api, type FlowClientRow, type FlowPoint, type FlowSettings } from '../../lib/api';
import { cn } from '../../lib/utils';
import { fmtBps } from '../../lib/snmpFormat';
import { Button, Card, CodeBlock, Modal, Notice, Select } from '../ui';
import { toast } from '../Toast';

type FlowRange = '1h' | '6h' | '24h' | '7d' | '30d';
type Dir = 'total' | 'down' | 'up';
const RANGES: FlowRange[] = ['1h', '6h', '24h', '7d', '30d'];
const COLORS = ['#4f8cff', '#f59e0b', '#10b981', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#84cc16', '#94a3b8'];

function fmtBytes(n: number): string {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}

function pick(cell: unknown, dir: Dir): number {
  const c = cell as [number, number] | undefined;
  if (!c) return 0;
  return dir === 'down' ? c[0] : dir === 'up' ? c[1] : c[0] + c[1];
}

function StackedChart({ names, series, step, dir, range, height = 240 }: {
  names: string[]; series: FlowPoint[]; step: number; dir: Dir; range: string; height?: number;
}) {
  const { t } = useTranslation();
  const data = useMemo(() => series.map(p => {
    const row: Record<string, number | string> = { ts: p.ts as string };
    names.forEach(n => { row[n] = (pick(p[n], dir) * 8) / step; });   // byte per bucket → bit/s
    return row;
  }), [series, names, step, dir]);
  if (data.length < 2) {
    return <div className="flex items-center justify-center text-xs text-tx3 border border-dashed border-line rounded-lg" style={{ height }}>{t('flow.noChart')}</div>;
  }
  const short = range === '1h' || range === '6h' || range === '24h';
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="ts" tick={{ fontSize: 11, fill: 'var(--color-tx3)' }} minTickGap={40} interval="preserveStartEnd"
            tickFormatter={v => { const d = new Date(String(v)); return short ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' }); }} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--color-tx3)' }} width={78} tickFormatter={v => fmtBps(Number(v))} />
          <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }}
            labelFormatter={v => new Date(String(v)).toLocaleString()} formatter={(v, n) => [fmtBps(Number(v)), String(n)]} />
          {names.map((n, i) => (
            <Area key={n} type="monotone" dataKey={n} stackId="1" stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]}
              fillOpacity={0.55} strokeWidth={1} dot={false} isAnimationActive={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Legend({ names, onPick, active }: { names: string[]; onPick?: (n: string) => void; active?: string }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
      {names.map((n, i) => (
        <button key={n} type="button" onClick={() => onPick?.(n)} disabled={!onPick || n.startsWith('Lainnya')}
          className={cn('inline-flex items-center gap-1.5 text-xs', active === n ? 'text-tx1 font-semibold' : 'text-tx2', onPick && !n.startsWith('Lainnya') && 'hover:text-accent')}>
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />{n}
        </button>
      ))}
    </div>
  );
}

function RangeButtons({ value, onChange }: { value: FlowRange; onChange: (r: FlowRange) => void }) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex rounded-lg border border-line overflow-hidden" role="radiogroup" aria-label={t('graph.range')}>
      {RANGES.map(r => (
        <button key={r} type="button" role="radio" aria-checked={value === r} onClick={() => onChange(r)}
          className={cn('px-2.5 py-1 text-xs', value === r ? 'bg-accent/15 text-accent' : 'text-tx3 hover:text-tx1')}>{t(`flow.r.${r}`)}</button>
      ))}
    </div>
  );
}

function DirButtons({ value, onChange }: { value: Dir; onChange: (d: Dir) => void }) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex rounded-lg border border-line overflow-hidden" role="radiogroup" aria-label={t('flow.direction')}>
      {(['total', 'down', 'up'] as Dir[]).map(d => (
        <button key={d} type="button" role="radio" aria-checked={value === d} onClick={() => onChange(d)}
          className={cn('px-2.5 py-1 text-xs', value === d ? 'bg-accent/15 text-accent' : 'text-tx3 hover:text-tx1')}>{t(`flow.dir.${d}`)}</button>
      ))}
    </div>
  );
}

/* ─── Setup: aktifkan + perintah MikroTik ─── */

function SetupCard({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['flow-status'], queryFn: api.flowStatus, refetchInterval: 15_000 });
  const [form, setForm] = useState<Partial<FlowSettings>>({});
  const [expanded, setExpanded] = useState<boolean | null>(null);   // null = otomatis
  const save = useMutation({
    mutationFn: (d: Partial<FlowSettings>) => api.flowSettingsSave(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['flow-status'] }); setForm({}); toast.success(t('flow.saved')); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!data) return null;
  const s = { ...data.settings, ...form };
  const nms = data.server_ip || '<IP-NMS>';
  const cmd = `/ip traffic-flow set enabled=yes interfaces=all cache-entries=16k active-flow-timeout=1m inactive-flow-timeout=15s
/ip traffic-flow target add dst-address=${nms} port=${s.flow_port} version=9`;
  const fresh = data.exporters.some(e => e.age_seconds != null && e.age_seconds < 300);
  const showDetail = expanded ?? !(data.has_data && fresh);   // data sudah mengalir → ringkas
  return (
    <Card title={t('flow.setupTitle')} icon={<Activity size={16} />}
      action={<div className="flex items-center gap-2">
        <button type="button" className="text-xs text-accent" onClick={() => setExpanded(!showDetail)}>
          {showDetail ? t('flow.hideSetup') : t('flow.showSetup')}
        </button>
        {canEdit && (
          <Button variant={s.flow_enabled ? 'secondary' : 'primary'} icon={<Power size={15} />} loading={save.isPending}
            onClick={() => save.mutate({ flow_enabled: s.flow_enabled ? 0 : 1 })}>
            {s.flow_enabled ? t('flow.disable') : t('flow.enable')}
          </Button>
        )}
      </div>}>
      <div className="space-y-3 text-sm">
        {showDetail && <p className="text-tx2">{t('flow.setupDesc')}</p>}
        {!s.flow_enabled && <Notice tone="info">{t('flow.disabledNote')}</Notice>}
        {s.flow_enabled === 1 && !fresh && <Notice tone="warn">{t('flow.waiting', { port: s.flow_port })}</Notice>}
        {showDetail && <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-tx2">{t('flow.cmdTitle')}</span>
            <button type="button" className="text-xs text-accent inline-flex items-center gap-1"
              onClick={() => { navigator.clipboard?.writeText(cmd); toast.success(t('flow.copied')); }}><Copy size={12} />{t('flow.copy')}</button>
          </div>
          <CodeBlock maxHeight="max-h-32">{cmd}</CodeBlock>
          <p className="text-xs text-tx3 mt-1">{t('flow.cmdHint')}</p>
        </div>}
        {showDetail && canEdit && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-tx2 flex flex-col gap-1">
              <span>{t('flow.port')}</span>
              <input className="input-field" type="number" value={s.flow_port} onChange={e => setForm(f => ({ ...f, flow_port: Number(e.target.value) }))} />
            </label>
            <label className="text-xs text-tx2 flex flex-col gap-1">
              <span>{t('flow.localNets')}</span>
              <input className="input-field" value={s.flow_local_nets} onChange={e => setForm(f => ({ ...f, flow_local_nets: e.target.value }))} />
            </label>
            <div className="sm:col-span-2">
              <Button variant="secondary" disabled={Object.keys(form).length === 0} loading={save.isPending} onClick={() => save.mutate(form)}>{t('common.save')}</Button>
            </div>
          </div>
        )}
        {data.exporters.length > 0 && (
          <ul className="divide-y divide-line border border-line rounded-lg">
            {data.exporters.map(e => (
              <li key={e.ip} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                <span className="font-medium text-tx1">{e.name}<span className="ml-2 text-tx3 font-normal">{e.ip} · v{e.version}</span></span>
                <span className={cn('tabular-nums', e.age_seconds != null && e.age_seconds < 300 ? 'text-success' : 'text-warning')}>
                  {e.age_seconds == null ? '—' : t('flow.lastSeen', { s: e.age_seconds })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/* ─── Detail pelanggan ─── */

function ClientModal({ client, range, exporter, onClose }: { client: FlowClientRow; range: FlowRange; exporter: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [dir, setDir] = useState<Dir>('total');
  const { data } = useQuery({ queryKey: ['flow-client', client.ip, range, exporter], queryFn: () => api.flowClient(client.ip, { range, exporter }) });
  const title = client.user ? `${client.user} (${client.ip})` : client.ip;
  return (
    <Modal open onClose={onClose} title={title} icon={<Users size={18} />} size="xl">
      <div className="space-y-3">
        {client.onu && <p className="text-xs text-tx3">{t('flow.onu')}: {client.onu}</p>}
        <div className="flex justify-end"><DirButtons value={dir} onChange={setDir} /></div>
        {data && <>
          <StackedChart names={data.series_names} series={data.series} step={data.step} dir={dir} range="7d" height={200} />
          <Legend names={data.series_names} />
          <ServiceTable rows={data.services} />
        </>}
      </div>
    </Modal>
  );
}

function ServiceTable({ rows, onPick, active }: { rows: { service: string; down: number; up: number; total: number; share?: number }[]; onPick?: (s: string) => void; active?: string }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...rows.map(r => r.total));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-tx3 text-left">
            <th className="font-normal py-1">{t('flow.service')}</th>
            <th className="font-normal text-right"><Download size={11} className="inline" /> {t('flow.dir.down')}</th>
            <th className="font-normal text-right"><Upload size={11} className="inline" /> {t('flow.dir.up')}</th>
            <th className="font-normal text-right">{t('flow.share')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 25).map(r => (
            <tr key={r.service} className={cn('border-t border-line', active === r.service && 'bg-accent/5')}>
              <td className="py-1.5 pr-2">
                <button type="button" disabled={!onPick} onClick={() => onPick?.(r.service)} className={cn('text-left text-tx1', onPick && 'hover:text-accent')}>{r.service}</button>
                <div className="h-1 rounded bg-accent/15 mt-1"><div className="h-1 rounded bg-accent" style={{ width: `${(r.total / max) * 100}%` }} /></div>
              </td>
              <td className="text-right tabular-nums">{fmtBytes(r.down)}</td>
              <td className="text-right tabular-nums">{fmtBytes(r.up)}</td>
              <td className="text-right tabular-nums">{r.share != null ? `${r.share}%` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Halaman utama ─── */

export function TrafficFlow({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const [range, setRange] = useState<FlowRange>('24h');
  const [dir, setDir] = useState<Dir>('total');
  const [exporter, setExporter] = useState('');
  const [ifIndex, setIfIndex] = useState('');
  const [service, setService] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<FlowClientRow | null>(null);

  const status = useQuery({ queryKey: ['flow-status'], queryFn: api.flowStatus, refetchInterval: 15_000 });
  const ifaces = useQuery({ queryKey: ['flow-ifaces'], queryFn: api.flowInterfaces, refetchInterval: 120_000, enabled: !!status.data?.has_data });
  const overview = useQuery({
    queryKey: ['flow-overview', range, exporter, ifIndex], queryFn: () => api.flowOverview({ range, exporter, if_index: ifIndex }),
    refetchInterval: 60_000, enabled: !!status.data?.has_data,
  });
  const clients = useQuery({
    queryKey: ['flow-clients', range, exporter, service, q], queryFn: () => api.flowClients({ range, exporter, service, q }),
    refetchInterval: 120_000, enabled: !!status.data?.has_data,
  });

  const exps = ifaces.data?.exporters || [];
  const curIfaces = exps.find(e => e.exporter === exporter)?.interfaces || [];
  const o = overview.data;
  const hasData = !!status.data?.has_data;

  return (
    <div className="space-y-4">
      <SetupCard canEdit={canEdit} />
      {hasData && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <RangeButtons value={range} onChange={setRange} />
            {exps.length > 1 && (
              <Select label={t('flow.router')} value={exporter} onChange={e => { setExporter(e.target.value); setIfIndex(''); }}>
                <option value="">{t('flow.allRouters')}</option>
                {exps.map(e => <option key={e.exporter} value={e.exporter}>{e.name}</option>)}
              </Select>
            )}
            {exporter && curIfaces.length > 1 && (
              <Select label={t('flow.iface')} value={ifIndex} onChange={e => setIfIndex(e.target.value)}>
                <option value="">{t('flow.allIfaces')}</option>
                {curIfaces.map(i => <option key={i.if_index} value={i.if_index}>{i.name}</option>)}
              </Select>
            )}
          </div>

          {o && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card><div className="text-xs text-tx3">{t('flow.dir.down')}</div><div className="text-lg font-semibold text-tx1">{fmtBytes(o.down)}</div></Card>
              <Card><div className="text-xs text-tx3">{t('flow.dir.up')}</div><div className="text-lg font-semibold text-tx1">{fmtBytes(o.up)}</div></Card>
              <Card><div className="text-xs text-tx3">{t('flow.services')}</div><div className="text-lg font-semibold text-tx1">{o.services.length}</div></Card>
              <Card><div className="text-xs text-tx3">{t('flow.clients')}</div><div className="text-lg font-semibold text-tx1">{o.clients}</div></Card>
            </div>
          )}

          {o && (
            <Card title={t('flow.chartTitle')} action={<DirButtons value={dir} onChange={setDir} />}>
              <StackedChart names={o.series_names} series={o.series} step={o.step} dir={dir} range={range} />
              <Legend names={o.series_names} onPick={s => setService(service === s ? '' : s)} active={service} />
              {o.unresolved_share >= 30 && <p className="text-xs text-tx3 mt-2">{t('flow.unresolvedHint', { pct: o.unresolved_share })}</p>}
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title={t('flow.topServices')}>
              {o ? <ServiceTable rows={o.services} onPick={s => setService(service === s ? '' : s)} active={service} /> : null}
            </Card>
            <Card title={service ? t('flow.topClientsFor', { service }) : t('flow.topClients')}
              action={service ? <button type="button" className="text-xs text-accent" onClick={() => setService('')}>{t('flow.clearFilter')}</button> : undefined}>
              <input className="input-field text-sm mb-2" value={q} onChange={e => setQ(e.target.value)} placeholder={t('flow.searchClient')} aria-label={t('flow.searchClient')} />
              <ul className="divide-y divide-line">
                {(clients.data?.clients || []).map(c => (
                  <li key={c.ip}>
                    <button type="button" onClick={() => setOpen(c)} className="w-full text-left py-2 flex items-start justify-between gap-2 hover:bg-glass px-1 rounded">
                      <span className="min-w-0">
                        <span className="block text-sm text-tx1 truncate">{c.user || c.ip}{c.user && <span className="ml-2 text-xs text-tx3">{c.ip}</span>}</span>
                        <span className="block text-[11px] text-tx3 truncate">{c.top_services.map(s => s.service).join(' · ')}</span>
                      </span>
                      <span className="text-xs tabular-nums text-tx2 shrink-0 text-right">{fmtBytes(c.total)}
                        <span className="block text-[10px] text-tx3">↓{fmtBytes(c.down)} ↑{fmtBytes(c.up)}</span></span>
                    </button>
                  </li>
                ))}
                {clients.data && clients.data.clients.length === 0 && <li className="py-4 text-xs text-tx3 text-center">{t('flow.noClients')}</li>}
              </ul>
            </Card>
          </div>
        </>
      )}
      {open && <ClientModal client={open} range={range} exporter={exporter} onClose={() => setOpen(null)} />}
    </div>
  );
}
