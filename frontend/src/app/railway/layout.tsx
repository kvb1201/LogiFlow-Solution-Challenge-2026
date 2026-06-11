import { pipelinePageMetadata } from '@/lib/seo';

export const metadata = pipelinePageMetadata('rail');

export default function RailwayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
