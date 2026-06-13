import { pipelinePageMetadata } from '@/lib/seo';

export const metadata = pipelinePageMetadata('road');

export default function RoadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
