'use client';

import { usePlannerRegenerateParams } from '@/hooks/usePlannerRegenerateParams';
import AirInputForm from '@/components/AirInputForm';
import AirResults from '@/components/AirResults';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import Link from 'next/link';
import { PipelineResultsLayout } from '@/components/cockpit/PipelineResultsLayout';
import { PipelineLogiLanding } from '@/components/cockpit/PipelineLogiLanding';
import { HeroMetricsGrid } from '@/components/cockpit/HeroMetricsGrid';
import { AIR_CAPABILITY_BADGES, AIR_HERO_METRICS } from '@/lib/air-metrics';
import { accentVar } from '@/lib/pipeline-theme';

export default function AirPageClient() {
  usePlannerRegenerateParams('air');

  const error = useLogiFlowStore((state) => state.error);
  const loading = useLogiFlowStore((state) => state.loading);
  const loadingMode = useLogiFlowStore((state) => state.loadingMode);
  const airRoutes = useLogiFlowStore((state) => state.airRoutes);
  const source = useLogiFlowStore((state) => state.source);
  const destination = useLogiFlowStore((state) => state.destination);
  const hasSearched = useLogiFlowStore((state) => state.hasSearched);
  const resetResults = useLogiFlowStore((state) => state.resetResults);
  const searchMode = useLogiFlowStore((state) => state.searchMode);
  const hasResults = airRoutes.length > 0;
  const showAirLoading = loading && loadingMode === 'air';
  const showNoRoutePage =
    (!hasResults && hasSearched && searchMode === 'air' && !showAirLoading) ||
    (!!error &&
      /no valid air routes found|no route available|no air routes found|no feasible routes/i.test(error));

  if (!hasSearched) {
    return (
      <PipelineLogiLanding
        mode="air"
        badge="Air Cargo Intelligence · Live route support"
        description={
          <>
            AI-powered cargo routing across{' '}
            <span style={{ color: accentVar('air') }} className="font-medium">
              air
            </span>{' '}
            with route support confidence, cargo rules, and detailed cost breakdowns.
          </>
        }
        metrics={<HeroMetricsGrid metrics={AIR_HERO_METRICS} mode="air" />}
        badges={AIR_CAPABILITY_BADGES}
        loadingOverlay={
          showAirLoading ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" />
          ) : null
        }
        footer={
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.2em]">
            Powered by live support data and cargo-aware scoring
          </p>
        }
      >
        <AirInputForm />
      </PipelineLogiLanding>
    );
  }

  return (
    <PipelineResultsLayout mode="air" source={source} destination={destination} onEdit={resetResults}>
      {error && showNoRoutePage ? (
        <div className="pipeline-card mb-4 p-4 text-sm leading-relaxed text-muted-foreground">
          No route available right now. Try a different city pair, relax the cargo constraints, or switch to
          the hybrid optimizer.
        </div>
      ) : null}

      <AirInputForm />

      {error && !showNoRoutePage && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          <span className="material-symbols-outlined text-sm">error</span>
          {error}
        </div>
      )}

      {showAirLoading && !hasResults && (
        <div className="flex items-center justify-center gap-3 py-16">
          <span className="material-symbols-outlined animate-spin text-2xl" style={{ color: accentVar('air') }}>
            progress_activity
          </span>
          <span className="text-sm text-muted-foreground">Optimizing air routes…</span>
        </div>
      )}

      {!loading && !hasResults && !hasSearched && (
        <div className="pipeline-card mt-4 p-4 text-sm leading-relaxed text-muted-foreground">
          Enter origin and destination cities, set cargo and priority, then submit to see ranked air routes.
        </div>
      )}

      {!loading && !hasResults && hasSearched && searchMode === 'air' && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <span
            className="material-symbols-outlined mt-0.5 text-amber-400"
            style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
          >
            info
          </span>
          <div>
            <p className="mb-1 text-sm font-medium text-foreground">
              No air routes found between {source || 'origin'} and {destination || 'destination'}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Try a different city pair, or explore{' '}
              <Link href="/railway" className="text-rail hover:underline underline-offset-2">
                rail
              </Link>{' '}
              and{' '}
              <Link href="/road" className="hover:underline underline-offset-2" style={{ color: accentVar('road') }}>
                road
              </Link>{' '}
              alternatives.
            </p>
          </div>
        </div>
      )}

      {!loading && hasResults && (
        <>
          <p className="mb-4 px-0.5 text-sm text-muted-foreground">
            Showing {airRoutes.length} ranked route{airRoutes.length !== 1 ? 's' : ''} for{' '}
            <span className="font-medium text-foreground">
              {source || 'origin'} → {destination || 'destination'}
            </span>
            .
          </p>
          <AirResults />
        </>
      )}
    </PipelineResultsLayout>
  );
}
