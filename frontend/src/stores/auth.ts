import { create } from 'zustand';
import { api, ApiError, type User } from '../lib/api';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  /** Backend error_code from the last failed login — lets the UI translate. */
  errorCode?: string;
  errorData?: Record<string, unknown>;
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
      // Batas waktu: permintaan yang menggantung tidak boleh menahan layar "Loading..." selamanya.
      const once = () => Promise.race([
        api.me(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 15_000)),
      ]);
      let res;
      try { res = await once(); } catch (e) {
        if ((e as Error).message !== 'timeout') throw e;
        res = await once(); // coba sekali lagi sebelum menyerah
      }
      set({ user: res.user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  login: async (username, password) => {
    try {
      set({ error: null, errorCode: undefined, errorData: undefined });
      const { user } = await api.login(username, password);
      set({ user });
      return true;
    } catch (e: unknown) {
      set({
        error: e instanceof Error ? e.message : 'Login failed',
        errorCode: e instanceof ApiError ? e.errorCode : undefined,
        errorData: e instanceof ApiError ? e.data : undefined,
      });
      return false;
    }
  },

  logout: async () => {
    set({ user: null });
    api.logout().catch(() => {});
  },
}));
