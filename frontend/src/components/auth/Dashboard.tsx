'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowUpRight, TrendingUp } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlannerStore } from '@/store/usePlannerStore';
import { isExpired } from '@/services/plannerApi';
import { AmbientBackdrop } from '@/components/cockpit/AmbientBackdrop';

export function Dashboard() {
  const user = useAuthStore(s => s.user);
  const firstName = user?.name.split(' ')[0] || 'User';

  const { reports, fetchReports, loading: reportsLoading } = usePlannerStore();

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const totalPlans     = reports.length;
  const activePlans    = reports.filter(r => r.status === 'active').length;
  const expiredPlans   = reports.filter(r => isExpired(r)).length;
  const recentReports  = reports.slice(0, 4);

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
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'Total Plans',   value: totalPlans,   icon: '📋' },
              { label: 'Active Plans',  value: activePlans,  icon: '🚀',
                highlight: activePlans > 0 },
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
              href="/rail"
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
