'use client';

import { useEffect } from 'react';
import { warmBackendInBackground } from '@/lib/backendWarmup';

/** Starts waking the Render backend as soon as the app loads. */
export function BackendWarmup() {
  useEffect(() => {
    warmBackendInBackground();
  }, []);

  return null;
}
