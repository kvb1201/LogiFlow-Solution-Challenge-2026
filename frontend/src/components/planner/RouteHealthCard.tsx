'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePlannerStore } from '@/store/usePlannerStore';
import type { ReoptimizationRecommendation, ShipmentReport } from '@/services/plannerApi';

// ── Design tokens ─────────────────────────────────────────────────────────

const HEALTH_CONFIG = {
  healthy: {
    label: 'Healthy',
    icon: 'check_circle',
    gradient: 'from-emerald-500/15 to-emerald-500/5',
    border: 'border-emerald-500/25',
    text: 'text-emerald-300',
    dot: 'bg-emerald-400',
    badge: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
  },
  moderate: {
    label: 'Moderate',
    icon: 'warning',
    gradient: 'from-amber-500/15 to-amber-500/5',
    border: 'border-amber-500/25',
    text: 'text-amber-300',
    dot: 'bg-amber-400',
    badge: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
  },
  at_risk: {
    label: 'At Risk',
    icon: 'error',
    gradient: 'from-red-500/15 to-red-500/5',
    border: 'border-red-500/25',
    text: 'text-red-400',
    dot: 'bg-red-400',
    badge: 'bg-red-500/15 border-red-500/30 text-red-400',
  },
} as const;

const ACTION_LABELS = {
  continue: 'Continue on current route',
  monitor: 'Monitor closely',
  reoptimize: 'Reoptimization recommended',
} as const;

const CORRIDOR_CONFIG = {
  ON_ROUTE: {
    label: 'On Route',
    style: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/20',
    icon: 'route',
  },
  NEAR_ROUTE: {
    label: 'Near Route',
    style: 'bg-amber-500/12 text-amber-300 border-amber-500/20',
    icon: 'near_me',
  },
  OFF_ROUTE: {
    label: 'Off Route',
    style: 'bg-red-500/12 text-red-400 border-red-500/20',
    icon: 'wrong_location',
  },
} as const;

