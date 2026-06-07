'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token, loading } = useAuthStore();

  useEffect(() => {
    if (loading) return;

    // If no token/user and not on a public page, redirect to login
    if (!token || !user) {
      const publicPages = ['/', '/login', '/signup', '/landing'];
      const isPublicPage = pathname ? publicPages.includes(pathname) : false;
      
      if (!isPublicPage) {
        router.push('/login');
      }
    }
  }, [token, user, loading, pathname, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="inline-block animate-spin mb-4">
            <div className="h-8 w-8 rounded-full border-2 border-rail border-t-transparent" />
          </div>
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function PublicRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, token } = useAuthStore();

  useEffect(() => {
    // If authenticated and on public page, redirect to dashboard
    if (token && user) {
      router.push('/dashboard');
    }
  }, [token, user, router]);

  return <>{children}</>;
}
