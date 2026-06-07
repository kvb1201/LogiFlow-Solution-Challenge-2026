'use client';

import { useEffect } from 'react';
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

interface Props {
  reportId: string;
}

export function RouteHealthCard({ reportId }: Props) {
  const { routeHealth, routeHealthLoading, fetchRouteHealth } = usePlannerStore();

  useEffect(() => {
    fetchRouteHealth(reportId);
  }, [reportId, fetchRouteHealth]);

  if (routeHealthLoading) {
    return (
      <div className="rounded-2xl border border-border/40 bg-surface/30 p-5">
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
    <div className={`rounded-2xl border ${config.border} bg-gradient-to-br ${config.gradient} p-5`}>
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
          Score: {Math.round(routeHealth.current_route_score * 100)}%
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Est. Delay</div>
          <div className="text-sm font-bold text-foreground mono">{routeHealth.estimated_delay}h</div>
        </div>
        <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Corridor</div>
          <div className="text-[11px] font-medium text-foreground mono truncate">
            {routeHealth.source} → {routeHealth.destination}
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-surface-container-low/20 border border-outline-variant/8 px-3 py-2.5">
        <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Recommended Action</div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{routeHealth.recommended_action}</p>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[9px] text-outline">
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot} animate-pulse`} />
        Last checked: {new Date(routeHealth.checked_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}
