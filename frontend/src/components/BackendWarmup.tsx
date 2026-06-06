'use client';

import { useEffect } from 'react';
import { warmBackendInBackground } from '@/lib/backendWarmup';

/** Wakes Render on first paint, when the tab regains focus, and every ~3 min while open. */
export function BackendWarmup() {
  useEffect(() => {
    warmBackendInBackground();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        warmBackendInBackground();
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', warmBackendInBackground);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', warmBackendInBackground);
    };
  }, []);

  return null;
}
