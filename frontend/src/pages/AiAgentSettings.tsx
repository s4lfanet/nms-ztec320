import { useEffect, useState } from 'react';
import { Bot, Save, Send, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from '../components/Toast';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, Input } from '../components/ui';
import { api } from '../lib/api';

type Provider = 'anthropic' | 'openai';
interface Cfg {
  ai_enabled: string; ai_provider: Provider; ai_base_url: string; ai_model: string;
  ai_max_tokens: string; ai_allowed_senders: string; ai_channel_whatsapp: string;
  ai_channel_telegram: string; has_key: boolean;
}

const PRESETS: { label: string; provider: Provider; base: string; model: string }[] = [
  { label: 'Claude (Anthropic)', provider: 'anthropic', base: 'https://api.anthropic.com', model: 'claude-haiku-5-5' },
  { label: 'OpenAI', provider: 'openai', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'Google Gemini', provider: 'openai', base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
  { label: 'OpenRouter', provider: 'openai', base: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-haiku-4.5' },
  { label: 'Ollama (lokal)', provider: 'openai', base: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b' },
];

/** Perintah cepat — dijawab langsung dari database NMS tanpa AI (0 token). */
const QUICK: [string, string][] = [
  ['/ringkasan', 'Status semua OLT'],
  ['/gangguan', 'ONU offline / LOS / dying gasp'],
  ['/redaman', 'ONU online dengan RX < -27 dBm'],
  ['/alert', 'Alert 6 jam terakhir'],
  ['/cari <kata>', 'Cari pelanggan (nama/PPPoE/SN)'],
  ['/onu <ID|nama>', 'Detail satu ONU'],
  ['/menu', 'Daftar perintah'],
];

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-tx2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="cursor-pointer" />
      {label}
    </label>
  );
}

export function AiAgentSettings() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [chat, setChat] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    api.aiSettings().then(r => setCfg(r.config as unknown as Cfg)).catch(e => toast.error((e as Error).message));
  }, []);

  if (!cfg) return <PageContainer><div className="p-8 text-tx3"><Loader2 className="animate-spin" /></div></PageContainer>;
  const set = (k: keyof Cfg, v: string) => setCfg({ ...cfg, [k]: v });

  const applyPreset = (label: string) => {
    const p = PRESETS.find(x => x.label === label);
    if (p) setCfg({ ...cfg, ai_provider: p.provider, ai_base_url: p.base, ai_model: p.model });
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.aiSaveSettings({ ...cfg, ...(apiKey ? { api_key: apiKey } : {}) });
      setCfg(r.config as unknown as Cfg); setApiKey('');
      toast.success('Pengaturan AI Agent disimpan');
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  const ask = async (preset?: string) => {
    const question = (preset ?? q).trim();
    if (!question) return;
    setChat(c => [...c, { role: 'user', text: question }]); setQ(''); setAsking(true);
    try {
      const r = await api.aiAsk(question);
      setChat(c => [...c, { role: 'ai', text: r.answer }]);
    } catch (e) { toast.error((e as Error).message); } finally { setAsking(false); }
  };

  return (
    <PageContainer>
      <PageHeader icon={<Bot size={22} className="text-accent" />} title="AI Agent"
        description="Tanya status jaringan NMS lewat WhatsApp/Telegram memakai AI (baca-saja)" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Koneksi AI">
          <div className="space-y-3">
            <Check label="Aktifkan AI Agent" checked={cfg.ai_enabled === '1'} onChange={v => set('ai_enabled', v ? '1' : '0')} />
            <div>
              <label className="label-sm">Preset penyedia</label>
              <select className="input-field" defaultValue="" onChange={e => applyPreset(e.target.value)}>
                <option value="" disabled>Pilih preset…</option>
                {PRESETS.map(p => <option key={p.label}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label-sm">Format API</label>
              <select className="input-field" value={cfg.ai_provider} onChange={e => set('ai_provider', e.target.value)}>
                <option value="anthropic">Claude API (Anthropic)</option>
                <option value="openai">OpenAI-compatible</option>
              </select>
            </div>
            <Input label="Base URL" value={cfg.ai_base_url} onChange={e => set('ai_base_url', e.target.value)} />
            <Input label="Model" value={cfg.ai_model} onChange={e => set('ai_model', e.target.value)} />
            <Input label={`API Key ${cfg.has_key ? '(tersimpan — isi untuk mengganti)' : ''}`} type="password"
              value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={cfg.has_key ? '••••••••' : 'sk-…'} autoComplete="off" />
            <Input label="Maks. token jawaban" value={cfg.ai_max_tokens} inputMode="numeric"
              onChange={e => set('ai_max_tokens', e.target.value.replace(/\D/g, ''))} />
            <p className="text-xs text-tx3">
              Langganan Claude Pro/Max tidak bisa dipakai di sini — gunakan API key (bayar per pemakaian) dari
              console.anthropic.com, atau penyedia lain / Ollama lokal.
            </p>
          </div>
        </Card>
        <Card title="Kanal & akses">
          <div className="space-y-3">
            <Check label="WhatsApp (gateway bawaan NMS)" checked={cfg.ai_channel_whatsapp === '1'} onChange={v => set('ai_channel_whatsapp', v ? '1' : '0')} />
            <Check label="Telegram (bot yang dipakai untuk alert)" checked={cfg.ai_channel_telegram === '1'} onChange={v => set('ai_channel_telegram', v ? '1' : '0')} />
            <div>
              <label className="label-sm">Pengirim yang diizinkan (nomor WA / chat ID Telegram, pisah koma)</label>
              <textarea className="input-field min-h-[80px]" value={cfg.ai_allowed_senders}
                onChange={e => set('ai_allowed_senders', e.target.value)} placeholder="6281234567890, 123456789" />
            </div>
            <div className="flex gap-2 text-xs text-tx3">
              <ShieldCheck size={16} className="shrink-0 text-accent" />
              <p>WhatsApp juga menerima nomor HP user aktif yang punya izin <b>AI Agent</b> (atau super admin).
                Pengirim lain diabaikan tanpa balasan. AI hanya membaca data NMS — tidak bisa reboot/mengubah konfigurasi.
                Setelah mengaktifkan WhatsApp, klik <b>Start</b> ulang gateway di pengaturan WhatsApp agar pesan masuk diteruskan.</p>
            </div>
          </div>
        </Card>
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={save} loading={saving} icon={<Save size={15} />}>Simpan</Button>
      </div>
      <Card title="Coba tanya" className="mt-4">
        <div className="space-y-2 max-h-[45vh] overflow-y-auto mb-3">
          {chat.length === 0 && <p className="text-xs text-tx3">Perintah berawalan <b>/</b> dijawab langsung dari database NMS tanpa AI (gratis, instan) — klik tombol di bawah. Pertanyaan bebas, mis. “kenapa budi sering putus?”, dijawab AI.</p>}
          {chat.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
              <span className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm text-left ${m.role === 'user' ? 'bg-accent/15 text-tx1' : 'bg-glass text-tx1'}`}>{m.text}</span>
            </div>
          ))}
          {asking && <Loader2 size={16} className="animate-spin text-tx3" />}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {QUICK.map(([cmd, desc]) => (
            <button key={cmd} onClick={() => (cmd.includes('<') ? setQ(cmd.split(' ')[0] + ' ') : ask(cmd))}
              title={desc} className="px-2.5 py-1 rounded-lg text-xs border border-brd text-tx2 hover:text-tx1 hover:border-accent/40 font-mono">
              {cmd}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input-field" value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ask()} placeholder="Tulis pertanyaan… (/reset untuk mulai ulang)" />
          <Button onClick={() => ask()} loading={asking} icon={<Send size={15} />}>Kirim</Button>
        </div>
      </Card>
    </PageContainer>
  );
}
