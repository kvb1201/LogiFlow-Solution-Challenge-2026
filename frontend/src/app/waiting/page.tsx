import { WaitingRoomFromSearchParams } from '@/components/waiting/WaitingRoom';
import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Traffic Queue',
  description: 'Your route request is queued. LogiFlow will resume automatically when capacity is available.',
  path: '/waiting',
  noIndex: true,
});

export default async function WaitingPage({
  searchParams,
}: {
  searchParams: Promise<{
    reason?: string;
    retry?: string;
    return?: string;
    mode?: string;
    corridor?: string;
  }>;
}) {
  const params = await searchParams;
  return <WaitingRoomFromSearchParams searchParams={params} />;
}
