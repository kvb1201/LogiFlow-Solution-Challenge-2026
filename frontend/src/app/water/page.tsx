'use client';

import { Suspense } from 'react';
import WaterPageClient from '@/components/WaterPageClient';

export default function WaterPage() {
  return (
    <Suspense fallback={null}>
      <WaterPageClient />
    </Suspense>
  );
}
