'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';

export function AuthInitializer() {
  useEffect(() => {
    // Restore auth session from storage on app load
    useAuthStore.getState().restore();
  }, []);

  return null;
}
