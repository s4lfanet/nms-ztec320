import { create } from 'zustand';
import { useAuth } from './auth';

export type Theme = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

const STORAGE_KEY = 'theme';
const VALID: Theme[] = ['dark', 'light', 'system'];

const media = () => window.matchMedia('(prefers-color-scheme: light)');

export function resolveTheme(t: Theme): ResolvedTheme {
  if (t === 'system') return media().matches ? 'light' : 'dark';
  return t;
}

function applyClass(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle('light', resolved === 'light');
}

function persistToServer(t: Theme) {
  // Fire-and-forget — preference save should never block or toast.
  // Only attempt when a session exists (login page users get localStorage only).
  if (!useAuth.getState().user) return;
  fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ theme: t }),
  }).catch(() => {});
}

interface ThemeState {
  /** User preference — may be 'system'. */
  theme: Theme;
  /** The theme actually applied to <html> right now. */
  resolved: ResolvedTheme;
  /**
   * Change the preference. `persist: false` skips the server write (used when
   * hydrating from the user profile itself — no point echoing it back).
   */
  set: (t: Theme, opts?: { persist?: boolean }) => void;
  /** Cycle dark → light (quick toggle in Topbar). */
  toggle: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: 'dark',
  resolved: 'dark',
  set: (t, opts) => {
    if (!VALID.includes(t)) t = 'system';
    const resolved = resolveTheme(t);
    applyClass(resolved);
    localStorage.setItem(STORAGE_KEY, t);
    set({ theme: t, resolved });
    if (opts?.persist !== false) persistToServer(t);
  },
  toggle: () => {
    const next: Theme = get().resolved === 'light' ? 'dark' : 'light';
    get().set(next);
  },
}));

/**
 * Boot-time init — call once from main.tsx before render.
 * Applies the stored (or system) theme immediately to avoid a flash, then
 * watches the OS setting so 'system' follows it live.
 */
export function initTheme(): void {
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  const initial: Theme = stored && VALID.includes(stored) ? stored : 'system';
  const resolved = resolveTheme(initial);
  applyClass(resolved);
  useTheme.setState({ theme: initial, resolved });

  media().addEventListener('change', () => {
    const { theme } = useTheme.getState();
    if (theme !== 'system') return;
    const next = resolveTheme('system');
    applyClass(next);
    useTheme.setState({ resolved: next });
  });
}
