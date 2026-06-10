import { Suspense } from 'react';
import RailwayDashboard from '@/components/RailwayDashboard';

export default function RailwayPage() {
  return (
    <Suspense fallback={null}>
      <RailwayDashboard />
    </Suspense>
  );
}
