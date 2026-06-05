'use client';

import type { ComposedItinerary } from '@/services/api';
import { LegPreview, LegTimeline } from '@/components/hybrid/LegTimeline';
import { TemplateBadge } from '@/components/hybrid/ModeChain';
import { formatHours, formatInr, formatRisk } from '@/lib/hybrid-ui';

function StatsRow({ itinerary, large = false }: { itinerary: ComposedItinerary; large?: boolean }) {
  const items = [
    { label: 'Time', value: formatHours(itinerary.total_time_hr) },
    { label: 'Cost', value: formatInr(itinerary.total_cost_inr) },
    { label: 'Risk', value: formatRisk(itinerary.total_risk) },
  ];

  return (
    <div
      className={`grid grid-cols-3 gap-px rounded-xl border border-border/50 bg-border/30 overflow-hidden shrink-0 ${
        large ? 'min-w-[220px]' : 'min-w-[180px]'
      }`}
    >
      {items.map(({ label, value }) => (
        <div
          key={label}
          className={`bg-surface/80 text-center ${large ? 'px-3 py-2.5' : 'px-2 py-2'}`}
        >
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div
            className={`font-semibold font-mono text-on-surface mt-0.5 ${
              large ? 'text-base' : 'text-sm'
            }`}
          >
            {value}
          </div>
        </div>
      ))}
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
  /** full = hero card, alt = other options, mini = thinnest row */
  variant?: 'full' | 'alt' | 'mini';
}) {
  if (variant === 'mini') {
    return (
      <div className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg border border-border/40 bg-surface/30">
        <TemplateBadge itinerary={itinerary} size="sm" />
        <div className="flex gap-3 text-xs font-mono text-muted-foreground shrink-0">
          <span>{formatHours(itinerary.total_time_hr)}</span>
          <span>{formatInr(itinerary.total_cost_inr)}</span>
        </div>
      </div>
    );
  }

  if (variant === 'alt') {
    return (
      <article className="rounded-xl border border-border/60 bg-surface/50 hover:border-violet-400/20 hover:bg-surface/70 transition-all p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0 flex-1">
            <TemplateBadge itinerary={itinerary} size="sm" />
            <LegPreview itinerary={itinerary} />
          </div>
          <StatsRow itinerary={itinerary} />
        </div>
      </article>
    );
  }

  // full — recommended hero
  return (
    <article
      className={`rounded-2xl border overflow-hidden ${
        recommended
          ? 'border-violet-400/30 bg-gradient-to-b from-violet-500/[0.07] to-surface/60 shadow-[0_24px_64px_-32px_rgba(139,92,246,0.45)]'
          : 'border-border/60 bg-surface/50'
      }`}
    >
      <div className="px-5 sm:px-6 py-5 sm:py-6">
        {recommended && (
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex h-6 items-center rounded-full bg-violet-500/20 border border-violet-400/30 px-2.5 text-[10px] font-bold uppercase tracking-widest text-violet-200">
              Best route
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <TemplateBadge itinerary={itinerary} size="md" />
          <StatsRow itinerary={itinerary} large />
        </div>

        <LegTimeline itinerary={itinerary} rich />
      </div>
    </article>
  );
}
