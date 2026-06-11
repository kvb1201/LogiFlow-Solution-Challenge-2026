import { pipelinePageMetadata } from '@/lib/seo';

export const metadata = pipelinePageMetadata('water');

export default function WaterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
