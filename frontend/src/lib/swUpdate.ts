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
const listeners = new Set<() => void>();

export function initServiceWorker() {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      void handleNeedRefresh();
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

/** Berkas bundel utama yang sedang berjalan di halaman ini (mis. /assets/index-AbC123.js). */
export function runningBuild(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  return el ? new URL(el.src, window.location.href).pathname : null;
}

/** Bundel utama yang dirujuk index.html di server SAAT INI. Query `?v=` membuat permintaan
 *  tidak cocok dengan precache service worker, jadi selalu diambil dari jaringan. */
export async function serverBuild(): Promise<string | null> {
  try {
    const r = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) return null;
    const m = (await r.text()).match(/<script[^>]*\ssrc="([^"]*\/assets\/index-[^"]+\.js)"/);
    return m ? new URL(m[1], window.location.href).pathname : null;
  } catch {
    return null;
  }
}

/** true = tampilan lebih lama dari server; false = sudah sama; null = tidak bisa dipastikan. */
export async function uiIsStale(): Promise<boolean | null> {
  const run = runningBuild();
  if (!run) return null;
  const srv = await serverBuild();
  return srv ? srv !== run : null;
}

/**
 * Service worker baru selesai terpasang. Pemberitahuan "Muat ulang" HANYA tampil bila
 * tampilan yang berjalan memang lebih lama dari server. Bila sudah sama (mis. halaman
 * baru saja dimuat ulang setelah Apply Update, atau sw.js berubah tanpa perubahan
 * aplikasi), worker baru diaktifkan diam-diam tanpa reload — dulu kasus ini membuat
 * pemberitahuan muncul berulang padahal tampilan sudah terbaru.
 */
async function handleNeedRefresh() {
  const stale = await uiIsStale();
  if (stale === false) {
    await activateSilently();
    return;
  }
  pending = true;
  listeners.forEach(fn => fn());
}

async function activateSilently() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const w = reg?.waiting;
    if (!w) return;
    // sw-reload.js memuat ulang halaman saat controllerchange — tidak perlu di sini
    (window as unknown as { __nmsSilentSwap?: boolean }).__nmsSilentSwap = true;
    w.postMessage({ type: 'SKIP_WAITING' });
  } catch { /* abaikan */ }
}

export function onSwUpdate(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Tombol "Muat ulang" di pemberitahuan: pakai alur yang sama dengan
 * refreshAfterServerUpdate (SKIP_WAITING lalu reload, dengan cadangan).
 * Dulu memanggil updater(true) dari workbox — bila tidak ada worker yang
 * menunggu, panggilan itu diam saja sehingga tombol terasa tidak merespons.
 */
export function applySwUpdate() {
  return refreshAfterServerUpdate();
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

/** Promise yang menyerah setelah ms (hasil undefined) — reg.update() di HP bisa menggantung. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, sleep(ms).then(() => undefined)]);
}

/** Aktifkan worker yang menunggu lalu reload begitu ia mengambil alih halaman. */
function activateAndReload(w: ServiceWorker, reload: () => void) {
  navigator.serviceWorker.addEventListener('controllerchange', reload);
  try { w.postMessage({ type: 'SKIP_WAITING' }); } catch { /* tetap ada cadangan */ }
  setTimeout(reload, 4000); // cadangan bila controllerchange tidak terpicu
}

/**
 * Setelah update server: ambil sw.js baru SEKARANG (file dist sudah baru di
 * disk walau service masih restart), tunggu unduhan selesai, lalu aktifkan
 * dan muat ulang. Tanpa versi baru: reload biasa.
 *
 * Selalu berakhir dengan reload: setiap langkah diberi batas waktu dan ada
 * timer cadangan mutlak, jadi klik "Muat ulang" tidak pernah "diam saja".
 * Klik manual (tanpa waitServer) menunggu unduhan maks 12 dtk.
 */
export async function refreshAfterServerUpdate(
  opts: { waitServer?: boolean; onPhase?: (p: RefreshPhase) => void; installWaitMs?: number } = {},
) {
  const { waitServer = false, onPhase } = opts;
  const installWait = opts.installWaitMs ?? (waitServer ? 45_000 : 12_000);
  let done = false;
  let guard: ReturnType<typeof setTimeout> | undefined;
  const reload = () => {
    if (done) return;
    done = true;
    if (guard) clearTimeout(guard);
    window.location.reload();
  };
  try {
    const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
    const reg = sw ? await withTimeout(sw.getRegistration().catch(() => undefined), 3000) : undefined;
    // Mulai unduh versi baru sejajar dengan menunggu service hidup lagi.
    const fetchNew = reg ? withTimeout(reg.update().catch(() => undefined), 10_000) : Promise.resolve();
    if (waitServer) { onPhase?.('server'); await waitForServer(); }
    guard = setTimeout(reload, installWait + 15_000); // cadangan mutlak
    await fetchNew;
    if (reg && !reg.waiting && !reg.installing && waitServer) {
      // sw.js mungkin terbaca saat restart; coba sekali lagi setelah server hidup.
      await withTimeout(reg.update().catch(() => undefined), 10_000);
    }
    if (reg?.installing) {
      onPhase?.('download');
      await waitInstalled(reg.installing, installWait);
    }
    onPhase?.('reload');
    if (reg?.waiting) { activateAndReload(reg.waiting, reload); return; }
    reload();
  } catch {
    reload();
  }
}
