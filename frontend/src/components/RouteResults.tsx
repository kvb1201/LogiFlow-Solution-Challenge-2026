'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import { useLogiFlowStore, type RoadRoute } from '@/store/useLogiFlowStore';

const MapView = dynamic(() => import('@/components/Mapview'), { ssr: false });

function RouteCard({
  route,
  index,
  isSelected,
  onSelect,
}: {
  route: RoadRoute;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const factors = Array.isArray(route.key_factors) ? route.key_factors : [];
  const hasCheapest = factors.some((f) => /cost|cheaper/i.test(f));
  const hasFastest = factors.some((f) => /fast|faster/i.test(f));
  const hasSafest = factors.some((f) => /safe|safer|risk/i.test(f));

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'w-full text-left p-4 rounded-xl border transition-all duration-200',
        'bg-surface-container-lowest/30 hover:bg-surface-container/40',
        isSelected
          ? 'border-primary/50 bg-primary/10 shadow-[0_0_0_1px_rgba(47,129,247,0.25)]'
          : 'border-outline-variant/10 hover:border-outline-variant/25',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={[
              'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold mono shrink-0',
              isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container text-outline',
            ].join(' ')}
          >
            {index + 1}
          </span>
          <div className="min-w-0">
            <div className="text-xs font-label font-bold uppercase tracking-widest text-on-surface-variant">
              Route {index + 1}
            </div>
            {isSelected && (
              <div className="text-[10px] text-primary mono">Selected</div>
            )}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-sm font-bold mono text-primary">₹{Number(route.cost).toLocaleString()}</div>
          <div className="text-[10px] text-on-surface-variant mono">{Number(route.time).toFixed(1)}h</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px] mono">
        <div className="bg-surface-container-low/50 px-2 py-1.5 rounded-lg text-center">
          <div className="text-outline mb-0.5">TIME</div>
          <div className="text-on-surface font-medium">{Number(route.time).toFixed(1)}h</div>
        </div>
        <div className="bg-surface-container-low/50 px-2 py-1.5 rounded-lg text-center">
          <div className="text-outline mb-0.5">COST</div>
          <div className="text-on-surface font-medium">₹{Number(route.cost).toLocaleString()}</div>
        </div>
        <div className="bg-surface-container-low/50 px-2 py-1.5 rounded-lg text-center">
          <div className="text-outline mb-0.5">RISK</div>
          <div className="text-on-surface font-medium">{Math.round(Number(route.risk) * 100)}%</div>
        </div>
      </div>

      {(route.reason || factors.length > 0) && (
        <div className="mt-3 pt-3 border-t border-outline-variant/10">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label">
              Why this route?
            </div>
            {hasCheapest && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Cheapest</span>
            )}
            {hasFastest && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">Fastest</span>
            )}
            {hasSafest && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">Safest</span>
            )}
          </div>
          {route.reason && (
            <div className="text-[11px] text-on-surface mb-1.5">{route.reason}</div>
          )}
          {factors.length > 0 && (
            <ul className="text-[11px] text-on-surface-variant space-y-1">
              {factors.map((factor, idx) => (
                <li key={`${factor}-${idx}`} className="flex items-start gap-1.5">
                  <span className="text-primary leading-4">•</span>
                  <span>{factor}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </button>
  );
}

export default function RouteResults() {
  const routes = useLogiFlowStore((s) => s.routes);
  const selectedRoute = useLogiFlowStore((s) => s.selectedRoute);
  const setSelectedRoute = useLogiFlowStore((s) => s.setSelectedRoute);

  if (!routes || routes.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-5 xl:col-span-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-label font-bold uppercase tracking-widest text-on-surface-variant">
              Routes ({routes.length})
            </div>
            <div className="text-[10px] mono text-outline">
              Click a card to focus on the map
            </div>
          </div>

          <div className="space-y-3">
            {routes.map((r, i) => (
              <RouteCard
                key={i}
                route={r}
                index={i}
                isSelected={i === selectedRoute}
                onSelect={() => setSelectedRoute(i)}
              />
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 xl:col-span-8">
          <div className="bg-surface-container-lowest/30 border border-outline-variant/10 rounded-2xl p-3 h-full">
            <div className="text-xs font-label font-bold uppercase tracking-widest text-on-surface-variant mb-2 ml-1 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">map</span>
                Map View
              </span>
              <span className="text-[10px] mono text-outline">Selected: {selectedRoute + 1}</span>
            </div>
            <MapView routes={routes} selectedRoute={selectedRoute} />
          </div>
        </div>
      </div>
    </section>
  );
}

