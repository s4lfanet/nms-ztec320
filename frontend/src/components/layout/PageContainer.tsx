import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/** Consistent vertical rhythm between a page's header, KPI row, and content sections. */
export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-4 md:space-y-5', className)}>{children}</div>;
}
