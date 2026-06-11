import { PublicRoute } from '@/components/auth/ProtectedRoute';
import { LoginPage } from '@/components/auth/LoginPage';
import { getGoogleClientId } from '@/lib/google-auth';

/** Read GOOGLE_CLIENT_ID at request time (not static build). */
export const dynamic = 'force-dynamic';

export default function Login() {
  return (
    <PublicRoute>
      <LoginPage googleClientId={getGoogleClientId()} />
    </PublicRoute>
  );
}
