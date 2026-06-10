'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { usePlannerStore } from '@/store/usePlannerStore';
import { isExpired, type ReportStatus } from '@/services/plannerApi';
import { ReportCard } from './ReportCard';
import { AmbientBackdrop } from '@/components/cockpit/AmbientBackdrop';
import AiBriefPanel from '@/components/AiBriefPanel';

const STATUS_FILTERS: { label: string; value: ReportStatus | 'all' | 'expired' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Planned', value: 'planned' },
  { label: 'Active', value: 'active' },
  { label: 'Completed', value: 'completed' },
  { label: 'Expired', value: 'expired' },
];

function parseStatusFilter(raw: string | null): ReportStatus | 'all' | 'expired' {
  if (!raw) return 'all';
  return STATUS_FILTERS.some((f) => f.value === raw)
    ? (raw as ReportStatus | 'all' | 'expired')
    : 'all';
}

export function ReportsPage() {
  const searchParams = useSearchParams();
  const { reports, loading, error, fetchReports } = usePlannerStore();
  const [filter, setFilter] = useState<ReportStatus | 'all' | 'expired'>(() =>
    parseStatusFilter(searchParams?.get('status') ?? null)
  );

  useEffect(() => { fetchReports(); }, [fetchReports]);

  useEffect(() => {
    setFilter(parseStatusFilter(searchParams?.get('status') ?? null));
  }, [searchParams]);

  const filtered = reports.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'expired') return isExpired(r);
    return r.status === filter;
  });

  const totalPlans   = reports.length;
  const activePlans  = reports.filter(r => r.status === 'active').length;
  const expiredPlans = reports.filter(r => isExpired(r)).length;

  return (
    <div className="relative w-full min-h-screen">
      <AmbientBackdrop variant="subtle" />

      <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-12">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <div className="text-[10px] font-label font-bold uppercase tracking-[0.14em] text-outline mb-1">
              Shipment Planner
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">My Plans</h1>
          </div>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/30 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20 transition-all"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>add</span>
            New Plan
          </Link>
        </div>

        <section className="mb-8">
          <div className="pipeline-card overflow-hidden p-5 sm:p-6">
            <AiBriefPanel contextMode="home" navigateOnApply={false} showRouteButton embedded />
          </div>
        </section>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: 'Total Plans', value: totalPlans, icon: '📋' },
            { label: 'Active Plans', value: activePlans, icon: '🚀', highlight: activePlans > 0 },
            { label: 'Expired', value: expiredPlans, icon: '⏰', warn: expiredPlans > 0 },
          ].map(s => (
            <div key={s.label} className={[
              'rounded-xl border p-4 transition-all',
              s.warn && s.value > 0 ? 'border-amber-500/20 bg-amber-500/5' :
              s.highlight && s.value > 0 ? 'border-emerald-500/20 bg-emerald-500/5' :
              'border-border/40 bg-surface/40',
            ].join(' ')}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{s.label}</span>
                <span className="text-lg">{s.icon}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 flex-wrap mb-6">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={[
                'px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all',
                filter === f.value
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'bg-surface/40 border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60',
              ].join(' ')}
            >
              {f.label}
              {f.value !== 'all' && (() => {
                const count = f.value === 'expired'
                  ? reports.filter(r => isExpired(r)).length
                  : reports.filter(r => r.status === f.value).length;
                return count > 0 ? <span className="ml-1.5 opacity-60">({count})</span> : null;
              })()}
            </button>
          ))}
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
            <p className="text-sm text-muted-foreground">Loading plans…</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-risk/30 bg-risk/10 p-6 text-center">
            <p className="text-sm text-foreground mb-3">{error}</p>
            <button onClick={fetchReports} className="text-sm text-primary hover:underline">Try again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border/30 bg-surface/20 p-10 text-center">
            <span className="text-4xl block mb-4">📭</span>
            <h3 className="font-semibold text-foreground mb-2">
              {filter === 'all' ? 'No plans yet' : `No ${filter} plans`}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Use the AI brief above to plan a route, then click <strong>Save Report</strong> on
              results to store it here.
            </p>
            <Link
              href="/hybrid"
              className="inline-flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/30 px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20 transition-all"
            >
              Plan a route
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map(r => <ReportCard key={r.id} report={r} />)}
          </div>
        )}
      </div>
    </div>
  );
}
