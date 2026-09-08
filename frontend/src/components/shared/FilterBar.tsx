import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/** Row of filter controls (search, selects, actions) that wraps naturally on mobile. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
    </div>
  );
}
