'use client';

import { useEffect, useRef } from 'react';
import {
  markShipmentAutorunStarted,
  shouldRunShipmentAutorun,
} from '@/lib/shipmentAutorun';

/**
 * Runs `run` once when landing after home intent confirmation.
 */
export function useShipmentAutorun(
  mode: string,
  run: () => void,
  ready: boolean
) {
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!ready) return;
    if (!shouldRunShipmentAutorun(mode)) return;
    markShipmentAutorunStarted(mode);
    runRef.current();
  }, [mode, ready]);
}
