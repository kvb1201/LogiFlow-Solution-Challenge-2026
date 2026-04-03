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

