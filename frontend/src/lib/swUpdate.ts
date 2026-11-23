/**
 * Service worker (PWA) tanpa reload mendadak.
 *
 * Sebelumnya `registerType: 'autoUpdate'` + `onNeedRefresh → updateSW(true)`
 * memuat ulang halaman seketika setiap kali versi baru terpasang (setelah
 * Apply Update / deploy) — dari sisi user terlihat seperti dashboard
 * "reload sendiri". Sekarang versi baru menunggu dan diterapkan saat:
 *   - user pindah halaman (momen alami), atau
 *   - user menekan "Muat ulang" di pemberitahuan kecil, atau
 *   - alur Update Sistem selesai (UpdatePrompt).
 */
import { registerSW } from 'virtual:pwa-register';

const CHECK_EVERY_MS = 5 * 60 * 1000;
const MIN_GAP_MS = 20 * 1000;
let lastCheck = Date.now();
let pending = false;
let updater: ((reloadPage?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();

export function initServiceWorker() {
  updater = registerSW({
    immediate: true,
    onNeedRefresh() {
      pending = true;
      listeners.forEach(fn => fn());
    },
    // Browser hanya memeriksa sw.js baru saat halaman dimuat penuh. PWA di HP
    // yang di-resume dari latar belakang (atau tab yang dibiarkan terbuka)
    // bisa berhari-hari memakai versi lama tanpa pemberitahuan — jadi cek
    // berkala dan setiap kali aplikasi kembali terlihat.
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { if (navigator.onLine !== false) reg.update().catch(() => undefined); };
      setInterval(check, CHECK_EVERY_MS);
      const checkSoon = () => {
        if (Date.now() - lastCheck > MIN_GAP_MS) { lastCheck = Date.now(); check(); }
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkSoon();
      });
      window.addEventListener('focus', checkSoon);
      window.addEventListener('online', checkSoon);
    },
  });
}

export const swUpdatePending = () => pending;

export function onSwUpdate(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Aktifkan service worker baru lalu muat ulang; tanpa SW baru cukup reload biasa. */
export async function applySwUpdate() {
  if (pending && updater) {
    await updater(true);
    return;
  }
  window.location.reload();
}

export type RefreshPhase = 'server' | 'download' | 'reload';

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Tunggu service NMS hidup lagi setelah restart (maks ±90 dtk). Restart
 * berjalan asinkron (systemd-run), jadi beri jeda pendek lalu cek tiap detik.
 */
export async function waitForServer(maxMs = 90_000) {
  const up = async () => {
    try { return (await fetch('/api/public/branding', { cache: 'no-store' })).ok; } catch { return false; }
  };
  await sleep(2500);
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await up()) return;
    await sleep(1000);
  }
}

/** Tunggu worker selesai terpasang ('installed') atau gagal; maks maxMs. */
function waitInstalled(w: ServiceWorker, maxMs: number) {
  return new Promise<void>(resolve => {
    if (w.state !== 'installing') { resolve(); return; }
    const done = () => { w.removeEventListener('statechange', onChange); clearTimeout(timer); resolve(); };
    const onChange = () => { if (w.state !== 'installing') done(); };
    const timer = setTimeout(done, maxMs);
    w.addEventListener('statechange', onChange);
  });
}

/** Aktifkan worker yang menunggu lalu reload begitu ia mengambil alih halaman. */
function activateAndReload(w: ServiceWorker) {
  let reloaded = false;
  const reload = () => { if (!reloaded) { reloaded = true; window.location.reload(); } };
  navigator.serviceWorker.addEventListener('controllerchange', reload);
  w.postMessage({ type: 'SKIP_WAITING' });
  setTimeout(reload, 4000); // cadangan bila controllerchange tidak terpicu
}

/**
 * Setelah update server: ambil sw.js baru SEKARANG (file dist sudah baru di
 * disk walau service masih restart), tunggu unduhan selesai — bukan batas
 * tetap 6 dtk yang di HP sering terlewat sehingga yang termuat versi lama —
 * lalu aktifkan dan muat ulang. Tanpa versi baru: reload biasa.
 */
export async function refreshAfterServerUpdate(opts: { waitServer?: boolean; onPhase?: (p: RefreshPhase) => void } = {}) {
  const { waitServer = false, onPhase } = opts;
  const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
  let reg: ServiceWorkerRegistration | undefined;
  try { reg = await sw?.getRegistration(); } catch { reg = undefined; }
  // Mulai unduh versi baru sejajar dengan menunggu service hidup lagi.
  const fetchNew = reg ? reg.update().catch(() => undefined) : Promise.resolve();
  if (waitServer) { onPhase?.('server'); await waitForServer(); }
  await fetchNew;
  if (reg && !reg.waiting && !reg.installing && waitServer) {
    // sw.js mungkin terbaca saat restart; coba sekali lagi setelah server hidup.
    await reg.update().catch(() => undefined);
  }
  if (reg?.installing) {
    onPhase?.('download');
    await waitInstalled(reg.installing, 45_000);
  }
  onPhase?.('reload');
  if (reg?.waiting) { activateAndReload(reg.waiting); return; }
  if (pending && updater) { await updater(true); return; }
  window.location.reload();
}
