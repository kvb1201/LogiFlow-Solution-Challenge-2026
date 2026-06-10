import { Suspense } from 'react';
import AirPageClient from '@/components/AirPageClient';

export default function AirPage() {
  return (
    <Suspense fallback={null}>
      <AirPageClient />
    </Suspense>
  );
}
