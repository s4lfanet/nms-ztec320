import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Router, SlidersHorizontal, Star } from 'lucide-react';
import { Button, Card, Modal } from '../ui';
import { toast } from '../Toast';
import { api, type SnmpPortBrief, type SnmpProblem, type SnmpSummary } from '../../lib/api';
import { cn, timeAgo } from '../../lib/utils';
import { fmtBps, fmtSpeed } from '../../lib/snmpFormat';

export const useSnmpSummary = (enabled = true) => useQuery({
  queryKey: ['snmp-summary'], queryFn: api.snmpSummary, refetchInterval: 60_000, enabled,
});

function problemLabel(p: SnmpProblem, t: (k: string, o?: Record<string, unknown>) => string) {
  if (p.category === 'device_down') return t('dev.st.down');
  if (p.category === 'device_warn') return t('dev.st.warn');
  // judul dari server (sudah berisi nama perangkat/port); emoji depan dibuang — titik warna sudah ada
  return p.title.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, '');
}

export function ProblemList({ problems, limit }: { problems: SnmpProblem[]; limit?: number }) {
  const { t } = useTranslation();
  const list = limit ? problems.slice(0, limit) : problems;
  if (list.length === 0) {
    return (
      <p className="flex items-center gap-2 py-2 text-sm text-tx3">
        <CheckCircle2 size={16} className="text-success" />{t('devx.noProblems')}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {list.map((p, i) => (
        <li key={`${p.category}-${p.device_id}-${p.port_id ?? 0}-${i}`}>
          <Link to={`/dashboard/devices/${p.device_id}`} className="flex items-start gap-2 py-2 hover:bg-glass rounded-md px-1">
            <span className={cn('mt-1.5 w-2 h-2 rounded-full shrink-0', p.severity === 'critical' ? 'bg-danger' : 'bg-warning')} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-tx1 break-words">
                {p.category.startsWith('device_') && <span className="text-tx2">{p.device_name} · </span>}
                {problemLabel(p, t)}
              </span>
              <span className="block text-xs text-tx3">
                {t(`devx.cat.${p.category}`, { defaultValue: p.category })}{p.since ? ` · ${timeAgo(p.since)}` : ''}
              </span>
            </span>
          </Link>
        </li>
      ))}
      {limit && problems.length > limit && (
        <li className="pt-2 text-xs"><Link to="/dashboard/devices" className="text-accent">{t('devx.moreProblems', { n: problems.length - limit })}</Link></li>
      )}
    </ul>
  );
}

function UtilBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-tx3">—</span>;
  const tone = pct >= 80 ? 'bg-danger' : pct >= 60 ? 'bg-warning' : 'bg-success';
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span className="w-14 h-1.5 rounded-full bg-line overflow-hidden" aria-hidden="true">
        <span className={cn('block h-full', tone)} style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      {pct}%
    </span>
  );
}

