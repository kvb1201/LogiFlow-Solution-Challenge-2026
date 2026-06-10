'use client';

import { Suspense } from 'react';
import ComparatorPageClient from '@/components/ComparatorPageClient';

export default function ComparatorPage() {
  return (
    <Suspense fallback={null}>
      <ComparatorPageClient />
    </Suspense>
  );
}
