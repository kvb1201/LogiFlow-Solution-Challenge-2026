import { useAuthStore } from '@/store/useAuthStore';

interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
}

/**
 * Reusable API client that automatically attaches the JWT
 * and handles 401 Unauthorized responses by clearing the session.
 */
export async function apiClient(url: string, options: FetchOptions = {}) {
  const { requireAuth = true, ...customOptions } = options;
  const headers = new Headers(customOptions.headers);

  // If auth is required, attach the token from sessionStorage
  if (requireAuth) {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('auth_token') : null;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  // Ensure content-type is application/json by default if body is present and no content type is set
  if (customOptions.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...customOptions,
    headers,
  });

  // Handle 401 Unauthorized
  if (response.status === 401) {
    // Session is invalid or expired
    if (typeof window !== 'undefined') {
      useAuthStore.getState().logout();
      // Only redirect if not already on login page
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
  }

  return response;
}
