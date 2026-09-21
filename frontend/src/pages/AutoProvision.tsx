import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, ToggleLeft, ToggleRight, Server, Terminal, RefreshCw, Save } from 'lucide-react';
import { toast } from '../components/Toast';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, Input, Select, CodeBlock, Skeleton } from '../components/ui';

interface ZtpConfig {
  ztp_enabled: boolean;
  ztp_vlan: string;
  ztp_vlan_mode: string;
  ztp_profile: string;
  ztp_traffic_profile: string;
  ztp_epon_sla: string;
  ztp_allowed_olts: number[];
}

const DEFAULT_FORM: ZtpConfig = {
  ztp_enabled: false, ztp_vlan: '150', ztp_vlan_mode: 'tag',
  ztp_profile: 'UP-1G', ztp_traffic_profile: 'DOWN-1G', ztp_epon_sla: 'UP-1G',
  ztp_allowed_olts: [],
};

export function AutoProvision() {
  const qc = useQueryClient();
  const [form, setForm] = useState<ZtpConfig>(DEFAULT_FORM);

  const { data: configData, isLoading } = useQuery({
    queryKey: ['ztp-config'],
    queryFn: async () => {
      const res = await fetch('/api/ztp-config', { credentials: 'include' });
      return res.json();
    },
  });

  const { data: logData, refetch: refetchLogs, isFetching: loadingLogs } = useQuery({
    queryKey: ['ztp-logs'],
    queryFn: async () => {
      const res = await fetch('/api/ztp-logs', { credentials: 'include' });
      return res.json();
    },
    refetchInterval: form.ztp_enabled ? 10000 : false,
  });

  const olts: { id: number; name: string }[] = configData?.olts || [];

  useEffect(() => {
    if (configData?.config) setForm({ ...DEFAULT_FORM, ...configData.config });
  }, [configData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ztp-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Gagal menyimpan');
      return data;
    },
    onSuccess: (d) => { toast.success(d.message || 'Pengaturan disimpan'); qc.invalidateQueries({ queryKey: ['ztp-config'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleOlt = (id: number) => {
    setForm(prev => ({
      ...prev,
      ztp_allowed_olts: prev.ztp_allowed_olts.includes(id)
        ? prev.ztp_allowed_olts.filter(x => x !== id)
        : [...prev.ztp_allowed_olts, id],
    }));
  };

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <PageContainer className="max-w-6xl">
      <PageHeader
        icon={<Zap size={22} className="text-accent" />}
        title="Auto Provisioning (ZTP)"
        description="Registrasi otomatis modem GPON & EPON yang belum terkonfigurasi — tanpa perlu registrasi manual satu-satu."
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-5">
        <div className="xl:col-span-1">
          <Card
            title="Status Auto-Register"
            icon={<Server size={16} className="mr-2" />}
            action={
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, ztp_enabled: !f.ztp_enabled }))}
                className="text-accent transition-transform hover:scale-110"
                title={form.ztp_enabled ? 'Matikan' : 'Aktifkan'}
              >
                {form.ztp_enabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} className="text-tx3" />}
              </button>
            }
          >
            <p className="text-xs text-tx3 -mt-2 mb-4">Bot mengecek ONU baru tiap 1 menit saat aktif.</p>

            <div className="space-y-4">
              <div>
                <label className="label-sm mb-2 block">OLT yang Diizinkan (Target)</label>
                <div className="bg-black/20 border border-brd rounded-xl p-3 max-h-40 overflow-y-auto space-y-2">
                  {olts.map(o => (
                    <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer hover:text-accent transition-colors">
                      <input type="checkbox" checked={form.ztp_allowed_olts.includes(o.id)} onChange={() => toggleOlt(o.id)}
                        disabled={!form.ztp_enabled} className="rounded border-brd bg-glass" />
                      {o.name}
                    </label>
                  ))}
                  {olts.length === 0 && <p className="text-xs text-tx3 italic">Tidak ada OLT tersedia.</p>}
                </div>
                <div className="flex gap-3 mt-2">
                  <button type="button" disabled={!form.ztp_enabled} onClick={() => setForm(f => ({ ...f, ztp_allowed_olts: olts.map(o => o.id) }))}
                    className="text-[10px] text-accent hover:underline disabled:opacity-40">Pilih Semua</button>
                  <button type="button" disabled={!form.ztp_enabled} onClick={() => setForm(f => ({ ...f, ztp_allowed_olts: [] }))}
                    className="text-[10px] text-tx3 hover:underline disabled:opacity-40">Hapus Semua</button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-brd pt-4">
                <Input label="VLAN Internet" type="number" value={form.ztp_vlan}
                  onChange={e => setForm(f => ({ ...f, ztp_vlan: e.target.value }))}
                  disabled={!form.ztp_enabled} placeholder="mis. 150" />
                <Select label="Mode VLAN" value={form.ztp_vlan_mode}
                  onChange={e => setForm(f => ({ ...f, ztp_vlan_mode: e.target.value }))}
                  disabled={!form.ztp_enabled}
                  options={[{ value: 'tag', label: 'Tag (Standar)' }, { value: 'untag', label: 'Untag (Transparan)' }]} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-brd pt-4">
                <Input label="GPON Upload" value={form.ztp_profile}
                  onChange={e => setForm(f => ({ ...f, ztp_profile: e.target.value }))}
                  disabled={!form.ztp_enabled} placeholder="mis. UP-1G" />
                <Input label="GPON Download" value={form.ztp_traffic_profile}
                  onChange={e => setForm(f => ({ ...f, ztp_traffic_profile: e.target.value }))}
                  disabled={!form.ztp_enabled} placeholder="mis. DOWN-1G" />
                <Input label="EPON SLA" value={form.ztp_epon_sla}
                  onChange={e => setForm(f => ({ ...f, ztp_epon_sla: e.target.value }))}
                  disabled={!form.ztp_enabled} placeholder="mis. UP-1G" />
              </div>

              <Button variant="primary" className="w-full justify-center" loading={saveMutation.isPending}
                icon={<Save size={16} />} onClick={() => saveMutation.mutate()}>
                Simpan Pengaturan
              </Button>
            </div>
          </Card>
        </div>

        <div className="xl:col-span-2">
          <Card
            title="Live Logs"
            icon={<Terminal size={16} className="mr-2" />}
            action={
              <Button variant="icon" onClick={() => refetchLogs()} disabled={loadingLogs}>
                <RefreshCw size={14} className={loadingLogs ? 'animate-spin' : ''} />
              </Button>
            }
            bodyClassName="p-0"
          >
            <CodeBlock maxHeight="max-h-[520px]" className="rounded-t-none border-0 text-success">
              {logData?.logs || 'Menunggu proses log...'}
            </CodeBlock>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
