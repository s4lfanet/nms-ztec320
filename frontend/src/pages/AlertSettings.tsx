import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '../components/Toast';
import { cn } from '../lib/utils';
import { useAuth } from '../stores/auth';
import {
  Bell, MessageCircle, Send, Settings, Shield, Save,
  ToggleLeft, ToggleRight, AlertTriangle, Radio, Wifi,
  Zap, Clock, RefreshCw, Smartphone, QrCode, LogOut, Loader2,
  Play, Square, Server, Activity, Cpu, Thermometer
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, Input, Select, Tabs, EmptyState } from '../components/ui';

export function AlertSettings() {
  const { user } = useAuth();
  const isSuperAdmin = !!user?.is_super_admin;
  const [activeSection, setActiveSection] = useState<'rules' | 'telegram' | 'whatsapp' | 'whatsapp_native' | 'cronjob'>('whatsapp');

  const allTabs = [
    { key: 'rules' as const, label: 'Alert Rules', icon: <Shield size={15} />, superAdmin: false },
    { key: 'telegram' as const, label: 'Telegram Bot', icon: <Send size={15} />, superAdmin: false },
    { key: 'whatsapp' as const, label: 'WA Gateway', icon: <MessageCircle size={15} />, superAdmin: false },
    { key: 'whatsapp_native' as const, label: 'WA Native (QR)', icon: <Smartphone size={15} />, superAdmin: true },
    { key: 'cronjob' as const, label: 'Cron Job', icon: <Clock size={15} />, superAdmin: true },
  ];
  const visibleTabs = allTabs.filter(tab => !tab.superAdmin || isSuperAdmin);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Alert Settings"
        description="Configure monitoring rules, WhatsApp Gateways (Fonnte, Wablas, MPWA, WA Native, etc.), Telegram & cron job"
      />

      <Tabs tabs={visibleTabs} active={activeSection} onChange={(key) => setActiveSection(key as typeof activeSection)} />

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
    </div>
  );
}

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
      if (!d.success) throw new Error(d.message || 'Failed');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alert-rules'] }); toast.success('Alert rule updated'); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 rounded-xl bg-glass" />)}</div>;

  const rules = data?.rules || [];

  return (
    <div className="space-y-4">
      {rules.length === 0 && (
        <EmptyState
          icon={Bell}
          title="No alert rules configured"
          description="Alert rules will be created automatically when your tenant is set up"
        />
      )}
      {rules.map((rule: Record<string, unknown>) => (
        <RuleCard key={String(rule.id)} rule={rule} onSave={(r) => updateMut.mutate(r)} />
      ))}
    </div>
  );
}

