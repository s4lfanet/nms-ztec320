// Pengganti modul virtual vite-plugin-pwa saat tes (tidak ada plugin PWA di vitest).
export function registerSW() { return async () => undefined; }
