import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '../lib/utils';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  exiting?: boolean;
}

const DEFAULT_DURATION = 4000;

let _addToast: ((t: Omit<Toast, 'id'>) => void) | null = null;

export function toast(message: string, type: ToastType = 'info', duration = DEFAULT_DURATION) {
  _addToast?.({ type, message, duration });
}

toast.success = (msg: string) => toast(msg, 'success');
toast.error = (msg: string) => toast(msg, 'error', 5000);
toast.warning = (msg: string) => toast(msg, 'warning');
toast.info = (msg: string) => toast(msg, 'info');

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={18} className="text-success" />,
  error: <XCircle size={18} className="text-danger" />,
  warning: <AlertTriangle size={18} className="text-warning" />,
  info: <Info size={18} className="text-accent" />,
};

const styles: Record<ToastType, string> = {
  success: 'border-success/30 bg-success/10',
  error: 'border-danger/30 bg-danger/10',
  warning: 'border-warning/30 bg-warning/10',
  info: 'border-accent/30 bg-accent/10',
};

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete timersRef.current[id];
    }, 250);
  }, []);

  const add = useCallback((t: Omit<Toast, 'id'>) => {
    setToasts(prev => {
      const dedup = prev.find(x => x.type === t.type && x.message === t.message && !x.exiting);
      if (dedup) return prev;
      const id = `${t.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const dur = t.duration || DEFAULT_DURATION;
      timersRef.current[id] = setTimeout(() => remove(id), dur);
      return [...prev, { ...t, id }];
    });
  }, [remove]);

  useEffect(() => { _addToast = add; return () => { _addToast = null; }; }, [add]);

  useEffect(() => {
    return () => { Object.values(timersRef.current).forEach(clearTimeout); };
  }, []);

  return (
    <div className="fixed top-20 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl',
            'shadow-lg transition-all duration-250',
            styles[t.type],
            t.exiting ? 'opacity-0 translate-x-4' : 'animate-slide-in opacity-100',
          )}
        >
          <span className="flex-shrink-0">{icons[t.type]}</span>
          <span className="text-sm font-medium flex-1 text-tx1">{t.message}</span>
          <button onClick={() => remove(t.id)} className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
