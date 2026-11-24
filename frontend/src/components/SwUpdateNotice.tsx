import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RefreshCw, X } from 'lucide-react';
import { applySwUpdate, onSwUpdate, swUpdatePending } from '../lib/swUpdate';

/**
 * Versi aplikasi baru sudah terunduh: tampilkan pemberitahuan kecil (tidak
 * menghalangi) dan terapkan otomatis saat user pindah halaman — bukan
 * memuat ulang di tengah user membaca dashboard.
 */
export function SwUpdateNotice() {
  const { t } = useTranslation();
  const location = useLocation();
  const [ready, setReady] = useState(swUpdatePending());
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const reload = () => { if (busy) return; setBusy(true); applySwUpdate(); };
  const firstPath = useRef(location.pathname);

  useEffect(() => onSwUpdate(() => setReady(true)), []);

  useEffect(() => {
    if (!ready) { firstPath.current = location.pathname; return; }
    if (location.pathname !== firstPath.current) applySwUpdate();
  }, [location.pathname, ready]);

  if (!ready || hidden) return null;
  return (
    <div role="status"
      className="fixed z-40 left-3 right-3 bottom-20 lg:bottom-4 lg:left-auto lg:right-4 lg:max-w-sm flex items-center gap-3 p-3 rounded-xl border border-accent/40 bg-surface shadow-lg text-sm">
      <RefreshCw size={16} className="text-accent flex-shrink-0" />
      <span className="flex-1 text-tx2">{t('cmp_update.swReady')}</span>
      <button type="button" onClick={reload} disabled={busy} aria-busy={busy || undefined}
        className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-80">
        {busy && <RefreshCw size={12} className="animate-spin" />}
        {busy ? t('cmp_update.reloading') : t('cmp_update.swReload')}
      </button>
      <button type="button" onClick={() => setHidden(true)} aria-label={t('common.close')} className="p-1 text-tx3 hover:text-tx1">
        <X size={14} />
      </button>
    </div>
  );
}
