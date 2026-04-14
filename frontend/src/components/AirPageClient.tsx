'use client';

import Link from 'next/link';
import React from 'react';
import AirInputForm from '@/components/AirInputForm';
import AirResults from '@/components/AirResults';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';

export default function AirPageClient() {
  const error = useLogiFlowStore((state) => state.error);
  const loading = useLogiFlowStore((state) => state.loading);
  const loadingMode = useLogiFlowStore((state) => state.loadingMode);
  const airRoutes = useLogiFlowStore((state) => state.airRoutes);
  const source = useLogiFlowStore((state) => state.source);
  const destination = useLogiFlowStore((state) => state.destination);
  const hasSearched = useLogiFlowStore((state) => state.hasSearched);
  const resetSearch = useLogiFlowStore((state) => state.resetSearch);
  const hasResults = airRoutes.length > 0;
  const showAirLoading = loading && loadingMode === 'air';
  const showNoRoutePage =
    !!error && /no route available|no air routes found|no feasible routes found|air optimize failed \(404\)/i.test(error);

  if (!hasSearched) {
    return (
      <div className="flex-1 flex flex-col overflow-x-hidden">
        {showAirLoading && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#06080d]/70 backdrop-blur-sm" />}
        <div
          className="flex-1 flex flex-col items-center sm:justify-center px-4 py-10 relative overflow-y-auto overflow-x-hidden"
          style={{ background: '#06080d' }}
        >
          <div className="absolute inset-0 z-0 pointer-events-none">
            <div className="absolute w-[680px] h-[680px] rounded-full opacity-[0.09] blur-[130px] bg-sky-500 animate-mesh-1 top-[-20%] left-[-10%]" />
            <div className="absolute w-[500px] h-[500px] rounded-full opacity-[0.07] blur-[110px] bg-secondary animate-mesh-2 bottom-[-10%] right-[-8%]" />
            <div className="absolute w-[380px] h-[380px] rounded-full opacity-[0.05] blur-[90px] bg-primary-fixed-dim animate-mesh-3 top-[50%] left-[55%]" />
            <div className="absolute inset-0 hero-dot-grid opacity-[0.28]" />
            <div
              className="absolute inset-0"
              style={{ background: 'radial-gradient(ellipse at center, transparent 20%, #06080d 75%)' }}
            />
          </div>

          <div className="relative z-10 w-full max-w-[860px] animate-slide-up">
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
            </div>

            <div className="flex flex-wrap justify-center gap-2 mb-8">
              {[
                { icon: 'flight_takeoff', label: 'Flight Support' },
                { icon: 'inventory_2', label: 'Cargo Rules' },
                { icon: 'monitoring', label: 'Confidence Scoring' },
                { icon: 'route', label: 'Ranked Routes' },
              ].map((feature, i) => (
                <div
                  key={feature.label}
                  className="flex items-center gap-2 px-3.5 py-2 bg-surface-container/50 border border-outline-variant/10 rounded-lg text-xs text-on-surface-variant backdrop-blur-sm animate-fade-in"
                  style={{ animationDelay: `${0.5 + i * 0.15}s`, animationFillMode: 'backwards' }}
                >
                  <span className="material-symbols-outlined text-primary text-sm">{feature.icon}</span>
                  {feature.label}
                </div>
              ))}
            </div>

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
    <div className="flex-1 flex flex-col overflow-x-hidden min-h-0 bg-[var(--color-background)] text-[var(--color-on-surface)]">
      <div className="relative border-b border-outline-variant/10 overflow-hidden bg-[#06080d]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute w-[520px] h-[520px] rounded-full opacity-[0.11] blur-[100px] bg-sky-500 -top-[40%] right-[-15%] animate-mesh-1" />
          <div className="absolute w-[420px] h-[420px] rounded-full opacity-[0.07] blur-[90px] bg-primary bottom-[-35%] left-[-10%] animate-mesh-2" />
        </div>
        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-11">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 mb-4">
                <span
                  className="material-symbols-outlined text-sky-300 leading-none"
                  style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
                >
                  flight_takeoff
                </span>
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-sky-200/90">
                  Air cargo
                </span>
              </div>
              <h1 className="font-headline text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-on-surface mb-3">
                Air route optimization
              </h1>
              <p className="text-[15px] text-on-surface-variant max-w-2xl leading-relaxed">
                Rank direct and connecting airport pairs with cargo rules, cost breakdowns, and
                confidence—alongside{' '}
                <Link href="/railway" className="text-primary hover:underline underline-offset-2">
                  rail
                </Link>{' '}
                and{' '}
                <Link href="/road" className="text-secondary hover:underline underline-offset-2">
                  road
                </Link>{' '}
                in one workflow.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={resetSearch}
                className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant hover:text-on-surface hover:border-outline-variant/35 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">restart_alt</span>
                Reset
              </button>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant hover:text-on-surface hover:border-outline-variant/35 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">home</span>
                Home
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-6xl w-full mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-6">
        {error && showNoRoutePage ? (
          <div className="rounded-2xl border border-outline-variant/12 bg-surface-container-low/40 p-6 text-sm text-on-surface-variant leading-relaxed">
            No route available right now. Try a different city pair, relax the cargo constraints, or switch to the hybrid optimizer.
          </div>
        ) : null}

        <AirInputForm />

        {error && (
          <div className="bg-error/10 border border-error/20 px-4 py-3 rounded-xl text-sm text-error flex items-center gap-2">
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

        {!loading && !hasResults && (
          <div className="rounded-2xl border border-outline-variant/12 bg-surface-container-low/35 p-6 text-sm text-on-surface-variant leading-relaxed">
            Enter origin and destination cities, set cargo and priority, then submit to see ranked air
            routes with airlines, stops, cost, and confidence.
          </div>
        )}

        {!loading && hasResults && (
          <>
            <p className="text-sm text-on-surface-variant px-0.5">
              Showing {airRoutes.length} ranked route{airRoutes.length !== 1 ? 's' : ''} for{' '}
              <span className="text-on-surface font-medium">
                {source || 'origin'} → {destination || 'destination'}
              </span>
              .
            </p>
            <AirResults />
          </>
        )}
      </div>
    </div>
  );
}
