'use client';

import React from 'react';
import Link from 'next/link';
import type { ParsedIntent } from '@/services/api';
import { buildIntentSummary } from '@/lib/formatIntentSummary';
import { routeForMode } from '@/lib/applyParsedIntent';
import { AmbientSurface } from '@/components/cockpit/AmbientSurface';
import { accentVar } from '@/lib/pipeline-theme';

type IntentConfirmModalProps = {
  open: boolean;
  parsed: ParsedIntent | null;
  loading?: boolean;
  onConfirmRun: () => void;
  onEdit: () => void;
  onClose: () => void;
};

function resolveMode(parsed: ParsedIntent): string {
  const m = (parsed.suggested_mode || 'hybrid').toLowerCase();
  if (['rail', 'road', 'air', 'water', 'hybrid', 'comparator'].includes(m)) return m;
  return 'hybrid';
}

export default function IntentConfirmModal({
  open,
  parsed,
  loading = false,
  onConfirmRun,
  onEdit,
  onClose,
}: IntentConfirmModalProps) {
  if (!open || !parsed) return null;

  const { lines, modeLabel, readyToRun, headline } = buildIntentSummary(parsed);
  const mode = resolveMode(parsed);
  const modePath = routeForMode(mode);
  const accent = accentVar(
    (['rail', 'road', 'air', 'water', 'hybrid', 'comparator'] as const).includes(
      mode as 'rail'
    )
      ? (mode as 'rail')
      : 'hybrid'
  );

  return (
    <div
      className="fixed inset-0 z-[200000] flex items-end justify-center p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="intent-confirm-title"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <AmbientSurface
        mode="hybrid"
        mesh="card"
        className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden animate-fade-in pointer-events-auto sm:max-h-[88dvh] !rounded-xl"
      >
        <div
          className="shrink-0 border-b border-border/50 px-5 py-5 sm:px-6"
          style={{
            background: `linear-gradient(90deg, color-mix(in oklab, var(--hybrid) 14%, transparent), color-mix(in oklab, var(--comparator) 8%, transparent))`,
          }}
        >
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--hybrid)' }}>
            Confirm your shipment
          </p>
          <h2 id="intent-confirm-title" className="text-lg font-bold text-on-surface leading-snug">
            {headline}
          </h2>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5 sm:px-6">
          {lines.map(({ label, value }) => (
            <div
              key={label}
              className={`flex flex-col gap-0.5 py-2 border-b border-outline-variant/10 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4 ${
                label === 'Recommended tool' ? 'rounded-lg border border-border/40 bg-surface/40 px-3 -mx-1' : ''
              }`}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-outline shrink-0">
                {label}
              </span>
              <span
                className={`text-sm font-medium sm:text-right ${
                  label === 'Recommended tool' ? 'text-foreground' : 'text-on-surface'
                }`}
              >
                {value}
              </span>
            </div>
          ))}
          {!readyToRun && (
            <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2">
              Origin or destination was missing — open the tool below and complete the corridor.
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-outline-variant/15 bg-surface-container-low/40 px-5 py-4 sm:px-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={loading}
            onClick={onEdit}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold text-zinc-950 hover:brightness-110 disabled:opacity-50"
            style={{ background: accent }}
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden>
              arrow_forward
            </span>
            Open {modeLabel}
          </button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={loading || !readyToRun}
              onClick={onConfirmRun}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-outline-variant/25 px-4 py-3 text-sm font-semibold text-on-surface hover:border-outline-variant/40 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 border-2 border-on-surface/30 border-t-on-surface rounded-full animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]" aria-hidden>
                    play_arrow
                  </span>
                  Open &amp; run optimize
                </>
              )}
            </button>
            <Link
              href={modePath}
              onClick={onClose}
              className="flex flex-1 items-center justify-center rounded-xl px-4 py-3 text-center text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Preview {modeLabel} page
            </Link>
          </div>
        </div>
      </AmbientSurface>
    </div>
  );
}
