import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
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
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({ title: '', message: '' });
  const [resolve, setResolve] = useState<((v: boolean) => void) | null>(null);

  useEffect(() => {
    _showConfirm = (o) => {
      setOpts(o);
      setOpen(true);
      return new Promise<boolean>((res) => setResolve(() => res));
    };
    return () => { _showConfirm = null; };
  }, []);

  const handle = (v: boolean) => { setOpen(false); resolve?.(v); };

  if (!open) return null;

  const btnVariant = opts.variant === 'danger'
    ? 'bg-danger hover:bg-danger/80 text-white'
    : opts.variant === 'warning'
    ? 'bg-warning hover:bg-warning/80 text-black'
    : 'bg-accent hover:bg-accent-hover text-white';

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => handle(false)} />
      <div className="relative glass-card p-6 w-full max-w-md animate-fade-in">
        <button onClick={() => handle(false)} className="absolute top-4 right-4 text-tx3 hover:text-tx1">
          <X size={18} />
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center',
            opts.variant === 'danger' ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning'
          )}>
            <AlertTriangle size={20} />
          </div>
          <h3 className="text-lg font-semibold">{opts.title}</h3>
        </div>
        <p className="text-tx2 text-sm mb-6">{opts.message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => handle(false)} className="px-4 py-2 rounded-xl text-sm hover:bg-glass transition-colors">
            {opts.cancelLabel || 'Cancel'}
          </button>
          <button onClick={() => handle(true)} className={cn('px-4 py-2 rounded-xl text-sm font-medium transition-all', btnVariant)}>
            {opts.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
