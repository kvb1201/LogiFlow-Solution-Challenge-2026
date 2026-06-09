import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Landing — LogiFlow',
  description: 'Welcome to LogiFlow - AI-Powered Logistics Planning & Optimization Platform',
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
