'use client';

import type { LogisticsMode } from '@/lib/mode-meta';
import { accentMix, accentVar } from '@/lib/pipeline-theme';
import { AnimatedMetricValue } from './AnimatedMetricValue';

export type HeroMetric = { value: string; label: string };

const HOME_ACCENT_CYCLE: LogisticsMode[] = ['hybrid', 'comparator', 'rail', 'road'];

type HeroMetricsGridProps = {
  metrics: readonly HeroMetric[];
  mode: LogisticsMode | 'home';
  className?: string;
  /** Inline strip with dot separators — dashboard headers */
  compact?: boolean;
};

function metricAccent(mode: LogisticsMode | 'home', index: number): string {
  if (mode === 'home') return accentVar(HOME_ACCENT_CYCLE[index % HOME_ACCENT_CYCLE.length]);
  return accentVar(mode);
}

export function HeroMetricsGrid({
  metrics,
  mode,
  className = '',
  compact = false,
}: HeroMetricsGridProps) {
  if (compact) {
    const accent = mode === 'home' ? accentVar('hybrid') : accentVar(mode);
    return (
      <div
        className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground ${className}`}
      >
        {metrics.map((m, i) => (
          <span key={m.label} className="flex items-center gap-3 whitespace-nowrap">
            {i > 0 ? <span className="h-1 w-1 shrink-0 rounded-full bg-border/80" aria-hidden /> : null}
            <span>
              <AnimatedMetricValue
                value={m.value}
                className="font-headline text-[11px] font-bold tabular-nums tracking-tight sm:text-xs"
                style={{ color: accent }}
              />{' '}
              <span className="font-medium">{m.label}</span>
            </span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap justify-center gap-2 sm:gap-2.5 ${className}`}>
      {metrics.map((m, i) => {
        const accent = metricAccent(mode, i);
        return (
          <div
            key={m.label}
            className="relative min-w-[4.75rem] overflow-hidden rounded-lg border border-border/30 bg-surface/10 px-3 py-2 text-center backdrop-blur-sm transition-all duration-200 hover:border-border/50 hover:bg-surface/15 sm:min-w-[5.25rem] sm:px-3.5 sm:py-2.5"
            style={{
              boxShadow: `inset 0 1px 0 0 ${accentMix(mode === 'home' ? HOME_ACCENT_CYCLE[i % 4] : mode, 12, 'transparent')}`,
            }}
          >
            <AnimatedMetricValue
              value={m.value}
              className="font-headline text-base font-bold tabular-nums leading-none tracking-tight sm:text-lg"
              style={{ color: accent }}
            />
            <div className="mt-1 text-[9px] font-medium uppercase leading-tight tracking-[0.12em] text-muted-foreground sm:text-[10px]">
              {m.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
