import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '../components/Toast';
import { cn } from '../lib/utils';
import { useAuth } from '../stores/auth';
import {
  Bell, MessageCircle, Send, Settings, Shield, Save,
  ToggleLeft, ToggleRight, AlertTriangle, Radio, Wifi,
  Zap, Clock, RefreshCw, Smartphone, QrCode, LogOut, Loader2,
  Play, Square, Server
} from 'lucide-react';

export function AlertSettings() {
  const { user } = useAuth();
  const isSuperAdmin = !!user?.is_super_admin;
  const [activeSection, setActiveSection] = useState<'rules' | 'telegram' | 'whatsapp' | 'whatsapp_native' | 'cronjob'>(isSuperAdmin ? 'whatsapp_native' : 'rules');

  const allTabs = [
    { id: 'rules' as const, label: 'Alert Rules', icon: <Shield size={15} />, superAdmin: false },
    { id: 'telegram' as const, label: 'Telegram Bot', icon: <Send size={15} />, superAdmin: false },
    { id: 'whatsapp' as const, label: 'WhatsApp', icon: <MessageCircle size={15} />, superAdmin: false },
    { id: 'whatsapp_native' as const, label: 'WA Native', icon: <Smartphone size={15} />, superAdmin: true },
    { id: 'cronjob' as const, label: 'Cron Job', icon: <Clock size={15} />, superAdmin: true },
  ];
  const visibleTabs = allTabs;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Alert Settings</h1>
        <p className="text-tx2 text-xs md:text-sm mt-1">{isSuperAdmin ? 'Configure WA Native notifications for tenants & cron job monitoring' : 'Configure monitoring rules and notification channels'}</p>
      </div>

      <div className="flex gap-2 flex-wrap pb-1">
        {visibleTabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveSection(tab.id)}
            className={cn('flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0',
              activeSection === tab.id ? 'bg-accent text-white' : 'bg-glass text-tx2 hover:text-tx1 border border-brd')}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeSection === 'rules' && <AlertRulesSection />}
      {activeSection === 'telegram' && <TelegramSection />}
      {activeSection === 'whatsapp' && <WhatsAppSection />}
      {activeSection === 'whatsapp_native' && <WhatsAppNativeSection />}
      {activeSection === 'cronjob' && <CronjobSection />}
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
        <div className="glass-card p-8 text-center">
          <Bell size={40} className="mx-auto text-tx3 mb-3 opacity-40" />
          <p className="text-sm text-tx2 font-medium">No alert rules configured</p>
          <p className="text-xs text-tx3 mt-1">Alert rules will be created automatically when your tenant is set up</p>
        </div>
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
    <div className="glass-card p-5">
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
            <div>
              <label className="text-xs text-tx3 block mb-1">RX Power Threshold (dBm)</label>
              <input type="number" value={String(form.rx_threshold || -27)}
                onChange={e => setForm({ ...form, rx_threshold: parseFloat(e.target.value) })}
                className="w-full h-9 px-3 rounded-lg bg-glass border border-brd text-sm" />
            </div>
            <div>
              <label className="text-xs text-tx3 block mb-1">RX Change Threshold (dB)</label>
              <input type="number" step="0.5" value={String(form.rx_change_threshold || 3)}
                onChange={e => setForm({ ...form, rx_change_threshold: parseFloat(e.target.value) })}
                className="w-full h-9 px-3 rounded-lg bg-glass border border-brd text-sm" />
            </div>
          </div>

          <div>
            <label className="text-xs text-tx3 block mb-2">Notification Channels</label>
            <div className="flex gap-3">
              {[
                { key: 'notify_bell', label: 'In-App Bell' },
                { key: 'notify_telegram', label: 'Telegram' },
                { key: 'notify_whatsapp', label: 'WhatsApp' },
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
            <button onClick={() => { onSave(form); setEditing(false); }} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium">
              <Save size={14} /> Save
            </button>
            <button onClick={() => { setForm({ ...rule }); setEditing(false); }} className="px-4 py-2 rounded-lg bg-glass text-xs">Cancel</button>
          </div>
        </div>
      )}
    </div>
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

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { enabled: form.enabled, chat_id: form.chat_id };
      if (form.bot_token && !form.bot_token.includes('...')) payload.bot_token = form.bot_token;
      const r = await fetch('/api/bot-config/telegram', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(payload),
      });
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bot-config'] }); toast.success('Telegram config saved'); setEditing(false); },
  });

  if (isLoading) return <TabSkeleton />;

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center">
          <Send size={24} className="text-accent" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Telegram Bot</h3>
          <p className="text-xs text-tx3">Receive alert notifications via Telegram</p>
        </div>
        <div className="ml-auto">
          <span className={cn('px-3 py-1 rounded-full text-xs font-medium', tgConfig.enabled ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>
            {tgConfig.enabled ? 'Connected' : 'Not Configured'}
          </span>
        </div>
      </div>

      <div className="space-y-4">
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

        <div>
          <label className="text-xs text-tx3 block mb-1">Bot Token</label>
          <input type="password" value={form.bot_token}
            onChange={e => { setForm({ ...form, bot_token: e.target.value }); setEditing(true); }}
            className="w-full h-10 px-4 rounded-lg bg-glass border border-brd text-sm focus:border-accent/50 outline-none"
            placeholder="123456:ABC-DEF..." />
          <p className="text-xs text-tx3 mt-1">Get from @BotFather on Telegram</p>
        </div>

        <div>
          <label className="text-xs text-tx3 block mb-1">Chat ID</label>
          <input value={form.chat_id}
            onChange={e => { setForm({ ...form, chat_id: e.target.value }); setEditing(true); }}
            className="w-full h-10 px-4 rounded-lg bg-glass border border-brd text-sm focus:border-accent/50 outline-none"
            placeholder="-1001234567890 (group) or 123456789 (user)" />
          <p className="text-xs text-tx3 mt-1">Use @userinfobot or @raw_data_bot to get chat ID</p>
        </div>

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
            <button onClick={() => { saveMut.mutate(); }} disabled={saveMut.isPending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent/90 disabled:opacity-50">
              <Save size={16} /> {saveMut.isPending ? 'Saving...' : 'Save Configuration'}
            </button>
            <button onClick={async () => {
              setTesting(true);
              try {
                const r = await fetch('/api/bot-config/telegram/test', { method: 'POST', credentials: 'include' });
                const d = await r.json();
                if (d.success) toast.success('Test message sent! Check Telegram.');
                else toast.error(d.message || 'Failed');
              } catch { toast.error('Failed to send test'); }
              setTesting(false);
            }} disabled={testing || !form.bot_token || !form.chat_id}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-glass border border-brd text-sm font-medium hover:border-accent/30 disabled:opacity-50">
              <Send size={16} /> {testing ? 'Sending...' : 'Test Message'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function WhatsAppSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['bot-config'],
    queryFn: async () => { const r = await fetch('/api/bot-config', { credentials: 'include' }); return r.json(); },
  });
  const qc = useQueryClient();
  const waConfig = data?.configs?.find((c: Record<string, unknown>) => c.bot_type === 'whatsapp') || {};
  const [form, setForm] = useState({
    enabled: waConfig.enabled || false,
    api_url: waConfig.api_url || '',
    api_key: '',
    phone_number: waConfig.phone_number || '',
  });
  const [editing, setEditing] = useState(false);
  const [testing, setTesting] = useState(false);

  const waGateways = [
    { name: '🇮🇩 Fonnte', url: 'https://api.fonnte.com/send', tokenLabel: 'Token dari fonnte.com', phonePlaceholder: '6281234567890 (tanpa +)' },
    { name: '🇮🇩 Wablas', url: 'https://wablas.com/api/send-message', tokenLabel: 'Token dari wablas.com', phonePlaceholder: '6281234567890' },
    { name: '🇮🇩 Zenziva', url: 'https://whatsapp.zenziva.net/api/send', tokenLabel: 'API Key dari zenziva.id', phonePlaceholder: '6281234567890' },
    { name: '🇮🇩 Damcorp', url: 'https://damcorp.id/api/whatsapp/send', tokenLabel: 'Token dari damcorp.id', phonePlaceholder: '6281234567890' },
    { name: '🇮🇩 WA Gateway (Self-hosted)', url: 'http://your-server:port/send-message', tokenLabel: 'Token dari config.yml', phonePlaceholder: '6281234567890' },
    { name: '🌍 CallMeBot', url: 'https://api.callmebot.com/whatsapp.php', tokenLabel: 'API Key (dari @callmebot)', phonePlaceholder: '6281234567890' },
    { name: '🌍 Meta Cloud API', url: 'https://graph.facebook.com/v18.0/YOUR_PHONE_ID/messages', tokenLabel: 'Bearer EAAxxxxx', phonePlaceholder: '6281234567890' },
    { name: '🌍 Twilio', url: 'https://api.twilio.com/2010-04-01/Accounts/YOUR_SID/Messages.json', tokenLabel: 'Account SID:Auth Token', phonePlaceholder: 'whatsapp:+6281234567890' },
    { name: '🌍 Green API', url: 'https://api.green-api.com/waINSTANCE/sendMessage', tokenLabel: 'Green API Token', phonePlaceholder: '6281234567890@c.us' },
    { name: '🌍 WATI', url: 'https://wati.io/api/v1/sendSessionMessage', tokenLabel: 'WATI API Key', phonePlaceholder: '6281234567890' },
    { name: '🌍 360Dialog', url: 'https://waba.360dialog.io/v1/messages', tokenLabel: '360Dialog API Key', phonePlaceholder: '6281234567890' },
  ];

  const selectedGateway = waGateways.find(g => form.api_url === g.url);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { enabled: form.enabled, phone_number: form.phone_number, api_url: form.api_url };
      if (form.api_key && !form.api_key.includes('...')) payload.api_key = form.api_key;
      const r = await fetch('/api/bot-config/whatsapp', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(payload),
      });
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bot-config'] }); toast.success('WhatsApp config saved'); setEditing(false); },
  });

  const testMut = useMutation({
    mutationFn: async () => {
      setTesting(true);
      const r = await fetch('/api/bot-config/whatsapp/test', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (d.success) toast.success('Test message sent! Check your WhatsApp.');
      else toast.error(d.message || 'Failed to send test message');
      setTesting(false);
    },
    onError: () => { toast.error('Failed to send test'); setTesting(false); },
  });

  if (isLoading) return <TabSkeleton />;

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-success/15 flex items-center justify-center">
          <MessageCircle size={24} className="text-success" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">WhatsApp Notifications</h3>
          <p className="text-xs text-tx3">Receive alert notifications via WhatsApp gateway</p>
        </div>
        <div className="ml-auto">
          <span className={cn('px-3 py-1 rounded-full text-xs font-medium', waConfig.enabled ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>
            {waConfig.enabled ? 'Connected' : 'Not Configured'}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-lg bg-glass border border-brd">
          <div>
            <div className="text-sm font-medium">Enable WhatsApp Notifications</div>
            <div className="text-xs text-tx3">Send alert messages via WhatsApp gateway</div>
          </div>
          <button onClick={() => { setForm({ ...form, enabled: !form.enabled }); setEditing(true); }}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', form.enabled ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>
            {form.enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <div>
          <label className="text-xs text-tx3 block mb-1">Select Gateway Provider</label>
          <select value={form.api_url} onChange={e => { setForm({ ...form, api_url: e.target.value }); setEditing(true); }}
            className="w-full h-10 px-3 rounded-lg bg-glass border border-brd text-sm focus:border-accent/50 outline-none">
            <option value="">— Select WhatsApp Gateway —</option>
            <optgroup label="🇮🇩 Indonesia Local">
              {waGateways.filter(g => g.name.includes('🇮🇩')).map(g => (
                <option key={g.url} value={g.url}>{g.name.replace('🇮🇩 ', '')}</option>
              ))}
            </optgroup>
            <optgroup label="🌍 International">
              {waGateways.filter(g => g.name.includes('🌍')).map(g => (
                <option key={g.url} value={g.url}>{g.name.replace('🌍 ', '')}</option>
              ))}
            </optgroup>
          </select>
        </div>

        <div>
          <label className="text-xs text-tx3 block mb-1">API URL</label>
          <input value={form.api_url}
            onChange={e => { setForm({ ...form, api_url: e.target.value }); setEditing(true); }}
            className="w-full h-10 px-4 rounded-lg bg-glass border border-brd text-sm focus:border-accent/50 outline-none"
            placeholder="https://api.fonnte.com/send" />
          <p className="text-xs text-tx3 mt-1">{selectedGateway ? `Endpoint: ${selectedGateway.url}` : 'Gateway endpoint (auto-filled from dropdown or enter custom)'}</p>
        </div>

        <div>
          <label className="text-xs text-tx3 block mb-1">API Key / Token</label>
          <input type="password" value={form.api_key}
            onChange={e => { setForm({ ...form, api_key: e.target.value }); setEditing(true); }}
            className="w-full h-10 px-4 rounded-lg bg-glass border border-brd text-sm focus:border-accent/50 outline-none"
            placeholder={selectedGateway?.tokenLabel || 'API key or token'} />
        </div>

        <div>
          <label className="text-xs text-tx3 block mb-1">Target Phone Number</label>
          <input value={form.phone_number}
            onChange={e => { setForm({ ...form, phone_number: e.target.value }); setEditing(true); }}
            className="w-full h-10 px-4 rounded-lg bg-glass border border-brd text-sm focus:border-accent/50 outline-none"
            placeholder={selectedGateway?.phonePlaceholder || '+6281234567890'} />
          <p className="text-xs text-tx3 mt-1">With country code, no spaces or dashes</p>
        </div>

        <div className="flex gap-2">
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !editing}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent/90 disabled:opacity-50">
            <Save size={16} /> {saveMut.isPending ? 'Saving...' : 'Save'}
          </button>
          <button onClick={() => testMut.mutate()} disabled={testing || !form.api_url}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-glass border border-brd text-sm font-medium hover:border-accent/30 disabled:opacity-50">
            <Send size={16} /> {testing ? 'Sending...' : 'Test Message'}
          </button>
        </div>
      </div>
    </div>
  );
}

function WhatsAppNativeSection() {
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
    <div className="glass-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-success/15 flex items-center justify-center">
          <Smartphone size={24} className="text-success" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">WhatsApp Native Gateway</h3>
          <p className="text-xs text-tx3">Self-hosted WhatsApp via Baileys — no third-party API needed</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={cn('px-3 py-1 rounded-full text-xs font-medium',
            gwData?.pm2_status === 'online' ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>
            Gateway: {gwData?.pm2_status || '...'}
          </span>
          <span className={cn('px-3 py-1 rounded-full text-xs font-medium',
            status?.connected ? 'bg-success/15 text-success' : 'bg-offline/15 text-tx3')}>
            {status?.connected ? 'Connected' : status ? 'Disconnected' : 'Checking...'}
          </span>
        </div>
      </div>

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
              <button onClick={handleStartGw} disabled={gwAction}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-success/15 text-success hover:bg-success/25 disabled:opacity-50">
                <Play size={13} /> {gwAction ? 'Starting...' : 'Start'}
              </button>
            ) : (
              <button onClick={handleStopGw} disabled={gwAction}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-danger/10 text-danger hover:bg-danger/20 disabled:opacity-50">
                <Square size={13} /> {gwAction ? 'Stopping...' : 'Stop'}
              </button>
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
            <button onClick={handleReconnect} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-glass border border-brd hover:border-accent/30">
              <RefreshCw size={13} className="inline mr-1" /> Reconnect
            </button>
            {status?.connected && (
              <button onClick={handleLogout} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-danger/10 text-danger hover:bg-danger/20">
                <LogOut size={13} className="inline mr-1" /> Logout
              </button>
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
            <button onClick={handleRefreshQR} className="px-4 py-2 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/90">
              <RefreshCw size={13} className="inline mr-1" /> Refresh QR
            </button>
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

        <div>
          <label className="text-xs text-tx3 block mb-1">Gateway URL {gwData?.api_url && <span className="text-accent">(auto: {gwData.api_url})</span>}</label>
          <input value={form.api_url}
            onChange={e => { setForm({ ...form, api_url: e.target.value }); setEditing(true); }}
            className="w-full h-10 px-4 rounded-lg bg-glass border border-brd text-sm focus:border-accent/50 outline-none"
            placeholder={gwData?.api_url || 'http://localhost:3001'} />
          <p className="text-xs text-tx3 mt-1">Auto-assigned per tenant. Click Start above to launch your gateway instance.</p>
        </div>

        <div>
          <label className="text-xs text-tx3 block mb-1">Target Phone Number</label>
          <input value={form.phone_number}
            onChange={e => { setForm({ ...form, phone_number: e.target.value }); setEditing(true); }}
            className="w-full h-10 px-4 rounded-lg bg-glass border border-brd text-sm focus:border-accent/50 outline-none"
            placeholder="6281234567890 (with country code, no +)" />
          <p className="text-xs text-tx3 mt-1">Your WhatsApp number or group ID to receive alerts</p>
        </div>

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
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !editing}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent/90 disabled:opacity-50">
            <Save size={16} /> {saveMut.isPending ? 'Saving...' : 'Save'}
          </button>
          <button onClick={handleTest} disabled={testing || !form.phone_number}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-glass border border-brd text-sm font-medium hover:border-accent/30 disabled:opacity-50">
            <Send size={16} /> {testing ? 'Sending...' : 'Test Message'}
          </button>
        </div>
      </div>
    </div>
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
      <div className="glass-card p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4 md:mb-6">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-warning/15 flex items-center justify-center flex-shrink-0">
              <Clock size={20} className="text-warning md:w-6 md:h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-base md:text-lg">Cron Job Configuration</h3>
              <p className="text-xs text-tx3">Set alert monitoring interval and system timezone</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-success/15 text-success flex-shrink-0">Active</span>
            <button onClick={handleRecheck} disabled={rechecking}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50 whitespace-nowrap">
              <RefreshCw size={13} className={rechecking ? 'animate-spin' : ''} />
              {rechecking ? 'Checking...' : 'Re-check Now'}
            </button>
          </div>
        </div>

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
            <label className="text-sm font-semibold block mb-2">System Timezone</label>
            <p className="text-xs text-tx3 mb-3">Timezone used for displaying timestamps across the NMS.</p>
            <select value={timezone} onChange={e => setTimezone(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-glass border border-brd text-sm">
              {timezones.map(tz => {
                const val = tz.split(' ')[0];
                return <option key={val} value={val}>{tz}</option>;
              })}
            </select>
            <div className="mt-2 text-xs text-tx3">
              Current time: <strong className="text-tx1">{new Date().toLocaleString('id-ID', { timeZone: timezone || 'Asia/Jakarta' })}</strong>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent/90 disabled:opacity-50">
              <Save size={16} /> {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="glass-card p-4 md:p-6">
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
      </div>

      {/* Alert Types */}
      <div className="glass-card p-4 md:p-6">
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
      </div>
    </div>
  );
}

function TabSkeleton() {
  return <div className="animate-pulse space-y-4">{[1,2].map(i => <div key={i} className="h-20 rounded-xl bg-glass" />)}</div>;
}

export default AlertSettings;
