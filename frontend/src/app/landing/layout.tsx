import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Landing',
  description: 'Welcome to LogiFlow — AI-powered multimodal freight planning and optimization for India.',
  path: '/landing',
});

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
