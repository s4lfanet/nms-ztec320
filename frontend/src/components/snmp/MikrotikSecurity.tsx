import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bot, ChevronDown, KeyRound, Router, Save, ShieldAlert, ShieldCheck, SlidersHorizontal, UserCog, Crosshair } from 'lucide-react';
import { Button, Card, EmptyState, Notice } from '../ui';
import { toast } from '../Toast';
import { api, type MtSecSettings, type MtSecSummary } from '../../lib/api';
import { flag } from '../../lib/ua';
import { cn, timeAgo } from '../../lib/utils';
import { ipOriginText } from '../IpOrigin';
import { AuditCard, FirewallScriptCard, FwListsCard } from './MikrotikSecurityExtra';

const RANGES = [24, 24 * 7, 24 * 30];
type EvFilter = 'all' | 'login_fail' | 'login_ok' | 'user_change' | 'fw_list' | 'audit';

const KIND_TONE: Record<string, string> = {
  bruteforce: 'text-danger', distributed: 'text-danger', success_after_fail: 'text-danger',
  new_ip: 'text-warning', user_change: 'text-warning', fw_list: 'text-warning', audit: 'text-danger',
};

/** Tab Keamanan di Monitoring SNMP: brute force & login mencurigakan ke router MikroTik (API). */
export function MikrotikSecurity({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const [hours, setHours] = useState(24);
  const [evFilter, setEvFilter] = useState<EvFilter>('all');
  const [ipFilter, setIpFilter] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['mt-security', hours], queryFn: () => api.mtSecurity(hours), refetchInterval: 30_000,
  });

  if (isLoading || !data) return <div className="glass-card h-64 skeleton-shimmer" />;
  if (data.routers.length === 0) {
    return (
      <EmptyState icon={ShieldCheck} title={t('mtsec.emptyTitle')} description={t('mtsec.emptyDesc')}
        action={<Link to="/dashboard/settings/mikrotik" className="btn-primary px-4 py-2 rounded-lg text-sm">{t('mtsec.addRouter')}</Link>} />
    );
  }

  const tot = data.totals;
  const events = groupEvents(data.events.filter(e => (evFilter === 'all' || e.kind === evFilter) && (!ipFilter || e.ip === ipFilter)));
  const openAlerts = data.alerts.filter(a => !a.closed_at);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-tx2 max-w-2xl">{t('mtsec.intro')}</p>
        <div className="inline-flex rounded-lg border border-line overflow-hidden" role="radiogroup" aria-label={t('mtsec.range')}>
          {RANGES.map(h => (
            <button key={h} type="button" role="radio" aria-checked={hours === h} onClick={() => setHours(h)}
              className={cn('px-3 py-1.5 text-xs !min-h-0', hours === h ? 'bg-accent/15 text-accent' : 'text-tx2 hover:text-tx1')}>
              {h === 24 ? t('mtsec.r24') : h === 168 ? t('mtsec.r7') : t('mtsec.r30')}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label={t('mtsec.fails')} value={tot.fails} tone={tot.fails ? 'warn' : 'ok'} />
        <Stat label={t('mtsec.attackers')} value={tot.attackers} tone={tot.attackers ? 'warn' : 'ok'} />
        <Stat label={t('mtsec.alertsOpen')} value={tot.open_alerts} tone={tot.open_alerts ? 'crit' : 'ok'} />
        <Stat label={t('mtsec.logins')} value={tot.logins} />
        <Stat label={t('mtsec.userChanges')} value={tot.user_changes} tone={tot.user_changes ? 'warn' : undefined} />
        <Stat label={t('mtsec.fwNew')} value={tot.fw_new} tone={tot.fw_new ? 'warn' : undefined} />
      </div>

      {openAlerts.length > 0 && (
        <Notice tone="crit" title={t('mtsec.activeTitle', { n: openAlerts.length })}>{t('mtsec.activeHint')}</Notice>
      )}

      <Card title={t('mtsec.routers')} icon={<Router size={16} />}>
        <ul className="divide-y divide-line -my-2">
          {data.routers.map(r => (
            <li key={r.id} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className={cn('w-2 h-2 rounded-full shrink-0', !r.enabled ? 'bg-tx3' : r.error ? 'bg-warning' : r.reachable ? 'bg-success' : 'bg-danger')} aria-hidden />
              <span className="font-medium text-tx1 min-w-0 truncate">{r.name}</span>
              <span className="text-xs text-tx3 num">{r.host}</span>
              <span className="text-xs text-tx2">{t('mtsec.routerFails', { n: r.fails, ip: r.attackers })}</span>
              {r.learning && <span className="text-xs text-info">{t('mtsec.learning')}</span>}
              <span className="text-xs text-tx3 sm:ml-auto">
                {r.last_read_at ? t('mtsec.lastRead', { ago: timeAgo(r.last_read_at) }) : t('mtsec.notRead')}
              </span>
              {r.error && <p className="basis-full text-xs text-warning">{r.error} — {t('mtsec.permHint')}</p>}
            </li>
          ))}
        </ul>
      </Card>

      <SecAlerts alerts={data.alerts} />

      <AuditCard routers={data.routers} canEdit={canEdit} />

      <FwListsCard data={data} />

      <Card title={t('mtsec.topIps')} icon={<Crosshair size={16} />}>
        {data.attackers.length === 0 ? <p className="text-sm text-tx3">{t('mtsec.noAttack')}</p> : (
          <ul className="divide-y divide-line -my-2">
            {data.attackers.map(a => {
              const origin = ipOriginText(t, a.info, data.ip_lookup, a.ip !== '(tanpa IP)');
              return (
                <li key={a.ip} className="py-2.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-sm">
                  <button type="button" onClick={() => { setIpFilter(ipFilter === a.ip ? '' : a.ip); setEvFilter('all'); }}
                    title={t('mtsec.filterIp')} className="text-left min-w-0 !min-h-0 !h-auto p-0 font-medium text-tx1 hover:text-accent num truncate">
                    {flag(a.info?.country_code || '')} {a.ip}
                  </button>
                  <span className="text-danger font-semibold num text-right">{t('mtsec.times', { n: a.count })}</span>
                  {origin.text && <span className={cn('text-xs col-span-2 truncate', origin.muted ? 'text-tx3' : 'text-tx2')}>{origin.text}</span>}
                  <span className="text-xs text-tx3 col-span-2">
                    {t('mtsec.ipMeta', { users: a.users.join(', '), via: a.via.join(', ') || '—', routers: a.routers.join(', ') })}
                    {a.last && ` · ${timeAgo(a.last)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {data.ip_lookup === 'ipinfo' && <p className="text-[11px] text-tx3 mt-3">{t('iplog.attribution')}</p>}
      </Card>

      <Card title={t('mtsec.events')} icon={<KeyRound size={16} />}
        action={ipFilter ? (
          <button type="button" className="text-xs text-accent !min-h-0" onClick={() => setIpFilter('')}>{t('mtsec.clearIp', { ip: ipFilter })}</button>
        ) : undefined}>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(['all', 'login_fail', 'login_ok', 'user_change', 'fw_list', 'audit'] as EvFilter[]).map(k => (
            <button key={k} type="button" onClick={() => setEvFilter(k)} aria-pressed={evFilter === k}
              className={cn('px-2.5 py-1 rounded-full text-xs border !min-h-0', evFilter === k ? 'border-accent bg-accent/10 text-accent' : 'border-line text-tx2 hover:text-tx1')}>
              {t(`mtsec.ev_${k}`)}
            </button>
          ))}
        </div>
        {events.length === 0 ? <p className="text-sm text-tx3">{t('mtsec.noEvents')}</p> : (
          <ul className="divide-y divide-line -my-1">
            {events.slice(0, 60).map(e => (
              <li key={e.id} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
                <span className={cn('font-medium', e.kind === 'login_fail' || e.kind === 'audit' ? 'text-danger' : e.kind === 'login_ok' ? 'text-success' : 'text-warning')}>
                  {t(`mtsec.ev_${e.kind}`)}
                </span>
                {e.n > 1 && <span className="text-tx1 font-semibold num">{t('mtsec.times', { n: e.n })}</span>}
                {e.kind === 'audit' ? <span className="text-tx1">{e.message}</span> : <span className={cn('text-tx1', e.kind === 'fw_list' && 'font-mono')}>{e.user}</span>}
                {e.ip && <span className="num text-tx2">{e.ip}</span>}
                {e.via && e.kind !== 'fw_list' && <span className="text-tx3">{t('mtsec.via', { via: e.via })}</span>}
                {e.by && e.kind === 'user_change' && <span className="text-tx3">{t('mtsec.by', { by: e.by })}</span>}
                {e.new_ip && <span className="text-warning">{t('mtsec.newIp')}</span>}
                <span className="text-tx3">{e.router}</span>
                <span className="text-tx3 ml-auto">{e.at ? timeAgo(e.at) : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canEdit && <FirewallScriptCard />}

      {canEdit && <SecSettings />}
    </div>
  );
}

/** Peristiwa beruntun yang sama (jenis, user, IP, layanan, router) digabung jadi satu baris + jumlah. */
function groupEvents(evs: MtSecSummary['events']) {
  const out: (MtSecSummary['events'][number] & { n: number })[] = [];
  for (const e of evs) {
    const last = out[out.length - 1];
    if (last && last.kind === e.kind && last.user === e.user && last.ip === e.ip && last.via === e.via
      && last.router === e.router && last.by === e.by && !e.new_ip && !last.new_ip) last.n += 1;
    else out.push({ ...e, n: 1 });
  }
  return out;
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' | 'crit' }) {
  return (
    <div className="glass-card p-3">
      <div className={cn('text-2xl font-semibold num', tone === 'crit' ? 'text-danger' : tone === 'warn' ? 'text-warning' : 'text-tx1')}>{value}</div>
      <div className="text-xs text-tx2 mt-0.5">{label}</div>
    </div>
  );
}

function SecAlerts({ alerts }: { alerts: MtSecSummary['alerts'] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Card title={t('mtsec.alerts')} icon={<ShieldAlert size={16} />}>
      {alerts.length === 0 ? <p className="text-sm text-tx3">{t('mtsec.noAlerts')}</p> : (
        <ul className="divide-y divide-line -my-2">
          {alerts.map(a => (
            <li key={a.id} className="py-2.5 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className={cn('font-medium', KIND_TONE[a.kind] || 'text-tx1')}>{t(`mtsec.kind_${a.kind}`)}</span>
                <span className="text-tx1">{a.router}</span>
                {a.key && a.kind !== 'audit' && <span className="num text-tx2">{a.key.replace('|', ' · ')}</span>}
                {a.count > 1 && <span className="text-xs text-tx2">{t('mtsec.times', { n: a.count })}</span>}
                <span className={cn('text-xs', a.closed_at ? 'text-tx3' : 'text-danger')}>
                  {a.closed_at ? (['bruteforce', 'distributed'].includes(a.kind) ? t('mtsec.stopped') : t('mtsec.sent')) : t('mtsec.ongoing')}
                </span>
                <span className="text-xs text-tx3 ml-auto">{a.opened_at ? timeAgo(a.opened_at) : ''}</span>
              </div>
              {a.detail && <p className="text-xs text-tx3 mt-0.5">{a.detail}</p>}
              {a.ai_text && (
                <div className="mt-1.5">
                  <button type="button" className="text-xs text-accent inline-flex items-center gap-1 !min-h-0"
                    onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
                    <Bot size={13} /> {t('mtsec.aiShow')}
                    <ChevronDown size={13} className={cn('transition-transform', open === a.id && 'rotate-180')} />
                  </button>
                  {open === a.id && <p className="reveal mt-1.5 text-xs text-tx2 whitespace-pre-line rounded-lg bg-glass border border-line p-2.5">{a.ai_text}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const NUM_FIELDS: { key: keyof MtSecSettings; unit: string }[] = [
  { key: 'mt_sec_fw_digest_minutes', unit: 'min' },
  { key: 'mt_audit_hours', unit: 'h' },
  { key: 'mt_sec_bf_threshold', unit: '×' },
  { key: 'mt_sec_bf_minutes', unit: 'min' },
  { key: 'mt_sec_dist_threshold', unit: '×' },
  { key: 'mt_sec_quiet_minutes', unit: 'min' },
  { key: 'mt_sec_interval', unit: 's' },
  { key: 'mt_sec_retention_days', unit: 'd' },
];
const TOGGLES: (keyof MtSecSettings)[] = ['mt_sec_enabled', 'mt_sec_alert_success', 'mt_sec_alert_new_ip', 'mt_sec_alert_user_change',
  'mt_sec_alert_fw', 'mt_sec_alert_audit', 'mt_sec_ai_analysis'];

function SecSettings() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const { data } = useQuery({ queryKey: ['mt-security-settings'], queryFn: api.mtSecuritySettings, enabled: expanded });
  const [form, setForm] = useState<Partial<MtSecSettings>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!expanded) setForm({}); }, [expanded]);
  const cur = data?.settings;
  const val = useMemo(() => (k: keyof MtSecSettings) => (form[k] ?? cur?.[k] ?? ''), [form, cur]);
  const dirty = cur ? (Object.keys(form) as (keyof MtSecSettings)[]).some(k => String(form[k]) !== String(cur[k])) : false;

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.mtSecuritySave(form);
      await qc.invalidateQueries({ queryKey: ['mt-security-settings'] });
      setForm({});
      if (r.invalid.length) toast.warning(t('mtsec.invalidWl', { list: r.invalid.join(', ') }));
      else toast.success(t('mtsec.saved'));
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  return (
    <div className="glass-card">
      <button type="button" onClick={() => setExpanded(x => !x)} aria-expanded={expanded}
        className="w-full section-header text-left !min-h-0">
        <span className="section-title"><SlidersHorizontal size={16} />{t('mtsec.settings')}</span>
        <ChevronDown size={16} className={cn('text-tx3 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="p-4 md:p-5 space-y-4 reveal">
          {!cur ? <div className="h-40 skeleton-shimmer rounded-lg" /> : <>
            <div className="space-y-2">
              {TOGGLES.map(k => (
                <label key={k} className="flex items-start gap-2.5 text-sm text-tx1 cursor-pointer">
                  <input type="checkbox" className="mt-1 accent-[var(--color-accent)]" checked={Number(val(k)) === 1}
                    onChange={e => setForm(f => ({ ...f, [k]: e.target.checked ? 1 : 0 }))} />
                  <span>
                    {t(`mtsec.f_${k}`)}
                    <span className="block text-xs text-tx3">{t(`mtsec.h_${k}`)}</span>
                    {k === 'mt_sec_ai_analysis' && !data?.ai_enabled && <span className="block text-xs text-warning">{t('mtsec.aiOff')}</span>}
                  </span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {NUM_FIELDS.map(({ key, unit }) => {
                const [lo, hi] = data!.limits[key] || [0, 9999];
                return (
                  <label key={key} className="text-xs text-tx2 flex flex-col gap-1 min-w-0">
                    <span>{t(`mtsec.f_${key}`)}</span>
                    <div className="flex items-center gap-2">
                      <input type="number" inputMode="numeric" min={lo} max={hi} className="input-field w-full"
                        value={String(val(key))} onChange={e => setForm(f => ({ ...f, [key]: e.target.value as unknown as number }))} />
                      <span className="text-tx3 shrink-0">{t(`mtsec.u_${unit}`)}</span>
                    </div>
                  </label>
                );
              })}
            </div>
            <label className="text-xs text-tx2 flex flex-col gap-1">
              <span><UserCog size={13} className="inline mr-1" />{t('mtsec.f_mt_sec_whitelist')}</span>
              <textarea rows={3} className="input-field w-full font-mono text-xs" spellCheck={false}
                placeholder="203.0.113.10&#10;10.0.0.0/8" value={String(val('mt_sec_whitelist'))}
                onChange={e => setForm(f => ({ ...f, mt_sec_whitelist: e.target.value }))} />
              <span className="text-[11px] text-tx3">{t('mtsec.h_mt_sec_whitelist')}</span>
            </label>
            <label className="text-xs text-tx2 flex flex-col gap-1">
              <span>{t('mtsec.f_mt_sec_fw_lists')}</span>
              <textarea rows={3} className="input-field w-full font-mono text-xs" spellCheck={false}
                value={String(val('mt_sec_fw_lists'))} onChange={e => setForm(f => ({ ...f, mt_sec_fw_lists: e.target.value }))} />
              <span className="text-[11px] text-tx3">{t('mtsec.h_mt_sec_fw_lists')}</span>
            </label>
            <Notice tone="info">{t('mtsec.howto')}</Notice>
            <div className="flex justify-end">
              <Button variant="primary" icon={<Save size={16} />} disabled={!dirty || saving} loading={saving} onClick={save}>{t('mtsec.save')}</Button>
            </div>
          </>}
        </div>
      )}
    </div>
  );
}
