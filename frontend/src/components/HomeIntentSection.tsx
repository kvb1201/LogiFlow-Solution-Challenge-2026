'use client';

import { MessageSquare } from 'lucide-react';
import AiBriefPanel from '@/components/AiBriefPanel';

export default function HomeIntentSection() {
  return (
    <div className="relative rounded-2xl border border-border bg-surface/60 p-5 backdrop-blur-sm sm:p-6 form-container-glow">
      {/* Top accent line */}
      <div
        className="absolute inset-x-0 top-0 h-px rounded-t-2xl"
        style={{
          background:
            'linear-gradient(90deg, transparent, color-mix(in oklab, var(--hybrid) 35%, transparent) 50%, transparent)',
        }}
      />

      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-hybrid/30 bg-hybrid/10">
          <MessageSquare className="h-3.5 w-3.5 text-hybrid" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Describe your shipment</h2>
          <p className="text-[11px] text-muted-foreground">
            Plain English in — we parse constraints and route you to the right tool.
          </p>
        </div>
      </div>

      <AiBriefPanel
        contextMode="home"
        navigateOnApply={false}
        showRouteButton
        className="border-0 bg-transparent p-0 shadow-none"
      />
    </div>
  );
}
