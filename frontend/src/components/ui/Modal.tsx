import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

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
