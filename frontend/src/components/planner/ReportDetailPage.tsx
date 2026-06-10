'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePlannerStore } from '@/store/usePlannerStore';
import { isExpired, expiresIn, type ShipmentReport, type ReportStatus } from '@/services/plannerApi';
import { getReport } from '@/services/plannerApi';
import { AmbientBackdrop } from '@/components/cockpit/AmbientBackdrop';
import { RouteHealthCard } from './RouteHealthCard';
import { routeForMode } from '@/lib/applyParsedIntent';

function MetricBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-4 py-3">
      <div className="text-[9px] uppercase tracking-widest text-outline font-label font-bold mb-1">{label}</div>
      <div className="text-base font-bold text-foreground mono">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function fmt(v: number | null | undefined, prefix = '', suffix = '', decimals = 0) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${prefix}${decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString('en-IN')}${suffix}`;
}

const STATUS_STYLES: Record<ReportStatus, string> = {
  draft:     'bg-surface-container text-outline border-outline-variant/20',
  planned:   'bg-primary/10 text-primary border-primary/20',
  active:    'bg-emerald-500/12 text-emerald-300 border-emerald-500/20',
  completed: 'bg-violet-500/12 text-violet-300 border-violet-500/20',
  cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const MODE_STYLES: Record<string, string> = {
  road: 'bg-secondary/10 text-secondary border-secondary/20',
  rail: 'bg-primary/10 text-primary border-primary/20',
  air: 'bg-sky-400/10 text-sky-400 border-sky-400/20',
  water: 'bg-teal-400/10 text-teal-400 border-teal-400/20',
  hybrid: 'bg-violet-400/10 text-violet-400 border-violet-400/20',
  comparator: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
};

interface Props { reportId: string }

export function ReportDetailPage({ reportId }: Props) {
  const router = useRouter();
  const {
    reports,
    routeHealth,
    fetchReports,
    updateReportData,
    removeReport,
    executeTrip,
    stopTrip,
    cancelTrip,
    restartTrip,
    saving,
  } = usePlannerStore();
  const [report, setReport] = useState<ShipmentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [tripAction, setTripAction] = useState<string | null>(null);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  // Load from store first (instant), then verify from API
  useEffect(() => {
    const cached = reports.find(r => r.id === reportId);
    if (cached) { setReport(cached); setLoading(false); }

    getReport(reportId)
      .then(r => { setReport(r); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [reportId, reports]);

  const handleRename = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftName.trim() || !report) return;
    setRenameSaving(true);
    try {
      await updateReportData(report.id, { name: draftName.trim() });
      setReport(r => r ? { ...r, name: draftName.trim() } : r);
      setRenaming(false);
    } finally { setRenameSaving(false); }
  }, [draftName, report, updateReportData]);

  const handleDelete = useCallback(async () => {
    if (!report) return;
    setDeleting(true);
    try {
      await removeReport(report.id);
      router.push('/reports');
    } finally { setDeleting(false); }
  }, [report, removeReport, router]);

  const handleTripAction = useCallback(async (action: 'execute' | 'stop' | 'cancel' | 'restart') => {
    if (!report) return;
    setTripAction(action);
    try {
      const actions = { execute: executeTrip, stop: stopTrip, cancel: cancelTrip, restart: restartTrip };
      await actions[action](report.id);
      // Refresh report data
      const updated = await getReport(report.id);
      setReport(updated);
    } catch (err) {
      // Error is set in store
    } finally {
      setTripAction(null);
    }
  }, [report, executeTrip, stopTrip, cancelTrip, restartTrip]);

  if (loading) return (
    <div className="flex flex-col items-center gap-3 py-32">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      <p className="text-sm text-muted-foreground">Loading plan…</p>
    </div>
  );

  if (error || !report) return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <p className="text-foreground mb-4">{error ?? 'Report not found'}</p>
      <Link href="/reports" className="text-sm text-primary hover:underline">← Back to plans</Link>
    </div>
  );

  const expired = isExpired(report);
  const expiry  = expiresIn(report);
  const createdAt = new Date(report.created_at).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const expiresAt = report.expires_at
    ? new Date(report.expires_at).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

  const waypoints = report.stops.length > 0
    ? [report.source, ...report.stops, report.destination]
    : [report.source, report.destination];
  const parentReport = report.parent_report_id
    ? reports.find(r => r.id === report.parent_report_id) ?? null
    : null;
  const childRevisions = reports.filter(r => r.parent_report_id === report.id);
  const siblingRevisions = parentReport
    ? reports.filter(r => r.parent_report_id === parentReport.id)
    : [];
  const revisionHistory = parentReport
    ? [parentReport, ...siblingRevisions].filter((r, index, arr) => arr.findIndex(x => x.id === r.id) === index)
    : childRevisions;

  return (
    <div className="relative w-full min-h-screen">
      <AmbientBackdrop variant="subtle" />

      <div className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-12">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-6">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
          <span>›</span>
          <Link href="/reports" className="hover:text-foreground transition-colors">My Plans</Link>
          <span>›</span>
          <span className="text-foreground truncate max-w-[200px]">{report.name}</span>
        </div>

        {/* Expiry warning */}
        {expired && (
          <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-400 shrink-0 mt-0.5" style={{ fontSize: '16px' }}>schedule</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-300">Estimates Outdated</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                This plan was generated more than 24 hours ago. Traffic, weather, and pricing may have changed.
              </p>
            </div>
            <Link
              href={`${routeForMode(report.mode)}?source=${encodeURIComponent(report.source)}&destination=${encodeURIComponent(report.destination)}`}
              className="shrink-0 flex items-center gap-1 rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/25 transition"
            >
              Regenerate Plan
            </Link>
          </div>
        )}

        {/* Notice */}
        <div className="mb-6 rounded-xl border border-border/20 bg-surface/20 px-4 py-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            This plan is based on historical and live conditions available at generation time.
            Regenerate for the latest estimates.
          </p>
        </div>

        {/* Title row */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex-1 min-w-0">
            {renaming ? (
              <form onSubmit={handleRename} className="flex gap-2 items-center">
                <input
                  autoFocus
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  maxLength={120}
                  className="flex-1 min-w-0 rounded-xl border border-border/40 bg-surface-container-lowest/50 px-3 py-2 text-lg font-bold focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <button type="submit" disabled={renameSaving}
                  className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/20 disabled:opacity-50">
                  {renameSaving ? '…' : 'Save'}
                </button>
                <button type="button" onClick={() => setRenaming(false)}
                  className="rounded-xl border border-border/30 px-2.5 py-2 text-sm text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex items-start gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">{report.name}</h1>
                <button
                  onClick={() => { setDraftName(report.name); setRenaming(true); }}
                  className="shrink-0 mt-1 text-muted-foreground hover:text-foreground transition"
                  title="Rename"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>edit</span>
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-[9px] px-2 py-0.5 rounded-md border font-bold uppercase tracking-widest ${MODE_STYLES[report.mode] || 'bg-surface-container/40 border-border/15 text-muted-foreground'}`}>
                {report.mode}
              </span>
              {report.cargo_type && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-surface-container/40 border border-border/15 text-muted-foreground uppercase tracking-wide">
                  {report.cargo_type}
                </span>
              )}
              <span className={`text-[9px] px-1.5 py-0.5 rounded-md border font-semibold uppercase tracking-wide ${STATUS_STYLES[report.status]}`}>
                {report.status}
              </span>
            </div>
          </div>
        </div>

        {/* Planning Summary */}
        <section className="mb-6">
          <h2 className="text-[10px] font-label font-bold uppercase tracking-[0.14em] text-outline mb-3">Planning Summary</h2>
          <div className="rounded-2xl border border-border/40 bg-surface/30 p-4 sm:p-5 space-y-3">

            {/* Route chain */}
            <div>
              <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-2">Route</div>
              <div className="flex flex-wrap items-center gap-1 text-sm font-medium text-foreground mono">
                {waypoints.map((wp, i) => (
                  <span key={`${wp}-${i}`} className="flex items-center gap-1">
                    <span className={[
                      'px-2 py-0.5 rounded-lg text-[11px] border',
                      i === 0 ? 'bg-primary/10 border-primary/25 text-primary' :
                      i === waypoints.length - 1 ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' :
                      'bg-violet-500/8 border-violet-500/20 text-violet-300',
                    ].join(' ')}>
                      {wp}
                    </span>
                    {i < waypoints.length - 1 && <span className="text-outline/50 text-[10px]">→</span>}
                  </span>
                ))}
              </div>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <MetricBlock label="Cost" value={fmt(report.estimated_cost, '₹')} />
              <MetricBlock label="Time" value={fmt(report.estimated_time, '', 'h', 1)} />
              <MetricBlock label="Risk" value={report.risk_score != null ? `${Math.round(report.risk_score * 100)}%` : '—'} />
              <MetricBlock label="Stops" value={`${report.stops.length}`} sub={report.stops.length === 0 ? 'Direct' : 'Intermediate'} />
            </div>

            {/* Trip lifecycle info */}
            {report.started_at && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <MetricBlock
                  label="Started At"
                  value={new Date(report.started_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                />
                {report.expected_end_time && (
                  <MetricBlock
                    label="Expected End"
                    value={new Date(report.expected_end_time).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    sub={report.buffer_minutes ? `Includes ${report.buffer_minutes}min buffer` : undefined}
                  />
                )}
              </div>
            )}
            {report.completed_at && (
              <div className="grid grid-cols-1 gap-2 pt-1">
                <MetricBlock
                  label="Completed At"
                  value={new Date(report.completed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                />
              </div>
            )}

            {/* Timestamps */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <MetricBlock label="Generated At" value={createdAt} />
              <MetricBlock
                label="Valid Until"
                value={expiresAt}
                sub={expired ? '⚠ Expired' : expiry}
              />
            </div>
          </div>
        </section>

        {/* Route Health — only for active trips */}
        {report.status === 'active' && (
          <section id="route-health" className="mb-6">
            <h2 className="text-[10px] font-label font-bold uppercase tracking-[0.14em] text-outline mb-3">Route Health</h2>
            <RouteHealthCard
              report={report}
              onShipmentUpdated={updated => setReport(updated)}
            />
          </section>
        )}

        {/* Issue 4 — Route Corridor (always visible when route intelligence exists) */}
        {(() => {
          const routeCities: string[] = (
            report.optimization_result?.route_intelligence as Record<string, unknown> | null | undefined
          )?.route_cities as string[] ?? [];
          if (!routeCities.length) return null;
          return (
            <section className="mb-6">
              <h2 className="text-[10px] font-label font-bold uppercase tracking-[0.14em] text-outline mb-3">
                Route Corridor
              </h2>
              <div className="rounded-2xl border border-border/40 bg-surface/30 p-4">
                <div className="flex flex-col gap-1">
                  {routeCities.map((city, i) => {
                    const isFirst = i === 0;
                    const isLast = i === routeCities.length - 1;
                    return (
                      <div key={`${city}-${i}`} className="flex items-center gap-3">
                        <div className="flex flex-col items-center" style={{ width: '16px' }}>
                          {!isFirst && <div className="w-px bg-outline-variant/30" style={{ height: '8px' }} />}
                          <div className={[
                            'h-2 w-2 rounded-full shrink-0',
                            isFirst ? 'bg-primary' : isLast ? 'bg-emerald-400' : 'bg-outline/40',
                          ].join(' ')} />
                          {!isLast && <div className="w-px bg-outline-variant/30" style={{ height: '8px' }} />}
                        </div>
                        <span className={[
                          'text-[12px] font-medium capitalize',
                          isFirst ? 'text-primary' : isLast ? 'text-emerald-300' : 'text-muted-foreground',
                        ].join(' ')}>
                          {city}
                          {isFirst && <span className="ml-2 text-[9px] text-outline">origin</span>}
                          {isLast && <span className="ml-2 text-[9px] text-outline">destination</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })()}

        {(parentReport || revisionHistory.length > 0) && (
          <section className="mb-6">
            <h2 className="text-[10px] font-label font-bold uppercase tracking-[0.14em] text-outline mb-3">Revision History</h2>
            <div className="rounded-2xl border border-border/40 bg-surface/30 p-4">
              {parentReport && (
                <div className="mb-3 rounded-xl border border-primary/20 bg-primary/8 px-3 py-2.5">
                  <div className="text-[9px] uppercase tracking-widest text-outline font-bold mb-1">Original Plan</div>
                  <Link href={`/reports/${parentReport.id}`} className="text-sm font-semibold text-primary hover:underline">
                    {parentReport.name}
                  </Link>
                  <div className="mt-0.5 text-[10px] text-muted-foreground mono">
                    {parentReport.source} → {parentReport.destination}
                  </div>
                </div>
              )}

              {revisionHistory.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[9px] uppercase tracking-widest text-outline font-bold">Revisions</div>
                  {revisionHistory.map(revision => (
                    <Link
                      key={revision.id}
                      href={`/reports/${revision.id}`}
                      className={[
                        'block rounded-xl border px-3 py-2.5 transition',
                        revision.id === report.id
                          ? 'border-emerald-500/25 bg-emerald-500/8'
                          : 'border-border/25 bg-surface-container-low/25 hover:border-primary/30',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-foreground">
                            {revision.id === report.id ? `${revision.name} (Current)` : revision.name}
                          </div>
                          <div className="mt-0.5 truncate text-[10px] text-muted-foreground mono">
                            {revision.source} → {revision.destination}
                          </div>
                        </div>
                        <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-md border font-semibold uppercase tracking-wide ${STATUS_STYLES[revision.status]}`}>
                          {revision.status}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Trip Lifecycle Actions */}
        <section className="mb-6">
          <h2 className="text-[10px] font-label font-bold uppercase tracking-[0.14em] text-outline mb-3">Trip Actions</h2>
          <div className="flex flex-wrap gap-3">
            {/* Planned → Execute Trip */}
            {(report.status === 'planned' || report.status === 'draft') && (
              <button
                onClick={() => handleTripAction('execute')}
                disabled={saving || tripAction !== null}
                className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-5 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition-all"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                {tripAction === 'execute' ? 'Starting…' : 'Execute Trip'}
              </button>
            )}

            {/* Active → Check Route Health + Stop Trip */}
            {report.status === 'active' && (
              <>
                <button
                  onClick={() => {
                    const el = document.querySelector('[data-route-health]');
                    el?.scrollIntoView({ behavior: 'smooth' });
                    usePlannerStore.getState().fetchRouteHealth(report.id);
                  }}
                  className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/30 px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20 transition-all"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>health_and_safety</span>
                  Check Route Health
                </button>
                <button
                  onClick={() => handleTripAction('stop')}
                  disabled={saving || tripAction !== null}
                  className="flex items-center gap-2 rounded-xl bg-violet-500/10 border border-violet-500/30 px-5 py-2.5 text-sm font-semibold text-violet-300 hover:bg-violet-500/20 disabled:opacity-50 transition-all"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>stop_circle</span>
                  {tripAction === 'stop' ? 'Stopping…' : 'Stop Trip'}
                </button>
              </>
            )}

            {/* Completed or Cancelled → Restart Trip */}
            {(report.status === 'completed' || report.status === 'cancelled') && (
              <button
                onClick={() => handleTripAction('restart')}
                disabled={saving || tripAction !== null}
                className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/30 px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20 disabled:opacity-50 transition-all"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>replay</span>
                {tripAction === 'restart' ? 'Restarting…' : 'Restart Trip'}
              </button>
            )}

            {/* Cancel — available from planned, draft, active */}
            {(report.status === 'planned' || report.status === 'draft' || report.status === 'active') && (
              <button
                onClick={() => handleTripAction('cancel')}
                disabled={saving || tripAction !== null}
                className="flex items-center gap-2 rounded-xl border border-red-500/30 px-5 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-all"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>cancel</span>
                {tripAction === 'cancel' ? 'Cancelling…' : 'Cancel Trip'}
              </button>
            )}
          </div>
        </section>

        {/* General Actions */}
        <div className="flex flex-wrap gap-3 mb-8">
          {/* Phase 8 — Regenerate Plan: for active trips prefill from current location */}
          {(() => {
            // Determine source for regenerate:
            // active trip → use current location from route health (corridor-matched or estimated)
            // otherwise  → use original source
            let regenSource = report.source;
            let regenStops: string[] = report.stops;
            let regenDestination = report.destination;

            if (report.status === 'active' && routeHealth?.report_id === report.id) {
              const currentLoc =
                routeHealth.actual_location?.label ||
                routeHealth.corridor_matched_city ||
                routeHealth.estimated_location?.label ||
                report.source;

              regenSource = currentLoc;

              // Remaining stops: all waypoints strictly after current location
              const allWaypoints = [report.source, ...report.stops, report.destination];
              const normLoc = currentLoc.toLowerCase();
              const locIdx = allWaypoints.findIndex(w => w.toLowerCase() === normLoc);
              const afterLoc = locIdx >= 0 ? allWaypoints.slice(locIdx + 1) : allWaypoints.slice(1);
              regenStops = afterLoc.slice(0, -1);   // exclude destination
              regenDestination = report.destination;
            }

            const params = new URLSearchParams({
              source: regenSource,
              destination: regenDestination,
            });
            if (regenStops.length > 0) params.set('stops', regenStops.join(','));

            return (
              <Link
                href={`${routeForMode(report.mode)}?${params.toString()}`}
                className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20 transition-all"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>refresh</span>
                Regenerate Plan
              </Link>
            );
          })()}

          <Link
            href="/reports"
            className="flex items-center gap-2 rounded-xl border border-border/40 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-border/70 transition-all"
          >
            ← Back to plans
          </Link>

          {confirmDelete ? (
            <div className="flex gap-2 ml-auto">
              <button onClick={handleDelete} disabled={deleting}
                className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition">
                {deleting ? 'Deleting…' : 'Confirm Delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="rounded-xl border border-border/30 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="ml-auto flex items-center gap-2 rounded-xl border border-border/30 px-4 py-2.5 text-sm text-muted-foreground hover:text-red-400 hover:border-red-500/30 transition-all">
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>delete</span>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
