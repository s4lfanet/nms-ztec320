import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface CardProps {
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  onClick?: () => void;
}

export function Card({ title, icon, action, children, className, bodyClassName, onClick }: CardProps) {
  return (
    <div
      className={cn('glass-card', className)}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
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
