'use client';

import { useEffect, useState } from 'react';
import { usePlannerStore } from '@/store/usePlannerStore';

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
  continue: 'Continue',
  monitor: 'Monitor',
  reoptimize: 'Reoptimize',
} as const;

const DEVIATION_CONFIG = {
  none: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/20',
  minor: 'bg-amber-500/12 text-amber-300 border-amber-500/20',
  major: 'bg-red-500/12 text-red-400 border-red-500/20',
} as const;

interface Props {
  reportId: string;
}

export function RouteHealthCard({ reportId }: Props) {
  const { routeHealth, routeHealthLoading, fetchRouteHealth } = usePlannerStore();
  const [useEstimatedLocation, setUseEstimatedLocation] = useState(true);
  const [actualLocation, setActualLocation] = useState('');

  useEffect(() => {
    fetchRouteHealth(reportId);
  }, [reportId, fetchRouteHealth]);

  const runCheck = () => {
    fetchRouteHealth(reportId, useEstimatedLocation ? undefined : actualLocation);
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

  return (
    <div data-route-health className={`rounded-2xl border ${config.border} bg-gradient-to-br ${config.gradient} p-5`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span
            className={`material-symbols-outlined ${config.text}`}
            style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
          >
            {config.icon}
          </span>
          <div>
            <div className="text-[9px] uppercase tracking-[0.14em] text-outline font-bold">Route Health</div>
            <div className={`text-sm font-bold ${config.text}`}>{config.label}</div>
          </div>
        </div>
        <span className={`text-[9px] px-2 py-0.5 rounded-md border font-semibold uppercase tracking-wide ${config.badge}`}>
          Risk: {routeHealth.delay_risk}
        </span>
      </div>

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
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">ETA Variance</div>
          <div className="text-sm font-bold text-foreground mono">{routeHealth.eta_variance_minutes}m</div>
        </div>
        <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Deviation</div>
          <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${DEVIATION_CONFIG[routeHealth.deviation_level]}`}>
            {routeHealth.deviation_level}
          </span>
        </div>
      </div>

      <div className="mb-4 rounded-xl bg-surface-container-low/20 border border-outline-variant/8 px-3 py-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Estimated Location</div>
            <p className="text-[11px] text-foreground font-medium leading-relaxed">
              {routeHealth.estimated_location.label}
            </p>
            <p className="text-[10px] text-muted-foreground mono">
              {routeHealth.estimated_location.latitude != null && routeHealth.estimated_location.longitude != null
                ? `${routeHealth.estimated_location.latitude}, ${routeHealth.estimated_location.longitude}`
                : routeHealth.estimated_location.confidence}
            </p>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Actual Location</div>
            <p className="text-[11px] text-foreground font-medium leading-relaxed">
              {routeHealth.actual_location?.label ?? 'Using estimated location'}
            </p>
            <p className="text-[10px] text-muted-foreground mono">
              {routeHealth.deviation_km != null ? `${routeHealth.deviation_km} km from estimate` : 'No manual input'}
            </p>
          </div>
        </div>
      </div>

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
              placeholder="Current Driver Location"
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

      <div className="rounded-xl bg-surface-container-low/20 border border-outline-variant/8 px-3 py-2.5">
        <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Recommended Action</div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {ACTION_LABELS[routeHealth.recommended_action]}
        </p>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[9px] text-outline">
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot} animate-pulse`} />
        Last checked: {new Date(routeHealth.checked_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}
