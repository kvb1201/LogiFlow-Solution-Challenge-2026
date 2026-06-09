

import HomeIntentSection from '@/components/HomeIntentSection';
import { HomePage as HomePageView } from '@/components/cockpit/HomePage';

export default function Home() {
  return <HomePageView intentSection={<HomeIntentSection />} />;
}
