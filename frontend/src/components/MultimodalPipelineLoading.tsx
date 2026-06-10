'use client';

import React, { useMemo } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { useSimulatedLoadingSteps } from '@/hooks/useSimulatedLoadingSteps';
import { AmbientBackdrop } from '@/components/cockpit/AmbientBackdrop';
import type { MultimodalLoadingVariant } from '@/lib/multimodal-loading-steps';

const MODE_CHIPS = [
  { id: 'road', label: 'Road', icon: 'local_shipping', activeFromStep: 2 },
  { id: 'rail', label: 'Rail', icon: 'train', activeFromStep: 2 },
  { id: 'air', label: 'Air', icon: 'flight_takeoff', activeFromStep: 2 },
  { id: 'water', label: 'Water', icon: 'directions_boat', activeFromStep: 2 },
] as const;

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

export default function MultimodalPipelineLoading({
  variant,
}: {
  variant: MultimodalLoadingVariant;
}) {
  const source = useLogiFlowStore((s) => s.source);
  const destination = useLogiFlowStore((s) => s.destination);
  const cargoWeight = useLogiFlowStore((s) => s.cargoWeight);
  const cargoType = useLogiFlowStore((s) => s.cargoType);
  const priority = useLogiFlowStore((s) => s.priority);

  const { config, stepIndex, progress, elapsed, activeStep, tip } =
    useSimulatedLoadingSteps(variant, true);

  const corridor = `${source.trim() || '…'} → ${destination.trim() || '…'}`;

  const modeStates = useMemo(() => {
    return MODE_CHIPS.map((mode, i) => {
      const pipelineStep = config.steps.findIndex((s) => s.id === 'pipelines');
      const scoreStep = config.steps.findIndex((s) => s.id === 'score');
      const activeFrom = pipelineStep >= 0 ? pipelineStep : mode.activeFromStep;

      if (stepIndex < activeFrom) return { ...mode, state: 'queued' as const };
      if (stepIndex === activeFrom) {
        const cycling = (Math.floor(elapsed / 2200) + i) % MODE_CHIPS.length === i;
        return { ...mode, state: cycling ? ('live' as const) : ('done' as const) };
      }
      if (scoreStep >= 0 && stepIndex < scoreStep) {
        return { ...mode, state: 'done' as const };
      }
      return { ...mode, state: 'done' as const };
    });
  }, [config.steps, stepIndex, elapsed]);

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <AmbientBackdrop variant={config.ambient} />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 15%, var(--background) 72%)',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-lg px-5 sm:px-6">
        <div className="mb-6 text-center">
          <div
            className={`mb-3 inline-flex items-center gap-2 rounded-full border ${config.accentBorder} bg-surface/80 px-3 py-1 backdrop-blur-sm`}
          >
            <span className="live-dot" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              {config.badge}
            </span>
          </div>
          <h2 className="font-headline text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {config.title}
          </h2>
          <p className={`mt-2 font-mono text-sm ${config.accentClass}`}>{corridor}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {cargoWeight.toLocaleString()} kg {cargoType.toLowerCase()} · {priority} priority
          </p>
        </div>

        {/* Mode pulse strip */}
        <div className="mb-5 grid grid-cols-4 gap-2">
          {modeStates.map((mode) => (
            <div
              key={mode.id}
              className={`rounded-xl border px-2 py-2.5 text-center transition-all duration-500 ${
                mode.state === 'live'
                  ? `${config.accentBorder} ${config.accentBg} scale-[1.02] shadow-[0_0_24px_-8px_var(--hybrid)]`
                  : mode.state === 'done'
                    ? 'border-border/50 bg-surface/50 opacity-90'
                    : 'border-border/30 bg-surface/20 opacity-50'
              }`}
            >
              <span
                className={`material-symbols-outlined text-lg ${
                  mode.state === 'live' ? config.accentClass : 'text-muted-foreground'
                } ${mode.state === 'live' ? 'animate-pulse' : ''}`}
              >
                {mode.icon}
              </span>
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                {mode.label}
              </p>
              {mode.state === 'live' && (
                <span className="mt-0.5 block text-[8px] font-bold uppercase tracking-wider text-live">
                  Live
                </span>
              )}
              {mode.state === 'done' && (
                <span className="material-symbols-outlined mt-0.5 text-xs text-emerald-400/90">
                  check_circle
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Progress */}
        <div className="mb-4 rounded-xl border border-border/70 bg-surface/60 p-4 backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Pipeline progress</span>
            <span className={`font-mono ${config.accentClass}`}>{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className={`h-full rounded-full bg-gradient-to-r from-hybrid/70 to-primary transition-all duration-700 ease-out ${
                progress < 95 ? 'animate-pulse' : ''
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>Elapsed {formatElapsed(elapsed)}</span>
            <span>
              Step {Math.min(stepIndex + 1, config.steps.length)}/{config.steps.length}
            </span>
          </div>
        </div>

        {/* Rotating tip */}
        <p
          key={tip}
          className="mb-4 text-center text-[11px] leading-relaxed text-muted-foreground animate-fade-in"
        >
          {tip}
        </p>

        {/* Steps */}
        <ol className="max-h-[38vh] space-y-2 overflow-y-auto pr-1" aria-label="Progress steps">
          {config.steps.map((step, index) => {
            const done = index < stepIndex;
            const active = index === stepIndex;
            const pending = index > stepIndex;

            return (
              <li
                key={step.id}
                className={`rounded-xl border px-3 py-2.5 transition-colors ${
                  active
                    ? `${config.accentBorder} ${config.accentBg}`
                    : done
                      ? 'border-border/50 bg-surface/40'
                      : 'border-border/30 bg-surface/20 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${
                      done
                        ? `${config.accentBg} ${config.accentClass}`
                        : active
                          ? `${config.accentBg} ${config.accentClass}`
                          : 'bg-surface-3 text-muted-foreground'
                    }`}
                    aria-hidden
                  >
                    {done ? (
                      <span className="material-symbols-outlined text-base">check</span>
                    ) : active ? (
                      <span className="material-symbols-outlined animate-spin text-base">
                        progress_activity
                      </span>
                    ) : (
                      <span className="font-mono">{index + 1}</span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-semibold ${
                        active ? 'text-foreground' : done ? 'text-foreground/90' : 'text-muted-foreground'
                      }`}
                    >
                      {step.label}
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      {step.detail}
                    </p>
                  </div>
                  {active && (
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${config.accentBg} ${config.accentClass}`}
                    >
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

        <p className="mt-4 text-center text-[10px] text-outline">
          Usually under a minute · still working, not frozen
        </p>
      </div>
    </div>
  );
}
