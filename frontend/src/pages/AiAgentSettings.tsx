import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Save, Send, Loader2, ShieldCheck, KeyRound, ExternalLink, PlugZap, ChevronDown, CheckCircle2 } from 'lucide-react';
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

// Penyedia → format API, alamat, model bawaan, dan tempat membuat API key.
// "Format API" (Claude vs OpenAI-compatible) ditentukan otomatis dari penyedia;
// hanya ditampilkan untuk penyedia "Lainnya".
const PRESETS: { id: string; label: string; provider: Provider; base: string; model: string; keyUrl?: string; needsKey: boolean }[] = [
  { id: 'claude', label: 'Claude (Anthropic)', provider: 'anthropic', base: 'https://api.anthropic.com', model: 'claude-haiku-5-5', keyUrl: 'https://console.anthropic.com/settings/keys', needsKey: true },
  { id: 'openai', label: 'OpenAI', provider: 'openai', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', keyUrl: 'https://platform.openai.com/api-keys', needsKey: true },
  { id: 'gemini', label: 'Google Gemini', provider: 'openai', base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.8-flash', keyUrl: 'https://aistudio.google.com/apikey', needsKey: true },
  { id: 'openrouter', label: 'OpenRouter', provider: 'openai', base: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-haiku-4.5', keyUrl: 'https://openrouter.ai/keys', needsKey: true },
  { id: 'ollama', label: 'Ollama (lokal)', provider: 'openai', base: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b', needsKey: false },
];
const presetFor = (cfg: { ai_provider: Provider; ai_base_url: string }) =>
  PRESETS.find(p => p.provider === cfg.ai_provider && p.base.replace(/\/$/, '') === (cfg.ai_base_url || '').replace(/\/$/, ''))?.id || 'custom';

/** Perintah cepat — dijawab langsung dari database NMS tanpa AI (0 token). */
const QUICK: [string, string][] = [
  ['/ringkasan', 'Status semua OLT'],
  ['/gangguan', 'ONU offline / LOS / dying gasp'],
  ['/redaman', 'ONU online dengan RX < -27 dBm'],
  ['/alert', 'Alert 6 jam terakhir'],
  ['/insiden', 'Gangguan massal yang sedang ditangani'],
  ['/cari <kata>', 'Cari pelanggan (nama/PPPoE/SN)'],
  ['/onu <ID|nama>', 'Detail satu ONU'],
  ['/snmp', 'Status perangkat Monitoring SNMP'],
  ['/mac <MAC|IP>', 'MAC/IP terlihat di perangkat & port mana'],
  ['/menu', 'Daftar perintah'],
];

/** Format WhatsApp sederhana di chat web: *tebal* → <b>, sisanya teks biasa. */
function WaText({ text }: { text: string }) {
  // *tebal* gaya WhatsApp; bintang yang diikuti spasi (butir daftar) bukan tebal
  const parts = text.split(/(\*[^*\s](?:[^*\n]*[^*\s])?\*)/g);
  return <>{parts.map((p, i) => (p.length > 2 && p.startsWith('*') && p.endsWith('*') ? <b key={i}>{p.slice(1, -1)}</b> : p))}</>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-tx2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="cursor-pointer" />
      {label}
    </label>
  );
}

export function AiAgentSettings() {
  const { t } = useTranslation();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [providerId, setProviderId] = useState<string>('');
  const [q, setQ] = useState('');
  const [chat, setChat] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    api.aiSettings().then(r => {
      const c = r.config as unknown as Cfg;
      setCfg(c); setProviderId(presetFor(c));
    }).catch(e => toast.error((e as Error).message));
  }, []);

  if (!cfg) return <PageContainer><div className="p-8 text-tx3"><Loader2 className="animate-spin" /></div></PageContainer>;
  const set = (k: keyof Cfg, v: string) => setCfg({ ...cfg, [k]: v });

  const applyProvider = (id: string) => {
    setProviderId(id);
    const p = PRESETS.find(x => x.id === id);
    if (p) setCfg({ ...cfg, ai_provider: p.provider, ai_base_url: p.base, ai_model: p.model });
  };
  const preset = PRESETS.find(x => x.id === providerId);
  const needsKey = preset ? preset.needsKey : true;

  const testConnection = async () => {
    setTesting(true);
    try {
      const r = await api.aiTest();
      if (r.success) toast.success(r.message); else toast.error(r.message);
    } catch (e) { toast.error((e as Error).message); } finally { setTesting(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.aiSaveSettings({ ...cfg, ...(apiKey ? { api_key: apiKey } : {}) });
      const c = r.config as unknown as Cfg;
      setCfg(c); setApiKey(''); setProviderId(presetFor(c));
      toast.success(t('pg_ai.aiAgentSettingsSaved'));
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
        description={t('pg_ai.askAboutNmsNetwork')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('pg_ai.aiConnection')}>
          <div className="space-y-3">
            <Check label={t('pg_ai.enableAiAgent')} checked={cfg.ai_enabled === '1'} onChange={v => set('ai_enabled', v ? '1' : '0')} />
            <div>
              <label className="label-sm" htmlFor="ai-provider">{t('pg_ai.provider')}</label>
              <select id="ai-provider" className="input-field" value={providerId} onChange={e => applyProvider(e.target.value)}>
                {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                <option value="custom">{t('pg_ai.providerCustom')}</option>
              </select>
            </div>

            {needsKey ? (
              <div className="space-y-1.5">
                <Input
                  label={t('pg_ai.apiKey')}
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={cfg.has_key ? t('pg_ai.apiKeyKeep') : t('pg_ai.apiKeyPaste')}
                  autoComplete="off"
                  icon={<KeyRound size={15} />}
                />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {cfg.has_key
                    ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 size={13} />{t('pg_ai.apiKeySaved')}</span>
                    : <span className="text-warning">{t('pg_ai.apiKeyMissing')}</span>}
                  {preset?.keyUrl && (
                    <a href={preset.keyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                      {t('pg_ai.getKey', { name: preset.label })} <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-tx3">{t('pg_ai.noKeyNeeded')}</p>
            )}

            <div className="space-y-1.5">
              <Input label={t('pg_ai.model')} value={cfg.ai_model} onChange={e => set('ai_model', e.target.value)}
                helperText={t('pg_ai.modelHelp')} />
              {preset && cfg.ai_model !== preset.model && (
                <button type="button" onClick={() => set('ai_model', preset.model)}
                  className="text-xs text-accent hover:underline">
                  {t('pg_ai.useDefaultModel', { model: preset.model })}
                </button>
              )}
            </div>

            <details className="group rounded-lg border border-brd" open={providerId === 'custom'}>
              <summary className="flex items-center justify-between cursor-pointer select-none px-3 py-2 text-sm text-tx2">
                {t('pg_ai.advanced')}
                <ChevronDown size={15} className="transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-3 px-3 pb-3">
                <div>
                  <label className="label-sm" htmlFor="ai-format">{t('pg_ai.apiFormat')}</label>
                  <select id="ai-format" className="input-field" value={cfg.ai_provider} onChange={e => set('ai_provider', e.target.value)}
                    disabled={providerId !== 'custom'}>
                    <option value="anthropic">Claude API (Anthropic)</option>
                    <option value="openai">{t('pg_ai.openaiCompatible')}</option>
                  </select>
                  <p className="text-xs text-tx3 mt-1">{t('pg_ai.apiFormatHelp')}</p>
                </div>
                <Input label={t('pg_ai.baseUrl')} value={cfg.ai_base_url} onChange={e => set('ai_base_url', e.target.value)} />
                <Input label={t('pg_ai.maxAnswerTokens')} value={cfg.ai_max_tokens} inputMode="numeric"
                  onChange={e => set('ai_max_tokens', e.target.value.replace(/\D/g, ''))} />
              </div>
            </details>

            <p className="text-xs text-tx3">{t('pg_ai.subscriptionNote')}</p>
          </div>
        </Card>
        <Card title={t('pg_ai.channelsAccess')}>
          <div className="space-y-3">
            <Check label={t('pg_ai.whatsappBuiltInNms')} checked={cfg.ai_channel_whatsapp === '1'} onChange={v => set('ai_channel_whatsapp', v ? '1' : '0')} />
            <Check label={t('pg_ai.telegramTheBotUsed')} checked={cfg.ai_channel_telegram === '1'} onChange={v => set('ai_channel_telegram', v ? '1' : '0')} />
            <div>
              <label className="label-sm">{t('pg_ai.allowedSendersWaNumbers')}</label>
              <textarea className="input-field min-h-[80px]" value={cfg.ai_allowed_senders}
                onChange={e => set('ai_allowed_senders', e.target.value)} placeholder="6281234567890, 123456789" />
            </div>
            <div className="flex gap-2 text-xs text-tx3">
              <ShieldCheck size={16} className="shrink-0 text-accent" />
              <p>{t('pg_ai.accessNote')}</p>
            </div>
          </div>
        </Card>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={testConnection} loading={testing} icon={<PlugZap size={15} />}
          title={t('pg_ai.testHelp')}>{t('pg_ai.testConnection')}</Button>
        <Button onClick={save} loading={saving} icon={<Save size={15} />}>{t('pg_ai.save')}</Button>
      </div>
      <Card title={t('pg_ai.tryAsking')} className="mt-4">
        <div className="space-y-2 max-h-[45vh] overflow-y-auto mb-3">
          {chat.length === 0 && <p className="text-xs text-tx3">{t('pg_ai.commandsStartingWith')} <b>/</b> {t('pg_ai.areAnsweredStraightFrom')}</p>}
          {chat.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
              <span className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm text-left ${m.role === 'user' ? 'bg-accent/15 text-tx1' : 'bg-glass text-tx1'}`}>{m.role === 'ai' ? <WaText text={m.text} /> : m.text}</span>
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
            onKeyDown={e => e.key === 'Enter' && ask()} placeholder={t('pg_ai.typeAQuestionReset')} />
          <Button onClick={() => ask()} loading={asking} icon={<Send size={15} />}>{t('pg_ai.send')}</Button>
        </div>
      </Card>
    </PageContainer>
  );
}