const DEVIATION_CONFIG = {
  none: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/20',
  minor: 'bg-amber-500/12 text-amber-300 border-amber-500/20',
  major: 'bg-red-500/12 text-red-400 border-red-500/20',
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────

function metric(value: number | null | undefined, type: 'cost' | 'time' | 'risk' | 'eta' = 'time') {
  if (value == null || !Number.isFinite(value)) return '—';
  if (type === 'cost') return `₹${Math.round(value).toLocaleString('en-IN')}`;
  if (type === 'risk') return `${Math.round(value * 100)}%`;
  if (type === 'eta') return `${Math.round(value)}m`;
  return `${value.toFixed(1)}h`;
}

// ── Reoptimization Review panel ───────────────────────────────────────────

function ReoptimizationReview({
  recommendation,
  onSave,
  saving,
  savedReportId,
}: {
  recommendation: ReoptimizationRecommendation;
  onSave: () => void;
  saving: boolean;
  savedReportId: string | null;
}) {
  const current = recommendation.current_plan.metrics;
  const updated = recommendation.updated_plan.metrics;

  return (
    <div className="mt-4 rounded-xl border border-primary/25 bg-primary/8 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold">
            Re-Optimization Results
          </div>
          <div className="text-sm font-bold text-foreground">Current Plan vs Updated Plan</div>
        </div>
        {recommendation.eta_delta_minutes != null && (
          <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            ETA {recommendation.eta_delta_minutes >= 0 ? '+' : ''}
            {recommendation.eta_delta_minutes}m
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { title: 'Current Plan', plan: recommendation.current_plan, metrics: current },
          { title: 'Updated Plan', plan: recommendation.updated_plan, metrics: updated },
        ].map(item => (
          <div key={item.title} className="rounded-xl border border-border/30 bg-surface/45 p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-outline">
              {item.title}
            </div>
            <div className="mb-3 truncate text-[11px] font-semibold text-foreground mono">
              {item.plan.source} → {item.plan.destination}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-[9px] uppercase text-muted-foreground">Cost</div>
                <div className="text-[11px] font-bold text-foreground mono">
                  {metric(item.metrics.cost, 'cost')}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase text-muted-foreground">Time</div>
                <div className="text-[11px] font-bold text-foreground mono">
                  {metric(item.metrics.time, 'time')}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase text-muted-foreground">Risk</div>
                <div className="text-[11px] font-bold text-foreground mono">
                  {metric(item.metrics.risk, 'risk')}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || savedReportId != null}
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {savedReportId ? 'Revision Saved' : saving ? 'Saving…' : 'Save Revision'}
        </button>
        {savedReportId && (
          <Link
            href={`/reports/${savedReportId}`}
            className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20"
          >
            Open Revision
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

interface Props {
  report: ShipmentReport;
}

export function RouteHealthCard({ report }: Props) {
  const router = useRouter();
  const {
    routeHealth,
    routeHealthLoading,
    reoptimization,
    reoptimizationLoading,
    saving,
    fetchRouteHealth,
    reoptimizeTrip,
    saveRevision,
  } = usePlannerStore();

  const [useEstimatedLocation, setUseEstimatedLocation] = useState(true);
  const [actualLocation, setActualLocation] = useState('');
  const [savedRevisionId, setSavedRevisionId] = useState<string | null>(null);

  useEffect(() => {
    fetchRouteHealth(report.id);
  }, [report.id, fetchRouteHealth]);

  const runCheck = () => {
    fetchRouteHealth(report.id, useEstimatedLocation ? undefined : actualLocation);
  };

  // Phase 4 — current location for reoptimize: prefer actual input, then corridor-matched city, then estimated
  const currentLocationForReoptimize = () => {
    if (!useEstimatedLocation && actualLocation.trim()) return actualLocation.trim();
    if (routeHealth?.actual_location?.label) return routeHealth.actual_location.label;
    // Use corridor_matched_city if on/near route, else estimated label
    if (routeHealth?.corridor_matched_city) return routeHealth.corridor_matched_city;
    return (
      routeHealth?.estimated_location?.label ||
      routeHealth?.estimated_location?.segment_end ||
      report.source
    );
  };

  const handleReoptimize = async () => {
    const currentLocation = currentLocationForReoptimize();
    // Remaining stops: all stops after current location
    const waypoints = [report.source, ...report.stops, report.destination];
    const clNorm = currentLocation.toLowerCase();
    const clIdx = waypoints.findIndex(w => w.toLowerCase() === clNorm);
    const afterCl = clIdx >= 0 ? waypoints.slice(clIdx + 1) : waypoints.slice(1);
    const remainingStops = afterCl.slice(0, -1); // exclude destination

    await reoptimizeTrip(report.id, {
      current_location: currentLocation,
      remaining_stops: remainingStops,
      destination: report.destination,
    });
    setSavedRevisionId(null);
  };

  const handleSaveRevision = async () => {
    if (!reoptimization?.recommendation) return;
    const rec = reoptimization.recommendation;
    const saved = await saveRevision(report.id, {
      name: `${report.name} · Revision`,
      current_location: rec.current_location,
      remaining_stops: rec.remaining_stops,
      destination: rec.destination,
      recommendation: rec,
    });
    setSavedRevisionId(saved.id);
  };

  // Phase 8 — Regenerate Plan: prefill with current location and remaining route
  const handleRegeneratePlan = () => {
    const currentLoc = currentLocationForReoptimize();
    const waypoints = [report.source, ...report.stops, report.destination];
    const clNorm = currentLoc.toLowerCase();
    const clIdx = waypoints.findIndex(w => w.toLowerCase() === clNorm);
    const afterCl = clIdx >= 0 ? waypoints.slice(clIdx + 1) : waypoints.slice(1);
    const remainingStops = afterCl.slice(0, -1);
    const destination = report.destination;

    const params = new URLSearchParams({
      source: currentLoc,
      destination,
    });
    if (remainingStops.length > 0) {
      params.set('stops', remainingStops.join(','));
    }
    router.push(`/${report.mode}?${params.toString()}`);
  };

  if (routeHealthLoading) {
    return (
      <div data-route-health className="rounded-2xl border border-border/40 bg-surface/30 p-5">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
          <span className="text-sm text-muted-foreground">Checking route health…</span>
        </div>
      </div>
    );
  }

  if (!routeHealth) return null;

  const config = HEALTH_CONFIG[routeHealth.health_level];
  const corridorCfg =
    CORRIDOR_CONFIG[routeHealth.corridor_status as keyof typeof CORRIDOR_CONFIG] ||
    CORRIDOR_CONFIG.ON_ROUTE;

  return (
    <div
      data-route-health
      className={`rounded-2xl border ${config.border} bg-gradient-to-br ${config.gradient} p-5`}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span
            className={`material-symbols-outlined ${config.text}`}
            style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
          >
            {config.icon}
          </span>
          <div>
            <div className="text-[9px] uppercase tracking-[0.14em] text-outline font-bold">
              Route Health
            </div>
            <div className={`text-sm font-bold ${config.text}`}>{config.label}</div>
          </div>
        </div>
        <span
          className={`text-[9px] px-2 py-0.5 rounded-md border font-semibold uppercase tracking-wide ${config.badge}`}
        >
          Risk: {routeHealth.delay_risk}
        </span>
      </div>

      {/* ── Location row ── */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {/* Estimated Location — Phase 2: now shows city name */}
        <div className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-3">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">
            Estimated Location
          </div>
          <div className="text-sm font-bold text-foreground leading-snug">
            {routeHealth.estimated_location?.label || 'Not available'}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground mono">
            {routeHealth.estimated_location?.confidence === 'high'
              ? 'Route intelligence'
              : routeHealth.estimated_location?.latitude != null &&
                routeHealth.estimated_location?.longitude != null
              ? `${routeHealth.estimated_location.latitude}, ${routeHealth.estimated_location.longitude}`
              : routeHealth.estimated_location?.confidence || 'low confidence'}
          </div>
        </div>

        {/* Current / Actual Location */}
        <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low/45 px-3 py-3">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">
            Current Location
          </div>
          <div className="text-sm font-bold text-foreground leading-snug">
            {routeHealth.actual_location?.label ?? 'Using estimated location'}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground mono">
            {routeHealth.deviation_km != null
              ? `${routeHealth.deviation_km} km from estimate`
              : 'No manual input'}
          </div>
        </div>

        {/* Phase 3 — Corridor Status */}
        <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low/45 px-3 py-3">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">
            Corridor Status
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold uppercase ${corridorCfg.style}`}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1" }}
            >
              {corridorCfg.icon}
            </span>
            {corridorCfg.label}
          </span>
          {routeHealth.corridor_matched_city && (
            <div className="mt-1 text-[10px] text-muted-foreground mono">
              Near: {routeHealth.corridor_matched_city}
            </div>
          )}
        </div>
      </div>

      {/* ── Progress + Metrics row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">
            Progress
          </div>
          <div className="text-sm font-bold text-foreground mono">
            {routeHealth.progress_percentage}%
          </div>
        </div>
        <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">
            Remaining
          </div>
          <div className="text-sm font-bold text-foreground mono">
            {routeHealth.remaining_minutes}m
          </div>
        </div>
        {/* Phase 4 — Updated ETA */}
        <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">
            Updated ETA
          </div>
          <div className="text-sm font-bold text-foreground mono">
            {routeHealth.updated_eta_minutes != null
              ? `${routeHealth.updated_eta_minutes}m`
              : `${routeHealth.eta_variance_minutes}m`}
          </div>
        </div>
        <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">
            Deviation
          </div>
          <span
            className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${DEVIATION_CONFIG[routeHealth.deviation_level]}`}
          >
            {routeHealth.deviation_level}
          </span>
        </div>
      </div>

      {/* Phase 4 — Updated Cost + Risk (when available) */}
      {(routeHealth.updated_cost != null || routeHealth.updated_risk != null) && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          {routeHealth.updated_cost != null && (
            <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
              <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">
                Updated Cost
              </div>
              <div className="text-sm font-bold text-foreground mono">
                ₹{Math.round(routeHealth.updated_cost).toLocaleString('en-IN')}
              </div>
            </div>
          )}
          {routeHealth.updated_risk != null && (
            <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
              <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">
                Updated Risk
              </div>
              <div className="text-sm font-bold text-foreground mono">
                {Math.round(routeHealth.updated_risk * 100)}%
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Location input toggle ── */}
      <div className="mb-4 rounded-xl bg-surface-container-low/20 border border-outline-variant/8 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setUseEstimatedLocation(true)}
            className={[
              'rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition',
              useEstimatedLocation
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-border/30 bg-surface/30 text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            Use Estimated Location
          </button>
          <button
            type="button"
            onClick={() => setUseEstimatedLocation(false)}
            className={[
              'rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition',
              !useEstimatedLocation
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-border/30 bg-surface/30 text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            Enter Current Location
          </button>
        </div>

        {!useEstimatedLocation && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={actualLocation}
              onChange={e => setActualLocation(e.target.value)}
              placeholder="e.g. Vadodara"
              className="min-w-0 flex-1 rounded-lg border border-border/40 bg-surface-container-lowest/50 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/40"
            />
            <button
              type="button"
              onClick={runCheck}
              disabled={!actualLocation.trim()}
              className="rounded-lg border border-primary/35 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Evaluate
            </button>
          </div>
        )}

        {useEstimatedLocation && (
          <button
            type="button"
            onClick={runCheck}
            className="mt-3 rounded-lg border border-primary/35 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20"
          >
            Refresh Health
          </button>
        )}
      </div>

      {/* ── Recommended Action ── */}
      <div className="rounded-xl bg-surface-container-low/20 border border-outline-variant/8 px-3 py-2.5">
        <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">
          Recommended Action
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {ACTION_LABELS[routeHealth.recommended_action]}
        </p>

        {/* Phase 6 — show reoptimization reason */}
        {routeHealth.reoptimization_reason && (
          <p className="mt-1 text-[10px] text-outline italic leading-relaxed">
            {routeHealth.reoptimization_reason}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {/* Show Reoptimize button when reoptimization_recommended is true */}
          {(routeHealth.recommended_action === 'reoptimize' ||
            routeHealth.reoptimization_recommended) && (
            <button
              type="button"
              onClick={handleReoptimize}
              disabled={reoptimizationLoading}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {reoptimizationLoading ? 'Generating Updated Plan…' : 'Reoptimize Trip'}
            </button>
          )}

          {/* Phase 8 — Regenerate Plan with current location prefill */}
          <button
            type="button"
            onClick={handleRegeneratePlan}
            className="rounded-lg border border-primary/30 bg-primary/8 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20"
          >
            Regenerate Plan
          </button>
        </div>
      </div>

      {/* Reoptimization results */}
      {reoptimization?.report_id === report.id && (
        <ReoptimizationReview
          recommendation={reoptimization.recommendation}
          onSave={handleSaveRevision}
          saving={saving}
          savedReportId={savedRevisionId}
        />
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center gap-2 text-[9px] text-outline">
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot} animate-pulse`} />
        Last checked:{' '}
        {new Date(routeHealth.checked_at).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
    </div>
  );
}
