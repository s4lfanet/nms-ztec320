import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  if (!items || items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1.5 text-xs text-tx3 mb-1 overflow-x-auto', className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <Fragment key={`${item.label}-${i}`}>
            {i > 0 && <ChevronRight size={12} className="text-tx3/60 flex-shrink-0" />}
            {item.path && !isLast ? (
              <Link to={item.path} className="hover:text-tx1 transition-colors truncate whitespace-nowrap">{item.label}</Link>
            ) : (
              <span className={cn('truncate whitespace-nowrap', isLast && 'text-tx2 font-medium')}>{item.label}</span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
