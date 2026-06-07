'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Radar, ArrowUpRight } from 'lucide-react';
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
          initialize: (config: any) => void;
          renderButton: (element: HTMLElement, config: any) => void;
          cancel: () => void;
        };
      };
    };
  }
}

export function LoginPage() {
  const router = useRouter();
  const { user, token, setUser, setToken, setError, error } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    // If already authenticated, redirect to dashboard
    if (token && user) {
      router.push('/dashboard');
      return;
    }
  }, [token, user, router]);

  useEffect(() => {
    // Load Google Sign-In script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      console.log('[AUTH] Google script loaded');

      if (initializedRef.current) {
        console.warn('[AUTH] Google Sign-In already initialized, skipping');
        return;
      }

      if (window.google) {
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

        console.log('[AUTH] NEXT_PUBLIC_GOOGLE_CLIENT_ID:', clientId);

        if (!clientId) {
          console.error('[AUTH] NEXT_PUBLIC_GOOGLE_CLIENT_ID is missing');
          return;
        }

        initializedRef.current = true;

        console.log('[AUTH] Initializing Google Sign-In');

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleSuccess,
        });

        console.log('[AUTH] Google Sign-In initialized successfully');

        const buttonContainer = document.getElementById('google-signin-button');
        console.log('[AUTH] Rendering Google button');
        if (buttonContainer) {
          window.google.accounts.id.renderButton(buttonContainer, {
            type: 'standard',
            theme: 'dark',
            size: 'large',
            text: 'signin_with',
          });
          console.log('[AUTH] Google button rendered');
        }
      } else {
        console.error('[AUTH] window.google is unavailable after script load');
      }
    };
    
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  const handleGoogleSuccess = async (response: GoogleAuthResponse) => {
    console.log('[AUTH] Google credential received');
    setLoading(true);
    setError(null);

    try {
      console.log('[AUTH] Sending credential to backend');
      // Send raw credential directly to backend
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: response.credential,
        }),
      });

      if (!loginResponse.ok) {
        throw new Error('Login failed');
      }

      const { user, token } = await loginResponse.json();
      console.log('[AUTH] Backend login successful', {
        email: user?.email,
        hasToken: !!token,
      });
      
      setUser(user);
      setToken(token);

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err) {
      setError('Login failed. Please try again.');
      console.error('[AUTH] Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full min-h-screen overflow-hidden flex flex-col">
      <AmbientBackdrop variant="home" />

      {/* Header with Logo */}
      <div className="relative z-20 flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5">
        <Link href="/" className="group flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <div className="relative grid h-8 w-8 place-items-center rounded-lg border border-border-strong bg-surface-2 text-rail shadow-[0_0_30px_-18px_var(--rail)] transition-shadow duration-300 group-hover:shadow-[0_0_40px_-12px_var(--rail)]">
            <Radar className="h-4 w-4" strokeWidth={2.4} />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-background bg-live" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold">LogiFlow</div>
            <div className="hidden text-[8px] uppercase tracking-[0.15em] text-muted-foreground sm:block">
              Multimodal freight
            </div>
          </div>
        </Link>
        
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Back to home
        </Link>
      </div>

      {/* Main Content */}
      <div className="relative z-10 pointer-events-auto flex flex-1 items-center justify-center px-4 sm:px-6 py-8">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-border/50 bg-surface/40 backdrop-blur-sm p-8 sm:p-10 space-y-6">
            {/* Heading */}
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Welcome back</h1>
              <p className="text-sm text-muted-foreground">
                Sign in to your LogiFlow account to start planning optimized shipments.
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
                style={{ pointerEvents: loading ? 'none' : 'auto', opacity: loading ? 0.6 : 1 }}
              />
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/40" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-surface/40 text-muted-foreground">or</span>
              </div>
            </div>

            {/* Email Input (Future) */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Email (Coming Soon)
                </label>
                <input
                  type="email"
                  disabled
                  placeholder="your@email.com"
                  className="w-full rounded-lg border border-border/40 bg-surface/40 px-4 py-2.5 text-sm text-muted-foreground placeholder-muted-foreground/50 cursor-not-allowed opacity-50"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Email/password authentication coming in a future update.
              </p>
            </div>

            {/* Terms */}
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              By signing in, you agree to LogiFlow's{' '}
              <a href="#" className="text-rail hover:underline">
                Terms of Service
              </a>
              {' '}and{' '}
              <a href="#" className="text-rail hover:underline">
                Privacy Policy
              </a>
              .
            </p>
          </div>

          {/* Signup Link */}
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <button
              onClick={() => document.getElementById('google-signin-button')?.click()}
              className="text-rail font-semibold hover:underline"
            >
              Sign up with Google
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
