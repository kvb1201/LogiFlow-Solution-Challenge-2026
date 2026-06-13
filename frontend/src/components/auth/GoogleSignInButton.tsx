'use client';

import { useEffect, useRef, useState } from 'react';

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

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

function GoogleLogo({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function loadGsiScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In')), {
        once: true,
      });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'));
    document.head.appendChild(script);
  });
}

type GoogleSignInButtonProps = {
  clientId?: string;
  onSuccess: (credential: string) => void;
  disabled?: boolean;
};

/** Branded shell over the official Google Sign-In control (required for OAuth). */
export function GoogleSignInButton({
  clientId: clientIdProp,
  onSuccess,
  disabled = false,
}: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const onSuccessRef = useRef(onSuccess);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (disabled || initializedRef.current) return;

    let cancelled = false;

    const mountButton = async () => {
      try {
        await loadGsiScript();
        if (cancelled || !window.google?.accounts?.id) return;

        const clientId =
          clientIdProp?.trim() ||
          process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
          '';
        if (!clientId) {
          setLoadError('Google sign-in is not configured.');
          return;
        }

        const overlay = overlayRef.current;
        const container = containerRef.current;
        if (!overlay || !container) return;

        initializedRef.current = true;
        overlay.innerHTML = '';

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: GoogleAuthResponse) => {
            onSuccessRef.current(response.credential);
          },
        });

        const width = Math.min(400, Math.max(240, Math.round(container.offsetWidth)));

        window.google.accounts.id.renderButton(overlay, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'left',
          width,
        });

        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setLoadError('Could not load Google Sign-In. Refresh and try again.');
      }
    };

    void mountButton();

    return () => {
      cancelled = true;
    };
  }, [disabled, clientIdProp]);

  return (
    <div ref={containerRef} className="group relative w-full">
      <div
        aria-hidden
        className={`pointer-events-none flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-foreground px-5 py-3.5 text-sm font-semibold text-background shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_16px_48px_-28px_rgba(255,255,255,0.35)] transition-all duration-300 group-hover:scale-[1.01] group-hover:brightness-105 group-hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.16),0_20px_56px_-24px_rgba(255,255,255,0.42)] ${
          ready ? '' : 'opacity-80'
        }`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background shadow-sm">
          <GoogleLogo className="h-[18px] w-[18px]" />
        </span>
        <span className="tracking-tight">Continue with Google</span>
      </div>

      <div
        ref={overlayRef}
        className={`absolute inset-0 z-10 overflow-hidden rounded-xl [&>div]:!h-full [&>div]:!w-full ${
          ready && !disabled && !loadError
            ? 'cursor-pointer opacity-[0.001]'
            : 'pointer-events-none opacity-0'
        }`}
        aria-label="Sign in with Google"
      />

      {!ready && !loadError ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-background/15 backdrop-blur-[1px]">
          <div
            className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground"
            aria-hidden
          />
        </div>
      ) : null}

      {loadError ? (
        <p role="alert" className="mt-2 text-center text-xs text-risk">
          {loadError}
        </p>
      ) : null}
    </div>
  );
}
