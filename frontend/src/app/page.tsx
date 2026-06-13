
import HomeIntentSection from '@/components/HomeIntentSection';
import { HomePage as HomePageView } from '@/components/cockpit/HomePage';
import { HomeTutorialGuide } from '@/components/home/HomeTutorialGuide';

export default function Home() {
  return (
    <>
      <HomePageView intentSection={<HomeIntentSection />} />
      <HomeTutorialGuide />
    </>
  );
}
