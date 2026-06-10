'use client';

import Link from 'next/link';
import { PipelineResultsLayout } from '@/components/cockpit/PipelineResultsLayout';
import { CapabilityStrip } from '@/components/cockpit/CapabilityStrip';
import { ROAD_CAPABILITY_BADGES, ROAD_HERO_METRICS } from '@/lib/road-metrics';
import { usePlannerRegenerateParams } from '@/hooks/usePlannerRegenerateParams';
import RoadInputForm from '@/components/roadInputForm';
import RouteResults from '@/components/RouteResults';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';

// ── Metric item ───────────────────────────────────────────────────────

function MetricItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-xl sm:text-2xl font-black text-secondary">{value}</div>
      <div className="text-[10px] sm:text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
        {label}
      </div>
    </div>
  );
}

// ── Main client ───────────────────────────────────────────────────────

export default function RoadPageClient() {
  usePlannerRegenerateParams('road');

  const error      = useLogiFlowStore(s => s.error);
  const loading    = useLogiFlowStore(s => s.loading);
  const loadingMode = useLogiFlowStore(s => s.loadingMode);
  const routes     = useLogiFlowStore(s => s.routes);
  const source     = useLogiFlowStore(s => s.source);
  const destination = useLogiFlowStore(s => s.destination);
  const hasSearched = useLogiFlowStore(s => s.hasSearched);
  const resetResults = useLogiFlowStore(s => s.resetResults);
  const searchMode  = useLogiFlowStore(s => s.searchMode);
  const roadNoRoutesReason = useLogiFlowStore(s => s.roadNoRoutesReason);

  const showRoadLoading = loading && loadingMode === 'road';
  const hasResults = routes.length > 0 || !!roadNoRoutesReason;

  // ── Pre-search landing ────────────────────────────────────────────

  if (!hasSearched) {
    return (
      <div className="relative overflow-x-clip" style={{ background: '#06080d' }}>
        {showRoadLoading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#06080d]/70 backdrop-blur-sm" />
        )}
        <div className="pointer-events-none absolute inset-0 z-0">
            <div className="absolute w-[680px] h-[680px] rounded-full opacity-[0.08] blur-[130px] bg-secondary animate-mesh-1 top-[-20%] left-[-10%]" />
            <div className="absolute w-[500px] h-[500px] rounded-full opacity-[0.06] blur-[110px] bg-primary animate-mesh-2 bottom-[-10%] right-[-8%]" />
            <div className="absolute w-[380px] h-[380px] rounded-full opacity-[0.04] blur-[90px] bg-tertiary animate-mesh-3 top-[50%] left-[55%]" />
            <div className="absolute inset-0 hero-dot-grid opacity-[0.28]" />
            <div
              className="absolute inset-0"
              style={{ background: 'radial-gradient(ellipse at center, transparent 20%, #06080d 75%)' }}
            />
          </div>

        <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] w-full flex-col items-center justify-center px-4 py-10 sm:py-12">
          <div className="w-full max-w-[860px] animate-slide-up">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-secondary/8 border border-secondary/15 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-secondary/90">
                  Road Logistics · Traffic-aware routing
                </span>
              </div>
            </div>

            {/* Title + description */}
            <div className="text-center mb-10">
              <h1 className="text-[2.5rem] xs:text-5xl sm:text-6xl md:text-[72px] font-black font-headline tracking-tighter mb-4 leading-none">
                <span
                  className="bg-gradient-to-r from-secondary via-amber-300 to-primary bg-clip-text text-transparent animate-gradient-shift"
                  style={{ backgroundSize: '200% auto' }}
                >
                  Logi
                </span>
                <span className="text-on-surface">Flow</span>
              </h1>
              <p className="text-sm sm:text-[15px] text-on-surface-variant max-w-lg mx-auto leading-relaxed">
                AI-powered cargo routing across{' '}
                <span className="text-secondary font-medium">road</span> with live traffic,
                weather intelligence, and ML risk scoring.
              </p>

              {/* ── Hero metrics ── */}
              <div
                className="flex flex-wrap justify-center gap-6 mt-6 animate-fade-in"
                style={{ animationDelay: '0.3s', animationFillMode: 'backwards' }}
              >
                {ROAD_HERO_METRICS.map((m) => (
                  <MetricItem key={m.label} value={m.value} label={m.label} />
                ))}
              </div>
            </div>

            <CapabilityStrip badges={ROAD_CAPABILITY_BADGES} mode="road" className="mb-8" />

            {/* Form */}
            <RoadInputForm />

            {/* Footer note */}
            <div
              className="text-center mt-8 animate-fade-in"
              style={{ animationDelay: '0.8s', animationFillMode: 'backwards' }}
            >
              <p className="text-[10px] text-outline/50 uppercase tracking-[0.2em] font-label">
                Powered by TomTom routing · live traffic · ML delay prediction
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Post-search results view ──────────────────────────────────────

  return (
    <PipelineResultsLayout mode="road" source={source} destination={destination} onEdit={resetResults}>
        {error && !roadNoRoutesReason && (
          <div className="bg-error/10 border border-error/20 px-4 py-3 rounded-lg text-sm text-error flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-sm">error</span>
            {error}
          </div>
        )}

        {showRoadLoading && !hasResults && (
          <div className="flex items-center justify-center py-16 gap-3">
            <span className="material-symbols-outlined text-2xl text-secondary animate-spin">
              progress_activity
            </span>
            <span className="text-sm text-on-surface-variant">Calculating road paths…</span>
          </div>
        )}

        <RoadInputForm />

        {!loading && !hasResults && hasSearched && searchMode === 'road' && !error && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3 mt-4">
            <span
              className="material-symbols-outlined text-amber-400 mt-0.5"
              style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
            >
              info
            </span>
            <div>
              <p className="text-sm font-medium text-on-surface mb-1">
                No road routes found between {source || 'origin'} and {destination || 'destination'}
              </p>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Try relaxing the cargo constraints or explore{' '}
                <Link href="/railway" className="text-primary hover:underline underline-offset-2">
                  rail
                </Link>{' '}
                and{' '}
                <Link href="/air" className="text-secondary hover:underline underline-offset-2">
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
