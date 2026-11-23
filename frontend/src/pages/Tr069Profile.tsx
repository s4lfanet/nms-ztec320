import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Server, Lock, Unlock, FileText, Globe, RefreshCw, Link2, CheckCircle2, XCircle, AlertTriangle, Layers, Play, Eye } from 'lucide-react';
import { api, type AcsBulkFilters, type AcsBulkJob } from '../lib/api';
import { toast } from '../components/Toast';
import { useHasPerm } from '../hooks/useHasPerm';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, EmptyState, Input, Modal, Select } from '../components/ui';
import { confirm as confirmDialog } from '../components/ConfirmDialog';
import { formatDate, timeAgo } from '../lib/utils';

interface Tr069Profile {
  id: number;
  name: string;
  acs_url: string;
  acs_username: string;
  acs_password: string;
  default_olt_id: number | null;
  vlan: number;
  vlan_mode: string; // 'tag' or 'untag'
  default_olt_name?: string | null;
}

export default function Tr069Profile() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const hasPerm = useHasPerm();
  const canManage = hasPerm('manage_tr069');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; profile?: Tr069Profile } | null>(null);
  const [showPass, setShowPass] = useState<Record<number, boolean>>({});

  const { data: profiles = [], isLoading } = useQuery<Tr069Profile[]>({
    queryKey: ['tr069-profiles'],
    queryFn: () => fetch('/api/tr069', { credentials: 'include' }).then(r => r.json()),
  });

  const { data: dashData } = useQuery({
    queryKey: ['olts'],
    queryFn: api.dashboard,
  });
  const olts = dashData?.olts || [];

  // Fetch VLAN list from first OLT (or all OLTs)
  const [vlanList, setVlanList] = useState<Array<{ vlan_id: number; name: string }>>([]);
  useEffect(() => {
    if (olts.length > 0) {
      fetch(`/api/olt/${olts[0].id}/vlans`, { credentials: 'include' })
        .then(r => r.json())
        .then(d => { if (d.vlans) setVlanList(d.vlans); })
        .catch(() => {});
    }
  }, [olts]);

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tr069/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(t('pg_tr069.deleteFailed'));
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tr069-profiles'] }); toast.success(t('pg_tr069.profileDeleted')); },
    onError: () => toast.error(t('pg_tr069.deleteFailed')),
  });

  return (
    <PageContainer>
      <PageHeader
        title={t('pg_tr069.tr069Profiles')}
        description={t('pg_tr069.manageAcsProfilesFor')}
        action={canManage && (
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setModal({ mode: 'add' })}>
            {t('ui.create')}
          </Button>
        )}
      />

      <GenieAcsSettings />
      <GenieAcsHealth />
      <AcsBulkOps />

      {/* Table */}
      <Card bodyClassName="p-0">
        {isLoading ? (
          <div className="p-8 text-center text-tx3 text-sm">{t('pg_tr069.loading')}</div>
        ) : profiles.length === 0 ? (
          <EmptyState icon={FileText} title={t('pg_tr069.noTr069ProfilesYet')} description={t('ui.createProfileHint')} />
        ) : (
          <>
          <table className="hidden md:table w-full text-sm">
            <thead>
              <tr className="border-b border-brd text-tx3 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">{t('pg_tr069.profileName')}</th>
                <th className="px-4 py-3 text-left">ACS URL</th>
                <th className="px-4 py-3 text-left">Username</th>
                <th className="px-4 py-3 text-left">Password</th>
                <th className="px-4 py-3 text-left">{t('pg_tr069.defaultOlt')}</th>
                <th className="px-4 py-3 text-left">VLAN</th>
                <th className="px-4 py-3 text-left">Mode</th>
                <th className="px-4 py-3 text-right">{t('pg_tr069.action')}</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p, i) => (
                <tr key={p.id} className="border-b border-brd/50 hover:bg-glass/30 transition-colors">
                  <td className="px-4 py-3 text-tx3">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-tx2 font-mono text-xs">{p.acs_url}</td>
                  <td className="px-4 py-3 text-tx2">{p.acs_username}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{showPass[p.id] ? p.acs_password : '••••••••'}</span>
                      <button onClick={() => setShowPass(s => ({ ...s, [p.id]: !s[p.id] }))} className="text-tx3 hover:text-tx1">
                        {showPass[p.id] ? <Unlock size={14} /> : <Lock size={14} />}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {p.default_olt_name ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-glass border border-brd text-xs">
                        <Server size={12} />
                        {p.default_olt_name}
                      </span>
                    ) : <span className="text-tx3">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{p.vlan_mode === 'tag' ? p.vlan : 'untag'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] border ${p.vlan_mode === 'tag' ? 'border-accent/30 text-accent bg-accent/5' : 'border-brd text-tx3'}`}>{p.vlan_mode === 'tag' ? 'Tag' : 'Untag'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {canManage && <button onClick={() => setModal({ mode: 'edit', profile: p })} className="p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-tx1" title="Edit">
                        <Pencil size={16} />
                      </button>}
                      {canManage && <button
                        onClick={() => { if (confirm(`Delete profile "${p.name}"?`)) deleteMut.mutate(p.id); }}
                        className="p-1.5 rounded-lg hover:bg-danger/10 text-tx3 hover:text-danger"
                        title={t('pg_tr069.delete')}
                      >
                        <Trash2 size={16} />
                      </button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-brd/50">
            {profiles.map((p, i) => (
              <div key={p.id} className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-tx3">#{i + 1}</span>
                      <span className="font-medium text-sm truncate">{p.name}</span>
                    </div>
                    <div className="text-xs text-tx3 font-mono mt-0.5 truncate">{p.acs_url}</div>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] border flex-shrink-0 ${p.vlan_mode === 'tag' ? 'border-accent/30 text-accent bg-accent/5' : 'border-brd text-tx3'}`}>{p.vlan_mode === 'tag' ? 'Tag' : 'Untag'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-tx3">User:</span> <span className="text-tx2">{p.acs_username}</span>
                  </div>
                  <div>
                    <span className="text-tx3">Pass:</span>{' '}
                    <span className="font-mono text-tx2">{showPass[p.id] ? p.acs_password : '••••••••'}</span>
                    <button onClick={() => setShowPass(s => ({ ...s, [p.id]: !s[p.id] }))} className="text-tx3 hover:text-tx1 ml-1 inline">
                      {showPass[p.id] ? <Unlock size={11} className="inline" /> : <Lock size={11} className="inline" />}
                    </button>
                  </div>
                  <div>
                    <span className="text-tx3">VLAN:</span> <span className="font-mono text-tx2">{p.vlan_mode === 'tag' ? p.vlan : 'untag'}</span>
                  </div>
                  <div>
                    <span className="text-tx3">OLT:</span>{' '}
                    {p.default_olt_name ? (
                      <span className="inline-flex items-center gap-1 text-tx2"><Server size={10} className="inline" /> {p.default_olt_name}</span>
                    ) : <span className="text-tx3">—</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-brd/30">
                  {canManage && <button onClick={() => setModal({ mode: 'edit', profile: p })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-glass text-xs text-tx2 hover:text-tx1 transition-colors">
                    <Pencil size={13} /> Edit
                  </button>}
                  {canManage && <button onClick={() => { if (confirm(`Delete profile "${p.name}"?`)) deleteMut.mutate(p.id); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-glass text-xs text-tx2 hover:text-danger transition-colors ml-auto">
                    <Trash2 size={13} />
                  </button>}
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </Card>

      {/* Add/Edit Modal */}
      {modal && (
        <Tr069Modal
          mode={modal.mode}
          profile={modal.profile}
          olts={olts.map((o: any) => ({ id: o.id, name: o.name }))}
          vlanList={vlanList}
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); qc.invalidateQueries({ queryKey: ['tr069-profiles'] }); toast.success(modal.mode === 'add' ? 'Profile created!' : 'Profile updated!'); }}
        />
      )}
    </PageContainer>
  );
}

function Tr069Modal({ mode, profile, olts, vlanList, onClose, onSuccess }: {
  mode: 'add' | 'edit';
  profile?: Tr069Profile;
  olts: { id: number; name: string }[];
  vlanList: Array<{ vlan_id: number; name: string }>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: profile?.name || '',
    acs_url: profile?.acs_url || '',
    acs_username: profile?.acs_username || '',
    acs_password: profile?.acs_password || '',
    vlan: profile?.vlan || 0,
    vlan_mode: profile?.vlan_mode || 'tag',
    default_olt_id: profile?.default_olt_id || null,
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.name || !form.acs_url) return;
    setSubmitting(true);
    try {
      const url = mode === 'add' ? '/api/tr069' : `/api/tr069/${profile!.id}`;
      const method = mode === 'add' ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(t('pg_tr069.failed'));
      onSuccess();
    } catch {
      toast.error(t('pg_tr069.failedToSaveProfile'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'add' ? 'Add TR069 Profile' : 'Edit TR069 Profile'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('pg_tr069.close')}</Button>
          <Button variant="primary" onClick={submit} loading={submitting} disabled={!form.name || !form.acs_url}>
            {submitting ? t('ui.saving') : t('ui.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label-sm mb-1">{t('pg_tr069.profileName')}</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" placeholder={t('pg_tr069.eGAcsSvr')} />
        </div>
        <div>
          <label className="label-sm mb-1">ACS URL</label>
          <input value={form.acs_url} onChange={e => setForm({ ...form, acs_url: e.target.value })} className="input-field" placeholder="e.g. http://10.10.10.100:7547" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label-sm mb-1">Username</label>
            <input value={form.acs_username} onChange={e => setForm({ ...form, acs_username: e.target.value })} className="input-field" placeholder="e.g. acs_admin" />
          </div>
          <div>
            <label className="label-sm mb-1">Password</label>
            <input value={form.acs_password} onChange={e => setForm({ ...form, acs_password: e.target.value })} className="input-field" placeholder="e.g. Admin@123" />
          </div>
        </div>
        <div>
          <label className="label-sm mb-1">VLAN</label>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="radio" checked={form.vlan_mode === 'tag'} onChange={() => setForm({ ...form, vlan_mode: 'tag' })} />
                Tag
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="radio" checked={form.vlan_mode === 'untag'} onChange={() => setForm({ ...form, vlan_mode: 'untag' })} />
                Untag
              </label>
            </div>
            {form.vlan_mode === 'tag' && (
              vlanList.length > 0 ? (
                <Select
                  value={form.vlan}
                  onChange={e => setForm({ ...form, vlan: parseInt(e.target.value) || 0 })}
                  className="flex-1"
                  options={[
                    { value: '0', label: t('pg_tr069.selectVlan') },
                    ...vlanList.map(v => ({ value: String(v.vlan_id), label: `${v.vlan_id} — ${v.name || '(unnamed)'}` })),
                  ]}
                />
              ) : (
                <input type="number" value={form.vlan} onChange={e => setForm({ ...form, vlan: parseInt(e.target.value) || 0 })} className="input-field flex-1" placeholder="1010" />
              )
            )}
          </div>
          {form.vlan_mode === 'untag' && <p className="text-xs text-tx3 mt-1">{t('pg_tr069.untagModeNoVlan')}</p>}
        </div>
        <Select
          label={t('pg_tr069.defaultOltOptional')}
          value={form.default_olt_id || ''}
          onChange={e => setForm({ ...form, default_olt_id: e.target.value ? parseInt(e.target.value) : null })}
          helperText="If selected, this profile will be automatically applied when registering an ONT on that OLT."
          options={[
            { value: '', label: t('pg_tr069.none') },
            ...olts.map(o => ({ value: String(o.id), label: o.name })),
          ]}
        />
      </div>
    </Modal>
  );
}

function GenieAcsSettings() {
  const { t } = useTranslation();
  const hasPerm = useHasPerm();
  const canManage = hasPerm('genieacs_manage');
  const [nbiUrl, setNbiUrl] = useState('');
  const [nbiUser, setNbiUser] = useState('');
  const [nbiPassword, setNbiPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const { data: cfg, isLoading } = useQuery({
    queryKey: ['genieacs-settings'],
    queryFn: api.genieacsGetSettings,
    enabled: canManage,
  });

  useEffect(() => {
    if (cfg) {
      setNbiUrl(cfg.nbi_url || '');
      setNbiUser(cfg.nbi_user || '');
      setHasPassword(!!cfg.has_password);
    }
  }, [cfg]);

  if (!canManage) return null;

  const save = async () => {
    setSaving(true);
    try {
      await api.genieacsSaveSettings({
        nbi_url: nbiUrl.trim(),
        nbi_user: nbiUser.trim(),
        ...(nbiPassword ? { nbi_password: nbiPassword } : {}),
      });
      setHasPassword(hasPassword || !!nbiPassword);
      setNbiPassword('');
      toast.success(t('pg_tr069.genieacsSettingsSaved'));
    } catch (e) {
      toast.error((e as Error).message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.genieacsTest();
      setTestResult(r.success
        ? { ok: true, text: `Terhubung — ${r.device_count} device terdeteksi` }
        : { ok: false, text: r.error || 'Koneksi gagal' });
    } catch (e) {
      setTestResult({ ok: false, text: (e as Error).message || 'Koneksi gagal' });
    } finally {
      setTesting(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.genieacsSync();
      toast.success(t('pg_tr069.syncDone', { matched: r.matched, total: r.total }));
      if (r.errors?.length) toast.error(t('pg_tr069.syncErrors', { n: r.errors.length }));
    } catch (e) {
      toast.error((e as Error).message || 'Sync gagal');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card
      icon={<Globe size={16} />}
      title="GenieACS Server (NBI)"
      action={testResult && (
        <span className={`text-xs inline-flex items-center gap-1 ${testResult.ok ? 'text-success' : 'text-danger'}`}>
          {testResult.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {testResult.text}
        </span>
      )}
    >
      <p className="text-xs text-tx3 mb-3">
        Hubungkan ke server GenieACS untuk panel TR-069 per ONU di View ONU (reboot, refresh params, set WiFi).
      </p>
      {isLoading ? (
        <div className="text-xs text-tx3">{t('pg_tr069.loading2')}</div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="NBI URL" value={nbiUrl} onChange={e => setNbiUrl(e.target.value)}
              placeholder="http://genieacs:7557" />
            <Input label={t('pg_tr069.usernameOptional')} value={nbiUser} onChange={e => setNbiUser(e.target.value)}
              placeholder="admin" />
            <Input label={hasPassword ? 'Password (tersimpan — isi untuk ganti)' : 'Password (opsional)'}
              type="password" value={nbiPassword} onChange={e => setNbiPassword(e.target.value)}
              placeholder={hasPassword ? '••••••••' : ''} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<Server size={14} />} onClick={save} loading={saving}>{t('pg_tr069.save')}</Button>
            <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={test} loading={testing}>{t('pg_tr069.testConnection')}</Button>
            <Button variant="secondary" icon={<Link2 size={14} />} onClick={sync} loading={syncing}>{t('pg_tr069.syncDevices')}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function GenieAcsHealth() {
  const { t } = useTranslation();
  const hasPerm = useHasPerm();
  const canManage = hasPerm('genieacs_manage');
  const { data: cfg } = useQuery({ queryKey: ['genieacs-settings'], queryFn: api.genieacsGetSettings, enabled: canManage });
  const on = !!cfg?.nbi_url;
  const faults = useQuery({ queryKey: ['genieacs-faults'], queryFn: api.genieacsFaults, enabled: on, refetchInterval: 120_000 });
  const stale = useQuery({ queryKey: ['genieacs-stale'], queryFn: api.genieacsStale, enabled: on, refetchInterval: 300_000 });
  if (!canManage || !on) return null;
  const fl = faults.data?.faults || [];
  const st = stale.data?.devices || [];
  const removeFault = async (id: string) => {
    if (!(await confirmDialog({ title: t('pg_tr069.faultDeleteTitle'), message: t('pg_tr069.faultDeleteMsg'), variant: 'warning' }))) return;
    const r = await api.genieacsDeleteFault(id);
    if (r.success) { toast.success(t('pg_tr069.faultDeleted')); faults.refetch(); } else toast.error(r.message);
  };
  return (
    <Card icon={<AlertTriangle size={16} />} title={t('pg_tr069.acsHealth')}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-semibold text-tx2 mb-1">{t('pg_tr069.staleTitle', { n: st.length, h: stale.data?.hours ?? 24 })}</div>
          <p className="text-xs text-tx3 mb-2">{t('pg_tr069.staleHint')}</p>
          {st.length === 0 ? <div className="text-xs text-success">{t('pg_tr069.staleNone')}</div> : (
            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {st.map(d => (
                <li key={d.onu_id} className="flex justify-between gap-2 text-xs">
                  <Link to={`/dashboard/onus/${d.onu_id}`} className="text-accent hover:underline truncate">{d.name || d.device_id}</Link>
                  <span className="text-tx3 shrink-0" title={formatDate(d.last_inform)}>{timeAgo(d.last_inform)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="text-xs font-semibold text-tx2 mb-1">{t('pg_tr069.faultTitle', { n: fl.length })}</div>
          <p className="text-xs text-tx3 mb-2">{t('pg_tr069.faultHint')}</p>
          {fl.length === 0 ? <div className="text-xs text-success">{t('pg_tr069.faultNone')}</div> : (
            <ul className="space-y-1.5 max-h-64 overflow-y-auto">
              {fl.map(f => (
                <li key={f._id} className="text-xs p-1.5 rounded bg-glass">
                  <div className="flex justify-between gap-2">
                    {f.onu_id ? <Link to={`/dashboard/onus/${f.onu_id}`} className="text-accent hover:underline truncate">{f.onu_name || f.device}</Link>
                      : <span className="truncate text-tx2">{f.device}</span>}
                    <button className="text-danger hover:underline shrink-0" onClick={() => removeFault(f._id)}>{t('pg_tr069.faultDelete')}</button>
                  </div>
                  <div className="text-tx3 break-words">[{f.code}] {f.message || f.channel} · {t('pg_tr069.faultRetries', { n: f.retries })}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

const BULK_ACTIONS = ['refresh', 'reboot', 'inform_interval', 'firmware', 'set_param'] as const;

function AcsBulkOps() {
  const { t } = useTranslation();
  const hasPerm = useHasPerm();
  const canManage = hasPerm('genieacs_manage');
  const { data: cfg } = useQuery({ queryKey: ['genieacs-settings'], queryFn: api.genieacsGetSettings, enabled: canManage });
  const on = canManage && !!cfg?.nbi_url;
  const { data: opt } = useQuery({ queryKey: ['acs-bulk-options'], queryFn: api.acsBulkOptions, enabled: on });
  const [f, setF] = useState<AcsBulkFilters>({ status: 'online' });
  const [action, setAction] = useState<typeof BULK_ACTIONS[number]>('refresh');
  const [seconds, setSeconds] = useState('3600');
  const [file, setFile] = useState('');
  const [param, setParam] = useState({ path: '', value: '', type: 'xsd:string' });
  const [pv, setPv] = useState<Awaited<ReturnType<typeof api.acsBulkPreview>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<AcsBulkJob | null>(null);
  const jobs = useQuery({
    queryKey: ['acs-bulk-jobs'], queryFn: api.acsBulkJobs, enabled: on,
    refetchInterval: q => (q.state.data?.jobs?.some(j => j.status === 'running') ? 3000 : false),
  });
  if (!on) return null;

  const setFilter = (patch: Partial<AcsBulkFilters>) => { setF(prev => ({ ...prev, ...patch })); setPv(null); };
  const params = (): Record<string, unknown> =>
    action === 'inform_interval' ? { seconds: parseInt(seconds) || 0 }
      : action === 'firmware' ? { file }
        : action === 'set_param' ? param : {};
  const preview = async () => {
    setBusy(true);
    try { setPv(await api.acsBulkPreview(f)); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const run = async () => {
    if (!pv) return;
    const label = t(`pg_tr069.bulkAct_${action}`);
    const ok = await confirmDialog({
      title: t('pg_tr069.bulkConfirmTitle', { action: label, n: pv.count }),
      message: t('pg_tr069.bulkConfirmMsg', { n: pv.count, stale: pv.stale }),
      confirmLabel: t('pg_tr069.bulkRunN', { n: pv.count }),
      variant: action === 'reboot' || action === 'firmware' || action === 'set_param' ? 'danger' : 'warning',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.acsBulkRun({ filters: f, action, params: params(), confirm_count: pv.count });
      if (r.success) { toast.success(t('pg_tr069.bulkStarted', { id: r.job.id })); setPv(null); jobs.refetch(); }
      else toast.error(r.message || 'Gagal');
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const nodeValue = f.node_type && f.node_id ? `${f.node_type}:${f.node_id}` : '';
  return (
    <Card icon={<Layers size={16} />} title={t('pg_tr069.bulkTitle')}>
      <p className="text-xs text-tx3 mb-3">{t('pg_tr069.bulkHint', { max: opt?.max ?? 500 })}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Select label="OLT" value={f.olt_id ? String(f.olt_id) : ''} onChange={e => setFilter({ olt_id: e.target.value ? Number(e.target.value) : undefined })}
          options={[{ value: '', label: t('pg_tr069.bulkAll') }, ...(opt?.olts || []).map(o => ({ value: String(o.id), label: o.name }))]} />
        <Select label={t('pg_tr069.bulkModel')} value={f.model || ''} onChange={e => setFilter({ model: e.target.value || undefined })}
          options={[{ value: '', label: t('pg_tr069.bulkAll') }, ...(opt?.models || []).map(m => ({ value: m, label: m }))]} />
        <Select label={t('pg_tr069.bulkNode')} value={nodeValue} onChange={e => {
          const [nt, id] = e.target.value.split(':');
          setFilter({ node_type: nt || undefined, node_id: id ? Number(id) : undefined });
        }} options={[{ value: '', label: t('pg_tr069.bulkAll') }, ...(opt?.nodes || []).map(n => ({ value: `${n.type}:${n.id}`, label: `${n.type.toUpperCase()} · ${n.name}` }))]} />
        <Select label={t('pg_tr069.bulkStatus')} value={f.status || 'online'} onChange={e => setFilter({ status: e.target.value })}
          options={[{ value: 'online', label: t('pg_tr069.bulkOnline') }, { value: 'all', label: t('pg_tr069.bulkAllStatus') }]} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
        <Select label={t('pg_tr069.bulkAction')} value={action} onChange={e => setAction(e.target.value as typeof action)}
          options={BULK_ACTIONS.map(a => ({ value: a, label: t(`pg_tr069.bulkAct_${a}`) }))} />
        {action === 'inform_interval' && (
          <Input label={t('pg_tr069.bulkSeconds')} type="number" min={60} max={86400} value={seconds} onChange={e => setSeconds(e.target.value)} />
        )}
        {action === 'firmware' && (
          <Select label={t('pg_tr069.bulkFile')} value={file} onChange={e => setFile(e.target.value)}
            options={[{ value: '', label: (opt?.files?.length ? t('pg_tr069.bulkPickFile') : t('pg_tr069.bulkNoFiles')) },
              ...(opt?.files || []).map(x => ({ value: x.name, label: `${x.name}${x.product_class ? ` (${x.product_class}${x.version ? ' ' + x.version : ''})` : ''}` }))]} />
        )}
        {action === 'set_param' && (<>
          <Input label={t('pg_tr069.bulkPath')} value={param.path} onChange={e => setParam({ ...param, path: e.target.value })} placeholder="InternetGatewayDevice.ManagementServer.PeriodicInformInterval" />
          <Input label={t('pg_tr069.bulkValue')} value={param.value} onChange={e => setParam({ ...param, value: e.target.value })} />
          <Select label={t('pg_tr069.bulkType')} value={param.type} onChange={e => setParam({ ...param, type: e.target.value })}
            options={['xsd:string', 'xsd:unsignedInt', 'xsd:int', 'xsd:boolean'].map(x => ({ value: x, label: x }))} />
        </>)}
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button variant="secondary" icon={<Eye size={14} />} onClick={preview} loading={busy && !pv}>{t('pg_tr069.bulkPreview')}</Button>
        {pv && pv.count > 0 && !pv.too_many && (
          <Button variant="primary" icon={<Play size={14} />} onClick={run} loading={busy}>{t('pg_tr069.bulkRunN', { n: pv.count })}</Button>
        )}
      </div>
      {pv && (
        <div className="mt-3 text-xs">
          <div className={pv.too_many ? 'text-danger' : 'text-tx2'}>
            {pv.too_many ? t('pg_tr069.bulkTooMany', { n: pv.count, max: pv.max }) : t('pg_tr069.bulkPreviewCount', { n: pv.count })}
            {pv.stale > 0 && <span className="text-warning"> · {t('pg_tr069.bulkStale', { n: pv.stale })}</span>}
          </div>
          {pv.count > 0 && (
            <div className="mt-1.5 max-h-48 overflow-y-auto space-y-0.5">
              {pv.items.map(i => (
                <div key={i.onu_id} className="flex justify-between gap-2 px-2 py-0.5 rounded bg-glass">
                  <Link to={`/dashboard/onus/${i.onu_id}`} className="text-accent hover:underline truncate">{i.name || i.onu_id}</Link>
                  <span className={i.stale ? 'text-warning shrink-0' : 'text-tx3 shrink-0'}>{i.olt} · {i.model || '-'}{i.stale ? ` · ${t('pg_tr069.bulkStaleTag')}` : ''}</span>
                </div>
              ))}
              {pv.count > pv.items.length && <div className="text-tx3">+{pv.count - pv.items.length}…</div>}
            </div>
          )}
        </div>
      )}
      {(jobs.data?.jobs?.length ?? 0) > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-tx2 mb-1">{t('pg_tr069.bulkHistory')}</div>
          <div className="space-y-1.5">
            {jobs.data!.jobs.slice(0, 8).map(j => {
              const pct = j.total ? Math.round(((j.done + j.queued + j.failed) / j.total) * 100) : 0;
              return (
                <div key={j.id} className="text-xs p-2 rounded bg-glass">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="text-tx1">#{j.id} {t(`pg_tr069.bulkAct_${j.action}`)} · {j.total} modem · {j.created_by}</span>
                    <span className="text-tx3">{t(`pg_tr069.bulkSt_${j.status}`)} · {formatDate(j.created_at)}</span>
                  </div>
                  <div className="h-1.5 rounded bg-bg2 mt-1 overflow-hidden"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
                  <div className="flex flex-wrap justify-between gap-2 mt-1">
                    <span className="text-tx3">{t('pg_tr069.bulkCounts', { done: j.done, queued: j.queued, failed: j.failed })}</span>
                    <span className="flex gap-3">
                      <button className="text-accent hover:underline" onClick={() => api.acsBulkJob(j.id).then(r => setDetail(r.job))}>{t('pg_tr069.bulkDetail')}</button>
                      {j.status === 'running' && <button className="text-danger hover:underline" onClick={() => api.acsBulkCancel(j.id).then(() => jobs.refetch())}>{t('pg_tr069.bulkCancel')}</button>}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `#${detail.id} ${t(`pg_tr069.bulkAct_${detail.action}`)}` : ''}>
        <div className="space-y-0.5 max-h-[60vh] overflow-y-auto text-xs">
          {(detail?.items || []).map((i, k) => (
            <div key={k} className="flex justify-between gap-2 px-2 py-1 rounded bg-glass">
              <span className="truncate">{i.name || i.onu_id}</span>
              <span className={i.status === 'failed' ? 'text-danger' : i.status === 'queued' ? 'text-warning' : i.status === 'done' ? 'text-success' : 'text-tx3'}
                title={i.message}>{t(`pg_tr069.bulkItem_${i.status}`)}{i.status === 'failed' && i.message ? `: ${i.message.slice(0, 60)}` : ''}</span>
            </div>
          ))}
        </div>
      </Modal>
    </Card>
  );
}
