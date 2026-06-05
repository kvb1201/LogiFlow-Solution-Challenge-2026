'use client';

import AiBriefPanel from '@/components/AiBriefPanel';

export default function HomeIntentSection() {
  return (
    <section className="panel-hard scanline form-container-glow rounded-2xl p-5 sm:p-6">
      <h2 className="mb-1 text-sm font-semibold text-foreground">Describe your shipment</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Plain English in — we summarize constraints, then you confirm and open the right mode.
      </p>
      <AiBriefPanel
        contextMode="home"
        navigateOnApply={false}
        showRouteButton
        className="border-0 bg-transparent p-0 shadow-none"
      />
    </section>
  );
}
