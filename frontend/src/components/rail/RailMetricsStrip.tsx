'use client';

import { HeroMetricsGrid } from '@/components/cockpit/HeroMetricsGrid';
import { RAIL_HERO_METRICS, RAIL_METRICS, RAIL_SECONDARY_METRICS } from '@/lib/rail-metrics';

export function RailMetricsStrip({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return <HeroMetricsGrid metrics={RAIL_METRICS} mode="rail" compact />;
  }

  return (
    <div className="space-y-3">
      <HeroMetricsGrid metrics={RAIL_HERO_METRICS} mode="rail" />
      <HeroMetricsGrid metrics={RAIL_SECONDARY_METRICS} mode="rail" />
    </div>
  );
}
