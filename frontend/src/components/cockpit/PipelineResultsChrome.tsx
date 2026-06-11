'use client';

import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import type { LogisticsMode } from '@/lib/mode-meta';
import { PipelineModeChrome } from './PipelineModeChrome';

export function PipelineResultsChrome({
  mode,
}: {
  mode: Exclude<LogisticsMode, 'comparator' | 'hybrid'>;
}) {
  const source = useLogiFlowStore((s) => s.source);
  const destination = useLogiFlowStore((s) => s.destination);
  const resetResults = useLogiFlowStore((s) => s.resetResults);

  return (
    <PipelineModeChrome
      mode={mode}
      source={source}
      destination={destination}
      onEdit={resetResults}
    />
  );
}
