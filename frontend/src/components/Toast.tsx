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
// Caps how much of the screen a burst of toasts can cover — this app pushes
// several alert toasts back-to-back over WebSocket (e.g. multiple ONUs going
// offline at once), and without a cap they stack tall enough to blanket the
// dashboard's stat cards on desktop or the entire above-the-fold content on
// mobile for the whole toast duration.
const MAX_VISIBLE = 4;

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

// Latar solid (warna status dicampur ke permukaan) — toast muncul di atas
// konten, jadi tidak boleh tembus pandang.
const styles: Record<ToastType, string> = {
  success: 'border-success/40 [background:color-mix(in_srgb,var(--color-success)_14%,var(--bg-surface))]',
  error: 'border-danger/40 [background:color-mix(in_srgb,var(--color-danger)_14%,var(--bg-surface))]',
  warning: 'border-warning/40 [background:color-mix(in_srgb,var(--color-warning)_14%,var(--bg-surface))]',
  info: 'border-accent/40 [background:color-mix(in_srgb,var(--color-accent)_14%,var(--bg-surface))]',
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
      const next = [...prev, { ...t, id }];
      if (next.length <= MAX_VISIBLE) return next;
      // Drop the oldest toasts past the cap immediately (no exit animation —
      // they're being superseded, not dismissed) and clear their timers.
      const overflow = next.slice(0, next.length - MAX_VISIBLE);
      overflow.forEach(o => { clearTimeout(timersRef.current[o.id]); delete timersRef.current[o.id]; });
      return next.slice(next.length - MAX_VISIBLE);
    });
  }, [remove]);

  useEffect(() => { _addToast = add; return () => { _addToast = null; }; }, [add]);

  useEffect(() => {
    return () => { Object.values(timersRef.current).forEach(clearTimeout); };
  }, []);

  return (
    <div className="fixed top-20 left-4 right-4 sm:left-auto sm:w-full max-w-sm z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border',
            'shadow-lg transition-all duration-250',
            styles[t.type],
            t.exiting ? 'opacity-0 translate-x-4' : 'animate-slide-in opacity-100',
          )}
        >
          <span className="flex-shrink-0">{icons[t.type]}</span>
          <span className="text-sm font-medium flex-1 min-w-0 text-tx1 break-words [overflow-wrap:anywhere]">{t.message}</span>
          <button onClick={() => remove(t.id)} className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
