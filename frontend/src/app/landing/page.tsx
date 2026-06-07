import { PublicRoute } from '@/components/auth/ProtectedRoute';
import { LandingPage } from '@/components/auth/LandingPage';

export default function Landing() {
  return (
    <PublicRoute>
      <LandingPage />
    </PublicRoute>
  );
}
