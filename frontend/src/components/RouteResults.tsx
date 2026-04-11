'use client';

import dynamic from 'next/dynamic';
import React, { useMemo, useState } from 'react';
import { useLogiFlowStore, type RoadRoute } from '@/store/useLogiFlowStore';

const MapView = dynamic(() => import('@/components/Mapview'), { ssr: false });

// ── Formatting helpers ────────────────────────────────────────────────

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
  if (h <= 0.42) return 'Local roads mix';
  return 'Highways + mixed';
}

function delayHrs(route: RoadRoute): number {
  const ml = route.ml_summary?.delay_hours;
  if (typeof ml === 'number' && Number.isFinite(ml)) return ml;
  const p = route.predicted_delay;
  if (typeof p === 'number' && Number.isFinite(p)) return p;
  return 0;
}

function computeConfidence(route: RoadRoute, allRoutes: RoadRoute[], routeIndex: number): number {
  if (!allRoutes.length) return 68;
  const best = allRoutes[0];
  const costs = allRoutes.map(r => Number(r.cost));
  const times = allRoutes.map(r => Number(r.time));
  const risks = allRoutes.map(r => Number(r.risk));
  const spanC = Math.max(Math.max(...costs) - Math.min(...costs), 1);
  const spanT = Math.max(Math.max(...times) - Math.min(...times), 1e-6);
  const spanR = Math.max(Math.max(...risks) - Math.min(...risks), 1e-6);
  const costDiff = Math.max(0, Number(route.cost) - Number(best.cost)) / spanC;
  const timeDiff = Math.max(0, Number(route.time) - Number(best.time)) / spanT;
  const riskDiff = Math.max(0, Number(route.risk) - Number(best.risk)) / spanR;
  let confidence = 1 - (costDiff + timeDiff + riskDiff);
  const delay = delayHrs(route);
  if (delay > 4) confidence -= 0.2;
  else if (delay > 2) confidence -= 0.1;
  confidence -= routeIndex * 0.012;
  return Math.round(Math.max(0.3, Math.min(0.95, confidence)) * 100);
}

function sanitizeInsights(reason: string | undefined, factors: string[]): string[] {
  const r0 = reason?.trim().toLowerCase() ?? '';
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of factors) {
    const t = raw.trim();
    if (!t) continue;
    const low = t.toLowerCase();
    if (seen.has(low) || (r0 && low === r0) || /^optimized for\b/i.test(t)) continue;
    seen.add(low);
    out.push(t.length > 118 ? `${t.slice(0, 115)}…` : t);
  }
  return out;
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

function explainConfidence(confidence: number, route: RoadRoute): string {
  const delay = delayHrs(route);
  let s = `Estimated confidence is ${confidence}% for this option versus the leading route on cost, time, and risk.`;
  if (delay > 2) s += ' Higher predicted delay reduces certainty slightly.';
  return s;
}

function explainDataSource(route: RoadRoute): string {
  const raw = route as Record<string, unknown>;
  const ds = raw.data_source;
  if (typeof ds === 'string' && ds.trim()) return `Source: ${ds}.`;
  return 'Derived from the road optimization pipeline (geometry, traffic factors, and cost model).';
}

// ── Metric tile ───────────────────────────────────────────────────────

