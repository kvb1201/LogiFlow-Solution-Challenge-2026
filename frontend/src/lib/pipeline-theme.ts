import type { CSSProperties } from 'react';
import type { LogisticsMode } from './mode-meta';

export function accentVar(mode: LogisticsMode): string {
  return `var(--${mode})`;
}

export function accentMix(
  mode: LogisticsMode,
  pct: number,
  base: string = 'var(--border)'
): string {
  return `color-mix(in oklab, var(--${mode}) ${pct}%, ${base})`;
}

/** Tailwind classes for the animated "Logi" hero gradient — one distinct vibe per mode. */
export const LOGI_GRADIENT: Record<LogisticsMode, string> = {
  rail: 'bg-gradient-to-r from-yellow-400 via-amber-200 to-yellow-300',
  road: 'bg-gradient-to-r from-amber-400 via-orange-300 to-secondary',
  air: 'bg-gradient-to-r from-sky-300 via-cyan-300 to-primary',
  water: 'bg-gradient-to-r from-teal-300 via-cyan-300 to-primary',
  hybrid: 'bg-gradient-to-r from-violet-400 via-fuchsia-300 to-primary',
  comparator: 'bg-gradient-to-r from-blue-400 via-cyan-300 to-indigo-300',
};

/** Home hero — cycles every pipeline accent (CSS vars). Pair with `text-gradient-logiflow-home`. */
export const LOGI_GRADIENT_HOME_CLASS = 'text-gradient-logiflow-home animate-gradient-shift';

/** Slim hero action — primary CTA on mode landings */
export const PIPELINE_ACTION_PRIMARY =
  'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 hover:brightness-110';

/** Slim hero action — secondary link-style */
export const PIPELINE_ACTION_SECONDARY =
  'inline-flex items-center gap-1.5 rounded-lg border border-border/45 bg-surface/20 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:border-border/70 hover:text-foreground';

/** Sleek card shell — thin border, light fill, no heavy inset shadows. */
export const PIPELINE_CARD_CLASS =
  'rounded-xl border border-border/45 bg-surface/20 backdrop-blur-sm';

export function pipelineCardTopLine(mode: LogisticsMode): string {
  return `linear-gradient(90deg, transparent, ${accentVar(mode)}, transparent)`;
}

export function badgePillStyle(mode: LogisticsMode): CSSProperties {
  return {
    borderColor: accentMix(mode, 25, 'transparent'),
    background: accentMix(mode, 8, 'transparent'),
  };
}

export function badgeDotStyle(mode: LogisticsMode): CSSProperties {
  return { background: accentVar(mode) };
}

export function badgeTextStyle(mode: LogisticsMode): CSSProperties {
  return { color: accentMix(mode, 90, 'white') };
}
