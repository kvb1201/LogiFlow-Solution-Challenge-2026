import type { LogisticsMode } from '@/lib/mode-meta';
import { accentVar } from '@/lib/pipeline-theme';

export type HeroMetric = { value: string; label: string };

export function HeroMetricsGrid({
  metrics,
  mode,
  className = '',
}: {
  metrics: readonly HeroMetric[];
  mode: LogisticsMode;
  className?: string;
}) {
  const accent = accentVar(mode);

  return (
    <div className={`flex flex-wrap justify-center gap-6 sm:gap-8 ${className}`}>
      {metrics.map((m) => (
        <div key={m.label} className="text-center min-w-[4.5rem]">
          <div className="text-xl sm:text-2xl font-black tabular-nums" style={{ color: accent }}>
            {m.value}
          </div>
          <div className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-0.5">
            {m.label}
          </div>
        </div>
      ))}
    </div>
  );
}
