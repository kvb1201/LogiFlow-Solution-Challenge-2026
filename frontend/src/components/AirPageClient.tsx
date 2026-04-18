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
  const searchMode = useLogiFlowStore((state) => state.searchMode);
  const hasResults = airRoutes.length > 0;
  const showAirLoading = loading && loadingMode === 'air';

  return (
    <div className="flex-1 flex flex-col overflow-x-hidden bg-[#06080d] min-h-0">
      <div className="relative border-b border-outline-variant/10 overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute w-[520px] h-[520px] rounded-full opacity-[0.11] blur-[100px] bg-sky-500 -top-[40%] right-[-15%] animate-mesh-1" />
          <div className="absolute w-[420px] h-[420px] rounded-full opacity-[0.07] blur-[90px] bg-primary bottom-[-35%] left-[-10%] animate-mesh-2" />
        </div>
        <div className="relative max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-11">
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
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant hover:text-on-surface hover:border-outline-variant/35 transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-sm">home</span>
              Home
            </Link>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-5xl w-full mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-6">
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

        {!loading && !hasResults && !hasSearched && (
          <div className="rounded-2xl border border-outline-variant/12 bg-surface-container-low/35 p-6 text-sm text-on-surface-variant leading-relaxed">
            Enter origin and destination cities, set cargo and priority, then submit to see ranked air
            routes with airlines, stops, cost, and confidence.
          </div>
        )}

        {!loading && !hasResults && hasSearched && searchMode === 'air' && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 flex items-start gap-3">
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
