'use client';

import { HeroMetricsGrid } from '@/components/cockpit/HeroMetricsGrid';
import {
  HYBRID_HERO_METRICS,
  HYBRID_SECONDARY_METRICS,
} from '@/lib/hybrid-metrics';

export function HybridMetricsStrip({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return <HeroMetricsGrid metrics={HYBRID_HERO_METRICS} mode="hybrid" compact />;
  }

  return (
    <div className="space-y-3">
      <HeroMetricsGrid metrics={HYBRID_HERO_METRICS} mode="hybrid" />
      <HeroMetricsGrid metrics={HYBRID_SECONDARY_METRICS} mode="hybrid" />
    </div>
  );
}
