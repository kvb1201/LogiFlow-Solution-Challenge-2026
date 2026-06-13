'use client';

import type { ReactNode } from 'react';
import type { LogisticsMode } from '@/lib/mode-meta';
import { AmbientMesh } from './AmbientMesh';
import { accentMix, accentVar } from '@/lib/pipeline-theme';

type AmbientSurfaceProps = {
  mode?: LogisticsMode | 'home';
  children: ReactNode;
  className?: string;
  /** Classes on the inner content wrapper (use flex flex-col min-h-0 for scroll + sticky footers) */
  innerClassName?: string;
  /** Show mesh behind card content */
  mesh?: 'card' | 'section' | false;
};

/** Glass card with optional per-mode ambient glow behind content. */
export function AmbientSurface({
  mode = 'home',
  children,
  className = '',
  innerClassName = '',
  mesh = 'card',
}: AmbientSurfaceProps) {
  const accent = mode === 'home' ? 'var(--hybrid)' : accentVar(mode);

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-border/40 bg-surface/15 backdrop-blur-md ${className}`}
      style={{
        boxShadow:
          mode !== 'home'
            ? `inset 0 1px 0 0 ${accentMix(mode as LogisticsMode, 12, 'transparent')}, 0 20px 56px -40px ${accent}`
            : `inset 0 1px 0 0 color-mix(in oklab, var(--hybrid) 10%, transparent), 0 20px 56px -40px color-mix(in oklab, var(--hybrid) 25%, transparent)`,
      }}
    >
      {mesh ? (
        <AmbientMesh variant={mesh} tone={mode === 'home' ? 'home' : mode} />
      ) : null}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-px opacity-60"
        style={{
          background:
            mode === 'home'
              ? 'linear-gradient(90deg, transparent, var(--hybrid), var(--comparator), transparent)'
              : `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        }}
      />
      <div className={`relative z-10 ${innerClassName}`.trim()}>{children}</div>
    </div>
  );
}

type AmbientMetricTileProps = {
  children: ReactNode;
  className?: string;
  mode?: LogisticsMode | 'home';
};

/** Compact stat tile with card-level mesh glow — hero metrics, dashboard counts. */
export function AmbientMetricTile({
  children,
  className = '',
  mode = 'home',
}: AmbientMetricTileProps) {
  const accent = mode === 'home' ? 'var(--hybrid)' : accentVar(mode);

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-border/35 bg-surface/15 px-4 py-3 backdrop-blur-md transition-all duration-300 hover:border-border/55 ${className}`}
      style={{ boxShadow: `0 16px 40px -32px ${accent}` }}
    >
      <AmbientMesh variant="card" tone={mode === 'home' ? 'home' : mode} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
