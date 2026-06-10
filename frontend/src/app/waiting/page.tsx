import type { Metadata } from 'next';
import { WaitingRoomFromSearchParams } from '@/components/waiting/WaitingRoom';

export const metadata: Metadata = {
  title: 'Traffic Queue — LogiFlow',
  description: 'Your route request is queued. LogiFlow will resume automatically when capacity is available.',
};

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
