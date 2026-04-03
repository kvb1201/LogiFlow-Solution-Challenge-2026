'use client';

import dynamic from 'next/dynamic';
import React, { useMemo, useState } from 'react';
import { useLogiFlowStore, type RoadRoute } from '@/store/useLogiFlowStore';

const MapView = dynamic(() => import('@/components/Mapview'), { ssr: false });

function formatCurrency(val: unknown) {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('en-IN').format(Math.round(n));
}

function formatCostCompact(n: number): string {
  if (!Number.isFinite(n)) return '₹0';
  const a = Math.abs(n);
  if (a >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (a >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
}

function highwayHint(route: RoadRoute): string {
  const h = route.highway_ratio;
  if (h == null || Number.isNaN(h)) return 'Mix n/a';
  if (h >= 0.72) return 'Mostly highways';
  if (h <= 0.42) return 'More local roads';
  return 'Highways + mixed';
}

function delayHrs(route: RoadRoute): number {
  const ml = route.ml_summary?.delay_hours;
  if (typeof ml === 'number' && Number.isFinite(ml)) return ml;
  const p = route.predicted_delay;
  if (typeof p === 'number' && Number.isFinite(p)) return p;
  return 0;
}

function computeConfidence(routes: RoadRoute[]): number {
  if (routes.length < 2) return 68;
  const costs = routes.map((r) => Number(r.cost));
  const times = routes.map((r) => Number(r.time));
  const risks = routes.map((r) => Number(r.risk));
  const mc = Math.max(...costs);
  const mt = Math.max(...times);
  const mr = Math.max(...risks);
  const rc = mc > 0 ? (Math.max(...costs) - Math.min(...costs)) / mc : 0;
  const rt = mt > 0 ? (Math.max(...times) - Math.min(...times)) / mt : 0;
  const rr = mr > 0 ? (Math.max(...risks) - Math.min(...risks)) / mr : 0;
  const spread = (rc + rt + rr) / 3;
  return Math.round(52 + Math.min(43, spread * 110));
}

function sanitizeInsights(reason: string | undefined, factors: string[]): string[] {
  const r0 = reason?.trim().toLowerCase() ?? '';
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of factors) {
    const t = raw.trim();
    if (!t) continue;
    const low = t.toLowerCase();
    if (seen.has(low)) continue;
    if (r0 && low === r0) continue;
    if (/^optimized for\b/i.test(t)) continue;
    seen.add(low);
    let line = t;
    if (line.length > 118) line = `${line.slice(0, 115)}…`;
    out.push(line);
  }
  return out;
}

function buildComparisonStrip(routes: RoadRoute[], index: number): string | null {
  if (routes.length < 2) return null;
  const cur = routes[index];
  const peerIdx = index + 1 < routes.length ? index + 1 : index - 1;
  const peer = routes[peerIdx];
  const parts: string[] = [];

  if (peerIdx > index) {
    const dc = Number(peer.cost) - Number(cur.cost);
    const dt = Number(peer.time) - Number(cur.time);
    const dd = delayHrs(peer) - delayHrs(cur);
    if (dc > 0) parts.push(`₹${formatCurrency(dc)} cheaper`);
    if (dt > 0.05) parts.push(`${dt.toFixed(1)} hrs faster`);
    if (dd > 0.05) parts.push(`${dd.toFixed(1)} hrs less delay`);
  } else {
    const dc = Number(cur.cost) - Number(peer.cost);
    const dt = Number(cur.time) - Number(peer.time);
    const dd = delayHrs(cur) - delayHrs(peer);
    const riskD = (Number(cur.risk) - Number(peer.risk)) * 100;
    if (dc > 0) parts.push(`₹${formatCurrency(dc)} pricier vs R${peerIdx + 1}`);
    if (dt > 0.05) parts.push(`${dt.toFixed(1)} hrs slower vs R${peerIdx + 1}`);
    if (dd > 0.05) parts.push(`${dd.toFixed(1)} hrs more delay`);
    if (riskD > 1) parts.push(`${Math.round(riskD)}% higher risk`);
  }

  return parts.length ? parts.join(' · ') : null;
}

function whyNotThisRoute(best: RoadRoute, alt: RoadRoute): string[] {
  const lines: string[] = [];
  const dt = Number(alt.time) - Number(best.time);
  const dc = Number(alt.cost) - Number(best.cost);
  const dr = (Number(alt.risk) - Number(best.risk)) * 100;
  if (dt > 0.05) lines.push(`Slower by ${dt.toFixed(1)} hrs`);
  if (dc > 0) lines.push(`More expensive by ₹${formatCurrency(dc)}`);
  if (dr > 1) lines.push(`Higher risk (+${Math.round(dr)}%)`);
  return lines;
}

function Num({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-primary mono tabular-nums">{children}</span>;
}

function RouteCard({
  route,
  index,
  isSelected,
  onSelect,
  isCheapest,
  isFastest,
  isSafest,
  source,
  destination,
  cargoKg,
  routes,
  confidence,
}: {
  route: RoadRoute;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  isCheapest: boolean;
  isFastest: boolean;
  isSafest: boolean;
  source: string;
  destination: string;
  cargoKg: number;
  routes: RoadRoute[];
  confidence: number;
}) {
  const factors = Array.isArray(route.key_factors) ? route.key_factors : [];
  const ml = route.ml_summary;
  const isBest = index === 0;
  const [showBreakdown, setShowBreakdown] = useState(false);
  const breakdown = route.cost_breakdown;
  const best = routes[0];
  const insights = sanitizeInsights(route.reason, factors);
  const comparison = buildComparisonStrip(routes, index);
  const notReasons = index > 0 && best ? whyNotThisRoute(best, route) : [];

  const dist = Number(route.distance_km ?? 0).toFixed(0);
  const tStr = Number(route.time).toFixed(1);
  const rangeStr =
    route.cost_range && Number.isFinite(route.cost_range.low)
      ? `₹${formatCurrency(route.cost_range.low)}–₹${formatCurrency(route.cost_range.high)}`
      : `₹${formatCurrency(route.cost)}`;

  const summaryText = [
    `${source.trim() || 'Origin'} → ${destination.trim() || 'Destination'}`,
    `${dist} km`,
    `${tStr} hrs`,
    rangeStr,
    `${cargoKg} kg`,
    highwayHint(route),
  ].join(' | ');

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Select route ${index + 1}`}
      aria-pressed={isSelected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={[
        'w-full text-left rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden',
        'bg-surface-container-lowest/40 hover:bg-surface-container/35',
        isSelected
          ? 'border-primary/45 ring-1 ring-primary/20 shadow-[0_0_0_1px_rgba(47,129,247,0.12)]'
          : 'border-outline-variant/15 hover:border-outline-variant/30',
      ].join(' ')}
    >
      {/* Summary bar */}
      <div className="px-4 py-3 bg-surface-container/30 border-b border-outline-variant/10">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] leading-relaxed text-on-surface-variant mono">
            <span className="text-on-surface/95">{summaryText}</span>
          </p>
          <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-md bg-surface-container-high/50 text-on-surface-variant mono border border-outline-variant/15">
            Confidence: <Num>{confidence}%</Num>
          </span>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={[
                'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold mono shrink-0',
                isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container text-outline',
              ].join(' ')}
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-label font-bold uppercase tracking-widest text-on-surface-variant">
                Route {index + 1}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {isBest && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 mono border border-emerald-500/25">
                    Top pick
                  </span>
                )}
                {isCheapest && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 mono">₹ Lowest</span>
                )}
                {isFastest && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200 mono">Fastest</span>
                )}
                {isSafest && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-200 mono">Safest</span>
                )}
                {isSelected && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary mono">On map</span>
                )}
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-base font-bold mono text-on-surface">
              <Num>₹{formatCurrency(route.cost)}</Num>
            </div>
            {route.cost_range && (
              <div className="text-[10px] text-on-surface-variant mono mt-0.5">
                <Num>
                  ₹{formatCurrency(route.cost_range.low)}–₹{formatCurrency(route.cost_range.high)}
                </Num>
              </div>
            )}
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl bg-surface-container-low/45 border border-outline-variant/10 px-3 py-2.5">
            <div className="text-[10px] text-outline mb-1 flex items-center gap-1 font-medium">
              <span aria-hidden>⏱</span> Time
            </div>
            <div className="text-sm font-bold text-on-surface mono tabular-nums">
              <Num>{Number(route.time).toFixed(1)}</Num> hrs
            </div>
          </div>
          <div className="rounded-xl bg-surface-container-low/45 border border-outline-variant/10 px-3 py-2.5">
            <div className="text-[10px] text-outline mb-1 flex items-center gap-1 font-medium">
              <span aria-hidden>💰</span> Cost
            </div>
            <div className="text-sm font-bold text-on-surface mono tabular-nums">
              <Num>₹{formatCurrency(route.cost)}</Num>
            </div>
          </div>
          <div className="rounded-xl bg-surface-container-low/45 border border-outline-variant/10 px-3 py-2.5">
            <div className="text-[10px] text-outline mb-1 flex items-center gap-1 font-medium">
              <span aria-hidden>⚠️</span> Risk
            </div>
            <div className="text-sm font-bold text-on-surface mono tabular-nums">
              <Num>{Math.round(Number(route.risk) * 100)}</Num>%
            </div>
          </div>
          <div className="rounded-xl bg-surface-container-low/45 border border-outline-variant/10 px-3 py-2.5">
            <div className="text-[10px] text-outline mb-1 flex items-center gap-1 font-medium">
              <span aria-hidden>📍</span> Distance
            </div>
            <div className="text-sm font-bold text-on-surface mono tabular-nums">
              <Num>{Number(route.distance_km ?? 0).toFixed(0)}</Num> km
            </div>
          </div>
        </div>

        {comparison && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15 text-[11px] text-on-surface-variant leading-snug">
            <span className="text-[10px] uppercase tracking-wider text-outline font-label font-semibold mr-2">Compare</span>
            <span className="mono text-on-surface/90">{comparison}</span>
          </div>
        )}

        {/* Cost breakdown */}
        <div className="mt-4 pt-3 border-t border-outline-variant/10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowBreakdown((v) => !v);
            }}
            className="flex items-center justify-between w-full text-left text-[11px] font-label font-bold uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span>Cost breakdown</span>
            <span className="mono text-primary">{showBreakdown ? '−' : '+'}</span>
          </button>

          {showBreakdown && (
            <div className="mt-3 rounded-lg border border-outline-variant/10 overflow-hidden">
              <table className="w-full text-[12px]">
                <tbody className="divide-y divide-outline-variant/10">
                  {[
                    ['Freight', breakdown?.freight],
                    ['Toll', breakdown?.toll],
                    ['Handling', breakdown?.handling],
                    ['GST (5%)', breakdown?.gst],
                    ['Documentation', breakdown?.documentation],
                  ].map(([label, val]) => (
                    <tr key={String(label)} className="bg-surface-container-lowest/20">
                      <td className="py-2 pl-3 text-on-surface-variant">{label}</td>
                      <td className="py-2 pr-3 text-right mono font-medium text-on-surface tabular-nums">
                        ₹{formatCurrency(val)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {ml && (
          <div className="mt-4 pt-3 border-t border-outline-variant/10 grid grid-cols-3 gap-2 text-[10px] mono">
            <div className="px-2.5 py-2 rounded-lg bg-surface-container-low/45 border border-outline-variant/10">
              <div className="text-outline mb-1">TRAFFIC</div>
              <span
                className={[
                  'inline-block px-1.5 py-0.5 rounded font-semibold',
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
            <div className="px-2.5 py-2 rounded-lg bg-surface-container-low/45 border border-outline-variant/10">
              <div className="text-outline mb-1">WEATHER</div>
              <span
                className={[
                  'inline-block px-1.5 py-0.5 rounded font-semibold',
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
            <div className="px-2.5 py-2 rounded-lg bg-surface-container-low/45 border border-outline-variant/10">
              <div className="text-outline mb-1">DELAY</div>
              <div className="text-on-surface font-semibold tabular-nums">
                {ml.delay_hours > 0.05 ? (
                  <>
                    +<Num>{ml.delay_hours.toFixed(1)}</Num>h
                  </>
                ) : (
                  'On time'
                )}
              </div>
            </div>
          </div>
        )}

        {notReasons.length > 0 && (
          <div className="mt-4 pt-3 border-t border-outline-variant/10">
            <div className="text-[10px] uppercase tracking-widest text-outline font-label font-bold mb-2">Why not this route?</div>
            <ul className="text-[11px] text-on-surface-variant space-y-1 mono">
              {notReasons.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-amber-400/90 shrink-0">▸</span>
                  <span className="text-on-surface/85">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(route.reason || insights.length > 0) && (
          <div className="mt-4 pt-3 border-t border-outline-variant/10">
            <div className="text-[10px] uppercase tracking-widest text-outline font-label font-bold mb-2">Route insight</div>
            {route.reason && !/^optimized for\b/i.test(route.reason.trim()) && (
              <p className="text-[11px] text-on-surface font-medium mb-2 leading-relaxed">{route.reason}</p>
            )}
            {insights.length > 0 && (
              <ul className="text-[11px] text-on-surface-variant space-y-1">
                {insights.map((factor, idx) => (
                  <li key={`${factor}-${idx}`} className="flex items-start gap-2">
                    <span className="text-primary/80 leading-4">•</span>
                    <span>{factor}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RecommendationPanel({
  routes,
  minCost,
  minTime,
  minRisk,
}: {
  routes: RoadRoute[];
  minCost: number;
  minTime: number;
  minRisk: number;
}) {
  const priority = useLogiFlowStore((s) => s.priority);

  const lines = useMemo(() => {
    const out: string[] = [];
    if (routes.length === 0) return out;

    const fastestIdx = routes.findIndex((r) => Number(r.time) === minTime);
    const cheapestIdx = routes.findIndex((r) => Number(r.cost) === minCost);
    const safestIdx = routes.findIndex((r) => Number(r.risk) === minRisk);
    const fr = fastestIdx >= 0 ? fastestIdx + 1 : 1;
    const ch = cheapestIdx >= 0 ? cheapestIdx + 1 : 1;
    const sf = safestIdx >= 0 ? safestIdx + 1 : 1;

    if (priority === 'time') {
      out.push(`Prioritize speed → Route ${fr} (${Number(routes[fastestIdx]?.time).toFixed(1)}h).`);
    } else if (priority === 'cost') {
      out.push(`Prioritize cost → Route ${ch} (₹${formatCurrency(routes[cheapestIdx]?.cost)}).`);
    } else if (priority === 'safe') {
      out.push(`Prioritize safety → Route ${sf} (lowest risk).`);
    } else {
      out.push(`Route 1 is the default ranked trade-off for this lane.`);
    }

    if (routes.length > 1) {
      if (fr === ch) {
        out.push(`Route ${fr} leads on both time and cost in this set.`);
      } else {
        out.push(`Speed → Route ${fr}; lowest spend → Route ${ch}.`);
      }
    }

    if (routes.length > 1 && priority !== 'safe' && sf !== fr && sf !== ch) {
      out.push(`Lowest risk → Route ${sf}.`);
    }

    return [...new Set(out)].slice(0, 4);
  }, [routes, minTime, minCost, minRisk, priority]);

  if (routes.length === 0) return null;

  return (
    <div className="rounded-2xl border border-outline-variant/15 bg-surface-container/25 p-4 mb-4">
      <div className="text-[10px] font-label font-bold uppercase tracking-widest text-outline mb-2">Recommendation</div>
      <ul className="space-y-2 text-[12px] text-on-surface-variant leading-relaxed">
        {lines.map((line) => (
          <li key={line} className="flex gap-2">
            <span className="text-primary shrink-0">→</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RouteResults() {
  const routes = useLogiFlowStore((s) => s.routes);
  const selectedRoute = useLogiFlowStore((s) => s.selectedRoute);
  const setSelectedRoute = useLogiFlowStore((s) => s.setSelectedRoute);
  const source = useLogiFlowStore((s) => s.source);
  const destination = useLogiFlowStore((s) => s.destination);
  const cargoWeight = useLogiFlowStore((s) => s.cargoWeight);

  const confidence = useMemo(() => computeConfidence(routes), [routes]);

  if (!routes || routes.length === 0) return null;

  const minCost = Math.min(...routes.map((r) => Number(r.cost)));
  const minTime = Math.min(...routes.map((r) => Number(r.time)));
  const minRisk = Math.min(...routes.map((r) => Number(r.risk)));

  return (
    <section className="mt-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="text-[10px] font-label font-bold uppercase tracking-widest text-outline">Analysis</div>
              <div className="text-sm font-semibold text-on-surface mt-0.5">Route comparison</div>
            </div>
            <div className="text-[10px] mono text-on-surface-variant">{routes.length} leg{routes.length !== 1 ? 's' : ''}</div>
          </div>

          <RecommendationPanel routes={routes} minCost={minCost} minTime={minTime} minRisk={minRisk} />

          <div className="space-y-4">
            {routes.map((r, i) => (
              <RouteCard
                key={i}
                route={r}
                index={i}
                isSelected={i === selectedRoute}
                onSelect={() => setSelectedRoute(i)}
                isCheapest={Number(r.cost) === minCost}
                isFastest={Number(r.time) === minTime}
                isSafest={Number(r.risk) === minRisk}
                source={source}
                destination={destination}
                cargoKg={cargoWeight}
                routes={routes}
                confidence={confidence}
              />
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 xl:col-span-8">
          <div className="bg-surface-container-lowest/35 border border-outline-variant/12 rounded-2xl p-4 h-full min-h-[420px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-label font-bold uppercase tracking-widest text-outline flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">map</span>
                Live map
              </span>
              <span className="text-[10px] mono text-on-surface-variant">
                Focus: R{selectedRoute + 1} · {formatCostCompact(routes[selectedRoute]?.cost ?? 0)} ·{' '}
                {Number(routes[selectedRoute]?.time ?? 0).toFixed(1)}h
              </span>
            </div>
            <MapView routes={routes} selectedRoute={selectedRoute} />
          </div>
        </div>
      </div>
    </section>
  );
}
