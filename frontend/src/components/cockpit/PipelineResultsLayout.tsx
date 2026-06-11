'use client';

import type { ReactNode } from 'react';
import type { LogisticsMode } from '@/lib/mode-meta';
import { AmbientMesh } from './AmbientMesh';
import { PipelineModeChrome } from './PipelineModeChrome';

type PipelineResultsLayoutProps = {
  mode: LogisticsMode;
  source: string;
  destination: string;
  cargoWeight?: number;
  onEdit: () => void;
  children: ReactNode;
};

export function PipelineResultsLayout({
  mode,
  source,
  destination,
  cargoWeight,
  onEdit,
  children,
}: PipelineResultsLayoutProps) {
  return (
    <div className="relative flex min-h-app w-full flex-col overflow-hidden bg-background lg:max-h-app">
      <div className="pointer-events-none absolute inset-x-0 top-navbar z-0 h-64 overflow-hidden opacity-90" aria-hidden>
        <AmbientMesh variant="section" tone={mode} />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-navbar z-0 h-px opacity-40"
        style={{
          background: `linear-gradient(90deg, transparent, var(--${mode}), transparent)`,
        }}
      />

      <PipelineModeChrome
        mode={mode}
        source={source}
        destination={destination}
        cargoWeight={cargoWeight}
        onEdit={onEdit}
      />

      <div className="relative z-10 min-h-0 flex-1 lg:overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-5">{children}</div>
      </div>
    </div>
  );
}
