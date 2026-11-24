import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, ShieldAlert, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';

/** Urutan = tingkat kepentingan: yang membuat data salah dulu, lalu yang membuat data kurang. */
const CATEGORIES: { key: string; tone: 'crit' | 'warn' | 'info' }[] = [
  { key: 'core_conflict', tone: 'crit' },
  { key: 'core_out_of_range', tone: 'crit' },
  { key: 'pon_mismatch', tone: 'crit' },
  { key: 'missing_splice', tone: 'warn' },
  { key: 'orphan', tone: 'warn' },
  { key: 'odp_full', tone: 'info' },
  { key: 'no_coordinates', tone: 'info' },
];

const KIND_LABEL: Record<string, string> = { otb: 'OTB', odc: 'ODC', odp: 'ODP', jc: 'JC', odp_port: 'Port', pon: 'PON' };

/**
 * Laporan kualitas data FTTH (/api/ftth/quality): apa yang salah atau belum
 * lengkap, per kategori, dengan nama node supaya bisa langsung diperbaiki.
 */
export function FtthQualityPanel() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['ftth-quality'], queryFn: api.ftthQuality, staleTime: 30_000 });
  if (isLoading || !data?.success) return null;

  const rows = CATEGORIES.filter(c => (data.counts[c.key] || 0) > 0);
  const critical = rows.filter(r => r.tone === 'crit').reduce((a, r) => a + data.counts[r.key], 0);

  return (
    <section className="glass-card p-3 md:p-4" aria-labelledby="ftth-quality-title">
      <div className="flex items-center gap-2 mb-1">
        {rows.length === 0
          ? <ShieldCheck size={18} className="text-success shrink-0" aria-hidden="true" />
          : <ShieldAlert size={18} className={cn('shrink-0', critical > 0 ? 'text-danger' : 'text-warning')} aria-hidden="true" />}
        <h3 id="ftth-quality-title" className="text-sm font-semibold text-tx1">{t('ftthq.title')}</h3>
      </div>
      <p className="text-xs text-tx3 mb-2">
        {rows.length === 0 ? t('ftthq.allGood') : t('ftthq.summary', { n: data.total, crit: critical })}
        {data.onus_unassigned > 0 && <> {t('ftthq.unassigned', { n: data.onus_unassigned, total: data.onus_total })}</>}
      </p>
      {rows.length > 0 && (
        <ul className="divide-y divide-brd border border-brd rounded-lg overflow-hidden">
          {rows.map(r => {
            const items = data.issues[r.key] || [];
            const isOpen = open === r.key;
            return (
              <li key={r.key}>
                <button type="button" onClick={() => setOpen(isOpen ? null : r.key)} aria-expanded={isOpen}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-glass-hover">
                  <span className={cn('w-2 h-2 rounded-full shrink-0', r.tone === 'crit' ? 'bg-danger' : r.tone === 'warn' ? 'bg-warning' : 'bg-info')} aria-hidden="true" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-tx1">{t(`ftthq.cat.${r.key}`)}</span>
                    <span className="block text-[11px] text-tx3">{t(`ftthq.hint.${r.key}`)}</span>
                  </span>
                  <span className="text-sm font-semibold text-tx1 tabular-nums">{data.counts[r.key]}</span>
                  {isOpen ? <ChevronDown size={14} className="text-tx3" /> : <ChevronRight size={14} className="text-tx3" />}
                </button>
                {isOpen && (
                  <ul className="px-3 pb-3 space-y-1.5 max-h-72 overflow-y-auto">
                    {items.map(i => (
                      <li key={`${i.kind}-${i.id}-${i.message}`} className="text-xs leading-snug">
                        <span className="inline-block px-1.5 py-0.5 mr-1.5 rounded bg-glass border border-brd text-[10px] text-tx2">{KIND_LABEL[i.kind] || i.kind}</span>
                        <span className="font-medium text-tx1">{i.name}</span>
                        <span className="text-tx3"> — {i.message}</span>
                      </li>
                    ))}
                    {data.counts[r.key] > items.length && (
                      <li className="text-[11px] text-tx3">{t('ftthq.more', { n: data.counts[r.key] - items.length })}</li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
