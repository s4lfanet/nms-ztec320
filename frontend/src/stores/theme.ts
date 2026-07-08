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

export const useTheme = create<ThemeState>((set) => ({
  theme: (localStorage.getItem('theme') as Theme) || 'dark',
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
