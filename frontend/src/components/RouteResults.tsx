'use client';

import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLogiFlowStore, type RoadRoute } from '@/store/useLogiFlowStore';
import { useAuthStore } from '@/store/useAuthStore';
import { fetchExplanation } from '@/services/api';
import {
  buildGoogleMapsUrl,
  getRouteNavigationInfo,
  devAssertNavigationConsistency,
} from '@/lib/routeNavigation';
import { SaveReportModal } from '@/components/planner/SaveReportModal';
import type { ReportMode } from '@/services/plannerApi';
import { InvalidCorridorCard } from '@/components/InvalidCorridorCard';

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

/**
 * SINGLE SOURCE OF TRUTH for risk display.
 * Every risk percentage shown in the UI must call this function.
 * Uses Math.round so 0.106 → 11%, matching the card metric tile.
 */
function formatRisk(route: RoadRoute): string {
  return `${Math.round(Number(route.risk) * 100)}%`;
}

/** Numeric risk percent (integer) — use for arithmetic comparisons only. */
function riskPct(route: RoadRoute): number {
  return Math.round(Number(route.risk) * 100);
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

// ── A. SINGLE SOURCE OF TRUTH ─────────────────────────────────────────
// All derived indices computed once and propagated to every component.

interface RouteIndices {
  fastestIndex: number;
  cheapestIndex: number;
  safestIndex: number;
  recommendedIndex: number;
}

function deriveRouteIndices(routes: RoadRoute[], priority: string): RouteIndices {
  if (!routes.length) return { fastestIndex: 0, cheapestIndex: 0, safestIndex: 0, recommendedIndex: 0 };

  const fastestIndex = routes.reduce(
    (best, r, i) => (Number(r.time) < Number(routes[best].time) ? i : best),
    0,
  );
  const cheapestIndex = routes.reduce(
    (best, r, i) => (Number(r.cost) < Number(routes[best].cost) ? i : best),
    0,
  );
  const safestIndex = routes.reduce(
    (best, r, i) => (Number(r.risk) < Number(routes[best].risk) ? i : best),
    0,
  );

  let recommendedIndex: number;
  if (priority === 'cost') recommendedIndex = cheapestIndex;
  else if (priority === 'time') recommendedIndex = fastestIndex;
  else if (priority === 'safe') recommendedIndex = safestIndex;
  else recommendedIndex = 0; // balanced: first route is overall best

  return { fastestIndex, cheapestIndex, safestIndex, recommendedIndex };
}

// ── B. ROUTE INSIGHT ─────────────────────────────────────────────────

function routeInsightLabel(
  index: number,
  indices: RouteIndices,
): string {
  if (index === indices.recommendedIndex) {
    if (index === indices.cheapestIndex) return 'Selected as most cost-efficient route.';
    if (index === indices.fastestIndex) return 'Selected as fastest route.';
    if (index === indices.safestIndex) return 'Selected as safest route.';
    return 'Recommended based on selected optimization priority.';
  }
  if (index === indices.cheapestIndex) return 'This is the cheapest available route.';
  if (index === indices.fastestIndex) return 'This is the fastest available route.';
  if (index === indices.safestIndex) return 'This is the safest available route.';
  return '';
}

// ── C. CONFIDENCE SCORE ───────────────────────────────────────────────
// 40% cost competitiveness + 30% time competitiveness +
// 20% risk competitiveness + 10% route uniqueness.

function computeConfidence(
  route: RoadRoute,
  allRoutes: RoadRoute[],
  index: number,
  indices: RouteIndices,
): number {
  if (allRoutes.length === 0) return 68;
  if (allRoutes.length === 1) return 82;

  const costs = allRoutes.map(r => Number(r.cost));
  const times = allRoutes.map(r => Number(r.time));
  const risks = allRoutes.map(r => Number(r.risk));

  const minC = Math.min(...costs);
  const maxC = Math.max(...costs);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const minR = Math.min(...risks);
  const maxR = Math.max(...risks);

  const spanC = Math.max(maxC - minC, 1);
  const spanT = Math.max(maxT - minT, 1e-6);
  const spanR = Math.max(maxR - minR, 1e-6);

  // Score each dimension: 1 = best in class, 0 = worst
  const costScore  = 1 - (Number(route.cost) - minC) / spanC;
  const timeScore  = 1 - (Number(route.time) - minT) / spanT;
  const riskScore  = 1 - (Number(route.risk) - minR) / spanR;

  // Route uniqueness: higher highway ratio = more distinct corridor
  const hw = typeof route.highway_ratio === 'number' ? route.highway_ratio : 0.5;
  const uniquenessScore = 0.5 + hw * 0.5; // range [0.5, 1.0]

  const raw = 0.40 * costScore + 0.30 * timeScore + 0.20 * riskScore + 0.10 * uniquenessScore;

  // Delay penalty
  const delay = delayHrs(route);
  let penalty = 0;
  if (delay > 4) penalty = 0.18;
  else if (delay > 2) penalty = 0.08;

  // Small positional penalty so ties are broken by array order
  const positionPenalty = index * 0.008;

  const final = raw - penalty - positionPenalty;
  return Math.round(Math.max(0.30, Math.min(0.95, final)) * 100);
}

function explainConfidence(
  confidence: number,
  route: RoadRoute,
  allRoutes: RoadRoute[],
  index: number,
  indices: RouteIndices,
): string {
  if (allRoutes.length === 0) return `Confidence ${confidence}%.`;

  const cheapestRoute = allRoutes[indices.cheapestIndex];
  const fastestRoute  = allRoutes[indices.fastestIndex];
  const safestRoute   = allRoutes[indices.safestIndex];

  const dc = Number(route.cost) - Number(cheapestRoute.cost);
  const dt = Number(route.time) - Number(fastestRoute.time);
  // Use riskPct() so comparison units match the displayed integer percentage
  const drPct = riskPct(route) - riskPct(safestRoute);

  const parts: string[] = [];

  if (index === indices.cheapestIndex) {
    parts.push('strongest cost advantage');
  } else if (dc > 0) {
    parts.push(`₹${formatCurrency(dc)} above cheapest`);
  }

  if (index === indices.fastestIndex) {
    parts.push('strongest delivery advantage');
  } else if (dt > 0.1) {
    parts.push(`${dt.toFixed(1)} hrs slower than fastest`);
  }

  // "lowest operational risk" only shown for the actual safest route
  if (index === indices.safestIndex) {
    parts.push(`lowest operational risk (${formatRisk(route)})`);
  } else if (drPct > 0) {
    parts.push(`risk higher by ${drPct}% vs. safest`);
  }

  const delay = delayHrs(route);
  if (delay > 4) parts.push('high delay expected');
  else if (delay > 2) parts.push('moderate expected delay');

  if (parts.length === 0) parts.push('competitive across all dimensions');

  return `Confidence ${confidence}% — ${parts.join(', ')}.`;
}

// ── Cost breakdown helpers ────────────────────────────────────────────

/**
 * Build a fully itemised cost breakdown from backend data plus synthetic
 * estimates for components the backend does not always return.
 */
function buildCostBreakdown(route: RoadRoute): {
  fuel: number;
  driver: number;
  toll: number;
  handling: number;
  stops: number;
  gst: number;
  documentation: number;
  total: number;
} {
  const bd = route.cost_breakdown ?? {};
  const totalCost = Number(route.cost) || 0;
  const distKm = Number(route.distance_km ?? 0) || 0;

  // Use backend values when available, otherwise estimate proportionally.
  const toll        = typeof bd.toll         === 'number' ? bd.toll         : Math.round(distKm * 0.12);
  const handling    = typeof bd.handling     === 'number' ? bd.handling     : Math.round(totalCost * 0.10);
  const gst         = typeof bd.gst          === 'number' ? bd.gst          : Math.round(totalCost * 0.05);
  const docFee      = typeof bd.documentation=== 'number' ? bd.documentation: 0;

  // If backend provides "freight" treat it as the combined fuel+driver base cost.
  // Otherwise split the remaining budget between fuel (55%) and driver (30%).
  let fuel: number;
  let driver: number;
  if (typeof bd.freight === 'number') {
    fuel   = Math.round(bd.freight * 0.65);
    driver = Math.round(bd.freight * 0.35);
  } else {
    const base = Math.max(0, totalCost - toll - handling - gst - docFee);
    fuel   = Math.round(base * 0.55);
    driver = Math.round(base * 0.30);
  }

  // Stop charges: ₹25 per planned stop (infer from distance bands)
  const estimatedStops = distKm > 600 ? 3 : distKm > 300 ? 2 : 1;
  const stops = Math.round(estimatedStops * 25);

  const total = fuel + driver + toll + handling + stops + gst + docFee;

  return { fuel, driver, toll, handling, stops, gst, documentation: docFee, total };
}

// ── F. WHY THIS ROUTE ─────────────────────────────────────────────────

function whyThisRoute(
  index: number,
  route: RoadRoute,
  allRoutes: RoadRoute[],
  indices: RouteIndices,
): string[] {
  const lines: string[] = [];
  if (allRoutes.length < 2) {
    lines.push('Only route available for this corridor.');
    return lines;
  }

  // Compare against the next-best route for the same dimension
  const othersExcludingSelf = allRoutes.filter((_, i) => i !== index);
  if (othersExcludingSelf.length === 0) return lines;

  const nextCheapest = othersExcludingSelf.reduce((a, b) =>
    Number(a.cost) < Number(b.cost) ? a : b,
  );
  const nextFastest = othersExcludingSelf.reduce((a, b) =>
    Number(a.time) < Number(b.time) ? a : b,
  );
  const nextSafest = othersExcludingSelf.reduce((a, b) =>
    Number(a.risk) < Number(b.risk) ? a : b,
  );

  const costAdv  = Number(nextCheapest.cost) - Number(route.cost);
  const timeAdv  = Number(nextFastest.time)  - Number(route.time);
  // Compare using integer percents so the number shown matches the card tile
  const riskAdvPct = riskPct(nextSafest) - riskPct(route); // positive means this route is safer

  if (index === indices.cheapestIndex && costAdv > 0) {
    lines.push(`${Math.round((costAdv / Number(nextCheapest.cost)) * 100)}% cheaper than next best option`);
  }
  if (index === indices.fastestIndex && timeAdv > 0.05) {
    lines.push(`${timeAdv.toFixed(1)} hrs faster than next best option`);
  }
  if (index === indices.safestIndex && riskAdvPct > 0) {
    lines.push(`Lowest operational risk (${formatRisk(route)}) among all feasible routes`);
  }
  if (lines.length === 0) {
    // Generic: state what this route does best vs. overall bests
    const dc = Number(route.cost) - Number(allRoutes[indices.cheapestIndex].cost);
    const dt = Number(route.time) - Number(allRoutes[indices.fastestIndex].time);
    const drPct = riskPct(route) - riskPct(allRoutes[indices.safestIndex]);
    if (dc < 50) lines.push('Cost within range of cheapest option');
    if (dt < 0.5) lines.push('Time close to fastest route');
    if (drPct < 5) lines.push(`Low-risk corridor (${formatRisk(route)})`);
  }
  return lines;
}

// ── G. WHY NOT THIS ROUTE ─────────────────────────────────────────────
// Compare against the recommended route (priority-derived), not routes[0].

function whyNotThisRoute(
  index: number,
  route: RoadRoute,
  allRoutes: RoadRoute[],
  indices: RouteIndices,
): string[] {
  if (index === indices.recommendedIndex) return [];
  const rec = allRoutes[indices.recommendedIndex];
  if (!rec) return [];

  const lines: string[] = [];
  const dt = Number(route.time) - Number(rec.time);
  const dc = Number(route.cost) - Number(rec.cost);
  // Integer percent diff so units match the card tile
  const drPct = riskPct(route) - riskPct(rec);

  if (dt > 0.05)  lines.push(`Takes ${dt.toFixed(1)} hrs longer than recommended route`);
  if (dc > 0)     lines.push(`Costs ₹${formatCurrency(dc)} more than recommended route`);
  if (drPct > 0)  lines.push(`Higher risk by ${drPct}% compared to recommended route`);

  return lines;
}

/**
 * Clean up backend key_factors before display.
 * Strips the backend-generated "Estimated risk level: X%" entry because
 * the frontend re-surfaces this value via formatRisk() with consistent
 * Math.round rounding — preventing any card vs. insight mismatch.
 */
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
      /within budget/i.test(t) ||
      // Strip backend risk string — frontend renders it via formatRisk() instead
      /^estimated risk level:/i.test(t)
    ) continue;
    seen.add(low);
    out.push(t.length > 118 ? `${t.slice(0, 115)}…` : t);
  }
  return out;
}

