import { pipelinePageMetadata } from '@/lib/seo';

export const metadata = pipelinePageMetadata('comparator');

export default function ComparatorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
