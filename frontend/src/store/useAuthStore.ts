'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { apiClient } from '@/lib/apiClient';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  provider: string;
  created_at: string;
  last_login: string;
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  error: string | null;

  setUser: (user: AuthUser | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
  restore: () => Promise<void>;
}

// Single in-flight guard — prevents concurrent restore() calls
// from AuthInitializer and ProtectedRoute both mounting simultaneously.
let _restoreInFlight = false;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      loading: false,
      error: null,

      setUser: (user) => set({ user }),

      setToken: (token) => {
        set({ token });
        if (typeof window !== 'undefined') {
          if (token) {
            sessionStorage.setItem('auth_token', token);
          } else {
            sessionStorage.removeItem('auth_token');
          }
        }
      },

      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),

      logout: () => {
        set({ user: null, token: null, error: null, loading: false });
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('auth_token');
        }
        _restoreInFlight = false;
      },

      restore: async () => {
        if (typeof window === 'undefined') return;

        // Guard: don't restore if already in-flight
        if (_restoreInFlight) return;

        // Read token from sessionStorage first (written immediately on login),
        // then fall back to persisted Zustand state.
        const storedToken = sessionStorage.getItem('auth_token');
        const stateToken = get().token;
        const token = storedToken ?? stateToken ?? null;

        if (!token) {
          set({ token: null, user: null, loading: false });
          return;
        }

        // If we already have a valid user + matching token in state, skip the network round-trip.
        const existingUser = get().user;
        if (existingUser && get().token === token) {
          // Ensure sessionStorage is in sync
          sessionStorage.setItem('auth_token', token);
          set({ loading: false });
          return;
        }

        _restoreInFlight = true;
        set({ loading: true });

        try {
          const response = await apiClient('/api/auth/me', {
            method: 'GET',
            requireAuth: true,
          });

          if (response.ok) {
            const user: AuthUser = await response.json();
            sessionStorage.setItem('auth_token', token);
            set({ user, token, error: null, loading: false });
          } else {
            // Token invalid — clear state completely
            sessionStorage.removeItem('auth_token');
            set({ token: null, user: null, error: null, loading: false });
          }
        } catch (err) {
          console.error('[useAuthStore] Session restore failed:', err);
          // Network error during restore — keep token if it was freshly set (within 10s)
          // This prevents clearing a valid token on a transient network failure.
          const now = Date.now();
          const tokenAge = typeof window !== 'undefined'
            ? parseInt(sessionStorage.getItem('auth_token_ts') || '0', 10)
            : 0;
          const isFresh = now - tokenAge < 10_000;
          if (!isFresh) {
            sessionStorage.removeItem('auth_token');
            set({ token: null, user: null, error: null, loading: false });
          } else {
            set({ loading: false });
          }
        } finally {
          set({ loading: false });
          _restoreInFlight = false;
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => sessionStorage),
      // Only persist user + token — loading/error are transient
      partialize: (state) => ({
        user: state.user,
        token: state.token,
      }),
    }
  )
);
