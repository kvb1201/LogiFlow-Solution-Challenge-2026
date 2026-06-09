import { PublicRoute } from '@/components/auth/ProtectedRoute';
import { LoginPage } from '@/components/auth/LoginPage';

export default function Login() {
  return (
    <PublicRoute>
      <LoginPage />
    </PublicRoute>
  );
}
