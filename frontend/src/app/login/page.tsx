import { PublicRoute } from '@/components/auth/ProtectedRoute';
import { LoginPage } from '@/components/auth/LoginPage';
import { getGoogleClientId } from '@/lib/google-auth';

export default function Login() {
  return (
    <PublicRoute>
      <LoginPage googleClientId={getGoogleClientId()} />
    </PublicRoute>
  );
}
