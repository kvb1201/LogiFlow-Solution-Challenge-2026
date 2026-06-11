'use client';

import type { ComposedItinerary } from '@/services/api';
import { buildRoutePath, changeoverCount, templateSlug } from '@/lib/hybrid-ui';

/** Inline corridor stepper — no heavy container. */
export function RoutePathStrip({
  itinerary,
  compact = false,
  inline = false,
}: {
  itinerary: ComposedItinerary;
  compact?: boolean;
  inline?: boolean;
}) {
  const nodes = buildRoutePath(itinerary);
  if (!nodes.length) return null;

  const changes = changeoverCount(itinerary);
  const slug = templateSlug(itinerary);

  const pathRow = (
    <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-border/30">
      <div className="flex min-w-max items-center gap-1">
        {nodes.map((node, i) => {
          if (node.kind === 'place') {
            const isChangeover = node.role === 'changeover';
            return (
              <div key={`p-${i}-${node.name}`} className="flex items-center shrink-0">
                <span
                  className={`font-semibold text-on-surface whitespace-nowrap ${
                    compact ? 'text-xs' : 'text-sm'
                  } ${isChangeover ? 'text-muted-foreground' : ''}`}
                  title={isChangeover ? `${node.name} — changeover` : node.name}
                >
                  {node.name}
                </span>
              </div>
            );
          }

          const m = node;
          return (
            <div
              key={`l-${i}-${m.mode}`}
              className="flex items-center shrink-0 px-1 text-muted-foreground"
            >
              <span className="text-muted-foreground/40 mx-0.5 text-sm" aria-hidden>
                →
              </span>
              <span
                className="material-symbols-outlined mx-0.5"
                style={{ fontSize: compact ? 14 : 16 }}
                aria-hidden
              >
                {m.icon}
              </span>
              <span className={`font-medium ${compact ? 'text-xs' : 'text-sm'}`}>{m.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (inline) return pathRow;

  return (
    <div className="min-w-0 w-full">
      <div
        className={
          compact
            ? 'py-1'
            : 'rounded-lg border border-border/40 bg-surface/30 px-4 py-2.5'
        }
      >
        {pathRow}
      </div>
      {!compact && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-2 text-xs text-muted-foreground">
          <span className="font-mono">{slug.replace(/\+/g, ' · ')}</span>
          {changes > 0 && (
            <span>
              · {changes} changeover{changes === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}
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
  return <RoutePathStrip itinerary={itinerary} compact={size === 'sm'} inline={size === 'sm'} />;
}

/** @deprecated use RoutePathStrip */
export function ModeChain({
  itinerary,
  size = 'md',
}: {
  itinerary: ComposedItinerary;
  size?: 'sm' | 'md';
}) {
  return <RoutePathStrip itinerary={itinerary} compact={size === 'sm'} inline={size === 'sm'} />;
}
