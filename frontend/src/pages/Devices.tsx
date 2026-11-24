import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Router, Plus, Search, Cpu, MemoryStick, Thermometer, PlugZap } from 'lucide-react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, EmptyState, LoadingOverlay, Modal, StatusStrip, Tabs } from '../components/ui';
import { AlertThresholdsButton, DevicesOverview, useSnmpSummary } from '../components/snmp/SnmpOverview';
import { SnmpReport } from '../components/snmp/SnmpReport';
import { TopologyMap } from '../components/snmp/TopologyMap';
import { toast } from '../components/Toast';
import { api, type SnmpDevice, type SnmpDeviceForm } from '../lib/api';
import { cn, timeAgo } from '../lib/utils';
import { fmtUptime, STATUS_DOT } from '../lib/snmpFormat';
import { useHasPerm } from '../hooks/useHasPerm';

type Filter = 'all' | 'up' | 'down' | 'warn' | 'unknown';

export function Devices() {
  const { t } = useTranslation();
  const canEdit = useHasPerm()('settings_ip_olts');
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<'list' | 'topology' | 'report'>('list');
  const { data, isLoading, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ['snmp-devices'], queryFn: api.snmpDevices, refetchInterval: 30_000,
  });
  const devices = data?.devices || [];
  const summary = useSnmpSummary(devices.length > 0);
  const sum = data?.summary || {};
  const shown = useMemo(() => devices.filter(d =>
    (filter === 'all' || d.status === filter) &&
    (!q || `${d.name} ${d.host} ${d.sys_name} ${d.hardware} ${d.location}`.toLowerCase().includes(q.toLowerCase()))), [devices, filter, q]);

  return (
    <PageContainer>
      <PageHeader
        title={t('dev.title')}
        description={t('dev.desc')}
        icon={<Router size={20} />}
        live={{ updatedAt: dataUpdatedAt, fetching: isFetching }}
        action={canEdit && (
          <div className="flex flex-wrap gap-2">
            {devices.length > 0 && <AlertThresholdsButton />}
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>{t('dev.add')}</Button>
          </div>
        )}
      />
      {isLoading ? <LoadingOverlay /> : devices.length === 0 ? (
        <EmptyState icon={Router} title={t('dev.emptyTitle')} description={t('dev.emptyDesc')}
          action={canEdit && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>{t('dev.add')}</Button>} />
      ) : (
        <div className="space-y-4">
          <Tabs active={view} onChange={k => setView(k as typeof view)} tabs={[
            { key: 'list', label: t('devx.tabList') },
            { key: 'topology', label: t('topo.tab') },
            { key: 'report', label: t('devx.tabReport') },
          ]} />
          {view === 'report' ? <SnmpReport /> : view === 'topology' ? <TopologyMap /> : <>
          {summary.data && <DevicesOverview summary={summary.data} />}
          <StatusStrip
            aria-label={t('dev.statusSummary')}
            active={filter === 'all' ? null : filter}
            onSelect={k => setFilter((k === filter || k === 'all' ? 'all' : k) as Filter)}
            items={[
              { key: 'all', label: t('dev.all'), count: devices.length, tone: 'idle' },
              { key: 'up', label: t('dev.st.up'), count: sum.up ?? 0, tone: 'ok' },
              { key: 'down', label: t('dev.st.down'), count: sum.down ?? 0, tone: 'crit' },
              { key: 'warn', label: t('dev.st.warn'), count: sum.warn ?? 0, tone: 'warn' },
              { key: 'unknown', label: t('dev.st.unknown'), count: sum.unknown ?? 0, tone: 'idle' },
            ]}
          />
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx3" aria-hidden="true" />
            <input className="input-field w-full pl-9" value={q} onChange={e => setQ(e.target.value)} placeholder={t('dev.search')} />
          </div>
          <ul className="space-y-2">
            {shown.map(d => <DeviceRow key={d.id} d={d} />)}
          </ul>
          {shown.length === 0 && <p className="text-sm text-tx3 text-center py-6">{t('dev.noMatch')}</p>}
          </>}
        </div>
      )}
      {adding && <DeviceFormModal onClose={() => setAdding(false)} />}
    </PageContainer>
  );
}

