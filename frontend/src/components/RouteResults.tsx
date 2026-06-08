'use client';

import dynamic from 'next/dynamic';
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  MapPin,
  Navigation,
  Route,
  Shield,
  Sparkles,
  TrendingDown,
  Zap,
} from 'lucide-react';
import { useLogiFlowStore, type RoadRoute } from '@/store/useLogiFlowStore';
import { fetchExplanation } from '@/services/api';

const MapView = dynamic(() => import('@/components/Mapview'), { ssr: false });

// ── Helpers ──────────────────────────────────────────────────────────

function fmt(val: unknown) {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('en-IN').format(Math.round(n));
}

function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return '₹0';
  const a = Math.abs(n);
  if (a >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (a >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
}

function highwayHint(route: RoadRoute): string {
  const h = route.highway_ratio;
  if (h == null || Number.isNaN(h)) return 'Mixed roads';
  if (h >= 0.72) return 'Mostly highways';
  if (h <= 0.42) return 'Local roads mix';
  return 'Highways + local mix';
}

function delayHrs(route: RoadRoute): number {
  const ml = route.ml_summary?.delay_hours;
  if (typeof ml === 'number' && Number.isFinite(ml)) return ml;
  const p = route.predicted_delay;
  if (typeof p === 'number' && Number.isFinite(p)) return p;
  return 0;
}

function priorityWeights(priority: string): [number, number, number] {
  if (priority === 'cost') return [0.6, 0.25, 0.15];
  if (priority === 'time') return [0.2, 0.6, 0.2];
  if (priority === 'safe') return [0.15, 0.2, 0.65];
  return [1 / 3, 1 / 3, 1 / 3];
}

function computeConfidence(
  route: RoadRoute,
  allRoutes: RoadRoute[],
  routeIndex: number,
  priority: string
): number {
  if (!allRoutes.length) return 68;
  const best = allRoutes[0];
  const costs = allRoutes.map((r) => Number(r.cost));
  const times = allRoutes.map((r) => Number(r.time));
  const risks = allRoutes.map((r) => Number(r.risk));
  const spanC = Math.max(Math.max(...costs) - Math.min(...costs), 1);
  const spanT = Math.max(Math.max(...times) - Math.min(...times), 1e-6);
  const spanR = Math.max(Math.max(...risks) - Math.min(...risks), 1e-6);
  const costDiff = Math.max(0, Number(route.cost) - Number(best.cost)) / spanC;
  const timeDiff = Math.max(0, Number(route.time) - Number(best.time)) / spanT;
  const riskDiff = Math.max(0, Number(route.risk) - Number(best.risk)) / spanR;
  const [wC, wT, wR] = priorityWeights(priority);
  const weightedDev = wC * costDiff + wT * timeDiff + wR * riskDiff;
  let conf = 1 - weightedDev * 1.5;
  const delay = delayHrs(route);
  if (delay > 4) conf -= 0.18;
  else if (delay > 2) conf -= 0.08;
  conf -= routeIndex * 0.015;
  return Math.round(Math.max(0.3, Math.min(0.95, conf)) * 100);
}

function sanitizeInsights(reason: string | undefined, factors: string[]): string[] {
  const r0 = reason?.trim().toLowerCase() ?? '';
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of factors) {
    const t = raw.trim();
    if (!t) continue;
    const low = t.toLowerCase();
    if (
      seen.has(low) ||
      (r0 && low === r0) ||
      /^optimized for\b/i.test(t) ||
      /selected among/i.test(t) ||
      /within budget/i.test(t)
    )
      continue;
    seen.add(low);
    out.push(t.length > 118 ? `${t.slice(0, 115)}…` : t);
  }
  return out;
}

function whyNot(best: RoadRoute, alt: RoadRoute): string[] {
  const lines: string[] = [];
  const dt = Number(alt.time) - Number(best.time);
  const dc = Number(alt.cost) - Number(best.cost);
  const dr = (Number(alt.risk) - Number(best.risk)) * 100;
  if (dt > 0.05) lines.push(`${dt.toFixed(1)} hrs slower than best route`);
  if (dc > 0) lines.push(`₹${fmt(dc)} more expensive than best route`);
  if (dr > 1) lines.push(`Risk higher by ${Math.round(dr)}% vs best route`);
  return lines;
}

// ── Risk pill ─────────────────────────────────────────────────────────

