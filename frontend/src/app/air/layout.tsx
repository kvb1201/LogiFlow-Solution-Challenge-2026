import { pipelinePageMetadata } from '@/lib/seo';

export const metadata = pipelinePageMetadata('air');

export default function AirLayout({ children }: { children: React.ReactNode }) {
  return children;
}
