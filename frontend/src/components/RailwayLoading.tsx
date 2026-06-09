'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { RAIL_LOADING_STEPS, stepProgress } from '@/lib/rail-loading-steps';
import { AmbientBackdrop } from '@/components/cockpit/AmbientBackdrop';

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

export default function RailwayLoading() {
  const source = useLogiFlowStore((s) => s.source);
  const destination = useLogiFlowStore((s) => s.destination);
  const cargoWeight = useLogiFlowStore((s) => s.cargoWeight);
  const cargoType = useLogiFlowStore((s) => s.cargoType);
  const priority = useLogiFlowStore((s) => s.priority);
  const activeStep = useLogiFlowStore((s) => s.railLoadingStep);
  const stepDetail = useLogiFlowStore((s) => s.railLoadingDetail);
  const startedAt = useLogiFlowStore((s) => s.railLoadingStartedAt);

  const [elapsed, setElapsed] = useState(0);

  const stepIndex = Math.max(0, activeStep);
  const progress = useMemo(() => stepProgress(stepIndex), [stepIndex]);

  useEffect(() => {
    if (activeStep < 0 || !startedAt) return;
    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeStep, startedAt]);

  const corridor = `${source.trim() || '…'} → ${destination.trim() || '…'}`;

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <AmbientBackdrop variant="rail" />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 15%, var(--background) 72%)',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-lg px-5 sm:px-6">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-rail/25 bg-surface/80 px-3 py-1 backdrop-blur-sm">
            <span className="live-dot" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Rail pipeline · in progress
            </span>
          </div>
          <h2 className="font-headline text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Analyzing corridor
          </h2>
          <p className="mt-2 font-mono text-sm text-rail">{corridor}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {cargoWeight.toLocaleString()} kg {cargoType.toLowerCase()} · {priority} priority
          </p>
        </div>

        {/* Progress */}
        <div className="mb-5 rounded-2xl border border-border/70 bg-surface/60 p-4 backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Pipeline progress</span>
            <span className="font-mono text-rail">{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rail/80 to-primary transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>Elapsed {formatElapsed(elapsed)}</span>
            <span>
              Step {Math.min(stepIndex + 1, RAIL_LOADING_STEPS.length)}/{RAIL_LOADING_STEPS.length}
            </span>
          </div>
        </div>

        {/* Steps */}
        <ol className="space-y-2" aria-label="Progress steps">
          {RAIL_LOADING_STEPS.map((step, index) => {
            const done = index < stepIndex;
            const active = index === stepIndex;
            const pending = index > stepIndex;

            return (
              <li
                key={step.id}
                className={`rounded-xl border px-3 py-2.5 transition-colors ${
                  active
                    ? 'border-rail/40 bg-rail/10'
                    : done
                      ? 'border-border/50 bg-surface/40'
                      : 'border-border/30 bg-surface/20 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${
                      done
                        ? 'bg-rail/20 text-rail'
                        : active
                          ? 'bg-rail/25 text-rail'
                          : 'bg-surface-3 text-muted-foreground'
                    }`}
                    aria-hidden
                  >
                    {done ? (
                      <span className="material-symbols-outlined text-base">check</span>
                    ) : active ? (
                      <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                    ) : (
                      <span className="font-mono">{index + 1}</span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-semibold ${active ? 'text-foreground' : done ? 'text-foreground/90' : 'text-muted-foreground'}`}
                    >
                      {step.label}
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      {active && stepDetail ? stepDetail : step.detail}
                    </p>
                  </div>
                  {active && (
                    <span className="shrink-0 rounded bg-rail/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rail">
                      Live
                    </span>
                  )}
                  {pending && (
                    <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground">
                      Queued
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
