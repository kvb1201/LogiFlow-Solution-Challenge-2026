'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePlannerStore } from '@/store/usePlannerStore';
import { isExpired, expiresIn, type ShipmentReport, type ReportStatus } from '@/services/plannerApi';

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

function fmt(v: number | null | undefined, prefix = '', suffix = '') {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${prefix}${Math.round(v).toLocaleString('en-IN')}${suffix}`;
}

interface Props {
  report: ShipmentReport;
}

export function ReportCard({ report }: Props) {
  const { renameReport, removeReport } = usePlannerStore();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(report.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const expired = isExpired(report);
  const expiry = expiresIn(report);

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftName.trim() || draftName.trim() === report.name) { setRenaming(false); return; }
    setBusy(true);
    try { await renameReport(report.id, draftName.trim()); }
    finally { setBusy(false); setRenaming(false); }
  };

  const handleDelete = async () => {
    setBusy(true);
    try { await removeReport(report.id); }
    finally { setBusy(false); setConfirmDelete(false); }
  };

  return (
    <div className={[
      'rounded-2xl border transition-all duration-200',
      expired
        ? 'border-amber-500/20 bg-amber-500/5'
        : 'border-border/40 bg-surface/40 hover:border-border/70 hover:bg-surface/60',
    ].join(' ')}>
      <div className="p-4 sm:p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            {renaming ? (
              <form onSubmit={handleRenameSubmit} className="flex gap-2">
                <input
                  autoFocus
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  maxLength={120}
                  className="flex-1 min-w-0 rounded-lg border border-border/40 bg-surface-container-lowest/50 px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <button type="submit" disabled={busy} className="text-[10px] px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition disabled:opacity-50">
                  Save
                </button>
                <button type="button" onClick={() => { setRenaming(false); setDraftName(report.name); }}
                  className="text-[10px] px-2.5 py-1 rounded-lg border border-border/30 text-muted-foreground hover:text-foreground transition">
                  Cancel
                </button>
              </form>
            ) : (
              <h3 className="font-semibold text-sm text-foreground truncate leading-tight">{report.name}</h3>
            )}

            <p className="text-[11px] text-muted-foreground mt-1 mono truncate">
              {report.source} → {report.destination}
              {report.stops.length > 0 && ` · ${report.stops.length} stop${report.stops.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-md border font-semibold uppercase tracking-wide ${STATUS_STYLES[report.status]}`}>
              {report.status}
            </span>
          </div>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { emoji: '💰', label: 'Cost', value: fmt(report.estimated_cost, '₹') },
            { emoji: '⏱', label: 'Time', value: report.estimated_time != null ? `${report.estimated_time.toFixed(1)}h` : '—' },
            { emoji: '⚠️', label: 'Risk', value: report.risk_score != null ? `${Math.round(report.risk_score * 100)}%` : '—' },
          ].map(m => (
            <div key={m.label} className="rounded-lg bg-surface-container/30 border border-border/15 px-2.5 py-2">
              <div className="text-[9px] text-muted-foreground mb-0.5 flex items-center gap-1">
                <span>{m.emoji}</span>{m.label}
              </div>
              <div className="text-xs font-bold text-foreground mono">{m.value}</div>
            </div>
          ))}
        </div>

        {/* Expiry & mode row */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] px-2 py-0.5 rounded-md border font-bold uppercase tracking-widest ${MODE_STYLES[report.mode] || 'bg-surface-container/40 border-border/15 text-muted-foreground'}`}>
              {report.mode}
            </span>
            <span className="text-[9px] text-muted-foreground">
              {new Date(report.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
            </span>
          </div>
          {expired ? (
            <span className="flex items-center gap-1 text-[9px] font-semibold text-amber-400">
              <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>schedule</span>
              Estimates Outdated
            </span>
          ) : expiry ? (
            <span className="text-[9px] text-muted-foreground">{expiry}</span>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Link
            href={`/reports/${report.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-border/40 py-2 text-[11px] font-semibold text-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>open_in_new</span>
            Open
          </Link>

          <button
            onClick={() => { setRenaming(true); setDraftName(report.name); }}
            className="flex items-center justify-center gap-1 rounded-xl border border-border/40 px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:border-border/70 transition-all"
            title="Rename"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>edit</span>
          </button>

          {confirmDelete ? (
            <div className="flex gap-1">
              <button onClick={handleDelete} disabled={busy}
                className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] font-semibold text-red-400 hover:bg-red-500/20 transition disabled:opacity-50">
                {busy ? '…' : 'Delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="rounded-xl border border-border/30 px-2.5 py-2 text-[11px] text-muted-foreground hover:text-foreground transition">
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center justify-center rounded-xl border border-border/40 px-3 py-2 text-[11px] text-muted-foreground hover:text-red-400 hover:border-red-500/30 transition-all"
              title="Delete"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>delete</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
