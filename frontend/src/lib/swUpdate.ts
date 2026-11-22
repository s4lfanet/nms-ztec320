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

/** Setelah update server: minta browser cek SW baru, tunggu sebentar, lalu terapkan. */
export async function refreshAfterServerUpdate(timeoutMs = 6000) {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((regs || []).map(r => r.update().catch(() => undefined)));
  } catch { /* abaikan */ }
  const start = Date.now();
  while (!pending && Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 300));
  }
  await applySwUpdate();
}
