'use client';

import AiBriefPanel from '@/components/AiBriefPanel';
import { AmbientSurface } from '@/components/cockpit/AmbientSurface';

export default function HomeIntentSection() {
  return (
    <AmbientSurface mode="home" mesh="section" className="p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm"
          style={{ color: 'var(--hybrid)', boxShadow: '0 0 24px -8px var(--hybrid)' }}
        >
          <span
            className="material-symbols-outlined text-xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            auto_awesome
          </span>
        </span>
        <div>
          <h2 className="text-base font-bold tracking-tight text-foreground">Describe your shipment</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Plain English in — we summarize constraints, then you confirm and open the right mode.
          </p>
        </div>
      </div>
      <AiBriefPanel contextMode="home" navigateOnApply={false} showRouteButton embedded />
    </AmbientSurface>
  );
}
