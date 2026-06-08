import type { ReactNode } from 'react';
import type { LogisticsMode } from '@/lib/mode-meta';
import { comparatorPageMeta, pipelinePageMeta } from '@/lib/pipeline-page-meta';
import { ModeIcon } from './ModeIcon';
import { AmbientBackdrop } from './AmbientBackdrop';

type LandingConfig = {
  badge: string;
  titleLead: string;
  titleRest: string;
  description: string;
  pills: { icon: string; label: string }[];
  footer?: string;
};

function getConfig(mode: LogisticsMode): LandingConfig {
  if (mode === 'comparator') return comparatorPageMeta;
  if (mode === 'hybrid') {
    return {
      badge: 'Hybrid · Multimodal route composer',
      titleLead: 'Hybrid',
      titleRest: ' chains',
      description: 'Chain rail, road, air, and water through hub cities into one optimised itinerary.',
      pills: [
        { icon: 'hub', label: 'Hub routing' },
        { icon: 'train', label: 'Rail legs' },
        { icon: 'flight_takeoff', label: 'Air legs' },
        { icon: 'swap_horiz', label: 'Transfer analysis' },
      ],
      footer: 'LogiFlow multimodal composer',
    };
  }
  return pipelinePageMeta[mode];
}

export function PipelineModeLanding({
  mode,
  children,
  headerActions,
  compact = false,
}: {
  mode: LogisticsMode;
  children: ReactNode;
  headerActions?: ReactNode;
  /** Smaller hero (e.g. hybrid steps 2–3) */
  compact?: boolean;
}) {
  const config = getConfig(mode);
  const accent =
    mode === 'comparator' ? 'var(--comparator)' : `var(--${mode})`;

  return (
    <div className="relative w-full">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden [&_*]:pointer-events-none">
        <AmbientBackdrop variant={mode} />
        {/* Stronger bottom fade to background */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, transparent 40%, var(--background) 100%)',
          }}
        />
        {/* Top border line */}
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent 0%, color-mix(in oklab, ${accent} 40%, transparent) 50%, transparent 100%)`,
          }}
        />
      </div>

      <div
        className={`relative z-10 pointer-events-auto mx-auto w-full max-w-3xl px-4 animate-slide-up ${
          compact ? 'py-8 sm:py-10' : 'py-12 sm:py-16'
        }`}
      >
        {!compact && (
          <>
            {/* Badge row */}
            <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
              <div
                className="flex items-center gap-2 rounded-full border px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] backdrop-blur-sm"
                style={{
                  borderColor: `color-mix(in oklab, ${accent} 28%, var(--border))`,
                  background: `color-mix(in oklab, ${accent} 8%, var(--surface))`,
                  color: accent,
                }}
              >
                <span className="live-dot" style={{ background: accent }} />
                {config.badge}
              </div>
              {headerActions && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {headerActions}
                </div>
              )}
            </div>

            {/* Hero text */}
            <div className="mb-8 text-center">
              <div className="mb-4 flex justify-center">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface/80 backdrop-blur-sm"
                  style={{
                    color: accent,
                    boxShadow: `0 0 40px -18px ${accent}`,
                  }}
                >
                  {mode !== 'comparator' && (
                    <ModeIcon mode={mode as LogisticsMode} className="h-6 w-6" strokeWidth={1.6} />
                  )}
                </span>
              </div>
              <h1
                className={`text-balance font-display font-black leading-[1.04] tracking-tight ${
                  compact
                    ? 'text-2xl sm:text-3xl md:text-4xl'
                    : 'text-3xl sm:text-4xl md:text-5xl'
                }`}
              >
                <span className="text-gradient">{config.titleLead}</span>
                <span className="text-foreground">{config.titleRest}</span>
              </h1>
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                {config.description}
              </p>
            </div>

            {/* Feature pills */}
            <div className="mb-10 flex flex-wrap justify-center gap-2">
              {config.pills.map((pill, i) => (
                <div
                  key={pill.label}
                  className="animate-fade-in flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-3 py-1.5 text-[11px] text-muted-foreground backdrop-blur-sm"
                  style={{
                    animationDelay: `${0.18 + i * 0.07}s`,
                    animationFillMode: 'backwards',
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: '13px',
                      fontVariationSettings: "'FILL' 1",
                      color: accent,
                    }}
                  >
                    {pill.icon}
                  </span>
                  {pill.label}
                </div>
              ))}
            </div>
          </>
        )}

        {compact && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              <span className="text-gradient">{config.titleLead}</span>
              <span className="text-foreground">{config.titleRest}</span>
            </h1>
            {headerActions}
          </div>
        )}

        {/* Form slot */}
        <div className="w-full">{children}</div>

        {config.footer && !compact && (
          <p
            className="animate-fade-in mt-8 text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/50"
            style={{ animationDelay: '0.45s', animationFillMode: 'backwards' }}
          >
            {config.footer}
          </p>
        )}
      </div>
    </div>
  );
}
