'use client';

import { usePlannerRegenerateParams } from '@/hooks/usePlannerRegenerateParams';
import RoadInputForm from '@/components/roadInputForm';
import RouteResults from '@/components/RouteResults';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import Link from 'next/link';
import { PipelineResultsLayout } from '@/components/cockpit/PipelineResultsLayout';
import { PipelineLogiLanding } from '@/components/cockpit/PipelineLogiLanding';
import { HeroMetricsGrid } from '@/components/cockpit/HeroMetricsGrid';
import { ROAD_CAPABILITY_BADGES, ROAD_HERO_METRICS } from '@/lib/road-metrics';
import { accentVar } from '@/lib/pipeline-theme';

export default function RoadPageClient() {
  usePlannerRegenerateParams('road');

  const error = useLogiFlowStore((s) => s.error);
  const loading = useLogiFlowStore((s) => s.loading);
  const loadingMode = useLogiFlowStore((s) => s.loadingMode);
  const routes = useLogiFlowStore((s) => s.routes);
  const source = useLogiFlowStore((s) => s.source);
  const destination = useLogiFlowStore((s) => s.destination);
  const hasSearched = useLogiFlowStore((s) => s.hasSearched);
  const resetResults = useLogiFlowStore((s) => s.resetResults);
  const searchMode = useLogiFlowStore((s) => s.searchMode);
  const roadNoRoutesReason = useLogiFlowStore((s) => s.roadNoRoutesReason);

  const showRoadLoading = loading && loadingMode === 'road';
  const hasResults = routes.length > 0 || !!roadNoRoutesReason;

  if (!hasSearched) {
    return (
      <PipelineLogiLanding
        mode="road"
        badge="Road Logistics · Traffic-aware routing"
        description={
          <>
            AI-powered cargo routing across{' '}
            <span style={{ color: accentVar('road') }} className="font-medium">
              road
            </span>{' '}
            with live traffic, weather intelligence, and ML risk scoring.
          </>
        }
        metrics={<HeroMetricsGrid metrics={ROAD_HERO_METRICS} mode="road" />}
        badges={ROAD_CAPABILITY_BADGES}
        loadingOverlay={
          showRoadLoading ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" />
          ) : null
        }
        footer={
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.2em]">
            Powered by TomTom routing · live traffic · ML delay prediction
          </p>
        }
      >
        <RoadInputForm />
      </PipelineLogiLanding>
    );
  }

  return (
    <PipelineResultsLayout mode="road" source={source} destination={destination} onEdit={resetResults}>
      {error && !roadNoRoutesReason && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          <span className="material-symbols-outlined text-sm">error</span>
          {error}
        </div>
      )}

      {showRoadLoading && !hasResults && (
        <div className="flex items-center justify-center gap-3 py-16">
          <span className="material-symbols-outlined animate-spin text-2xl" style={{ color: accentVar('road') }}>
            progress_activity
          </span>
          <span className="text-sm text-muted-foreground">Calculating road paths…</span>
        </div>
      )}

      <RoadInputForm />

      {!loading && !hasResults && hasSearched && searchMode === 'road' && !error && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <span
            className="material-symbols-outlined mt-0.5 text-amber-400"
            style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
          >
            info
          </span>
          <div>
            <p className="mb-1 text-sm font-medium text-foreground">
              No road routes found between {source || 'origin'} and {destination || 'destination'}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Try relaxing the cargo constraints or explore{' '}
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

      {!loading && <RouteResults />}
    </PipelineResultsLayout>
  );
}
