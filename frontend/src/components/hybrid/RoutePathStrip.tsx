'use client';

import type { ComposedItinerary } from '@/services/api';
import { buildRoutePath, changeoverCount, templateSlug, type RoutePathNode } from '@/lib/hybrid-ui';

function PlaceNode({
  name,
  role,
  compact,
}: {
  name: string;
  role: 'origin' | 'changeover' | 'destination';
  compact?: boolean;
}) {
  const isChangeover = role === 'changeover';
  const isDest = role === 'destination';

  return (
    <div className="flex flex-col items-center shrink-0 max-w-[7.5rem] sm:max-w-[9rem]">
      <span
        className={`inline-flex items-center justify-center rounded-lg border text-center leading-tight font-semibold text-on-surface ${
          compact ? 'px-2 py-1 text-[11px] min-h-[2rem]' : 'px-2.5 py-1.5 text-xs sm:text-sm min-h-[2.25rem]'
        } ${
          isChangeover
            ? 'border-amber-400/45 bg-amber-500/10 text-amber-50 shadow-[0_0_0_1px_rgba(251,191,36,0.15)]'
            : isDest
              ? 'border-violet-400/35 bg-violet-500/10 text-violet-50'
              : 'border-white/10 bg-white/[0.04]'
        }`}
        title={isChangeover ? `${name} — changeover` : name}
      >
        <span className="line-clamp-2">{name}</span>
      </span>
      {isChangeover && !compact && (
        <span className="mt-1 text-[9px] font-bold uppercase tracking-wider text-amber-200/80">
          Change
        </span>
      )}
    </div>
  );
}

function LegConnector({
  label,
  icon,
  compact,
}: {
  label: string;
  icon: string;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col items-center shrink-0 px-0.5 sm:px-1">
      <div className="flex items-center gap-0.5 text-muted-foreground/50">
        <span className={`h-px bg-gradient-to-r from-transparent via-border to-transparent ${compact ? 'w-3' : 'w-5 sm:w-8'}`} />
      </div>
      <div
        className={`flex items-center gap-1 rounded-md border border-white/8 bg-black/20 text-on-surface-variant ${
          compact ? 'px-1.5 py-0.5 mt-0.5' : 'px-2 py-1 mt-1'
        }`}
      >
        <span
          className="material-symbols-outlined text-primary/90"
          style={{ fontSize: compact ? 14 : 16 }}
          aria-hidden
        >
          {icon}
        </span>
        <span className={`font-medium text-on-surface-variant ${compact ? 'text-[10px]' : 'text-[11px] sm:text-xs'}`}>
          {label}
        </span>
      </div>
      <div className="flex items-center gap-0.5 text-muted-foreground/50">
        <span className={`h-px bg-gradient-to-r from-transparent via-border to-transparent ${compact ? 'w-3' : 'w-5 sm:w-8'}`} />
      </div>
    </div>
  );
}

/**
 * Full corridor path from all legs — every changeover city (Bhusaval, Prayagraj, …).
 */
export function RoutePathStrip({
  itinerary,
  compact = false,
}: {
  itinerary: ComposedItinerary;
  compact?: boolean;
}) {
  const nodes = buildRoutePath(itinerary);
  if (!nodes.length) return null;

  const changes = changeoverCount(itinerary);
  const slug = templateSlug(itinerary);

  return (
    <div className="min-w-0">
      <div
        className={`overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin scrollbar-thumb-white/10 ${
          compact ? '' : 'sm:overflow-visible'
        }`}
      >
        <div className="flex items-center gap-0.5 sm:gap-1 min-w-max sm:min-w-0 sm:flex-wrap">
          {nodes.map((node, i) => {
            if (node.kind === 'place') {
              return (
                <PlaceNode
                  key={`p-${i}-${node.name}`}
                  name={node.name}
                  role={node.role}
                  compact={compact}
                />
              );
            }
            return (
              <LegConnector
                key={`l-${i}-${node.mode}`}
                label={node.label}
                icon={node.icon}
                compact={compact}
              />
            );
          })}
        </div>
      </div>
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 ${compact ? 'mt-1.5' : ''}`}>
        <span className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-wide">
          {slug.replace(/\+/g, ' · ')}
        </span>
        {changes > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {changes} changeover{changes === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>
  );
}

/** @deprecated use RoutePathStrip */
export function TemplateBadge({
  itinerary,
  size = 'md',
}: {
  itinerary: ComposedItinerary;
  size?: 'sm' | 'md';
}) {
  return <RoutePathStrip itinerary={itinerary} compact={size === 'sm'} />;
}

/** @deprecated use RoutePathStrip */
export function ModeChain({
  itinerary,
  size = 'md',
}: {
  itinerary: ComposedItinerary;
  size?: 'sm' | 'md';
}) {
  return <RoutePathStrip itinerary={itinerary} compact={size === 'sm'} />;
}
