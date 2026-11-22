import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

type Tone = 'info' | 'ok' | 'warn' | 'crit';

const toneCfg: Record<Tone, { icon: ReactNode; cls: string }> = {
  info: { icon: <Info size={18} />, cls: 'border-accent/30 bg-accent/10 text-accent' },
  ok: { icon: <CheckCircle2 size={18} />, cls: 'border-success/30 bg-success/10 text-success' },
  warn: { icon: <AlertTriangle size={18} />, cls: 'border-warning/30 bg-warning/10 text-warning' },
  crit: { icon: <XCircle size={18} />, cls: 'border-danger/30 bg-danger/10 text-danger' },
};

interface NoticeProps {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** bila diisi, notice bisa ditutup dan tetap tertutup di browser ini */
  dismissKey?: string;
  className?: string;
}

const read = (k: string) => { try { return localStorage.getItem(`nms-notice:${k}`) === '1'; } catch { return false; } };
const write = (k: string) => { try { localStorage.setItem(`nms-notice:${k}`, '1'); } catch { /* storage diblokir */ } };

/** Satu area pemberitahuan per halaman: pengganti banner bertumpuk. */
export function Notice({ tone = 'info', title, children, action, dismissKey, className }: NoticeProps) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(() => (dismissKey ? read(dismissKey) : false));
  if (hidden) return null;
  const cfg = toneCfg[tone];
  return (
    <div role={tone === 'crit' || tone === 'warn' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-xl border px-4 py-3', cfg.cls, className)}>
      <span className="shrink-0 mt-0.5" aria-hidden="true">{cfg.icon}</span>
      <div className="flex-1 min-w-0 text-sm">
        {title && <p className="font-medium text-tx1">{title}</p>}
        {children && <div className={cn('text-tx2', title && 'mt-0.5')}>{children}</div>}
        {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
      </div>
      {dismissKey && (
        <button type="button" onClick={() => { write(dismissKey); setHidden(true); }}
          className="shrink-0 -mr-1 -mt-1 p-1.5 rounded-lg text-tx3 hover:text-tx1 hover:bg-glass"
          aria-label={t('common.close')}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}
