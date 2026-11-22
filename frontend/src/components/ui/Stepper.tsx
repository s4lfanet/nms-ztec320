import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

interface StepperProps {
  steps: { label: string }[];
  /** indeks langkah aktif, mulai 0 */
  current: number;
  /** klik langkah yang sudah lewat untuk kembali (opsional) */
  onStepClick?: (index: number) => void;
  className?: string;
}

/**
 * Penanda langkah wizard. Desktop: langkah bernomor berjudul.
 * HP: "Langkah 2 dari 4 · Judul" + progress bar, supaya jelas posisinya.
 */
export function Stepper({ steps, current, onStepClick, className }: StepperProps) {
  const { t } = useTranslation();
  const total = steps.length;
  const idx = Math.min(Math.max(current, 0), total - 1);
  const pct = total > 1 ? ((idx + 1) / total) * 100 : 100;

  return (
    <nav aria-label={t('ui.steps')} className={className}>
      {/* HP */}
      <div className="md:hidden">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-semibold text-tx1 truncate">{steps[idx]?.label}</span>
          <span className="text-xs text-tx3 num shrink-0">{t('ui.stepOf', { n: idx + 1, total })}</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-glass overflow-hidden" role="progressbar"
          aria-valuemin={1} aria-valuemax={total} aria-valuenow={idx + 1}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Desktop */}
      <ol className="hidden md:flex items-center gap-2">
        {steps.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          const clickable = done && !!onStepClick;
          return (
            <li key={i} className="flex items-center gap-2 min-w-0 flex-1 last:flex-none">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStepClick?.(i)}
                aria-current={active ? 'step' : undefined}
                className={cn('flex items-center gap-2 min-w-0 rounded-lg px-1 py-1', clickable && 'hover:bg-glass')}
              >
                <span className={cn(
                  'w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold num border',
                  done && 'bg-accent text-white border-accent',
                  active && 'border-accent text-accent bg-accent/10',
                  !done && !active && 'border-brd text-tx3',
                )}>
                  {done ? <Check size={14} /> : i + 1}
                </span>
                <span className={cn('text-sm truncate', active ? 'text-tx1 font-semibold' : 'text-tx3')}>{s.label}</span>
              </button>
              {i < total - 1 && <span className={cn('h-px flex-1 min-w-4', done ? 'bg-accent' : 'bg-brd')} aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
