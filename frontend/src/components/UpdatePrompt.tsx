import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download, X } from 'lucide-react';
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
 * Pop-up "Update tersedia" untuk super admin: cek GitHub berkala lewat
 * /api/system/update/check (endpoint yang sama dengan halaman Update Sistem).
 * Tidak memasang update otomatis — tombolnya membuka halaman Update Sistem.
 * "Nanti" menyembunyikan pop-up sampai ada commit baru lagi.
 */
export function UpdatePrompt() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [info, setInfo] = useState<CheckResult | null>(null);
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

  if (!info || location.pathname.startsWith('/settings/update')) return null;

  const later = () => {
    try { localStorage.setItem(DISMISS_KEY, info.remote_sha || ''); } catch { /* ignore */ }
    setInfo(null);
  };
  const open = () => { setInfo(null); navigate('/settings/update'); };
  const commits = info.commits || [];

  return (
    <div className="fixed z-[70] left-3 right-3 top-20 md:left-auto md:right-6 md:w-96">
      <div className="bg-surface border border-brd rounded-2xl shadow-2xl p-4 flex gap-3 items-start">
        <Download size={20} className="text-accent shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-tx1">Update tersedia</p>
          <p className="text-xs text-tx3 mt-0.5">
            {commits.length} perubahan baru di GitHub ({info.local_sha} → {info.remote_sha}).
          </p>
          {commits.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-tx2 max-h-28 overflow-y-auto">
              {commits.slice(0, 5).map(c => (
                <li key={c} className="truncate">• {c.replace(/^[0-9a-f]{7,}\s+/, '')}</li>
              ))}
              {commits.length > 5 && <li className="text-tx3">… dan {commits.length - 5} lainnya</li>}
            </ul>
          )}
          <div className="flex gap-2 mt-3">
            <button onClick={open} className="btn-primary text-xs">Lihat &amp; Update</button>
            <button onClick={later} className="px-3 py-1.5 rounded-xl text-xs border border-brd text-tx2 hover:text-tx1">Nanti</button>
          </div>
        </div>
        <button onClick={later} className="p-1 text-tx3 hover:text-tx1" aria-label="close"><X size={16} /></button>
      </div>
    </div>
  );
}
