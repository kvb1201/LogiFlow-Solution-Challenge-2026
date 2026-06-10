'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';

// ── ProtectedRoute — requires authentication ──────────────────────────────

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token, loading } = useAuthStore();

  useEffect(() => {
    // Wait for restore() to finish before making redirect decisions
    if (loading) return;

    if (!token || !user) {
      const publicPages = ['/', '/login', '/signup', '/landing'];
      const isPublic = pathname ? publicPages.some(p => pathname === p || pathname.startsWith(p + '/')) : false;
      if (!isPublic) {
        router.replace('/login');
      }
    }
  }, [token, user, loading, pathname, router]);

  const publicPages = ['/', '/login', '/signup', '/landing'];
  const isPublic = pathname
    ? publicPages.some((p) => pathname === p || pathname.startsWith(`${p}/`))
    : true;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-app bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    if (isPublic) return <>{children}</>;
    return null;
  }

  return <>{children}</>;
}

// ── PublicRoute — redirects to dashboard if already authenticated ─────────

export function PublicRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, token, loading } = useAuthStore();
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Don't redirect while auth is still being restored
    if (loading) return;
    // Only redirect once per mount to avoid loops
    if (hasRedirected.current) return;
    if (token && user) {
      hasRedirected.current = true;
      router.replace('/dashboard');
    }
  }, [token, user, loading, router]);

  // While loading: show nothing — avoids flash of login form for already-authed users
  if (loading) return null;

  // Already authenticated — show nothing while redirect is in progress
  if (token && user) return null;

  return <>{children}</>;
}
