'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlannerStore } from '@/store/usePlannerStore';
import { isExpired } from '@/services/plannerApi';
import { AmbientBackdrop } from '@/components/cockpit/AmbientBackdrop';

function formatShortDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getProgress(startedAt: string | null, expectedEndTime: string | null) {
  if (!startedAt || !expectedEndTime) return 0;
  const start = new Date(startedAt).getTime();
  const end = new Date(expectedEndTime).getTime();
  const now = Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

function getHealthLevel(riskScore: number | null) {
  const risk = riskScore ?? 0.15;
  if (risk >= 0.6) return 'at_risk';
  if (risk >= 0.35) return 'moderate';
  return 'healthy';
}

const HEALTH_BADGES = {
  healthy: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/20',
  moderate: 'bg-amber-500/12 text-amber-300 border-amber-500/20',
  at_risk: 'bg-red-500/12 text-red-400 border-red-500/20',
} as const;

export function Dashboard() {
  const user = useAuthStore(s => s.user);
  const firstName = user?.name.split(' ')[0] || 'User';

  const { reports, fetchReports, loading: reportsLoading } = usePlannerStore();

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const totalPlans     = reports.length;
  const activePlans    = reports.filter(r => r.status === 'active').length;
  const expiredPlans   = reports.filter(r => isExpired(r)).length;
  const reoptimizedTrips = reports.filter(r => r.parent_report_id != null).length;
  const recentReports  = reports.slice(0, 4);
  const activeReports  = reports.filter(r => r.status === 'active').slice(0, 4);

  return (
    <div className="relative w-full overflow-hidden">
      <AmbientBackdrop variant="subtle" />

      <div className="relative z-10 pointer-events-auto mx-auto w-full max-w-6xl px-4 sm:px-6 py-10 sm:py-14">

        {/* Welcome */}
        <div className="mb-10 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
            Welcome back, {firstName}
          </h1>
          <p className="text-muted-foreground">
            Manage your shipments, monitor active trips, and optimize routes.
          </p>
        </div>

        {/* ── Smart AI Planner ─────────────────────────────────────────── */}
        <section className="mb-10">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <div className="text-[10px] font-label font-bold uppercase tracking-[0.14em] text-outline mb-0.5">
                Smart AI Planner
              </div>
              <h2 className="text-lg font-bold text-foreground">My Shipment Plans</h2>
            </div>
            <Link
              href="/reports"
              className="flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              View all
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Plan stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Total Plans',   value: totalPlans,   icon: '📋' },
              { label: 'Active Plans',  value: activePlans,  icon: '🚀',
                highlight: activePlans > 0 },
              { label: 'Reoptimized',   value: reoptimizedTrips, icon: '🔁',
                highlight: reoptimizedTrips > 0 },
              { label: 'Expired',       value: expiredPlans, icon: '⏰',
                warn: expiredPlans > 0 },
            ].map(s => (
              <div key={s.label} className={[
                'rounded-2xl border p-4 transition-all',
                s.warn && s.value > 0
                  ? 'border-amber-500/20 bg-amber-500/5'
                  : s.highlight && s.value > 0
                  ? 'border-emerald-500/20 bg-emerald-500/5'
                  : 'border-border/40 bg-surface/40',
              ].join(' ')}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{s.label}</p>
                  <span className="text-lg">{s.icon}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{reportsLoading ? '…' : s.value}</p>
              </div>
            ))}
          </div>

          {/* Recent plans */}
          {!reportsLoading && recentReports.length > 0 ? (
            <div className="rounded-2xl border border-border/40 bg-surface/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/20 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Recent Plans
                </span>
                <Link href="/reports" className="text-[11px] text-primary hover:underline">See all →</Link>
              </div>
              <ul className="divide-y divide-border/15">
                {recentReports.map(r => {
                  const expired = isExpired(r);
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/reports/${r.id}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-surface/60 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                            {r.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground mono mt-0.5 truncate">
                            {r.source} → {r.destination}
                            {r.stops.length > 0 && ` · ${r.stops.length} stop${r.stops.length !== 1 ? 's' : ''}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {expired && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold">
                              Outdated
                            </span>
                          )}
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-md border font-semibold uppercase tracking-wide ${
                            { draft: 'bg-surface-container text-outline border-outline-variant/20',
                              planned: 'bg-primary/10 text-primary border-primary/20',
                              active: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/20',
                              completed: 'bg-violet-500/12 text-violet-300 border-violet-500/20',
                              cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
                            }[r.status]
                          }`}>
                            {r.status}
                          </span>
                          <span className="material-symbols-outlined text-muted-foreground group-hover:text-primary transition-colors" style={{ fontSize: '14px' }}>
                            chevron_right
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : !reportsLoading ? (
            <div className="rounded-2xl border border-dashed border-border/40 bg-surface/20 p-8 text-center">
              <span className="text-3xl block mb-3">📭</span>
              <p className="text-sm font-medium text-foreground mb-1">No plans yet</p>
              <p className="text-xs text-muted-foreground mb-4">
                Optimize a route and click <strong>Save Report</strong> to save it here.
              </p>
              <Link
                href="/road"
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 border border-primary/30 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20 transition-all"
              >
                Start planning
              </Link>
            </div>
          ) : null}
        </section>

        {/* ── Active Trips ───────────────────────────────────────────── */}
        {activeReports.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <div className="text-[10px] font-label font-bold uppercase tracking-[0.14em] text-outline mb-0.5">
                  Monitor
                </div>
                <h2 className="text-lg font-bold text-foreground">Active Trips</h2>
              </div>
              <Link href="/reports?status=active" className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                View active
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activeReports.map(report => {
                const progress = getProgress(report.started_at, report.expected_end_time);
                const health = getHealthLevel(report.risk_score);
                return (
                  <div key={report.id} className="rounded-2xl border border-border/40 bg-surface/35 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-foreground">{report.name}</p>
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground mono">
                          {report.source} → {report.destination}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                          {report.mode}
                        </span>
                        <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${HEALTH_BADGES[health]}`}>
                          {health.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low/35 px-3 py-2">
                        <div className="mb-1 text-[9px] font-bold uppercase tracking-widest text-outline">Started</div>
                        <div className="text-[11px] font-semibold text-foreground">{formatShortDate(report.started_at)}</div>
                      </div>
                      <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low/35 px-3 py-2">
                        <div className="mb-1 text-[9px] font-bold uppercase tracking-widest text-outline">ETA</div>
                        <div className="text-[11px] font-semibold text-foreground">{formatShortDate(report.expected_end_time)}</div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Progress</span>
                        <span className="mono">{progress}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-container-low">
                        <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/reports/${report.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border/35 px-3 py-1.5 text-[11px] font-semibold text-foreground transition hover:border-border/70"
                      >
                        View Trip
                      </Link>
                      <Link
                        href={`/reports/${report.id}#route-health`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary transition hover:bg-primary/20"
                      >
                        Check Route Health
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Create New Plan */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-foreground mb-4">Create New Plan</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Link
              href="/comparator"
              className="rounded-xl border border-border/50 bg-surface/40 p-4 hover:border-primary/40 hover:bg-surface/60 transition-all flex flex-col items-center text-center group"
            >
              <div className="h-10 w-10 rounded-lg bg-surface-container/50 border border-border/50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>rule</span>
              </div>
              <span className="font-semibold text-sm text-foreground">Compare</span>
            </Link>

            <Link
              href="/hybrid"
              className="rounded-xl border border-border/50 bg-surface/40 p-4 hover:border-violet-500/40 hover:bg-surface/60 transition-all flex flex-col items-center text-center group"
            >
              <div className="h-10 w-10 rounded-lg bg-surface-container/50 border border-border/50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-violet-400" style={{ fontVariationSettings: "'FILL' 1" }}>alt_route</span>
              </div>
              <span className="font-semibold text-sm text-foreground">Hybrid</span>
            </Link>

            <Link
              href="/road"
              className="rounded-xl border border-border/50 bg-surface/40 p-4 hover:border-emerald-500/40 hover:bg-surface/60 transition-all flex flex-col items-center text-center group"
            >
              <div className="h-10 w-10 rounded-lg bg-surface-container/50 border border-border/50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-emerald-400" style={{ fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
              </div>
              <span className="font-semibold text-sm text-foreground">Road</span>
            </Link>

            <Link
              href="/railway"
              className="rounded-xl border border-border/50 bg-surface/40 p-4 hover:border-sky-500/40 hover:bg-surface/60 transition-all flex flex-col items-center text-center group"
            >
              <div className="h-10 w-10 rounded-lg bg-surface-container/50 border border-border/50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-sky-400" style={{ fontVariationSettings: "'FILL' 1" }}>train</span>
              </div>
              <span className="font-semibold text-sm text-foreground">Rail</span>
            </Link>

            <Link
              href="/air"
              className="rounded-xl border border-border/50 bg-surface/40 p-4 hover:border-amber-500/40 hover:bg-surface/60 transition-all flex flex-col items-center text-center group"
            >
              <div className="h-10 w-10 rounded-lg bg-surface-container/50 border border-border/50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-amber-400" style={{ fontVariationSettings: "'FILL' 1" }}>flight_takeoff</span>
              </div>
              <span className="font-semibold text-sm text-foreground">Air</span>
            </Link>

            <Link
              href="/water"
              className="rounded-xl border border-border/50 bg-surface/40 p-4 hover:border-teal-500/40 hover:bg-surface/60 transition-all flex flex-col items-center text-center group"
            >
              <div className="h-10 w-10 rounded-lg bg-surface-container/50 border border-border/50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-teal-400" style={{ fontVariationSettings: "'FILL' 1" }}>directions_boat</span>
              </div>
              <span className="font-semibold text-sm text-foreground">Water</span>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <div className="text-center">
          <p className="text-muted-foreground mb-5">Ready to start optimizing your logistics?</p>
          <Link
            href="/hybrid"
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-[0_0_40px_-12px_var(--hybrid)] transition-all duration-300 hover:brightness-110 hover:shadow-[0_0_52px_-8px_var(--hybrid)]"
          >
            Start Optimizing Routes
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

      </div>
    </div>
  );
}