function explainDataSource(route: RoadRoute): string {
  const raw = route as Record<string, unknown>;
  const ds = raw.data_source;
  if (typeof ds === 'string' && ds.trim()) return `Source: ${ds}.`;
  return 'Derived from the road optimization pipeline (geometry, traffic factors, and cost model).';
}

// ── H. DEV VALIDATION ────────────────────────────────────────────────

function devValidate(
  routes: RoadRoute[],
  indices: RouteIndices,
  priority: string,
): void {
  if (process.env.NODE_ENV !== 'development') return;
  if (!routes.length) return;

  const { fastestIndex, cheapestIndex, safestIndex, recommendedIndex } = indices;

  // Cheapest label must match cheapestIndex
  const cheapestCost = Number(routes[cheapestIndex].cost);
  routes.forEach((r, i) => {
    if (Number(r.cost) < cheapestCost) {
      console.warn(
        `[RouteResults] Validation: Route ${i + 1} has lower cost (${r.cost}) than cheapestIndex (${cheapestIndex + 1}, ${routes[cheapestIndex].cost}). cheapestIndex is wrong.`,
      );
    }
  });

  // Fastest label must match fastestIndex
  const fastestTime = Number(routes[fastestIndex].time);
  routes.forEach((r, i) => {
    if (Number(r.time) < fastestTime) {
      console.warn(
        `[RouteResults] Validation: Route ${i + 1} has lower time (${r.time}) than fastestIndex (${fastestIndex + 1}, ${routes[fastestIndex].time}). fastestIndex is wrong.`,
      );
    }
  });

  // Safest label must match safestIndex
  const safestRisk = Number(routes[safestIndex].risk);
  routes.forEach((r, i) => {
    if (Number(r.risk) < safestRisk) {
      console.warn(
        `[RouteResults] Validation: Route ${i + 1} has lower risk (${r.risk}) than safestIndex (${safestIndex + 1}, ${routes[safestIndex].risk}). safestIndex is wrong.`,
      );
    }
  });

  // Recommendation must match priority
  if (priority === 'cost' && recommendedIndex !== cheapestIndex) {
    console.warn(
      `[RouteResults] Validation: priority=cost but recommendedIndex (${recommendedIndex + 1}) ≠ cheapestIndex (${cheapestIndex + 1}).`,
    );
  }
  if (priority === 'time' && recommendedIndex !== fastestIndex) {
    console.warn(
      `[RouteResults] Validation: priority=time but recommendedIndex (${recommendedIndex + 1}) ≠ fastestIndex (${fastestIndex + 1}).`,
    );
  }
  if (priority === 'safe' && recommendedIndex !== safestIndex) {
    console.warn(
      `[RouteResults] Validation: priority=safe but recommendedIndex (${recommendedIndex + 1}) ≠ safestIndex (${safestIndex + 1}).`,
    );
  }

  // Log summary in dev for quick visual check
  console.info(
    `[RouteResults] Indices — fastest: R${fastestIndex + 1}, cheapest: R${cheapestIndex + 1}, safest: R${safestIndex + 1}, recommended: R${recommendedIndex + 1} (priority=${priority})`,
  );

  // Risk consistency: every text reference must equal riskPct(route)
  routes.forEach((r, i) => {
    const canonical = Math.round(Number(r.risk) * 100);
    // Check that no key_factor contains a different risk percentage
    const factors = Array.isArray(r.key_factors) ? r.key_factors : [];
    factors.forEach(f => {
      const m = f.match(/estimated risk level:\s*(\d+)%/i);
      if (m) {
        const backendVal = parseInt(m[1], 10);
        if (backendVal !== canonical) {
          console.warn(
            `[RouteResults] Risk mismatch on Route ${i + 1}: card shows ${canonical}%, key_factor says "${f}". Backend sent ${backendVal}%.`,
          );
        }
      }
    });
  });
}

