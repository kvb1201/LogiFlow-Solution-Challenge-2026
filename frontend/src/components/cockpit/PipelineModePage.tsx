'use client';

import type { ReactNode } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import type { LogisticsMode } from '@/lib/mode-meta';
import { pipelinePageMeta } from '@/lib/pipeline-page-meta';
import { isWaterNoRouteMessage } from '@/lib/water-no-route';
import { usePlannerRegenerateParams } from '@/hooks/usePlannerRegenerateParams';
import { PipelineModeLanding } from './PipelineModeLanding';
import { PipelineResultsChrome } from './PipelineResultsChrome';

type PipelineMode = Exclude<LogisticsMode, 'comparator' | 'hybrid'>;

export function PipelineModePage({
  mode,
  form,
  results,
}: {
  mode: PipelineMode;
  form: ReactNode;
  results: ReactNode;
}) {
  const config = pipelinePageMeta[mode];
  usePlannerRegenerateParams(config.storeMode);

  const hasSearched = useLogiFlowStore((s) => s.hasSearched);
  const loading = useLogiFlowStore((s) => s.loading);
  const loadingMode = useLogiFlowStore((s) => s.loadingMode);
  const error = useLogiFlowStore((s) => s.error);
  const showLoading = loading && loadingMode === config.storeMode;
  const hideErrorBanner = mode === 'water' && isWaterNoRouteMessage(error);

  if (!hasSearched) {
    return <PipelineModeLanding mode={mode}>{form}</PipelineModeLanding>;
  }

  return (
    <div className="flex w-full flex-col bg-background text-foreground lg:max-h-app lg:overflow-hidden">
      <PipelineResultsChrome mode={mode} />

      {error && !hideErrorBanner ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-risk/30 bg-risk/10 px-4 py-2 text-xs text-risk">
          <span className="material-symbols-outlined text-sm">error</span>
          <span className="min-w-0 break-words">{error}</span>
        </div>
      ) : null}

      {showLoading ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <span
            className="inline-block h-9 w-9 animate-spin rounded-full border-2 border-border border-t-current"
            style={{ borderTopColor: `var(--${mode})` }}
          />
          <p className="text-sm text-muted-foreground">{config.loadingMessage}</p>
        </div>
      ) : (
        <div className="results-shell min-h-0 flex-1 lg:overflow-y-auto">{results}</div>
      )}
    </div>
  );
}
