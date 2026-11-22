import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface TabsProps {
  tabs: { key: string; label: string; icon?: ReactNode }[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
  /** Di HP (< md) tampilkan semua tab sebagai grid 4 kolom (ikon di atas label)
   *  supaya tidak perlu geser ke samping. Di tablet/desktop tetap satu baris. */
  mobileGrid?: boolean;
}

export function Tabs({ tabs, active, onChange, className, mobileGrid }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'gap-1 p-1 rounded-lg bg-glass border border-brd max-w-full',
        mobileGrid
          ? 'grid grid-cols-4 w-full md:flex md:w-fit md:overflow-x-auto tab-scroll'
          : 'flex w-full sm:w-fit overflow-x-auto tab-scroll',
        className,
      )}
    >
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
          {tab.icon}<span className={cn(mobileGrid && 'truncate max-w-full')}>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
