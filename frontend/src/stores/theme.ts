import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
}

const THEME_COLOR: Record<Theme, string> = {
  dark: '#0B1426',
  light: '#E8EDF2',
};

// Single outstanding timer so rapid/overlapping toggles never cut a transition short.
let transitionTimer: ReturnType<typeof setTimeout> | null = null;

function applyTheme(next: Theme, persist = true) {
  const html = document.documentElement;
  // Add transition class BEFORE toggling the theme class
  html.classList.add('theme-transitioning');
  html.classList.toggle('light', next === 'light');
  if (persist) localStorage.setItem('theme', next);

  // Keep mobile browser chrome / PWA status bar color in sync with the active theme
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[next]);

  // Remove transition class after animation completes, cancelling any pending removal
  // from a previous toggle so it can't fire mid-transition and cause a visual snap.
  if (transitionTimer) clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => {
    html.classList.remove('theme-transitioning');
    transitionTimer = null;
  }, 350);
}

// Cross-tab sync: when theme changes in another tab, apply it here too
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'theme' && e.newValue) {
      const next = e.newValue as Theme;
      applyTheme(next, /* persist */ false); // already persisted by the originating tab
      useTheme.setState({ theme: next });
    }
  });
}

export const useTheme = create<ThemeState>((set) => ({
  theme: (localStorage.getItem('theme') as Theme) ||
    (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'),
  toggle: () => set((s) => {
    const next = s.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    return { theme: next };
  }),
  set: (t) => {
    applyTheme(t);
    set({ theme: t });
  },
}));