// ── Toast notification ────────────────────────────────────────────────

type ToastKind = 'success' | 'error';

function Toast({ message, kind, onDone }: { message: string; kind: ToastKind; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999]',
        'flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl',
        'text-[12px] font-medium mono whitespace-nowrap',
        'animate-slide-up',
        kind === 'success'
          ? 'bg-emerald-950/95 border border-emerald-500/30 text-emerald-200'
          : 'bg-red-950/95 border border-red-500/30 text-red-200',
      ].join(' ')}
    >
      <span className="material-symbols-outlined text-[14px]">
        {kind === 'success' ? 'check_circle' : 'error'}
      </span>
      {message}
    </div>
  );
}

// ── Navigation disclaimer ─────────────────────────────────────────────

function NavigationDisclaimer({ waypoints, wasOptimised }: { waypoints: string[]; wasOptimised: boolean }) {
  const hasStops = waypoints.length > 2;
  return (
    <div className="rounded-xl bg-surface-container-low/30 border border-outline-variant/10 px-3 py-2.5 mt-3">
      <div className="text-[9px] uppercase tracking-widest text-outline font-label font-bold mb-1.5">
        Optimised route
      </div>
      <p className="text-[10px] text-on-surface-variant leading-relaxed mono">
        {waypoints.join(' → ')}
      </p>
      {hasStops && (
        <p className="text-[9px] text-outline/70 mt-1.5 leading-relaxed">
          Includes {waypoints.length - 2} intermediate stop{waypoints.length - 2 !== 1 ? 's' : ''}.
          {wasOptimised && ' Stop order was optimised by LogiFlow.'}
        </p>
      )}
      <p className="text-[9px] text-outline/60 mt-1 leading-relaxed italic">
        LogiFlow sets the stop sequence · Google Maps chooses roads between stops
      </p>
    </div>
  );
}