function DeviceRow({ d }: { d: SnmpDevice }) {
  const { t } = useTranslation();
  const label = [d.vendor !== 'Generic' ? d.vendor : '', d.hardware].filter(Boolean).join(' ') || d.sys_descr.slice(0, 60);
  return (
    <li>
      <Link to={`/dashboard/devices/${d.id}`}
        className={cn('glass-card p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 hover:border-accent/40 transition-colors', !d.enabled && 'opacity-60')}>
        <div className="flex items-center gap-3 min-w-0 md:w-[34%]">
          <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', STATUS_DOT[d.status])} title={t(`dev.st.${d.status}`)} />
          <div className="min-w-0">
            <div className="font-medium text-sm text-tx1 truncate">{d.name}</div>
            <div className="text-xs text-tx3 truncate font-mono">{d.host}{d.location ? <span className="font-sans"> · {d.location}</span> : null}</div>
          </div>
        </div>
        <div className="text-xs text-tx2 truncate md:w-[26%]">
          {label || <span className="text-tx3">{t('dev.notDiscovered')}</span>}
          {d.os_version && <span className="text-tx3"> · v{d.os_version}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tx2 md:flex-1">
          {d.status === 'down' || d.status === 'warn' ? (
            <span className={d.status === 'down' ? 'text-danger' : 'text-warning'}>
              {t(`dev.st.${d.status}`)} {d.status_changed_at && `· ${timeAgo(d.status_changed_at)}`}
            </span>
          ) : (
            <>
              <span title={t('dev.uptime')}>⏱ {fmtUptime(d.uptime_s, t)}</span>
              {d.cpu_pct != null && <span className="inline-flex items-center gap-1"><Cpu size={12} />{Math.round(d.cpu_pct)}%</span>}
              {d.mem_pct != null && <span className="inline-flex items-center gap-1"><MemoryStick size={12} />{Math.round(d.mem_pct)}%</span>}
              {d.temperature != null && <span className="inline-flex items-center gap-1"><Thermometer size={12} />{Math.round(d.temperature)}°C</span>}
            </>
          )}
          {d.ports_total > 0 && (
            <span className="inline-flex items-center gap-1">
              <PlugZap size={12} />{d.ports_up}/{d.ports_total}
              {d.ports_down > 0 && <span className="text-tx3">({t('dev.portsDown', { n: d.ports_down })})</span>}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

/** Form tambah/ubah perangkat SNMP (dipakai juga di halaman detail). */
export function DeviceFormModal({ device, onClose }: { device?: SnmpDevice; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<SnmpDeviceForm>({
    name: device?.name || '', host: device?.host || '', port: device?.port || 161,
    snmp_version: device?.snmp_version || '2c', community: '',
    v3_user: device?.v3_user || '', v3_level: device?.v3_level || 'authPriv',
    v3_auth_proto: device?.v3_auth_proto || 'SHA', v3_auth_pass: '',
    v3_priv_proto: device?.v3_priv_proto || 'AES', v3_priv_pass: '',
    location: device?.location || '', notes: device?.notes || '', enabled: device?.enabled ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (p: Partial<SnmpDeviceForm>) => { setForm(f => ({ ...f, ...p })); setTest(null); };
  const v3 = form.snmp_version === '3';

  const payload = () => {
    const d: Partial<SnmpDeviceForm> = { ...form, port: Number(form.port) || 161 };
    for (const k of ['community', 'v3_auth_pass', 'v3_priv_pass'] as const) if (!d[k]) delete d[k];
    return d;
  };
  const runTest = async () => {
    setTesting(true);
    try {
      const r = await api.snmpTest({ ...payload(), device_id: device?.id });
      setTest(r.ok ? { ok: true, text: t('dev.testOk', { name: r.sys_name || '-', vendor: r.vendor || '', ms: r.ms }) } : { ok: false, text: r.error || '' });
    } catch (e) { setTest({ ok: false, text: (e as Error).message }); }
    finally { setTesting(false); }
  };
  const save = async () => {
    setSaving(true);
    try {
      if (device) await api.snmpDeviceUpdate(device.id, payload());
      else await api.snmpDeviceCreate(payload() as SnmpDeviceForm);
      toast.success(device ? t('dev.saved') : t('dev.added'));
      qc.invalidateQueries({ queryKey: ['snmp-devices'] });
      qc.invalidateQueries({ queryKey: ['snmp-device'] });
      onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const secretPh = (has: boolean | undefined) => (has ? t('dev.keepSecret') : '');
  return (
    <Modal open onClose={onClose} title={device ? t('dev.edit') : t('dev.add')} icon={<Router size={18} />} size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2 w-full">
          <Button variant="secondary" onClick={runTest} loading={testing}>{t('dev.test')}</Button>
          <Button variant="primary" onClick={save} loading={saving}>{t('dev.save')}</Button>
        </div>
      }>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block"><span className="label-sm">{t('dev.name')}</span>
            <input className="input-field" value={form.name} onChange={e => set({ name: e.target.value })} placeholder="CCR Core Pusat" /></label>
          <label className="block"><span className="label-sm">{t('dev.location')}</span>
            <input className="input-field" value={form.location} onChange={e => set({ location: e.target.value })} placeholder="POP Pusat, rak 2" /></label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className="block col-span-2"><span className="label-sm">{t('dev.host')}</span>
            <input className="input-field font-mono" value={form.host} onChange={e => set({ host: e.target.value })} placeholder="10.10.0.1" inputMode="url" /></label>
          <label className="block"><span className="label-sm">{t('dev.port')}</span>
            <input className="input-field" type="number" value={form.port} onChange={e => set({ port: Number(e.target.value) })} /></label>
        </div>
        <div>
          <span className="label-sm">{t('dev.version')}</span>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {(['2c', '3', '1'] as const).map(v => (
              <button key={v} type="button" role="radio" aria-checked={form.snmp_version === v} onClick={() => set({ snmp_version: v })}
                className={cn('p-2 rounded-lg border text-xs', form.snmp_version === v ? 'border-accent bg-accent/10 text-tx1' : 'border-brd text-tx2 hover:border-tx3')}>
                SNMP v{v}
              </button>
            ))}
          </div>
        </div>
        {!v3 ? (
          <label className="block"><span className="label-sm">{t('dev.community')}</span>
            <input className="input-field font-mono" type="password" autoComplete="new-password" value={form.community}
              onChange={e => set({ community: e.target.value })} placeholder={secretPh(device?.has_community)} /></label>
        ) : (
          <div className="space-y-3 rounded-lg border border-brd p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block"><span className="label-sm">{t('dev.v3User')}</span>
                <input className="input-field" value={form.v3_user} onChange={e => set({ v3_user: e.target.value })} autoComplete="off" /></label>
              <label className="block"><span className="label-sm">{t('dev.v3Level')}</span>
                <select className="input-field" value={form.v3_level} onChange={e => set({ v3_level: e.target.value })}>
                  <option value="authPriv">authPriv</option><option value="authNoPriv">authNoPriv</option><option value="noAuthNoPriv">noAuthNoPriv</option>
                </select></label>
            </div>
            {form.v3_level !== 'noAuthNoPriv' && (
              <div className="grid grid-cols-3 gap-3">
                <label className="block"><span className="label-sm">{t('dev.authProto')}</span>
                  <select className="input-field" value={form.v3_auth_proto} onChange={e => set({ v3_auth_proto: e.target.value })}>
                    {['SHA', 'SHA256', 'MD5'].map(p => <option key={p}>{p}</option>)}</select></label>
                <label className="block col-span-2"><span className="label-sm">{t('dev.authPass')}</span>
                  <input className="input-field" type="password" autoComplete="new-password" value={form.v3_auth_pass}
                    onChange={e => set({ v3_auth_pass: e.target.value })} placeholder={secretPh(device?.has_auth_pass)} /></label>
              </div>
            )}
            {form.v3_level === 'authPriv' && (
              <div className="grid grid-cols-3 gap-3">
                <label className="block"><span className="label-sm">{t('dev.privProto')}</span>
                  <select className="input-field" value={form.v3_priv_proto} onChange={e => set({ v3_priv_proto: e.target.value })}>
                    {['AES', 'AES256', 'DES'].map(p => <option key={p}>{p}</option>)}</select></label>
                <label className="block col-span-2"><span className="label-sm">{t('dev.privPass')}</span>
                  <input className="input-field" type="password" autoComplete="new-password" value={form.v3_priv_pass}
                    onChange={e => set({ v3_priv_pass: e.target.value })} placeholder={secretPh(device?.has_priv_pass)} /></label>
              </div>
            )}
          </div>
        )}
        <label className="block"><span className="label-sm">{t('dev.notes')}</span>
          <textarea className="input-field" rows={2} value={form.notes} onChange={e => set({ notes: e.target.value })} /></label>
        {device && (
          <label className="flex items-center gap-2 text-sm text-tx2">
            <input type="checkbox" checked={form.enabled} onChange={e => set({ enabled: e.target.checked })} /> {t('dev.enabled')}
          </label>
        )}
        {test && (
          <p className={cn('text-xs rounded-lg border px-2.5 py-2', test.ok ? 'text-success border-success/30 bg-success/10' : 'text-danger border-danger/30 bg-danger/10')}>{test.text}</p>
        )}
        <p className="text-[11px] text-tx3">{t('dev.mikrotikHint')}</p>
      </div>
    </Modal>
  );
}
