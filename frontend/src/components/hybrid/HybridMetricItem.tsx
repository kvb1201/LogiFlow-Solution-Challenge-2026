'use client';

import {
  HYBRID_HERO_METRICS,
  HYBRID_SECONDARY_METRICS,
} from '@/lib/hybrid-metrics';

export function HybridMetricItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-xl sm:text-2xl font-black" style={{ color: 'var(--hybrid)' }}>
        {value}
      </div>
      <div className="text-[10px] sm:text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
        {label}
      </div>
    </div>
  );
}

export function HybridMetricsStrip({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {HYBRID_HERO_METRICS.map((m, i) => (
          <span key={m.label} className="flex items-center gap-3 whitespace-nowrap">
            {i > 0 && <span className="w-1 h-1 rounded-full bg-border shrink-0" aria-hidden />}
            <span>
              <strong className="font-bold text-[11px] sm:text-[13px]" style={{ color: 'var(--hybrid)' }}>
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
      <div className="flex flex-wrap justify-center gap-6 sm:gap-10">
        {HYBRID_HERO_METRICS.map((m) => (
          <HybridMetricItem key={m.label} value={m.value} label={m.label} />
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-5 sm:gap-8">
        {HYBRID_SECONDARY_METRICS.map((m) => (
          <HybridMetricItem key={m.label} value={m.value} label={m.label} />
        ))}
      </div>
    </div>
  );
}
