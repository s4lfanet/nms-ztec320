import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, ToggleLeft, ToggleRight, Server, Terminal, RefreshCw, Save, X } from 'lucide-react';
import { toast } from '../components/Toast';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, Select, CodeBlock, Skeleton } from '../components/ui';

interface ZtpConfig {
  ztp_enabled: boolean;
  ztp_vlans: number[];
  ztp_vlan_mode: string;
  ztp_profile: string;
  ztp_traffic_profile: string;
  ztp_epon_sla: string;
  ztp_allowed_olts: number[];
}

interface ZtpOptions {
  vlans: { vlan_id: number; name: string }[];
  tcont_profiles: string[];
  traffic_profiles: string[];
  sla_profiles: string[];
}

const DEFAULT_FORM: ZtpConfig = {
  ztp_enabled: false, ztp_vlans: [], ztp_vlan_mode: 'tag',
  ztp_profile: '', ztp_traffic_profile: '', ztp_epon_sla: '',
  ztp_allowed_olts: [],
};

export function AutoProvision() {
  const qc = useQueryClient();
  const [form, setForm] = useState<ZtpConfig>(DEFAULT_FORM);
  const [vlanSelect, setVlanSelect] = useState('');

  const { data: configData, isLoading } = useQuery({
    queryKey: ['ztp-config'],
    queryFn: async () => {
      const res = await fetch('/api/ztp-config', { credentials: 'include' });
      return res.json();
    },
  });

  const { data: optionsData } = useQuery({
    queryKey: ['ztp-options'],
    queryFn: async () => {
      const res = await fetch('/api/ztp-options', { credentials: 'include' });
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
  const options: ZtpOptions = optionsData?.success ? {
    vlans: optionsData.vlans || [],
    tcont_profiles: optionsData.tcont_profiles || [],
    traffic_profiles: optionsData.traffic_profiles || [],
    sla_profiles: optionsData.sla_profiles || [],
  } : { vlans: [], tcont_profiles: [], traffic_profiles: [], sla_profiles: [] };

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

  const addVlan = (id: number) => {
    if (!id || form.ztp_vlans.includes(id)) return;
    setForm(prev => ({ ...prev, ztp_vlans: [...prev.ztp_vlans, id].sort((a, b) => a - b) }));
  };
  const removeVlan = (id: number) => {
    setForm(prev => ({ ...prev, ztp_vlans: prev.ztp_vlans.filter(x => x !== id) }));
  };

  const vlanLabel = (id: number) => {
    const v = options.vlans.find(x => x.vlan_id === id);
    return v?.name ? `${id} (${v.name})` : String(id);
  };

  const profileOptions = (list: string[]) => [
    ...list.map(p => ({ value: p, label: p })),
    // allow values that were saved but are no longer in the OLT DB so they
    // don't silently disappear from the dropdown
    ...([] as { value: string; label: string }[]),
  ];
  const ensureOption = (list: string[], current: string) =>
    current && !list.includes(current) ? [...list, current].sort() : list;

  if (isLoading) return <Skeleton className="h-64" />;

  const tcontOpts = ensureOption(options.tcont_profiles, form.ztp_profile);
  const trafficOpts = ensureOption(options.traffic_profiles, form.ztp_traffic_profile);
  const slaOpts = ensureOption(options.sla_profiles, form.ztp_epon_sla);

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
            <p className="text-xs text-tx3 -mt-2 mb-4">Bot mengecek ONU baru tiap 1 menit saat aktif. VLAN & profile diambil dari data actual OLT (hasil sync).</p>

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

              <div className="border-t border-brd pt-4">
                <label className="label-sm mb-2 block">VLAN Internet (boleh lebih dari 1)</label>
                {form.ztp_vlans.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {form.ztp_vlans.map(v => (
                      <span key={v} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-accent/15 border border-accent/30 text-xs">
                        {vlanLabel(v)}
                        <button type="button" onClick={() => removeVlan(v)} disabled={!form.ztp_enabled}
                          className="text-tx3 hover:text-red-400 disabled:opacity-40"><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <select
                    value={vlanSelect}
                    onChange={e => setVlanSelect(e.target.value)}
                    disabled={!form.ztp_enabled || options.vlans.length === 0}
                    className="flex-1 rounded-lg border border-brd bg-glass px-3 py-2 text-sm disabled:opacity-50"
                  >
                    <option value="">{options.vlans.length === 0 ? '— sync OLT dulu —' : '— pilih VLAN —'}</option>
                    {options.vlans
                      .filter(v => !form.ztp_vlans.includes(v.vlan_id))
                      .map(v => (
                        <option key={v.vlan_id} value={v.vlan_id}>
                          {v.vlan_id}{v.name ? ` (${v.name})` : ''}
                        </option>
                      ))}
                  </select>
                  <Button variant="secondary" type="button"
                    disabled={!form.ztp_enabled || !vlanSelect}
                    onClick={() => { addVlan(Number(vlanSelect)); setVlanSelect(''); }}>
                    Tambah
                  </Button>
                </div>
                <p className="text-[10px] text-tx3 mt-1">Tiap VLAN akan dibuatkan satu service pada ONU yang ter-register.</p>
              </div>

              <div className="border-t border-brd pt-4">
                <Select label="Mode VLAN" value={form.ztp_vlan_mode}
                  onChange={e => setForm(f => ({ ...f, ztp_vlan_mode: e.target.value }))}
                  disabled={!form.ztp_enabled}
                  options={[{ value: 'tag', label: 'Tag (Standar)' }, { value: 'untag', label: 'Untag (Transparan)' }]} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-brd pt-4">
                <Select label="GPON Upload (TCONT)"
                  value={form.ztp_profile}
                  onChange={e => setForm(f => ({ ...f, ztp_profile: e.target.value }))}
                  disabled={!form.ztp_enabled}
                  options={profileOptions(tcontOpts)} />
                <Select label="GPON Download (Traffic)"
                  value={form.ztp_traffic_profile}
                  onChange={e => setForm(f => ({ ...f, ztp_traffic_profile: e.target.value }))}
                  disabled={!form.ztp_enabled}
                  options={profileOptions(trafficOpts)} />
                <Select label="EPON SLA"
                  value={form.ztp_epon_sla}
                  onChange={e => setForm(f => ({ ...f, ztp_epon_sla: e.target.value }))}
                  disabled={!form.ztp_enabled}
                  options={profileOptions(slaOpts)} />
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
