import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Router, RefreshCw, Pencil, Trash2, Thermometer, Fan, Zap, Cpu, MemoryStick, HardDrive, Gauge, EyeOff, Eye, Star, PanelBottomOpen } from 'lucide-react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { ActionMenu, Card, EmptyState, LoadingOverlay, Tabs } from '../components/ui';
import { TrafficFlow } from '../components/snmp/TrafficFlow';
import { TopologyMap } from '../components/snmp/TopologyMap';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';
import { api, type SnmpDevice, type SnmpNeighbor, type SnmpPort, type SnmpSensor } from '../lib/api';
import { cn, timeAgo } from '../lib/utils';
import { fmtBps, fmtSpeed, fmtUptime, STATUS_DOT } from '../lib/snmpFormat';
import { useHasPerm } from '../hooks/useHasPerm';
import { DeviceFormModal } from './Devices';
import { SensorRules } from '../components/snmp/SensorRules';
import { PortLive, PortSpark } from '../components/snmp/PortLive';
import { PortDetail, rxTone } from '../components/snmp/PortDetail';
import { DeviceTables } from '../components/snmp/MacTables';
import { PORT_KINDS, countKinds, portKind, type PortKind } from '../lib/portKind';
import { SnmpGraph, RangePicker, type GraphRange, type GraphUnit } from '../components/snmp/SnmpGraph';

const PALETTE = ['var(--color-accent)', 'var(--color-info)', 'var(--color-warning)', 'var(--color-success)', 'var(--color-danger)', '#a78bfa'];
const KIND_UNIT: Record<string, GraphUnit> = { cpu: 'pct', memory: 'pct', storage: 'pct', temperature: 'temp', voltage: 'volt', fan: 'rpm', power: 'watt', current: 'amp' };
const KIND_ORDER = ['cpu', 'memory', 'temperature', 'voltage', 'power', 'current', 'fan', 'storage'];

const SENSOR_ICON: Record<string, React.ReactNode> = {
  temperature: <Thermometer size={14} />, fan: <Fan size={14} />, voltage: <Zap size={14} />, power: <Zap size={14} />,
  current: <Zap size={14} />, cpu: <Cpu size={14} />, memory: <MemoryStick size={14} />, storage: <HardDrive size={14} />, status: <Gauge size={14} />,
};

const EVENT_TONE: Record<string, string> = { critical: 'text-danger', warning: 'text-warning', info: 'text-tx2' };

