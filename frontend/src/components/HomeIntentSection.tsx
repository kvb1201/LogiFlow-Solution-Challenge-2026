'use client';

import AiBriefPanel from '@/components/AiBriefPanel';

export default function HomeIntentSection() {
  return (
    <div className="pipeline-card overflow-hidden">
      <div
        aria-hidden
        className="h-px w-full"
        style={{
          background:
            'linear-gradient(90deg, transparent, var(--hybrid), var(--comparator), transparent)',
        }}
      />
      <div className="p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/40"
            style={{ color: 'var(--hybrid)' }}
          >
            <span
              className="material-symbols-outlined text-xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              auto_awesome
            </span>
          </span>
          <div>
            <h2 className="text-base font-bold text-foreground tracking-tight">Describe your shipment</h2>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              Plain English in — we summarize constraints, then you confirm and open the right mode.
            </p>
          </div>
        </div>
        <AiBriefPanel
          contextMode="home"
          navigateOnApply={false}
          showRouteButton
          embedded
        />
      </div>
    </div>
  );
}
