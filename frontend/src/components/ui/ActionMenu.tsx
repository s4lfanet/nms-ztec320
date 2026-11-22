import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { Sheet } from './Sheet';

export interface ActionItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  /** aksi merusak (reboot, reset, hapus): dipisah di bawah, warna merah */
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}

interface ActionMenuProps {
  actions: ActionItem[];
  /** teks tombol; default "Lainnya" */
  label?: string;
  /** judul sheet di HP */
  title?: string;
  /** hanya ikon (untuk baris tabel) */
  iconOnly?: boolean;
  className?: string;
}

/**
 * Menu "Lainnya": dropdown di desktop, bottom sheet di HP. Aksi biasa di atas,
 * aksi merusak dipisah garis di paling bawah. Konfirmasi tetap tanggung jawab
 * pemanggil (onClick) — komponen ini tidak menjalankan apa pun sendiri.
 */
export function ActionMenu({ actions, label, title, iconOnly, className }: ActionMenuProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const text = label || t('ui.more');

  const normal = actions.filter(a => !a.danger);
  const danger = actions.filter(a => a.danger);

  useLayoutEffect(() => {
    if (!open || isMobile || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
  }, [open, isMobile]);

  useEffect(() => {
    if (!open || isMobile) return;
    const close = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!popRef.current?.contains(n) && !btnRef.current?.contains(n)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const off = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', off, true);
    window.addEventListener('resize', off);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', off, true);
      window.removeEventListener('resize', off);
    };
  }, [open, isMobile]);

  const run = (a: ActionItem) => {
    if (a.disabled) return;
    setOpen(false);
    a.onClick();
  };

  const row = (a: ActionItem, big: boolean) => (
    <button
      key={a.key}
      type="button"
      role="menuitem"
      disabled={a.disabled}
      onClick={() => run(a)}
      className={cn(
        'w-full flex items-center gap-3 text-left rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        big ? 'min-h-[48px] px-3 text-[15px]' : 'px-3 py-2 text-sm',
        a.danger ? 'text-danger hover:bg-danger/10' : 'text-tx1 hover:bg-glass',
      )}
    >
      {a.icon && <span className={cn('shrink-0', a.danger ? 'text-danger' : 'text-tx3')} aria-hidden="true">{a.icon}</span>}
      <span className="flex-1 min-w-0">
        <span className="block truncate">{a.label}</span>
        {a.hint && <span className="block text-xs text-tx3 truncate">{a.hint}</span>}
      </span>
    </button>
  );

  const list = (big: boolean) => (
    <div role="menu" className="flex flex-col gap-0.5">
      {normal.map(a => row(a, big))}
      {danger.length > 0 && (
        <>
          {normal.length > 0 && <hr className="border-brd my-1.5" />}
          {danger.map(a => row(a, big))}
        </>
      )}
    </div>
  );

  if (actions.length === 0) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={iconOnly ? text : undefined}
        title={iconOnly ? text : undefined}
        className={cn(
          iconOnly
            ? 'touch-target p-2 rounded-lg text-tx2 hover:text-tx1 hover:bg-glass inline-flex items-center justify-center'
            : 'btn-cancel border border-brd inline-flex items-center justify-center gap-2',
          className,
        )}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
        {!iconOnly && <span>{text}</span>}
      </button>

      {open && isMobile && (
        <Sheet open onClose={() => setOpen(false)} title={title || text}>
          {list(true)}
        </Sheet>
      )}

      {open && !isMobile && pos && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', top: pos.top, right: pos.right }}
          className="z-[70] w-60 max-h-[70vh] overflow-y-auto p-1.5 rounded-xl border border-brd shadow-2xl shadow-black/30 animate-fade-in"
        >
          <div className="absolute inset-0 -z-10 rounded-xl" style={{ background: 'var(--bg-surface)' }} />
          {list(false)}
        </div>,
        document.body,
      )}
    </>
  );
}
