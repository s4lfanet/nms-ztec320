import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
}

// Dark-only theme — light theme has been removed.
// Store kept for backward compatibility but always returns 'dark'.
export const useTheme = create<ThemeState>(() => ({
  theme: 'dark',
  toggle: () => {},
  set: () => {},
}));
