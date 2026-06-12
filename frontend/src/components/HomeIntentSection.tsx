'use client';

import AiBriefPanel from '@/components/AiBriefPanel';
import { WorkspacePanel } from '@/components/cockpit/WorkspacePanel';

const AI_ICON = (
  <span
    className="flex h-11 w-11 items-center justify-center rounded-full border border-border/40 bg-background/50 backdrop-blur-sm"
    style={{ color: 'var(--hybrid)', boxShadow: '0 0 24px -10px var(--hybrid)' }}
  >
    <span
      className="material-symbols-outlined text-xl"
      style={{ fontVariationSettings: "'FILL' 1" }}
    >
      auto_awesome
    </span>
  </span>
);

export default function HomeIntentSection() {
  return (
    <WorkspacePanel
      eyebrow="AI entry point"
      title="Describe your shipment"
      subtitle="Plain English in — we summarize constraints, then you confirm and open the right mode."
      icon={AI_ICON}
      bodyClassName="min-h-0"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <AiBriefPanel contextMode="home" navigateOnApply showRouteButton embedded />
      </div>
    </WorkspacePanel>
  );
}
