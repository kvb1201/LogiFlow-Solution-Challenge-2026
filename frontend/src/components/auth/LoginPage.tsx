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
    // Show "Authenticating…" immediately — prevents freeze perception
    setAuthenticating(true);
    setError(null);

    try {
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });

      if (!loginResponse.ok) {
        throw new Error('Login failed. Please try again.');
      }

      const { user, token } = await loginResponse.json() as { user: unknown; token: string };

      // Persist token and user immediately — this prevents restore() from clearing them
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('auth_token', token);
      }
      setToken(token);
      setUser(user as Parameters<typeof setUser>[0]);

      // Navigate after state is set — replace so back button doesn't return to /login
      router.replace('/dashboard');
    } catch (err) {
      setAuthenticating(false);
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    }
  };

  // Already authenticated — show nothing while redirecting
  if (token && user) return null;

  // Authenticating overlay — shown immediately after Google credential received
  if (authenticating) {
    return (
      <div className="relative flex min-h-screen items-center justify-center">
        <AmbientBackdrop variant="home" />
        <div className="relative z-10 flex flex-col items-center gap-4 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="text-sm font-semibold text-foreground">Authenticating…</p>
          <p className="text-[11px] text-muted-foreground">Restoring your session</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-screen overflow-hidden flex flex-col">
      <AmbientBackdrop variant="home" />

      {/* Back to home link — no duplicate LogiFlow branding here; NavBar handles that */}
      <div className="relative z-20 flex items-center justify-end px-4 sm:px-6 py-4 sm:py-5">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to home
        </Link>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 sm:px-6 py-8">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-border/50 bg-surface/40 backdrop-blur-sm p-8 sm:p-10 space-y-6">

            {/* Heading — no LogiFlow logo here; it's already in NavBar */}
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
                Smart Shipment Planner
              </h1>
              <p className="text-sm text-muted-foreground">
                Sign in to plan optimized multimodal shipments, track active trips, and save your routes.
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="rounded-lg border border-risk/30 bg-risk/10 p-4">
                <p className="text-sm text-foreground">{error}</p>
              </div>
            )}

            {/* Google Sign-In Button */}
            <div>
              <div
                id="google-signin-button"
                className="flex justify-center"
              />
            </div>

            {/* Terms */}
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              By signing in, you agree to LogiFlow's{' '}
              <a href="#" className="text-rail hover:underline">Terms of Service</a>
              {' '}and{' '}
              <a href="#" className="text-rail hover:underline">Privacy Policy</a>.
            </p>
          </div>

          {/* Sign up hint */}
          <div className="mt-6 text-center text-sm text-muted-foreground">
            New here?{' '}
            <button
              onClick={() => document.getElementById('google-signin-button')?.querySelector('div')?.click()}
              className="text-rail font-semibold hover:underline"
            >
              Create an account with Google
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
