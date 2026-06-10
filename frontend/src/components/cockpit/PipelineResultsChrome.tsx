'use client';

import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import type { LogisticsMode } from '@/lib/mode-meta';
import { pipelinePageMeta } from '@/lib/pipeline-page-meta';

export function PipelineResultsChrome({
  mode,
}: {
  mode: Exclude<LogisticsMode, 'comparator' | 'hybrid'>;
}) {
  const source = useLogiFlowStore((s) => s.source);
  const destination = useLogiFlowStore((s) => s.destination);
  const resetResults = useLogiFlowStore((s) => s.resetResults);
  const config = pipelinePageMeta[mode];
  const accent = `var(--${mode})`;

  return (
    <div className="relative z-20 flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-surface/50 px-4 backdrop-blur-sm">
      <div className="flex min-w-0 max-w-[min(100%,420px)] items-center gap-2 rounded-full border border-border bg-background/50 px-3 py-1 text-[11px]">
        <span
          className="material-symbols-outlined shrink-0"
          style={{ fontSize: '12px', color: accent, fontVariationSettings: "'FILL' 1" }}
        >
          trip_origin
        </span>
        <span className="truncate font-medium text-foreground">{source}</span>
        <span className="material-symbols-outlined shrink-0 text-muted-foreground" style={{ fontSize: '11px' }}>
          arrow_forward
        </span>
        <span className="truncate font-medium text-foreground">{destination}</span>
        <button
          type="button"
          onClick={resetResults}
          className="ml-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          title="Edit search"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
            edit
          </span>
        </button>
      </div>
      <div className="hidden shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground sm:block">
        {config.analyticsLabel}
      </div>
    </div>
  );
}
