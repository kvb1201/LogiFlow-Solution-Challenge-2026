'use client';

import { Suspense } from 'react';
import RoadPageClient from '@/components/RoadPageClient';

export default function RoadPage() {
  return (
    <Suspense fallback={null}>
      <RoadPageClient />
    </Suspense>
  );
}
