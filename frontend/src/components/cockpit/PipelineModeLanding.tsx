import type { ReactNode } from 'react';
import type { LogisticsMode } from '@/lib/mode-meta';
import { hybridPageMeta, pipelinePageMeta } from '@/lib/pipeline-page-meta';
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
  if (mode === 'hybrid') return hybridPageMeta;
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

  return (
    <div className="relative w-full">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <AmbientBackdrop variant={mode} />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 20%, var(--background) 75%)',
          }}
        />
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${mode === 'hybrid' ? 'var(--hybrid)' : `var(--${mode})`}, transparent)`,
          }}
        />
      </div>

      <div
        className={`relative z-10 mx-auto w-full px-4 animate-slide-up ${
          compact ? 'max-w-3xl py-8 sm:py-10' : 'max-w-3xl py-10 sm:py-14'
        }`}
      >
        {!compact && (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-4 py-1.5 backdrop-blur-sm">
                <span className="live-dot" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  {config.badge}
                </span>
              </div>
              {headerActions ? (
                <div className="flex flex-wrap items-center justify-center gap-2">{headerActions}</div>
              ) : null}
            </div>

            <div className="mb-8 text-center">
              <h1
                className={`text-balance font-display font-black leading-none tracking-tight text-gradient ${
                  compact ? 'text-3xl sm:text-4xl' : 'text-[2.5rem] sm:text-5xl md:text-6xl'
                }`}
              >
                {config.titleLead}
                <span className="text-foreground">{config.titleRest}</span>
              </h1>
              <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                {config.description}
              </p>
            </div>

            <div className="mb-8 flex flex-wrap justify-center gap-2">
              {config.pills.map((pill, i) => (
                <div
                  key={pill.label}
                  className="flex animate-fade-in items-center gap-1.5 rounded-full border border-border bg-surface/50 px-3 py-1.5 text-[11px] text-muted-foreground backdrop-blur-sm"
                  style={{ animationDelay: `${0.2 + i * 0.08}s`, animationFillMode: 'backwards' }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: '14px',
                      fontVariationSettings: "'FILL' 1",
                      color: `var(--${mode})`,
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
            <div>
              <h1 className="font-display text-2xl font-bold text-gradient sm:text-3xl">
                {config.titleLead}
                <span className="text-foreground">{config.titleRest}</span>
              </h1>
            </div>
            {headerActions}
          </div>
        )}

        <div className="w-full">{children}</div>

        {config.footer && !compact ? (
          <p
            className="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 animate-fade-in"
            style={{ animationDelay: '0.5s', animationFillMode: 'backwards' }}
          >
            {config.footer}
          </p>
        ) : null}
      </div>
    </div>
  );
}
