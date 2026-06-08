'use client';

import { ArrowRight, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import type { LogisticsMode } from '@/lib/mode-meta';
import { pipelinePageMeta } from '@/lib/pipeline-page-meta';
import { ModeIcon } from './ModeIcon';

export function PipelineResultsChrome({
  mode,
}: {
  mode: Exclude<LogisticsMode, 'comparator' | 'hybrid'>;
}) {
  const source = useLogiFlowStore((s) => s.source);
  const destination = useLogiFlowStore((s) => s.destination);
  const resetSearch = useLogiFlowStore((s) => s.resetSearch);
  const config = pipelinePageMeta[mode];
  const accent = `var(--${mode})`;

  return (
    <div
      className="relative z-20 flex h-12 shrink-0 items-center gap-3 border-b border-border/60 bg-background/60 px-4 backdrop-blur-md"
      style={{
        background: `linear-gradient(90deg, color-mix(in oklab, ${accent} 5%, var(--background)), var(--background))`,
      }}
    >
      {/* Mode icon */}
      <span
        className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border sm:flex"
        style={{ color: accent }}
      >
        <ModeIcon mode={mode} className="h-3.5 w-3.5" strokeWidth={1.8} />
      </span>

      {/* Corridor pill */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        <span
          className="shrink-0 h-1.5 w-1.5 rounded-full"
          style={{ background: accent }}
        />
        <span className="truncate text-[12px] font-semibold text-foreground">
          {source}
        </span>
        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        <span className="truncate text-[12px] font-semibold text-foreground">
          {destination}
        </span>
      </div>

      {/* Analytics label */}
      <span className="hidden shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60 sm:block">
        {config.analyticsLabel}
      </span>

      {/* Reset button */}
      <button
        type="button"
        onClick={resetSearch}
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
        title="Edit search"
      >
        <RotateCcw className="h-3 w-3" />
        <span className="hidden sm:inline">Edit</span>
      </button>
    </div>
  );
}
