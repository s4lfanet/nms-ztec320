import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
}

let _showConfirm: ((opts: ConfirmOptions) => Promise<boolean>) | null = null;

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  if (_showConfirm) return _showConfirm(opts);
  return Promise.resolve(window.confirm(opts.message));
}

export function ConfirmDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({ title: '', message: '' });
  const [resolve, setResolve] = useState<((v: boolean) => void) | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    _showConfirm = (o) => {
      setOpts(o);
      setOpen(true);
      return new Promise<boolean>((res) => setResolve(() => res));
    };
    return () => { _showConfirm = null; };
  }, []);

  const handle = (v: boolean) => { setOpen(false); resolve?.(v); };

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handle(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const variant = opts.variant || 'default';
  const btnVariant = variant === 'danger'
    ? 'bg-danger hover:bg-danger/85 text-white'
    : variant === 'warning'
    ? 'bg-warning hover:bg-warning/85 text-black'
    : 'bg-accent hover:bg-accent-hover text-white';

  return (
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="modal-overlay" onClick={() => handle(false)} />
      <div
        role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg"
        className="relative glass-card w-full max-w-md p-5 sm:p-6 animate-fade-in"
      >
        <button onClick={() => handle(false)} aria-label={t('common.close')}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-tx3 hover:text-tx1 hover:bg-glass">
          <X size={18} />
        </button>
        <div className="flex items-start gap-3 pr-8">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
            variant === 'danger' ? 'bg-danger/15 text-danger'
              : variant === 'warning' ? 'bg-warning/15 text-warning' : 'bg-accent/15 text-accent'
          )}>
            {variant === 'default' ? <Info size={20} /> : <AlertTriangle size={20} />}
          </div>
          <h3 id="confirm-title" className="text-base sm:text-lg font-semibold leading-snug text-tx1 pt-2 break-words">
            {opts.title}
          </h3>
        </div>
        <p id="confirm-msg"
          className="mt-3 text-sm leading-relaxed text-tx2 whitespace-pre-line break-words max-h-[50vh] overflow-y-auto">
          {opts.message}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:justify-end sm:gap-3">
          <button onClick={() => handle(false)}
            className="px-4 py-2.5 sm:py-2 rounded-xl text-sm font-medium border border-brd hover:bg-glass transition-colors sm:min-w-24">
            {opts.cancelLabel || t('common.cancel')}
          </button>
          <button ref={confirmRef} onClick={() => handle(true)}
            className={cn('px-4 py-2.5 sm:py-2 rounded-xl text-sm font-semibold transition-colors sm:min-w-24', btnVariant)}>
            {opts.confirmLabel || t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
