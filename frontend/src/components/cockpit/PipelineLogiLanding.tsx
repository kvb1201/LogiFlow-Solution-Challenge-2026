'use client';

import type { ReactNode } from 'react';
import type { LogisticsMode } from '@/lib/mode-meta';
import { CapabilityStrip } from '@/components/cockpit/CapabilityStrip';
import {
  LOGI_GRADIENT,
  accentVar,
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
  const accent = accentVar(mode);

  return (
    <div className="relative overflow-x-clip" style={{ background: 'var(--background)' }}>
      {loadingOverlay}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div
          className="absolute w-[680px] h-[680px] rounded-full opacity-[0.09] blur-[130px] animate-mesh-1 top-[-20%] left-[-10%]"
          style={{ background: accent }}
        />
        <div className="absolute w-[500px] h-[500px] rounded-full opacity-[0.07] blur-[110px] bg-primary animate-mesh-2 bottom-[-10%] right-[-8%]" />
        <div className="absolute inset-0 hero-dot-grid opacity-[0.28]" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 20%, var(--background) 75%)',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] w-full flex-col items-center justify-center px-4 py-10 sm:py-12">
        <div className="w-full max-w-[860px] animate-slide-up">
          <div className="flex justify-center mb-8">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border"
              style={badgePillStyle(mode)}
            >
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={badgeDotStyle(mode)} />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase" style={badgeTextStyle(mode)}>
                {badge}
              </span>
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-[2.5rem] xs:text-5xl sm:text-6xl md:text-[72px] font-black font-headline tracking-tighter mb-4 leading-none">
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

          {actions ? <div className="flex flex-wrap justify-center gap-3 mb-8">{actions}</div> : null}

          {children}

          {footer ? (
            <div
              className="text-center mt-8 animate-fade-in"
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
