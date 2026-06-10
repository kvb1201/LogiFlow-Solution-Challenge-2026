'use client';

import React from 'react';
import type { ParsedIntent } from '@/services/api';
import { buildIntentSummary } from '@/lib/formatIntentSummary';
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

export default function IntentConfirmModal({
  open,
  parsed,
  loading = false,
  onConfirmRun,
  onEdit,
  onClose,
}: IntentConfirmModalProps) {
  if (!open || !parsed) return null;

  const { lines, readyToRun, headline } = buildIntentSummary(parsed);

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
      <AmbientSurface mode="hybrid" mesh="card" className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden animate-fade-in pointer-events-auto sm:max-h-[88dvh] !rounded-xl">
        <div
          className="border-b border-border/50 px-5 py-5 sm:px-6"
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
          <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
            Choose one: if this summary looks right, we open final results directly. Otherwise, we take you to the suggested tool to edit details.
          </p>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-3 flex-1 min-h-0 overflow-y-auto max-h-[45dvh] sm:max-h-[50vh]">
          {lines.map(({ label, value }) => (
            <div
              key={label}
              className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-0.5 sm:gap-4 py-2 border-b border-outline-variant/10 last:border-0"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-outline shrink-0">
                {label}
              </span>
              <span className="text-sm text-on-surface sm:text-right font-medium">{value}</span>
            </div>
          ))}
          {!readyToRun && (
            <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2">
              Origin or destination was missing — use &quot;Edit details&quot; to fill the form manually.
            </p>
          )}
        </div>

        <div className="px-5 sm:px-6 py-4 flex flex-col-reverse sm:flex-row gap-2 border-t border-outline-variant/15 bg-surface-container-low/40">
          <button
            type="button"
            disabled={loading}
            onClick={onEdit}
            className="flex-1 px-4 py-3 rounded-xl border border-outline-variant/25 text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:border-outline-variant/40 disabled:opacity-50"
          >
            <span className="sm:hidden">Edit in suggested tool</span>
            <span className="hidden sm:inline">Not correct — open suggested tool</span>
          </button>
          <button
            type="button"
            disabled={loading || !readyToRun}
            onClick={onConfirmRun}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2 touch-target text-zinc-950"
            style={{ background: accentVar('hybrid') }}
          >
            {loading ? (
              <>
                <span className="h-4 w-4 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin" />
                Running…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]" aria-hidden>
                  check_circle
                </span>
                <span className="sm:hidden">Show final results</span>
                <span className="hidden sm:inline">Yes, this is right — show final results</span>
              </>
            )}
          </button>
        </div>
      </AmbientSurface>
    </div>
  );
}
