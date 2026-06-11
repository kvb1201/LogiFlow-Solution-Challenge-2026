'use client';

import type { ReactNode } from 'react';
import type { LogisticsMode } from '@/lib/mode-meta';
import { CapabilityStrip } from '@/components/cockpit/CapabilityStrip';
import { AmbientMesh } from '@/components/cockpit/AmbientMesh';
import {
  LOGI_GRADIENT,
  badgeDotStyle,
  badgePillStyle,
  badgeTextStyle,
} from '@/lib/pipeline-theme';

export type PipelineBadge = { icon: string; label: string };

type PipelineLogiLandingProps = {
  mode: LogisticsMode;
  badge: string;
  description: ReactNode;
  metrics?: ReactNode;
  badges?: readonly PipelineBadge[];
  actions?: ReactNode;
  footer?: ReactNode;
  loadingOverlay?: ReactNode;
  children: ReactNode;
};

export function PipelineLogiLanding({
  mode,
  badge,
  description,
  metrics,
  badges = [],
  actions,
  footer,
  loadingOverlay,
  children,
}: PipelineLogiLandingProps) {
  return (
    <div
      className="relative min-h-app overflow-x-clip"
      style={{ background: 'var(--background)' }}
    >
      {loadingOverlay}
      <AmbientMesh variant="hero" tone={mode} />

      <div className="relative z-10 mx-auto flex min-h-app w-full flex-col items-center justify-center px-4 py-10 sm:py-12">
        <div className="w-full max-w-[860px] animate-slide-up">
          <div className="mb-8 flex justify-center">
            <div
              className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 backdrop-blur-md"
              style={badgePillStyle(mode)}
            >
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={badgeDotStyle(mode)} />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase" style={badgeTextStyle(mode)}>
                {badge}
              </span>
            </div>
          </div>

          <div className="mb-8 text-center">
            <h1 className="mb-4 font-headline text-4xl font-black leading-none tracking-tighter xs:text-5xl sm:text-6xl md:text-[72px]">
              <span
                className={`${LOGI_GRADIENT[mode]} bg-clip-text text-transparent animate-gradient-shift`}
                style={{ backgroundSize: '200% auto' }}
              >
                Logi
              </span>
              <span className="text-on-surface">Flow</span>
            </h1>
            <p className="text-sm sm:text-[15px] text-on-surface-variant max-w-lg mx-auto leading-relaxed">
              {description}
            </p>
            {metrics ? (
              <div
                className="mt-6 animate-fade-in"
                style={{ animationDelay: '0.3s', animationFillMode: 'backwards' }}
              >
                {metrics}
              </div>
            ) : null}
          </div>

          {badges.length > 0 ? (
            <CapabilityStrip badges={badges} mode={mode} className="mb-8" />
          ) : null}

          {actions ? <div className="mb-6 flex flex-wrap justify-center gap-2">{actions}</div> : null}

          {children}

          {footer ? (
            <div
              className="mt-8 text-center animate-fade-in"
              style={{ animationDelay: '0.8s', animationFillMode: 'backwards' }}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
