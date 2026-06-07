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

  // Actions
  setUser: (user: AuthUser | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
  restore: () => Promise<void>;
}

// Prevent concurrent restore calls (e.g. AuthInitializer + ProtectedRoute both mounting)
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
        set({ user: null, token: null, error: null });
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('auth_token');
        }
      },

      restore: async () => {
        if (typeof window === 'undefined') return;

        // Guard against double invocation
        if (_restoreInFlight) return;

        const token =
          sessionStorage.getItem('auth_token') ?? get().token ?? null;

        if (!token) {
          set({ token: null, user: null, loading: false });
          return;
        }

        // If we already have a user in state and the token matches, skip network call
        const currentUser = get().user;
        if (currentUser && get().token === token) return;

        _restoreInFlight = true;
        set({ loading: true });

        try {
          // /api/auth/me is proxied by Next.js to the FastAPI backend
          const response = await apiClient('/api/auth/me', {
            method: 'GET',
            requireAuth: true,
          });

          if (response.ok) {
            const user: AuthUser = await response.json();
            // Keep token in sync with sessionStorage
            sessionStorage.setItem('auth_token', token);
            set({ user, token, error: null });
          } else {
            // Token invalid or expired — clear everything
            sessionStorage.removeItem('auth_token');
            set({ token: null, user: null, error: null });
          }
        } catch (err) {
          console.error('[useAuthStore] Session restore failed:', err);
          sessionStorage.removeItem('auth_token');
          set({ token: null, user: null, error: null });
        } finally {
          set({ loading: false });
          _restoreInFlight = false;
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
      }),
    }
  )
);
