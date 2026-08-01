import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
}

function applyTheme(next: Theme) {
  const html = document.documentElement;
  // Add transition class BEFORE toggling the theme class
  html.classList.add('theme-transitioning');
  html.classList.toggle('light', next === 'light');
  localStorage.setItem('theme', next);
  // Remove transition class after animation completes
  setTimeout(() => html.classList.remove('theme-transitioning'), 350);
}

// Cross-tab sync: when theme changes in another tab, apply it here too
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'theme' && e.newValue) {
      const next = e.newValue as Theme;
      const html = document.documentElement;
      html.classList.add('theme-transitioning');
      html.classList.toggle('light', next === 'light');
      setTimeout(() => html.classList.remove('theme-transitioning'), 350);
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
