import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ClipboardCopy, FileCode2, Flame, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button, Card, CodeBlock, Notice } from '../ui';
import { toast } from '../Toast';
import { api, type MtAudit, type MtSecSummary } from '../../lib/api';
import { buildFirewallScript, DEFAULT_FW, splitList, type FwOptions } from '../../lib/mtFirewall';
import { flag } from '../../lib/ua';
import { cn, timeAgo } from '../../lib/utils';
import { ipOriginText } from '../IpOrigin';

const SEV_TONE = { critical: 'text-danger', warning: 'text-warning', info: 'text-info' } as const;

function scoreTone(s: number | null | undefined) {
  if (s == null) return 'text-tx3';
  return s >= 85 ? 'text-success' : s >= 60 ? 'text-warning' : 'text-danger';
}

/** Audit konfigurasi per router: skor, temuan, cara memperbaiki, tombol audit sekarang. */
export function AuditCard({ routers, canEdit }: { routers: MtSecSummary['routers']; canEdit: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState<number | null>(routers.length === 1 ? routers[0].id : null);
  const [busy, setBusy] = useState<number | null>(null);

  const run = async (id: number) => {
    setBusy(id);
    try {
      const r = await api.mtSecurityAudit(id);
      toast.success(t('mtaud.done', { score: r.audit.score }));
      setOpen(id);
      await qc.invalidateQueries({ queryKey: ['mt-security'] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <Card title={t('mtaud.title')} icon={<ShieldCheck size={16} />}>
      <p className="text-xs text-tx2 mb-3">{t('mtaud.intro')}</p>
      <ul className="divide-y divide-line -my-2">
        {routers.map(r => {
          const a: MtAudit | null = r.audit;
          const crit = a?.findings.filter(f => f.severity === 'critical').length ?? 0;
          return (
            <li key={r.id} className="py-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <button type="button" className="flex items-center gap-2 min-w-0 text-left !min-h-0" aria-expanded={open === r.id}
                  onClick={() => setOpen(open === r.id ? null : r.id)} disabled={!a?.findings.length}>
                  <span className={cn('text-xl font-semibold num w-10 text-right', scoreTone(a?.score))}>{a?.score ?? '—'}</span>
                  <span className="min-w-0">
                    <span className="block text-sm text-tx1 truncate">{r.name}</span>
                    <span className="block text-xs text-tx3">
                      {a?.at ? t('mtaud.meta', { ago: timeAgo(a.at), v: a.version || '?', n: a.findings.length }) : t('mtaud.never')}
                      {crit > 0 && <span className="text-danger"> · {t('mtaud.crit', { n: crit })}</span>}
                    </span>
                  </span>
                  {!!a?.findings.length && <ChevronDown size={14} className={cn('text-tx3 transition-transform', open === r.id && 'rotate-180')} />}
                </button>
                {canEdit && (
                  <Button variant="secondary" className="ml-auto !py-1.5 text-xs" icon={<RefreshCw size={13} />}
                    loading={busy === r.id} disabled={busy !== null || !r.enabled} onClick={() => run(r.id)}>{t('mtaud.run')}</Button>
                )}
              </div>
              {a?.error && <p className="text-xs text-warning mt-1">{a.error}</p>}
              {open === r.id && a && (
                <ul className="reveal mt-2 space-y-2">
                  {a.findings.length === 0 && <li className="text-xs text-success">{t('mtaud.clean')}</li>}
                  {a.findings.map(f => (
                    <li key={f.id} className="rounded-lg bg-glass border border-line p-2.5">
                      <p className={cn('text-sm font-medium', SEV_TONE[f.severity])}>{t(`mtaud.sev_${f.severity}`)} · <span className="text-tx1">{f.title}</span></p>
                      <p className="text-xs text-tx2 mt-0.5">{f.detail}</p>
                      {f.fix && <code className="block mt-1.5 text-[11px] text-tx1 font-mono break-all bg-surface rounded px-2 py-1">{f.fix}</code>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Address-list firewall yang dipantau (nms-portscan, nms-portscan-lan, …). */
export function FwListsCard({ data }: { data: MtSecSummary }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card title={t('mtfw.title')} icon={<Flame size={16} />}>
      {data.fw_lists.length === 0 ? (
        <p className="text-sm text-tx3">{t('mtfw.empty')}</p>
      ) : (
        <ul className="divide-y divide-line -my-2">
          {data.fw_lists.map(g => {
            const k = `${g.router}|${g.list}`;
            const lan = g.list.toLowerCase().includes('lan');
            return (
              <li key={k} className="py-2.5">
                <button type="button" className="w-full flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-left !min-h-0"
                  onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k}>
                  <span className="text-sm font-medium text-tx1 font-mono">{g.list}</span>
                  <span className="text-xs text-tx3">{g.router}</span>
                  {lan && <span className="text-xs text-warning">{t('mtfw.lan')}</span>}
                  <span className={cn('text-sm num ml-auto', g.active ? 'text-danger font-semibold' : 'text-tx3')}>{t('mtfw.active', { n: g.active })}</span>
                  <span className="text-xs text-tx3">{t('mtfw.seen', { n: g.seen })}</span>
                  <ChevronDown size={14} className={cn('text-tx3 transition-transform self-center', open === k && 'rotate-180')} />
                </button>
                {open === k && (
                  <ul className="reveal mt-2 space-y-1.5">
                    {g.recent.map(x => {
                      const origin = x.customer ? { text: x.customer, muted: false } : ipOriginText(t, x.info, data.ip_lookup, true);
                      return (
                        <li key={x.ip} className="text-xs flex flex-wrap gap-x-3 gap-y-0.5">
                          <span className={cn('num', x.active ? 'text-tx1' : 'text-tx3 line-through')}>{flag(x.info?.country_code || '')} {x.ip}</span>
                          {origin.text && <span className={origin.muted ? 'text-tx3' : 'text-tx2'}>{origin.text}</span>}
                          {x.times > 1 && <span className="text-tx3">{t('mtfw.times', { n: x.times })}</span>}
                          <span className="text-tx3 ml-auto">{x.first_seen ? timeAgo(x.first_seen) : ''}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-tx3 mt-3">{t('mtfw.hint')}</p>
    </Card>
  );
}

const OPTS: (keyof Omit<FwOptions, 'wan' | 'admins'>)[] = ['portscanWan', 'portscanLan', 'bruteforce', 'synflood', 'dnsWan', 'services', 'proxySocks', 'dropWan'];

/** Generator script firewall: admin menyalin & menjalankan sendiri di router (NMS tidak menulis ke router). */
export function FirewallScriptCard() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [wan, setWan] = useState(DEFAULT_FW.wan.join(', '));
  const [admins, setAdmins] = useState('');
  const [opts, setOpts] = useState(DEFAULT_FW);
  const out = useMemo(() => buildFirewallScript({ ...opts, wan: splitList(wan), admins: splitList(admins) }), [opts, wan, admins]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(out.script); toast.success(t('mtfw.copied')); }
    catch { toast.error(t('mtfw.copyFail')); }
  };

  return (
    <div className="glass-card">
      <button type="button" onClick={() => setExpanded(x => !x)} aria-expanded={expanded} className="w-full section-header text-left !min-h-0">
        <span className="section-title"><FileCode2 size={16} />{t('mtfw.genTitle')}</span>
        <ChevronDown size={16} className={cn('text-tx3 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="p-4 md:p-5 space-y-4 reveal">
          <p className="text-xs text-tx2">{t('mtfw.genIntro')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-tx2 flex flex-col gap-1">
              <span>{t('mtfw.wan')}</span>
              <input className="input-field w-full font-mono" value={wan} onChange={e => setWan(e.target.value)} spellCheck={false} />
              <span className="text-[11px] text-tx3">{t('mtfw.wanHint')}</span>
            </label>
            <label className="text-xs text-tx2 flex flex-col gap-1">
              <span>{t('mtfw.admins')}</span>
              <textarea rows={2} className="input-field w-full font-mono text-xs" value={admins} spellCheck={false}
                placeholder="203.0.113.10&#10;10.10.0.250" onChange={e => setAdmins(e.target.value)} />
              <span className="text-[11px] text-tx3">{t('mtfw.adminsHint')}</span>
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {OPTS.map(k => (
              <label key={k} className="flex items-start gap-2 text-sm text-tx1 cursor-pointer">
                <input type="checkbox" className="mt-1 accent-[var(--color-accent)]" checked={opts[k]}
                  onChange={e => setOpts(o => ({ ...o, [k]: e.target.checked }))} />
                <span>{t(`mtfw.o_${k}`)}<span className="block text-xs text-tx3">{t(`mtfw.oh_${k}`)}</span></span>
              </label>
            ))}
          </div>
          {!splitList(admins).length && <Notice tone="warn">{t('mtfw.noAdmin')}</Notice>}
          {out.invalid.length > 0 && <Notice tone="warn">{t('mtfw.invalid', { list: out.invalid.join(', ') })}</Notice>}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-tx2">{t('mtfw.script')}</span>
              <Button variant="secondary" className="!py-1.5 text-xs" icon={<ClipboardCopy size={13} />} onClick={copy}>{t('mtfw.copy')}</Button>
            </div>
            <CodeBlock maxHeight="max-h-80">{out.script}</CodeBlock>
          </div>
          <Notice tone="info">{t('mtfw.safe')}</Notice>
        </div>
      )}
    </div>
  );
}
