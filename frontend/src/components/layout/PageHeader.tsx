import type { ReactNode } from 'react';
import { Breadcrumb, type BreadcrumbItem } from './Breadcrumb';
import { cn } from '../../lib/utils';

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * Standard page header: breadcrumb -> title -> description -> primary
 * action, per the app's layout hierarchy (Page > Header > ... > Main content).
 */
export function PageHeader({ title, description, breadcrumbs, icon, action, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between animate-fade-in', className)}>
      <div className="min-w-0 flex items-start gap-3">
        {icon && (
          <div className="icon-badge w-10 h-10 md:w-11 md:h-11 shrink-0 mt-0.5">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {breadcrumbs && <Breadcrumb items={breadcrumbs} />}
          <h1 className="text-xl md:text-2xl font-bold font-display text-tx1">
            {title}
          </h1>
          {description && <p className="text-sm text-tx3 mt-1 max-w-2xl">{description}</p>}
        </div>
      </div>
      {action && <div className="flex items-center gap-2 flex-wrap flex-shrink-0">{action}</div>}
    </div>
  );
}
