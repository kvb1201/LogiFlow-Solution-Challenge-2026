import { Suspense } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ReportsPage } from '@/components/planner/ReportsPage';
import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'My Plans',
  description: 'View and manage your saved shipment plans.',
  path: '/reports',
  noIndex: true,
});

export default function ReportsRoute() {
  return (
    <ProtectedRoute>
      <Suspense fallback={null}>
        <ReportsPage />
      </Suspense>
    </ProtectedRoute>
  );
}
