'use client';

import type { ComposedItinerary } from '@/services/api';
import { RoutePathStrip } from '@/components/hybrid/RoutePathStrip';
import { LegTimeline } from '@/components/hybrid/LegTimeline';
import {
  changeoverCount,
  corridorEndpointLabel,
  formatHours,
  formatInr,
  formatRisk,
  templateSlug,
} from '@/lib/hybrid-ui';

function StatsRow({ itinerary, hero = false }: { itinerary: ComposedItinerary; hero?: boolean }) {
  const items = [
    { label: 'Total time', value: formatHours(itinerary.total_time_hr), icon: 'schedule' },
    { label: 'Est. cost', value: formatInr(itinerary.total_cost_inr), icon: 'payments' },
    { label: 'Risk', value: formatRisk(itinerary.total_risk), icon: 'shield' },
  ];

  return (
    <div className={`grid grid-cols-3 gap-3 shrink-0 ${hero ? 'w-full sm:w-auto sm:min-w-[280px]' : 'min-w-[200px]'}`}>
      {items.map(({ label, value, icon }) => (
        <div
          key={label}
          className={`rounded-xl border border-white/[0.08] bg-black/20 text-center ${
            hero ? 'px-3 py-3' : 'px-2 py-2'
          }`}
        >
          <span className="material-symbols-outlined text-[14px] text-muted-foreground mb-1" aria-hidden>
            {icon}
          </span>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={`font-semibold font-mono text-on-surface mt-0.5 ${hero ? 'text-lg' : 'text-sm'}`}>
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
  variant?: 'full' | 'alt' | 'mini';
}) {
  if (variant === 'mini') {
    return (
      <div className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg border border-border/40 bg-surface/30">
        <RoutePathStrip itinerary={itinerary} compact />
        <div className="flex gap-3 text-xs font-mono text-muted-foreground shrink-0">
          <span>{formatHours(itinerary.total_time_hr)}</span>
          <span>{formatInr(itinerary.total_cost_inr)}</span>
        </div>
      </div>
    );
  }

  if (variant === 'alt') {
    return (
      <article className="rounded-xl border border-white/[0.08] bg-[#0a0d14]/80 hover:border-violet-400/20 transition-colors overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-white/[0.06] bg-white/[0.02]">
          <RoutePathStrip itinerary={itinerary} compact />
        </div>
        <div className="px-4 sm:px-5 py-4 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0 flex-1">
            <LegTimeline itinerary={itinerary} rich={false} />
          </div>
          <StatsRow itinerary={itinerary} />
        </div>
      </article>
    );
  }

  const endpoint = corridorEndpointLabel(itinerary);
  const changes = changeoverCount(itinerary);

  return (
    <article
      className={`rounded-2xl border overflow-hidden ${
        recommended
          ? 'border-violet-400/25 bg-gradient-to-b from-[#12101f] via-[#0c0e16] to-[#080a10] shadow-[0_32px_80px_-40px_rgba(139,92,246,0.35)]'
          : 'border-white/10 bg-[#0a0d14]'
      }`}
    >
      {/* Corridor header */}
      <div className="px-5 sm:px-7 pt-5 sm:pt-6 pb-4 border-b border-white/[0.06]">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {recommended && (
            <span className="inline-flex h-6 items-center rounded-md bg-violet-500/20 border border-violet-400/30 px-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-100">
              Recommended
            </span>
          )}
          {changes > 0 && (
            <span className="inline-flex h-6 items-center rounded-md bg-amber-500/10 border border-amber-400/25 px-2.5 text-[10px] font-semibold text-amber-100/90">
              {changes} changeover{changes === 1 ? '' : 's'}
            </span>
          )}
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide ml-auto">
            {templateSlug(itinerary).replace(/\+/g, ' · ')}
          </span>
        </div>

        {endpoint && (
          <h2 className="text-lg sm:text-xl font-bold text-on-surface tracking-tight mb-4">
            {endpoint}
          </h2>
        )}

        <RoutePathStrip itinerary={itinerary} />
      </div>

      {/* Stats */}
      <div className="px-5 sm:px-7 py-4 border-b border-white/[0.06] bg-black/15">
        <StatsRow itinerary={itinerary} hero />
      </div>

      {/* Step-by-step */}
      <div className="px-5 sm:px-7 py-5 sm:py-6">
        <LegTimeline itinerary={itinerary} rich />
      </div>
    </article>
  );
}
