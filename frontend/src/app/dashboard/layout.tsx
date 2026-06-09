import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard — LogiFlow',
  description: 'Your logistics planning dashboard',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
