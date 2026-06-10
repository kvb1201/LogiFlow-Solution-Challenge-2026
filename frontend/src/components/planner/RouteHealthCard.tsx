'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePlannerStore } from '@/store/usePlannerStore';
import type { ReoptimizationRecommendation, ReoptimizationV1Response, RouteHealthResponse, ShipmentReport } from '@/services/plannerApi';

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

const ACTION_LABELS: Record<string, string> = {
  continue: 'Continue on current route',
  monitor: 'Monitor closely',
  reoptimize: 'Reoptimization recommended',
  suggest_reoptimization: 'Reoptimization suggested',
  strongly_recommend_reoptimization: 'Reoptimization strongly recommended',
};

const CORRIDOR_CONFIG = {
  ON_ROUTE: { label: 'On Route', style: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/20', icon: 'route' },
  NEAR_ROUTE: { label: 'Near Route', style: 'bg-amber-500/12 text-amber-300 border-amber-500/20', icon: 'near_me' },
  OFF_ROUTE: { label: 'Off Route', style: 'bg-red-500/12 text-red-400 border-red-500/20', icon: 'wrong_location' },
} as const;

const DEVIATION_CONFIG = {
  none: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/20',
  minor: 'bg-amber-500/12 text-amber-300 border-amber-500/20',
  major: 'bg-red-500/12 text-red-400 border-red-500/20',
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────

function fmt(value: number | null | undefined, type: 'cost' | 'time' | 'risk' | 'eta') {
  if (value == null || !Number.isFinite(value)) return '—';
  if (type === 'cost') return `₹${Math.round(value).toLocaleString('en-IN')}`;
  if (type === 'risk') return `${Math.round(value * 100)}%`;
  if (type === 'eta') return `${Math.round(value)}m`;
  return `${value.toFixed(1)}h`;
}

// ── Reoptimization Review ─────────────────────────────────────────────────

function ReoptimizationReview({
  recommendation, onSave, saving, savedReportId,
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
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold">Re-Optimization Results</div>
          <div className="text-sm font-bold text-foreground">Current Plan vs Updated Plan</div>
        </div>
        {recommendation.eta_delta_minutes != null && (
          <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            ETA {recommendation.eta_delta_minutes >= 0 ? '+' : ''}{recommendation.eta_delta_minutes}m
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { title: 'Current Plan', plan: recommendation.current_plan, metrics: current },
          { title: 'Updated Plan', plan: recommendation.updated_plan, metrics: updated },
        ].map(item => (
          <div key={item.title} className="rounded-xl border border-border/30 bg-surface/45 p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-outline">{item.title}</div>
            <div className="mb-3 truncate text-[11px] font-semibold text-foreground mono">
              {item.plan.source} → {item.plan.destination}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['cost', 'time', 'risk'] as const).map(k => (
                <div key={k}>
                  <div className="text-[9px] uppercase text-muted-foreground">{k}</div>
                  <div className="text-[11px] font-bold text-foreground mono">
                    {fmt(item.metrics[k], k === 'time' ? 'time' : k)}
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

// ── Requirement 4 — Split Route Corridor ──────────────────────────────────
//
// Shows three sections: Completed Route / Current Location / Remaining Route.
// Falls back to a plain list when no split data is available.

interface SplitCorridor {
  completed: string[];
  current: string;
  remaining: string[];
}

function CorridorDot({ variant }: { variant: 'completed' | 'current' | 'remaining' | 'first' | 'last' }) {
  const cls = {
    completed: 'bg-outline/30',
    current: 'bg-amber-400 ring-2 ring-amber-400/30',
    remaining: 'bg-outline/40',
    first: 'bg-primary',
    last: 'bg-emerald-400',
  }[variant];
  return <div className={`h-2 w-2 rounded-full shrink-0 my-1 ${cls}`} />;
}

function CorridorLine() {
  return <div className="w-px flex-1 bg-outline-variant/30" />;
}

function SplitCorridorView({ completed, current, remaining }: SplitCorridor) {
  const hasCompleted = completed.length > 0;
  const hasRemaining = remaining.length > 0;

  return (
    <div className="flex flex-col gap-0">
      {/* ── Completed section header ── */}
      {hasCompleted && (
        <div className="mb-1 text-[9px] uppercase tracking-widest font-bold text-outline/60 pl-6">
          Completed
        </div>
      )}

      {completed.map((city, i) => {
        const isAbsoluteFirst = i === 0;
        return (
          <div key={`completed-${city}-${i}`} className="flex items-stretch gap-3">
            <div className="flex flex-col items-center" style={{ width: '16px', minHeight: '26px' }}>
              {!isAbsoluteFirst && <CorridorLine />}
              <CorridorDot variant={isAbsoluteFirst ? 'first' : 'completed'} />
              <CorridorLine />
            </div>
            <div className="flex items-center py-0.5">
              <span className={`text-[11px] capitalize ${isAbsoluteFirst ? 'text-primary font-semibold' : 'text-outline/60 line-through'}`}>
                {city}
                {isAbsoluteFirst && <span className="ml-1.5 text-[9px] text-outline">origin</span>}
              </span>
            </div>
          </div>
        );
      })}

      {/* ── Current location ── */}
      {hasCompleted && (
        <div className="my-1 text-[9px] uppercase tracking-widest font-bold text-amber-400/80 pl-6">
          Current
        </div>
      )}
      <div className="flex items-stretch gap-3">
        <div className="flex flex-col items-center" style={{ width: '16px', minHeight: '26px' }}>
          {hasCompleted && <CorridorLine />}
          <CorridorDot variant="current" />
          {hasRemaining && <CorridorLine />}
        </div>
        <div className="flex items-center py-0.5">
          <span className="text-[12px] font-bold text-amber-300 capitalize">
            {current}
            <span className="ml-1.5 text-[9px] rounded bg-amber-500/15 border border-amber-500/25 px-1 py-0.5 font-bold uppercase tracking-wide text-amber-300">
              here
            </span>
          </span>
        </div>
      </div>

      {/* ── Remaining section header ── */}
      {hasRemaining && (
        <div className="mt-1 mb-1 text-[9px] uppercase tracking-widest font-bold text-outline/60 pl-6">
          Remaining
        </div>
      )}

      {remaining.map((city, i) => {
        const isAbsoluteLast = i === remaining.length - 1;
        return (
          <div key={`remaining-${city}-${i}`} className="flex items-stretch gap-3">
            <div className="flex flex-col items-center" style={{ width: '16px', minHeight: '26px' }}>
              <CorridorLine />
              <CorridorDot variant={isAbsoluteLast ? 'last' : 'remaining'} />
              {!isAbsoluteLast && <CorridorLine />}
            </div>
            <div className="flex items-center py-0.5">
              <span className={`text-[11px] capitalize ${isAbsoluteLast ? 'text-emerald-300 font-semibold' : 'text-muted-foreground'}`}>
                {city}
                {isAbsoluteLast && <span className="ml-1.5 text-[9px] text-outline">destination</span>}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlainCorridorView({ cities, currentLocation }: { cities: string[]; currentLocation?: string }) {
  const currentNorm = (currentLocation || '').toLowerCase();
  return (
    <div className="flex flex-col gap-0">
      {cities.map((city, i) => {
        const isFirst = i === 0;
        const isLast = i === cities.length - 1;
        const isCurrent = city.toLowerCase() === currentNorm;
        return (
          <div key={`${city}-${i}`} className="flex items-stretch gap-3">
            <div className="flex flex-col items-center" style={{ width: '16px', minHeight: '26px' }}>
              {!isFirst && <CorridorLine />}
              <CorridorDot variant={isFirst ? 'first' : isLast ? 'last' : isCurrent ? 'current' : 'remaining'} />
              {!isLast && <CorridorLine />}
            </div>
            <div className="flex items-center py-0.5">
              <span className={`text-[11px] font-medium capitalize ${
                isFirst ? 'text-primary font-semibold' :
                isLast ? 'text-emerald-300 font-semibold' :
                isCurrent ? 'text-amber-300 font-bold' :
                'text-muted-foreground'
              }`}>
                {city}
                {isCurrent && (
                  <span className="ml-1.5 text-[9px] rounded bg-amber-500/15 border border-amber-500/25 px-1 py-0.5 font-bold uppercase tracking-wide text-amber-300">
                    here
                  </span>
                )}
                {isFirst && !isCurrent && <span className="ml-1.5 text-[9px] text-outline">origin</span>}
                {isLast && !isCurrent && <span className="ml-1.5 text-[9px] text-outline">destination</span>}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RouteCorridor({
  cities, completedCities, remainingCities, currentLocation,
}: {
  cities: string[];
  completedCities?: string[];
  remainingCities?: string[];
  currentLocation?: string;
}) {
  if (!cities.length && !currentLocation) return null;

  const hasSplit = currentLocation && (completedCities?.length || remainingCities?.length);

  return (
    <div className="mt-4 rounded-xl border border-outline-variant/15 bg-surface-container-low/20 p-3">
      <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-3">
        Route Corridor
      </div>
      {hasSplit ? (
        <SplitCorridorView
          completed={completedCities ?? []}
          current={currentLocation}
          remaining={remainingCities ?? []}
        />
      ) : (
        <PlainCorridorView cities={cities} currentLocation={currentLocation} />
      )}
    </div>
  );
}

// ── Signal Source Badges ──────────────────────────────────────────────────

const FRESHNESS_META: Record<string, { label: string; color: string }> = {
  live:        { label: 'Live',    color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  stored:      { label: 'Stored', color: 'bg-amber-500/12 text-amber-300 border-amber-500/20' },
  heuristic:   { label: 'Est.',   color: 'bg-surface-container/40 text-outline border-border/20' },
  fallback:    { label: 'Fallback', color: 'bg-surface-container/40 text-outline border-border/20' },
  unavailable: { label: 'N/A',    color: 'bg-surface-container/20 text-outline/50 border-border/10' },
};

const SIGNAL_LABELS: Record<string, string> = {
  traffic: 'Traffic',
  weather: 'Weather',
  delay:   'Delay',
};

function SignalBadges({
  signalFreshness,
  refreshedAt,
}: {
  signalFreshness: RouteHealthResponse['signal_freshness'];
  refreshedAt: string | null;
}) {
  if (!signalFreshness) return null;

  const signals = Object.entries(signalFreshness) as [string, string][];
  const liveCount = signals.filter(([, f]) => f === 'live').length;

  const refreshAgo = refreshedAt
    ? Math.round((Date.now() - new Date(refreshedAt).getTime()) / 1000)
    : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {signals.map(([key, freshness]) => {
        const meta = FRESHNESS_META[freshness] ?? FRESHNESS_META.unavailable;
        return (
          <span
            key={key}
            className={`text-[8px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wide ${meta.color}`}
            title={`${SIGNAL_LABELS[key] ?? key}: ${freshness}`}
          >
            {meta.label} {SIGNAL_LABELS[key] ?? key}
          </span>
        );
      })}
      {refreshAgo !== null && liveCount > 0 && (
        <span className="text-[8px] text-outline">
          refreshed {refreshAgo < 60 ? `${refreshAgo}s` : `${Math.round(refreshAgo / 60)}m`} ago
        </span>
      )}
    </div>
  );
}

// ── Health Breakdown Panel (Phase 7 — Why this score?) ───────────────────

function HealthBreakdownPanel({
  breakdown,
  conditionProfile,
}: {
  breakdown: RouteHealthResponse['health_breakdown'];
  conditionProfile: RouteHealthResponse['condition_profile'];
}) {
  const [open, setOpen] = useState(false);

  if (!breakdown) return null;

  const factors = [
    { key: 'traffic',  label: 'Traffic',         icon: 'traffic',    max: 35 },
    { key: 'weather',  label: 'Weather',         icon: 'cloud',      max: 20 },
    { key: 'delay',    label: 'ML Delay',        icon: 'schedule',   max: 20 },
    { key: 'adherence',label: 'Route Adherence', icon: 'route',      max: 15 },
    { key: 'eta',      label: 'ETA Variance',    icon: 'timer',      max: 10 },
  ] as const;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-outline-variant/15 bg-surface-container-low/20 px-3 py-2.5 text-left transition hover:border-outline-variant/30"
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-outline" style={{ fontSize: '14px' }}>
            info
          </span>
          <span className="text-[9px] uppercase tracking-widest text-outline font-bold">
            Why this score?
          </span>
        </div>
        <span
          className="material-symbols-outlined text-outline"
          style={{ fontSize: '14px', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
        >
          expand_more
        </span>
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-outline-variant/15 bg-surface-container-low/20 p-3 space-y-2">
          {/* Summary */}
          <p className="text-[11px] text-muted-foreground leading-relaxed pb-2 border-b border-border/15">
            {breakdown.summary}
          </p>

          {/* Factor rows */}
          {factors.map(f => {
            const data = breakdown[f.key];
            const pct = Math.round((data.points / f.max) * 100);
            const isGood = data.delta >= -2;
            return (
              <div key={f.key}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="material-symbols-outlined text-outline"
                      style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1" }}
                    >
                      {f.icon}
                    </span>
                    <span className="text-[10px] font-semibold text-foreground">{f.label}</span>
                    {(() => {
                      const src = (data as Record<string, unknown>).source as string | undefined;
                      return src && !['heuristic','schedule','corridor'].includes(src) ? (
                        <span className="text-[8px] px-1 py-0.5 rounded border bg-primary/10 text-primary border-primary/20 font-bold uppercase">
                          {src}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold mono ${isGood ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {data.points}/{f.max}
                    </span>
                    {data.delta < 0 && (
                      <span className="text-[9px] text-red-400 font-bold mono">{data.delta}</span>
                    )}
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-1 rounded-full bg-border/20 mb-1">
                  <div
                    className={`h-full rounded-full transition-all ${isGood ? 'bg-emerald-400/60' : 'bg-amber-400/60'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[9px] text-outline leading-relaxed">{data.why}</p>
              </div>
            );
          })}

          {/* Condition snapshot detail */}
          {conditionProfile && (
            <div className="pt-2 border-t border-border/15 flex flex-wrap gap-4">
              {conditionProfile.traffic_level != null && (
                <div>
                  <div className="text-[9px] text-outline uppercase font-bold">Traffic</div>
                  <div className="text-[11px] font-semibold text-foreground mono">
                    {Math.round(conditionProfile.traffic_level * 100)}% congestion
                  </div>
                </div>
              )}
              {conditionProfile.temperature != null && (
                <div>
                  <div className="text-[9px] text-outline uppercase font-bold">Temp</div>
                  <div className="text-[11px] font-semibold text-foreground mono">{conditionProfile.temperature}°C</div>
                </div>
              )}
              {conditionProfile.precipitation != null && conditionProfile.precipitation > 0 && (
                <div>
                  <div className="text-[9px] text-outline uppercase font-bold">Rain</div>
                  <div className="text-[11px] font-semibold text-foreground mono">{conditionProfile.precipitation}mm/h</div>
                </div>
              )}
              {conditionProfile.traffic_delay_minutes > 0 && (
                <div>
                  <div className="text-[9px] text-outline uppercase font-bold">Traffic delay</div>
                  <div className="text-[11px] font-semibold text-foreground mono">+{conditionProfile.traffic_delay_minutes}m</div>
                </div>
              )}
              {conditionProfile.predicted_delay_hours != null && (
                <div>
                  <div className="text-[9px] text-outline uppercase font-bold">ML delay</div>
                  <div className="text-[11px] font-semibold text-foreground mono">
                    {conditionProfile.predicted_delay_hours < 1
                      ? `${Math.round(conditionProfile.predicted_delay_hours * 60)}m`
                      : `${conditionProfile.predicted_delay_hours.toFixed(1)}h`}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Condition History Panel (Phase 6) ─────────────────────────────────────

function ConditionHistoryPanel({
  history,
}: {
  history: RouteHealthResponse['condition_history'];
}) {
  const [open, setOpen] = useState(false);

  if (!history || history.length === 0) return null;

  const scoreColor = (s: number) =>
    s >= 80 ? 'text-emerald-300' : s >= 60 ? 'text-amber-300' : 'text-red-400';

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-outline-variant/15 bg-surface-container-low/20 px-3 py-2.5 text-left transition hover:border-outline-variant/30"
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-outline" style={{ fontSize: '14px' }}>
            history
          </span>
          <span className="text-[9px] uppercase tracking-widest text-outline font-bold">
            Recent Route Health ({history.length})
          </span>
        </div>
        <span
          className="material-symbols-outlined text-outline"
          style={{ fontSize: '14px', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
        >
          expand_more
        </span>
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-outline-variant/15 bg-surface-container-low/20 overflow-hidden">
          <div className="divide-y divide-border/10">
            {history.slice(0, 10).map((entry, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-sm font-bold mono shrink-0 ${scoreColor(entry.health_score)}`}>
                    {entry.health_score}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase shrink-0 ${
                    entry.health_level === 'healthy'
                      ? 'bg-emerald-500/12 text-emerald-300 border-emerald-500/20'
                      : entry.health_level === 'moderate'
                      ? 'bg-amber-500/12 text-amber-300 border-amber-500/20'
                      : 'bg-red-500/12 text-red-400 border-red-500/20'
                  }`}>
                    {entry.health_level}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[9px] text-outline mono">
                  {entry.traffic_score != null && (
                    <span title="Traffic">T:{Math.round(entry.traffic_score)}</span>
                  )}
                  {entry.weather_score != null && (
                    <span title="Weather">W:{Math.round(entry.weather_score)}</span>
                  )}
                  {entry.confidence_score != null && (
                    <span title={`Confidence: ${entry.confidence_score}%`} className="text-outline/70">
                      {entry.confidence_score}%
                    </span>
                  )}
                  {entry.signal_freshness && Object.values(entry.signal_freshness).some(f => f === 'live') && (
                    <span className="text-emerald-400/70 font-bold">Live</span>
                  )}
                  <span>
                    {new Date(entry.evaluated_at).toLocaleTimeString('en-IN', {
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reoptimization V1 Panel ───────────────────────────────────────────────

function ReoptimizeV1Panel({
  reportId,
  onAccepted,
}: {
  reportId: string;
  onAccepted: (updated: ShipmentReport) => void;
}) {
  const {
    reoptimizationV1,
    reoptimizationV1Loading,
    saving,
    runReoptimizationV1,
    acceptReoptimizationV1,
    dismissReoptimizationV1,
  } = usePlannerStore();

  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const handleRun = () => {
    void runReoptimizationV1(reportId);
  };

  const handleAccept = async () => {
    if (!reoptimizationV1) return;
    setAccepting(true);
    try {
      const updated = await acceptReoptimizationV1(reportId, reoptimizationV1);
      setAccepted(true);
      onAccepted(updated);
    } finally {
      setAccepting(false);
    }
  };

  const handleDismiss = () => {
    dismissReoptimizationV1();
    setAccepted(false);
  };

  if (accepted) {
    return (
      <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-emerald-300 shrink-0"
          style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>
          check_circle
        </span>
        <p className="text-[11px] text-emerald-300 font-semibold flex-1">
          Switched to optimized route. Progression continues from current location.
        </p>
      </div>
    );
  }

  if (!reoptimizationV1) {
    return (
      <button
        type="button"
        onClick={handleRun}
        disabled={reoptimizationV1Loading}
        className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/8 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {reoptimizationV1Loading ? (
          <>
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            Generating alternative…
          </>
        ) : (
          <>
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>alt_route</span>
            Reoptimize Route
          </>
        )}
      </button>
    );
  }

  const r = reoptimizationV1;
  const imp = r.improvement;

  // Colour helpers
  const improvementColor = (val: number | null, higherIsBetter = false): string => {
    if (val == null) return 'text-foreground';
    const positive = higherIsBetter ? val > 0 : val < 0;
    return positive ? 'text-emerald-300' : val === 0 ? 'text-foreground' : 'text-red-400';
  };

  const fmtDelta = (val: number | null, unit: string, higherIsBetter = false): string => {
    if (val == null || val === 0) return '—';
    const sign = val > 0 ? '+' : '';
    return `${sign}${Math.round(val)}${unit}`;
  };

  return (
    <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold">Route Reoptimization</div>
          <div className="text-sm font-bold text-foreground">
            {r.current_location} → {r.destination}
          </div>
        </div>
        <button type="button" onClick={handleDismiss}
          className="text-outline hover:text-foreground transition">
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
        </button>
      </div>

      {/* Comparison table */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {/* Current route */}
        <div className="rounded-xl border border-border/30 bg-surface/40 p-3">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-2">Current Route</div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-outline">ETA</span>
              <span className="font-semibold text-foreground mono">{r.current_route.metrics.eta_minutes}m</span>
            </div>
            {r.current_route.metrics.cost != null && (
              <div className="flex justify-between text-[11px]">
                <span className="text-outline">Cost</span>
                <span className="font-semibold text-foreground mono">
                  ₹{Math.round(r.current_route.metrics.cost).toLocaleString('en-IN')}
                </span>
              </div>
            )}
            {r.current_route.metrics.risk != null && (
              <div className="flex justify-between text-[11px]">
                <span className="text-outline">Risk</span>
                <span className="font-semibold text-foreground mono">
                  {Math.round(r.current_route.metrics.risk * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Alternative route */}
        <div className={`rounded-xl border p-3 ${r.recommend_switch ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border/30 bg-surface/40'}`}>
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-2">Alternative Route</div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-outline">ETA</span>
              <span className={`font-semibold mono ${imp.time_saved_minutes != null && imp.time_saved_minutes > 0 ? 'text-emerald-300' : 'text-foreground'}`}>
                {r.alternative_route.metrics.eta_minutes}m
              </span>
            </div>
            {r.alternative_route.metrics.cost != null && (
              <div className="flex justify-between text-[11px]">
                <span className="text-outline">Cost</span>
                <span className={`font-semibold mono ${imp.cost_pct_change != null && imp.cost_pct_change > 0 ? 'text-emerald-300' : 'text-foreground'}`}>
                  ₹{Math.round(r.alternative_route.metrics.cost).toLocaleString('en-IN')}
                </span>
              </div>
            )}
            {r.alternative_route.metrics.risk != null && (
              <div className="flex justify-between text-[11px]">
                <span className="text-outline">Risk</span>
                <span className={`font-semibold mono ${imp.risk_pct_change != null && imp.risk_pct_change > 0 ? 'text-emerald-300' : 'text-foreground'}`}>
                  {Math.round(r.alternative_route.metrics.risk * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Improvement summary */}
      <div className="mb-3 rounded-lg bg-surface/30 border border-border/20 px-3 py-2">
        <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1.5">Improvement</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {imp.time_saved_minutes != null && (
            <span className={`text-[11px] font-semibold ${improvementColor(imp.time_saved_minutes)}`}>
              ETA {fmtDelta(imp.time_saved_minutes, 'm')}
            </span>
          )}
          {imp.cost_pct_change != null && (
            <span className={`text-[11px] font-semibold ${improvementColor(imp.cost_pct_change)}`}>
              Cost {fmtDelta(imp.cost_pct_change, '%')}
            </span>
          )}
          {imp.risk_pct_change != null && (
            <span className={`text-[11px] font-semibold ${improvementColor(imp.risk_pct_change)}`}>
              Risk {fmtDelta(imp.risk_pct_change, '%')}
            </span>
          )}
        </div>
      </div>

      {/* Recommendation */}
      <div className={`mb-3 rounded-lg border px-3 py-2 ${r.recommend_switch ? 'border-emerald-500/25 bg-emerald-500/8' : 'border-border/20 bg-surface/30'}`}>
        <div className="flex items-start gap-2">
          <span className={`material-symbols-outlined shrink-0 mt-0.5 ${r.recommend_switch ? 'text-emerald-300' : 'text-outline'}`}
            style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>
            {r.recommend_switch ? 'recommend' : 'info'}
          </span>
          <p className={`text-[11px] leading-relaxed ${r.recommend_switch ? 'text-emerald-300' : 'text-muted-foreground'}`}>
            {r.recommendation_reason}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {r.recommend_switch && (
          <button type="button" onClick={handleAccept} disabled={accepting || saving}
            className="flex-1 rounded-lg border border-emerald-500/35 bg-emerald-500/12 py-2 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50">
            {accepting ? 'Switching…' : 'Switch To Optimized Route'}
          </button>
        )}
        {!r.recommend_switch && (
          <button type="button" onClick={handleAccept} disabled={accepting || saving}
            className="flex-1 rounded-lg border border-border/30 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
            {accepting ? 'Switching…' : 'Switch Anyway'}
          </button>
        )}
        <button type="button" onClick={handleRun} disabled={reoptimizationV1Loading}
          className="rounded-lg border border-border/30 px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground">
          Retry
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

interface Props {
  report: ShipmentReport;
  onShipmentUpdated?: (updated: ShipmentReport) => void;
}

export function RouteHealthCard({ report, onShipmentUpdated }: Props) {
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
    updateShipmentLocation,
  } = usePlannerStore();
  const [locationMode, setLocationMode] = useState<'estimated' | 'dropdown' | 'manual'>('estimated');
  const [selectedCity, setSelectedCity] = useState('');
  const [manualLocation, setManualLocation] = useState('');
  const [savedRevisionId, setSavedRevisionId] = useState<string | null>(null);
  const [showCorridor, setShowCorridor] = useState(false);
  const [updatingShipment, setUpdatingShipment] = useState(false);
  const [shipmentUpdated, setShipmentUpdated] = useState(false);
  // Track whether user has evaluated a preview city (separate from routeHealth state
  // to avoid the hasPreviewCity === resolvedLocation comparison bug)
  const [evaluatedPreviewCity, setEvaluatedPreviewCity] = useState<string>('');

  useEffect(() => {
    fetchRouteHealth(report.id);
  }, [report.id, fetchRouteHealth]);

  // Reset preview/update state whenever the user changes the selector mode
  const handleModeChange = (mode: 'estimated' | 'dropdown' | 'manual') => {
    setLocationMode(mode);
    setShipmentUpdated(false);
    setEvaluatedPreviewCity('');
    if (mode === 'estimated') {
      setSelectedCity('');
      setManualLocation('');
    }
  };

  // ── Location helpers ──────────────────────────────────────────────
  const activeLocation = (): string => {
    if (locationMode === 'dropdown') return selectedCity;
    if (locationMode === 'manual') return manualLocation.trim();
    return '';
  };

  const runCheck = () => {
    const loc = activeLocation();
    if (!loc) {
      fetchRouteHealth(report.id);
      return;
    }
    setShipmentUpdated(false);
    setEvaluatedPreviewCity(loc);
    fetchRouteHealth(report.id, loc);
  };

  const handleCitySelect = (city: string) => {
    setSelectedCity(city);
    setLocationMode('dropdown');
    setShipmentUpdated(false);
    // Do NOT auto-evaluate — user must click Evaluate explicitly
    // so the preview panel appears only after an intentional action
    setEvaluatedPreviewCity('');
  };

  // The location to commit when Update Shipment is clicked
  const commitLocation = (): string => {
    // Use the explicitly evaluated preview city, or fall back to active selection
    return evaluatedPreviewCity || activeLocation() || routeHealth?.current_location || report.source;
  };

  // ── Update Shipment (Req 3) ───────────────────────────────────────
  const handleUpdateShipment = async () => {
    const location = commitLocation();
    if (!location) return;
    setUpdatingShipment(true);
    try {
      const updated = await updateShipmentLocation(report.id, { current_location: location });
      setShipmentUpdated(true);
      setEvaluatedPreviewCity('');
      setLocationMode('estimated');
      setSelectedCity('');
      setManualLocation('');
      fetchRouteHealth(report.id);
      onShipmentUpdated?.(updated);
    } finally {
      setUpdatingShipment(false);
    }
  };

  // ── Reoptimize / Regenerate ───────────────────────────────────────
  const handleReoptimize = async () => {
    const currentLocation = commitLocation();
    const waypoints = [report.source, ...report.stops, report.destination];
    const clNorm = currentLocation.toLowerCase();
    const clIdx = waypoints.findIndex(w => w.toLowerCase() === clNorm);
    const afterCl = clIdx >= 0 ? waypoints.slice(clIdx + 1) : waypoints.slice(1);
    await reoptimizeTrip(report.id, {
      current_location: currentLocation,
      remaining_stops: afterCl.slice(0, -1),
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
    const currentLoc = commitLocation();
    const waypoints = [report.source, ...report.stops, report.destination];
    const clNorm = currentLoc.toLowerCase();
    const clIdx = waypoints.findIndex(w => w.toLowerCase() === clNorm);
    const afterCl = clIdx >= 0 ? waypoints.slice(clIdx + 1) : waypoints.slice(1);
    const remainingStops = afterCl.slice(0, -1);
    const params = new URLSearchParams({ source: currentLoc, destination: report.destination });
    if (remainingStops.length > 0) params.set('stops', remainingStops.join(','));
    router.push(`/${report.mode}?${params.toString()}`);
  };

  // ── Render ────────────────────────────────────────────────────────
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
  const routeCities    = routeHealth.route_cities ?? [];
  const completedCities = routeHealth.completed_cities ?? [];
  const remainingCities = routeHealth.remaining_cities ?? [];

  // Backend-resolved current location (single source of truth)
  const resolvedLocation = routeHealth.current_location;
  const locationSource   = routeHealth.location_source;

  // City the user is currently previewing (not yet committed)
  const previewCity = activeLocation();
  // City the user has explicitly evaluated via Evaluate button (tracks separate from resolvedLocation)
  // canUpdateShipment is true when the user has evaluated a preview city that differs
  // from the current stored location, and hasn't yet committed it.
  const canUpdateShipment =
    !!evaluatedPreviewCity &&
    evaluatedPreviewCity.toLowerCase() !== (routeHealth?.confirmed_current_location || '').toLowerCase() &&
    !shipmentUpdated;

  const SOURCE_BADGE: Record<string, string> = {
    automatic: 'bg-primary/10 text-primary border-primary/20',
    manual:    'bg-emerald-500/12 text-emerald-300 border-emerald-500/20',
    preview:   'bg-amber-500/12 text-amber-300 border-amber-500/20',
    fallback:  'bg-surface-container/30 text-outline border-border/20',
  };

  return (
    <div
      data-route-health
      className={`rounded-2xl border ${config.border} bg-gradient-to-br ${config.gradient} p-5`}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className={`material-symbols-outlined ${config.text}`}
            style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}>
            {config.icon}
          </span>
          <div>
            <div className="text-[9px] uppercase tracking-[0.14em] text-outline font-bold">Route Health</div>
            <div className={`text-sm font-bold ${config.text}`}>{config.label}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {routeHealth.shipment_health_score != null && (
            <span className={`text-lg font-bold mono ${config.scoreColor}`}>
              {routeHealth.shipment_health_score}
              <span className="text-[9px] text-outline font-normal ml-0.5">/100</span>
            </span>
          )}
          <span className={`text-[9px] px-2 py-0.5 rounded-md border font-semibold uppercase tracking-wide ${config.badge}`}>
            Risk: {routeHealth.delay_risk}
          </span>
        </div>
      </div>

      {/* ── Signal source badges ── */}
      {routeHealth.signal_freshness && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-[9px] text-outline uppercase font-bold shrink-0">Signals:</span>
          <SignalBadges
            signalFreshness={routeHealth.signal_freshness}
            refreshedAt={routeHealth.signals_refreshed_at ?? null}
          />
        </div>
      )}

      {/* ── Current Location row ── */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-3">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[9px] uppercase tracking-widest text-outline font-bold">Current Location</div>
            <span className={`text-[8px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wide ${SOURCE_BADGE[locationSource] ?? SOURCE_BADGE.fallback}`}>
              {locationSource}
            </span>
          </div>
          <div className="text-sm font-bold text-foreground leading-snug capitalize">
            {previewCity ? (
              <>
                <span className="text-amber-300">{previewCity}</span>
                <span className="ml-1.5 text-[9px] text-outline normal-case">(preview)</span>
              </>
            ) : resolvedLocation}
          </div>
          {previewCity && (
            <div className="mt-0.5 text-[10px] text-outline mono capitalize">
              Current: {resolvedLocation}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low/45 px-3 py-3">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Corridor Status</div>
          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold uppercase ${corridorCfg.style}`}>
            <span className="material-symbols-outlined"
              style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1" }}>
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

        <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low/45 px-3 py-3">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Deviation</div>
          <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-bold uppercase ${DEVIATION_CONFIG[routeHealth.deviation_level]}`}>
            {routeHealth.deviation_level}
          </span>
          {routeHealth.deviation_km != null && (
            <div className="mt-1 text-[10px] text-muted-foreground mono">{routeHealth.deviation_km} km</div>
          )}
        </div>
      </div>

      {/* ── Elapsed: Source → Current Location (Req 5) ── */}
      <div className="mb-1 text-[9px] uppercase tracking-widest text-outline/70 font-bold px-0.5">
        Elapsed · {report.source} → {previewCity || resolvedLocation}
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Progress</div>
          <div className="text-sm font-bold text-foreground mono">{routeHealth.progress_percentage}%</div>
          {routeHealth.covered_distance_km > 0 && (
            <div className="text-[9px] text-outline mt-0.5">{routeHealth.covered_distance_km} km</div>
          )}
        </div>
        <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Elapsed Time</div>
          <div className="text-sm font-bold text-foreground mono">{routeHealth.elapsed_minutes}m</div>
        </div>
        <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Distance</div>
          <div className="text-sm font-bold text-foreground mono">
            {routeHealth.covered_distance_km > 0 ? `${routeHealth.covered_distance_km} km` : `${routeHealth.progress_percentage}%`}
          </div>
          {routeHealth.total_route_km > 0 && (
            <div className="text-[9px] text-outline mt-0.5">of {routeHealth.total_route_km} km</div>
          )}
        </div>
      </div>

      {/* ── Projected: Current Location → Destination (Req 6) ── */}
      <div className="mb-1 text-[9px] uppercase tracking-widest text-outline/70 font-bold px-0.5">
        Projected · {previewCity || resolvedLocation} → {report.destination}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Remaining ETA</div>
          <div className="text-sm font-bold text-foreground mono">
            {routeHealth.remaining_eta_minutes != null
              ? `${routeHealth.remaining_eta_minutes}m`
              : `${routeHealth.eta_variance_minutes}m`}
          </div>
          {routeHealth.progress_derived_from === 'geometry' && (
            <div className="text-[9px] text-outline mt-0.5">distance-based</div>
          )}
        </div>
        <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Remaining</div>
          <div className="text-sm font-bold text-foreground mono">
            {routeHealth.remaining_distance_km > 0
              ? `${routeHealth.remaining_distance_km} km`
              : `${routeHealth.remaining_minutes}m`}
          </div>
        </div>
        {routeHealth.updated_cost != null && (
          <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
            <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Proj. Cost</div>
            <div className="text-sm font-bold text-foreground mono">
              ₹{Math.round(routeHealth.updated_cost).toLocaleString('en-IN')}
            </div>
          </div>
        )}
        {routeHealth.updated_risk != null && (
          <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
            <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Proj. Risk</div>
            <div className="text-sm font-bold text-foreground mono">
              {Math.round(routeHealth.updated_risk * 100)}%
            </div>
          </div>
        )}
      </div>

      {/* ── Location selector (Req 7: preview before committing) ── */}
      <div className="mb-4 rounded-xl bg-surface-container-low/20 border border-outline-variant/8 px-3 py-3">
        <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-2">
          Select Current Location
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {(['estimated', 'dropdown', 'manual'] as const).map(mode => (
            <button key={mode} type="button" onClick={() => handleModeChange(mode)}
              className={[
                'rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition',
                locationMode === mode
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border/30 bg-surface/30 text-muted-foreground hover:text-foreground',
              ].join(' ')}>
              {mode === 'estimated' ? 'Use Automatic' : mode === 'dropdown' ? 'Route City' : 'Enter Manually'}
            </button>
          ))}
        </div>

        {locationMode === 'dropdown' && routeCities.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={selectedCity} onChange={e => handleCitySelect(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-border/40 bg-surface-container-lowest/50 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/40 capitalize">
              <option value="">Select city…</option>
              {routeCities.map((city, i) => (
                <option key={`${city}-${i}`} value={city}>{city}</option>
              ))}
            </select>
            <button type="button" onClick={runCheck} disabled={!selectedCity}
              className="rounded-lg border border-primary/35 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50">
              Evaluate
            </button>
          </div>
        )}
        {locationMode === 'dropdown' && routeCities.length === 0 && (
          <p className="text-[11px] text-muted-foreground">Route cities not available. Use manual entry.</p>
        )}
        {locationMode === 'manual' && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={manualLocation}
              onChange={e => { setManualLocation(e.target.value); setShipmentUpdated(false); }}
              placeholder="e.g. Bharuch"
              className="min-w-0 flex-1 rounded-lg border border-border/40 bg-surface-container-lowest/50 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/40" />
            <button type="button" onClick={runCheck} disabled={!manualLocation.trim()}
              className="rounded-lg border border-primary/35 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50">
              Evaluate
            </button>
          </div>
        )}
        {locationMode === 'estimated' && (
          <button type="button" onClick={runCheck}
            className="rounded-lg border border-primary/35 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20">
            Refresh
          </button>
        )}
      </div>

      {/* ── Update Shipment panel (Req 3) ── */}
      {canUpdateShipment && (
        <div className="mb-4 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3">
          <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Preview — Evaluated</div>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
            Metrics projected from{' '}
            <span className="font-semibold text-foreground capitalize">{evaluatedPreviewCity}</span>.
            Click <span className="font-semibold text-primary">Update Shipment</span> to confirm this
            as your current location. Progression will continue forward from here.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="rounded-lg bg-surface/30 border border-border/20 px-2.5 py-2">
              <div className="text-[9px] text-outline uppercase mb-0.5">Progress</div>
              <div className="text-[12px] font-bold text-foreground mono">{routeHealth.progress_percentage}%</div>
            </div>
            <div className="rounded-lg bg-surface/30 border border-border/20 px-2.5 py-2">
              <div className="text-[9px] text-outline uppercase mb-0.5">Rem. ETA</div>
              <div className="text-[12px] font-bold text-foreground mono">
                {routeHealth.remaining_eta_minutes != null ? `${routeHealth.remaining_eta_minutes}m` : '—'}
              </div>
            </div>
            <div className="rounded-lg bg-surface/30 border border-border/20 px-2.5 py-2">
              <div className="text-[9px] text-outline uppercase mb-0.5">Remaining</div>
              <div className="text-[12px] font-bold text-foreground mono">
                {routeHealth.remaining_distance_km > 0 ? `${routeHealth.remaining_distance_km} km` : '—'}
              </div>
            </div>
            {routeHealth.updated_risk != null && (
              <div className="rounded-lg bg-surface/30 border border-border/20 px-2.5 py-2">
                <div className="text-[9px] text-outline uppercase mb-0.5">Risk</div>
                <div className="text-[12px] font-bold text-foreground mono">
                  {Math.round(routeHealth.updated_risk * 100)}%
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleUpdateShipment} disabled={updatingShipment || saving}
              className="flex-1 rounded-lg border border-primary/40 bg-primary/15 py-2 text-sm font-bold text-primary transition hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-50">
              {updatingShipment ? 'Updating Shipment…' : 'Update Shipment'}
            </button>
            <button type="button"
              onClick={() => { setEvaluatedPreviewCity(''); setShipmentUpdated(false); }}
              className="rounded-lg border border-border/30 px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      )}

      {shipmentUpdated && (
        <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-300"
            style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>
            check_circle
          </span>
          <p className="text-[11px] text-emerald-300 font-semibold">
            Location confirmed. Automatic progression continues from here.
          </p>
        </div>
      )}

      {/* ── Recommended Action ── */}
      <div className="rounded-xl bg-surface-container-low/20 border border-outline-variant/8 px-3 py-2.5">
        <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Recommended Action</div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {routeHealth.recommendation?.label ||
            ACTION_LABELS[routeHealth.recommended_action] ||
            routeHealth.recommended_action}
        </p>
        {routeHealth.reoptimization_reason && (
          <p className="mt-1 text-[10px] text-outline italic">{routeHealth.reoptimization_reason}</p>
        )}
        {routeHealth.health_confidence != null && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[9px] text-outline uppercase font-bold">Confidence</span>
            <span className="text-[10px] font-semibold text-foreground mono">{routeHealth.health_confidence}%</span>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {(routeHealth.reoptimization_recommended ||
            routeHealth.recommendation?.suggest_reoptimization) && (
            <button type="button" onClick={handleReoptimize} disabled={reoptimizationLoading}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50">
              {reoptimizationLoading ? 'Generating Updated Plan…' : 'Reoptimize Trip'}
            </button>
          )}
          <button type="button" onClick={handleRegeneratePlan}
            className="rounded-lg border border-primary/30 bg-primary/8 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20">
            Regenerate Plan
          </button>
        </div>
      </div>

      {/* ── Reoptimization V1 ── */}
      <ReoptimizeV1Panel
        reportId={report.id}
        onAccepted={updated => {
          onShipmentUpdated?.(updated);
          fetchRouteHealth(report.id);
        }}
      />

      {/* ── Route Corridor (collapsible) ── */}
      {routeCities.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setShowCorridor(v => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-outline-variant/15 bg-surface-container-low/20 px-3 py-2.5 text-left transition hover:border-outline-variant/30">
            <span className="text-[9px] uppercase tracking-widest text-outline font-bold">
              Route Corridor ({routeCities.length} cities)
            </span>
            <span className="material-symbols-outlined text-outline"
              style={{ fontSize: '14px', transform: showCorridor ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
              expand_more
            </span>
          </button>
          {showCorridor && (
            <RouteCorridor
              cities={routeCities}
              completedCities={completedCities}
              remainingCities={remainingCities}
              currentLocation={previewCity || resolvedLocation}
            />
          )}
        </div>
      )}

      {/* ── Reoptimization results ── */}
      {reoptimization?.report_id === report.id && (
        <ReoptimizationReview
          recommendation={reoptimization.recommendation}
          onSave={handleSaveRevision}
          saving={saving}
          savedReportId={savedRevisionId}
        />
      )}

      {/* ── Health Breakdown — Why this score? (Phase 5) ── */}
      <HealthBreakdownPanel
        breakdown={routeHealth.health_breakdown ?? null}
        conditionProfile={routeHealth.condition_profile ?? null}
      />

      {/* ── Condition History (Phase 6) ── */}
      <ConditionHistoryPanel history={routeHealth.condition_history ?? []} />

      {/* ── Footer ── */}
      <div className="mt-3 flex items-center gap-2 text-[9px] text-outline">
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot} animate-pulse`} />
        Last checked:{' '}
        {new Date(routeHealth.checked_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}
