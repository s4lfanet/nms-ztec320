import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type StatusTone = 'ok' | 'warn' | 'crit' | 'idle' | 'info';

export interface StatusStripItem {
  key: string;
  label: string;
  count: number | string;
  tone?: StatusTone;
  /** warna CSS khusus (mis. warna rentang RX dari Customization); menimpa tone */
  color?: string;
  icon?: ReactNode;
  /** keterangan tambahan saat kursor di atas chip (mis. rentang dBm) */
  title?: string;
}

const toneVar: Record<StatusTone, string> = {
  ok: 'var(--status-ok)',
  warn: 'var(--status-warn)',
  crit: 'var(--status-crit)',
  idle: 'var(--status-idle)',
  info: 'var(--status-info)',
};

interface StatusStripProps {
  items: StatusStripItem[];
  /** key chip yang aktif (filter yang sedang dipakai) */
  active?: string | null;
  /** tanpa onSelect, chip hanya tampilan (bukan tombol) */
  onSelect?: (key: string) => void;
  className?: string;
  'aria-label'?: string;
}

/**
 * Pengganti deretan kartu statistik: satu baris chip berisi jumlah.
 * HP = satu baris geser horizontal; desktop = membungkus ke baris berikut.
 * Chip yang bisa diklik berfungsi sebagai filter.
 */
export function StatusStrip({ items, active, onSelect, className, ...rest }: StatusStripProps) {
  return (
    <div
      role={onSelect ? 'toolbar' : 'list'}
      aria-label={rest['aria-label']}
      className={cn('scroll-row md:flex-wrap md:overflow-visible -mx-3 px-3 md:mx-0 md:px-0', className)}
    >
      {items.map(it => {
        const tone = it.color || toneVar[it.tone || 'idle'];
        const isActive = active === it.key;
        const body = (
          <>
            <span className="status-dot" aria-hidden="true" />
            {it.icon && <span className="opacity-80" aria-hidden="true">{it.icon}</span>}
            <span>{it.label}</span>
            <span className="status-chip-count">{it.count}</span>
          </>
        );
        const style = { ['--chip-tone' as string]: tone };
        return onSelect ? (
          <button
            key={it.key}
            type="button"
            className="status-chip"
            data-active={isActive}
            aria-pressed={isActive}
            title={it.title}
            style={style}
            onClick={() => onSelect(it.key)}
          >
            {body}
          </button>
        ) : (
          <span key={it.key} role="listitem" className="status-chip" data-active={isActive} title={it.title} style={style}>
            {body}
          </span>
        );
      })}
    </div>
  );
}
