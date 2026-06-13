import { pipelinePageMetadata } from '@/lib/seo';

export const metadata = pipelinePageMetadata('hybrid');

export default function HybridLayout({ children }: { children: React.ReactNode }) {
  return children;
}
