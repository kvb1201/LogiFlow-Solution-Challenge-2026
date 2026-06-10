'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AmbientBackdrop } from '@/components/cockpit/AmbientBackdrop';
import { setShipmentAutorun } from '@/lib/shipmentAutorun';
import {
  clearTrafficQueueContext,
  loadTrafficQueueContext,
  reasonCopy,
  type TrafficQueueReason,
} from '@/lib/traffic-queue';

type Phase = 'holding' | 'clearing' | 'entering';

const PHASES: { id: Phase; label: string }[] = [
  { id: 'holding', label: 'Holding at gate' },
  { id: 'clearing', label: 'Clearing corridor' },
  { id: 'entering', label: 'Opening route' },
];

async function pingBackendHealth(timeoutMs = 5_000): Promise<boolean> {
  try {
    const res = await fetch('/api/backend/health', {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function parseReason(value: string | null): TrafficQueueReason {
  if (value === 'rate_limit' || value === 'capacity' || value === 'cold_start') {
    return value;
  }
  return 'capacity';
}

export function WaitingRoom({
  reason: reasonProp,
  retrySec: retryProp,
  returnPath: returnProp,
  autorunMode: modeProp,
  corridor: corridorProp,
}: {
  reason?: TrafficQueueReason;
  retrySec?: number;
  returnPath?: string;
  autorunMode?: string;
  corridor?: string;
}) {
  const session = typeof window !== 'undefined' ? loadTrafficQueueContext() : null;

  const reason = reasonProp ?? session?.reason ?? 'capacity';
  const initialRetry = retryProp ?? session?.retryAfterSec ?? 8;
  const returnPath = returnProp ?? session?.returnPath ?? '/';
  const autorunMode = modeProp ?? session?.autorunMode;
  const corridor = corridorProp ?? session?.corridor;

  const copy = useMemo(() => reasonCopy(reason), [reason]);

  const [secondsLeft, setSecondsLeft] = useState(initialRetry);
  const [phase, setPhase] = useState<Phase>('holding');
  const [ready, setReady] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);

  const phaseIndex = PHASES.findIndex((p) => p.id === phase);
  const progress =
    ready ? 100 : Math.min(92, ((initialRetry - secondsLeft) / Math.max(initialRetry, 1)) * 100);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [secondsLeft]);

  useEffect(() => {
    if (secondsLeft > Math.ceil(initialRetry * 0.66)) setPhase('holding');
    else if (secondsLeft > Math.ceil(initialRetry * 0.33)) setPhase('clearing');
    else if (!ready) setPhase('entering');
  }, [secondsLeft, initialRetry, ready]);

  const tryEnter = useCallback(async () => {
    const ok = await pingBackendHealth(6_000);
    setPollAttempt((n) => n + 1);
    if (!ok) return false;
    setReady(true);
    setPhase('entering');
    return true;
  }, []);

  useEffect(() => {
    if (secondsLeft > 0) return;

    let cancelled = false;
    let redirectTimer: number | null = null;

    const poll = async () => {
      if (cancelled) return;
      const ok = await tryEnter();
      if (cancelled) return;
      if (ok) {
        if (autorunMode) setShipmentAutorun(autorunMode);
        clearTrafficQueueContext();
        redirectTimer = window.setTimeout(() => {
          window.location.assign(returnPath || '/');
        }, 900);
      } else {
        window.setTimeout(poll, 2_000);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (redirectTimer !== null) window.clearTimeout(redirectTimer);
    };
  }, [secondsLeft, tryEnter, autorunMode, returnPath]);

  const ringRadius = 54;
  const circumference = 2 * Math.PI * ringRadius;
  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-background">
      <AmbientBackdrop variant="hybrid" className="opacity-80" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-hybrid/50 to-transparent animate-scan" />
        <div className="absolute left-1/2 top-1/2 h-[min(90vw,520px)] w-[min(90vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-hybrid/10 animate-pulse-slow" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-lg px-6 animate-fade-in">
        <div className="rounded-2xl border border-border/80 bg-surface/80 p-8 shadow-[0_0_80px_-20px_color-mix(in_oklab,var(--hybrid)_35%,transparent)] backdrop-blur-xl">
          <div className="mb-6 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
            <span className="inline-flex h-2 w-2 rounded-full bg-live animate-glow-pulse" />
            Traffic control
          </div>

          <h1 className="font-headline text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {ready ? 'Corridor clear' : copy.title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {ready
              ? 'Resuming your route plan…'
              : copy.subtitle}
          </p>

          {corridor ? (
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2/80 px-4 py-2 text-sm">
              <span className="material-symbols-outlined text-base text-hybrid">route</span>
              <span className="font-mono text-foreground/90">{corridor}</span>
            </div>
          ) : null}

          <div className="relative mx-auto mt-10 flex h-40 w-40 items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 120 120" aria-hidden>
              <circle
                cx="60"
                cy="60"
                r={ringRadius}
                fill="none"
                stroke="color-mix(in oklab, var(--foreground) 8%, transparent)"
                strokeWidth="6"
              />
              <circle
                cx="60"
                cy="60"
                r={ringRadius}
                fill="none"
                stroke="url(#queue-gradient)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className="transition-[stroke-dashoffset] duration-700 ease-out"
              />
              <defs>
                <linearGradient id="queue-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--rail)" />
                  <stop offset="50%" stopColor="var(--hybrid)" />
                  <stop offset="100%" stopColor="var(--water)" />
                </linearGradient>
              </defs>
            </svg>

            <div className="text-center">
              {ready ? (
                <span className="material-symbols-outlined text-4xl text-live animate-bounce-subtle">
                  check_circle
                </span>
              ) : secondsLeft > 0 ? (
                <>
                  <div className="font-headline text-4xl font-semibold tabular-nums text-foreground">
                    {secondsLeft}
                  </div>
                  <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                    sec
                  </div>
                </>
              ) : (
                <span className="material-symbols-outlined text-4xl text-hybrid animate-spin-slow">
                  progress_activity
                </span>
              )}
            </div>
          </div>

          <div className="mt-8 space-y-3">
            {PHASES.map((p, i) => {
              const active = i === phaseIndex;
              const done = i < phaseIndex || ready;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active ? 'bg-hybrid/10 text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-mono ${
                      done
                        ? 'border-live/40 bg-live/15 text-live'
                        : active
                          ? 'border-hybrid/50 bg-hybrid/15 text-hybrid'
                          : 'border-border bg-surface-2'
                    }`}
                  >
                    {done ? '✓' : i + 1}
                  </span>
                  <span className={active ? 'font-medium' : ''}>{p.label}</span>
                  {active && !ready && secondsLeft === 0 && pollAttempt > 0 ? (
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      probe {pollAttempt}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex items-center justify-between gap-4 border-t border-border/60 pt-6 text-sm">
            <p className="text-muted-foreground">
              {reason === 'rate_limit'
                ? 'Fair-use queue · auto-retry'
                : 'Protected capacity · no action needed'}
            </p>
            <Link
              href="/"
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-foreground/80 transition hover:border-border-strong hover:bg-surface-2"
              onClick={() => clearTrafficQueueContext()}
            >
              Leave queue
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
          LogiFlow · DDoS-safe traffic shaping
        </p>
      </div>
    </div>
  );
}

export function WaitingRoomFromSearchParams({
  searchParams,
}: {
  searchParams: {
    reason?: string;
    retry?: string;
    return?: string;
    mode?: string;
    corridor?: string;
  };
}) {
  const retry = parseInt(searchParams.retry ?? '8', 10);
  return (
    <WaitingRoom
      reason={parseReason(searchParams.reason ?? null)}
      retrySec={Number.isFinite(retry) ? retry : 8}
      returnPath={searchParams.return}
      autorunMode={searchParams.mode}
      corridor={searchParams.corridor}
    />
  );
}
