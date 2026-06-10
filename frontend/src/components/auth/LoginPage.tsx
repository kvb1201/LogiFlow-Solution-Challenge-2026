'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/useAuthStore';
import { AmbientBackdrop } from '@/components/cockpit/AmbientBackdrop';

interface GoogleAuthResponse {
  credential: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: unknown) => void;
          renderButton: (element: HTMLElement, config: unknown) => void;
          cancel: () => void;
        };
      };
    };
  }
}

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
  const initializedRef = useRef(false);

  // Redirect immediately if already authenticated
  useEffect(() => {
    if (token && user) {
      router.replace('/dashboard');
    }
  }, [token, user, router]);

  // Load Google Sign-In script once
  useEffect(() => {
    if (initializedRef.current) return;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (initializedRef.current) return;
      if (!window.google) return;

      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (!clientId) {
        console.error('[AUTH] NEXT_PUBLIC_GOOGLE_CLIENT_ID is missing');
        return;
      }

      initializedRef.current = true;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleSuccess,
      });

      const buttonContainer = document.getElementById('google-signin-button');
      if (buttonContainer) {
        window.google.accounts.id.renderButton(buttonContainer, {
          type: 'standard',
          theme: 'dark',
          size: 'large',
          text: 'signin_with',
        });
      }
    };

    document.head.appendChild(script);
    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogleSuccess = async (response: GoogleAuthResponse) => {
    setAuthenticating(true);
    setError(null);

    try {
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
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
      <div className="relative flex min-h-screen items-center justify-center">
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
    <div className="relative w-full min-h-screen overflow-hidden flex flex-col">
      <AmbientBackdrop variant="home" />

      {/* Back to home — NavBar already carries the LogiFlow brand */}
      <div className="relative z-20 flex items-center justify-end px-4 sm:px-6 py-4 sm:py-5">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back to LogiFlow home"
        >
          ← Back to home
        </Link>
      </div>

      {/* Main card */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 sm:px-6 py-8">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-border/50 bg-surface/40 backdrop-blur-sm p-8 sm:p-10 space-y-6">

            {/* Heading */}
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
                Smart Shipment Planner
              </h1>
              <p className="text-sm text-muted-foreground">
                Sign in to plan optimised multimodal shipments, track active trips, and save your routes.
              </p>
            </div>

            {/* Error banner */}
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-risk/30 bg-risk/10 px-4 py-3"
              >
                <p className="text-sm text-foreground">{error}</p>
              </div>
            )}

            {/* Google Sign-In button — rendered by GSI SDK */}
            <div
              id="google-signin-button"
              className="flex justify-center"
              aria-label="Sign in with Google"
            />

            {/* Legal links */}
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              By signing in, you agree to LogiFlow&apos;s{' '}
              <Link href="/terms" className="text-rail hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-rail rounded">
                Terms of Service
              </Link>
              {' '}and{' '}
              <Link href="/privacy" className="text-rail hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-rail rounded">
                Privacy Policy
              </Link>.
            </p>
          </div>

          {/* New account hint */}
          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Don&apos;t have a Google account?
            </p>
            <a
              href="https://accounts.google.com/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-semibold text-rail hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-rail rounded"
              aria-label="Create a Google account (opens in new tab)"
            >
              Create a Google account →
            </a>
            <p className="text-xs text-muted-foreground px-4">
              LogiFlow uses Google for authentication. Create a Google account first if you don&apos;t already have one.
            </p>
          </div>

          {/* Footer legal links */}
          <div className="mt-8 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms &amp; Conditions
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
