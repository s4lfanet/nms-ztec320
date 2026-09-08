import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface CardProps {
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Card({ title, icon, action, children, className, bodyClassName }: CardProps) {
  return (
    <div className={cn('glass-card', className)}>
      {title && (
        <div className="section-header">
          <h3 className="section-title">{icon}{title}</h3>
          {action}
        </div>
      )}
      <div className={cn('p-4 md:p-5', bodyClassName)}>
        {children}
      </div>
    </div>
  );
}
