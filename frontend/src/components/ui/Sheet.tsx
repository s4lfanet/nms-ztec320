import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** lebar panel di desktop (px), default 420 */
  width?: number;
  className?: string;
}

/**
 * Panel samping di desktop/tablet, bottom sheet di HP. Dipakai untuk aksi
 * per baris (mis. "Kelola OLT") dan menu "Lainnya" — menggantikan deretan
 * ikon kecil tanpa label. Di-portal ke body (lihat catatan di Modal.tsx).
 */
export function Sheet({ open, onClose, title, description, children, footer, width = 420, className }: SheetProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', h);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cn('sheet-panel outline-none', className)}
        style={{ ['--sheet-w' as string]: `${width}px` }}
      >
        <div className="sheet-grip" aria-hidden="true" />
        {(title || description) && (
          <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-3 md:px-5 md:pt-5 border-b border-brd">
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold text-tx1 truncate">{title}</h2>}
              {description && <p className="text-xs text-tx3 mt-0.5">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="touch-target -mr-2 -mt-1 p-2 rounded-lg text-tx3 hover:text-tx1 hover:bg-glass flex items-center justify-center"
              aria-label={t('common.close')}
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 md:p-5">{children}</div>
        {footer && <div className="border-t border-brd p-3 md:p-4 flex gap-2 justify-end">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}
