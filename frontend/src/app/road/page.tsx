'use client';

import React from 'react';
import Link from 'next/link';
import RoadInputForm from '@/components/roadInputForm';
import RouteResults from '@/components/RouteResults';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';

export default function RoadPage() {
  const error = useLogiFlowStore((s) => s.error);
  const loading = useLogiFlowStore((s) => s.loading);
  const routes = useLogiFlowStore((s) => s.routes);
  const hasResults = routes && routes.length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-x-hidden bg-[#06080d] min-h-0">
      <div className="relative border-b border-outline-variant/10 overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute w-[520px] h-[520px] rounded-full opacity-[0.1] blur-[100px] bg-secondary -top-[45%] right-[-12%] animate-mesh-1" />
          <div className="absolute w-[440px] h-[440px] rounded-full opacity-[0.08] blur-[90px] bg-primary bottom-[-30%] left-[-8%] animate-mesh-2" />
        </div>
        <div className="relative max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-11">
          <div className="inline-flex items-center gap-2 rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1.5 mb-4">
            <span
              className="material-symbols-outlined text-secondary leading-none"
              style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
            >
              local_shipping
            </span>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-secondary/95">
              Road logistics
            </span>
          </div>
          <h1 className="font-headline text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-on-surface mb-3">
            Road route optimization
          </h1>
          <p className="text-[15px] text-on-surface-variant max-w-2xl leading-relaxed">
            Compare paths by time, cost, and risk with traffic-aware routing and clear breakdowns—
            designed to sit beside{' '}
            <Link href="/railway" className="text-primary hover:underline underline-offset-2">
              rail
            </Link>{' '}
            and{' '}
            <Link href="/air" className="text-sky-300 hover:underline underline-offset-2">
              air
            </Link>{' '}
            in your LogiFlow workflow.
          </p>
        </div>
      </div>

      <div className="flex-1 max-w-5xl w-full mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-6">
        <RoadInputForm />

        {error && (
          <div className="bg-error/10 border border-error/20 px-4 py-3 rounded-xl text-sm text-error flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">error</span>
            {error}
          </div>
        )}

        {loading && !hasResults && (
          <div className="flex items-center justify-center py-16 gap-3">
            <span className="material-symbols-outlined text-2xl text-secondary animate-spin">
              progress_activity
            </span>
            <span className="text-sm text-on-surface-variant">Calculating road paths…</span>
          </div>
        )}

        {!loading && <RouteResults />}
      </div>
    </div>
  );
}
