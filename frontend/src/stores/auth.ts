import { create } from 'zustand';
import { api, type User } from '../lib/api';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  fetchUser: () => Promise<void>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,

  fetchUser: async () => {
    try {
      set({ loading: true, error: null });
      const { user } = await api.me();
      set({ user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  login: async (username, password) => {
    try {
      set({ error: null });
      const { user } = await api.login(username, password);
      set({ user });
      return true;
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Login failed' });
      return false;
    }
  },

  logout: async () => {
    set({ user: null });
    api.logout().catch(() => {});
  },
}));
