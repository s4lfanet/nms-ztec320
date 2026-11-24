import { describe, it, expect, vi, beforeEach } from 'vitest';

function setRunning(src: string) {
  document.head.innerHTML = `<script type="module" crossorigin src="${src}"></script>`;
}
function serverIndex(src: string) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    `<html><head><script src="/sw-reload.js"></script><script type="module" crossorigin src="${src}"></script></head></html>`)));
}

describe('pemberitahuan versi baru hanya bila tampilan memang lama', () => {
  let waiting: { postMessage: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    vi.resetModules();
    waiting = { postMessage: vi.fn() };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: async () => ({ waiting }), addEventListener: () => undefined },
    });
    delete (window as unknown as { __nmsSilentSwap?: boolean }).__nmsSilentSwap;
  });

  it('uiIsStale membandingkan bundel berjalan dengan index.html server', async () => {
    const { uiIsStale } = await import('../lib/swUpdate');
    setRunning('/assets/index-AAA.js');
    serverIndex('/assets/index-AAA.js');
    expect(await uiIsStale()).toBe(false);
    serverIndex('/assets/index-BBB.js');
    expect(await uiIsStale()).toBe(true);
  });

  it('tampilan sudah terbaru: worker diaktifkan diam-diam, tanpa pemberitahuan', async () => {
    const m = await import('../lib/swUpdate');
    m.initServiceWorker();
    const seen = vi.fn();
    m.onSwUpdate(seen);
    setRunning('/assets/index-AAA.js');
    serverIndex('/assets/index-AAA.js');
    const { swStub } = await import('./pwaRegisterStub');
    swStub.opts!.onNeedRefresh!();
    await new Promise(r => setTimeout(r, 20));
    expect(seen).not.toHaveBeenCalled();
    expect(m.swUpdatePending()).toBe(false);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect((window as unknown as { __nmsSilentSwap?: boolean }).__nmsSilentSwap).toBe(true);
  });

  it('tampilan lama: pemberitahuan tampil', async () => {
    const m = await import('../lib/swUpdate');
    m.initServiceWorker();
    const seen = vi.fn();
    m.onSwUpdate(seen);
    setRunning('/assets/index-AAA.js');
    serverIndex('/assets/index-BBB.js');
    const { swStub } = await import('./pwaRegisterStub');
    swStub.opts!.onNeedRefresh!();
    await new Promise(r => setTimeout(r, 20));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(waiting.postMessage).not.toHaveBeenCalled();
  });
});
