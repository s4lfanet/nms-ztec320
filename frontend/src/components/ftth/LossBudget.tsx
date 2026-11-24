import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import type { FTTHLossBudget } from '../../lib/api';
import { cn } from '../../lib/utils';

const KIND_COLOR: Record<string, string> = {
  splitter: 'bg-accent',
  cable: 'bg-success',
  connector: 'bg-warning',
  splice: 'bg-info',
};

const VERDICT_TONE: Record<FTTHLossBudget['verdict'], string> = {
  ok: 'text-success border-success/30 bg-success/10',
  worse: 'text-danger border-danger/30 bg-danger/10',
  better: 'text-warning border-warning/30 bg-warning/10',
  incomplete: 'text-tx2 border-brd bg-glass',
  unknown: 'text-tx2 border-brd bg-glass',
};

const fmt = (v: number | null | undefined, unit: string) => (v === null || v === undefined ? '—' : `${v.toFixed(1)} ${unit}`);

/**
 * Anggaran redaman jalur ONU: total (kabel + splitter + konektor + splice),
 * perkiraan RX dari TX PON, dibandingkan dengan RX ONU yang terukur.
 */
export function LossBudget({ budget }: { budget: FTTHLossBudget }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const absDelta = budget.delta_db === null ? 0 : Math.abs(budget.delta_db);

  // Komposisi per jenis untuk satu batang bertumpuk
  const byKind = budget.items.reduce<Record<string, number>>((a, i) => ({ ...a, [i.kind]: (a[i.kind] || 0) + i.db }), {});
  const kinds = Object.entries(byKind).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  return (
    <div className="mt-3 space-y-2.5">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-glass border border-brd p-2">
          <dt className="text-[10px] text-tx3">{t('lossb.total')}</dt>
          <dd className="text-sm font-semibold text-tx1 tabular-nums">{fmt(budget.total_db, 'dB')}</dd>
        </div>
        <div className="rounded-lg bg-glass border border-brd p-2">
          <dt className="text-[10px] text-tx3">{t('lossb.expected')}</dt>
          <dd className="text-sm font-semibold text-tx1 tabular-nums">{fmt(budget.expected_rx_dbm, 'dBm')}</dd>
        </div>
        <div className="rounded-lg bg-glass border border-brd p-2">
          <dt className="text-[10px] text-tx3">{t('lossb.measured')}</dt>
          <dd className="text-sm font-semibold text-tx1 tabular-nums">{fmt(budget.measured_rx_dbm, 'dBm')}</dd>
        </div>
      </dl>

      <p className={cn('text-xs rounded-lg border px-2.5 py-2 leading-snug', VERDICT_TONE[budget.verdict])}>
        {t(`lossb.verdict.${budget.verdict}`, { d: absDelta.toFixed(1), tol: budget.tolerance_db })}
      </p>

      {kinds.length > 0 && (
        <div>
          <div className="flex h-2 rounded-full overflow-hidden bg-glass" role="img"
            aria-label={kinds.map(([k, v]) => `${t(`lossb.kind.${k}`)} ${v.toFixed(1)} dB`).join(', ')}>
            {kinds.map(([k, v]) => (
              <span key={k} className={KIND_COLOR[k] || 'bg-tx3'} style={{ width: `${(v / budget.total_db) * 100}%` }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-tx3">
            {kinds.map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className={cn('w-2 h-2 rounded-sm', KIND_COLOR[k] || 'bg-tx3')} aria-hidden="true" />
                {t(`lossb.kind.${k}`)} {v.toFixed(1)} dB
              </span>
            ))}
          </div>
        </div>
      )}

      {budget.missing.length > 0 && (
        <ul className="space-y-1">
          {budget.missing.map(m => (
            <li key={m} className="flex items-start gap-1.5 text-[11px] text-warning">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />{m}
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
        className="flex items-center gap-1 text-xs text-accent hover:underline">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{t('lossb.details')}
      </button>
      {open && (
        <div className="rounded-lg border border-brd overflow-hidden">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-brd">
              <tr>
                <td className="px-2.5 py-1.5 text-tx2">{t('lossb.oltTx')}</td>
                <td className="px-2.5 py-1.5 text-right tabular-nums text-tx1 whitespace-nowrap align-top">
                  {budget.olt_tx_dbm.toFixed(2)} dBm{budget.olt_tx_assumed && <span className="block sm:inline text-[10px] sm:text-xs text-tx3"><span className="hidden sm:inline"> · </span>{t('lossb.standard')}</span>}
                </td>
              </tr>
              {budget.items.map((i, idx) => (
                <tr key={idx}>
                  <td className="px-2.5 py-1.5 text-tx2 break-words">{i.label}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-tx1 whitespace-nowrap align-top">
                    −{i.db.toFixed(2)} dB{i.assumed && <span className="block sm:inline text-[10px] sm:text-xs text-tx3"><span className="hidden sm:inline"> · </span>{t('lossb.standard')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-2.5 py-2 text-[11px] text-tx3 border-t border-brd">{t('lossb.standardNote')}</p>
        </div>
      )}
    </div>
  );
}
