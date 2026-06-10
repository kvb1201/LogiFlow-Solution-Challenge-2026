'use client';

import { usePlannerRegenerateParams } from '@/hooks/usePlannerRegenerateParams';
import AirInputForm from '@/components/AirInputForm';
import AirResults from '@/components/AirResults';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import Link from "next/link";
import { PipelineResultsLayout } from '@/components/cockpit/PipelineResultsLayout';
import { CapabilityStrip } from '@/components/cockpit/CapabilityStrip';
import { AIR_CAPABILITY_BADGES } from '@/lib/air-metrics';

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
    (!!error && /no valid air routes found|no route available|no air routes found|no feasible routes/i.test(error));

  if (!hasSearched) {
    return (
      <div className="relative overflow-x-clip" style={{ background: '#06080d' }}>
        {showAirLoading && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#06080d]/70 backdrop-blur-sm" />}
        <div className="pointer-events-none absolute inset-0 z-0">
            <div className="absolute w-[680px] h-[680px] rounded-full opacity-[0.09] blur-[130px] bg-sky-500 animate-mesh-1 top-[-20%] left-[-10%]" />
            <div className="absolute w-[500px] h-[500px] rounded-full opacity-[0.07] blur-[110px] bg-secondary animate-mesh-2 bottom-[-10%] right-[-8%]" />
            <div className="absolute w-[380px] h-[380px] rounded-full opacity-[0.05] blur-[90px] bg-primary-fixed-dim animate-mesh-3 top-[50%] left-[55%]" />
            <div className="absolute inset-0 hero-dot-grid opacity-[0.28]" />
            <div
              className="absolute inset-0"
              style={{ background: 'radial-gradient(ellipse at center, transparent 20%, #06080d 75%)' }}
            />
          </div>

        <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] w-full flex-col items-center justify-center px-4 py-10 sm:py-12">
          <div className="w-full max-w-[860px] animate-slide-up">
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-secondary/8 border border-secondary/15 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-sky-300 animate-pulse" />
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-secondary/90">
                  Air Cargo Intelligence · Live route support
                </span>
              </div>
            </div>

            <div className="text-center mb-10">
              <h1 className="text-[2.5rem] xs:text-5xl sm:text-6xl md:text-[72px] font-black font-headline tracking-tighter mb-4 leading-none">
                <span
                  className="bg-gradient-to-r from-secondary via-sky-300 to-primary bg-clip-text text-transparent animate-gradient-shift"
                  style={{ backgroundSize: '200% auto' }}
                >
                  Logi
                </span>
                <span className="text-on-surface">Flow</span>
              </h1>
              <p className="text-sm sm:text-[15px] text-on-surface-variant max-w-lg mx-auto leading-relaxed">
                AI-powered cargo routing across <span className="text-secondary font-medium">air</span>{' '}
                with route support confidence, cargo rules, and detailed cost breakdowns.
              </p>

              <div className="flex flex-wrap justify-center gap-6 mt-6 animate-fade-in" style={{ animationDelay: '0.3s', animationFillMode: 'backwards' }}>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-black text-sky-300">70</div>
                  <div className="text-[10px] sm:text-xs text-on-surface-variant uppercase tracking-wider font-semibold">Airports</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-black text-sky-300">1,051</div>
                  <div className="text-[10px] sm:text-xs text-on-surface-variant uppercase tracking-wider font-semibold">Flight Routes</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-black text-sky-300">8</div>
                  <div className="text-[10px] sm:text-xs text-on-surface-variant uppercase tracking-wider font-semibold">Major Airlines</div>
                </div>
              </div>
            </div>

            <CapabilityStrip badges={AIR_CAPABILITY_BADGES} mode="air" className="mb-8" />

            <AirInputForm />

            <div className="text-center mt-8 animate-fade-in" style={{ animationDelay: '0.8s', animationFillMode: 'backwards' }}>
              <p className="text-[10px] text-outline/50 uppercase tracking-[0.2em] font-label">
                Powered by live support data and cargo-aware scoring
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PipelineResultsLayout mode="air" source={source} destination={destination} onEdit={resetResults}>
        {error && showNoRoutePage ? (
          <div className="pipeline-card p-4 text-sm text-on-surface-variant leading-relaxed">
            No route available right now. Try a different city pair, relax the cargo constraints, or switch to the hybrid optimizer.
          </div>
        ) : null}

        <AirInputForm />

        {error && !showNoRoutePage && (
          <div className="bg-error/10 border border-error/20 px-4 py-3 rounded-lg text-sm text-error flex items-center gap-2 mt-4">
            <span className="material-symbols-outlined text-sm">error</span>
            {error}
          </div>
        )}

        {showAirLoading && !hasResults && (
          <div className="flex items-center justify-center py-16 gap-3">
            <span className="material-symbols-outlined text-2xl text-sky-300 animate-spin">
              progress_activity
            </span>
            <span className="text-sm text-on-surface-variant">Optimizing air routes…</span>
          </div>
        )}

        {!loading && !hasResults && !hasSearched && (
          <div className="pipeline-card p-4 text-sm text-on-surface-variant leading-relaxed mt-4">
            Enter origin and destination cities, set cargo and priority, then submit to see ranked air
            routes with airlines, stops, cost, and confidence.
          </div>
        )}

        {!loading && !hasResults && hasSearched && searchMode === 'air' && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3 mt-4">
            <span
              className="material-symbols-outlined text-amber-400 mt-0.5"
              style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
            >
              info
            </span>
            <div>
              <p className="text-sm font-medium text-on-surface mb-1">
                No air routes found between {source || 'origin'} and {destination || 'destination'}
              </p>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                There are no verified air cargo routes for this city pair in our dataset. Try a different
                origin or destination, or explore{' '}
                <a href="/railway" className="text-primary hover:underline underline-offset-2">rail</a>{' '}
                and{' '}
                <a href="/road" className="text-secondary hover:underline underline-offset-2">road</a>{' '}
                alternatives.
              </p>
            </div>
          </div>
        )}

        {!loading && hasResults && (
          <>
            <p className="text-sm text-on-surface-variant px-0.5 mb-4">
              Showing {airRoutes.length} ranked route{airRoutes.length !== 1 ? 's' : ''} for{' '}
              <span className="text-on-surface font-medium">
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
