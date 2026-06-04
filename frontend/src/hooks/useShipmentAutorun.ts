'use client';

import { useEffect, useRef } from 'react';
import { consumeShipmentAutorun } from '@/lib/shipmentAutorun';

/**
 * Runs `run` once when landing after home intent confirmation (session flag).
 */
export function useShipmentAutorun(
  mode: string,
  run: () => void,
  ready: boolean
) {
  const ran = useRef(false);

  useEffect(() => {
    if (!ready || ran.current) return;
    if (!consumeShipmentAutorun(mode)) return;
    ran.current = true;
    run();
  }, [mode, run, ready]);
}
