import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Dashboard } from '@/components/auth/Dashboard';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}
