import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';


type Listener = () => void;
function fakeWorker(state: string) {
  const ls: Listener[] = [];
  return {
    state,
    postMessage: vi.fn(),
    addEventListener: (_: string, fn: Listener) => ls.push(fn),
    removeEventListener: () => undefined,
    finish(next: string) { this.state = next; ls.forEach(f => f()); },
  };
}

describe('refreshAfterServerUpdate', () => {
  const reload = vi.fn();
  let swListeners: Record<string, Listener> = {};
  beforeEach(() => {
    reload.mockReset(); swListeners = {};
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } });
  });
  afterEach(() => { vi.useRealTimers(); });

  function mockReg(reg: Record<string, unknown>) {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: async () => reg,
        addEventListener: (ev: string, fn: Listener) => { swListeners[ev] = fn; },
      },
    });
  }

  it('menunggu unduhan selesai lalu SKIP_WAITING + reload saat controllerchange', async () => {
    const w = fakeWorker('installing');
    const reg: Record<string, unknown> = { waiting: null, installing: w, update: vi.fn(async () => undefined) };
    mockReg(reg);
    const { refreshAfterServerUpdate } = await import('../lib/swUpdate');
    const phases: string[] = [];
    const p = refreshAfterServerUpdate({ onPhase: ph => phases.push(ph) });
    await new Promise(r => setTimeout(r, 10));
    expect(phases).toContain('download');
    reg.installing = null; reg.waiting = w; w.finish('installed');
    await p;
    expect(w.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    swListeners.controllerchange();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('tanpa versi baru langsung reload biasa', async () => {
    mockReg({ waiting: null, installing: null, update: vi.fn(async () => undefined) });
    const { refreshAfterServerUpdate } = await import('../lib/swUpdate');
    await refreshAfterServerUpdate();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
