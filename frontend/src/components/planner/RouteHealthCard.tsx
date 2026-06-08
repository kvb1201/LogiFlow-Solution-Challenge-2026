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
    scoreColor: 'text-emerald-300',
  },
  moderate: {
    label: 'Moderate',
    icon: 'warning',
    gradient: 'from-amber-500/15 to-amber-500/5',
    border: 'border-amber-500/25',
    text: 'text-amber-300',
    dot: 'bg-amber-400',
    badge: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
    scoreColor: 'text-amber-300',
  },
  at_risk: {
    label: 'At Risk',
    icon: 'error',
    gradient: 'from-red-500/15 to-red-500/5',
    border: 'border-red-500/25',
    text: 'text-red-400',
    dot: 'bg-red-400',
    badge: 'bg-red-500/15 border-red-500/30 text-red-400',
    scoreColor: 'text-red-400',
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

// ── Reoptimization Review ─────────────────────────────────────────────────

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
              {(['cost', 'time', 'risk'] as const).map(k => (
                <div key={k}>
                  <div className="text-[9px] uppercase text-muted-foreground">{k}</div>
                  <div className="text-[11px] font-bold text-foreground mono">
                    {metric(item.metrics[k], k)}
                  </div>
                </div>
              ))}
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

// ── Issue 4 — Route Corridor display ─────────────────────────────────────

function RouteCorridor({ cities, currentLocation }: { cities: string[]; currentLocation?: string }) {
  if (!cities.length) return null;
  const currentNorm = (currentLocation || '').toLowerCase();

  return (
    <div className="mt-4 rounded-xl border border-outline-variant/15 bg-surface-container-low/20 p-3">
      <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-3">
        Route Corridor
      </div>
      <div className="flex flex-col gap-1">
        {cities.map((city, i) => {
          const isFirst = i === 0;
          const isLast = i === cities.length - 1;
          const isCurrent = city.toLowerCase() === currentNorm;
          return (
            <div key={`${city}-${i}`} className="flex items-center gap-2">
              {/* Connector line */}
              <div className="flex flex-col items-center" style={{ width: '16px' }}>
                {!isFirst && (
                  <div className="w-px flex-1 bg-outline-variant/30" style={{ height: '8px' }} />
                )}
                <div
                  className={[
                    'h-2 w-2 rounded-full shrink-0',
                    isFirst
                      ? 'bg-primary'
                      : isLast
                      ? 'bg-emerald-400'
                      : isCurrent
                      ? 'bg-amber-400 ring-2 ring-amber-400/30'
                      : 'bg-outline/40',
                  ].join(' ')}
                />
                {!isLast && (
                  <div className="w-px flex-1 bg-outline-variant/30" style={{ height: '8px' }} />
                )}
              </div>

              <span
                className={[
                  'text-[11px] font-medium capitalize',
                  isFirst
                    ? 'text-primary'
                    : isLast
                    ? 'text-emerald-300'
                    : isCurrent
                    ? 'text-amber-300 font-bold'
                    : 'text-muted-foreground',
                ].join(' ')}
              >
                {city}
                {isCurrent && (
                  <span className="ml-1.5 text-[9px] rounded bg-amber-500/15 border border-amber-500/25 px-1 py-0.5 font-bold uppercase tracking-wide text-amber-300">
                    here
                  </span>
                )}
                {isFirst && !isCurrent && (
                  <span className="ml-1.5 text-[9px] text-outline">origin</span>
                )}
                {isLast && !isCurrent && (
                  <span className="ml-1.5 text-[9px] text-outline">destination</span>
                )}
              </span>
            </div>
          );
        })}
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

  // Issue 5 — location can be from dropdown (route city) or manual free text
  const [locationMode, setLocationMode] = useState<'estimated' | 'dropdown' | 'manual'>('estimated');
  const [selectedCity, setSelectedCity] = useState('');
  const [manualLocation, setManualLocation] = useState('');
  const [savedRevisionId, setSavedRevisionId] = useState<string | null>(null);
  const [showCorridor, setShowCorridor] = useState(false);

  useEffect(() => {
    fetchRouteHealth(report.id);
  }, [report.id, fetchRouteHealth]);

  // Derive the active current-location string
  const activeLocation = (): string => {
    if (locationMode === 'dropdown') return selectedCity;
    if (locationMode === 'manual') return manualLocation.trim();
    return '';
  };

  const runCheck = () => {
    const loc = activeLocation();
    fetchRouteHealth(report.id, loc || undefined);
  };

  // When user selects from dropdown — immediately evaluate (Issue 5: update shipment details)
  const handleCitySelect = (city: string) => {
    setSelectedCity(city);
    setLocationMode('dropdown');
    // Immediately re-evaluate health with new location
    fetchRouteHealth(report.id, city);
  };

  const currentLocationForReoptimize = (): string => {
    const loc = activeLocation();
    if (loc) return loc;
    if (routeHealth?.actual_location?.label) return routeHealth.actual_location.label;
    if (routeHealth?.corridor_matched_city) return routeHealth.corridor_matched_city;
    return (
      routeHealth?.estimated_location?.label ||
      routeHealth?.estimated_location?.segment_end ||
      report.source
    );
  };

  const handleReoptimize = async () => {
    const currentLocation = currentLocationForReoptimize();
    const waypoints = [report.source, ...report.stops, report.destination];
    const clNorm = currentLocation.toLowerCase();
    const clIdx = waypoints.findIndex(w => w.toLowerCase() === clNorm);
    const afterCl = clIdx >= 0 ? waypoints.slice(clIdx + 1) : waypoints.slice(1);
    const remainingStops = afterCl.slice(0, -1);

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

  const handleRegeneratePlan = () => {
    const currentLoc = currentLocationForReoptimize();
    const waypoints = [report.source, ...report.stops, report.destination];
    const clNorm = currentLoc.toLowerCase();
    const clIdx = waypoints.findIndex(w => w.toLowerCase() === clNorm);
    const afterCl = clIdx >= 0 ? waypoints.slice(clIdx + 1) : waypoints.slice(1);
    const remainingStops = afterCl.slice(0, -1);

    const params = new URLSearchParams({ source: currentLoc, destination: report.destination });
    if (remainingStops.length > 0) params.set('stops', remainingStops.join(','));
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
    CORRIDOR_CONFIG[routeHealth.corridor_status as keyof typeof CORRIDOR_CONFIG] ??
    CORRIDOR_CONFIG.ON_ROUTE;
  const routeCities = routeHealth.route_cities ?? [];
  const displayLocation = activeLocation() || routeHealth.actual_location?.label || '';

  return (
    <div
      data-route-health
      className={`rounded-2xl border ${config.border} bg-gradient-to-br ${config.gradient} p-5`}
    >
      {/* ── Header with health score ── */}
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
        <div className="flex items-center gap-2">
          {/* Health Score 0–100 */}
          {routeHealth.shipment_health_score != null && (
            <span className={`text-lg font-bold mono ${config.scoreColor}`}>
              {routeHealth.shipment_health_score}
              <span className="text-[9px] text-outline font-normal ml-0.5">/100</span>
            </span>
          )}
          <span
            className={`text-[9px] px-2 py-0.5 rounded-md border font-semibold uppercase tracking-wide ${config.badge}`}
          >
            Risk: {routeHealth.delay_risk}
          </span>
        </div>
      </div>

      {/* ── Location row ── */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {/* Estimated Location */}
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
              : 'Progress estimate'}
          </div>
        </div>

        {/* Current / Actual Location */}
        <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low/45 px-3 py-3">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">
            Current Location
          </div>
          <div className="text-sm font-bold text-foreground leading-snug">
            {routeHealth.actual_location?.label ?? 'Using estimated'}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground mono">
            {routeHealth.deviation_km != null
              ? `${routeHealth.deviation_km} km from estimate`
              : 'No location input'}
          </div>
        </div>

        {/* Corridor Status */}
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
            <div className="mt-1 text-[10px] text-muted-foreground mono capitalize">
              Near: {routeHealth.corridor_matched_city}
            </div>
          )}
        </div>
      </div>

      {/* ── Progress + Metrics row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Progress</div>
          <div className="text-sm font-bold text-foreground mono">{routeHealth.progress_percentage}%</div>
        </div>
        <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Remaining</div>
          <div className="text-sm font-bold text-foreground mono">{routeHealth.remaining_minutes}m</div>
        </div>
        <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Updated ETA</div>
          <div className="text-sm font-bold text-foreground mono">
            {routeHealth.updated_eta_minutes != null
              ? `${routeHealth.updated_eta_minutes}m`
              : `${routeHealth.eta_variance_minutes}m`}
          </div>
        </div>
        <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Deviation</div>
          <span
            className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${DEVIATION_CONFIG[routeHealth.deviation_level]}`}
          >
            {routeHealth.deviation_level}
          </span>
        </div>
      </div>

      {/* Updated Cost + Risk */}
      {(routeHealth.updated_cost != null || routeHealth.updated_risk != null) && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          {routeHealth.updated_cost != null && (
            <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
              <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Updated Cost</div>
              <div className="text-sm font-bold text-foreground mono">
                ₹{Math.round(routeHealth.updated_cost).toLocaleString('en-IN')}
              </div>
            </div>
          )}
          {routeHealth.updated_risk != null && (
            <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
              <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Updated Risk</div>
              <div className="text-sm font-bold text-foreground mono">
                {Math.round(routeHealth.updated_risk * 100)}%
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Issue 5 — Current Location Selector ── */}
      <div className="mb-4 rounded-xl bg-surface-container-low/20 border border-outline-variant/8 px-3 py-3">
        <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-2">
          Select Current Location
        </div>

        {/* Mode tabs */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {(['estimated', 'dropdown', 'manual'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setLocationMode(mode)}
              className={[
                'rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition',
                locationMode === mode
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border/30 bg-surface/30 text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {mode === 'estimated' ? 'Use Estimated' : mode === 'dropdown' ? 'Route City' : 'Enter Manually'}
            </button>
          ))}
        </div>

        {/* Issue 5 — Route city dropdown */}
        {locationMode === 'dropdown' && routeCities.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={selectedCity}
              onChange={e => handleCitySelect(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-border/40 bg-surface-container-lowest/50 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/40 capitalize"
            >
              <option value="">Select city…</option>
              {routeCities.map((city, i) => (
                <option key={`${city}-${i}`} value={city}>
                  {city}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={runCheck}
              disabled={!selectedCity}
              className="rounded-lg border border-primary/35 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Evaluate
            </button>
          </div>
        )}

        {locationMode === 'dropdown' && routeCities.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            Route cities not yet available. Use manual entry.
          </p>
        )}

        {/* Manual text input */}
        {locationMode === 'manual' && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={manualLocation}
              onChange={e => setManualLocation(e.target.value)}
              placeholder="e.g. Bharuch"
              className="min-w-0 flex-1 rounded-lg border border-border/40 bg-surface-container-lowest/50 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/40"
            />
            <button
              type="button"
              onClick={runCheck}
              disabled={!manualLocation.trim()}
              className="rounded-lg border border-primary/35 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Evaluate
            </button>
          </div>
        )}

        {/* Estimated — just refresh button */}
        {locationMode === 'estimated' && (
          <button
            type="button"
            onClick={runCheck}
            className="rounded-lg border border-primary/35 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20"
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
        {routeHealth.reoptimization_reason && (
          <p className="mt-1 text-[10px] text-outline italic leading-relaxed">
            {routeHealth.reoptimization_reason}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {(routeHealth.recommended_action === 'reoptimize' || routeHealth.reoptimization_recommended) && (
            <button
              type="button"
              onClick={handleReoptimize}
              disabled={reoptimizationLoading}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {reoptimizationLoading ? 'Generating Updated Plan…' : 'Reoptimize Trip'}
            </button>
          )}
          <button
            type="button"
            onClick={handleRegeneratePlan}
            className="rounded-lg border border-primary/30 bg-primary/8 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20"
          >
            Regenerate Plan
          </button>
        </div>
      </div>

      {/* ── Issue 4 — Route Corridor ── */}
      {routeCities.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowCorridor(v => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-outline-variant/15 bg-surface-container-low/20 px-3 py-2.5 text-left transition hover:border-outline-variant/30"
          >
            <span className="text-[9px] uppercase tracking-widest text-outline font-bold">
              Route Corridor ({routeCities.length} cities)
            </span>
            <span
              className="material-symbols-outlined text-outline transition-transform"
              style={{ fontSize: '14px', transform: showCorridor ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              expand_more
            </span>
          </button>
          {showCorridor && (
            <RouteCorridor cities={routeCities} currentLocation={displayLocation} />
          )}
        </div>
      )}

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
