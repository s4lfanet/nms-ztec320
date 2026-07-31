import { useEffect, type ReactNode } from 'react';
import { X, Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

/* ─── Modal ─── */
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: ReactNode;
}

const sizeMap = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({ open, onClose, title, icon, children, size = 'md', footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-wrapper">
        <div
          className={cn(
            'relative glass-card w-full flex flex-col rounded-t-2xl md:rounded-2xl',
            'max-h-[90vh] md:max-h-[85vh] animate-slide-up md:animate-fade-in',
            sizeMap[size],
          )}
          onClick={e => e.stopPropagation()}
        >
          {title && (
            <div className="section-header sticky top-0 z-10 rounded-t-2xl">
              <h2 className="section-title">{icon}{title}</h2>
              <button onClick={onClose} className="text-tx3 hover:text-tx1 transition-colors p-1 rounded-lg hover:bg-glass">
                <X size={18} />
              </button>
            </div>
          )}
          <div className="overflow-y-auto flex-1 p-4 md:p-5">
            {children}
          </div>
          {footer && <div className="modal-footer justify-end">{footer}</div>}
        </div>
      </div>
    </>
  );
}

/* ─── Card ─── */
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

/* ─── Badge ─── */
type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return (
    <span className={cn('badge', `badge-${variant}`, className)}>{children}</span>
  );
}

/* ─── Spinner ─── */
interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return <div className={cn('spinner', size === 'lg' && 'spinner-lg', size === 'sm' && 'spinner-sm', className)} />;
}

/* ─── LoadingOverlay (full card / section) ─── */
export function LoadingOverlay({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 size={28} className="text-accent animate-spin" />
      {label && <p className="text-tx3 text-sm mt-3">{label}</p>}
    </div>
  );
}

/* ─── EmptyState ─── */
interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {Icon && (
        <div className="empty-state-icon">
          <Icon size={22} />
        </div>
      )}
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ─── CodeBlock ─── */
interface CodeBlockProps {
  children: string;
  className?: string;
  maxHeight?: string;
}

export function CodeBlock({ children, className, maxHeight = 'max-h-64' }: CodeBlockProps) {
  return (
    <div className={cn('code-block', maxHeight, 'overflow-y-auto', className)}>
      <pre>{children}</pre>
    </div>
  );
}

/* ─── Tabs ─── */
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
