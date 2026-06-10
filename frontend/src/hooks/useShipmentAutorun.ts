'use client';

import { useEffect, useRef, useState } from 'react';
import {
  markShipmentAutorunStarted,
  shouldRunShipmentAutorun,
  subscribeShipmentAutorun,
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
  const [autorunTick, setAutorunTick] = useState(0);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => subscribeShipmentAutorun(() => setAutorunTick((t) => t + 1)), []);

  useEffect(() => {
    if (!ready) return;
    if (!shouldRunShipmentAutorun(mode)) return;
    markShipmentAutorunStarted(mode);
    runRef.current();
  }, [mode, ready, autorunTick]);
}
