import { Suspense } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ReportsPage } from '@/components/planner/ReportsPage';

export const metadata = {
  title: 'My Plans — LogiFlow',
  description: 'View and manage your saved shipment plans',
};

export default function ReportsRoute() {
  return (
    <ProtectedRoute>
      <Suspense fallback={null}>
        <ReportsPage />
      </Suspense>
    </ProtectedRoute>
  );
}
