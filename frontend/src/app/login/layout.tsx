import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login — LogiFlow',
  description: 'Sign in to your LogiFlow account',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
