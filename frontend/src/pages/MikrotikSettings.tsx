import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type MikrotikDevice } from '../lib/api';
import { useHasPerm } from '../hooks/useHasPerm';
import { useAuth } from '../stores/auth';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';
import {
  Router, Plus, Trash2, Edit3, CheckCircle, XCircle,
  Loader2, Wifi, WifiOff, Zap, RefreshCw, Route, Activity,
} from 'lucide-react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, EmptyState, Modal, Input, Select } from '../components/ui';

interface FormState {
  name: string;
  host: string;
  api_mode: 'api' | 'rest';
  api_port: number;
  api_ssl: boolean;
  api_user: string;
  api_password: string;
  enabled: boolean;
  ping_enabled: boolean;
  ping_batch: number;
  ping_source: 'mikrotik' | 'vps';
}

const EMPTY: FormState = {
  name: '', host: '', api_mode: 'api', api_port: 8728, api_ssl: false,
  api_user: '', api_password: '', enabled: true, ping_enabled: true, ping_batch: 25,
  ping_source: 'mikrotik',
};

export function MikrotikSettings() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const hasPerm = useHasPerm();
  const canManage = hasPerm('settings_ip_olts');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; dev?: MikrotikDevice } | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [testingId, setTestingId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['mikrotik'],
    queryFn: api.mikrotikList,
    refetchInterval: 30000,
    enabled: canManage,
  });
  const devices = data?.devices || [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['mikrotik'] });

  const saveMutation = useMutation({
    mutationFn: (f: FormState) =>
      modal?.mode === 'edit' && modal.dev
        ? api.mikrotikUpdate(modal.dev.id, f)
        : api.mikrotikCreate(f),
    onSuccess: () => { toast.success(t('pg_mikrotik.mikrotikSaved')); setModal(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.mikrotikDelete(id),
    onSuccess: () => { toast.success(t('pg_mikrotik.mikrotikDeleted')); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openAdd = () => { setForm(EMPTY); setModal({ mode: 'add' }); };
  const openEdit = (d: MikrotikDevice) => {
    setForm({
      name: d.name, host: d.host, api_mode: d.api_mode, api_port: d.api_port,
      api_ssl: d.api_ssl, api_user: d.api_user, api_password: '',
      enabled: d.enabled, ping_enabled: d.ping_enabled, ping_batch: d.ping_batch,
      ping_source: d.ping_source || 'mikrotik',
    });
    setModal({ mode: 'edit', dev: d });
  };

  const testDevice = async (d: MikrotikDevice) => {
    setTestingId(d.id);
    try {
      const r = await api.mikrotikTest(d.id);
      if (r.success) toast.success(t('pg_mikrotik.testOk', { name: d.name, identity: r.identity, n: r.active_sessions }));
      else toast.error(`${d.name}: ${r.message}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pg_mikrotik.testFailed'));
    } finally {
      setTestingId(null);
      invalidate();
    }
  };

  const pollNowMutation = useMutation({
    mutationFn: api.mikrotikPollNow,
    onSuccess: (d) => {
      const s = d.states || {};
      const failed = (d.devices || []).filter(x => !x.ok);
      if (failed.length) {
        toast.error(`${failed.map(x => x.name).join(', ')}: ${failed[0].error || t('pg_mikrotik.failedWord')}`);
      } else {
        toast.success(t('pg_mikrotik.syncDone', { ok: s.ok || 0, slow: s.slow || 0, down: s.down || 0, none: s.no_session || 0 }));
      }
      invalidate();
      qc.invalidateQueries({ queryKey: ['ftth-map'] });
      qc.invalidateQueries({ queryKey: ['all-onus'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Poll gagal'),
  });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  if (!canManage) {
    return (
      <PageContainer>
        <EmptyState icon={Router} title={t('pg_mikrotik.accessDenied')}
          description={t('pg_mikrotik.youDonTHave')} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('pg_mikrotik.mikrotikPppoeServers')}
        description={t('pg_mikrotik.routerosDevicesArePolled')}
        action={canManage && (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => pollNowMutation.mutate()}
              disabled={pollNowMutation.isPending || devices.length === 0}
              title={t('pg_mikrotik.runPppoeSessionMatch')}
              icon={<RefreshCw size={15} className={pollNowMutation.isPending ? 'animate-spin' : ''} />}
            >
              {pollNowMutation.isPending ? 'Syncing…' : 'Sync Sekarang'}
            </Button>
            <Button onClick={openAdd} icon={<Plus size={16} />}>{t('pg_mikrotik.addMikrotik')}</Button>
          </div>
        )}
      />

      {isLoading ? (
        <Card className="p-8 text-center"><Loader2 size={28} className="text-accent animate-spin mx-auto" /></Card>
      ) : devices.length === 0 ? (
        <EmptyState
          icon={Router}
          title={t('pg_mikrotik.noMikrotikYet')}
          description={t('pg_mikrotik.addAPppoeServer')}
          action={canManage && <Button onClick={openAdd} icon={<Plus size={16} />}>{t('pg_mikrotik.addMikrotik')}</Button>}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brd text-left">
                <th className="px-4 py-3">{t('pg_mikrotik.name')}</th>
                <th className="px-4 py-3">Host</th>
                <th className="px-4 py-3">API</th>
                <th className="px-4 py-3">Ping</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">{t('pg_mikrotik.health')}</th>
                <th className="px-4 py-3">{t('pg_mikrotik.lastPoll')}</th>
                <th className="px-4 py-3 text-right">{t('pg_mikrotik.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {devices.map(d => (
                <tr key={d.id} className="border-b border-brd/50 hover:bg-glass/50">
                  <td className="px-4 py-3 font-medium text-tx1">{d.name}</td>
                  <td className="px-4 py-3 text-tx2 font-mono text-xs">{d.host}:{d.api_port}</td>
                  <td className="px-4 py-3 text-tx3 text-xs">
                    {d.api_mode === 'rest' ? `REST${d.api_ssl ? 'S' : ''}` : `API${d.api_ssl ? '-SSL' : ''}`}
                    {!d.enabled && <span className="ml-2 text-warning">{t('pg_mikrotik.disabled')}</span>}
                  </td>
                  <td className="px-4 py-3 text-tx3 text-xs">
                    {!d.ping_enabled ? 'off' : d.ping_source === 'vps' ? t('pg_mikrotik.pingVpsShort') : `${d.ping_batch}/siklus`}
                  </td>
                  <td className="px-4 py-3">
                    {d.last_polled_at == null ? (
                      <span className="text-tx3 text-xs">{t('pg_mikrotik.notPolledYet')}</span>
                    ) : d.last_ok ? (
                      <span className="inline-flex items-center gap-1 text-success text-xs"><CheckCircle size={13} /> OK</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-danger text-xs" title={d.last_error}>
                        <XCircle size={13} /> {d.last_error?.slice(0, 40) || 'gagal'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums whitespace-nowrap">
                    {d.cpu_load == null ? <span className="text-tx3">—</span> : (
                      <div title={[d.board, d.ros_version && `RouterOS ${d.ros_version}`, d.ros_uptime && `uptime ${d.ros_uptime}`].filter(Boolean).join(' · ')}>
                        <span className={d.cpu_load >= 85 ? 'text-danger' : d.cpu_load >= 60 ? 'text-warning' : 'text-tx2'}>CPU {d.cpu_load}%</span>
                        {d.mem_used_pct != null && <span className="text-tx3"> · RAM {Math.round(d.mem_used_pct)}%</span>}
                        {d.temperature != null && <span className={d.temperature >= 70 ? 'text-danger' : 'text-tx3'}> · {d.temperature}°C</span>}
                        {d.ros_version && <div className="text-tx3">v{d.ros_version}{d.ros_uptime ? ` · ${d.ros_uptime}` : ''}</div>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-tx3 text-xs tabular-nums">
                    {d.last_polled_at ? new Date(d.last_polled_at).toLocaleTimeString('id-ID') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="icon" onClick={() => testDevice(d)}
                        disabled={testingId === d.id} title={t('pg_mikrotik.testConnectionCountSessions')}>
                        {testingId === d.id ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                      </Button>
                      {canManage && <>
                        <Button variant="icon" onClick={() => openEdit(d)} title="Edit"><Edit3 size={14} /></Button>
                        <Button variant="icon" title={t('pg_mikrotik.delete')}
                          onClick={async () => {
                            if (await confirm({ title: t('pg_mikrotik.deleteMikrotik'), message: t('pg_mikrotik.deleteMsg', { name: d.name }), variant: 'danger' }))
                              deleteMutation.mutate(d.id);
                          }}>
                          <Trash2 size={14} className="text-danger" />
                        </Button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="mt-4 text-xs text-tx3 flex items-start gap-2">
        {devices.some(d => d.enabled) ? <Wifi size={14} className="text-success shrink-0 mt-0.5" /> : <WifiOff size={14} className="shrink-0 mt-0.5" />}
        <span>
          Poller berjalan tiap ~45 detik: membaca <code className="text-tx2">/ppp/active</code> lalu ping per batch (round-robin).
          Garis ODP→ONU: <span className="text-success">{t('pg_mikrotik.greenLinkOk')}</span>, <span className="text-warning">{t('pg_mikrotik.yellowSlowLoss')}</span>, <span className="text-danger">{t('pg_mikrotik.redPingTimeout')}</span>, abu putus = tanpa sesi PPPoE.
        </span>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)}
        title={modal?.mode === 'edit' ? t('pg_mikrotik.editTitle', { name: modal.dev?.name }) : t('pg_mikrotik.addMikrotik')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label={t('pg_mikrotik.name')} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Mikrotik Area A" />
          <Input label={t('pg_mikrotik.hostIp')} value={form.host} onChange={e => set('host', e.target.value)} placeholder="10.10.10.1" />
          <Select label={t('pg_mikrotik.apiMode')} value={form.api_mode}
            onChange={e => set('api_mode', e.target.value as 'api' | 'rest')}
            options={[
              { value: 'api', label: t('pg_mikrotik.classicApi8728V6') },
              { value: 'rest', label: 'REST (:443/:80) — RouterOS v7' },
            ]} />
          <Input label="Port" type="number" value={form.api_port}
            onChange={e => set('api_port', parseInt(e.target.value) || 8728)} />
          <Input label="Username" value={form.api_user} onChange={e => set('api_user', e.target.value)} placeholder="nms-readonly" />
          <Input label={modal?.mode === 'edit' ? 'Password (kosongkan = tetap)' : 'Password'}
            type="password" value={form.api_password} onChange={e => set('api_password', e.target.value)} />
          <Select label={t('pg_mikrotik.pingSource')} value={form.ping_source}
            onChange={e => set('ping_source', e.target.value as 'mikrotik' | 'vps')}
            options={[
              { value: 'mikrotik', label: t('pg_mikrotik.pingFromRouter') },
              { value: 'vps', label: t('pg_mikrotik.pingFromVps') },
            ]} />
          {form.ping_source === 'vps' ? (
            <p className="text-xs text-tx3 self-end pb-1">{t('pg_mikrotik.pingVpsHint')}</p>
          ) : (
            <Input label={t('pg_mikrotik.pingEachCycle')} type="number" min={1} max={200} value={form.ping_batch}
              onChange={e => set('ping_batch', parseInt(e.target.value) || 25)} />
          )}
          <div className="flex items-end gap-4 pb-1">
            <label className="flex items-center gap-2 text-sm text-tx2 cursor-pointer">
              <input type="checkbox" checked={form.api_ssl} onChange={e => set('api_ssl', e.target.checked)} className="accent-accent" /> SSL
            </label>
            <label className="flex items-center gap-2 text-sm text-tx2 cursor-pointer">
              <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} className="accent-accent" /> Enabled
            </label>
            <label className="flex items-center gap-2 text-sm text-tx2 cursor-pointer">
              <input type="checkbox" checked={form.ping_enabled} onChange={e => set('ping_enabled', e.target.checked)} className="accent-accent" /> Ping
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={() => setModal(null)}>{t('pg_mikrotik.cancel')}</Button>
          <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.name || !form.host}>
            {saveMutation.isPending ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </div>
      </Modal>
      <VpsRoutesCard />
    </PageContainer>
  );
}

function VpsRoutesCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuper = !!user?.is_super_admin;
  const { data, refetch } = useQuery({ queryKey: ['vps-routes'], queryFn: api.vpsRoutes, enabled: isSuper });
  const [cidr, setCidr] = useState('');
  const [gw, setGw] = useState('');
  const [busy, setBusy] = useState(false);
  const [testIp, setTestIp] = useState('');
  const [testing, setTesting] = useState(false);
  if (!isSuper || !data) return null;
  const ready = data.helper === 'ok';
  const add = async (c = cidr, g = gw) => {
    setBusy(true);
    try {
      const r = await api.vpsRouteAdd({ cidr: c.trim(), gateway: g.trim() });
      if (r.success) { toast.success(t('pg_mikrotik.rtAdded', { cidr: r.route.cidr })); setCidr(''); setGw(''); refetch(); }
      else toast.error(r.message || 'Gagal');
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const del = async (id: number, c: string) => {
    if (!(await confirm({ title: t('pg_mikrotik.rtDelTitle', { cidr: c }), message: t('pg_mikrotik.rtDelMsg'), variant: 'warning' }))) return;
    const r = await api.vpsRouteDelete(id);
    if (r.success) { toast.success(t('pg_mikrotik.rtDeleted')); refetch(); } else toast.error(r.message || 'Gagal');
  };
  const test = async () => {
    setTesting(true);
    try {
      const r = await api.vpsRouteTest(testIp.trim());
      if (!r.success) toast.error(r.message || 'Gagal');
      else if (r.reachable) toast.success(t('pg_mikrotik.rtTestOk', { ip: testIp, rtt: r.ping.avg_rtt_ms ?? '-' }));
      else toast.warning(t('pg_mikrotik.rtTestFail', { ip: testIp }));
    } catch (e) { toast.error((e as Error).message); } finally { setTesting(false); }
  };
  const pending = data.suggestions.filter(s => !s.covered);
  return (
    <Card className="mt-4" icon={<Route size={16} />} title={t('pg_mikrotik.rtTitle')}>
      <p className="text-xs text-tx3 mb-3">{t('pg_mikrotik.rtHint')}</p>
      {!ready && (
        <div className="p-3 mb-3 rounded-lg bg-warning/10 border border-warning/30 text-xs space-y-1.5">
          <div className="text-warning font-medium">{data.helper === 'missing' ? t('pg_mikrotik.rtHelperMissing') : t('pg_mikrotik.rtHelperNoSudo')}</div>
          <code className="block p-2 rounded bg-bg2 font-mono text-tx1 break-all select-all">{data.setup_cmd}</code>
          <div className="text-tx3">{t('pg_mikrotik.rtHelperOnce')}</div>
        </div>
      )}
      {data.routes.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {data.routes.map(r => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-glass text-xs">
              <span className="font-mono text-tx1">{r.cidr} → {r.gateway}</span>
              <span className="flex items-center gap-3">
                {r.active === true ? <span className="text-success">{t('pg_mikrotik.rtActive')}</span>
                  : r.status === 'error' ? <span className="text-danger" title={r.last_error}>{t('pg_mikrotik.rtError')}</span>
                    : <span className="text-warning">{t('pg_mikrotik.rtInactive')}</span>}
                {ready && r.active !== true && (
                  <button className="text-accent hover:underline" onClick={() => api.vpsRouteApply(r.id).then(x => { if (x.success) toast.success(t('pg_mikrotik.rtApplied')); else toast.error(x.message); refetch(); })}>{t('pg_mikrotik.rtApply')}</button>
                )}
                <button className="text-danger hover:underline" onClick={() => del(r.id, r.cidr)}>{t('pg_mikrotik.rtDelete')}</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {pending.length > 0 && ready && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-tx2 mb-1">{t('pg_mikrotik.rtSuggest')}</div>
          <div className="space-y-1">
            {pending.map(s => (
              <div key={s.cidr + s.mikrotik_id} className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-glass text-xs">
                <span><span className="font-mono text-tx1">{s.cidr}</span> <span className="text-tx3">→ {s.gateway || '?'} · {s.router || '-'} · {t('pg_mikrotik.rtClients', { n: s.clients })}</span></span>
                {s.gateway
                  ? <Button variant="secondary" onClick={() => add(s.cidr, s.gateway)} disabled={busy}>{t('pg_mikrotik.rtUse')}</Button>
                  : <button className="text-accent hover:underline" onClick={() => setCidr(s.cidr)}>{t('pg_mikrotik.rtFill')}</button>}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <Input label={t('pg_mikrotik.rtCidr')} value={cidr} onChange={e => setCidr(e.target.value)} placeholder="10.10.0.0/16" />
        <Input label={t('pg_mikrotik.rtGateway')} value={gw} onChange={e => setGw(e.target.value)} placeholder="192.168.54.1" />
        <Button onClick={() => add()} disabled={!ready || busy || !cidr || !gw} icon={<Plus size={14} />}>{t('pg_mikrotik.rtAdd')}</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end mt-3">
        <Input label={t('pg_mikrotik.rtTestIp')} value={testIp} onChange={e => setTestIp(e.target.value)} placeholder="10.10.3.7" />
        <Button variant="secondary" onClick={test} disabled={testing || !testIp} icon={<Activity size={14} />}>{testing ? t('pg_mikrotik.rtTesting') : t('pg_mikrotik.rtTest')}</Button>
      </div>
      <p className="text-xs text-tx3 mt-3">{t('pg_mikrotik.rtMikrotikNote')}</p>
    </Card>
  );
}
