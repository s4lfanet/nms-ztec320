import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, CalendarClock, Database, PlugZap, RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import { Button, Card, Notice, StickyActionBar } from '../ui';
import { toast } from '../Toast';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/utils';
import { FIELDS } from './SnmpOverview';
import { DigestCard } from './SnmpDepend';

/** Pilihan yang masuk akal untuk tiap nilai; nilai tersimpan di luar daftar tetap ditampilkan. */
const POLL = [60, 120, 300, 600, 900, 1800, 3600];
const DISC = [1, 3, 6, 12, 24, 48, 168];
const RAW = [24, 48, 72, 168];
const HOURLY = [30, 90, 180, 400, 730, 1100];
const EVENTS = [7, 30, 90, 180, 365];
const TABLES = [5, 15, 30, 60, 180, 360, 1440];
const TABLES_KEEP = [24, 72, 168, 336, 720, 2160];

type Form = Record<string, string>;

export function SnmpSettings() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['snmp-settings'], queryFn: api.snmpSettings, refetchInterval: 60_000 });
  const [form, setForm] = useState<Form>({});
  const [saving, setSaving] = useState(false);

  const current = useMemo<Form>(() => {
    if (!data) return {};
    const o: Form = {};
    for (const [k, v] of Object.entries(data.general)) o[k] = String(v);
    for (const [k, v] of Object.entries(data.settings)) o[k] = String(v);
    o.snmp_default_version = data.new_device.snmp_version;
    o.snmp_default_community = data.new_device.community ?? '';
    return o;
  }, [data]);
  const val = (k: string) => form[k] ?? current[k] ?? '';
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const dirty = Object.entries(form).some(([k, v]) => v !== current[k]);

  if (!data) return <div className="glass-card h-64 skeleton-shimmer" />;

  const def = { ...data.general_defaults, ...data.defaults } as Record<string, number>;
  const defHint = (k: string, txt?: string) => (
    <span className="text-[11px] text-tx3">{t('snset.default', { v: txt ?? def[k] })}</span>
  );

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, number | string> = {};
      for (const [k, v] of Object.entries(form)) {
        if (v === current[k]) continue;
        if (k === 'snmp_default_version' || k === 'snmp_default_community') body[k] = v;
        else if (v !== '') body[k] = Number(v);
      }
      await api.snmpSettingsSave(body);
      await qc.invalidateQueries({ queryKey: ['snmp-settings'] });
      setForm({});
      toast.success(t('snset.saved'));
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  const resetDefaults = () => {
    const f: Form = {};
    for (const [k, v] of Object.entries(def)) f[k] = String(v);
    setForm(f);
    toast.info(t('snset.resetHint'));
  };

  const lc = data.last_cycle;
  const interval = Number(val('snmp_poll_interval')) || 300;
  const slow = lc.secs != null && lc.secs > interval * 0.8;
  const worst = (Number(val('snmp_timeout')) || 0) * ((Number(val('snmp_retries')) || 0) + 1);

  const choose = (k: string, opts: number[], label: (n: number) => string) => {
    const v = Number(val(k));
    const all = opts.includes(v) || !v ? opts : [...opts, v].sort((a, b) => a - b);
    return (
      <select className="input-field w-full" value={val(k)} onChange={e => set(k, e.target.value)}>
        {all.map(n => <option key={n} value={n}>{label(n)}</option>)}
      </select>
    );
  };
  const minutes = (n: number) => n >= 3600 ? t('snset.hours', { n: n / 3600 }) : t('snset.minutes', { n: n / 60 });
  const hours = (n: number) => n % 24 === 0 && n >= 48 ? t('snset.days', { n: n / 24 }) : t('snset.hours', { n });
  const days = (n: number) => t('snset.days', { n });
  const field = (label: string, control: React.ReactNode, hint?: React.ReactNode) => (
    <label className="text-xs text-tx2 flex flex-col gap-1 min-w-0">
      <span>{label}</span>
      {control}
      {hint}
    </label>
  );

  return (
    <div className="space-y-4">
      <Card title={t('snset.status')} icon={<Activity size={16} />}>
        {lc.at ? (
          <p className="text-sm text-tx2">
            {t('snset.lastCycle', { ago: timeAgo(lc.at), secs: lc.secs, n: lc.devices })}
            {lc.failed > 0 && <span className="text-warning"> · {t('snset.failed', { n: lc.failed })}</span>}
          </p>
        ) : <p className="text-sm text-tx3">{t('snset.noCycle')}</p>}
        {slow && <Notice tone="warn" className="mt-3">{t('snset.slow', { secs: lc.secs })}</Notice>}
      </Card>

      <Card title={t('snset.schedule')} icon={<CalendarClock size={16} />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field(t('snset.poll'), choose('snmp_poll_interval', POLL, minutes), <span className="text-[11px] text-tx3">{t('snset.pollHint')}</span>)}
          {field(t('snset.discovery'), choose('snmp_discovery_hours', DISC, hours), <span className="text-[11px] text-tx3">{t('snset.discoveryHint')}</span>)}
          {field(t('snset.tables'), choose('snmp_tables_minutes', TABLES, n => minutes(n * 60)), <span className="text-[11px] text-tx3">{t('snset.tablesHint')}</span>)}
        </div>
      </Card>

      <Card title={t('snset.connection')} icon={<PlugZap size={16} />}>
        <div className="grid grid-cols-2 gap-3">
          {field(t('snset.timeout'), <input type="number" inputMode="numeric" min={1} max={15} className="input-field w-full"
            value={val('snmp_timeout')} onChange={e => set('snmp_timeout', e.target.value)} />, defHint('snmp_timeout'))}
          {field(t('snset.retries'), <input type="number" inputMode="numeric" min={0} max={5} className="input-field w-full"
            value={val('snmp_retries')} onChange={e => set('snmp_retries', e.target.value)} />, defHint('snmp_retries'))}
        </div>
        <p className="text-[11px] text-tx3 mt-2">{t('snset.worst', { s: worst })}</p>
        <div className="border-t border-line mt-4 pt-4">
          <p className="text-xs text-tx2 mb-3">{t('snset.newDevice')}</p>
          <div className="grid grid-cols-2 gap-3">
            {field(t('snset.version'), (
              <select className="input-field w-full" value={val('snmp_default_version')} onChange={e => set('snmp_default_version', e.target.value)}>
                <option value="2c">v2c</option><option value="1">v1</option><option value="3">v3</option>
              </select>
            ))}
            {field(t('snset.community'), <input type="text" autoComplete="off" spellCheck={false} className="input-field w-full"
              value={val('snmp_default_community')} placeholder={t('snset.communityPh')}
              onChange={e => set('snmp_default_community', e.target.value)} />)}
          </div>
        </div>
      </Card>

      <Card title={t('snset.storage')} icon={<Database size={16} />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {field(t('snset.raw'), choose('snmp_raw_hours', RAW, hours),
            <span className="text-[11px] text-tx3">{t('snset.rows', { n: (data.volume?.raw ?? 0).toLocaleString('id-ID') })}</span>)}
          {field(t('snset.hourly'), choose('snmp_hourly_days', HOURLY, days),
            <span className="text-[11px] text-tx3">{t('snset.rows', { n: (data.volume?.hourly ?? 0).toLocaleString('id-ID') })}</span>)}
          {field(t('snset.events'), choose('snmp_event_days', EVENTS, days),
            <span className="text-[11px] text-tx3">{t('snset.rows', { n: (data.volume?.events ?? 0).toLocaleString('id-ID') })}</span>)}
          {field(t('snset.tablesKeep'), choose('snmp_tables_keep_hours', TABLES_KEEP, hours),
            <span className="text-[11px] text-tx3">{t('snset.rows', { n: ((data.volume?.arp ?? 0) + (data.volume?.fdb ?? 0)).toLocaleString('id-ID') })}</span>)}
        </div>
        <p className="text-[11px] text-tx3 mt-2">{t('snset.storageHint')}</p>
      </Card>

      <Card title={t('devx.thresholds')} icon={<SlidersHorizontal size={16} />}>
        <p className="text-xs text-tx3 mb-3">{t('devx.thresholdsHint')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FIELDS.map(f => (
            <label key={f.key} className="text-xs text-tx2 flex flex-col gap-1">
              <span>{t(`devx.th.${f.key}`)}</span>
              <span className="flex items-center gap-2">
                <input type="number" inputMode="decimal" step={f.step} className="input-field w-full"
                  value={val(f.key)} onChange={e => set(f.key, e.target.value)} />
                <span className="text-tx3 w-10 shrink-0">{t(`devx.unit.${f.unit}`)}</span>
              </span>
              {defHint(f.key)}
            </label>
          ))}
        </div>
      </Card>

      <DigestCard />

      <StickyActionBar>
        <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={resetDefaults}>{t('snset.reset')}</Button>
        <Button variant="primary" icon={<Save size={16} />} loading={saving} disabled={!dirty} onClick={save}>{t('common.save')}</Button>
      </StickyActionBar>
    </div>
  );
}
