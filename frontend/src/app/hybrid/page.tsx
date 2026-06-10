'use client';

import { Suspense } from 'react';
import HybridPageClient from '@/components/HybridPageClient';

export default function HybridPage() {
  return (
    <Suspense fallback={null}>
      <HybridPageClient />
    </Suspense>
  );
}