function MetricTile({
  emoji,
  label,
  value,
  unit,
}: {
  emoji: string;
  label: string;
  value: React.ReactNode;
  unit?: string;
}) {
  return (
    <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
      <div className="text-[10px] text-outline mb-1 flex items-center gap-1 font-medium">
        <span aria-hidden>{emoji}</span> {label}
      </div>
      <div className="text-sm font-bold text-on-surface mono tabular-nums">
        <span className="text-primary">{value}</span>
        {unit && <span className="text-outline text-xs ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

// ── Route Card ────────────────────────────────────────────────────────

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
  const [showBreakdown, setShowBreakdown] = useState(false);
  const factors = Array.isArray(route.key_factors) ? route.key_factors : [];
  const ml = route.ml_summary;
  const isBest = index === 0;
  const breakdown = route.cost_breakdown;
  const best = routes[0];
  const insights = sanitizeInsights(route.reason, factors);
  const notReasons = index > 0 && best ? whyNotThisRoute(best, route) : [];
  const confidenceNote = explainConfidence(confidence, route);
  const dataSourceNote = explainDataSource(route);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Select route ${index + 1}`}
      aria-pressed={isSelected}
      onClick={onSelect}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
      }}
      className={[
        'w-full text-left rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden',
        isSelected
          ? 'border-primary/35 bg-surface-container/50 shadow-[0_0_0_1px_rgba(172,199,255,0.08)] shadow-lg'
          : 'border-outline-variant/12 bg-surface-container-lowest/30 hover:bg-surface-container/30 hover:border-outline-variant/25',
      ].join(' ')}
    >
      {/* Summary bar */}
      <div className="px-4 py-2.5 bg-surface-container/25 border-b border-outline-variant/8">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] leading-relaxed text-on-surface-variant mono truncate">
            {source || 'Origin'} → {destination || 'Destination'} ·{' '}
            {Number(route.distance_km ?? 0).toFixed(0)} km · {Number(route.time).toFixed(1)}h ·{' '}
            {highwayHint(route)}
          </p>
          <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-md bg-surface-container/60 text-on-surface-variant mono border border-outline-variant/12 whitespace-nowrap">
            {confidence}% conf.
          </span>
        </div>
      </div>

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={[
                'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold mono shrink-0',
                isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container text-outline',
              ].join(' ')}
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-label font-bold uppercase tracking-[0.12em] text-on-surface-variant mb-1">
                Route {index + 1}
              </div>
              <div className="flex flex-wrap gap-1">
                {isBest && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-500/12 text-emerald-300 mono border border-emerald-500/20">
                    Top pick
                  </span>
                )}
                {isCheapest && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-500/12 text-emerald-300 mono">
                    ₹ Lowest
                  </span>
                )}
                {isFastest && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-500/12 text-amber-200 mono">
                    Fastest
                  </span>
                )}
                {isSafest && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-blue-500/12 text-blue-200 mono">
                    Safest
                  </span>
                )}
                {isSelected && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-primary/12 text-primary mono">
                    On map
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-[15px] font-black mono text-primary leading-tight">
              ₹{formatCurrency(route.cost)}
            </div>
            {route.cost_range && (
              <div className="text-[10px] text-outline mono mt-0.5">
                ₹{formatCurrency(route.cost_range.low)}–₹{formatCurrency(route.cost_range.high)}
              </div>
            )}
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <MetricTile emoji="⏱" label="Time" value={Number(route.time).toFixed(1)} unit="hrs" />
          <MetricTile emoji="💰" label="Cost" value={`₹${formatCurrency(route.cost)}`} />
          <MetricTile emoji="⚠️" label="Risk" value={`${Math.round(Number(route.risk) * 100)}`} unit="%" />
          <MetricTile emoji="📍" label="Distance" value={Number(route.distance_km ?? 0).toFixed(0)} unit="km" />
        </div>

        {/* ML summary */}
        {ml && (
          <div className="grid grid-cols-3 gap-1.5 mb-4 text-[10px] mono">
            {[
              {
                label: 'TRAFFIC',
                val: ml.traffic,
                colorClass:
                  ml.traffic === 'high'
                    ? 'bg-red-500/15 text-red-300'
                    : ml.traffic === 'moderate'
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-emerald-500/15 text-emerald-300',
              },
              {
                label: 'WEATHER',
                val: ml.weather,
                colorClass:
                  ml.weather === 'bad'
                    ? 'bg-red-500/15 text-red-300'
                    : ml.weather === 'moderate'
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-emerald-500/15 text-emerald-300',
              },
              {
                label: 'DELAY',
                val: ml.delay_hours > 0.05 ? `+${ml.delay_hours.toFixed(1)}h` : 'On time',
                colorClass: ml.delay_hours > 0.05 ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300',
              },
            ].map(item => (
              <div key={item.label} className="px-2 py-1.5 rounded-lg bg-surface-container-low/40 border border-outline-variant/10">
                <div className="text-outline/60 mb-1 text-[9px] uppercase tracking-widest">{item.label}</div>
                <span className={`inline-block px-1.5 py-0.5 rounded font-semibold ${item.colorClass}`}>
                  {typeof item.val === 'string' ? item.val.toUpperCase() : item.val}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-3">
            <div className="text-[10px] uppercase tracking-widest text-outline font-label font-bold mb-2">Confidence</div>
            <p className="text-[11px] text-on-surface-variant leading-relaxed">{confidenceNote}</p>
          </div>
          <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-3">
            <div className="text-[10px] uppercase tracking-widest text-outline font-label font-bold mb-2">Data source</div>
            <p className="text-[11px] text-on-surface-variant leading-relaxed">{dataSourceNote}</p>
          </div>
        </div>

        {/* Cost breakdown */}
        <div className="pt-3 border-t border-outline-variant/8">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setShowBreakdown(v => !v); }}
            className="flex items-center justify-between w-full text-left text-[10px] font-label font-bold uppercase tracking-[0.12em] text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span>Cost breakdown</span>
            <span className="mono text-primary">{showBreakdown ? '−' : '+'}</span>
          </button>

          {showBreakdown && (
            <div className="mt-2.5 rounded-xl border border-outline-variant/10 overflow-hidden">
              <table className="w-full text-[11px]">
                <tbody className="divide-y divide-outline-variant/8">
                  {[
                    ['Freight', breakdown?.freight],
                    ['Toll', breakdown?.toll],
                    ['Handling', breakdown?.handling],
                    ['GST (5%)', breakdown?.gst],
                    ['Documentation', breakdown?.documentation],
                  ].map(([label, val]) => (
                    <tr key={String(label)} className="bg-surface-container-lowest/15">
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

        {/* Why not */}
        {notReasons.length > 0 && (
          <div className="mt-3 pt-3 border-t border-outline-variant/8">
            <div className="text-[9px] uppercase tracking-[0.12em] text-outline font-label font-bold mb-1.5">
              Why not this route?
            </div>
            <ul className="text-[11px] text-on-surface-variant space-y-1 mono">
              {notReasons.map(line => (
                <li key={line} className="flex gap-2">
                  <span className="text-amber-400/80 shrink-0">▸</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Insights */}
        {(route.reason || insights.length > 0) && (
          <div className="mt-3 pt-3 border-t border-outline-variant/8">
            <div className="text-[9px] uppercase tracking-[0.12em] text-outline font-label font-bold mb-1.5">
              Route insight
            </div>
            {route.reason && !/^optimized for\b/i.test(route.reason.trim()) && (
              <p className="text-[11px] text-on-surface font-medium mb-1.5 leading-relaxed">
                {route.reason}
              </p>
            )}
            {insights.length > 0 && (
              <ul className="text-[11px] text-on-surface-variant space-y-1">
                {insights.map((factor, idx) => (
                  <li key={`${factor}-${idx}`} className="flex items-start gap-2">
                    <span className="text-primary/60 leading-4 shrink-0">•</span>
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

// ── Recommendation Panel ──────────────────────────────────────────────

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
  const priority = useLogiFlowStore(s => s.priority);

  const lines = useMemo(() => {
    if (!routes.length) return [];
    const out: string[] = [];
    const fastestIdx = routes.findIndex(r => Number(r.time) === minTime);
    const cheapestIdx = routes.findIndex(r => Number(r.cost) === minCost);
    const safestIdx = routes.findIndex(r => Number(r.risk) === minRisk);
    const fr = fastestIdx >= 0 ? fastestIdx + 1 : 1;
    const ch = cheapestIdx >= 0 ? cheapestIdx + 1 : 1;
    const sf = safestIdx >= 0 ? safestIdx + 1 : 1;

    if (priority === 'time') out.push(`Prioritize speed → Route ${fr} (${Number(routes[fastestIdx]?.time).toFixed(1)}h).`);
    else if (priority === 'cost') out.push(`Prioritize cost → Route ${ch} (₹${formatCurrency(routes[cheapestIdx]?.cost)}).`);
    else if (priority === 'safe') out.push(`Prioritize safety → Route ${sf} (lowest risk).`);
    else out.push(`Route 1 is the default ranked trade-off for this lane.`);

    if (routes.length > 1) {
      if (fr === ch) out.push(`Route ${fr} leads on both time and cost.`);
      else out.push(`Speed → Route ${fr}; lowest spend → Route ${ch}.`);
    }
    if (routes.length > 1 && priority !== 'safe' && sf !== fr && sf !== ch) {
      out.push(`Lowest risk → Route ${sf}.`);
    }
    return [...new Set(out)].slice(0, 4);
  }, [routes, minTime, minCost, minRisk, priority]);

  if (!routes.length) return null;

  return (
    <div className="rounded-2xl border border-outline-variant/12 bg-surface-container/20 p-4 shrink-0">
      <div className="text-[9px] font-label font-bold uppercase tracking-[0.14em] text-outline mb-2">
        Recommendation
      </div>
      <ul className="space-y-2 text-[12px] text-on-surface-variant leading-relaxed">
        {lines.map(line => (
          <li key={line} className="flex gap-2">
            <span className="text-primary shrink-0 mt-px">→</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Route Results ─────────────────────────────────────────────────────

export default function RouteResults() {
  const routes = useLogiFlowStore(s => s.routes);
  const selectedRoute = useLogiFlowStore(s => s.selectedRoute);
  const setSelectedRoute = useLogiFlowStore(s => s.setSelectedRoute);
  const source = useLogiFlowStore(s => s.source);
  const destination = useLogiFlowStore(s => s.destination);
  const cargoWeight = useLogiFlowStore(s => s.cargoWeight);

  if (!routes || routes.length === 0) return null;
  console.log('[RouteResults] RENDER →', routes.map((r, i) => ({
    idx: i,
    cost: r.cost,
    time: r.time,
    risk: r.risk,
    delay: r.ml_summary?.delay_hours,
    geometry_len: r.geometry?.length
  })));

  const safeIndex = Math.min(selectedRoute, routes.length - 1);
  const minCost = Math.min(...routes.map((r) => Number(r.cost)));
  const minTime = Math.min(...routes.map((r) => Number(r.time)));
  const minRisk = Math.min(...routes.map((r) => Number(r.risk)));

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-5">
        <div>
          <div className="text-[10px] font-label font-bold uppercase tracking-[0.12em] text-outline">
            Analysis
          </div>
          <div className="text-sm font-semibold text-on-surface mt-0.5">
            {routes.length} route{routes.length !== 1 ? 's' : ''} found
          </div>
        </div>
        <div className="text-[10px] mono text-on-surface-variant">
          {source} → {destination}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Cards column */}
        <div className="lg:col-span-1 max-h-[80vh] overflow-y-auto space-y-4 pr-1 overscroll-y-contain [scrollbar-gutter:stable]">
          <RecommendationPanel routes={routes} minCost={minCost} minTime={minTime} minRisk={minRisk} />
          {routes.map((r, i) => (
            <RouteCard
              key={`${i}-${r.cost}-${r.time}-${r.risk}`}
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
              confidence={computeConfidence(r, routes, i)}
            />
          ))}
        </div>

        {/* Map column */}
        <div className="lg:col-span-2 lg:sticky lg:top-4 w-full min-h-[320px] h-[70vh] lg:h-[80vh]">
          <div className="flex flex-col h-full min-h-0 bg-surface-container-lowest/25 border border-outline-variant/10 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 shrink-0 pb-3 border-b border-outline-variant/8">
              <span className="text-[10px] font-label font-bold uppercase tracking-[0.12em] text-outline flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-primary"
                  style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
                >
                  map
                </span>
                Live Map
              </span>
              <span className="text-[10px] mono text-on-surface-variant text-right truncate">
                R{safeIndex + 1} · {formatCostCompact(routes[safeIndex]?.cost ?? 0)} ·{' '}
                {Number(routes[safeIndex]?.time ?? 0).toFixed(1)}h
              </span>
            </div>
            <div className="flex-1 min-h-0 pt-3">
              <MapView
                key={`map-${selectedRoute}-${routes.length}-${Math.round(routes[0]?.cost ?? 0)}`}
                routes={routes}
                selectedRoute={selectedRoute}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