export function DeviceDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const did = Number(id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const canEdit = useHasPerm()('settings_ip_olts');
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'overview' | 'graphs' | 'ports' | 'neighbors' | 'tables' | 'rules' | 'flow' | 'topology' | 'events'>(
    () => { const q = params.get('tab'); return q === 'ports' || q === 'tables' || q === 'flow' || q === 'topology' ? q : 'overview'; });
  const [range, setRange] = useState<GraphRange>('24h');
  const [editing, setEditing] = useState(false);
  const { data, isLoading, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ['snmp-device', did], queryFn: () => api.snmpDevice(did), refetchInterval: 30_000, enabled: !!did,
  });

  if (isLoading) return <PageContainer><LoadingOverlay /></PageContainer>;
  if (!data?.success) return <PageContainer><EmptyState icon={Router} title={t('dev.notFound')} /></PageContainer>;
  const d = data.device;

  const discover = async () => {
    try { const r = await api.snmpDeviceDiscover(d.id); toast.info(r.message); setTimeout(() => qc.invalidateQueries({ queryKey: ['snmp-device', did] }), 6000); }
    catch (e) { toast.error((e as Error).message); }
  };
  const remove = async () => {
    if (!(await confirm({ title: t('dev.deleteTitle', { name: d.name }), message: t('dev.deleteMsg'), variant: 'danger' }))) return;
    try { await api.snmpDeviceDelete(d.id); toast.success(t('dev.deleted')); qc.invalidateQueries({ queryKey: ['snmp-devices'] }); nav('/dashboard/devices'); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <PageContainer>
      <PageHeader
        title={d.name}
        description={`${d.host}${d.location ? ' · ' + d.location : ''}`}
        icon={<Router size={20} />}
        breadcrumbs={[{ label: t('dev.title'), path: '/dashboard/devices' }, { label: d.name }]}
        live={{ updatedAt: dataUpdatedAt, fetching: isFetching }}
        action={canEdit && (
          <ActionMenu actions={[
            { key: 'discover', label: t('dev.rediscover'), icon: <RefreshCw size={16} />, onClick: discover },
            { key: 'edit', label: t('dev.edit'), icon: <Pencil size={16} />, onClick: () => setEditing(true) },
            { key: 'delete', label: t('dev.delete'), icon: <Trash2 size={16} />, onClick: remove, danger: true },
          ]} />
        )}
      />

      <div className="glass-card p-3 md:p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-2 font-medium">
          <span className={cn('w-2.5 h-2.5 rounded-full', STATUS_DOT[d.status])} />{t(`dev.st.${d.status}`)}
        </span>
        {d.status !== 'up' && d.status_reason && <span className="text-xs text-tx3 basis-full md:basis-auto">{d.status_reason}</span>}
        <Stat label={t('dev.uptime')} value={fmtUptime(d.uptime_s, t)} />
        <Stat label="CPU" value={d.cpu_pct != null ? `${Math.round(d.cpu_pct)}%` : '—'} />
        <Stat label={t('dev.memory')} value={d.mem_pct != null ? `${Math.round(d.mem_pct)}%` : '—'} />
        <Stat label={t('dev.temp')} value={d.temperature != null ? `${Math.round(d.temperature)}°C` : '—'} />
        <Stat label={t('dev.ports')} value={`${d.ports_up}/${d.ports_total}`} />
        <Stat label={t('dev.lastPoll')} value={d.last_poll_at ? `${timeAgo(d.last_poll_at)}${d.poll_ms ? ` · ${d.poll_ms} ms` : ''}` : '—'} />
      </div>

      <Tabs mobileGrid={3} active={tab} onChange={k => setTab(k as typeof tab)} tabs={[
        { key: 'overview', label: t('dev.tabOverview') },
        { key: 'graphs', label: t('dev.tabGraphs') },
        { key: 'ports', label: `${t('dev.tabPorts')} (${data.ports.length})` },
        { key: 'neighbors', label: `${t('topo.neighbors')} (${data.neighbors?.length ?? 0})` },
        { key: 'tables', label: t('mact.tab') },
        { key: 'rules', label: t('snrule.tab') },
        { key: 'flow', label: t('flow.tab') },
        { key: 'topology', label: t('topo.tab') },
        { key: 'events', label: t('dev.tabEvents') },
      ]} />

      {tab === 'overview' && <Overview device={d} sensors={data.sensors} />}
      {tab === 'graphs' && <DeviceGraphs deviceId={did} range={range} setRange={setRange} />}
      {tab === 'ports' && <Ports ports={data.ports} canEdit={canEdit} deviceId={did} range={range} setRange={setRange} />}
      {tab === 'neighbors' && <Neighbors list={data.neighbors || []} />}
      {tab === 'tables' && <DeviceTables deviceId={did} canEdit={canEdit} />}
      {tab === 'rules' && <SensorRules deviceId={did} canEdit={canEdit} ports={data.ports} />}
      {tab === 'topology' && <TopologyMap deviceId={did} />}
      {tab === 'flow' && <TrafficFlow canEdit={canEdit} deviceId={did} deviceName={d.name} />}
      {tab === 'events' && (
        <Card title={t('dev.tabEvents')}>
          {data.events.length === 0 ? <p className="text-sm text-tx3">{t('dev.noEvents')}</p> : (
            <ul className="divide-y divide-line">
              {data.events.map(e => (
                <li key={e.id} className="py-2 flex gap-3 text-sm">
                  <span className="text-xs text-tx3 w-24 shrink-0">{e.created_at ? timeAgo(e.created_at) : ''}</span>
                  <span className={cn('flex-1', EVENT_TONE[e.severity] || 'text-tx2')}>{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {editing && <DeviceFormModal device={d} onClose={() => setEditing(false)} />}
    </PageContainer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <span className="inline-flex flex-col"><span className="text-[11px] text-tx3">{label}</span><span className="text-tx1 tabular-nums">{value}</span></span>;
}

function Overview({ device: d, sensors }: { device: SnmpDevice; sensors: SnmpSensor[] }) {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    [t('dev.sysName'), d.sys_name], [t('dev.vendorModel'), [d.vendor, d.hardware].filter(Boolean).join(' ')],
    [t('dev.osVersion'), [d.os_name, d.os_version].filter(Boolean).join(' ')], [t('dev.serial'), d.serial],
    [t('dev.sysLocation'), d.sys_location], [t('dev.sysContact'), d.sys_contact],
    ['SNMP', `v${d.snmp_version} · ${d.host}:${d.port}`], [t('dev.discoveredAt'), d.discovered_at ? timeAgo(d.discovered_at) : ''],
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title={t('dev.system')}>
        <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
          {rows.map(([k, v]) => (<Fragment key={k}><dt className="text-tx3">{k}</dt><dd className="text-tx1 break-words">{v || '—'}</dd></Fragment>))}
        </dl>
        {d.sys_descr && <p className="mt-3 text-[11px] text-tx3 break-words">{d.sys_descr}</p>}
        {d.notes && <p className="mt-2 text-xs text-tx2 whitespace-pre-line">{d.notes}</p>}
      </Card>
      <Card title={t('dev.health')}>
        {sensors.length === 0 ? <p className="text-sm text-tx3">{t('dev.noSensors')}</p> : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sensors.map(s => (
              <li key={s.id} className="flex items-center gap-2 rounded-lg bg-glass border border-line px-2.5 py-2">
                <span className="text-tx3">{SENSOR_ICON[s.kind] || <Gauge size={14} />}</span>
                <span className="flex-1 min-w-0 text-xs text-tx2 truncate" title={s.name}>{s.name}</span>
                <span className={cn('text-sm font-medium tabular-nums', s.kind === 'status' && s.value != null ? (s.value >= 0.5 ? 'text-success' : 'text-danger') : 'text-tx1')}>
                  {s.value == null ? '—' : s.kind === 'status' ? (s.value >= 0.5 ? 'OK' : 'FAIL') : `${Number.isInteger(s.value) ? s.value : s.value.toFixed(1)}${s.unit === 'C' ? '°C' : s.unit ? ' ' + s.unit : ''}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function DeviceGraphs({ deviceId, range, setRange }: { deviceId: number; range: GraphRange; setRange: (r: GraphRange) => void }) {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['snmp-device-metrics', deviceId], queryFn: () => api.snmpDeviceMetrics(deviceId) });
  const groups = useMemo(() => {
    const g: Record<string, { metric: string; name: string }[]> = {};
    for (const m of data?.metrics || []) {
      const kind = m.metric.split(':')[0];
      (g[kind] = g[kind] || []).push(m);
    }
    return KIND_ORDER.filter(k => g[k]).map(k => ({ kind: k, items: g[k] }));
  }, [data]);
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><RangePicker value={range} onChange={setRange} /></div>
      {groups.length === 0 ? (
        <Card><p className="text-sm text-tx3">{t('graph.waitFirst')}</p></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {groups.map(g => (
            <Card key={g.kind} title={t(`graph.kind.${g.kind}`)}>
              <SnmpGraph deviceId={deviceId} range={range} unit={KIND_UNIT[g.kind] || 'pct'}
                series={g.items.slice(0, 6).map((m, i) => ({ metric: m.metric, label: m.name, color: PALETTE[i % PALETTE.length] }))} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Ports({ ports, canEdit, deviceId, range, setRange }: { ports: SnmpPort[]; canEdit: boolean; deviceId: number; range: GraphRange; setRange: (r: GraphRange) => void }) {
  const [openPort, setOpenPort] = useState<number | null>(null);
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'active' | 'down' | 'watched' | 'all'>('active');
  const [kind, setKind] = useState<'all' | PortKind>('all');
  const [q, setQ] = useState('');
  const kindCounts = useMemo(() => countKinds(ports), [ports]);
  const kindsPresent = PORT_KINDS.filter(k => kindCounts[k]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ports.filter(p =>
      (filter === 'all' ? true : filter === 'watched' ? p.watched : filter === 'down' ? (p.admin_status === 'up' && p.oper_status !== 'up' && !p.ignored) : (p.admin_status === 'up' && !p.ignored))
      && (kind === 'all' || portKind(p) === kind)
      && (!needle || p.name.toLowerCase().includes(needle) || (p.alias || '').toLowerCase().includes(needle) || (p.descr || '').toLowerCase().includes(needle)));
  }, [ports, filter, kind, q]);
  const { data: snmpCfg } = useQuery({ queryKey: ['snmp-settings'], queryFn: api.snmpSettings, staleTime: 300_000 });
  const rxLow = snmpCfg?.settings.snmp_rx_low_dbm ?? -25;
  const { data: sparks } = useQuery({ queryKey: ['snmp-sparks', deviceId], queryFn: () => api.snmpSparks(deviceId), refetchInterval: 300_000 });
  const fmtPps = (v?: number | null) => (v == null ? null : v >= 1000 ? `${(v / 1000).toFixed(1)}k pps` : `${Math.round(v)} pps`);
  const update = async (p: SnmpPort, data: { ignored?: boolean; watched?: boolean }) => {
    try {
      await api.snmpPortUpdate(p.id, data);
      qc.invalidateQueries({ queryKey: ['snmp-device', deviceId] });
      qc.invalidateQueries({ queryKey: ['snmp-summary'] });
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Card title={t('dev.tabPorts')} action={
      <select className="input-field !w-auto text-xs" value={filter} onChange={e => setFilter(e.target.value as typeof filter)} aria-label={t('dev.portFilter')}>
        <option value="active">{t('dev.pfActive')}</option><option value="down">{t('dev.pfDown')}</option><option value="watched">{t('devx.pfWatched')}</option><option value="all">{t('dev.pfAll')}</option>
      </select>
    }>
      {ports.length > 8 && (
        <div className="mb-3 space-y-2">
          <input className="input-field text-sm" value={q} onChange={e => setQ(e.target.value)} placeholder={t('dev.portSearch')} aria-label={t('dev.portSearch')} />
          {kindsPresent.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label={t('dev.portKind')}>
              {(['all', ...kindsPresent] as const).map(k => (
                <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                  className={cn('shrink-0 rounded-full border px-3 py-1 text-xs transition-colors',
                    kind === k ? 'border-accent bg-accent/10 text-accent' : 'border-line text-tx2 hover:border-accent hover:text-accent')}>
                  {t(`dev.pk.${k}`)} <span className="tabular-nums text-tx3">{k === 'all' ? ports.length : kindCounts[k]}</span>
                </button>
              ))}
            </div>
          )}
          {(kind !== 'all' || q.trim()) && <p className="text-xs text-tx3">{t('dev.portShown', { n: shown.length, total: ports.length })}</p>}
        </div>
      )}
      {shown.length === 0 ? <p className="text-sm text-tx3">{t('dev.noPorts')}</p> : (
        <ul className="divide-y divide-line">
          {shown.map(p => (
            <li key={p.id} className={cn('py-2.5 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1 sm:gap-4', p.ignored && 'opacity-50')}>
              <div className="flex items-center gap-2 min-w-0 sm:w-[38%]">
                <span className={cn('w-2 h-2 rounded-full shrink-0', p.admin_status !== 'up' ? 'bg-tx3' : p.oper_status === 'up' ? 'bg-success' : 'bg-danger')} />
                <span className="min-w-0">
                  <span className="block text-sm text-tx1 truncate">{p.name}{p.speed_mbps ? <span className="text-xs text-tx3"> · {fmtSpeed(p.speed_mbps)}</span> : null}
                    {p.sfp_type ? <span className="text-xs text-tx3"> · {p.sfp_type}</span> : null}
                    {p.rx_dbm != null ? <span className={cn('text-xs tabular-nums', rxTone(p.rx_dbm, rxLow))} title={t('pdet.rx')}> · RX {p.rx_dbm.toFixed(1)} dBm</span> : null}</span>
                  {p.alias && <span className="block text-xs text-tx3 truncate">{p.alias}</span>}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tx2 sm:flex-1 pl-4 sm:pl-0">
                {p.oper_status === 'up' ? (p.in_bps == null && p.out_bps == null ? (
                  <span className="text-tx3">{p.has_counters ? t('live.waitPoll') : t('live.noData')}</span>
                ) : (
                  <>
                    <PortSpark inV={sparks?.ports[String(p.id)]?.in} outV={sparks?.ports[String(p.id)]?.out} />
                    <span title={t('dev.in')}>↓ {fmtBps(p.in_bps)}{fmtPps(p.in_pps) && <span className="text-tx3"> · {fmtPps(p.in_pps)}</span>}</span>
                    <span title={t('dev.out')}>↑ {fmtBps(p.out_bps)}{fmtPps(p.out_pps) && <span className="text-tx3"> · {fmtPps(p.out_pps)}</span>}</span>
                    {p.util_pct != null && <span className={cn(p.util_pct >= 80 ? 'text-danger' : p.util_pct >= 60 ? 'text-warning' : 'text-tx3')}>{p.util_pct}%</span>}
                    {((p.in_err_rate || 0) + (p.out_err_rate || 0)) > 0 && <span className="text-warning">{t('dev.errors', { n: ((p.in_err_rate || 0) + (p.out_err_rate || 0)).toFixed(2) })}</span>}
                  </>
                )) : (
                  <span className={p.admin_status === 'up' ? 'text-danger' : 'text-tx3'}>
                    {p.admin_status !== 'up' ? t('dev.adminDown') : t(`dev.oper.${p.oper_status}`, { defaultValue: p.oper_status })}{p.status_changed_at ? ` · ${timeAgo(p.status_changed_at)}` : ''}
                  </span>
                )}
              </div>
              <span className="self-start sm:self-center flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-4 sm:pl-0">
                {/* Tombol detail yang jelas terlihat (bukan baris yang harus diketuk) */}
                <button type="button" onClick={() => setOpenPort(openPort === p.id ? null : p.id)} aria-expanded={openPort === p.id}
                  className={cn('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                    openPort === p.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-tx2 hover:border-accent hover:text-accent')}>
                  <PanelBottomOpen size={14} className={cn('transition-transform', openPort === p.id && 'rotate-180')} />
                  {openPort === p.id ? t('pdet.close') : t('pdet.open')}
                </button>
                {canEdit ? (
                  <>
                    {!p.ignored && (
                      <button type="button" onClick={() => update(p, { watched: !p.watched })} aria-pressed={p.watched}
                        className={cn('inline-flex items-center gap-1 text-[11px]', p.watched ? 'text-warning' : 'text-tx3 hover:text-tx1')}
                        title={p.watched ? t('devx.unwatchHint') : t('devx.watchHint')}>
                        <Star size={13} fill={p.watched ? 'currentColor' : 'none'} />{p.watched ? t('devx.watching') : t('devx.watch')}
                      </button>
                    )}
                    <button type="button" onClick={() => update(p, { ignored: !p.ignored })} className="inline-flex items-center gap-1 text-[11px] text-tx3 hover:text-tx1"
                      title={p.ignored ? t('dev.unignoreHint') : t('dev.ignoreHint')}>
                      {p.ignored ? <Eye size={13} /> : <EyeOff size={13} />}{p.ignored ? t('dev.unignore') : t('dev.ignore')}
                    </button>
                  </>
                ) : p.watched ? <Star size={13} className="text-warning" fill="currentColor" aria-label={t('devx.watching')} /> : null}
              </span>
              {openPort === p.id && (
                <div className="reveal basis-full w-full pt-2 space-y-3">
                  {p.oper_status === 'up' && <PortLive portId={p.id} speedMbps={p.speed_mbps} />}
                  <PortDetail port={p} />
                  <RangePicker value={range} onChange={setRange} />
                  {p.rx_dbm != null && (
                    <SnmpGraph deviceId={deviceId} portId={p.id} range={range} unit="dbm" height={130} title={t('pdet.opticalGraph')}
                      series={[{ metric: 'dom_rx', label: 'RX', color: 'var(--color-success)' }, { metric: 'dom_tx', label: 'TX', color: 'var(--color-info)' }]} />
                  )}
                  <SnmpGraph deviceId={deviceId} portId={p.id} range={range} unit="bps" title={t('graph.traffic')}
                    series={[{ metric: 'in', label: t('dev.in'), color: 'var(--color-success)' }, { metric: 'out', label: t('dev.out'), color: 'var(--color-info)' }]} />
                  <SnmpGraph deviceId={deviceId} portId={p.id} range={range} unit="pps" height={110} title={t('live.packets')}
                    series={[{ metric: 'pkt_in', label: t('dev.in'), color: 'var(--color-success)' }, { metric: 'pkt_out', label: t('dev.out'), color: 'var(--color-info)' }]} />
                  <SnmpGraph deviceId={deviceId} portId={p.id} range={range} unit="err" height={110} title={t('graph.errors')}
                    series={[{ metric: 'in_err', label: t('dev.in'), color: 'var(--color-warning)' }, { metric: 'out_err', label: t('dev.out'), color: 'var(--color-danger)' }]} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Neighbors({ list }: { list: SnmpNeighbor[] }) {
  const { t } = useTranslation();
  return (
    <Card title={t('topo.neighbors')}>
      {list.length === 0 ? <p className="text-sm text-tx3">{t('topo.noNeighbors')}</p> : (
        <ul className="divide-y divide-line">
          {list.map(n => (
            <li key={n.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-sm text-tx2 sm:w-[22%] truncate">{n.local_port || '—'}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-tx1 break-words">
                  {n.remote_device_id
                    ? <Link to={`/dashboard/devices/${n.remote_device_id}`} className="text-accent">{n.remote_device_name}</Link>
                    : (n.remote_name || n.remote_ip || n.remote_chassis)}
                  {n.remote_port && <span className="text-tx3"> · {n.remote_port}</span>}
                  {!n.remote_device_id && <span className="text-xs text-tx3"> ({t('topo.unregistered')})</span>}
                </span>
                <span className="block text-xs text-tx3 break-words">
                  {[n.remote_ip, n.remote_chassis, n.remote_platform].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="text-[11px] text-tx3 uppercase">{n.protocol}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-tx3 mt-3">{t('topo.neighborsHint')}</p>
    </Card>
  );
}