export function PortList({ ports, empty }: { ports: SnmpPortBrief[]; empty: string }) {
  const { t } = useTranslation();
  if (ports.length === 0) return <p className="text-sm text-tx3 py-2">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {ports.map(p => (
        <li key={p.port_id}>
          <Link to={`/dashboard/devices/${p.device_id}?tab=ports`} className="py-2 px-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 hover:bg-glass rounded-md">
            <span className="min-w-0 sm:w-[42%]">
              <span className="flex items-center gap-1.5 text-sm text-tx1 min-w-0">
                <span className={cn('w-2 h-2 rounded-full shrink-0', p.oper_status === 'up' ? 'bg-success' : 'bg-danger')} />
                <span className="truncate">{p.device_name} · {p.name}</span>
                {p.speed_mbps ? <span className="text-xs text-tx3 shrink-0">{fmtSpeed(p.speed_mbps)}</span> : null}
              </span>
              {p.alias && <span className="block text-xs text-tx3 truncate pl-3.5">{p.alias}</span>}
            </span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tx2 pl-3.5 sm:pl-0 sm:flex-1">
              {p.oper_status === 'up' ? (
                <>
                  <span title={t('dev.in')}>↓ {fmtBps(p.in_bps)}</span>
                  <span title={t('dev.out')}>↑ {fmtBps(p.out_bps)}</span>
                  <UtilBar pct={p.util_pct} />
                  {p.err_rate > 0 && <span className="text-warning">{t('dev.errors', { n: p.err_rate.toFixed(2) })}</span>}
                </>
              ) : <span className="text-danger">{t(`dev.oper.${p.oper_status}`, { defaultValue: p.oper_status || '—' })}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Bagian atas halaman Perangkat: masalah aktif, port dipantau, trafik teratas. */
export function DevicesOverview({ summary }: { summary: SnmpSummary }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card title={t('devx.problems')} icon={<AlertTriangle size={16} />} bodyClassName="p-3">
        <ProblemList problems={summary.problems} limit={8} />
      </Card>
      <Card title={t('devx.watched')} icon={<Star size={16} />} bodyClassName="p-3">
        <PortList ports={summary.watched_ports} empty={t('devx.noWatched')} />
      </Card>
      <Card title={t('devx.topTraffic')} className="lg:col-span-2" bodyClassName="p-3">
        <PortList ports={summary.top_ports} empty={t('devx.noTraffic')} />
      </Card>
    </div>
  );
}

/** Kartu ringkas di Dashboard utama — hanya muncul bila ada perangkat SNMP. */
export function NetworkDevicesCard() {
  const { t } = useTranslation();
  const { data } = useSnmpSummary();
  if (!data || data.counts.total === 0) return null;
  const c = data.counts;
  return (
    <Card title={t('devx.dashTitle')} icon={<Router size={16} />} bodyClassName="p-3"
      action={<Link to="/dashboard/devices" className="text-xs text-accent">{t('devx.openDevices')}</Link>}>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tx2 mb-2">
        <span><b className="text-success tabular-nums">{c.up}</b> {t('dev.st.up')}</span>
        {c.down > 0 && <span><b className="text-danger tabular-nums">{c.down}</b> {t('dev.st.down')}</span>}
        {c.warn > 0 && <span><b className="text-warning tabular-nums">{c.warn}</b> {t('dev.st.warn')}</span>}
        <span className="text-tx3">{t('devx.ofTotal', { n: c.total })}</span>
      </div>
      <ProblemList problems={data.problems} limit={3} />
      {data.top_ports.length > 0 && (
        <div className="mt-2 pt-2 border-t border-line">
          <div className="text-xs text-tx3 mb-1">{t('devx.topTraffic')}</div>
          <PortList ports={data.top_ports.slice(0, 2)} empty="" />
        </div>
      )}
    </Card>
  );
}

export const FIELDS: { key: string; step: number; unit: string }[] = [
  { key: 'snmp_down_minutes', step: 1, unit: 'min' },
  { key: 'snmp_util_threshold', step: 1, unit: '%' },
  { key: 'snmp_util_cycles', step: 1, unit: 'poll' },
  { key: 'snmp_err_threshold', step: 0.1, unit: 'err' },
  { key: 'snmp_flap_count', step: 1, unit: 'x' },
  { key: 'snmp_flap_minutes', step: 1, unit: 'min' },
  { key: 'snmp_cpu_threshold', step: 1, unit: '%' },
  { key: 'snmp_cpu_cycles', step: 1, unit: 'poll' },
  { key: 'snmp_temp_threshold', step: 1, unit: '°C' },
  { key: 'snmp_rx_low_dbm', step: 0.5, unit: 'dBm' },
  { key: 'snmp_wifi_weak_dbm', step: 1, unit: 'dBm' },
  { key: 'snmp_hold_minutes', step: 1, unit: 'min' },
];

export function AlertThresholdsButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" icon={<SlidersHorizontal size={16} />} onClick={() => setOpen(true)}>{t('devx.thresholds')}</Button>
      {open && <ThresholdsModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ThresholdsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['snmp-settings'], queryFn: api.snmpSettings });
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [grp, setGrp] = useState('');
  const [fa, setFa] = useState<Record<string, string>>({});
  const faVal = (k: 'flow_anomaly_min_gb' | 'flow_anomaly_factor') => fa[k] ?? String(data?.flow_anomaly?.[k] ?? '');
  const faOn = fa.flow_anomaly_enabled != null ? fa.flow_anomaly_enabled === '1' : !!data?.flow_anomaly?.flow_anomaly_enabled;
  const [gform, setGform] = useState<Record<string, Record<string, string>>>({});
  const gval = (g: string, k: string) => gform[g]?.[k] ?? (data?.group_overrides?.[g]?.[k] != null ? String(data.group_overrides[g][k]) : '');
  const val = (k: string) => form[k] ?? (data ? String(data.settings[k]) : '');
  const save = async () => {
    setSaving(true);
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
      const ovr: Record<string, Record<string, number>> = {};
      for (const g of data?.groups ?? []) {
        for (const f of FIELDS) {
          const v = gval(g, f.key);
          if (v !== '') (ovr[g] ??= {})[f.key] = Number(v);
        }
      }
      const faBody: Record<string, number> = {};
      for (const [k, v] of Object.entries(fa)) if (v !== '') faBody[k] = Number(v);
      await api.snmpSettingsSave({ ...body, ...faBody, group_overrides: ovr });
      qc.invalidateQueries({ queryKey: ['snmp-settings'] });
      toast.success(t('devx.thresholdsSaved'));
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={t('devx.thresholds')} icon={<SlidersHorizontal size={18} />} size="md"
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" loading={saving} onClick={save}>{t('common.save')}</Button>
      </>}>
      <p className="text-xs text-tx3 mb-3">{t('devx.thresholdsHint')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FIELDS.map(f => (
          <label key={f.key} className="text-xs text-tx2 flex flex-col gap-1">
            <span>{t(`devx.th.${f.key}`)}</span>
            <span className="flex items-center gap-2">
              <input type="number" inputMode="decimal" step={f.step} className="input-field w-full"
                value={val(f.key)} onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))} />
              <span className="text-tx3 w-10 shrink-0">{t(`devx.unit.${f.unit}`)}</span>
            </span>
          </label>
        ))}
      </div>
      {data?.flow_anomaly && (
        <div className="mt-4 pt-3 border-t border-line">
          <div className="text-sm font-medium text-tx1">{t('devx.faTitle')}</div>
          <p className="text-xs text-tx3 mb-2">{t('devx.faHint')}</p>
          <label className="inline-flex items-center gap-2 text-xs text-tx2 mb-2">
            <input type="checkbox" checked={faOn} onChange={e => setFa(s => ({ ...s, flow_anomaly_enabled: e.target.checked ? '1' : '0' }))} />
            {t('devx.faEnabled')}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-tx2 flex flex-col gap-1">
              <span>{t('devx.faMinGb')}</span>
              <input type="number" inputMode="decimal" step={0.5} className="input-field w-full" value={faVal('flow_anomaly_min_gb')}
                onChange={e => setFa(s => ({ ...s, flow_anomaly_min_gb: e.target.value }))} />
            </label>
            <label className="text-xs text-tx2 flex flex-col gap-1">
              <span>{t('devx.faFactor')}</span>
              <input type="number" inputMode="decimal" step={0.5} className="input-field w-full" value={faVal('flow_anomaly_factor')}
                onChange={e => setFa(s => ({ ...s, flow_anomaly_factor: e.target.value }))} />
            </label>
          </div>
        </div>
      )}
      {(data?.groups?.length ?? 0) > 0 && (
        <div className="mt-4 pt-3 border-t border-line">
          <div className="text-sm font-medium text-tx1">{t('devx.grpTitle')}</div>
          <p className="text-xs text-tx3 mb-2">{t('devx.grpHint')}</p>
          <select className="input-field w-full mb-2" value={grp} onChange={e => setGrp(e.target.value)}>
            <option value="">{t('devx.grpPick')}</option>
            {data!.groups!.map(g => <option key={g} value={g}>{g}{data!.group_overrides?.[g] ? ' •' : ''}</option>)}
          </select>
          {grp && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FIELDS.map(f => (
                <label key={f.key} className="text-xs text-tx2 flex flex-col gap-1">
                  <span>{t(`devx.th.${f.key}`)}</span>
                  <span className="flex items-center gap-2">
                    <input type="number" inputMode="decimal" step={f.step} className="input-field w-full"
                      placeholder={val(f.key)} value={gval(grp, f.key)}
                      onChange={e => setGform(s => ({ ...s, [grp]: { ...(s[grp] ?? {}), [f.key]: e.target.value } }))} />
                    <span className="text-tx3 w-10 shrink-0">{t(`devx.unit.${f.unit}`)}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
