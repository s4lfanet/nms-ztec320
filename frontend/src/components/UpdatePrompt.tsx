import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download, Loader2 } from 'lucide-react';
import { Modal } from './ui/Modal';
import { refreshAfterServerUpdate, type RefreshPhase } from '../lib/swUpdate';
import { toast } from './Toast';
import { useAuth } from '../stores/auth';

interface CheckResult {
  success: boolean;
  up_to_date?: boolean;
  local_sha?: string;
  remote_sha?: string;
  commits?: string[];
}

const DISMISS_KEY = 'nms-update-dismissed-sha';
const INTERVAL_MS = 6 * 60 * 60 * 1000;   // cek ulang tiap 6 jam
const FIRST_DELAY_MS = 15_000;            // tunggu halaman selesai dimuat

/**
 * Pop-up "Update tersedia" (dialog di tengah halaman) untuk super admin: cek
 * GitHub berkala lewat /api/system/update/check (endpoint yang sama dengan
 * halaman Update Sistem). "Update sekarang" langsung memasang update lalu
 * memuat ulang halaman setelah service hidup lagi; "Lihat detail" membuka
 * halaman Update Sistem. "Abaikan" menyembunyikan pop-up sampai ada commit
 * baru lagi.
 */
export function UpdatePrompt() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [info, setInfo] = useState<CheckResult | null>(null);
  const [phase, setPhase] = useState<'idle' | 'applying' | RefreshPhase>('idle');
  const isSuper = !!user?.is_super_admin;

  useEffect(() => {
    if (!isSuper) return;
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch('/api/system/update/check', { credentials: 'include' });
        const d: CheckResult = await r.json();
        if (!alive || !d.success || d.up_to_date || !d.remote_sha) return;
        let dismissed = '';
        try { dismissed = localStorage.getItem(DISMISS_KEY) || ''; } catch { /* ignore */ }
        if (dismissed !== d.remote_sha) setInfo(d);
      } catch { /* jaringan/izin — diam */ }
    };
    const first = window.setTimeout(check, FIRST_DELAY_MS);
    const timer = window.setInterval(check, INTERVAL_MS);
    return () => { alive = false; window.clearTimeout(first); window.clearInterval(timer); };
  }, [isSuper]);

  if (!info || location.pathname.includes('/settings/update')) return null;

  const later = () => {
    try { localStorage.setItem(DISMISS_KEY, info.remote_sha || ''); } catch { /* ignore */ }
    setInfo(null);
  };
  const open = () => { setInfo(null); navigate('/dashboard/settings/update'); };

  // Pasang langsung dari pop-up: endpoint yang sama dengan tombol Apply Update.
  const applyNow = async () => {
    setPhase('applying');
    try {
      const r = await fetch('/api/system/update/apply', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      });
      const d = await r.json();
      if (!d.success) { toast.error(d.message || t('cmp_update.failedToApplyThe')); setPhase('idle'); return; }
      if (!d.restarted) { toast.success(d.message); setPhase('idle'); setInfo(null); return; }
      setPhase('server');
      await refreshAfterServerUpdate({ waitServer: true, onPhase: setPhase });
    } catch {
      toast.error(t('cmp_update.failedToApplyThe'));
      setPhase('idle');
    }
  };
  const commits = info.commits || [];
  const busy = phase !== 'idle';

  return (
    <Modal
      open
      onClose={busy ? () => undefined : later}
      icon={<Download size={16} className="text-accent" />}
      title={t('cmp_update.updateAvailable')}
      size="sm"
      footer={busy ? undefined : (
        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:justify-end sm:w-auto">
          <button onClick={later} className="btn-cancel border border-brd px-4 py-2 rounded-xl text-sm">
            {t('cmp_update.ignore')}
          </button>
          <button onClick={applyNow} className="btn-primary px-4 py-2 rounded-xl text-sm">
            {t('cmp_update.updateNow')}
          </button>
        </div>
      )}
    >
      <div className="space-y-3 text-sm">
        <p className="text-tx2 leading-relaxed">
          {t('cmp_update.summary', { n: commits.length, from: info.local_sha, to: info.remote_sha })}
        </p>
        {commits.length > 0 && (
          <ul className="space-y-1 text-xs text-tx2 max-h-44 overflow-y-auto rounded-lg border border-brd p-3">
            {commits.slice(0, 8).map(c => (
              <li key={c} className="break-words">• {c.replace(/^[0-9a-f]{7,}\s+/, '')}</li>
            ))}
            {commits.length > 8 && <li className="text-tx3">{t('cmp_update.more', { n: commits.length - 8 })}</li>}
          </ul>
        )}
        {busy ? (
          <p className="flex items-center gap-2 text-tx2">
            <Loader2 size={16} className="animate-spin text-accent" />
            {phase === 'applying' ? t('cmp_update.applying') : phase === 'server' ? t('cmp_update.restarting') : phase === 'download' ? t('cmp_update.downloadingUi') : t('cmp_update.reloading')}
          </p>
        ) : (
          <>
            <p className="text-xs text-tx3 leading-relaxed">{t('cmp_update.downtimeNote')}</p>
            <button onClick={open} className="text-xs text-accent hover:underline">{t('cmp_update.details')}</button>
          </>
        )}
      </div>
    </Modal>
  );
}
