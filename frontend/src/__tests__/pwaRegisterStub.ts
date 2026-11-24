// Pengganti modul virtual vite-plugin-pwa saat tes (tidak ada plugin PWA di vitest).
type Opts = { onNeedRefresh?: () => void };
export const swStub: { opts: Opts | null } = { opts: null };
export function registerSW(opts: Opts = {}) { swStub.opts = opts; return async () => undefined; }