function RuleCard({ rule, onSave }: { rule: Record<string, unknown>; onSave: (r: Record<string, unknown>) => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...rule });

  const toggleField = (field: string) => {
    setForm(prev => ({ ...prev, [field]: !prev[field] }));
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center',
            form.enabled ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>
            <Bell size={20} />
          </div>
          <div>
            <h3 className="font-semibold">{String(rule.name)}</h3>
            <p className="text-xs text-tx3">Monitor ONU status and signal quality</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => {
            const newEnabled = !form.enabled;
            setForm(prev => ({ ...prev, enabled: newEnabled }));
            onSave({ ...form, enabled: newEnabled });
          }}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', form.enabled ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>
            {form.enabled ? 'Enabled' : 'Disabled'}
          </button>
          <button onClick={() => setEditing(!editing)} className="p-1.5 rounded hover:bg-glass text-tx3">
            <Settings size={16} />
          </button>
        </div>
      </div>

      {editing && (
        <div className="space-y-4 pt-4 border-t border-brd animate-fade-in">
          <div>
            <label className="text-xs text-tx3 block mb-2">Detection Rules</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'check_offline', label: 'ONU Offline', icon: <Wifi size={14} /> },
                { key: 'check_dyinggasp', label: 'DyingGasp', icon: <Zap size={14} /> },
                { key: 'check_los', label: 'LOS (Loss of Signal)', icon: <Radio size={14} /> },
                { key: 'check_rx_power', label: 'RX Power Low', icon: <AlertTriangle size={14} /> },
              ].map(item => (
                <button key={item.key} onClick={() => toggleField(item.key)}
                  className={cn('flex items-center gap-2 p-3 rounded-lg border text-sm transition-all',
                    form[item.key] ? 'border-accent bg-accent/10 text-accent' : 'border-brd bg-glass text-tx3')}>
                  {item.icon}
                  <span className="flex-1 text-left">{item.label}</span>
                  {form[item.key] ? <ToggleRight size={20} className="text-accent" /> : <ToggleLeft size={20} />}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="RX Power Threshold (dBm)" type="number" value={String(form.rx_threshold || -27)}
              onChange={e => setForm({ ...form, rx_threshold: parseFloat(e.target.value) })} />
            <Input label="RX Change Threshold (dB)" type="number" step="0.5" value={String(form.rx_change_threshold || 3)}
              onChange={e => setForm({ ...form, rx_change_threshold: parseFloat(e.target.value) })} />
          </div>

          {/* OLT Health Monitoring */}
          <div>
            <label className="text-xs text-tx3 block mb-2">OLT Health Monitoring</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                { key: 'check_olt_offline', label: 'OLT Offline', icon: <Server size={14} /> },
                { key: 'check_olt_cpu', label: 'CPU Load', icon: <Activity size={14} /> },
                { key: 'check_olt_memory', label: 'Memory Usage', icon: <Cpu size={14} /> },
                { key: 'check_olt_temperature', label: 'Temperature', icon: <Thermometer size={14} /> },
              ].map(item => (
                <button key={item.key} onClick={() => toggleField(item.key)}
                  className={cn('flex items-center gap-2 p-3 rounded-lg border text-sm transition-all',
                    form[item.key] ? 'border-accent bg-accent/10 text-accent' : 'border-brd bg-glass text-tx3')}>
                  {item.icon}
                  <span className="flex-1 text-left">{item.label}</span>
                  {form[item.key] ? <ToggleRight size={20} className="text-accent" /> : <ToggleLeft size={20} />}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="CPU Threshold (%)" type="number" value={String(form.olt_cpu_threshold ?? 80)}
                onChange={e => setForm({ ...form, olt_cpu_threshold: parseFloat(e.target.value) })} />
              <Input label="Memory Threshold (%)" type="number" value={String(form.olt_memory_threshold ?? 80)}
                onChange={e => setForm({ ...form, olt_memory_threshold: parseFloat(e.target.value) })} />
              <Input label="Temp Threshold (°C)" type="number" value={String(form.olt_temp_threshold ?? 60)}
                onChange={e => setForm({ ...form, olt_temp_threshold: parseFloat(e.target.value) })} />
            </div>
          </div>

          <div>
            <label className="text-xs text-tx3 block mb-2">Notification Channels</label>
            <div className="flex flex-wrap gap-3">
              {[
                { key: 'notify_bell', label: 'In-App Bell' },
                { key: 'notify_telegram', label: 'Telegram' },
                { key: 'notify_whatsapp', label: 'WhatsApp' },
                { key: 'notify_whatsapp_native', label: 'WA Native' },
              ].map(ch => (
                <button key={ch.key} onClick={() => toggleField(ch.key)}
                  className={cn('flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-medium transition-all',
                    form[ch.key] ? 'border-accent bg-accent/10 text-accent' : 'border-brd bg-glass text-tx3')}>
                  {ch.label}
                  {form[ch.key] ? <ToggleRight size={16} className="text-accent" /> : <ToggleLeft size={16} />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="primary" icon={<Save size={14} />} onClick={() => { onSave(form); setEditing(false); }}>Save</Button>
            <Button variant="secondary" onClick={() => { setForm({ ...rule }); setEditing(false); }}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

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
      const payload: Record<string, unknown> = { enabled: form.enabled, chat_id: form.chat_id };
      if (form.bot_token && !form.bot_token.includes('...') && form.bot_token !== '***') payload.bot_token = form.bot_token;
      const r = await fetch('/api/bot-config/telegram', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(payload),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bot-config'] });
      qc.invalidateQueries({ queryKey: ['alert-rules'] });
      toast.success('Telegram config saved');
      setEditing(false);
    },
  });

  if (isLoading) return <TabSkeleton />;

  return (
    <Card
      icon={
        <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center">
          <Send size={18} className="text-accent" />
        </div>
      }
      title="Telegram Bot"
      action={
        <span className={cn('px-3 py-1 rounded-full text-xs font-medium', tgConfig.enabled ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>
          {tgConfig.enabled ? 'Connected' : 'Not Configured'}
        </span>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-tx3 -mt-1">Receive alert notifications via Telegram</p>
        <div className="flex items-center justify-between p-3 rounded-lg bg-glass border border-brd">
          <div>
            <div className="text-sm font-medium">Enable Telegram Notifications</div>
            <div className="text-xs text-tx3">Send alert messages to Telegram chat/group</div>
          </div>
          <button onClick={() => { setForm({ ...form, enabled: !form.enabled }); setEditing(true); }}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', form.enabled ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>
            {form.enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <Input label="Bot Token" type="password" value={form.bot_token}
          onChange={e => { setForm({ ...form, bot_token: e.target.value }); setEditing(true); }}
          placeholder="123456:ABC-DEF..." helperText="Get from @BotFather on Telegram" />

        <Input label="Chat ID" value={form.chat_id}
          onChange={e => { setForm({ ...form, chat_id: e.target.value }); setEditing(true); }}
          placeholder="-1001234567890 (group) or 123456789 (user)" helperText="Use @userinfobot or @raw_data_bot to get chat ID" />

        <div className="p-3 rounded-lg bg-glass border border-brd text-xs text-tx3">
          <p className="font-medium text-tx2 mb-1">Setup Steps:</p>
          <ol className="list-decimal ml-4 space-y-1">
            <li>Create a bot via @BotFather on Telegram</li>
            <li>Copy the bot token and paste above</li>
            <li>Add the bot to your group/channel or start a chat with it</li>
            <li>Get the chat ID using @raw_data_bot</li>
            <li>Enable and save the configuration</li>
          </ol>
        </div>

        {editing && (
          <div className="flex gap-2">
            <Button variant="primary" icon={<Save size={16} />} loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
              Save Configuration
            </Button>
            <Button variant="secondary" icon={<Send size={16} />} loading={testing} disabled={!form.bot_token || !form.chat_id}
              onClick={async () => {
                setTesting(true);
                try {
                  const r = await fetch('/api/bot-config/telegram/test', { method: 'POST', credentials: 'include' });
                  const d = await r.json();
                  if (d.success) toast.success('Test message sent! Check Telegram.');
                  else toast.error(d.message || 'Failed');
                } catch { toast.error('Failed to send test'); }
                setTesting(false);
              }}>
              Test Message
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

interface WaGatewayDef {
  id: string;
  name: string;
  group: 'id' | 'self' | 'intl';
  badge?: string;
  url: string;
  tokenLabel: string;
  tokenPlaceholder: string;
  tokenRequired?: boolean;
  senderLabel?: string;
  senderPlaceholder?: string;
  senderHelper?: string;
  phonePlaceholder: string;
  steps: string[];
}

const WA_GATEWAYS: WaGatewayDef[] = [
  {
    id: 'fonnte',
    name: 'Fonnte',
    group: 'id',
    badge: 'Populer',
    url: 'https://api.fonnte.com/send',
    tokenLabel: 'Device Token Fonnte',
    tokenPlaceholder: 'Paste Token Device dari dashboard md.fonnte.com',
    tokenRequired: true,
    phonePlaceholder: '6281234567890 atau 62811xxx,62812xxx (multi nomor / group ID)',
    steps: [
      'Login ke md.fonnte.com → menu Devices → Add Device dan scan QR WhatsApp',
      'Klik tombol Token pada device yang sudah Connect, lalu paste ke kolom Device Token di atas',
      'Masukkan nomor WA tujuan (format 628xxx, bisa beberapa nomor dipisahkan koma atau Group ID)',
      'Klik Test Message untuk menguji, lalu klik Save Configuration',
    ],
  },
  {
    id: 'wablas',
    name: 'Wablas',
    group: 'id',
    badge: 'Populer',
    url: 'https://bdg.wablas.com/api/send-message',
    tokenLabel: 'API Token Wablas',
    tokenPlaceholder: 'Token dari menu Device → Settings di wablas.com',
    tokenRequired: true,
    senderLabel: 'Secret Key Wablas (Opsional — untuk Wablas v2)',
    senderPlaceholder: 'Kosongkan jika sudah digabung token.secret_key',
    senderHelper: 'Sesuaikan subdomain API URL dengan server Wablas Anda (bdg / pati / solo / jogja / kudus / sg)',
    phonePlaceholder: '6281234567890',
    steps: [
      'Login ke dashboard Wablas → Device → pastikan status Connected',
      'Sesuaikan subdomain pada API URL dengan server Wablas Anda (mis. https://pati.wablas.com/api/send-message)',
      'Salin Token (dan Secret Key bila menggunakan Wablas v2)',
      'Masukkan nomor tujuan (628xxx), klik Test Message lalu Save',
    ],
  },
  {
    id: 'mpwa',
    name: 'MPWA (M-Pedia WA Gateway)',
    group: 'id',
    badge: 'ISP Favorit',
    url: 'https://wa.domain-anda.com/send-message',
    tokenLabel: 'API Key MPWA',
    tokenPlaceholder: 'API Key dari menu Rest API / Pengaturan MPWA',
    tokenRequired: true,
    senderLabel: 'Nomor Pengirim / Sender Device',
    senderPlaceholder: '6281234567890 (nomor WA yang ter-scan di MPWA)',
    senderHelper: 'Wajib diisi sesuai nomor device pengirim yang terdaftar di MPWA',
    phonePlaceholder: '6281234567890',
    steps: [
      'Buka panel MPWA Anda → scan QR pada nomor pengirim',
      'Ganti API URL di atas dengan domain MPWA Anda + /send-message',
      'Salin API Key dari menu Rest API dan isi Nomor Pengirim (Sender) dengan nomor device Anda',
      'Masukkan nomor tujuan (628xxx), klik Test Message lalu Save',
    ],
  },
  {
    id: 'starsender',
    name: 'Starsender',
    group: 'id',
    url: 'https://api.starsender.online/api/send',
    tokenLabel: 'Device API Key Starsender',
    tokenPlaceholder: 'API Key dari menu Device Starsender',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    steps: [
      'Login ke Starsender → pilih Device yang sudah terhubung',
      'Salin Device API Key lalu tempelkan pada kolom di atas',
      'Masukkan nomor WA tujuan (628xxx), klik Test Message lalu Save',
    ],
  },
  {
    id: 'onesender',
    name: 'OneSender',
    group: 'id',
    url: 'https://onesender.domain-anda.com/api/v1/messages',
    tokenLabel: 'API Key OneSender',
    tokenPlaceholder: 'API Key dari dashboard OneSender',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    steps: [
      'Salin URL Endpoint & API Key dari menu Pengaturan instance OneSender Anda',
      'Pastikan akhiran URL adalah /api/v1/messages',
      'Masukkan nomor WA tujuan (628xxx), klik Test Message lalu Save',
    ],
  },
  {
    id: 'ruangwa',
    name: 'RuangWA',
    group: 'id',
    url: 'https://app.ruangwa.id/api/send_message',
    tokenLabel: 'Token Device RuangWA',
    tokenPlaceholder: 'Token dari dashboard app.ruangwa.id',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    steps: [
      'Login ke app.ruangwa.id → hubungkan perangkat WhatsApp Anda',
      'Salin Token perangkat dan masukkan ke kolom Token di atas',
      'Masukkan nomor tujuan (628xxx), klik Test Message lalu Save',
    ],
  },
  {
    id: 'whacenter',
    name: 'Whacenter',
    group: 'id',
    url: 'https://app.whacenter.com/api/send',
    tokenLabel: 'Device ID Whacenter',
    tokenPlaceholder: 'Device ID dari dashboard Whacenter',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    steps: [
      'Login ke app.whacenter.com → salin Device ID dari device yang aktif',
      'Tempelkan Device ID ke kolom Token di atas',
      'Masukkan nomor tujuan (628xxx), klik Test Message lalu Save',
    ],
  },
  {
    id: 'dripsender',
    name: 'Dripsender',
    group: 'id',
    url: 'https://api.dripsender.id/send',
    tokenLabel: 'API Key Dripsender',
    tokenPlaceholder: 'API Key dari dashboard Dripsender',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    steps: [
      'Login ke Dripsender → salin API Key device yang aktif',
      'Masukkan nomor tujuan (628xxx), klik Test Message lalu Save',
    ],
  },
  {
    id: 'woowa',
    name: 'Woowa (Woo-WA / NotifAPI)',
    group: 'id',
    url: 'https://notifapi.com/send_message',
    tokenLabel: 'License Key Woowa',
    tokenPlaceholder: 'Key dari dashboard Woo-WA',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    steps: [
      'Login ke dashboard Woo-WA → salin License Key device',
      'Masukkan nomor tujuan (628xxx), klik Test Message lalu Save',
    ],
  },
  {
    id: 'kirimi',
    name: 'Kirimi.id',
    group: 'id',
    url: 'https://api.kirimi.id/v1/send-message',
    tokenLabel: 'Secret Key Kirimi.id',
    tokenPlaceholder: 'Secret Key dari dashboard Kirimi.id',
    tokenRequired: true,
    senderLabel: 'User Code : Device ID',
    senderPlaceholder: 'USERCODE:DEVICE_ID (pisahkan dengan titik dua)',
    phonePlaceholder: '6281234567890',
    steps: [
      'Login ke Kirimi.id → ambil User Code, Device ID, dan Secret Key',
      'Isi kolom User Code : Device ID dengan format USERCODE:DEVICE_ID',
      'Masukkan Secret Key dan nomor tujuan, lalu Test Message',
    ],
  },
  {
    id: 'zenziva',
    name: 'Zenziva',
    group: 'id',
    url: 'https://console.zenziva.net/wareguler/api/sendWA/',
    tokenLabel: 'Passkey Zenziva',
    tokenPlaceholder: 'Passkey API dari console.zenziva.net',
    tokenRequired: true,
    senderLabel: 'Userkey Zenziva',
    senderPlaceholder: 'Userkey dari console.zenziva.net',
    phonePlaceholder: '081234567890 atau 6281234567890',
    steps: [
      'Login ke console.zenziva.net → menu Pengaturan API',
      'Isi Userkey dan Passkey sesuai akun Zenziva Anda',
      'Masukkan nomor tujuan, klik Test Message lalu Save',
    ],
  },
  {
    id: 'waha',
    name: 'WAHA (WhatsApp HTTP API)',
    group: 'self',
    badge: 'Self-Hosted',
    url: 'http://localhost:3000/api/sendText',
    tokenLabel: 'X-Api-Key (Opsional)',
    tokenPlaceholder: 'API Key WAHA (kosongkan jika tanpa auth)',
    senderLabel: 'Session Name',
    senderPlaceholder: 'default',
    senderHelper: 'Nama session WAHA (default: "default")',
    phonePlaceholder: '6281234567890 atau 120363xxx@g.us',
    steps: [
      'Pastikan container/service WAHA berjalan dan session sudah berstatus WORKING',
      'Isi API URL dengan http://IP-SERVER:PORT/api/sendText',
      'Isi Session Name (biasanya "default") dan X-Api-Key bila diaktifkan',
    ],
  },
  {
    id: 'gowa',
    name: 'GOWA (go-whatsapp-web-multidevice)',
    group: 'self',
    badge: 'Self-Hosted',
    url: 'http://localhost:3000/send/message',
    tokenLabel: 'Basic Auth / Token (Opsional)',
    tokenPlaceholder: 'username:password (jika Basic Auth aktif)',
    phonePlaceholder: '6281234567890',
    steps: [
      'Jalankan GOWA (aldinokemal/go-whatsapp-web-multidevice) dan scan QR',
      'Isi API URL dengan http://IP-SERVER:PORT/send/message',
      'Jika menggunakan Basic Auth, isi kolom token dengan format user:password',
    ],
  },
  {
    id: 'custom',
    name: 'Custom Webhook / WA Gateway Lainnya',
    group: 'self',
    url: 'http://your-server:port/send-message',
    tokenLabel: 'API Key / Bearer Token (Opsional)',
    tokenPlaceholder: 'Token (dikirim sebagai Bearer header & body api_key/token)',
    senderLabel: 'Sender / Device ID (Opsional)',
    senderPlaceholder: 'Nomor pengirim atau device ID',
    phonePlaceholder: '6281234567890',
    steps: [
      'Masukkan URL endpoint HTTP POST dari WA Gateway Anda',
      'Sistem mengirim JSON berisi field phone, number, target, to, message, text, api_key, sender + header Authorization Bearer',
      'Klik Test Message untuk memverifikasi koneksi',
    ],
  },
  {
    id: 'callmebot',
    name: 'CallMeBot',
    group: 'intl',
    url: 'https://api.callmebot.com/whatsapp.php',
    tokenLabel: 'CallMeBot API Key',
    tokenPlaceholder: 'API Key yang didapat dari chat bot CallMeBot',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    steps: [
      'Kirim pesan "I allow callmebot to send me messages" ke nomor CallMeBot di WhatsApp',
      'Salin APIKey yang dibalas oleh bot ke kolom di atas',
    ],
  },
  {
    id: 'greenapi',
    name: 'Green API',
    group: 'intl',
    url: 'https://api.green-api.com/waInstanceXXXX/sendMessage/YOUR_TOKEN',
    tokenLabel: 'Green API Token (Opsional bila sudah di URL)',
    tokenPlaceholder: 'ApiTokenInstance',
    phonePlaceholder: '6281234567890',
    steps: [
      'Salin URL sendMessage lengkap beserta idInstance dan ApiTokenInstance dari console Green API',
      'Masukkan nomor tujuan (otomatis ditambahkan @c.us bila belum ada)',
    ],
  },
  {
    id: 'ultramsg',
    name: 'Ultramsg',
    group: 'intl',
    url: 'https://api.ultramsg.com/INSTANCE_ID/messages/chat',
    tokenLabel: 'Token Ultramsg',
    tokenPlaceholder: 'Token instance dari ultramsg.com',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    steps: [
      'Ganti INSTANCE_ID pada API URL sesuai instance Ultramsg Anda',
      'Masukkan Token instance dan nomor tujuan',
    ],
  },
  {
    id: 'meta',
    name: 'Meta Cloud API (Official)',
    group: 'intl',
    url: 'https://graph.facebook.com/v18.0/YOUR_PHONE_ID/messages',
    tokenLabel: 'Permanent Access Token',
    tokenPlaceholder: 'EAAGm0PX4ZCpsBA...',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    steps: [
      'Ganti YOUR_PHONE_ID pada API URL dengan Phone Number ID dari Meta Developer Console',
      'Tempelkan Permanent Access Token pada kolom di atas',
    ],
  },
  {
    id: '360dialog',
    name: '360Dialog',
    group: 'intl',
    url: 'https://waba.360dialog.io/v1/messages',
    tokenLabel: 'D360-API-KEY',
    tokenPlaceholder: 'API Key dari 360Dialog Hub',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    steps: [
      'Masukkan D360-API-KEY dari 360Dialog Client Hub dan nomor WA tujuan',
    ],
  },
  {
    id: 'wati',
    name: 'WATI',
    group: 'intl',
    url: 'https://live-mt-server.wati.io/api/v1/sendSessionMessage',
    tokenLabel: 'WATI Bearer Token',
    tokenPlaceholder: 'Access Token dari WATI API Docs',
    tokenRequired: true,
    phonePlaceholder: '6281234567890',
    steps: [
      'Sesuaikan URL endpoint WATI Anda dan masukkan Bearer Access Token',
    ],
  },
  {
    id: 'twilio',
    name: 'Twilio WhatsApp',
    group: 'intl',
    url: 'https://api.twilio.com/2010-04-01/Accounts/YOUR_SID/Messages.json',
    tokenLabel: 'AccountSID:AuthToken',
    tokenPlaceholder: 'ACxxxx:your_auth_token',
    tokenRequired: true,
    senderLabel: 'Twilio WhatsApp From Number',
    senderPlaceholder: '+14155238886',
    phonePlaceholder: '6281234567890',
    steps: [
      'Ganti YOUR_SID di API URL dengan Account SID Twilio Anda',
      'Isi kolom token dengan format AccountSID:AuthToken dan nomor pengirim Twilio',
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

  // Sync form state when bot-config loads from backend
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
      toast.success(`Konfigurasi WA Gateway (${selectedGateway.name}) berhasil disimpan!`);
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
    <Card
      icon={
        <div className="w-9 h-9 rounded-xl bg-success/15 flex items-center justify-center">
          <MessageCircle size={18} className="text-success" />
        </div>
      }
      title="WhatsApp Gateway (Fonnte, Wablas, MPWA, dll.)"
      action={
        <div className="flex items-center gap-2">
          {isSuperAdmin && onSwitchToNative && (
            <button
              type="button"
              onClick={onSwitchToNative}
              className="px-3 py-1 rounded-lg text-xs font-medium border border-brd bg-glass hover:border-accent/40 text-tx2 transition-all"
            >
              Pakai WA Native (QR) →
            </button>
          )}
          <span className={cn('px-3 py-1 rounded-full text-xs font-medium', waConfig.enabled ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>
            {waConfig.enabled ? `Aktif (${selectedGateway.name})` : 'Belum Aktif'}
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-tx3 -mt-1">
          Kirim notifikasi alert ONU/OLT melalui penyedia layanan WhatsApp Gateway eksternal (Fonnte, Wablas, MPWA, Starsender, OneSender, WAHA, dll.)
        </p>

        <div className="flex items-center justify-between p-3 rounded-lg bg-glass border border-brd">
          <div>
            <div className="text-sm font-medium">Aktifkan Notifikasi WA Gateway</div>
            <div className="text-xs text-tx3">Otomatis mengaktifkan channel WhatsApp pada Alert Rules saat disimpan</div>
          </div>
          <button
            type="button"
            onClick={() => { setForm({ ...form, enabled: !form.enabled }); setEditing(true); }}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all', form.enabled ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}
          >
            {form.enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Quick Provider Pills */}
        <div>
          <label className="text-xs text-tx3 block mb-2">Pilih Cepat Gateway Populer</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {quickProviders.map(gw => {
              const active = form.provider === gw.id;
              return (
                <button
                  key={gw.id}
                  type="button"
                  onClick={() => handleSelectProvider(gw.id)}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium text-left transition-all',
                    active
                      ? 'border-accent bg-accent/15 text-accent ring-1 ring-accent/40'
                      : 'border-brd bg-glass text-tx2 hover:border-accent/30 hover:text-tx1'
                  )}
                >
                  <span className="truncate">{gw.name.split(' (')[0]}</span>
                  {gw.badge && (
                    <span className={cn(
                      'ml-1.5 px-1.5 py-0.5 rounded text-[10px] flex-shrink-0',
                      active ? 'bg-accent/25 text-accent' : 'bg-glass text-tx3'
                    )}>
                      {gw.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Full Provider Dropdown */}
        <Select
          label="Provider WhatsApp Gateway"
          value={form.provider}
          onChange={e => handleSelectProvider(e.target.value)}
        >
          <optgroup label="🇮🇩 Gateway Indonesia">
            {WA_GATEWAYS.filter(g => g.group === 'id').map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </optgroup>
          <optgroup label="🖥️ Self-Hosted / Custom Webhook">
            {WA_GATEWAYS.filter(g => g.group === 'self').map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </optgroup>
          <optgroup label="🌍 Internasional / Cloud API">
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
          helperText={`Default ${selectedGateway.name}: ${selectedGateway.url}`}
        />

        <Input
          label={
            <>
              {selectedGateway.tokenLabel}{' '}
              {Boolean(waConfig.has_api_key) && (
                <span className="text-success font-normal text-xs">(Sudah tersimpan — isi baru jika ingin mengganti)</span>
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
          helperText="Gunakan kode negara (mis. 6281234567890). Bisa lebih dari satu nomor dipisahkan koma (62811xxx,62812xxx)"
        />

        {/* Dynamic Setup Steps */}
        <div className="p-3 rounded-lg bg-glass border border-brd text-xs text-tx3">
          <p className="font-medium text-tx2 mb-1">Panduan Setup {selectedGateway.name}:</p>
          <ol className="list-decimal ml-4 space-y-1">
            {selectedGateway.steps.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ol>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            icon={<Save size={16} />}
            loading={saveMut.isPending}
            disabled={!editing && Boolean(waConfig.id)}
            onClick={() => saveMut.mutate()}
          >
            Save Configuration
          </Button>
          <Button
            variant="secondary"
            icon={<Send size={16} />}
            loading={testing}
            disabled={!form.api_url || !form.phone_number}
            onClick={() => testMut.mutate()}
          >
            Test Message
          </Button>
        </div>
      </div>
    </Card>
  );
}

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
    api_url: 'http://localhost:3001',
    phone_number: '',
  });
  const [editing, setEditing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [status, setStatus] = useState<{ connected: boolean; hasQR: boolean; uptime?: number; message?: string } | null>(null);
  const [gwAction, setGwAction] = useState(false);

  // Sync form when bot data loads from API
  useEffect(() => {
    if (botData?.configs) {
      const cfg = botData.configs.find((c: Record<string, unknown>) => c.bot_type === 'whatsapp_native');
      if (cfg) {
        setForm({
          enabled: cfg.enabled || false,
          api_url: cfg.api_url || (gwData?.api_url || 'http://localhost:3001'),
          phone_number: cfg.phone_number || '',
        });
      } else if (gwData?.api_url) {
        setForm(f => ({ ...f, api_url: gwData.api_url }));
      }
    } else if (gwData?.api_url) {
      setForm(f => ({ ...f, api_url: gwData.api_url }));
    }
  }, [botData, gwData]);

  // Poll status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const r = await fetch('/api/bot-config/whatsapp-native/status', { credentials: 'include' });
        const d = await r.json();
        setStatus(d);
        if (d.hasQR && !d.connected) {
          // Auto-fetch QR if available and not connected
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
      toast.success('WhatsApp Native config saved');
      setEditing(false);
    },
  });

  const handleLogout = async () => {
    try {
      const r = await fetch('/api/bot-config/whatsapp-native/logout', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (d.success) { toast.success('Logged out. New QR will be generated.'); setQrData(null); }
      else toast.error(d.message || 'Logout failed');
    } catch { toast.error('Logout failed'); }
  };

  const handleReconnect = async () => {
    try {
      const r = await fetch('/api/bot-config/whatsapp-native/reconnect', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (d.success) toast.success('Reconnecting...');
      else toast.error(d.message || 'Reconnect failed');
    } catch { toast.error('Reconnect failed'); }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const r = await fetch('/api/bot-config/whatsapp-native/test', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (d.success) toast.success('Test message sent! Check your WhatsApp.');
      else toast.error(d.message || 'Failed');
    } catch { toast.error('Failed to send test'); }
    setTesting(false);
  };

  const handleRefreshQR = async () => {
    setQrLoading(true);
    try {
      const r = await fetch('/api/bot-config/whatsapp-native/qr', { credentials: 'include' });
      const d = await r.json();
      setQrData(d.qr);
      if (!d.qr) toast.info(d.message || 'No QR available');
    } catch { toast.error('Failed to fetch QR'); }
    setQrLoading(false);
  };

  const handleStartGw = async () => {
    setGwAction(true);
    try {
      const r = await fetch('/api/bot-config/whatsapp-native/start', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (d.success) { toast.success(d.message || 'Gateway started'); refetchGw(); }
      else toast.error(d.message || 'Failed to start');
    } catch { toast.error('Failed to start gateway'); }
    setGwAction(false);
  };

  const handleStopGw = async () => {
    setGwAction(true);
    try {
      const r = await fetch('/api/bot-config/whatsapp-native/stop', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (d.success) { toast.success(d.message || 'Gateway stopped'); refetchGw(); }
      else toast.error(d.message || 'Failed to stop');
    } catch { toast.error('Failed to stop gateway'); }
    setGwAction(false);
  };

  const fmtUptime = (s?: number) => {
    if (!s) return '—';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <Card
      icon={
        <div className="w-9 h-9 rounded-xl bg-success/15 flex items-center justify-center">
          <Smartphone size={18} className="text-success" />
        </div>
      }
      title="WhatsApp Native Gateway (Scan QR)"
      action={
        <div className="flex items-center gap-2">
          {onSwitchToGateway && (
            <button
              type="button"
              onClick={onSwitchToGateway}
              className="px-3 py-1 rounded-lg text-xs font-medium border border-brd bg-glass hover:border-accent/40 text-tx2 transition-all"
            >
              ← Pakai Fonnte / WA Gateway Lain
            </button>
          )}
          <span className={cn('px-3 py-1 rounded-full text-xs font-medium',
            gwData?.pm2_status === 'online' ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>
            Gateway: {gwData?.pm2_status || '...'}
          </span>
          <span className={cn('px-3 py-1 rounded-full text-xs font-medium',
            status?.connected ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>
            {status?.connected ? 'Connected' : status ? 'Disconnected' : 'Checking...'}
          </span>
        </div>
      }
    >
      <p className="text-xs text-tx3 -mt-3 mb-4">Self-hosted WhatsApp via Baileys — no third-party API needed</p>

      {/* Gateway Instance Control */}
      <div className="p-4 rounded-lg bg-glass border border-brd mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Server size={18} className="text-accent" />
            <div>
              <div className="text-sm font-medium">Gateway Instance</div>
              <div className="text-xs text-tx3">
                Port: <strong className="text-tx2">{gwData?.port || '—'}</strong> ·
                PID: {gwData?.pid || '—'} ·
                Auth: <code className="text-tx2">{gwData?.auth_dir?.split('/').pop() || '—'}</code>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {gwData?.pm2_status !== 'online' ? (
              <Button variant="secondary" icon={<Play size={13} />} loading={gwAction}
                className="!bg-success/15 !text-success hover:!bg-success/25" onClick={handleStartGw}>
                Start
              </Button>
            ) : (
              <Button variant="danger" icon={<Square size={13} />} loading={gwAction} onClick={handleStopGw}>
                Stop
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Connection Status Card */}
      <div className="p-4 rounded-lg bg-glass border border-brd mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('w-3 h-3 rounded-full', status?.connected ? 'bg-success animate-pulse' : 'bg-offline')} />
            <div>
              <div className="text-sm font-medium">{status?.connected ? 'WhatsApp Connected' : 'Not Connected'}</div>
              <div className="text-xs text-tx3">
                {status?.connected ? `Uptime: ${fmtUptime(status.uptime)}` : status?.message || 'Gateway offline or not scanned'}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" icon={<RefreshCw size={13} />} onClick={handleReconnect}>Reconnect</Button>
            {status?.connected && (
              <Button variant="danger" icon={<LogOut size={13} />} onClick={handleLogout}>Logout</Button>
            )}
          </div>
        </div>
      </div>

      {/* QR Code Section */}
      {!status?.connected && (
        <div className="p-4 rounded-lg bg-glass border border-brd mb-4">
          <div className="flex flex-col items-center gap-3">
            <label className="text-sm font-semibold">Scan QR Code to Connect</label>
            <p className="text-xs text-tx3 text-center">Open WhatsApp on your phone → Settings → Linked Devices → Link a Device → Scan this QR</p>
            {qrLoading ? (
              <div className="w-64 h-64 flex items-center justify-center bg-glass rounded-lg">
                <Loader2 size={32} className="animate-spin text-accent" />
              </div>
            ) : qrData ? (
              <img src={qrData} alt="WhatsApp QR Code" className="w-64 h-64 rounded-lg bg-white p-2" />
            ) : (
              <div className="w-64 h-64 flex flex-col items-center justify-center bg-glass rounded-lg gap-2">
                <QrCode size={48} className="text-tx3" />
                <span className="text-xs text-tx3">No QR available</span>
              </div>
            )}
            <Button variant="primary" icon={<RefreshCw size={13} />} loading={qrLoading} onClick={handleRefreshQR}>Refresh QR</Button>
          </div>
        </div>
      )}

      {/* Configuration */}
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-lg bg-glass border border-brd">
          <div>
            <div className="text-sm font-medium">Enable Native WhatsApp</div>
            <div className="text-xs text-tx3">Use this as primary notification channel</div>
          </div>
          <button onClick={() => { setForm({ ...form, enabled: !form.enabled }); setEditing(true); }}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', form.enabled ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>
            {form.enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <Input
          label={<>Gateway URL {gwData?.api_url && <span className="text-accent">(auto: {gwData.api_url})</span>}</>}
          value={form.api_url}
          onChange={e => { setForm({ ...form, api_url: e.target.value }); setEditing(true); }}
          placeholder={gwData?.api_url || 'http://localhost:3001'}
          helperText="Auto-assigned per tenant. Click Start above to launch your gateway instance." />

        <Input label="Target Phone Number" value={form.phone_number}
          onChange={e => { setForm({ ...form, phone_number: e.target.value }); setEditing(true); }}
          placeholder="6281234567890 (with country code, no +)"
          helperText="Your WhatsApp number or group ID to receive alerts" />

        {/* Setup Instructions */}
        <div className="p-3 rounded-lg bg-glass border border-brd text-xs text-tx3">
          <p className="font-medium text-tx2 mb-1">Setup Steps:</p>
          <ol className="list-decimal ml-4 space-y-1">
            <li>Click <strong>Start</strong> above to launch your dedicated gateway instance (port {gwData?.port || 'auto-assigned'})</li>
            <li>Gateway URL is auto-filled — no need to change it</li>
            <li>Click "Refresh QR" and scan with your phone (WhatsApp → Linked Devices → Link a Device)</li>
            <li>Enter your phone number and enable</li>
            <li>Test with "Test Message" button</li>
          </ol>
          <p className="mt-2 text-tx3">Each tenant gets its own gateway instance with isolated WhatsApp session.</p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button variant="primary" icon={<Save size={16} />} loading={saveMut.isPending} disabled={!editing} onClick={() => saveMut.mutate()}>
            Save
          </Button>
          <Button variant="secondary" icon={<Send size={16} />} loading={testing} disabled={!form.phone_number} onClick={handleTest}>
            Test Message
          </Button>
        </div>
      </div>
    </Card>
  );
}

function CronjobSection() {
  const qc = useQueryClient();
  const [rechecking, setRechecking] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['system-config'],
    queryFn: async () => { const r = await fetch('/api/system-config', { credentials: 'include' }); return r.json(); },
  });

  const config = data?.config || {};
  const [interval, setInterval] = useState(String(config.alert_check_interval || '60'));
  const [timezone, setTimezone] = useState(config.timezone || 'Asia/Jakarta');
  const [saving, setSaving] = useState(false);

  // Sync state when data loads
  useEffect(() => {
    if (data?.config) {
      setInterval(String(data.config.alert_check_interval || '60'));
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
      if (d.success) { toast.success('Configuration saved'); qc.invalidateQueries({ queryKey: ['system-config'] }); }
      else toast.error(d.message || 'Save failed');
    } catch { toast.error('Save failed'); }
    setSaving(false);
  };

  const handleRecheck = async () => {
    setRechecking(true);
    try {
      const r = await fetch('/api/alert-rules/recheck', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (d.success) toast.success(d.message);
      else toast.error(d.message || 'Re-check failed');
    } catch { toast.error('Re-check failed'); }
    setRechecking(false);
  };

  const timezones = [
    'Asia/Jakarta (WIB, GMT+7)',
    'Asia/Makassar (WITA, GMT+8)',
    'Asia/Jayapura (WIT, GMT+9)',
    'Asia/Pontianak (WIB, GMT+7)',
    'Asia/Bangkok (GMT+7)',
    'Asia/Singapore (GMT+8)',
    'Asia/Kuala_Lumpur (GMT+8)',
    'Asia/Tokyo (GMT+9)',
    'Asia/Hong_Kong (GMT+8)',
    'Asia/Shanghai (GMT+8)',
    'Asia/Dubai (GMT+4)',
    'Europe/London (GMT+0)',
    'Europe/Berlin (GMT+1)',
    'America/New_York (GMT-5)',
    'America/Los_Angeles (GMT-8)',
    'UTC (GMT+0)',
  ];

  if (isLoading) return <TabSkeleton />;

  return (
    <div className="space-y-4">
      {/* Cron Job Interval + Timezone */}
      <Card
        icon={
          <div className="w-9 h-9 rounded-xl bg-warning/15 flex items-center justify-center flex-shrink-0">
            <Clock size={18} className="text-warning" />
          </div>
        }
        title="Cron Job Configuration"
        action={
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-success/15 text-success flex-shrink-0">Active</span>
            <Button variant="primary" icon={<RefreshCw size={13} className={rechecking ? 'animate-spin' : ''} />} loading={rechecking} onClick={handleRecheck}>
              Re-check Now
            </Button>
          </div>
        }
      >
        <p className="text-xs text-tx3 -mt-3 mb-4">Set alert monitoring interval and system timezone</p>

        <div className="space-y-4">
          {/* Check Interval */}
          <div className="p-3 md:p-4 rounded-lg bg-glass border border-brd">
            <label className="text-sm font-semibold block mb-2">Alert Check Interval</label>
            <p className="text-xs text-tx3 mb-3">How often the alert monitor checks ONU status. Minimum 10 seconds.</p>
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <div className="flex items-center gap-2">
                <input type="number" min={10} max={3600} value={interval}
                  onChange={e => setInterval(e.target.value)}
                  className="w-24 md:w-32 h-10 px-3 rounded-lg bg-glass border border-brd text-sm" />
                <span className="text-sm text-tx3">seconds</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[30, 60, 120, 300, 600].map(sec => (
                  <button key={sec} onClick={() => setInterval(String(sec))}
                    className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                      interval === String(sec) ? 'border-accent bg-accent/15 text-accent' : 'border-brd bg-glass text-tx3 hover:border-accent/30')}>
                    {sec < 60 ? `${sec}s` : `${sec / 60}m`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Timezone */}
          <div className="p-3 md:p-4 rounded-lg bg-glass border border-brd">
            <Select label="System Timezone" value={timezone} onChange={e => setTimezone(e.target.value)}
              helperText="Timezone used for displaying timestamps across the NMS.">
              {timezones.map(tz => {
                const val = tz.split(' ')[0];
                return <option key={val} value={val}>{tz}</option>;
              })}
            </Select>
            <div className="mt-2 text-xs text-tx3">
              Current time: <strong className="text-tx1">{new Date().toLocaleString('id-ID', { timeZone: timezone || 'Asia/Jakarta' })}</strong>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex gap-2">
            <Button variant="primary" icon={<Save size={16} />} loading={saving} onClick={handleSave}>
              Save Configuration
            </Button>
          </div>
        </div>
      </Card>

      {/* How It Works */}
      <Card>
        <h4 className="text-sm font-semibold mb-3">How It Works</h4>
        <div className="space-y-3 text-sm text-tx2">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
              <Clock size={16} className="text-accent" />
            </div>
            <div>
              <div className="font-medium text-tx1">Background Thread</div>
              <div className="text-xs text-tx3 mt-0.5">Alert monitor runs as a daemon thread when Flask starts. Checks every {interval} seconds.</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center flex-shrink-0">
              <Shield size={16} className="text-warning" />
            </div>
            <div>
              <div className="font-medium text-tx1">Detection Rules</div>
              <div className="text-xs text-tx3 mt-0.5">Monitors ONU status (offline/dyinggasp/los), RX power thresholds, and signal changes.</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-success/15 flex items-center justify-center flex-shrink-0">
              <Bell size={16} className="text-success" />
            </div>
            <div>
              <div className="font-medium text-tx1">Notifications</div>
              <div className="text-xs text-tx3 mt-0.5">Sends alerts to in-app bell, Telegram, and WhatsApp based on your configuration above.</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-danger/15 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={16} className="text-danger" />
            </div>
            <div>
              <div className="font-medium text-tx1">Deduplication</div>
              <div className="text-xs text-tx3 mt-0.5">Same ONU + same alert type won't fire again within 30 minutes to prevent spam.</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Alert Types */}
      <Card>
        <h4 className="text-sm font-semibold mb-2">Alert Types</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            { type: 'ONU Offline', color: 'text-danger', desc: 'ONU went offline (PhaseState != working)' },
            { type: 'DyingGasp', color: 'text-warning', desc: 'ONU sent power-off signal before going offline' },
            { type: 'LOS', color: 'text-danger', desc: 'Loss of Signal on PON port' },
            { type: 'Low RX Power', color: 'text-warning', desc: 'RX power below threshold (default -27 dBm)' },
            { type: 'RX Power Change', color: 'text-accent', desc: 'Signal degraded by more than 3 dB' },
            { type: 'Unconfigured', color: 'text-info', desc: 'Online ONU has no name/description configured' },
          ].map(item => (
            <div key={item.type} className="flex items-center gap-2 p-2 rounded bg-glass/50 text-xs">
              <span className={cn('font-semibold', item.color)}>{item.type}</span>
              <span className="text-tx3 flex-1">{item.desc}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function TabSkeleton() {
  return <div className="animate-pulse space-y-4">{[1,2].map(i => <div key={i} className="h-20 rounded-xl bg-glass" />)}</div>;
}

export default AlertSettings;