function RiskPill({ risk }: { risk: number }) {
  const pct = Math.round(risk * 100);
  const color =
    pct >= 60
      ? 'bg-risk/15 text-risk border-risk/20'
      : pct >= 35
      ? 'bg-warn/15 text-warn border-warn/20'
      : 'bg-live/15 text-live border-live/20';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold mono ${color}`}
    >
      {pct}%
    </span>
  );
}

// ── Confidence bar ────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 75 ? 'var(--live)' : value >= 55 ? 'var(--warn)' : 'var(--risk)';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 rounded-full bg-surface-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
      <span
        className="shrink-0 font-mono text-[11px] font-bold tabular-nums"
        style={{ color }}
      >
        {value}%
      </span>
    </div>
  );
}

// ── ML tag ────────────────────────────────────────────────────────────

function MlTag({
  label,
  value,
  level,
}: {
  label: string;
  value: string;
  level: 'good' | 'moderate' | 'bad';
}) {
  const cls = {
    good: 'bg-live/10 text-live border-live/20',
    moderate: 'bg-warn/10 text-warn border-warn/20',
    bad: 'bg-risk/10 text-risk border-risk/20',
  }[level];
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface/50 px-3 py-2">
      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className={`self-start rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>
        {value.toUpperCase()}
      </span>
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
  const [expanded, setExpanded] = useState(false);
  const [dynamicExplanation, setDynamicExplanation] = useState<string | null>(null);
  const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);
  const priority = useLogiFlowStore((s) => s.priority);

  const factors = Array.isArray(route.key_factors) ? route.key_factors : [];
  const ml = route.ml_summary;
  const isBest = index === 0;
  const breakdown = route.cost_breakdown;
  const best = routes[0];
  const insights = sanitizeInsights(route.reason, factors);
  const notReasons = index > 0 && best ? whyNot(best, route) : [];
  const delay = delayHrs(route);

  useEffect(() => {
    setDynamicExplanation(null);
    setIsLoadingExplanation(false);
  }, [route]);

  const handleExplain = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoadingExplanation(true);
    const expl = await fetchExplanation({
      pipeline: 'road',
      priority,
      route_data: route,
      context: { best_route: best },
    });
    if (expl) setDynamicExplanation(expl);
    setIsLoadingExplanation(false);
  };

  const badges: { label: string; className: string }[] = [];
  if (isBest) badges.push({ label: 'Top pick', className: 'bg-live/12 text-live border-live/20' });
  if (isCheapest) badges.push({ label: '₹ Lowest', className: 'bg-live/12 text-live border-live/20' });
  if (isFastest) badges.push({ label: '⚡ Fastest', className: 'bg-warn/12 text-warn border-warn/20' });
  if (isSafest) badges.push({ label: '🛡 Safest', className: 'bg-air/12 text-air border-air/20' });
  if (isSelected) badges.push({ label: 'On map', className: 'bg-road/12 text-road border-road/20' });

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
        'w-full text-left rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden',
        isSelected
          ? 'border-road/50 bg-surface shadow-[0_0_0_1px_color-mix(in_oklab,var(--road)_14%,transparent),0_8px_40px_-20px_color-mix(in_oklab,var(--road)_25%,transparent)]'
          : 'border-border bg-surface/60 hover:bg-surface/90 hover:border-border-strong',
      ].join(' ')}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border/50"
        style={{
          background: isSelected
            ? 'color-mix(in oklab, var(--road) 5%, var(--surface))'
            : undefined,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={[
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold font-mono border',
              isSelected
                ? 'border-road/40 bg-road/15 text-road'
                : 'border-border bg-surface-2 text-muted-foreground',
            ].join(' ')}
          >
            {index + 1}
          </span>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {source} → {destination} · {Number(route.distance_km ?? 0).toFixed(0)} km · {highwayHint(route)}
          </p>
        </div>
        <ConfidenceBar value={confidence} />
      </div>

      <div className="p-4">
        {/* Badges */}
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {badges.map((b) => (
              <span
                key={b.label}
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${b.className}`}
              >
                {b.label}
              </span>
            ))}
          </div>
        )}

        {/* Key metrics row */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {/* Cost */}
          <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface/50 px-3 py-2.5">
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              <DollarSign className="h-2.5 w-2.5" /> Cost
            </span>
            <span className="font-mono text-[15px] font-black text-foreground tabular-nums leading-none">
              {fmtCompact(Number(route.cost))}
            </span>
            {route.cost_range && (
              <span className="font-mono text-[9px] text-muted-foreground">
                {fmtCompact(route.cost_range.low)}–{fmtCompact(route.cost_range.high)}
              </span>
            )}
          </div>
          {/* Time */}
          <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface/50 px-3 py-2.5">
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              <Clock className="h-2.5 w-2.5" /> Time
            </span>
            <span className="font-mono text-[15px] font-black text-foreground tabular-nums leading-none">
              {Number(route.time).toFixed(1)}
              <span className="text-[11px] font-normal text-muted-foreground ml-0.5">h</span>
            </span>
            {delay > 0.05 && (
              <span className="font-mono text-[9px] text-warn">+{delay.toFixed(1)}h delay</span>
            )}
          </div>
          {/* Risk */}
          <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface/50 px-3 py-2.5">
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              <Shield className="h-2.5 w-2.5" /> Risk
            </span>
            <div className="flex items-center gap-1.5">
              <RiskPill risk={Number(route.risk)} />
            </div>
          </div>
        </div>

        {/* ML summary */}
        {ml && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <MlTag
              label="Traffic"
              value={ml.traffic}
              level={ml.traffic === 'high' ? 'bad' : ml.traffic === 'moderate' ? 'moderate' : 'good'}
            />
            <MlTag
              label="Weather"
              value={ml.weather}
              level={ml.weather === 'bad' ? 'bad' : ml.weather === 'moderate' ? 'moderate' : 'good'}
            />
            <MlTag
              label="Delay"
              value={ml.delay_hours > 0.05 ? `+${ml.delay_hours.toFixed(1)}h` : 'On time'}
              level={ml.delay_hours > 0.05 ? 'moderate' : 'good'}
            />
          </div>
        )}

        {/* Why not this route */}
        {notReasons.length > 0 && (
          <div className="mb-4 rounded-xl border border-warn/20 bg-warn/5 px-3 py-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-warn/70">
              <AlertTriangle className="h-2.5 w-2.5" />
              Why not this route
            </div>
            <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
              {notReasons.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-warn/60">▸</span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Expandable details */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
        >
          <span>Cost breakdown &amp; insights</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {expanded && (
          <div className="mt-3 space-y-3">
            {/* Cost breakdown table */}
            {breakdown && (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="px-3 py-2 bg-surface-2 border-b border-border">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Cost breakdown
                  </span>
                </div>
                <table className="w-full text-[11.5px]">
                  <tbody>
                    {[
                      ['Freight', breakdown.freight],
                      ['Toll', breakdown.toll],
                      ['Handling', breakdown.handling],
                      ['GST (5%)', breakdown.gst],
                      ['Documentation', breakdown.documentation],
                    ].map(([label, val]) => (
                      <tr key={String(label)} className="border-t border-border/50">
                        <td className="py-2 pl-3 text-muted-foreground">{label}</td>
                        <td className="py-2 pr-3 text-right font-mono font-semibold text-foreground tabular-nums">
                          ₹{fmt(val)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Route insights */}
            <div className="rounded-xl border border-border bg-surface/50 px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Route insight
                </span>
                {!dynamicExplanation && (
                  <button
                    onClick={handleExplain}
                    disabled={isLoadingExplanation}
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-hybrid/40 hover:text-hybrid disabled:opacity-50"
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                    {isLoadingExplanation ? 'Analysing…' : 'AI Explain'}
                  </button>
                )}
              </div>

              {dynamicExplanation ? (
                <ul className="space-y-1.5 text-[11.5px] text-muted-foreground leading-relaxed">
                  {dynamicExplanation
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line, i) => (
                      <li key={`${line}-${i}`} className="flex gap-2">
                        <span className="mt-0.5 shrink-0 text-hybrid/60">•</span>
                        {line.replace(/^[-*]\s*/, '')}
                      </li>
                    ))}
                </ul>
              ) : (
                <>
                  {route.reason && !/^optimized for\b/i.test(route.reason.trim()) && (
                    <p className="mb-2 text-[11.5px] font-medium text-foreground leading-relaxed">
                      {route.reason}
                    </p>
                  )}
                  {insights.length > 0 && (
                    <ul className="space-y-1 text-[11.5px] text-muted-foreground">
                      {insights.map((f, i) => (
                        <li key={`${f}-${i}`} className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0 text-road/50">•</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Recommendation Banner ─────────────────────────────────────────────

function RecommendationBanner({
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
    if (!routes.length) return [];
    const out: string[] = [];
    const fi = routes.findIndex((r) => Number(r.time) === minTime);
    const ci = routes.findIndex((r) => Number(r.cost) === minCost);
    const si = routes.findIndex((r) => Number(r.risk) === minRisk);

    if (priority === 'time')
      out.push(`Fastest: Route ${fi + 1} at ${Number(routes[fi]?.time).toFixed(1)} hrs`);
    else if (priority === 'cost')
      out.push(`Cheapest: Route ${ci + 1} at ${fmtCompact(Number(routes[ci]?.cost))}`);
    else if (priority === 'safe')
      out.push(`Safest: Route ${si + 1} with lowest risk exposure`);
    else out.push('Route 1 offers the best balance across cost, time, and risk');

    if (routes.length > 1) {
      if (fi === ci) out.push(`Route ${fi + 1} leads on both time and cost`);
      else out.push(`Speed → Route ${fi + 1}; cheapest → Route ${ci + 1}`);
    }
    return [...new Set(out)].slice(0, 3);
  }, [routes, minTime, minCost, minRisk, priority]);

  if (!routes.length) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface/50 px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        <BarChart3 className="h-3 w-3" />
        Recommendation
      </div>
      <ul className="space-y-1.5 text-[12px] text-muted-foreground">
        {lines.map((line) => (
          <li key={line} className="flex items-start gap-2">
            <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-road/60" />
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Route Results ─────────────────────────────────────────────────────

export default function RouteResults() {
  const routes = useLogiFlowStore((s) => s.routes);
  const selectedRoute = useLogiFlowStore((s) => s.selectedRoute);
  const setSelectedRoute = useLogiFlowStore((s) => s.setSelectedRoute);
  const priority = useLogiFlowStore((s) => s.priority);
  const source = useLogiFlowStore((s) => s.source);
  const destination = useLogiFlowStore((s) => s.destination);
  const cargoWeight = useLogiFlowStore((s) => s.cargoWeight);

  useEffect(() => {
    if (!routes.length) return;
    let bestIndex = 0;
    if (priority === 'cost') {
      const min = Math.min(...routes.map((r) => Number(r.cost)));
      bestIndex = routes.findIndex((r) => Number(r.cost) === min);
    } else if (priority === 'time') {
      const min = Math.min(...routes.map((r) => Number(r.time)));
      bestIndex = routes.findIndex((r) => Number(r.time) === min);
    } else if (priority === 'safe') {
      const min = Math.min(...routes.map((r) => Number(r.risk)));
      bestIndex = routes.findIndex((r) => Number(r.risk) === min);
    }
    setSelectedRoute(Math.max(0, bestIndex));
  }, [routes, priority, setSelectedRoute]);

  if (!routes || routes.length === 0) return null;

  const safeIndex = Math.min(selectedRoute, routes.length - 1);
  const minCost = Math.min(...routes.map((r) => Number(r.cost)));
  const minTime = Math.min(...routes.map((r) => Number(r.time)));
  const minRisk = Math.min(...routes.map((r) => Number(r.risk)));

  return (
    <section>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-road/30 bg-road/10"
          >
            <Route className="h-3.5 w-3.5 text-road" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Road analysis
            </div>
            <div className="text-sm font-semibold text-foreground">
              {routes.length} route{routes.length !== 1 ? 's' : ''} found
            </div>
          </div>
        </div>
        <div className="hidden font-mono text-[10px] text-muted-foreground sm:block">
          {source} <ArrowRight className="inline h-2.5 w-2.5" /> {destination}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 items-start">
        {/* Cards */}
        <div className="lg:col-span-1 space-y-3 lg:max-h-[80vh] lg:overflow-y-auto lg:pr-1 overscroll-y-contain [scrollbar-gutter:stable]">
          <RecommendationBanner
            routes={routes}
            minCost={minCost}
            minTime={minTime}
            minRisk={minRisk}
          />
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
              confidence={computeConfidence(r, routes, i, priority)}
            />
          ))}
        </div>

        {/* Map */}
        <div className="lg:col-span-2 lg:sticky lg:top-4 w-full">
          <div className="flex flex-col rounded-2xl border border-border bg-surface/40 overflow-hidden h-[min(55vh,420px)] sm:h-[min(60vh,480px)] lg:h-[80vh]">
            {/* Map header */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-surface/80 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Navigation className="h-3.5 w-3.5 text-road" />
                <span className="text-[11px] font-semibold text-foreground">Route map</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: 'var(--road)' }}
                />
                R{safeIndex + 1} · {fmtCompact(routes[safeIndex]?.cost ?? 0)} ·{' '}
                {Number(routes[safeIndex]?.time ?? 0).toFixed(1)}h
              </div>
            </div>
            <div className="flex-1 min-h-0">
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
