import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download, X, Loader2 } from 'lucide-react';
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
 * Pop-up "Update tersedia" untuk super admin: cek GitHub berkala lewat
 * /api/system/update/check (endpoint yang sama dengan halaman Update Sistem).
 * "Update sekarang" memasang update dari pop-up (konfirmasi dulu), lalu memuat
 * ulang halaman setelah service hidup lagi; "Detail" membuka halaman Update Sistem.
 * "Nanti" menyembunyikan pop-up sampai ada commit baru lagi.
 */
/** Tunggu service mati lalu hidup lagi (maks ±90 dtk). */
async function waitForRestart() {
  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
  const up = async () => {
    try {
      const r = await fetch('/api/public/branding', { cache: 'no-store' });
      return r.ok;
    } catch { return false; }
  };
  await sleep(4000);
  for (let i = 0; i < 45; i++) {
    if (await up()) { await sleep(1500); return; }
    await sleep(2000);
  }
}

export function UpdatePrompt() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [info, setInfo] = useState<CheckResult | null>(null);
  const [phase, setPhase] = useState<'idle' | 'applying' | 'restarting'>('idle');
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
    if (!confirm('Pasang update sekarang? Kode terbaru diambil dari GitHub lalu service di-restart — aplikasi tidak bisa diakses beberapa detik.')) return;
    setPhase('applying');
    try {
      const r = await fetch('/api/system/update/apply', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      });
      const d = await r.json();
      if (!d.success) { toast.error(d.message || 'Update gagal'); setPhase('idle'); return; }
      if (!d.restarted) { toast.success(d.message); setPhase('idle'); setInfo(null); return; }
      setPhase('restarting');
      await waitForRestart();
      try {
        const regs = await navigator.serviceWorker?.getRegistrations?.();
        await Promise.all((regs || []).map(reg => reg.update().catch(() => undefined)));
      } catch { /* ignore */ }
      window.location.reload();
    } catch {
      toast.error('Gagal memasang update — coba dari halaman Update Sistem');
      setPhase('idle');
    }
  };
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
          {phase === 'idle' ? (
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={applyNow} className="btn-primary text-xs">Update sekarang</button>
              <button onClick={open} className="px-3 py-1.5 rounded-xl text-xs border border-brd text-tx2 hover:text-tx1">Detail</button>
              <button onClick={later} className="px-3 py-1.5 rounded-xl text-xs text-tx3 hover:text-tx1">Nanti</button>
            </div>
          ) : (
            <p className="flex items-center gap-2 mt-3 text-xs text-tx2">
              <Loader2 size={14} className="animate-spin" />
              {phase === 'applying' ? 'Mengambil update dari GitHub…' : 'Service memulai ulang — halaman dimuat ulang otomatis…'}
            </p>
          )}
        </div>
        {phase === 'idle' && <button onClick={later} className="p-1 text-tx3 hover:text-tx1" aria-label="close"><X size={16} /></button>}
      </div>
    </div>
  );
}
