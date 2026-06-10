'use client';

import Link from 'next/link';
import { PipelineResultsLayout } from '@/components/cockpit/PipelineResultsLayout';
import { PipelineLogiLanding } from '@/components/cockpit/PipelineLogiLanding';
import { HeroMetricsGrid } from '@/components/cockpit/HeroMetricsGrid';
import { usePlannerRegenerateParams } from '@/hooks/usePlannerRegenerateParams';
import WaterInputForm from '@/components/waterInputForm';
import WaterRouteResults from '@/components/WaterRouteResults';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { useWaterPortCatalog } from '@/hooks/useWaterPortCatalog';
import { isWaterNoRouteMessage } from '@/lib/water-no-route';
import { WATER_CAPABILITY_BADGES, waterHeroMetrics } from '@/lib/water-metrics';
import { accentVar } from '@/lib/pipeline-theme';

export default function WaterPageClient() {
  usePlannerRegenerateParams('water');

  const { total, routable, regions, loading: catalogLoading } = useWaterPortCatalog();
  const error = useLogiFlowStore((s) => s.error);
  const loading = useLogiFlowStore((s) => s.loading);
  const loadingMode = useLogiFlowStore((s) => s.loadingMode);
  const hasSearched = useLogiFlowStore((s) => s.hasSearched);
  const resetResults = useLogiFlowStore((s) => s.resetResults);
  const searchMode = useLogiFlowStore((s) => s.searchMode);
  const waterRoutes = useLogiFlowStore((s) => s.waterRoutes);
  const source = useLogiFlowStore((s) => s.source);
  const destination = useLogiFlowStore((s) => s.destination);

  const showWaterLoading = loading && loadingMode === 'water';
  const hasResults = waterRoutes.length > 0;
  const hideErrorBanner = isWaterNoRouteMessage(error);
  const heroMetrics = waterHeroMetrics({ total, routable, regions }).map((m) => ({
    ...m,
    value: catalogLoading ? '…' : m.value,
  }));

  const waterBadges = WATER_CAPABILITY_BADGES.map((badge) =>
    badge.label === 'Global ports' && !catalogLoading
      ? { ...badge, label: `${total} global ports` }
      : badge
  );

  if (!hasSearched) {
    return (
      <PipelineLogiLanding
        mode="water"
        badge="Maritime Cargo · Global port routing"
        description={
          <>
            Route port-to-port cargo across{' '}
            <span style={{ color: accentVar('water') }} className="font-medium">
              India, Middle East, Southeast Asia, East Asia, and Europe
            </span>{' '}
            with transshipment, cost, and reliability scoring.
          </>
        }
        metrics={<HeroMetricsGrid metrics={heroMetrics} mode="water" />}
        badges={waterBadges}
        loadingOverlay={
          showWaterLoading ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" />
          ) : null
        }
        footer={
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.2em]">
            Global static port network · not live AIS
          </p>
        }
      >
        <WaterInputForm />
      </PipelineLogiLanding>
    );
  }

  return (
    <PipelineResultsLayout mode="water" source={source} destination={destination} onEdit={resetResults}>
      {error && !hideErrorBanner && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          <span className="material-symbols-outlined text-sm">error</span>
          {error}
        </div>
      )}

      {showWaterLoading && !hasResults && (
        <div className="flex items-center justify-center gap-3 py-16">
          <span className="material-symbols-outlined animate-spin text-2xl" style={{ color: accentVar('water') }}>
            progress_activity
          </span>
          <span className="text-sm text-muted-foreground">Charting maritime routes…</span>
        </div>
      )}

      <WaterInputForm />

      {!loading && !hasResults && hasSearched && searchMode === 'water' && !error && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <span
            className="material-symbols-outlined mt-0.5 text-amber-400"
            style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
          >
            info
          </span>
          <div>
            <p className="mb-1 text-sm font-medium text-foreground">
              No maritime routes found between {source || 'origin'} and {destination || 'destination'}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Try a different port pair or explore{' '}
              <Link href="/railway" className="text-primary hover:underline underline-offset-2">
                rail
              </Link>{' '}
              and{' '}
              <Link href="/air" className="hover:underline underline-offset-2" style={{ color: accentVar('air') }}>
                air
              </Link>{' '}
              alternatives.
            </p>
          </div>
        </div>
      )}

      {!loading && <WaterRouteResults />}
    </PipelineResultsLayout>
  );
}
