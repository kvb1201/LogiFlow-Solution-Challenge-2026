'use client';

import type { ComposedItinerary } from '@/services/api';
import { modeMeta, templateSlug } from '@/lib/hybrid-ui';

function ModePart({ mode, size = 'md' }: { mode: string; size?: 'sm' | 'md' }) {
  const m = modeMeta(mode);
  const dim = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const iconSize = size === 'sm' ? 15 : 17;
  return (
    <span className="inline-flex items-center gap-1 shrink-0" title={m.label}>
      <span
        className={`inline-flex items-center justify-center rounded-lg border ${dim} ${m.chip}`}
      >
        <span className="material-symbols-outlined" style={{ fontSize: iconSize }}>
          {m.icon}
        </span>
      </span>
      <span className={`font-medium lowercase ${m.tint} ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
        {mode}
      </span>
    </span>
  );
}

function CityPill({
  city,
  variant = 'default',
  size = 'md',
}: {
  city: string;
  variant?: 'default' | 'hub';
  size?: 'sm' | 'md';
}) {
  const base =
    size === 'sm'
      ? 'px-2 py-0.5 text-xs font-semibold'
      : 'px-2.5 py-1 text-sm font-semibold';

  if (variant === 'hub') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-violet-400/30 bg-violet-500/10 text-violet-100 shrink-0 ${base}`}
      >
        <span className="material-symbols-outlined text-[13px]">hub</span>
        {city}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-lg border border-border/60 bg-surface/60 text-on-surface shrink-0 ${base}`}
    >
      {city}
    </span>
  );
}

function Arrow({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      className={`text-muted-foreground/55 material-symbols-outlined shrink-0 ${
        size === 'sm' ? 'text-[15px]' : 'text-base'
      }`}
    >
      arrow_forward
    </span>
  );
}

/**
 * Route chain: Source → mode → Hub → mode → Destination
 * e.g. Kanpur → rail → Kota → rail → Surat
 */
export function TemplateBadge({
  itinerary,
  size = 'md',
}: {
  itinerary: ComposedItinerary;
  size?: 'sm' | 'md';
}) {
  const legs = itinerary.legs || [];
  if (legs.length === 0) return null;

  const source = legs[0].source;
  const dest = legs[legs.length - 1].destination;
  const hub = itinerary.hub_cities?.[0];
  const slug = templateSlug(itinerary);

  // Direct: Kanpur → rail → Surat
  if (itinerary.type === 'direct' || legs.length === 1) {
    return (
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <CityPill city={source} size={size} />
          <Arrow size={size} />
          <ModePart mode={legs[0].mode} size={size} />
          <Arrow size={size} />
          <CityPill city={dest} size={size} />
        </div>
        <span
          className={`font-mono text-muted-foreground/80 ${size === 'sm' ? 'text-[10px]' : 'text-xs'}`}
        >
          {slug}
        </span>
      </div>
    );
  }

  // Multimodal: Kanpur → rail → Kota → rail → Surat
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <CityPill city={source} size={size} />
        <Arrow size={size} />
        <ModePart mode={legs[0].mode} size={size} />
        {hub && (
          <>
            <Arrow size={size} />
            <CityPill city={hub} variant="hub" size={size} />
          </>
        )}
        {legs[1] && (
          <>
            <Arrow size={size} />
            <ModePart mode={legs[1].mode} size={size} />
          </>
        )}
        <Arrow size={size} />
        <CityPill city={dest} size={size} />
      </div>
      <span
        className={`font-mono text-muted-foreground/80 ${size === 'sm' ? 'text-[10px]' : 'text-xs'}`}
      >
        {slug}
      </span>
    </div>
  );
}

/** @deprecated use TemplateBadge */
export function ModeChain({
  itinerary,
  size = 'md',
}: {
  itinerary: ComposedItinerary;
  size?: 'sm' | 'md';
}) {
  return <TemplateBadge itinerary={itinerary} size={size} />;
}
