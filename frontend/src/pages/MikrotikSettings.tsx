import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type MikrotikDevice } from '../lib/api';
import { useHasPerm } from '../hooks/useHasPerm';
import { toast } from '../components/Toast';
import { confirm } from '../components/ConfirmDialog';
import {
  Router, Plus, Trash2, Edit3, CheckCircle, XCircle,
  Loader2, Wifi, WifiOff, Zap,
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
}

const EMPTY: FormState = {
  name: '', host: '', api_mode: 'api', api_port: 8728, api_ssl: false,
  api_user: '', api_password: '', enabled: true, ping_enabled: true, ping_batch: 25,
};

export function MikrotikSettings() {
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
    onSuccess: () => { toast.success('Mikrotik tersimpan'); setModal(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.mikrotikDelete(id),
    onSuccess: () => { toast.success('Mikrotik dihapus'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openAdd = () => { setForm(EMPTY); setModal({ mode: 'add' }); };
  const openEdit = (d: MikrotikDevice) => {
    setForm({
      name: d.name, host: d.host, api_mode: d.api_mode, api_port: d.api_port,
      api_ssl: d.api_ssl, api_user: d.api_user, api_password: '',
      enabled: d.enabled, ping_enabled: d.ping_enabled, ping_batch: d.ping_batch,
    });
    setModal({ mode: 'edit', dev: d });
  };

  const testDevice = async (d: MikrotikDevice) => {
    setTestingId(d.id);
    try {
      const r = await api.mikrotikTest(d.id);
      if (r.success) toast.success(`${d.name}: connected — "${r.identity}", ${r.active_sessions} sesi PPPoE aktif`);
      else toast.error(`${d.name}: ${r.message}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Test gagal');
    } finally {
      setTestingId(null);
      invalidate();
    }
  };

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  if (!canManage) {
    return (
      <PageContainer>
        <EmptyState icon={Router} title="Akses ditolak"
          description="Anda tidak memiliki permission settings_ip_olts." />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Mikrotik PPPoE Servers"
        description="RouterOS devices dipoll untuk sesi PPPoE + ping client — mewarnai garis ODP→ONU di peta FTTH."
        action={canManage && (
          <Button onClick={openAdd} icon={<Plus size={16} />}>Tambah Mikrotik</Button>
        )}
      />

      {isLoading ? (
        <Card className="p-8 text-center"><Loader2 size={28} className="text-accent animate-spin mx-auto" /></Card>
      ) : devices.length === 0 ? (
        <EmptyState
          icon={Router}
          title="Belum ada Mikrotik"
          description="Tambahkan router PPPoE server agar garis ONU di peta menampilkan status link aktual."
          action={canManage && <Button onClick={openAdd} icon={<Plus size={16} />}>Tambah Mikrotik</Button>}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brd text-left">
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Host</th>
                <th className="px-4 py-3">API</th>
                <th className="px-4 py-3">Ping</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Terakhir Poll</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {devices.map(d => (
                <tr key={d.id} className="border-b border-brd/50 hover:bg-glass/50">
                  <td className="px-4 py-3 font-medium text-tx1">{d.name}</td>
                  <td className="px-4 py-3 text-tx2 font-mono text-xs">{d.host}:{d.api_port}</td>
                  <td className="px-4 py-3 text-tx3 text-xs">
                    {d.api_mode === 'rest' ? `REST${d.api_ssl ? 'S' : ''}` : `API${d.api_ssl ? '-SSL' : ''}`}
                    {!d.enabled && <span className="ml-2 text-warning">(disabled)</span>}
                  </td>
                  <td className="px-4 py-3 text-tx3 text-xs">
                    {d.ping_enabled ? `${d.ping_batch}/siklus` : 'off'}
                  </td>
                  <td className="px-4 py-3">
                    {d.last_polled_at == null ? (
                      <span className="text-tx3 text-xs">belum dipoll</span>
                    ) : d.last_ok ? (
                      <span className="inline-flex items-center gap-1 text-success text-xs"><CheckCircle size={13} /> OK</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-danger text-xs" title={d.last_error}>
                        <XCircle size={13} /> {d.last_error?.slice(0, 40) || 'gagal'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-tx3 text-xs tabular-nums">
                    {d.last_polled_at ? new Date(d.last_polled_at).toLocaleTimeString('id-ID') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="icon" onClick={() => testDevice(d)}
                        disabled={testingId === d.id} title="Test koneksi + hitung sesi">
                        {testingId === d.id ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                      </Button>
                      {canManage && <>
                        <Button variant="icon" onClick={() => openEdit(d)} title="Edit"><Edit3 size={14} /></Button>
                        <Button variant="icon" title="Hapus"
                          onClick={async () => {
                            if (await confirm({ title: 'Hapus Mikrotik', message: `Hapus "${d.name}"? Monitoring link-state untuk PPPoE server ini akan berhenti.`, variant: 'danger' }))
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
          Garis ODP→ONU: <span className="text-success">hijau = link OK</span>, <span className="text-warning">kuning = lambat/loss</span>, <span className="text-danger">merah = ping timeout</span>, abu putus = tanpa sesi PPPoE.
        </span>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)}
        title={modal?.mode === 'edit' ? `Edit ${modal.dev?.name}` : 'Tambah Mikrotik'}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Nama" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Mikrotik Area A" />
          <Input label="Host / IP" value={form.host} onChange={e => set('host', e.target.value)} placeholder="10.10.10.1" />
          <Select label="Mode API" value={form.api_mode}
            onChange={e => set('api_mode', e.target.value as 'api' | 'rest')}
            options={[
              { value: 'api', label: 'API klasik (:8728) — v6.43+/v7' },
              { value: 'rest', label: 'REST (:443/:80) — RouterOS v7' },
            ]} />
          <Input label="Port" type="number" value={form.api_port}
            onChange={e => set('api_port', parseInt(e.target.value) || 8728)} />
          <Input label="Username" value={form.api_user} onChange={e => set('api_user', e.target.value)} placeholder="nms-readonly" />
          <Input label={modal?.mode === 'edit' ? 'Password (kosongkan = tetap)' : 'Password'}
            type="password" value={form.api_password} onChange={e => set('api_password', e.target.value)} />
          <Input label="Ping per siklus" type="number" min={1} max={200} value={form.ping_batch}
            onChange={e => set('ping_batch', parseInt(e.target.value) || 25)} />
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
          <Button variant="ghost" onClick={() => setModal(null)}>Batal</Button>
          <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.name || !form.host}>
            {saveMutation.isPending ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </div>
      </Modal>
    </PageContainer>
  );
}
