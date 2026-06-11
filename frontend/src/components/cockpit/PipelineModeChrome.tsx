'use client';

import type { LogisticsMode } from '@/lib/mode-meta';
import { modeMeta } from '@/lib/mode-meta';
import { LOGI_GRADIENT, accentVar } from '@/lib/pipeline-theme';

const MODE_ICONS: Partial<Record<LogisticsMode, string>> = {
  comparator: 'compare_arrows',
  hybrid: 'hub',
};

type PipelineModeChromeProps = {
  mode: LogisticsMode;
  source: string;
  destination: string;
  cargoWeight?: number;
  onEdit: () => void;
};

export function PipelineModeChrome({
  mode,
  source,
  destination,
  cargoWeight,
  onEdit,
}: PipelineModeChromeProps) {
  const accent = accentVar(mode);
  const icon = MODE_ICONS[mode] ?? 'trip_origin';
  const label = modeMeta[mode].label;

  return (
    <div className="sticky top-0 z-20 flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-surface/70 px-4 sm:px-6 backdrop-blur-md">
      <div className="flex min-w-0 max-w-[min(100%,520px)] items-center gap-2 rounded-full border border-border/50 bg-background/50 px-3 py-1 text-[11px]">
        <span
          className="material-symbols-outlined shrink-0"
          style={{ fontSize: '12px', color: accent, fontVariationSettings: "'FILL' 1" }}
          aria-hidden
        >
          {icon}
        </span>
        <span className="truncate font-medium text-foreground">{source}</span>
        <span className="material-symbols-outlined shrink-0 text-muted-foreground" style={{ fontSize: '11px' }}>
          arrow_forward
        </span>
        <span className="truncate font-medium text-foreground">{destination}</span>
        {cargoWeight ? (
          <span className="hidden sm:inline text-muted-foreground">· {cargoWeight} kg</span>
        ) : null}
        <button
          type="button"
          onClick={onEdit}
          className="ml-1 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          title="Edit search"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
            edit
          </span>
        </button>
      </div>
      <div className="hidden shrink-0 items-baseline gap-0 sm:flex font-headline font-black tracking-tight">
        <span className={`${LOGI_GRADIENT[mode]} bg-clip-text text-transparent text-sm`}>Logi</span>
        <span className="text-foreground text-sm">Flow</span>
        <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}
