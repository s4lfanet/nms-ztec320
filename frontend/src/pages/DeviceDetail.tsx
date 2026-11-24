import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Router, RefreshCw, Pencil, Trash2, Thermometer, Fan, Zap, Cpu, MemoryStick, HardDrive, Gauge, EyeOff, Eye } from 'lucide-react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { ActionMenu, Card, EmptyState, LoadingOverlay, Tabs } from '../components/ui';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';
import { api, type SnmpDevice, type SnmpPort, type SnmpSensor } from '../lib/api';
import { cn, timeAgo } from '../lib/utils';
import { fmtBps, fmtSpeed, fmtUptime, STATUS_DOT } from '../lib/snmpFormat';
import { useHasPerm } from '../hooks/useHasPerm';
import { DeviceFormModal } from './Devices';

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
  const [tab, setTab] = useState<'overview' | 'ports' | 'events'>('overview');
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

      <Tabs active={tab} onChange={k => setTab(k as typeof tab)} tabs={[
        { key: 'overview', label: t('dev.tabOverview') },
        { key: 'ports', label: `${t('dev.tabPorts')} (${data.ports.length})` },
        { key: 'events', label: t('dev.tabEvents') },
      ]} />

      {tab === 'overview' && <Overview device={d} sensors={data.sensors} />}
      {tab === 'ports' && <Ports ports={data.ports} canEdit={canEdit} deviceId={did} />}
      {tab === 'events' && (
        <Card title={t('dev.tabEvents')}>
          {data.events.length === 0 ? <p className="text-sm text-tx3">{t('dev.noEvents')}</p> : (
            <ul className="divide-y divide-brd">
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
              <li key={s.id} className="flex items-center gap-2 rounded-lg bg-glass border border-brd px-2.5 py-2">
                <span className="text-tx3">{SENSOR_ICON[s.kind] || <Gauge size={14} />}</span>
                <span className="flex-1 min-w-0 text-xs text-tx2 truncate" title={s.name}>{s.name}</span>
                <span className="text-sm font-medium text-tx1 tabular-nums">
                  {s.value == null ? '—' : `${Number.isInteger(s.value) ? s.value : s.value.toFixed(1)}${s.unit === 'C' ? '°C' : s.unit ? ' ' + s.unit : ''}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Ports({ ports, canEdit, deviceId }: { ports: SnmpPort[]; canEdit: boolean; deviceId: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'active' | 'down' | 'all'>('active');
  const shown = useMemo(() => ports.filter(p =>
    filter === 'all' ? true : filter === 'down' ? (p.admin_status === 'up' && p.oper_status !== 'up' && !p.ignored) : (p.admin_status === 'up' && !p.ignored)), [ports, filter]);
  const toggle = async (p: SnmpPort) => {
    try { await api.snmpPortUpdate(p.id, { ignored: !p.ignored }); qc.invalidateQueries({ queryKey: ['snmp-device', deviceId] }); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Card title={t('dev.tabPorts')} action={
      <select className="input-field !w-auto text-xs" value={filter} onChange={e => setFilter(e.target.value as typeof filter)} aria-label={t('dev.portFilter')}>
        <option value="active">{t('dev.pfActive')}</option><option value="down">{t('dev.pfDown')}</option><option value="all">{t('dev.pfAll')}</option>
      </select>
    }>
      {shown.length === 0 ? <p className="text-sm text-tx3">{t('dev.noPorts')}</p> : (
        <ul className="divide-y divide-brd">
          {shown.map(p => (
            <li key={p.id} className={cn('py-2.5 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4', p.ignored && 'opacity-50')}>
              <div className="flex items-center gap-2 min-w-0 sm:w-[38%]">
                <span className={cn('w-2 h-2 rounded-full shrink-0', p.admin_status !== 'up' ? 'bg-tx3' : p.oper_status === 'up' ? 'bg-success' : 'bg-danger')} />
                <span className="min-w-0">
                  <span className="block text-sm text-tx1 truncate">{p.name}{p.speed_mbps ? <span className="text-xs text-tx3"> · {fmtSpeed(p.speed_mbps)}</span> : null}</span>
                  {p.alias && <span className="block text-xs text-tx3 truncate">{p.alias}</span>}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tx2 sm:flex-1 pl-4 sm:pl-0">
                {p.oper_status === 'up' ? (
                  <>
                    <span title={t('dev.in')}>↓ {fmtBps(p.in_bps)}</span>
                    <span title={t('dev.out')}>↑ {fmtBps(p.out_bps)}</span>
                    {p.util_pct != null && <span className={cn(p.util_pct >= 80 ? 'text-danger' : p.util_pct >= 60 ? 'text-warning' : 'text-tx3')}>{p.util_pct}%</span>}
                    {((p.in_err_rate || 0) + (p.out_err_rate || 0)) > 0 && <span className="text-warning">{t('dev.errors', { n: ((p.in_err_rate || 0) + (p.out_err_rate || 0)).toFixed(2) })}</span>}
                  </>
                ) : (
                  <span className={p.admin_status === 'up' ? 'text-danger' : 'text-tx3'}>
                    {p.admin_status !== 'up' ? t('dev.adminDown') : t(`dev.oper.${p.oper_status}`, { defaultValue: p.oper_status })}{p.status_changed_at ? ` · ${timeAgo(p.status_changed_at)}` : ''}
                  </span>
                )}
              </div>
              {canEdit && (
                <button type="button" onClick={() => toggle(p)} className="self-start sm:self-center inline-flex items-center gap-1 text-[11px] text-tx3 hover:text-tx1 pl-4 sm:pl-0"
                  title={p.ignored ? t('dev.unignoreHint') : t('dev.ignoreHint')}>
                  {p.ignored ? <Eye size={13} /> : <EyeOff size={13} />}{p.ignored ? t('dev.unignore') : t('dev.ignore')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
