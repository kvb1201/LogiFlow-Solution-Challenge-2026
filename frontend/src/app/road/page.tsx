'use client';

import React from 'react';
import InputForm from '@/components/roadInputForm';
import RouteResults from '@/components/RouteResults';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';

export default function RoadPage() {
  const error = useLogiFlowStore((s) => s.error);
  const loading = useLogiFlowStore((s) => s.loading);

  return (
    <div className="bg-(--color-background) text-(--color-on-surface) min-h-screen">
      <div className="max-w-[1100px] mx-auto px-6 py-10">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary/10 border border-primary/20 rounded-full mb-4">
            <div className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
            <span className="text-[11px] font-semibold tracking-widest uppercase text-primary">
              Road Logistics Demo
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black font-headline tracking-tight">
            <span className="text-on-surface">Optimize Road Routes</span>
          </h1>
          <p className="text-sm text-on-surface-variant mt-2 max-w-2xl">
            Compare multiple road routes by time, cost, and risk, then select one to view it on the map.
          </p>
        </div>

        <InputForm />

        {error && (
          <div className="mt-4 bg-error/10 border border-error/20 px-4 py-3 rounded-xl text-sm text-error flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">error</span>
            {error}
          </div>
        )}

        {!loading && <RouteResults />}
      </div>
    </div>
  );
}