// ── Navigation action buttons ─────────────────────────────────────────

function NavigationActions({
  route,
  isSelected,
  onSave,
}: {
  route: RoadRoute;
  isSelected: boolean;
  onSave: () => void;
}) {
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const user = useAuthStore(s => s.user);

  const navInfo = useMemo(() => getRouteNavigationInfo(route), [route]);

  // Dev consistency check
  useEffect(() => {
    devAssertNavigationConsistency(route, navInfo);
  }, [route, navInfo]);

  const handleStartDriving = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!navInfo.isNavigable) return;
    window.open(navInfo.mapsUrl, '_blank', 'noopener,noreferrer');
  }, [navInfo]);

  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!navInfo.isNavigable) return;
    try {
      await navigator.clipboard.writeText(navInfo.mapsUrl);
      setToast({ message: 'Route link copied to clipboard.', kind: 'success' });
    } catch {
      setToast({ message: 'Unable to copy route link.', kind: 'error' });
    }
  }, [navInfo]);

  const disabled = !navInfo.isNavigable;
  const disabledTitle = 'Navigation unavailable — route waypoints missing.';

  const drivingClass = [
    'flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold transition-all duration-200',
    disabled
      ? 'opacity-40 cursor-not-allowed bg-surface-container/40 text-outline border border-outline-variant/10'
      : isSelected
      ? 'bg-primary text-on-primary hover:bg-primary/90 shadow-[0_0_12px_rgba(172,199,255,0.25)] border border-primary/50'
      : 'bg-surface-container/60 text-on-surface-variant hover:bg-primary/10 hover:text-primary border border-outline-variant/15',
  ].join(' ');

  const shareClass = [
    'flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold transition-all duration-200 border',
    disabled
      ? 'opacity-40 cursor-not-allowed bg-surface-container/40 text-outline border-outline-variant/10'
      : isSelected
      ? 'bg-surface-container/60 text-primary border-primary/30 hover:bg-primary/10'
      : 'bg-surface-container/30 text-on-surface-variant border-outline-variant/15 hover:bg-surface-container/60 hover:text-on-surface',
  ].join(' ');

  return (
    <>
      {toast && (
        <Toast
          message={toast.message}
          kind={toast.kind}
          onDone={() => setToast(null)}
        />
      )}

      <div className="mt-3 pt-3 border-t border-outline-variant/8">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleStartDriving}
            disabled={disabled}
            title={disabled ? disabledTitle : `Start navigation in Google Maps`}
            className={drivingClass}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>
              navigation
            </span>
            Start Driving
          </button>

          <button
            type="button"
            onClick={handleShare}
            disabled={disabled}
            title={disabled ? disabledTitle : 'Copy route link to clipboard'}
            className={shareClass}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
              share
            </span>
            Share Route
          </button>

          {navInfo.waypoints.length > 2 && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setShowPreview(v => !v); }}
              className="ml-auto text-[10px] text-outline hover:text-on-surface-variant transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                {showPreview ? 'expand_less' : 'expand_more'}
              </span>
              {showPreview ? 'Hide' : 'Preview route'}
            </button>
          )}
        </div>

        {/* Route preview — shown on demand, always for multi-stop */}
        {(showPreview || navInfo.waypoints.length > 2) && navInfo.isNavigable && (
          <NavigationDisclaimer
            waypoints={navInfo.waypoints}
            wasOptimised={navInfo.wasStopOrderOptimised}
          />
        )}

        {/* Save Report */}
        <div className="mt-2.5 pt-2.5 border-t border-outline-variant/8">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onSave(); }}
            title={!user ? 'Sign in to save reports' : 'Save this optimized route as a shipment plan'}
            className={[
              'flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold transition-all duration-200 border w-full justify-center',
              isSelected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                : 'bg-surface-container/30 border-outline-variant/15 text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface',
            ].join(' ')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>
              bookmark_add
            </span>
            Save Report
            {!user && <span className="text-[9px] opacity-60">(sign in required)</span>}
          </button>
        </div>
      </div>
    </>
  );
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
    <div className="flex flex-col min-w-0 rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5" style={{ minWidth: '80px' }}>
      {/* Label — allowed to wrap if needed */}
      <div className="text-[10px] text-outline mb-1 flex items-center gap-1 font-medium leading-snug">
        <span aria-hidden>{emoji}</span>
        <span className="min-w-0 overflow-hidden text-ellipsis">{label}</span>
      </div>
      {/* Value — must NEVER wrap */}
      <div className="flex items-baseline gap-0.5 whitespace-nowrap">
        <span className="text-[15px] font-bold text-primary mono tabular-nums leading-tight">{value}</span>
        {unit && <span className="text-outline text-xs font-medium ml-0.5 shrink-0">{unit}</span>}
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
  source,
  destination,
  routes,
  confidence,
  indices,
}: {
  route: RoadRoute;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  source: string;
  destination: string;
  routes: RoadRoute[];
  confidence: number;
  indices: RouteIndices;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [dynamicExplanation, setDynamicExplanation] = useState<string | null>(null);
  const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  const priority   = useLogiFlowStore(s => s.priority);
  const storeSource      = useLogiFlowStore(s => s.source);
  const storeDestination = useLogiFlowStore(s => s.destination);
  const cargoType        = useLogiFlowStore(s => s.cargoType);
  const searchMode       = useLogiFlowStore(s => s.searchMode);

  const factors = Array.isArray(route.key_factors) ? route.key_factors : [];
  const ml = route.ml_summary;

  const isCheapest    = index === indices.cheapestIndex;
  const isFastest     = index === indices.fastestIndex;
  const isSafest      = index === indices.safestIndex;
  const isRecommended = index === indices.recommendedIndex;

  const costBreakdown = useMemo(() => buildCostBreakdown(route), [route]);
  const insights      = sanitizeInsights(route.reason, factors);

  // B — insight label derived from single source of truth
  const insightLabel  = routeInsightLabel(index, indices);

  // F — why this route was selected
  const whyThisLines  = useMemo(
    () => whyThisRoute(index, route, routes, indices),
    [index, route, routes, indices],
  );

  // G — why not this route (vs. recommended)
  const notReasons = useMemo(
    () => whyNotThisRoute(index, route, routes, indices),
    [index, route, routes, indices],
  );

  // C — confidence explanation always matches badge value
  const confidenceNote = explainConfidence(confidence, route, routes, index, indices);
  const dataSourceNote = explainDataSource(route);

  // Reset AI explanation when route changes
  useEffect(() => {
    setDynamicExplanation(null);
    setIsLoadingExplanation(false);
  }, [route]);

  // Dev: verify risk displayed in insight matches card metric
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const cardRisk = riskPct(route);
    const factors = Array.isArray(route.key_factors) ? route.key_factors : [];
    factors.forEach(f => {
      const m = f.match(/estimated risk level:\s*(\d+)%/i);
      if (m) {
        const insightRisk = parseInt(m[1], 10);
        if (insightRisk !== cardRisk) {
          console.warn(
            `[RouteCard R${index + 1}] Risk mismatch — card: ${cardRisk}%, insight: "${f}"`,
            { route_risk_raw: route.risk },
          );
        }
      }
    });
  }, [route, index]);

  const handleExplain = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoadingExplanation(true);
    const expl = await fetchExplanation({
      pipeline: 'road',
      priority,
      route_data: route,
      context: { best_route: routes[indices.recommendedIndex] },
    });
    if (expl) setDynamicExplanation(expl);
    setIsLoadingExplanation(false);
  };

  return (
    <>
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
        'w-full text-left rounded-xl border transition-all duration-300 cursor-pointer overflow-hidden',
        isSelected
          ? 'border-primary/60 bg-surface-container/60 shadow-[0_0_0_2px_rgba(172,199,255,0.18),0_0_24px_rgba(172,199,255,0.10)] sm:scale-[1.01]'
          : 'border-outline-variant/12 bg-surface-container-lowest/30 hover:bg-surface-container/30 hover:border-outline-variant/25',
      ].join(' ')}
    >
      {/* Summary bar */}
      <div className="px-4 py-2.5 bg-surface-container/25 border-b border-outline-variant/8">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] leading-relaxed text-on-surface-variant mono truncate">
            {route.waypoints && route.waypoints.length > 2
              ? route.waypoints.join(' → ')
              : `${source || 'Origin'} → ${destination || 'Destination'}`}{' '}
            · {Number(route.distance_km ?? 0).toFixed(0)} km · {Number(route.time).toFixed(1)}h ·{' '}
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
                {/* "Top pick" only on the recommended route */}
                {isRecommended && (
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
                {/* Multi-stop badge */}
                {(route.stop_count ?? 0) > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-violet-500/12 text-violet-300 mono border border-violet-500/20">
                    {route.stop_count} stop{route.stop_count !== 1 ? 's' : ''}
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
            <div className="text-[15px] font-black mono text-primary leading-tight whitespace-nowrap">
              ₹{formatCurrency(route.cost)}
            </div>
            {route.cost_range && (
              <div className="text-[10px] text-outline mono mt-0.5 whitespace-nowrap">
                ₹{formatCurrency(route.cost_range.low)}–₹{formatCurrency(route.cost_range.high)}
              </div>
            )}
          </div>
        </div>

        {/* Metrics */}
        <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))' }}>
          <MetricTile emoji="⏱" label="Time"     value={Number(route.time).toFixed(1)}                   unit="hrs" />
          <MetricTile emoji="💰" label="Cost"     value={`₹${formatCurrency(route.cost)}`} />
          <MetricTile emoji="⚠️" label="Risk"     value={riskPct(route)}                                  unit="%" />
          <MetricTile emoji="📍" label="Distance" value={Number(route.distance_km ?? 0).toFixed(0)}       unit="km" />
        </div>

        {/* Multi-stop leg breakdown */}
        {route.waypoints && route.waypoints.length > 2 && (
          <div className="mb-4 rounded-xl bg-surface-container-low/30 border border-outline-variant/10 px-3 py-2.5">
            <div className="text-[9px] uppercase tracking-widest text-outline font-label font-bold mb-2">
              Stop summary · {route.waypoints.length - 1} leg{route.waypoints.length - 2 > 1 ? 's' : ''}
            </div>
            <ol className="space-y-1">
              {route.waypoints.map((wp, wi) => {
                const seg = route.segments?.[wi];
                const isLast = wi === route.waypoints!.length - 1;
                return (
                  <li key={`${wp}-${wi}`} className="flex items-center gap-2 text-[11px]">
                    <span className={[
                      'w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0',
                      wi === 0
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : isLast
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-violet-500/15 text-violet-300 border border-violet-500/20',
                    ].join(' ')}>
                      {wi === 0 ? 'O' : isLast ? 'D' : wi}
                    </span>
                    <span className="text-on-surface-variant truncate flex-1">{wp}</span>
                    {seg && !isLast && (
                      <span className="text-outline mono text-[9px] shrink-0">
                        {seg.distance_km?.toFixed(0)} km · {seg.duration_minutes ? Math.round(seg.duration_minutes / 60 * 10) / 10 : '—'}h
                      </span>
                    )}
                    {!isLast && (
                      <span className="text-outline/40 shrink-0 text-[9px]">↓</span>
                    )}
                  </li>
                );
              })}
            </ol>
            {route.stop_order_optimised && (
              <p className="mt-2 text-[9px] text-violet-300/70 italic">
                Stop order was automatically optimised for shortest path.
              </p>
            )}
          </div>
        )}

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
                colorClass:
                  ml.delay_hours > 0.05
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-emerald-500/15 text-emerald-300',
              },
            ].map(item => (
              <div
                key={item.label}
                className="px-2 py-1.5 rounded-lg bg-surface-container-low/40 border border-outline-variant/10"
              >
                <div className="text-outline/60 mb-1 text-[9px] uppercase tracking-widest">{item.label}</div>
                <span className={`inline-block px-1.5 py-0.5 rounded font-semibold ${item.colorClass}`}>
                  {typeof item.val === 'string' ? item.val.toUpperCase() : item.val}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Confidence + Data source */}
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

        {/* E. Cost breakdown — transparent itemised view */}
        <div className="pt-3 mt-3 border-t border-outline-variant/8">
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
                    ['🚛  Fuel cost',            costBreakdown.fuel],
                    ['👤  Driver cost',           costBreakdown.driver],
                    ['🛣️  Toll charges',          costBreakdown.toll],
                    ['📦  Weight handling',       costBreakdown.handling],
                    ['🛑  Stop charges',          costBreakdown.stops],
                    ['🧾  GST (5%)',              costBreakdown.gst],
                    ...(costBreakdown.documentation > 0
                      ? [['📄  Documentation', costBreakdown.documentation] as [string, number]]
                      : []),
                  ].map(([label, val]) => (
                    <tr key={String(label)} className="bg-surface-container-lowest/15">
                      <td className="py-2 pl-3 text-on-surface-variant">{label}</td>
                      <td className="py-2 pr-3 text-right mono font-medium text-on-surface tabular-nums">
                        ₹{formatCurrency(val)}
                      </td>
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr className="bg-surface-container/30 border-t-2 border-outline-variant/20">
                    <td className="py-2.5 pl-3 font-bold text-on-surface text-[11px]">Total</td>
                    <td className="py-2.5 pr-3 text-right mono font-black text-primary tabular-nums text-[12px]">
                      ₹{formatCurrency(costBreakdown.total)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="px-3 py-2 text-[9px] text-outline/60 italic">
                Some line items are estimated using standard road freight rates when exact quotes are unavailable.
              </p>
            </div>
          )}
        </div>

        {/* F. Why this route */}
        {whyThisLines.length > 0 && (
          <div className="mt-3 pt-3 border-t border-outline-variant/8">
            <div className="text-[9px] uppercase tracking-[0.12em] text-outline font-label font-bold mb-1.5">
              Why this route?
            </div>
            <ul className="text-[11px] text-on-surface-variant space-y-1 mono">
              {whyThisLines.map(line => (
                <li key={line} className="flex gap-2">
                  <span className="text-emerald-400/80 shrink-0">✓</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* G. Why not this route */}
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

        {/* B. Route insight (always from single source of truth) */}
        <div className="mt-3 pt-3 border-t border-outline-variant/8">
          <div className="text-[9px] uppercase tracking-[0.12em] text-outline font-label font-bold mb-1.5 flex justify-between items-center">
            <span>Route insight</span>
            {!dynamicExplanation && (
              <button
                onClick={handleExplain}
                disabled={isLoadingExplanation}
                className="px-2 py-0.5 bg-primary/10 text-primary text-[9px] rounded hover:bg-primary/20 transition disabled:opacity-50"
              >
                {isLoadingExplanation ? 'Analyzing...' : 'AI Explain'}
              </button>
            )}
          </div>

          {dynamicExplanation ? (
            <ul className="mb-2 space-y-1.5 text-[11px] text-on-surface-variant leading-relaxed bg-surface-container-low/40 p-2 rounded border border-outline-variant/10">
              {dynamicExplanation
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean)
                .map((line, i) => (
                  <li key={`${line}-${i}`} className="flex gap-2">
                    <span className="text-primary/70 shrink-0">•</span>
                    <span>{line.replace(/^[-*]\s*/, '')}</span>
                  </li>
                ))}
            </ul>
          ) : (
            <>
              {/* Priority-derived insight first */}
              {insightLabel && (
                <p className="text-[11px] text-on-surface font-medium mb-1.5 leading-relaxed">
                  {insightLabel}
                </p>
              )}
              {/* Risk level — always from formatRisk(), never from backend string */}
              <p className="text-[11px] text-on-surface-variant mb-1.5 leading-relaxed">
                Estimated risk level: <span className="font-semibold text-on-surface">{formatRisk(route)}</span>
              </p>
              {/* Backend reason (filtered) */}
              {route.reason && !/^optimized for\b/i.test(route.reason.trim()) && (
                <p className="text-[11px] text-on-surface-variant mb-1.5 leading-relaxed">
                  {route.reason}
                </p>
              )}
              {/* Key factors (backend "Estimated risk level:" stripped by sanitizeInsights) */}
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
              {!insightLabel && !route.reason && insights.length === 0 && (
                <p className="text-[11px] text-outline italic">No additional route insights available.</p>
              )}
            </>
          )}
        </div>

        {/* Navigation actions — Start Driving + Share Route + Save Report */}
        <NavigationActions route={route} isSelected={isSelected} onSave={() => setSaveModalOpen(true)} />
      </div>
    </div>

    {/* Save Report modal — rendered outside the card button so clicks don't bubble */}
    <SaveReportModal
      isOpen={saveModalOpen}
      onClose={() => setSaveModalOpen(false)}
      prefill={{
        source: source || storeSource,
        destination: destination || storeDestination,
        stops: route.stops,
        mode: (searchMode === 'road' ? 'road' : searchMode === 'rail' ? 'rail' : searchMode === 'air' ? 'air' : searchMode === 'water' ? 'water' : 'road') as ReportMode,
        cargoType,
        optimizationInput: { priority, route_id: route.route_id },
        optimizationResult: route as unknown as Record<string, unknown>,
        estimatedCost: route.cost,
        estimatedTime: route.time,
        riskScore: route.risk,
      }}
    />
  </>
  );
}

// ── D. Recommendation Panel ───────────────────────────────────────────

function RecommendationPanel({
  routes,
  indices,
}: {
  routes: RoadRoute[];
  indices: RouteIndices;
}) {
  const priority = useLogiFlowStore(s => s.priority);

  const lines = useMemo(() => {
    if (!routes.length) return [];
    const out: string[] = [];

    const { fastestIndex, cheapestIndex, safestIndex, recommendedIndex } = indices;
    const fr = fastestIndex  + 1;
    const ch = cheapestIndex + 1;
    const sf = safestIndex   + 1;
    const rc = recommendedIndex + 1;

    // Primary recommendation always matches selected priority
    if (priority === 'cost') {
      out.push(
        `Most cost-efficient → Route ${ch} (₹${formatCurrency(routes[cheapestIndex]?.cost)}).`,
      );
    } else if (priority === 'time') {
      out.push(
        `Fastest option → Route ${fr} (${Number(routes[fastestIndex]?.time).toFixed(1)} hrs).`,
      );
    } else if (priority === 'safe') {
      out.push(`Safest route → Route ${sf} (lowest risk exposure).`);
    } else {
      out.push(`Route ${rc} offers the best overall balance across cost, time, and risk.`);
    }

    // Always surface speed + cost champions when they differ
    if (routes.length > 1) {
      if (fr === ch) {
        if (priority !== 'time' && priority !== 'cost')
          out.push(`Route ${fr} leads on both speed and cost.`);
      } else {
        if (priority !== 'time') out.push(`Fastest → Route ${fr}.`);
        if (priority !== 'cost') out.push(`Lowest cost → Route ${ch}.`);
      }
    }

    // Surface safest when not already the primary recommendation
    if (routes.length > 1 && priority !== 'safe' && sf !== fr && sf !== ch) {
      out.push(`Lowest risk → Route ${sf}.`);
    }

    return [...new Set(out)].slice(0, 4);
  }, [routes, indices, priority]);

  if (!routes.length) return null;

  return (
    <div className="rounded-xl border border-outline-variant/12 bg-surface-container/20 p-4 shrink-0">
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
  const routes         = useLogiFlowStore(s => s.routes);
  const selectedRoute  = useLogiFlowStore(s => s.selectedRoute);
  const setSelectedRoute = useLogiFlowStore(s => s.setSelectedRoute);
  const priority       = useLogiFlowStore(s => s.priority);
  const source         = useLogiFlowStore(s => s.source);
  const destination    = useLogiFlowStore(s => s.destination);
  const roadNoRoutesReason = useLogiFlowStore(s => s.roadNoRoutesReason);

  // A. Single source of truth — computed once, used everywhere
  const indices = useMemo(
    () => deriveRouteIndices(routes, priority),
    [routes, priority],
  );

  // Auto-select recommended route whenever routes or priority changes
  useEffect(() => {
    if (!routes.length) return;
    setSelectedRoute(indices.recommendedIndex);
  }, [routes, priority, indices.recommendedIndex, setSelectedRoute]);

  // H. Dev-mode consistency assertions
  useEffect(() => {
    devValidate(routes, indices, priority);
  }, [routes, indices, priority]);

  // ── Invalid corridor: backend rejected this route as physically undrivable ──
  if (roadNoRoutesReason) {
    return (
      <section className="p-4 sm:p-6">
        <InvalidCorridorCard
          mode="road"
          source={source}
          destination={destination}
          reason={roadNoRoutesReason}
        />
      </section>
    );
  }

  if (!routes || routes.length === 0) return null;

  const safeIndex = Math.min(selectedRoute, routes.length - 1);

  return (
    <section>
      {/* Header */}
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[10px] font-label font-bold uppercase tracking-[0.12em] text-outline">
            Analysis
          </div>
          <div className="text-sm font-semibold text-on-surface mt-0.5">
            {routes.length} route{routes.length !== 1 ? 's' : ''} found
          </div>
        </div>
        <div className="text-[10px] mono text-on-surface-variant break-words sm:text-right">
          {(() => {
            const wp = routes[0]?.waypoints;
            if (wp && wp.length > 2) return wp.join(' → ');
            return `${source} → ${destination}`;
          })()}
        </div>
      </div>

      {/* Final sequence banner — shown when multi-stop results have waypoints */}
      {(() => {
        const selectedWp = routes[safeIndex]?.waypoints;
        const wasOptimised = routes[safeIndex]?.stop_order_optimised ?? false;
        if (!selectedWp || selectedWp.length <= 2) return null;
        return (
          <div className="mb-4 rounded-xl border border-violet-500/20 bg-violet-500/5 px-3.5 py-3">
            <div className="text-[9px] uppercase tracking-widest text-violet-400/70 font-label font-bold mb-1.5">
              Final optimised stop sequence
            </div>
            <p className="text-[11px] text-on-surface-variant mono leading-relaxed">
              {selectedWp.join(' → ')}
            </p>
            <p className="text-[9px] text-outline/60 mt-1.5 leading-relaxed">
              {wasOptimised
                ? 'Stop order was optimised by LogiFlow for better efficiency.'
                : 'Stop order follows your input.'}{' '}
              Google Maps handles road selection between stops.
            </p>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Cards column */}
        <div className="lg:col-span-1 max-h-none space-y-4 pr-0 sm:pr-1 lg:max-h-[80vh] lg:overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]">
          {/* D. Recommendation panel receives indices directly */}
          <RecommendationPanel routes={routes} indices={indices} />

          {routes.map((r, i) => (
            <RouteCard
              key={`${i}-${r.cost}-${r.time}-${r.risk}`}
              route={r}
              index={i}
              isSelected={i === selectedRoute}
              onSelect={() => setSelectedRoute(i)}
              source={source}
              destination={destination}
              routes={routes}
              confidence={computeConfidence(r, routes, i, indices)}
              indices={indices}
            />
          ))}
        </div>

        {/* Map column */}
        <div className="lg:col-span-2 lg:sticky lg:top-4 w-full min-h-[240px] h-[min(55vh,420px)] sm:min-h-[300px] sm:h-[min(60vh,480px)] lg:h-[80vh] lg:min-h-[320px]">
          <div className="flex flex-col h-full min-h-0 bg-surface-container-lowest/25 border border-outline-variant/10 rounded-xl p-4 shadow-sm">
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
                waypoints={routes[safeIndex]?.waypoints}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
