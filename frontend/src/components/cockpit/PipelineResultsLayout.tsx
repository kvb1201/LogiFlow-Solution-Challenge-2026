'use client';

import type { ReactNode } from 'react';
import type { LogisticsMode } from '@/lib/mode-meta';
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
    <div className="flex w-full flex-col bg-background min-h-[calc(100dvh-4rem)] lg:max-h-[calc(100dvh-4rem)] lg:overflow-hidden">
      <PipelineModeChrome
        mode={mode}
        source={source}
        destination={destination}
        cargoWeight={cargoWeight}
        onEdit={onEdit}
      />
      <div className="flex-1 min-h-0 lg:overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-4 sm:py-5">{children}</div>
      </div>
    </div>
  );
}
