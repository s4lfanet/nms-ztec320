import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface TabsProps {
  tabs: { key: string; label: string; icon?: ReactNode }[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex gap-1 p-1 rounded-xl bg-glass border border-brd w-fit overflow-x-auto tab-scroll', className)}>
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn('tab-btn', active === tab.key && 'tab-btn-active')}
        >
          {tab.icon}{tab.label}
        </button>
      ))}
    </div>
  );
}
