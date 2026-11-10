import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { toast } from './Toast';
import { getPushState, enablePush, pushSupported } from '../lib/push';

const DISMISS_KEY = 'nms-push-prompt-dismissed';
const DISMISS_DAYS = 7;

function dismissedRecently(): boolean {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return ts > 0 && Date.now() - ts < DISMISS_DAYS * 86400_000;
  } catch { return false; }
}

/**
 * Ajak semua role menyalakan notifikasi push (gangguan/alert) di perangkat ini.
 * - Izin sudah diberikan tapi belum berlangganan (mis. login ulang / perangkat
 *   baru): langganan dibuat otomatis tanpa bertanya.
 * - Izin belum ditanya: tampilkan banner (izin harus diminta lewat klik).
 */
export function PushPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    let alive = true;
    getPushState().then(async (st) => {
      if (!alive || st !== 'unsubscribed') return;
      if (Notification.permission === 'granted') {
        try { await enablePush(); } catch { /* diam */ }
        return;
      }
      if (Notification.permission === 'default' && !dismissedRecently()) setShow(true);
    });
    return () => { alive = false; };
  }, []);

  if (!show) return null;

  const enable = async () => {
    setBusy(true);
    try {
      const ok = await enablePush();
      if (ok) toast.success('Notifikasi gangguan aktif di perangkat ini');
      else toast.error('Izin notifikasi ditolak');
      setShow(false);
    } catch (e) {
      toast.error((e as Error).message || 'Gagal mengaktifkan notifikasi');
    } finally { setBusy(false); }
  };
  const later = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setShow(false);
  };

  return (
    <div className="fixed z-[70] left-3 right-3 bottom-20 md:bottom-6 md:left-auto md:right-6 md:w-96">
      <div className="bg-surface border border-brd rounded-2xl shadow-2xl p-4 flex gap-3 items-start">
        <BellRing size={20} className="text-accent shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-tx1">Aktifkan notifikasi gangguan?</p>
          <p className="text-xs text-tx3 mt-0.5">Terima alert OLT/ONU sebagai notifikasi di HP ini, walau aplikasi sedang ditutup.</p>
          <div className="flex gap-2 mt-3">
            <button onClick={enable} disabled={busy} className="btn-primary text-xs disabled:opacity-50">Aktifkan</button>
            <button onClick={later} className="px-3 py-1.5 rounded-xl text-xs border border-brd text-tx2 hover:text-tx1">Nanti</button>
          </div>
        </div>
        <button onClick={later} className="p-1 text-tx3 hover:text-tx1" aria-label="close"><X size={16} /></button>
      </div>
    </div>
  );
}
