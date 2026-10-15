import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '../components/Toast';
import { cn } from '../lib/utils';
import { useAuth } from '../stores/auth';
import {
  Bell, MessageCircle, Send, Settings, Shield, Save,
  ToggleLeft, ToggleRight, AlertTriangle, Radio, Wifi,
  Zap, Clock, RefreshCw, Smartphone, QrCode, LogOut, Loader2,
  Play, Square, Server, Activity, Cpu, Thermometer, CheckCircle2, Terminal
} from 'lucide-react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, Input, Select, Tabs, EmptyState } from '../components/ui';

type SectionKey = 'whatsapp' | 'rules' | 'telegram' | 'whatsapp_native' | 'cronjob';

export function AlertSettings() {
  const { user } = useAuth();
  const isSuperAdmin = !!user?.is_super_admin;
  const [activeSection, setActiveSection] = useState<SectionKey>('whatsapp');

  const { data: botData } = useQuery({
    queryKey: ['bot-config'],
    queryFn: async () => {
      const r = await fetch('/api/bot-config', { credentials: 'include' });
      return r.json();
    },
  });

  const { data: rulesData } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: async () => {
      const r = await fetch('/api/alert-rules', { credentials: 'include' });
      return r.json();
    },
  });

  const configs: Record<string, unknown>[] = botData?.configs || [];
  const waCfg = configs.find(c => c.bot_type === 'whatsapp');
  const tgCfg = configs.find(c => c.bot_type === 'telegram');
  const waNativeCfg = configs.find(c => c.bot_type === 'whatsapp_native');
  const rules: Record<string, unknown>[] = rulesData?.rules || [];
  const activeRulesCount = rules.filter(r => r.enabled).length;

  const activeWaProviderName = (() => {
    const provId = detectGatewayIdFromUrl(
      String(waCfg?.api_url || ''),
      String(waCfg?.provider || waCfg?.bot_token || '')
    );
    return WA_GATEWAYS.find(g => g.id === provId)?.name.split(' (')[0] || 'Fonnte';
  })();

  const allTabs = [
    { key: 'whatsapp' as const, label: 'WA Gateway', icon: <MessageCircle size={15} />, superAdmin: false },
    { key: 'rules' as const, label: 'Alert Rules', icon: <Shield size={15} />, superAdmin: false },
    { key: 'telegram' as const, label: 'Telegram Bot', icon: <Send size={15} />, superAdmin: false },
    { key: 'whatsapp_native' as const, label: 'WA Native (QR)', icon: <Smartphone size={15} />, superAdmin: true },
    { key: 'cronjob' as const, label: 'Scheduler & Zona Waktu', icon: <Clock size={15} />, superAdmin: true },
  ];
  const visibleTabs = allTabs.filter(tab => !tab.superAdmin || isSuperAdmin);

  return (
    <PageContainer>
      <PageHeader
        icon={<Bell size={20} className="text-accent" />}
        title="Alert & Notification Channels"
        description="Atur parameter deteksi gangguan optik OLT/ONU serta integrasi pengiriman pesan ke WhatsApp Gateway dan Telegram."
      />

      {/* Channel Overview Strip — clickable to jump between sections */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
        <button
          type="button"
          onClick={() => setActiveSection('whatsapp')}
          className={cn(
            'glass-card p-3.5 text-left transition-all flex items-start justify-between gap-3',
            activeSection === 'whatsapp' && 'border-accent/60 ring-1 ring-accent/30'
          )}
        >
          <div className="min-w-0">
            <div className="text-xs text-tx3 font-medium">WA Gateway</div>
            <div className="text-sm font-semibold text-tx1 mt-1 truncate">
              {waCfg?.enabled ? activeWaProviderName : 'Nonaktif'}
            </div>
            <div className="text-[11px] text-tx3 mt-0.5 truncate font-mono">
              {waCfg?.phone_number ? String(waCfg.phone_number) : 'Belum ada nomor tujuan'}
            </div>
          </div>
          <span className={cn(
            'w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0',
            waCfg?.enabled ? 'bg-success' : 'bg-offline'
          )} />
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('rules')}
          className={cn(
            'glass-card p-3.5 text-left transition-all flex items-start justify-between gap-3',
            activeSection === 'rules' && 'border-accent/60 ring-1 ring-accent/30'
          )}
        >
          <div className="min-w-0">
            <div className="text-xs text-tx3 font-medium">Alert Rules</div>
            <div className="text-sm font-semibold text-tx1 mt-1 tabular-nums">
              {activeRulesCount} dari {rules.length || 1} aktif
            </div>
            <div className="text-[11px] text-tx3 mt-0.5 truncate">
              LOS · DyingGasp · RX dBm · OLT
            </div>
          </div>
          <span className={cn(
            'w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0',
            activeRulesCount > 0 ? 'bg-success' : 'bg-offline'
          )} />
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('telegram')}
          className={cn(
            'glass-card p-3.5 text-left transition-all flex items-start justify-between gap-3',
            activeSection === 'telegram' && 'border-accent/60 ring-1 ring-accent/30'
          )}
        >
          <div className="min-w-0">
            <div className="text-xs text-tx3 font-medium">Telegram Bot</div>
            <div className="text-sm font-semibold text-tx1 mt-1">
              {tgCfg?.enabled ? 'Terhubung' : 'Nonaktif'}
            </div>
            <div className="text-[11px] text-tx3 mt-0.5 truncate font-mono">
              {tgCfg?.chat_id ? `Chat ${String(tgCfg.chat_id)}` : 'Chat ID belum diisi'}
            </div>
          </div>
          <span className={cn(
            'w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0',
            tgCfg?.enabled ? 'bg-success' : 'bg-offline'
          )} />
        </button>

        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setActiveSection('whatsapp_native')}
            className={cn(
              'glass-card p-3.5 text-left transition-all flex items-start justify-between gap-3',
              activeSection === 'whatsapp_native' && 'border-accent/60 ring-1 ring-accent/30'
            )}
          >
            <div className="min-w-0">
              <div className="text-xs text-tx3 font-medium">WA Native (Baileys)</div>
              <div className="text-sm font-semibold text-tx1 mt-1">
                {waNativeCfg?.enabled ? 'Diaktifkan' : 'Standby / Off'}
              </div>
              <div className="text-[11px] text-tx3 mt-0.5 truncate">
                Self-hosted QR Session
              </div>
            </div>
            <span className={cn(
              'w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0',
              waNativeCfg?.enabled ? 'bg-success' : 'bg-offline'
            )} />
          </button>
        )}
      </div>

      <Tabs
        tabs={visibleTabs}
        active={activeSection}
        onChange={(key) => setActiveSection(key as SectionKey)}
      />

      {activeSection === 'rules' && <AlertRulesSection />}
      {activeSection === 'telegram' && <TelegramSection />}
      {activeSection === 'whatsapp' && (
        <WhatsAppSection
          isSuperAdmin={isSuperAdmin}
          onSwitchToNative={() => setActiveSection('whatsapp_native')}
        />
      )}
      {activeSection === 'whatsapp_native' && isSuperAdmin && (
        <WhatsAppNativeSection onSwitchToGateway={() => setActiveSection('whatsapp')} />
      )}
      {activeSection === 'cronjob' && isSuperAdmin && <CronjobSection />}
    </PageContainer>
  );
}

/* ─── Alert Rules Section ─── */

function AlertRulesSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: async () => { const r = await fetch('/api/alert-rules', { credentials: 'include' }); return r.json(); },
  });

  const updateMut = useMutation({
    mutationFn: async (rule: Record<string, unknown>) => {
      const r = await fetch(`/api/alert-rules/${rule.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(rule),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.message || 'Gagal memperbarui rule');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert-rules'] });
      toast.success('Aturan alert berhasil disimpan');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <TabSkeleton />;

  const rules: Record<string, unknown>[] = data?.rules || [];

  return (
    <div className="space-y-4">
      {rules.length === 0 && (
        <EmptyState
          icon={Bell}
          title="Belum ada aturan alert"
          description="Aturan alert dibuat otomatis saat inisialisasi sistem."
        />
      )}
      {rules.map((rule) => (
        <RuleCard key={String(rule.id)} rule={rule} onSave={(r) => updateMut.mutate(r)} saving={updateMut.isPending} />
      ))}
    </div>
  );
}

function RuleCard({
  rule,
  onSave,
  saving,
}: {
  rule: Record<string, unknown>;
  onSave: (r: Record<string, unknown>) => void;
  saving?: boolean;
}) {
  const [editing, setEditing] = useState(true);
  const [form, setForm] = useState({ ...rule });

  useEffect(() => {
    setForm({ ...rule });
  }, [rule]);

  const toggleField = (field: string) => {
    setForm(prev => ({ ...prev, [field]: !prev[field] }));
  };

  return (
    <Card
      icon={
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center border',
          form.enabled ? 'bg-success/10 border-success/25 text-success' : 'bg-glass border-brd text-tx3'
        )}>
          <Shield size={16} />
        </div>
      }
      title={String(rule.name || 'Default Alert Rule')}
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const newEnabled = !form.enabled;
              setForm(prev => ({ ...prev, enabled: newEnabled }));
              onSave({ ...form, enabled: newEnabled });
            }}
            className={cn(
              'px-3 py-1 rounded-md text-xs font-medium border transition-colors',
              form.enabled
                ? 'bg-success/10 border-success/30 text-success'
                : 'bg-glass border-brd text-tx3'
            )}
          >
            {form.enabled ? 'Rule Aktif' : 'Nonaktif'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className="px-2.5 py-1 rounded-md border border-brd bg-glass hover:border-accent/40 text-xs text-tx2 transition-colors inline-flex items-center gap-1.5"
          >
            <Settings size={13} />
            <span>{editing ? 'Tutup Detail' : 'Konfigurasi'}</span>
          </button>
        </div>
      }
    >
      {!editing ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-tx2">
          <div className="flex flex-wrap items-center gap-2">
            <span>Ambang RX: <strong className="font-mono text-tx1 tabular-nums">{String(form.rx_threshold ?? -27)} dBm</strong></span>
            <span className="text-tx3">·</span>
            <span>Delta RX: <strong className="font-mono text-tx1 tabular-nums">{String(form.rx_change_threshold ?? 3)} dB</strong></span>
            <span className="text-tx3">·</span>
            <span>CPU/Mem/Temp OLT: <strong className="font-mono text-tx1 tabular-nums">{String(form.olt_cpu_threshold ?? 80)}% / {String(form.olt_memory_threshold ?? 80)}% / {String(form.olt_temp_threshold ?? 60)}°C</strong></span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Boolean(form.notify_bell) && <span className="badge badge-info">In-App Bell</span>}
            {Boolean(form.notify_whatsapp) && <span className="badge badge-success">WA Gateway</span>}
            {Boolean(form.notify_telegram) && <span className="badge badge-accent">Telegram</span>}
            {Boolean(form.notify_whatsapp_native) && <span className="badge badge-neutral">WA Native</span>}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left column: ONU & Optical Detection */}
          <div className="lg:col-span-6 space-y-4">
            <div className="p-3.5 rounded-lg bg-glass/60 border border-brd space-y-3">
              <div>
                <h4 className="text-xs font-semibold text-tx1"> Kondisi Gangguan ONU &amp; Optik</h4>
                <p className="text-xs text-tx3 mt-0.5">Pilih kejadian status ONU yang memicu pengiriman notifikasi.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { key: 'check_los', label: 'LOS (Putus Optik)', icon: <Radio size={14} /> },
                  { key: 'check_dyinggasp', label: 'DyingGasp (Mati Listrik)', icon: <Zap size={14} /> },
                  { key: 'check_offline', label: 'ONU Offline', icon: <Wifi size={14} /> },
                  { key: 'check_rx_power', label: 'Redaman RX Tinggi', icon: <AlertTriangle size={14} /> },
                ].map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => toggleField(item.key)}
                    className={cn(
                      'flex items-center gap-2.5 p-2.5 rounded-lg border text-xs font-medium transition-colors',
                      form[item.key]
                        ? 'border-accent/50 bg-accent/10 text-tx1'
                        : 'border-brd bg-surface/60 text-tx3 hover:text-tx2'
                    )}
                  >
                    <span className={cn(form[item.key] ? 'text-accent' : 'text-tx3')}>{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {form[item.key] ? <ToggleRight size={18} className="text-accent flex-shrink-0" /> : <ToggleLeft size={18} className="flex-shrink-0" />}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-brd/70">
                <Input
                  label="Ambang Batas RX Power (dBm)"
                  type="number"
                  step="0.5"
                  value={String(form.rx_threshold ?? -27)}
                  onChange={e => setForm({ ...form, rx_threshold: parseFloat(e.target.value) })}
                  helperText="Contoh: -27 dBm (alert bila lebih rendah)"
                />
                <Input
                  label="Lonjakan Redaman RX (dB)"
                  type="number"
                  step="0.5"
                  value={String(form.rx_change_threshold ?? 3)}
                  onChange={e => setForm({ ...form, rx_change_threshold: parseFloat(e.target.value) })}
                  helperText="Selisih penurunan mendadak"
                />
              </div>
            </div>
          </div>

          {/* Right column: OLT Health & Delivery Channels */}
          <div className="lg:col-span-6 space-y-4">
            <div className="p-3.5 rounded-lg bg-glass/60 border border-brd space-y-3">
              <div>
                <h4 className="text-xs font-semibold text-tx1">Kesehatan Sasis &amp; Sistem OLT</h4>
                <p className="text-xs text-tx3 mt-0.5">Deteksi dini gangguan perangkat OLT utama (keterjangkauan, beban CPU, RAM, suhu).</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { key: 'check_olt_offline', label: 'OLT Unreachable / Down', icon: <Server size={14} /> },
                  { key: 'check_olt_cpu', label: 'Beban CPU Tinggi', icon: <Activity size={14} /> },
                  { key: 'check_olt_memory', label: 'Penggunaan RAM Tinggi', icon: <Cpu size={14} /> },
                  { key: 'check_olt_temperature', label: 'Suhu Sasis Tinggi', icon: <Thermometer size={14} /> },
                ].map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => toggleField(item.key)}
                    className={cn(
                      'flex items-center gap-2.5 p-2.5 rounded-lg border text-xs font-medium transition-colors',
                      form[item.key]
                        ? 'border-accent/50 bg-accent/10 text-tx1'
                        : 'border-brd bg-surface/60 text-tx3 hover:text-tx2'
                    )}
                  >
                    <span className={cn(form[item.key] ? 'text-accent' : 'text-tx3')}>{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {form[item.key] ? <ToggleRight size={18} className="text-accent flex-shrink-0" /> : <ToggleLeft size={18} className="flex-shrink-0" />}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-brd/70">
                <Input
                  label="Batas CPU (%)"
                  type="number"
                  value={String(form.olt_cpu_threshold ?? 80)}
                  onChange={e => setForm({ ...form, olt_cpu_threshold: parseFloat(e.target.value) })}
                />
                <Input
                  label="Batas Memory (%)"
                  type="number"
                  value={String(form.olt_memory_threshold ?? 80)}
                  onChange={e => setForm({ ...form, olt_memory_threshold: parseFloat(e.target.value) })}
                />
                <Input
                  label="Batas Suhu (°C)"
                  type="number"
                  value={String(form.olt_temp_threshold ?? 60)}
                  onChange={e => setForm({ ...form, olt_temp_threshold: parseFloat(e.target.value) })}
                />
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-glass/60 border border-brd space-y-2.5">
              <div>
                <h4 className="text-xs font-semibold text-tx1">Saluran Pengiriman Alert</h4>
                <p className="text-xs text-tx3 mt-0.5">Pilih tujuan pengiriman saat aturan ini mendeteksi anomali.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { key: 'notify_bell', label: 'In-App Bell' },
                  { key: 'notify_whatsapp', label: 'WA Gateway' },
                  { key: 'notify_telegram', label: 'Telegram' },
                  { key: 'notify_whatsapp_native', label: 'WA Native' },
                ].map(ch => (
                  <button
                    key={ch.key}
                    type="button"
                    onClick={() => toggleField(ch.key)}
                    className={cn(
                      'flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors',
                      form[ch.key]
                        ? 'border-accent/50 bg-accent/10 text-tx1'
                        : 'border-brd bg-surface/60 text-tx3 hover:text-tx2'
                    )}
                  >
                    <span className="truncate">{ch.label}</span>
                    {form[ch.key] ? <ToggleRight size={16} className="text-accent flex-shrink-0" /> : <ToggleLeft size={16} className="flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <div className="lg:col-span-12 flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-brd">
            <Button variant="secondary" onClick={() => { setForm({ ...rule }); setEditing(false); }}>
              Batal
            </Button>
            <Button variant="primary" icon={<Save size={15} />} loading={saving} onClick={() => onSave(form)}>
              Simpan Aturan Alert
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─── Telegram Section ─── */

function TelegramSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['bot-config'],
    queryFn: async () => { const r = await fetch('/api/bot-config', { credentials: 'include' }); return r.json(); },
  });
  const qc = useQueryClient();
  const tgConfig = data?.configs?.find((c: Record<string, unknown>) => c.bot_type === 'telegram') || {};
  const [form, setForm] = useState({ enabled: false, bot_token: '', chat_id: '' });
  const [editing, setEditing] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (data?.configs) {
      const cfg = data.configs.find((c: Record<string, unknown>) => c.bot_type === 'telegram');
      if (cfg) {
        setForm({
          enabled: !!cfg.enabled,
          bot_token: String(cfg.bot_token || ''),
          chat_id: String(cfg.chat_id || ''),
        });
      }
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { enabled: form.enabled, chat_id: form.chat_id.trim() };
      if (form.bot_token && !form.bot_token.includes('...') && form.bot_token !== '***') {
        payload.bot_token = form.bot_token.trim();
      }
      const r = await fetch('/api/bot-config/telegram', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(payload),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bot-config'] });
      qc.invalidateQueries({ queryKey: ['alert-rules'] });
      toast.success('Konfigurasi Telegram berhasil disimpan');
      setEditing(false);
    },
  });

  if (isLoading) return <TabSkeleton />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      <Card
        className="lg:col-span-7"
        icon={
          <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Send size={15} className="text-accent" />
          </div>
        }
        title="Konfigurasi Telegram Bot"
        action={
          <span className={cn(
            'badge',
            tgConfig.enabled ? 'badge-success' : 'badge-neutral'
          )}>
            {tgConfig.enabled ? 'Aktif' : 'Nonaktif'}
          </span>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-glass border border-brd">
            <div>
              <div className="text-sm font-medium text-tx1">Aktifkan Notifikasi Telegram</div>
              <div className="text-xs text-tx3">Teruskan alarm ONU/OLT ke grup atau chat pribadi Telegram</div>
            </div>
            <button
              type="button"
              onClick={() => { setForm({ ...form, enabled: !form.enabled }); setEditing(true); }}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors flex-shrink-0',
                form.enabled
                  ? 'bg-success/15 border-success/30 text-success'
                  : 'bg-surface border-brd text-tx3'
              )}
            >
              {form.enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <Input
            label={
              <>
                Bot Token{' '}
                {Boolean(tgConfig.has_bot_token) && (
                  <span className="text-success font-normal text-xs">(Tersimpan — isi baru jika ingin mengganti)</span>
                )}
              </>
            }
            type="password"
            value={form.bot_token}
            onChange={e => { setForm({ ...form, bot_token: e.target.value }); setEditing(true); }}
            placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
            helperText="Token HTTP API dari @BotFather di Telegram"
          />

          <Input
            label="Chat ID / Group ID"
            value={form.chat_id}
            onChange={e => { setForm({ ...form, chat_id: e.target.value }); setEditing(true); }}
            placeholder="-1001234567890 (grup/channel) atau 123456789 (personal)"
            helperText="Gunakan tanda minus (-100...) untuk Supergroup atau Channel"
          />

          <div className="flex flex-wrap gap-2 pt-2 border-t border-brd">
            <Button
              variant="primary"
              icon={<Save size={15} />}
              loading={saveMut.isPending}
              disabled={!editing && Boolean(tgConfig.id)}
              onClick={() => saveMut.mutate()}
            >
              Simpan Konfigurasi
            </Button>
            <Button
              variant="secondary"
              icon={<Send size={15} />}
              loading={testing}
              disabled={(!form.bot_token && !tgConfig.has_bot_token) || !form.chat_id}
              onClick={async () => {
                setTesting(true);
                try {
                  const r = await fetch('/api/bot-config/telegram/test', { method: 'POST', credentials: 'include' });
                  const d = await r.json();
                  if (d.success) toast.success('Pesan test terkirim ke Telegram!');
                  else toast.error(d.message || 'Gagal mengirim pesan test');
                } catch {
                  toast.error('Gagal mengirim pesan test');
                }
                setTesting(false);
              }}
            >
              Kirim Pesan Test
            </Button>
          </div>
        </div>
      </Card>

      <Card
        className="lg:col-span-5"
        title="Panduan Integrasi Telegram"
      >
        <ol className="list-decimal ml-4 space-y-2.5 text-xs text-tx2 leading-relaxed">
          <li>Buka aplikasi Telegram dan cari akun resmi <code className="font-mono text-tx1 bg-glass px-1.5 py-0.5 rounded">@BotFather</code>.</li>
          <li>Kirim perintah <code className="font-mono text-tx1 bg-glass px-1.5 py-0.5 rounded">/newbot</code> lalu ikuti instruksi untuk mendapatkan <strong>Bot Token</strong>.</li>
          <li>Undang bot yang baru dibuat ke grup NOC/Teknisi Anda dan kirimkan minimal satu pesan di grup.</li>
          <li>Gunakan <code className="font-mono text-tx1 bg-glass px-1.5 py-0.5 rounded">@raw_data_bot</code> atau <code className="font-mono text-tx1 bg-glass px-1.5 py-0.5 rounded">@userinfobot</code> untuk mengetahui <strong>Chat ID</strong> grup tersebut.</li>
          <li>Simpan konfigurasi terlebih dahulu, lalu tekan <strong>Kirim Pesan Test</strong> untuk memverifikasi.</li>
        </ol>
      </Card>
    </div>
  );
}

/* ─── WhatsApp Gateway Section (Multi-Provider) ─── */

interface WaGatewayDef {
  id: string;
  name: string;
  group: 'id' | 'self' | 'intl';
  tag?: string;
  protocol: string;
  authHeader: string;
  url: string;
  tokenLabel: string;
  tokenPlaceholder: string;
  tokenRequired?: boolean;
  senderLabel?: string;
  senderPlaceholder?: string;
  senderHelper?: string;
  phonePlaceholder: string;
  samplePayload: string;
  steps: string[];
}

const WA_GATEWAYS: WaGatewayDef[] = [
  {
    id: 'fonnte',
    name: 'Fonnte',
    group: 'id',
    tag: 'Populer',
    protocol: 'POST application/x-www-form-urlencoded',
    authHeader: 'Authorization: <Device_Token>',
    url: 'https://api.fonnte.com/send',
    tokenLabel: 'Device Token Fonnte',
    tokenPlaceholder: 'Paste Token Device dari dashboard md.fonnte.com',
    tokenRequired: true,
    phonePlaceholder: '6281234567890 atau 62811xxx,62812xxx',
    samplePayload: 'target=6281234567890&message=...&countryCode=62',
    steps: [
      'Login ke md.fonnte.com → menu Devices → Add Device dan scan QR WhatsApp.',
      'Klik tombol Token pada device yang berstatus Connect, lalu tempelkan ke kolom Device Token.',
      'Isi nomor tujuan (bisa beberapa nomor dipisahkan koma atau Group ID @g.us).',
      'Tekan Kirim Pesan Test untuk verifikasi langsung, lalu Simpan Konfigurasi.',
    ],
  },
  {
    id: 'wablas',
    name: 'Wablas',
    group: 'id',
    tag: 'Populer',
    protocol: 'POST application/json',
    authHeader: 'Authorization: <Token>.<SecretKey>',
    url: 'https://bdg.wablas.com/api/send-message',
    tokenLabel: 'API Token Wablas',
    tokenPlaceholder: 'Token dari menu Device → Settings di wablas.com',
    tokenRequired: true,
    senderLabel: 'Secret Key Wablas (Opsional untuk v2)',
    senderPlaceholder: 'Kosongkan bila sudah digabung token.secret_key',
    senderHelper: 'Sesuaikan subdomain API URL dengan server Wablas Anda (bdg, pati, solo, jogja, kudus, sg)',
    phonePlaceholder: '6281234567890',
    samplePayload: '{"phone": "6281234567890", "message": "..."}',
    steps: [
      'Login ke dashboard Wablas → pastikan status perangkat Connected.',
      'Sesuaikan subdomain pada API URL dengan server Wablas akun Anda (mis. pati.wablas.com).',
      'Salin Token dan Secret Key (untuk Wablas v2) ke kolom di samping.',
      'Masukkan nomor tujuan (628xxx), uji dengan Kirim Pesan Test lalu Simpan.',
    ],
  },
  {
    id: 'mpwa',
    name: 'MPWA (M-Pedia)',
    group: 'id',
    tag: 'ISP',
    protocol: 'POST application/json',
    authHeader: 'Body api_key + Bearer Header',
    url: 'https://wa.domain-anda.com/send-message',
    tokenLabel: 'API Key MPWA',
    tokenPlaceholder: 'API Key dari menu Rest API / Pengaturan MPWA',
    tokenRequired: true,
    senderLabel: 'Nomor Pengirim (Sender Device)',
    senderPlaceholder: '6281234567890 (nomor WA yang ter-scan di MPWA)',
    senderHelper: 'Wajib diisi sesuai nomor perangkat pengirim yang terdaftar pada panel MPWA',
    phonePlaceholder: '6281234567890',
    samplePayload: '{"api_key": "...", "sender": "62811...", "number": "62812...", "message": "..."}',
    steps: [
      'Buka panel MPWA Anda dan pastikan perangkat pengirim sudah berstatus Connected.',
      'Ganti API URL dengan domain MPWA Anda diakhiri /send-message.',
      'Salin API Key dan isi Nomor Pengirim (Sender) sesuai nomor yang terdaftar di MPWA.',
      'Masukkan nomor tujuan, klik Kirim Pesan Test lalu Simpan Konfigurasi.',
    ],
  },
  {
    id: 'starsender',
    name: 'Starsender',
    group: 'id',
    protocol: 'POST application/json',
    authHeader: 'apikey: <Device_API_Key>',
    url: 'https://api.starsender.online/api/send',
    tokenLabel: 'Device API Key Starsender',
    tokenPlaceholder: 'API Key dari menu Device Starsender',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    samplePayload: '{"messageType": "text", "to": "6281234567890", "body": "..."}',
    steps: [
      'Login ke Starsender → pilih Device yang sudah tertaut.',
      'Salin Device API Key lalu masukkan ke kolom Token.',
      'Isi nomor tujuan (628xxx), klik Kirim Pesan Test lalu Simpan.',
    ],
  },
  {
    id: 'onesender',
    name: 'OneSender',
    group: 'id',
    protocol: 'POST application/json',
    authHeader: 'Authorization: Bearer <API_Key>',
    url: 'https://onesender.domain-anda.com/api/v1/messages',
    tokenLabel: 'API Key OneSender',
    tokenPlaceholder: 'API Key dari dashboard OneSender',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    samplePayload: '{"recipient_type": "individual", "to": "62812...", "type": "text", "text": {"body": "..."}}',
    steps: [
      'Salin URL Endpoint & API Key dari menu Pengaturan instance OneSender Anda.',
      'Pastikan akhiran URL adalah /api/v1/messages.',
      'Masukkan nomor tujuan (628xxx), klik Kirim Pesan Test lalu Simpan.',
    ],
  },
  {
    id: 'ruangwa',
    name: 'RuangWA',
    group: 'id',
    protocol: 'POST application/x-www-form-urlencoded',
    authHeader: 'Body token=<Device_Token>',
    url: 'https://app.ruangwa.id/api/send_message',
    tokenLabel: 'Token Device RuangWA',
    tokenPlaceholder: 'Token dari dashboard app.ruangwa.id',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    samplePayload: 'token=...&number=6281234567890&message=...',
    steps: [
      'Login ke app.ruangwa.id dan tautkan perangkat WhatsApp.',
      'Salin Token perangkat dan masukkan ke kolom Token.',
      'Masukkan nomor tujuan, klik Kirim Pesan Test lalu Simpan.',
    ],
  },
  {
    id: 'whacenter',
    name: 'Whacenter',
    group: 'id',
    protocol: 'POST application/x-www-form-urlencoded',
    authHeader: 'Body device_id=<Device_ID>',
    url: 'https://app.whacenter.com/api/send',
    tokenLabel: 'Device ID Whacenter',
    tokenPlaceholder: 'Device ID dari dashboard Whacenter',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    samplePayload: 'device_id=...&number=6281234567890&message=...',
    steps: [
      'Login ke app.whacenter.com → salin Device ID dari perangkat yang aktif.',
      'Tempelkan Device ID ke kolom Token dan isi nomor tujuan.',
    ],
  },
  {
    id: 'dripsender',
    name: 'Dripsender',
    group: 'id',
    protocol: 'POST application/json',
    authHeader: 'Body api_key=<API_Key>',
    url: 'https://api.dripsender.id/send',
    tokenLabel: 'API Key Dripsender',
    tokenPlaceholder: 'API Key dari dashboard Dripsender',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    samplePayload: '{"api_key": "...", "phone": "6281234567890", "text": "..."}',
    steps: [
      'Login ke Dripsender → salin API Key perangkat yang aktif.',
      'Masukkan nomor tujuan, klik Kirim Pesan Test lalu Simpan.',
    ],
  },
  {
    id: 'woowa',
    name: 'Woowa (Woo-WA)',
    group: 'id',
    protocol: 'POST application/json',
    authHeader: 'Body key=<License_Key>',
    url: 'https://notifapi.com/send_message',
    tokenLabel: 'License Key Woowa',
    tokenPlaceholder: 'Key dari dashboard Woo-WA',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    samplePayload: '{"phone_no": "6281234567890", "key": "...", "message": "..."}',
    steps: [
      'Login ke dashboard Woo-WA → salin License Key perangkat.',
      'Masukkan nomor tujuan, klik Kirim Pesan Test lalu Simpan.',
    ],
  },
  {
    id: 'kirimi',
    name: 'Kirimi.id',
    group: 'id',
    protocol: 'POST application/json',
    authHeader: 'Body user_code + secret',
    url: 'https://api.kirimi.id/v1/send-message',
    tokenLabel: 'Secret Key Kirimi.id',
    tokenPlaceholder: 'Secret Key dari dashboard Kirimi.id',
    tokenRequired: true,
    senderLabel: 'User Code : Device ID',
    senderPlaceholder: 'USERCODE:DEVICE_ID (pisahkan dengan titik dua)',
    phonePlaceholder: '6281234567890',
    samplePayload: '{"user_code": "...", "device_id": "...", "secret": "...", "receiver": "62812...", "message": "..."}',
    steps: [
      'Login ke Kirimi.id → ambil User Code, Device ID, dan Secret Key.',
      'Isi kolom User Code : Device ID dengan format USERCODE:DEVICE_ID.',
    ],
  },
  {
    id: 'zenziva',
    name: 'Zenziva',
    group: 'id',
    protocol: 'POST application/x-www-form-urlencoded',
    authHeader: 'Body userkey + passkey',
    url: 'https://console.zenziva.net/wareguler/api/sendWA/',
    tokenLabel: 'Passkey Zenziva',
    tokenPlaceholder: 'Passkey API dari console.zenziva.net',
    tokenRequired: true,
    senderLabel: 'Userkey Zenziva',
    senderPlaceholder: 'Userkey dari console.zenziva.net',
    phonePlaceholder: '081234567890 atau 6281234567890',
    samplePayload: 'userkey=...&passkey=...&to=6281234567890&message=...',
    steps: [
      'Login ke console.zenziva.net → menu Pengaturan API.',
      'Isi Userkey dan Passkey sesuai akun Zenziva Anda.',
    ],
  },
  {
    id: 'waha',
    name: 'WAHA (HTTP API)',
    group: 'self',
    tag: 'Self-Host',
    protocol: 'POST application/json',
    authHeader: 'X-Api-Key: <API_Key>',
    url: 'http://localhost:3000/api/sendText',
    tokenLabel: 'X-Api-Key WAHA (Opsional)',
    tokenPlaceholder: 'API Key WAHA (kosongkan jika tanpa autentikasi)',
    senderLabel: 'Session Name',
    senderPlaceholder: 'default',
    senderHelper: 'Nama session WAHA (default: "default")',
    phonePlaceholder: '6281234567890 atau 120363xxx@g.us',
    samplePayload: '{"chatId": "6281234567890@c.us", "text": "...", "session": "default"}',
    steps: [
      'Pastikan service/container WAHA berjalan dan session berstatus WORKING.',
      'Isi API URL dengan http://IP-SERVER:PORT/api/sendText.',
      'Isi Session Name (default) dan X-Api-Key bila diaktifkan.',
    ],
  },
  {
    id: 'gowa',
    name: 'GOWA (Multi-Device)',
    group: 'self',
    tag: 'Self-Host',
    protocol: 'POST application/json',
    authHeader: 'Basic Auth / Bearer',
    url: 'http://localhost:3000/send/message',
    tokenLabel: 'Basic Auth / Token (Opsional)',
    tokenPlaceholder: 'username:password (jika Basic Auth diaktifkan)',
    phonePlaceholder: '6281234567890',
    samplePayload: '{"phone": "6281234567890@s.whatsapp.net", "message": "..."}',
    steps: [
      'Jalankan GOWA (go-whatsapp-web-multidevice) dan tautkan QR WhatsApp.',
      'Isi API URL dengan http://IP-SERVER:PORT/send/message.',
      'Jika menggunakan Basic Auth, isi kolom token dengan format user:password.',
    ],
  },
  {
    id: 'custom',
    name: 'Custom Webhook',
    group: 'self',
    protocol: 'POST application/json',
    authHeader: 'Authorization: Bearer <Token> & X-Api-Key',
    url: 'http://your-server:port/send-message',
    tokenLabel: 'API Key / Bearer Token (Opsional)',
    tokenPlaceholder: 'Token (dikirim di header Authorization & body JSON)',
    senderLabel: 'Sender / Device ID (Opsional)',
    senderPlaceholder: 'Nomor pengirim atau ID perangkat',
    phonePlaceholder: '6281234567890',
    samplePayload: '{"phone": "62812...", "number": "62812...", "target": "62812...", "message": "...", "text": "..."}',
    steps: [
      'Masukkan URL endpoint HTTP POST dari layanan WA Gateway Anda.',
      'Sistem mengirim payload JSON komprehensif (phone, number, target, to, message, text) + header Bearer.',
      'Tekan Kirim Pesan Test untuk memeriksa respons.',
    ],
  },
  {
    id: 'callmebot',
    name: 'CallMeBot',
    group: 'intl',
    protocol: 'GET Query Params',
    authHeader: 'Query ?apikey=<Key>',
    url: 'https://api.callmebot.com/whatsapp.php',
    tokenLabel: 'CallMeBot API Key',
    tokenPlaceholder: 'API Key dari balasan chat CallMeBot',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    samplePayload: 'GET ?phone=6281234567890&text=...&apikey=...',
    steps: [
      'Kirim pesan "I allow callmebot to send me messages" ke nomor CallMeBot di WhatsApp.',
      'Salin APIKey yang dibalas oleh bot ke kolom Token.',
    ],
  },
  {
    id: 'greenapi',
    name: 'Green API',
    group: 'intl',
    protocol: 'POST application/json',
    authHeader: 'Token in Endpoint URL',
    url: 'https://api.green-api.com/waInstanceXXXX/sendMessage/YOUR_TOKEN',
    tokenLabel: 'Green API Token (Opsional bila sudah di URL)',
    tokenPlaceholder: 'ApiTokenInstance',
    phonePlaceholder: '6281234567890',
    samplePayload: '{"chatId": "6281234567890@c.us", "message": "..."}',
    steps: [
      'Salin URL sendMessage lengkap beserta idInstance dan ApiTokenInstance dari konsol Green API.',
    ],
  },
  {
    id: 'ultramsg',
    name: 'Ultramsg',
    group: 'intl',
    protocol: 'POST application/x-www-form-urlencoded',
    authHeader: 'Body token=<Token>',
    url: 'https://api.ultramsg.com/INSTANCE_ID/messages/chat',
    tokenLabel: 'Token Ultramsg',
    tokenPlaceholder: 'Token instance dari ultramsg.com',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    samplePayload: 'token=...&to=6281234567890&body=...',
    steps: [
      'Ganti INSTANCE_ID pada API URL sesuai instance Ultramsg Anda.',
      'Masukkan Token instance dan nomor tujuan.',
    ],
  },
  {
    id: 'meta',
    name: 'Meta Cloud API',
    group: 'intl',
    protocol: 'POST application/json',
    authHeader: 'Authorization: Bearer <Access_Token>',
    url: 'https://graph.facebook.com/v18.0/YOUR_PHONE_ID/messages',
    tokenLabel: 'Permanent Access Token',
    tokenPlaceholder: 'EAAGm0PX4ZCpsBA...',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    samplePayload: '{"messaging_product": "whatsapp", "to": "62812...", "type": "text", "text": {"body": "..."}}',
    steps: [
      'Ganti YOUR_PHONE_ID pada API URL dengan Phone Number ID dari Meta Developer Console.',
      'Tempelkan Permanent Access Token pada kolom Token.',
    ],
  },
  {
    id: '360dialog',
    name: '360Dialog',
    group: 'intl',
    protocol: 'POST application/json',
    authHeader: 'D360-API-KEY: <API_Key>',
    url: 'https://waba.360dialog.io/v1/messages',
    tokenLabel: 'D360-API-KEY',
    tokenPlaceholder: 'API Key dari 360Dialog Hub',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    samplePayload: '{"messaging_product": "whatsapp", "to": "62812...", "type": "text", "text": {"body": "..."}}',
    steps: [
      'Masukkan D360-API-KEY dari 360Dialog Client Hub dan nomor WA tujuan.',
    ],
  },
  {
    id: 'wati',
    name: 'WATI',
    group: 'intl',
    protocol: 'POST application/x-www-form-urlencoded',
    authHeader: 'Authorization: Bearer <Token>',
    url: 'https://live-mt-server.wati.io/api/v1/sendSessionMessage',
    tokenLabel: 'WATI Bearer Token',
    tokenPlaceholder: 'Access Token dari WATI API Docs',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    samplePayload: 'POST /sendSessionMessage/6281234567890?messageText=...',
    steps: [
      'Sesuaikan URL endpoint WATI Anda dan masukkan Bearer Access Token.',
    ],
  },
  {
    id: 'twilio',
    name: 'Twilio WhatsApp',
    group: 'intl',
    protocol: 'POST application/x-www-form-urlencoded',
    authHeader: 'Authorization: Basic <SID:Token>',
    url: 'https://api.twilio.com/2010-04-01/Accounts/YOUR_SID/Messages.json',
    tokenLabel: 'AccountSID:AuthToken',
    tokenPlaceholder: 'ACxxxx:your_auth_token',
    tokenRequired: true,
    senderLabel: 'Twilio WhatsApp From Number',
    senderPlaceholder: '+14155238886',
    phonePlaceholder: '6281234567890',
    samplePayload: 'To=whatsapp:+62812...&From=whatsapp:+14155238886&Body=...',
    steps: [
      'Ganti YOUR_SID di API URL dengan Account SID Twilio Anda.',
      'Isi kolom token dengan format AccountSID:AuthToken dan nomor pengirim Twilio.',
    ],
  },
];

function detectGatewayIdFromUrl(url: string, hint?: string): string {
  if (hint && WA_GATEWAYS.some(g => g.id === hint)) return hint;
  const u = (url || '').toLowerCase();
  if (!u) return 'fonnte';
  if (u.includes('fonnte.com')) return 'fonnte';
  if (u.includes('wablas.com')) return 'wablas';
  if (u.includes('starsender')) return 'starsender';
  if (u.includes('onesender') || u.includes('/api/v1/messages')) return 'onesender';
  if (u.includes('ruangwa')) return 'ruangwa';
  if (u.includes('whacenter')) return 'whacenter';
  if (u.includes('dripsender')) return 'dripsender';
  if (u.includes('notifapi.com') || u.includes('woowa')) return 'woowa';
  if (u.includes('kirimi.id')) return 'kirimi';
  if (u.includes('zenziva')) return 'zenziva';
  if (u.includes('callmebot.com')) return 'callmebot';
  if (u.includes('green-api.com')) return 'greenapi';
  if (u.includes('ultramsg.com')) return 'ultramsg';
  if (u.includes('graph.facebook.com')) return 'meta';
  if (u.includes('360dialog.io')) return '360dialog';
  if (u.includes('wati.io')) return 'wati';
  if (u.includes('twilio.com')) return 'twilio';
  if (u.includes('/api/sendtext')) return 'waha';
  if (u.includes('/send/message')) return 'gowa';
  if (u.includes('/send-message')) return 'mpwa';
  return 'custom';
}

function WhatsAppSection({
  isSuperAdmin,
  onSwitchToNative,
}: {
  isSuperAdmin?: boolean;
  onSwitchToNative?: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['bot-config'],
    queryFn: async () => { const r = await fetch('/api/bot-config', { credentials: 'include' }); return r.json(); },
  });
  const qc = useQueryClient();
  const waConfig = data?.configs?.find((c: Record<string, unknown>) => c.bot_type === 'whatsapp') || {};
  const [form, setForm] = useState({
    enabled: false,
    provider: 'fonnte',
    api_url: 'https://api.fonnte.com/send',
    api_key: '',
    sender: '',
    phone_number: '',
  });
  const [editing, setEditing] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (data?.configs) {
      const cfg = data.configs.find((c: Record<string, unknown>) => c.bot_type === 'whatsapp');
      if (cfg) {
        const url = String(cfg.api_url || '');
        const prov = detectGatewayIdFromUrl(url, String(cfg.provider || cfg.bot_token || ''));
        const gwDef = WA_GATEWAYS.find(g => g.id === prov) || WA_GATEWAYS[0];
        setForm({
          enabled: !!cfg.enabled,
          provider: prov,
          api_url: url || gwDef.url,
          api_key: String(cfg.api_key || ''),
          sender: String(cfg.sender || cfg.chat_id || ''),
          phone_number: String(cfg.phone_number || ''),
        });
      }
    }
  }, [data]);

  const selectedGateway = WA_GATEWAYS.find(g => g.id === form.provider) || WA_GATEWAYS[0];

  const handleSelectProvider = (provId: string) => {
    const gw = WA_GATEWAYS.find(g => g.id === provId);
    if (!gw) return;
    setForm(prev => ({
      ...prev,
      provider: gw.id,
      api_url: gw.url,
    }));
    setEditing(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        enabled: form.enabled,
        provider: form.provider,
        api_url: form.api_url.trim(),
        sender: form.sender.trim(),
        phone_number: form.phone_number.trim(),
      };
      if (form.api_key && !form.api_key.includes('...') && form.api_key !== '***') {
        payload.api_key = form.api_key.trim();
      }
      const r = await fetch('/api/bot-config/whatsapp', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.message || 'Gagal menyimpan konfigurasi');
      return d;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bot-config'] });
      qc.invalidateQueries({ queryKey: ['alert-rules'] });
      toast.success(`Konfigurasi WA Gateway (${selectedGateway.name}) disimpan`);
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message || 'Gagal menyimpan konfigurasi'),
  });

  const testMut = useMutation({
    mutationFn: async () => {
      setTesting(true);
      const payload: Record<string, unknown> = {
        provider: form.provider,
        api_url: form.api_url.trim(),
        sender: form.sender.trim(),
        phone_number: form.phone_number.trim(),
      };
      if (form.api_key && !form.api_key.includes('...') && form.api_key !== '***') {
        payload.api_key = form.api_key.trim();
      }
      const r = await fetch('/api/bot-config/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.success) toast.success(d.message || 'Pesan test terkirim! Cek WhatsApp Anda.');
      else toast.error(d.message || 'Gagal mengirim pesan test');
      setTesting(false);
    },
    onError: () => { toast.error('Gagal mengirim pesan test'); setTesting(false); },
  });

  if (isLoading) return <TabSkeleton />;

  const quickProviders = WA_GATEWAYS.filter(g =>
    ['fonnte', 'wablas', 'mpwa', 'starsender', 'onesender', 'ruangwa', 'waha', 'custom'].includes(g.id)
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      {/* Left column: Gateway Configuration Form */}
      <Card
        className="lg:col-span-7"
        icon={
          <div className="w-8 h-8 rounded-lg bg-success/10 border border-success/20 flex items-center justify-center">
            <MessageCircle size={15} className="text-success" />
          </div>
        }
        title="Konfigurasi WhatsApp Gateway"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {isSuperAdmin && onSwitchToNative && (
              <button
                type="button"
                onClick={onSwitchToNative}
                className="px-2.5 py-1 rounded-md text-xs font-medium border border-brd bg-glass hover:border-accent/40 text-tx2 transition-colors"
              >
                Beralih ke WA Native (QR)
              </button>
            )}
            <span className={cn('badge', waConfig.enabled ? 'badge-success' : 'badge-neutral')}>
              {waConfig.enabled ? `Aktif · ${selectedGateway.name}` : 'Nonaktif'}
            </span>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-glass border border-brd">
            <div>
              <div className="text-sm font-medium text-tx1">Aktifkan Pengiriman WA Gateway</div>
              <div className="text-xs text-tx3">Otomatis menyalakan saluran WA Gateway pada Alert Rules saat disimpan</div>
            </div>
            <button
              type="button"
              onClick={() => { setForm({ ...form, enabled: !form.enabled }); setEditing(true); }}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors flex-shrink-0',
                form.enabled
                  ? 'bg-success/15 border-success/30 text-success'
                  : 'bg-surface border-brd text-tx3'
              )}
            >
              {form.enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Quick Provider Selector */}
          <div>
            <label className="label-sm block">Pilih Cepat Penyedia Gateway</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {quickProviders.map(gw => {
                const active = form.provider === gw.id;
                return (
                  <button
                    key={gw.id}
                    type="button"
                    onClick={() => handleSelectProvider(gw.id)}
                    className={cn(
                      'flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium text-left transition-colors',
                      active
                        ? 'border-accent bg-accent/10 text-tx1'
                        : 'border-brd bg-glass text-tx2 hover:border-accent/30 hover:text-tx1'
                    )}
                  >
                    <span className="truncate">{gw.name}</span>
                    {gw.tag && (
                      <span className={cn(
                        'ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono flex-shrink-0',
                        active ? 'bg-accent/20 text-accent' : 'bg-surface text-tx3'
                      )}>
                        {gw.tag}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Full Provider Select */}
          <Select
            label="Daftar Lengkap Penyedia WA Gateway (21 Provider)"
            value={form.provider}
            onChange={e => handleSelectProvider(e.target.value)}
          >
            <optgroup label="Gateway Indonesia">
              {WA_GATEWAYS.filter(g => g.group === 'id').map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </optgroup>
            <optgroup label="Self-Hosted / Open Source">
              {WA_GATEWAYS.filter(g => g.group === 'self').map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </optgroup>
            <optgroup label="Internasional / Official Cloud API">
              {WA_GATEWAYS.filter(g => g.group === 'intl').map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </optgroup>
          </Select>

          <Input
            label="API URL Endpoint"
            value={form.api_url}
            onChange={e => { setForm({ ...form, api_url: e.target.value }); setEditing(true); }}
            placeholder={selectedGateway.url}
            helperText={`Default endpoint ${selectedGateway.name}: ${selectedGateway.url}`}
          />

          <Input
            label={
              <>
                {selectedGateway.tokenLabel}{' '}
                {Boolean(waConfig.has_api_key) && (
                  <span className="text-success font-normal text-xs">(Tersimpan — isi baru jika ingin mengganti)</span>
                )}
              </>
            }
            type="password"
            value={form.api_key}
            onChange={e => { setForm({ ...form, api_key: e.target.value }); setEditing(true); }}
            placeholder={selectedGateway.tokenPlaceholder}
          />

          {selectedGateway.senderLabel && (
            <Input
              label={selectedGateway.senderLabel}
              value={form.sender}
              onChange={e => { setForm({ ...form, sender: e.target.value }); setEditing(true); }}
              placeholder={selectedGateway.senderPlaceholder || ''}
              helperText={selectedGateway.senderHelper}
            />
          )}

          <Input
            label="Nomor WA Tujuan / Group ID"
            value={form.phone_number}
            onChange={e => { setForm({ ...form, phone_number: e.target.value }); setEditing(true); }}
            placeholder={selectedGateway.phonePlaceholder}
            helperText="Awali dengan kode negara (628xxx). Mendukung banyak nomor dipisahkan koma (62811xxx,62812xxx) atau Group ID (@g.us)."
          />

          <div className="flex flex-wrap gap-2 pt-2 border-t border-brd">
            <Button
              variant="primary"
              icon={<Save size={15} />}
              loading={saveMut.isPending}
              disabled={!editing && Boolean(waConfig.id)}
              onClick={() => saveMut.mutate()}
            >
              Simpan Konfigurasi
            </Button>
            <Button
              variant="secondary"
              icon={<Send size={15} />}
              loading={testing}
              disabled={!form.api_url || !form.phone_number}
              onClick={() => testMut.mutate()}
            >
              Kirim Pesan Test
            </Button>
          </div>
        </div>
      </Card>

      {/* Right column: Technical Spec & Setup Guide */}
      <div className="lg:col-span-5 space-y-4">
        <Card
          icon={<Terminal size={15} className="text-accent" />}
          title={`Spesifikasi Protokol · ${selectedGateway.name}`}
        >
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="p-2.5 rounded-lg bg-glass border border-brd">
                <div className="text-[11px] text-tx3">Metode &amp; Content-Type</div>
                <div className="font-mono text-tx1 mt-0.5 break-all">{selectedGateway.protocol}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-glass border border-brd">
                <div className="text-[11px] text-tx3">Skema Autentikasi</div>
                <div className="font-mono text-tx1 mt-0.5 break-all">{selectedGateway.authHeader}</div>
              </div>
            </div>

            <div>
              <div className="text-[11px] text-tx3 mb-1">Format Payload yang Dikirim NMS</div>
              <div className="code-block">
                <pre>{selectedGateway.samplePayload}</pre>
              </div>
            </div>

            <div className="pt-2 border-t border-brd">
              <div className="text-xs font-semibold text-tx1 mb-2">Langkah Konfigurasi {selectedGateway.name}</div>
              <ol className="list-decimal ml-4 space-y-1.5 text-tx2 leading-relaxed">
                {selectedGateway.steps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ─── WhatsApp Native (Baileys QR) Section ─── */

function WhatsAppNativeSection({ onSwitchToGateway }: { onSwitchToGateway?: () => void }) {
  const qc = useQueryClient();
  const { data: botData } = useQuery({
    queryKey: ['bot-config'],
    queryFn: async () => { const r = await fetch('/api/bot-config', { credentials: 'include' }); return r.json(); },
  });

  const { data: gwData, refetch: refetchGw } = useQuery({
    queryKey: ['wa-gateway-info'],
    queryFn: async () => { const r = await fetch('/api/bot-config/whatsapp-native/gateway', { credentials: 'include' }); return r.json(); },
  });

  const [form, setForm] = useState({
    enabled: false,
    api_url: 'http://localhost:3000',
    phone_number: '',
  });
  const [editing, setEditing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [status, setStatus] = useState<{ connected: boolean; hasQR: boolean; uptime?: number; message?: string } | null>(null);
  const [gwAction, setGwAction] = useState(false);

  useEffect(() => {
    if (botData?.configs) {
      const cfg = botData.configs.find((c: Record<string, unknown>) => c.bot_type === 'whatsapp_native');
      if (cfg) {
        setForm({
          enabled: !!cfg.enabled,
          api_url: String(cfg.api_url || gwData?.api_url || 'http://localhost:3000'),
          phone_number: String(cfg.phone_number || ''),
        });
      } else if (gwData?.api_url) {
        setForm(f => ({ ...f, api_url: gwData.api_url }));
      }
    } else if (gwData?.api_url) {
      setForm(f => ({ ...f, api_url: gwData.api_url }));
    }
  }, [botData, gwData]);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const r = await fetch('/api/bot-config/whatsapp-native/status', { credentials: 'include' });
        const d = await r.json();
        setStatus(d);
        if (d.hasQR && !d.connected) {
          setQrLoading(true);
          const qrRes = await fetch('/api/bot-config/whatsapp-native/qr', { credentials: 'include' });
          const qrD = await qrRes.json();
          setQrData(qrD.qr);
          setQrLoading(false);
        } else if (d.connected) {
          setQrData(null);
        }
      } catch { /* ignore */ }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const saveMut = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/bot-config/whatsapp_native', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(form),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bot-config'] });
      qc.invalidateQueries({ queryKey: ['alert-rules'] });
      toast.success('Konfigurasi WA Native disimpan');
      setEditing(false);
    },
  });

  const handleLogout = async () => {
    try {
      const r = await fetch('/api/bot-config/whatsapp-native/logout', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (d.success) { toast.success('Sesi WA di-logout. Silakan scan QR baru.'); setQrData(null); }
      else toast.error(d.message || 'Logout gagal');
    } catch { toast.error('Logout gagal'); }
  };

  const handleReconnect = async () => {
    try {
      const r = await fetch('/api/bot-config/whatsapp-native/reconnect', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (d.success) toast.success('Menghubungkan ulang...');
      else toast.error(d.message || 'Reconnect gagal');
    } catch { toast.error('Reconnect gagal'); }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const r = await fetch('/api/bot-config/whatsapp-native/test', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (d.success) toast.success('Pesan test terkirim! Cek WhatsApp Anda.');
      else toast.error(d.message || 'Gagal mengirim pesan test');
    } catch { toast.error('Gagal mengirim pesan test'); }
    setTesting(false);
  };

  const handleRefreshQR = async () => {
    setQrLoading(true);
    try {
      const r = await fetch('/api/bot-config/whatsapp-native/qr', { credentials: 'include' });
      const d = await r.json();
      setQrData(d.qr);
      if (!d.qr) toast.info(d.message || 'QR belum tersedia');
    } catch { toast.error('Gagal memuat QR'); }
    setQrLoading(false);
  };

  const handleStartGw = async () => {
    setGwAction(true);
    try {
      const r = await fetch('/api/bot-config/whatsapp-native/start', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (d.success) { toast.success(d.message || 'Service WA Native dijalankan'); refetchGw(); }
      else toast.error(d.message || 'Gagal menjalankan service');
    } catch { toast.error('Gagal menjalankan service'); }
    setGwAction(false);
  };

  const handleStopGw = async () => {
    setGwAction(true);
    try {
      const r = await fetch('/api/bot-config/whatsapp-native/stop', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (d.success) { toast.success(d.message || 'Service WA Native dihentikan'); refetchGw(); }
      else toast.error(d.message || 'Gagal menghentikan service');
    } catch { toast.error('Gagal menghentikan service'); }
    setGwAction(false);
  };

  const fmtUptime = (s?: number) => {
    if (!s) return '—';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}j ${m}m` : `${m}m`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      {/* Left column: Process & Configuration */}
      <Card
        className="lg:col-span-7"
        icon={
          <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Smartphone size={15} className="text-accent" />
          </div>
        }
        title="WhatsApp Native (Self-Hosted Baileys)"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {onSwitchToGateway && (
              <button
                type="button"
                onClick={onSwitchToGateway}
                className="px-2.5 py-1 rounded-md text-xs font-medium border border-brd bg-glass hover:border-accent/40 text-tx2 transition-colors"
              >
                Pakai Fonnte / WA Gateway Lain
              </button>
            )}
            <span className={cn('badge', status?.connected ? 'badge-success' : 'badge-neutral')}>
              {status?.connected ? 'Connected' : status ? 'Disconnected' : 'Memeriksa...'}
            </span>
          </div>
        }
      >
        <div className="space-y-4">
          {/* PM2 Process Control */}
          <div className="p-3.5 rounded-lg bg-glass border border-brd flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Server size={16} className="text-accent flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-tx1">Proses Service Lokal (PM2)</div>
                <div className="text-xs text-tx3 font-mono mt-0.5 truncate tabular-nums">
                  Port {gwData?.port || 3000} · PID {gwData?.pid || '—'} · Status: {gwData?.pm2_status || 'unknown'}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {gwData?.pm2_status !== 'online' ? (
                <Button variant="primary" icon={<Play size={13} />} loading={gwAction} onClick={handleStartGw}>
                  Start Service
                </Button>
              ) : (
                <Button variant="danger" icon={<Square size={13} />} loading={gwAction} onClick={handleStopGw}>
                  Stop Service
                </Button>
              )}
            </div>
          </div>

          {/* Session Connection Control */}
          <div className="p-3.5 rounded-lg bg-glass border border-brd flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', status?.connected ? 'bg-success' : 'bg-offline')} />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-tx1">
                  {status?.connected ? 'Sesi WhatsApp Tertaut' : 'Belum Tertaut'}
                </div>
                <div className="text-xs text-tx3 mt-0.5 truncate">
                  {status?.connected ? `Uptime: ${fmtUptime(status.uptime)}` : status?.message || 'Service belum aktif atau QR belum di-scan'}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={<RefreshCw size={13} />} onClick={handleReconnect}>
                Reconnect
              </Button>
              {status?.connected && (
                <Button variant="danger" icon={<LogOut size={13} />} onClick={handleLogout}>
                  Logout Sesi
                </Button>
              )}
            </div>
          </div>

          {/* Enable Toggle */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-glass border border-brd">
            <div>
              <div className="text-sm font-medium text-tx1">Gunakan WA Native untuk Alert</div>
              <div className="text-xs text-tx3">Kirim pesan alert melalui sesi WhatsApp lokal di atas</div>
            </div>
            <button
              type="button"
              onClick={() => { setForm({ ...form, enabled: !form.enabled }); setEditing(true); }}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors flex-shrink-0',
                form.enabled
                  ? 'bg-success/15 border-success/30 text-success'
                  : 'bg-surface border-brd text-tx3'
              )}
            >
              {form.enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <Input
            label="Internal Gateway URL"
            value={form.api_url}
            onChange={e => { setForm({ ...form, api_url: e.target.value }); setEditing(true); }}
            placeholder={gwData?.api_url || 'http://localhost:3000'}
            helperText="Endpoint lokal Baileys (default: http://localhost:3000)"
          />

          <Input
            label="Nomor WA Tujuan / Group ID"
            value={form.phone_number}
            onChange={e => { setForm({ ...form, phone_number: e.target.value }); setEditing(true); }}
            placeholder="6281234567890"
            helperText="Nomor penerima laporan alert (awali dengan 628...)"
          />

          <div className="flex flex-wrap gap-2 pt-2 border-t border-brd">
            <Button
              variant="primary"
              icon={<Save size={15} />}
              loading={saveMut.isPending}
              disabled={!editing}
              onClick={() => saveMut.mutate()}
            >
              Simpan Konfigurasi
            </Button>
            <Button
              variant="secondary"
              icon={<Send size={15} />}
              loading={testing}
              disabled={!form.phone_number}
              onClick={handleTest}
            >
              Kirim Pesan Test
            </Button>
          </div>
        </div>
      </Card>

      {/* Right column: QR Code Pairing */}
      <Card
        className="lg:col-span-5"
        title="Tautkan Perangkat (QR Code)"
      >
        {status?.connected ? (
          <div className="py-8 flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 rounded-full bg-success/10 border border-success/30 flex items-center justify-center text-success">
              <CheckCircle2 size={24} />
            </div>
            <div className="text-sm font-semibold text-tx1 mt-1">Perangkat Sudah Terhubung</div>
            <p className="text-xs text-tx3 max-w-xs">
              Sesi WhatsApp Native aktif dan siap mengirimkan pesan notifikasi.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs text-tx2 text-center leading-relaxed">
              Buka WhatsApp di ponsel → <strong>Perangkat Tertaut</strong> → <strong>Tautkan Perangkat</strong> → arahkan kamera ke kode QR di bawah.
            </p>
            {qrLoading ? (
              <div className="w-52 h-52 sm:w-60 sm:h-60 flex items-center justify-center bg-glass rounded-lg border border-brd">
                <Loader2 size={28} className="animate-spin text-accent" />
              </div>
            ) : qrData ? (
              <img
                src={qrData}
                alt="WhatsApp QR Code"
                className="w-52 h-52 sm:w-60 sm:h-60 rounded-lg bg-white p-2.5 border border-brd"
              />
            ) : (
              <div className="w-52 h-52 sm:w-60 sm:h-60 flex flex-col items-center justify-center bg-glass rounded-lg border border-brd gap-2">
                <QrCode size={40} className="text-tx3" />
                <span className="text-xs text-tx3">QR belum tersedia</span>
              </div>
            )}
            <Button variant="secondary" icon={<RefreshCw size={14} />} loading={qrLoading} onClick={handleRefreshQR}>
              Muat Ulang QR Code
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ─── Scheduler & Timezone Section ─── */

function CronjobSection() {
  const qc = useQueryClient();
  const [rechecking, setRechecking] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['system-config'],
    queryFn: async () => { const r = await fetch('/api/system-config', { credentials: 'include' }); return r.json(); },
  });

  const config = data?.config || {};
  const [interval, setIntervalVal] = useState(String(config.alert_check_interval || '60'));
  const [timezone, setTimezone] = useState(config.timezone || 'Asia/Jakarta');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.config) {
      setIntervalVal(String(data.config.alert_check_interval || '60'));
      setTimezone(data.config.timezone || 'Asia/Jakarta');
    }
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/system-config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ alert_check_interval: interval, timezone }),
      });
      const d = await r.json();
      if (d.success) { toast.success('Pengaturan jadwal & zona waktu disimpan'); qc.invalidateQueries({ queryKey: ['system-config'] }); }
      else toast.error(d.message || 'Gagal menyimpan');
    } catch { toast.error('Gagal menyimpan'); }
    setSaving(false);
  };

  const handleRecheck = async () => {
    setRechecking(true);
    try {
      const r = await fetch('/api/alert-rules/recheck', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (d.success) toast.success(d.message);
      else toast.error(d.message || 'Evaluasi ulang gagal');
    } catch { toast.error('Evaluasi ulang gagal'); }
    setRechecking(false);
  };

  const timezones = [
    'Asia/Jakarta (WIB, GMT+7)',
    'Asia/Makassar (WITA, GMT+8)',
    'Asia/Jayapura (WIT, GMT+9)',
    'Asia/Pontianak (WIB, GMT+7)',
    'Asia/Singapore (GMT+8)',
    'Asia/Kuala_Lumpur (GMT+8)',
    'Asia/Bangkok (GMT+7)',
    'Asia/Tokyo (GMT+9)',
    'UTC (GMT+0)',
  ];

  if (isLoading) return <TabSkeleton />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      <Card
        className="lg:col-span-7"
        icon={
          <div className="w-8 h-8 rounded-lg bg-warning/10 border border-warning/20 flex items-center justify-center">
            <Clock size={15} className="text-warning" />
          </div>
        }
        title="Interval Evaluasi & Zona Waktu"
        action={<span className="badge badge-success">Scheduler Aktif</span>}
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-lg bg-glass border border-brd space-y-3">
            <div>
              <label className="text-xs font-semibold text-tx1 block">Interval Pengecekan Alert</label>
              <p className="text-xs text-tx3 mt-0.5">Seberapa sering worker memeriksa perubahan status ONU dan metrik OLT (minimum 10 detik).</p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={10}
                  max={3600}
                  value={interval}
                  onChange={e => setIntervalVal(e.target.value)}
                  className="input-field w-24 font-mono tabular-nums"
                />
                <span className="text-xs text-tx2">detik</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[30, 60, 120, 300, 600].map(sec => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setIntervalVal(String(sec))}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-mono font-medium border transition-colors',
                      interval === String(sec)
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-brd bg-surface text-tx3 hover:text-tx1'
                    )}
                  >
                    {sec < 60 ? `${sec}s` : `${sec / 60}m`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Select
            label="Zona Waktu Sistem"
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            helperText="Digunakan untuk seluruh stempel waktu pada notifikasi WA/Telegram dan log histori."
          >
            {timezones.map(tz => {
              const val = tz.split(' ')[0];
              return <option key={val} value={val}>{tz}</option>;
            })}
          </Select>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-brd">
            <Button variant="primary" icon={<Save size={15} />} loading={saving} onClick={handleSave}>
              Simpan Pengaturan
            </Button>
            <Button
              variant="secondary"
              icon={<RefreshCw size={15} className={rechecking ? 'animate-spin' : ''} />}
              loading={rechecking}
              onClick={handleRecheck}
            >
              Evaluasi Alert Sekarang
            </Button>
          </div>
        </div>
      </Card>

      <Card
        className="lg:col-span-5"
        title="Mekanisme Anti-Spam &amp; Debounce"
      >
        <div className="space-y-2.5 text-xs text-tx2 leading-relaxed">
          <p>
            Mesin alert dilengkapi proteksi <strong>debounce 120 detik</strong> dan pengelompokan otomatis (batching) per PON port agar grup WhatsApp/Telegram tidak banjir pesan saat terjadi putus jalur distribusi.
          </p>
          <ul className="list-disc ml-4 space-y-1.5 text-tx3">
            <li><strong className="text-tx2">Batching otomatis</strong>: Jika banyak ONU pada satu port PON mengalami LOS bersamaan, pesan digabung menjadi satu laporan ringkas.</li>
            <li><strong className="text-tx2">Auto-resolve</strong>: Ketika ONU kembali online dan stabil selama 2 siklus pengecekan, alarm ditandai selesai secara otomatis.</li>
            <li><strong className="text-tx2">Retensi otomatis</strong>: Histori notifikasi yang sudah selesai lebih dari 7 hari dibersihkan otomatis.</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-pulse">
      <div className="lg:col-span-7 h-80 rounded-xl bg-glass border border-brd" />
      <div className="lg:col-span-5 h-64 rounded-xl bg-glass border border-brd" />
    </div>
  );
}
