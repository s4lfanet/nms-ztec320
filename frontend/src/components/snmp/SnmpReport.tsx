import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Download, FileBarChart } from 'lucide-react';
import { Card, LoadingOverlay } from '../ui';
import { api, type SnmpReportPort } from '../../lib/api';
import { fmtBps, fmtSpeed } from '../../lib/snmpFormat';
import { cn } from '../../lib/utils';

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function fmtBytes(b: number) {
  if (!b) return '0';
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0; let n = b;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return `${n >= 100 ? n.toFixed(0) : n.toFixed(1)} ${u[i]}`;
}

const pctTone = (v: number | null) => v == null ? 'text-tx3' : v >= 80 ? 'text-danger' : v >= 60 ? 'text-warning' : 'text-tx1';

/** Laporan bulanan: ketersediaan perangkat + rata-rata/95%/puncak/volume per port. */
export function SnmpReport() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(thisMonth());
  const [scope, setScope] = useState<'watched' | 'all'>('watched');
  const tz = -new Date().getTimezoneOffset();
  const q = { month, scope, tz };
  const { data, isLoading } = useQuery({ queryKey: ['snmp-report', q], queryFn: () => api.snmpReport(q) });
  return (
    <div className="space-y-3">
      <Card bodyClassName="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-tx2 flex flex-col gap-1">
            {t('devx.month')}
            <input type="month" className="input-field !w-auto" value={month} max={thisMonth()}
              onChange={e => e.target.value && setMonth(e.target.value)} />
          </label>
          <label className="text-xs text-tx2 flex flex-col gap-1">
            {t('devx.scope')}
            <select className="input-field !w-auto" value={scope} onChange={e => setScope(e.target.value as typeof scope)}>
              <option value="watched">{t('devx.scopeWatched')}</option>
              <option value="all">{t('devx.scopeAll')}</option>
            </select>
          </label>
          <a className="btn-cancel border border-line inline-flex items-center gap-1.5 text-sm ml-auto px-3 py-2 rounded-lg" href={api.snmpReportCsvUrl(q)} download>
            <Download size={14} />{t('devx.csv')}
          </a>
        </div>
        <p className="text-xs text-tx3 mt-2">{t('devx.reportHint')}</p>
      </Card>
      {isLoading || !data ? <LoadingOverlay /> : (
        <>
          <Card title={t('devx.devAvail')} icon={<FileBarChart size={16} />} bodyClassName="p-3">
            {data.devices.length === 0 ? <p className="text-sm text-tx3">{t('devx.noData')}</p> : (
              <ul className="divide-y divide-line">
                {data.devices.map(d => (
                  <li key={d.device_id} className="py-2 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                    <span className="text-sm text-tx1 sm:w-[34%] truncate">{d.device_name} <span className="text-xs text-tx3 font-mono">{d.host}</span></span>
                    <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tx2">
                      <span>{t('devx.availability')}: <b className={cn('tabular-nums', d.availability_pct != null && d.availability_pct < 99.5 ? 'text-warning' : 'text-tx1')}>
                        {d.availability_pct != null ? `${d.availability_pct}%` : '—'}</b>
                        {d.downtime_min ? <span className="text-tx3"> ({t('devx.downMin', { n: d.downtime_min })})</span> : null}</span>
                      <span>{t('devx.cpuAvgMax')}: <b className="tabular-nums text-tx1">{d.cpu_avg != null ? `${d.cpu_avg}%` : '—'} / {d.cpu_max != null ? `${Math.round(d.cpu_max)}%` : '—'}</b></span>
                      {d.temp_max != null && <span>{t('devx.tempMax')}: <b className="tabular-nums text-tx1">{Math.round(d.temp_max)}°C</b></span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={t('devx.portReport')} bodyClassName="p-3">
            {data.ports.length === 0 ? (
              <p className="text-sm text-tx3">{scope === 'watched' ? t('devx.noWatchedReport') : t('devx.noData')}</p>
            ) : (
              <ul className="divide-y divide-line">{data.ports.map(p => <ReportRow key={p.port_id} p={p} />)}</ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function ReportRow({ p }: { p: SnmpReportPort }) {
  const { t } = useTranslation();
  const dir = (k: 'in' | 'out', arrow: string) => (
    <div className="grid grid-cols-[1.2rem_repeat(4,minmax(0,1fr))] gap-2 text-xs tabular-nums">
      <span className="text-tx3">{arrow}</span>
      <span>{fmtBps(p[k].avg_bps)}</span>
      <span className="text-tx1 font-medium">{fmtBps(p[k].p95_bps)}</span>
      <span>{fmtBps(p[k].max_bps)}</span>
      <span>{p[k].avg_bps == null ? '—' : fmtBytes(p[k].volume_bytes)}</span>
    </div>
  );
  return (
    <li className="py-2.5 space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-sm text-tx1">{p.device_name} · {p.port}</span>
        {p.speed_mbps ? <span className="text-xs text-tx3">{fmtSpeed(p.speed_mbps)}</span> : null}
        {p.alias && <span className="text-xs text-tx3 truncate">{p.alias}</span>}
        <span className="ml-auto text-xs text-tx2">
          {t('devx.util95')}: <b className={pctTone(p.p95_util_pct)}>{p.p95_util_pct != null ? `${p.p95_util_pct}%` : '—'}</b>
          {' · '}{t('devx.utilPeak')}: <b className={pctTone(p.peak_util_pct)}>{p.peak_util_pct != null ? `${p.peak_util_pct}%` : '—'}</b>
        </span>
      </div>
      <div className="grid grid-cols-[1.2rem_repeat(4,minmax(0,1fr))] gap-2 text-[11px] text-tx3">
        <span />
        <span>{t('devx.colAvg')}</span><span>{t('devx.col95')}</span><span>{t('devx.colPeak')}</span><span>{t('devx.colVolume')}</span>
      </div>
      {dir('in', '↓')}
      {dir('out', '↑')}
      {p.coverage_pct < 90 && <p className="text-[11px] text-warning">{t('devx.coverage', { n: p.coverage_pct })}</p>}
    </li>
  );
}
