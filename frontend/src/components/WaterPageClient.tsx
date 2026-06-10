'use client';

import Link from 'next/link';
import { PipelineResultsLayout } from '@/components/cockpit/PipelineResultsLayout';
import { CapabilityStrip } from '@/components/cockpit/CapabilityStrip';
import { usePlannerRegenerateParams } from '@/hooks/usePlannerRegenerateParams';
import WaterInputForm from '@/components/waterInputForm';
import WaterRouteResults from '@/components/WaterRouteResults';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { useWaterPortCatalog } from '@/hooks/useWaterPortCatalog';
import { isWaterNoRouteMessage } from '@/lib/water-no-route';
import { WATER_CAPABILITY_BADGES, waterHeroMetrics } from '@/lib/water-metrics';

function MetricItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-xl sm:text-2xl font-black" style={{ color: 'var(--water)' }}>
        {value}
      </div>
      <div className="text-[10px] sm:text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
        {label}
      </div>
    </div>
  );
}

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
  const heroMetrics = waterHeroMetrics({ total, routable, regions });

  const waterBadges = WATER_CAPABILITY_BADGES.map((badge) =>
    badge.label === 'Global ports' && !catalogLoading
      ? { ...badge, label: `${total} global ports` }
      : badge
  );

  if (!hasSearched) {
    return (
      <div className="relative overflow-x-clip" style={{ background: '#06080d' }}>
        {showWaterLoading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#06080d]/70 backdrop-blur-sm" />
        )}
        <div className="pointer-events-none absolute inset-0 z-0">
          <div
            className="absolute w-[680px] h-[680px] rounded-full opacity-[0.08] blur-[130px] animate-mesh-1 top-[-20%] left-[-10%]"
            style={{ background: 'var(--water)' }}
          />
          <div className="absolute w-[500px] h-[500px] rounded-full opacity-[0.06] blur-[110px] bg-teal-400 animate-mesh-2 bottom-[-10%] right-[-8%]" />
          <div className="absolute inset-0 hero-dot-grid opacity-[0.28]" />
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse at center, transparent 20%, #06080d 75%)' }}
          />
        </div>

        <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] w-full flex-col items-center justify-center px-4 py-10 sm:py-12">
          <div className="w-full max-w-[860px] animate-slide-up">
            <div className="flex justify-center mb-8">
              <div
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border"
                style={{
                  borderColor: 'color-mix(in oklab, var(--water) 25%, transparent)',
                  background: 'color-mix(in oklab, var(--water) 8%, transparent)',
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--water)' }} />
                <span
                  className="text-[10px] font-bold tracking-[0.2em] uppercase"
                  style={{ color: 'color-mix(in oklab, var(--water) 90%, white)' }}
                >
                  Maritime Cargo · Global port routing
                </span>
              </div>
            </div>

            <div className="text-center mb-10">
              <h1 className="text-[2.5rem] xs:text-5xl sm:text-6xl md:text-[72px] font-black font-headline tracking-tighter mb-4 leading-none">
                <span
                  className="bg-gradient-to-r from-teal-300 via-cyan-300 to-primary bg-clip-text text-transparent animate-gradient-shift"
                  style={{ backgroundSize: '200% auto' }}
                >
                  Logi
                </span>
                <span className="text-on-surface">Flow</span>
              </h1>
              <p className="text-sm sm:text-[15px] text-on-surface-variant max-w-lg mx-auto leading-relaxed">
                Route port-to-port cargo across{' '}
                <span style={{ color: 'var(--water)' }} className="font-medium">
                  India, Middle East, Southeast Asia, East Asia, and Europe
                </span>{' '}
                with transshipment, cost, and reliability scoring.
              </p>

              <div
                className="flex flex-wrap justify-center gap-6 mt-6 animate-fade-in"
                style={{ animationDelay: '0.3s', animationFillMode: 'backwards' }}
              >
                {heroMetrics.map((m) => (
                  <MetricItem
                    key={m.label}
                    value={catalogLoading ? '…' : m.value}
                    label={m.label}
                  />
                ))}
              </div>
            </div>

            <CapabilityStrip badges={waterBadges} mode="water" className="mb-8" />

            <WaterInputForm />

            <div
              className="text-center mt-8 animate-fade-in"
              style={{ animationDelay: '0.8s', animationFillMode: 'backwards' }}
            >
              <p className="text-[10px] text-outline/50 uppercase tracking-[0.2em] font-label">
                Global static port network · not live AIS
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PipelineResultsLayout mode="water" source={source} destination={destination} onEdit={resetResults}>
        {error && !hideErrorBanner && (
          <div className="bg-error/10 border border-error/20 px-4 py-3 rounded-lg text-sm text-error flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-sm">error</span>
            {error}
          </div>
        )}

        {showWaterLoading && !hasResults && (
          <div className="flex items-center justify-center py-16 gap-3">
            <span
              className="material-symbols-outlined text-2xl animate-spin"
              style={{ color: 'var(--water)' }}
            >
              progress_activity
            </span>
            <span className="text-sm text-on-surface-variant">Charting maritime routes…</span>
          </div>
        )}

        <WaterInputForm />

        {!loading && !hasResults && hasSearched && searchMode === 'water' && !error && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3 mt-4">
            <span
              className="material-symbols-outlined text-amber-400 mt-0.5"
              style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
            >
              info
            </span>
            <div>
              <p className="text-sm font-medium text-on-surface mb-1">
                No maritime routes found between {source || 'origin'} and {destination || 'destination'}
              </p>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Try a different port pair or explore{' '}
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

        {!loading && <WaterRouteResults />}
    </PipelineResultsLayout>
  );
}
