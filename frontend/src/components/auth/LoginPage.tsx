'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/useAuthStore';
import { AmbientBackdrop } from '@/components/cockpit/AmbientBackdrop';
import { AmbientSurface } from '@/components/cockpit/AmbientSurface';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';

/** Map raw API/network errors to user-friendly messages. */
function friendlyError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('audience') || msg.includes('token') || msg.includes('invalid')) {
      return 'Unable to verify your Google account. Please try again.';
    }
    if (msg.includes('network') || msg.includes('fetch')) {
      return 'Connection error. Check your internet and try again.';
    }
    if (msg.includes('401') || msg.includes('unauthorized')) {
      return 'Google authentication failed. Please try again.';
    }
  }
  return 'Google authentication failed. Please try again.';
}

export function LoginPage() {
  const router = useRouter();
  const { user, token, setUser, setToken, setError, error } = useAuthStore();
  const [authenticating, setAuthenticating] = useState(false);

  // Redirect immediately if already authenticated
  useEffect(() => {
    if (token && user) {
      router.replace('/dashboard');
    }
  }, [token, user, router]);

  const handleGoogleSuccess = async (credential: string) => {
    setAuthenticating(true);
    setError(null);

    try {
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });

      if (!loginResponse.ok) {
        const body = await loginResponse.json().catch(() => ({})) as { detail?: string };
        throw new Error(body.detail ?? 'Login failed');
      }

      const { user, token } = await loginResponse.json() as { user: unknown; token: string };

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('auth_token', token);
      }
      setToken(token);
      setUser(user as Parameters<typeof setUser>[0]);
      router.replace('/dashboard');
    } catch (err) {
      setAuthenticating(false);
      setError(friendlyError(err));
    }
  };

  // Already authenticated — show nothing while redirecting
  if (token && user) return null;

  // Loading overlay — shown immediately after Google credential received
  if (authenticating) {
    return (
      <div className="relative flex min-h-app items-center justify-center">
        <AmbientBackdrop variant="home" />
        <div
          role="status"
          aria-live="polite"
          className="relative z-10 flex flex-col items-center gap-4 text-center"
        >
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground"
            aria-hidden="true"
          />
          <p className="text-sm font-semibold text-foreground">Signing you in…</p>
          <p className="text-[11px] text-muted-foreground">Verifying your Google account</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-app w-full flex-col overflow-hidden">
      <AmbientBackdrop variant="home" />

      <div className="relative z-20 flex items-center justify-end px-4 py-4 sm:px-6 sm:py-5">
        <Link
          href="/"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Back to LogiFlow home"
        >
          ← Back to home
        </Link>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-4 pb-10 sm:px-6">
        <div className="w-full max-w-[420px]">
          <AmbientSurface mode="home" mesh="card" className="overflow-hidden">
            <div className="space-y-8 p-5 sm:p-8 md:p-10">
              {/* Header */}
              <header className="space-y-3 text-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/45 bg-background/40 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse" aria-hidden />
                  Sign in
                </div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
                  Smart Shipment Planner
                </h1>
                <p className="mx-auto max-w-[30rem] text-sm leading-relaxed text-muted-foreground">
                  Sign in to plan optimised multimodal shipments, track active trips, and save your
                  routes.
                </p>
              </header>

              {error ? (
                <div
                  role="alert"
                  className="rounded-lg border border-risk/30 bg-risk/10 px-4 py-3"
                >
                  <p className="text-sm text-foreground">{error}</p>
                </div>
              ) : null}

              {/* Google sign-in */}
              <section aria-labelledby="login-google-heading" className="space-y-4">
                <h2 id="login-google-heading" className="sr-only">
                  Sign in with Google
                </h2>
                <GoogleSignInButton onSuccess={handleGoogleSuccess} />
                <p className="text-center text-xs leading-relaxed text-muted-foreground">
                  By signing in, you agree to LogiFlow&apos;s{' '}
                  <Link
                    href="/terms"
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link
                    href="/privacy"
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    Privacy Policy
                  </Link>
                  .
                </p>
              </section>

              {/* New account help */}
              <section
                aria-labelledby="login-google-account-heading"
                className="space-y-3 border-t border-border/45 pt-6"
              >
                <div className="space-y-1 text-center">
                  <h2
                    id="login-google-account-heading"
                    className="text-sm font-semibold text-foreground"
                  >
                    Don&apos;t have a Google account?
                  </h2>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    LogiFlow uses Google for authentication. Create a Google account first if you
                    don&apos;t already have one.
                  </p>
                </div>
                <a
                  href="https://accounts.google.com/signup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border/50 bg-surface/30 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-border/70 hover:bg-surface/45"
                  aria-label="Create a Google account (opens in new tab)"
                >
                  Create a Google account
                  <span className="material-symbols-outlined text-base" aria-hidden>
                    open_in_new
                  </span>
                </a>
              </section>
            </div>
          </AmbientSurface>
        </div>
      </div>
    </div>
  );
}
