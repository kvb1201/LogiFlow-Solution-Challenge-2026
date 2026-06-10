'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { setShipmentAutorun } from '@/lib/shipmentAutorun';

/**
 * Consumes ?source=&destination=&stops= from planner "Regenerate Plan" links.
 * Clears prior results, prefills the corridor, and queues autorun.
 */
export function usePlannerRegenerateParams(mode: string) {
  const searchParams = useSearchParams();
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current) return;

    const source = searchParams?.get('source')?.trim();
    const destination = searchParams?.get('destination')?.trim();
    if (!source || !destination) return;

    appliedRef.current = true;

    const store = useLogiFlowStore.getState();
    store.resetResults();
    store.setSource(source);
    store.setDestination(destination);

    const stopsRaw = searchParams?.get('stops');
    if (stopsRaw && mode === 'road') {
      const stops = stopsRaw.split(',').map((s) => s.trim()).filter(Boolean);
      store.setRoadStops(stops);
    }

    setShipmentAutorun(mode);
  }, [searchParams, mode]);
}
