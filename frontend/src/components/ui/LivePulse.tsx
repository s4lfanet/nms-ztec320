import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

/**
 * Tanda "data hidup": titik berdenyut + "diperbarui N dtk lalu" yang berjalan.
 * `updatedAt` = epoch ms (mis. `dataUpdatedAt` dari React Query). Saat `fetching`,
 * titik berubah menjadi cincin yang berputar pelan. Bila data lebih tua dari
 * `staleAfter` detik, warnanya meredup — operator tahu angka sedang basi.
 */
export function LivePulse({ updatedAt, fetching, staleAfter = 90, className }: {
  updatedAt?: number; fetching?: boolean; staleAfter?: number; className?: string;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const age = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const stale = age != null && age > staleAfter;
  const label = age == null ? t('live.waiting')
    : age < 5 ? t('live.justNow')
      : age < 60 ? t('live.secondsAgo', { n: age })
        : t('live.minutesAgo', { n: Math.floor(age / 60) });
  return (
    <span className={cn('live-pulse', stale && 'is-stale', fetching && 'is-fetching', className)} role="status" aria-live="off">
      <span className="live-pulse-dot" aria-hidden />
      <span className="live-pulse-label">{fetching ? t('live.updating') : label}</span>
    </span>
  );
}
