'use client';

import { RAIL_HERO_METRICS, RAIL_METRICS, RAIL_SECONDARY_METRICS } from '@/lib/rail-metrics';

function RailMetricItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center min-w-[4.5rem]">
      <div className="text-xl sm:text-2xl font-black tabular-nums text-rail">{value}</div>
      <div className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-0.5">
        {label}
      </div>
    </div>
  );
}

export function RailMetricsStrip({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {RAIL_METRICS.map((m, i) => (
          <span key={m.label} className="flex items-center gap-3 whitespace-nowrap">
            {i > 0 && <span className="w-1 h-1 shrink-0 rounded-full bg-border" aria-hidden />}
            <span>
              <strong className="text-[11px] sm:text-[13px] font-bold text-rail">
                {m.value}
              </strong>{' '}
              {m.label}
            </span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
        {RAIL_HERO_METRICS.map((m) => (
          <RailMetricItem key={m.label} value={m.value} label={m.label} />
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-5 sm:gap-7">
        {RAIL_SECONDARY_METRICS.map((m) => (
          <RailMetricItem key={m.label} value={m.value} label={m.label} />
        ))}
      </div>
    </div>
  );
}
