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

describe('pemulihan bila reload tidak mengambil versi baru', () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
  });
  function mockReset() {
    const unregister = vi.fn(async () => true);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: async () => [{ unregister }], getRegistration: async () => undefined, addEventListener: () => undefined },
    });
    const del = vi.fn(async () => true);
    vi.stubGlobal('caches', { keys: async () => ['workbox-precache-v2'], delete: del });
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload, href: 'http://localhost/' } });
    return { unregister, del, reload };
  }

  it('masih versi lama setelah reload → buang SW & cache lalu reload sekali', async () => {
    const { unregister, del, reload } = mockReset();
    setRunning('/assets/index-OLD.js');
    sessionStorage.setItem('nms-sw-attempt', JSON.stringify({ target: '/assets/index-NEW.js', at: Date.now() }));
    const m = await import('../lib/swUpdate');
    await m.checkUpdateOutcome();
    expect(unregister).toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith('workbox-precache-v2');
    expect(reload).toHaveBeenCalledTimes(1);
    // percobaan kedua dalam semenit tidak me-reload lagi (cegah loop)
    sessionStorage.setItem('nms-sw-attempt', JSON.stringify({ target: '/assets/index-NEW.js', at: Date.now() }));
    await m.checkUpdateOutcome();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('versi sudah sesuai target → tidak melakukan apa-apa', async () => {
    const { reload } = mockReset();
    setRunning('/assets/index-NEW.js');
    sessionStorage.setItem('nms-sw-attempt', JSON.stringify({ target: '/assets/index-NEW.js', at: Date.now() }));
    const m = await import('../lib/swUpdate');
    await m.checkUpdateOutcome();
    expect(reload).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('nms-sw-attempt')).toBeNull();
  });
});
