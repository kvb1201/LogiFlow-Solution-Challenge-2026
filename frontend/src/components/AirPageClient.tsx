'use client';

import Link from 'next/link';
import React from 'react';
import AirInputForm from '@/components/AirInputForm';
import AirResults from '@/components/AirResults';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';

export default function AirPageClient() {
  const error = useLogiFlowStore((state) => state.error);
  const loading = useLogiFlowStore((state) => state.loading);
  const airRoutes = useLogiFlowStore((state) => state.airRoutes);
  const source = useLogiFlowStore((state) => state.source);
  const destination = useLogiFlowStore((state) => state.destination);

  return (
    <div className="bg-[var(--color-background)] text-[var(--color-on-surface)] min-h-screen">
      <div className="max-w-[1320px] mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-secondary/10 border border-secondary/20 rounded-full mb-4">
                <div className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
                <span className="text-[11px] font-semibold tracking-widest uppercase text-secondary">
                  Air Cargo Mode
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl font-black font-headline tracking-tight">
                <span className="text-on-surface">Optimize Air Cargo Routes</span>
              </h1>
              <p className="text-sm text-on-surface-variant mt-2 max-w-3xl">
                Compare flight options with cargo-specific business rules, cost optimization, and route confidence backed by route-support data.
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container border border-outline-variant/15 text-xs font-semibold uppercase tracking-wider text-on-surface-variant hover:text-on-surface hover:border-outline-variant/30 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Back to Rail
            </Link>
          </div>
        </div>

        <AirInputForm />

        {error && (
          <div className="mt-4 bg-error/10 border border-error/20 px-4 py-3 rounded-xl text-sm text-error flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">error</span>
            {error}
          </div>
        )}

        {!loading && !airRoutes.length && (
          <div className="mt-6 rounded-2xl border border-outline-variant/15 bg-surface-container-low/35 p-6 text-sm text-on-surface-variant">
            Enter an origin and destination, then submit to see ranked air routes with cost breakdowns, confidence, and route-support details.
          </div>
        )}

        {!loading && !!airRoutes.length && (
          <>
            <div className="mt-6 px-1 text-sm text-on-surface-variant">
              Showing {airRoutes.length} ranked air route{airRoutes.length !== 1 ? 's' : ''} for
              <span className="text-on-surface font-medium"> {source || 'origin'} to {destination || 'destination'}</span>.
            </div>
            <AirResults />
          </>
        )}
      </div>
    </div>
  );
}
