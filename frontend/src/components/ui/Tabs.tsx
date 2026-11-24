import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { useSlidingIndicator } from '../../hooks/useSlidingIndicator';

interface TabsProps {
  tabs: { key: string; label: string; icon?: ReactNode }[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
  /** Di HP (< md) tampilkan semua tab sebagai grid 4 kolom (ikon di atas label)
   *  supaya tidak perlu geser ke samping. Di tablet/desktop tetap satu baris. */
  mobileGrid?: boolean | 2 | 3 | 4;
}

const GRID_COLS = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' } as const;

export function Tabs({ tabs, active, onChange, className, mobileGrid }: TabsProps) {
  const cols = GRID_COLS[mobileGrid === true ? 4 : (mobileGrid || 4)];
  // Sorotan yang meluncur ke tab terpilih (lihat feel.css)
  const ind = useSlidingIndicator<HTMLDivElement>('[aria-selected="true"]', [active, tabs.length, mobileGrid]);
  return (
    <div
      ref={ind.ref}
      role="tablist"
      data-sliding={ind.ready ? '' : undefined}
      className={cn(
        'relative gap-1 p-1 rounded-lg bg-glass border border-brd max-w-full',
        mobileGrid
          ? `grid ${cols} w-full md:flex md:w-fit md:overflow-x-auto tab-scroll`
          : 'flex w-full sm:w-fit overflow-x-auto tab-scroll',
        className,
      )}
    >
      <span className="slide-ind tab-ind" style={ind.style} aria-hidden="true" />
      {tabs.map(tab => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            'tab-btn inline-flex items-center flex-shrink-0',
            mobileGrid
              ? 'tab-btn-grid flex-col justify-center gap-1 min-w-0 md:flex-row md:gap-1.5'
              : 'gap-1.5',
            active === tab.key && 'tab-btn-active',
          )}
        >
          {tab.icon}<span className={cn(mobileGrid && 'max-w-full text-center line-clamp-2 md:line-clamp-none')}>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
