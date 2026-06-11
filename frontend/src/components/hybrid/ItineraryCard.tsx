'use client';

import type { ComposedItinerary } from '@/services/api';
import { RoutePathStrip } from '@/components/hybrid/RoutePathStrip';
import { LegTimeline } from '@/components/hybrid/LegTimeline';
import {
  changeoverCount,
  formatHours,
  formatInr,
  formatRisk,
  templateSlug,
} from '@/lib/hybrid-ui';

function InlineStats({ itinerary }: { itinerary: ComposedItinerary }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-sm shrink-0">
      <span className="text-on-surface font-semibold">{formatHours(itinerary.total_time_hr)}</span>
      <span className="text-muted-foreground/40">·</span>
      <span className="text-on-surface font-semibold">{formatInr(itinerary.total_cost_inr)}</span>
      <span className="text-muted-foreground/40">·</span>
      <span className="text-muted-foreground">{formatRisk(itinerary.total_risk)} risk</span>
    </div>
  );
}

export function ItineraryCard({
  itinerary,
  recommended = false,
  variant = 'full',
}: {
  itinerary: ComposedItinerary;
  recommended?: boolean;
  variant?: 'full' | 'alt' | 'mini';
}) {
  const slug = templateSlug(itinerary).replace(/\+/g, ' · ');
  const changes = changeoverCount(itinerary);

  if (variant === 'mini') {
    return (
      <div className="flex items-center justify-between gap-3 py-2.5 px-4 rounded-lg border border-border/40 bg-surface/20">
        <RoutePathStrip itinerary={itinerary} inline />
        <InlineStats itinerary={itinerary} />
      </div>
    );
  }

  const isAlt = variant === 'alt';

  return (
    <article
      className={`group relative overflow-hidden rounded-xl border transition-colors ${
        recommended
          ? 'border-[color-mix(in_oklab,var(--hybrid)_28%,var(--border))] bg-surface/30'
          : 'border-border/50 bg-surface/20 hover:bg-surface/30'
      }`}
    >
      <div className="relative z-10 px-4 sm:px-5 py-3 border-b border-border/30 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {recommended && (
            <span
              className="shrink-0 text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded"
              style={{
                color: 'var(--hybrid)',
                background: 'color-mix(in oklab, var(--hybrid) 10%, transparent)',
              }}
            >
              Best
            </span>
          )}
          <span className="text-xs font-mono text-muted-foreground truncate">{slug}</span>
          {changes > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">
              {changes}× change
            </span>
          )}
        </div>
        <InlineStats itinerary={itinerary} />
      </div>

      <div className="relative z-10 px-4 sm:px-5 py-2.5 border-b border-border/20">
        <RoutePathStrip itinerary={itinerary} inline />
      </div>

      <div className={`relative z-10 px-4 sm:px-5 ${isAlt ? 'py-3' : 'py-3.5'}`}>
        <LegTimeline itinerary={itinerary} rich showLabel={!isAlt} />
      </div>
    </article>
  );
}
