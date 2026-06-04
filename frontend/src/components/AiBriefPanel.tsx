'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { setShipmentAutorun } from '@/lib/shipmentAutorun';

type ContextMode = 'home' | 'rail' | 'road' | 'air' | 'water' | 'hybrid';

const MODE_ROUTES: Record<string, string> = {
  home: '/hybrid',
  rail: '/railway',
  road: '/road',
  air: '/air',
  water: '/water',
  hybrid: '/hybrid',
};

function targetRoute(contextMode: ContextMode): string {
  return MODE_ROUTES[contextMode] ?? '/hybrid';
}

function autorunKey(contextMode: ContextMode): string {
  if (contextMode === 'home') return 'hybrid';
  return contextMode;
}

export default function AiBriefPanel({
  contextMode = 'home',
  navigateOnApply = true,
  showRouteButton = false,
  className = '',
}: {
  contextMode?: ContextMode;
  navigateOnApply?: boolean;
  showRouteButton?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const { source, setSource, destination, setDestination } = useLogiFlowStore();
  const [brief, setBrief] = useState('');

  function applyLocally() {
    const text = brief.trim();
    if (!text) return;
    const fromMatch = text.match(/\bfrom\s+([^,.\n]+)/i);
    const toMatch = text.match(/\bto\s+([^,.\n]+)/i);
    if (fromMatch) setSource(fromMatch[1].trim());
    if (toMatch) setDestination(toMatch[1].trim());
  }

  function goToMode(autorun: boolean) {
    applyLocally();
    const route = targetRoute(contextMode);
    const key = autorunKey(contextMode);
    if (autorun) setShipmentAutorun(key);
    if (navigateOnApply) router.push(route);
  }

  return (
    <div
      className={`rounded-xl border border-outline-variant/15 bg-surface-container-low/40 p-4 ${className}`}
    >
      <p className="mb-2 text-xs text-on-surface-variant">
        Describe your shipment in plain English (optional). We extract origin/destination when possible.
      </p>
      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={3}
        placeholder="e.g. 500 kg general cargo from Delhi to Mumbai, need it in 2 days…"
        className="w-full resize-y rounded-lg border border-outline-variant/20 bg-surface-container-lowest/50 px-3 py-2 text-sm text-on-surface"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => applyLocally()}
          className="rounded-lg border border-outline-variant/25 px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container/60"
        >
          Apply to form
        </button>
        {showRouteButton && (
          <>
            <button
              type="button"
              onClick={() => goToMode(true)}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary"
            >
              Route &amp; run
            </button>
            <button
              type="button"
              onClick={() => goToMode(false)}
              className="rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-semibold text-primary"
            >
              Edit in mode
            </button>
          </>
        )}
      </div>
      {(source || destination) && (
        <p className="mt-2 text-[10px] text-outline">
          Current: {source || '—'} → {destination || '—'}
        </p>
      )}
    </div>
  );
}
