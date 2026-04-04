'use client';

import dynamic from 'next/dynamic';
import React, { useState } from 'react';
import { useLogiFlowStore, type RoadRoute } from '@/store/useLogiFlowStore';

const MapView = dynamic(() => import('@/components/Mapview'), { ssr: false });

function formatCurrency(val: unknown) {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('en-IN').format(Math.round(n));
}

function RouteCard({
  route,
  index,
  isSelected,
  onSelect,
  isCheapest,
  isFastest,
  isSafest,
}: {
  route: RoadRoute;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  isCheapest: boolean;
  isFastest: boolean;
  isSafest: boolean;
}) {
  const factors = Array.isArray(route.key_factors) ? route.key_factors : [];
  const ml = route.ml_summary;
  const isBest = index === 0;
  const [showBreakdown, setShowBreakdown] = useState(false);
  const breakdown = route.cost_breakdown;

  return (
    <div
      onClick={onSelect}
      className={[
        'w-full text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer',
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
            {isBest && (
              <div className="text-[10px] text-emerald-300 mono">Recommended (Best Trade-off)</div>
            )}
            {isSelected && (
              <div className="text-[10px] text-primary mono">Selected</div>
            )}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-sm font-bold mono text-primary">₹{formatCurrency(route.cost)}</div>
          <div className="text-[10px] text-on-surface-variant mono">{Number(route.time).toFixed(1)}h</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-[10px] mono">
        <div className="bg-surface-container-low/50 px-2 py-1.5 rounded-lg text-center">
          <div className="text-outline mb-0.5">TIME</div>
          <div className="text-on-surface font-medium">{Number(route.time).toFixed(1)}h</div>
        </div>
        <div className="bg-surface-container-low/50 px-2 py-1.5 rounded-lg text-center">
          <div className="text-outline mb-0.5">COST</div>
          <div className="text-on-surface font-medium">₹{formatCurrency(route.cost)}</div>
        </div>
        <div className="bg-surface-container-low/50 px-2 py-1.5 rounded-lg text-center">
          <div className="text-outline mb-0.5">RISK</div>
          <div className="text-on-surface font-medium">{Math.round(Number(route.risk) * 100)}%</div>
        </div>
        <div className="bg-surface-container-low/50 px-2 py-1.5 rounded-lg text-center">
          <div className="text-outline mb-0.5">DISTANCE</div>
          <div className="text-on-surface font-medium">{Number(route.distance_km ?? 0).toFixed(1)} km</div>
        </div>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowBreakdown((v) => !v);
          }}
          className="text-[11px] text-on-surface-variant hover:text-on-surface transition-colors"
        >
          {showBreakdown ? 'Hide breakdown' : 'Show breakdown'}
        </button>

        {showBreakdown && (
          <div className="mt-2 text-[12px] text-on-surface-variant">
            <p className="font-semibold text-on-surface mb-1">Cost Breakdown</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <p className="flex items-center justify-between gap-2">
                <span>Fuel</span>
                <span className="mono text-on-surface">₹{formatCurrency(breakdown?.fuel)}</span>
              </p>
              <p className="flex items-center justify-between gap-2">
                <span>Driver</span>
                <span className="mono text-on-surface">₹{formatCurrency(breakdown?.driver)}</span>
              </p>
              <p className="flex items-center justify-between gap-2">
                <span>Toll</span>
                <span className="mono text-on-surface">₹{formatCurrency(breakdown?.toll)}</span>
              </p>
              <p className="flex items-center justify-between gap-2">
                <span>Weight</span>
                <span className="mono text-on-surface">₹{formatCurrency(breakdown?.weight)}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {ml && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] mono">
          <div className="px-2 py-1.5 rounded-lg bg-surface-container-low/50">
            <div className="text-outline mb-0.5">TRAFFIC</div>
            <span
              className={[
                'px-1.5 py-0.5 rounded font-semibold',
                ml.traffic === 'high'
                  ? 'bg-red-500/20 text-red-300'
                  : ml.traffic === 'moderate'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-emerald-500/20 text-emerald-300',
              ].join(' ')}
            >
              {ml.traffic.toUpperCase()}
            </span>
          </div>
          <div className="px-2 py-1.5 rounded-lg bg-surface-container-low/50">
            <div className="text-outline mb-0.5">WEATHER</div>
            <span
              className={[
                'px-1.5 py-0.5 rounded font-semibold',
                ml.weather === 'bad'
                  ? 'bg-red-500/20 text-red-300'
                  : ml.weather === 'moderate'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-emerald-500/20 text-emerald-300',
              ].join(' ')}
            >
              {ml.weather.toUpperCase()}
            </span>
          </div>
          <div className="px-2 py-1.5 rounded-lg bg-surface-container-low/50">
            <div className="text-outline mb-0.5">DELAY</div>
            <div className="text-on-surface font-medium">
              {ml.delay_hours > 0.05 ? `+${ml.delay_hours.toFixed(1)}h` : 'On time'}
            </div>
          </div>
        </div>
      )}

      {(route.reason || factors.length > 0) && (
        <div className="mt-3 pt-3 border-t border-outline-variant/10">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label">
              Why this route?
            </div>
            {isCheapest && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Cheapest</span>
            )}
            {isFastest && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">Fastest</span>
            )}
            {isSafest && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">Safest</span>
            )}
          </div>
          {route.reason && (
            <div className="text-[11px] text-on-surface mb-1.5 font-medium">{route.reason}</div>
          )}
          {factors.length > 0 && (
            <ul className="text-[11px] text-on-surface-variant space-y-1">
              {factors.map((factor, idx) => (
                <li key={`${factor}-${idx}`} className="flex items-start gap-1.5">
                  <span className="text-primary leading-4">•</span>
                  <span className={idx === 0 ? 'font-semibold text-on-surface' : ''}>{factor}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function RouteResults() {
  const routes = useLogiFlowStore((s) => s.routes);
  const selectedRoute = useLogiFlowStore((s) => s.selectedRoute);
  const setSelectedRoute = useLogiFlowStore((s) => s.setSelectedRoute);

  if (!routes || routes.length === 0) return null;

  const minCost = Math.min(...routes.map((r) => Number(r.cost)));
  const minTime = Math.min(...routes.map((r) => Number(r.time)));
  const minRisk = Math.min(...routes.map((r) => Number(r.risk)));

  return (
    <section className="mt-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-1 max-h-[80vh] overflow-y-auto overflow-x-hidden scroll-smooth space-y-4 pr-2 overscroll-y-contain [scrollbar-gutter:stable]">
          <div className="flex items-center justify-between shrink-0">
            <div className="text-xs font-label font-bold uppercase tracking-widest text-on-surface-variant">
              Routes ({routes.length})
            </div>
            <div className="text-[10px] mono text-outline">Scroll · click to focus map</div>
          </div>

          {routes.map((r, i) => {
            const best = routes[0];
            let worseBy: string | null = null;
            if (i > 0 && best) {
              const costDiff = Number(r.cost) - Number(best.cost);
              const timeDiff = Number(r.time) - Number(best.time);
              const riskDiff = (Number(r.risk) - Number(best.risk)) * 100;
              const parts: string[] = [];
              if (costDiff > 0) parts.push(`+₹${Math.round(costDiff)}`);
              if (timeDiff > 0.1) parts.push(`+${timeDiff.toFixed(1)}h`);
              if (riskDiff > 1) parts.push(`+${Math.round(riskDiff)}% risk`);
              if (parts.length) worseBy = parts.join(' · ');
            }
            return (
              <div key={i} className="space-y-1">
                <RouteCard
                  route={r}
                  index={i}
                  isSelected={i === selectedRoute}
                  onSelect={() => setSelectedRoute(i)}
                  isCheapest={Number(r.cost) === minCost}
                  isFastest={Number(r.time) === minTime}
                  isSafest={Number(r.risk) === minRisk}
                />
                {worseBy && (
                  <div className="text-[10px] text-on-surface-variant mono pl-1">
                    Worse than best: {worseBy}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="lg:col-span-2 lg:sticky lg:top-4 w-full min-h-[320px] h-[70vh] lg:h-[80vh]">
          <div className="flex flex-col h-full min-h-0 bg-surface-container-lowest/30 border border-outline-variant/10 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 shrink-0 pb-3 border-b border-outline-variant/10">
              <span className="text-xs font-label font-bold uppercase tracking-widest text-on-surface-variant flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">map</span>
                Map view
              </span>
              <span className="text-[10px] mono text-outline truncate">
                Selected: {selectedRoute + 1}
              </span>
            </div>
            <div className="flex-1 min-h-0 pt-3">
              <MapView routes={routes} selectedRoute={selectedRoute} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

