'use client';

import React from 'react';
import Link from 'next/link';
import WaterInputForm from '@/components/waterInputForm';
import WaterRouteResults from '@/components/WaterRouteResults';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';

export default function WaterPage() {
  const error = useLogiFlowStore((s) => s.error);
  const loading = useLogiFlowStore((s) => s.loading);
  const waterRoutes = useLogiFlowStore((s) => s.waterRoutes);
  const hasResults = waterRoutes && waterRoutes.length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-x-hidden bg-[#06080d] min-h-0">
      {/* Hero header */}
      <div className="relative border-b border-outline-variant/10 overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute w-[520px] h-[520px] rounded-full opacity-[0.10] blur-[100px] bg-teal-500 -top-[45%] right-[-12%] animate-mesh-1" />
          <div className="absolute w-[440px] h-[440px] rounded-full opacity-[0.08] blur-[90px] bg-cyan-500 bottom-[-30%] left-[-8%] animate-mesh-2" />
        </div>
        <div className="relative max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-11">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-500/10 px-3 py-1.5 mb-4">
            <span
              className="material-symbols-outlined text-teal-400 leading-none"
              style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
            >
              directions_boat
            </span>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-teal-400/95">
              Maritime Cargo Intelligence
            </span>
          </div>
          <h1 className="font-headline text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-on-surface mb-3">
            Water route optimization
          </h1>
          <p className="text-[15px] text-on-surface-variant max-w-2xl leading-relaxed">
            Discovers port-based routes with transshipment options — compare time, cost, and maritime
            risk alongside{' '}
            <Link href="/railway" className="text-primary hover:underline underline-offset-2">
              rail
            </Link>
            ,{' '}
            <Link href="/road" className="text-secondary hover:underline underline-offset-2">
              road
            </Link>
            , and{' '}
            <Link href="/air" className="text-sky-300 hover:underline underline-offset-2">
              air
            </Link>{' '}
            in your LogiFlow workflow.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-5xl w-full mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-6">
        <WaterInputForm />

        {error && (
          <div className="bg-error/10 border border-error/20 px-4 py-3 rounded-xl text-sm text-error flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">error</span>
            {error}
          </div>
        )}

        {loading && !hasResults && (
          <div className="flex items-center justify-center py-16 gap-3">
            <span className="material-symbols-outlined text-2xl text-teal-400 animate-spin">
              progress_activity
            </span>
            <span className="text-sm text-on-surface-variant">Charting maritime routes…</span>
          </div>
        )}

        {!loading && <WaterRouteResults />}
      </div>
    </div>
  );
}
