import type { ReactNode } from 'react';
import { Breadcrumb, type BreadcrumbItem } from './Breadcrumb';
import { cn } from '../../lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
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
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        {breadcrumbs && <Breadcrumb items={breadcrumbs} />}
        <h1 className="text-xl md:text-2xl font-bold font-display flex items-center gap-2 text-tx1">
          {icon}{title}
        </h1>
        {description && <p className="text-sm text-tx3 mt-1 max-w-2xl">{description}</p>}
      </div>
      {action && <div className="flex items-center gap-2 flex-wrap flex-shrink-0">{action}</div>}
    </div>
  );
}
