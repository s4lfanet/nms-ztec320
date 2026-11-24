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

  it('reg.update() menggantung: klik manual tetap reload (tidak diam)', async () => {
    vi.useFakeTimers();
    mockReg({ waiting: null, installing: null, update: vi.fn(() => new Promise(() => undefined)) });
    const { applySwUpdate } = await import('../lib/swUpdate');
    const p = applySwUpdate();
    await vi.advanceTimersByTimeAsync(10_500);
    await p;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('worker menunggu tanpa controllerchange: reload lewat cadangan 4 dtk', async () => {
    vi.useFakeTimers();
    const w = fakeWorker('installed');
    mockReg({ waiting: w, installing: null, update: vi.fn(async () => undefined) });
    const { applySwUpdate } = await import('../lib/swUpdate');
    await applySwUpdate();
    expect(w.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4100);
    expect(reload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('instalasi macet: klik manual menyerah setelah 12 dtk lalu reload', async () => {
    vi.useFakeTimers();
    const w = fakeWorker('installing');
    mockReg({ waiting: null, installing: w, update: vi.fn(async () => undefined) });
    const { applySwUpdate } = await import('../lib/swUpdate');
    const p = applySwUpdate();
    await vi.advanceTimersByTimeAsync(12_100);
    await p;
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
