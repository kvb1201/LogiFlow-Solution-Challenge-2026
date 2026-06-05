'use client';

import React from 'react';
import type { ParsedIntent } from '@/services/api';
import { buildIntentSummary } from '@/lib/formatIntentSummary';

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
      className="fixed inset-0 z-[200000] flex items-center justify-center p-4 sm:p-6"
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
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-violet-400/30 bg-[#0c1018] shadow-[0_32px_120px_-24px_rgba(0,0,0,0.9)] animate-fade-in overflow-hidden pointer-events-auto">
        <div className="px-5 sm:px-6 py-5 border-b border-outline-variant/15 bg-gradient-to-r from-violet-500/10 to-primary/5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300 mb-1">
            Confirm your shipment
          </p>
          <h2 id="intent-confirm-title" className="text-lg font-bold text-on-surface leading-snug">
            {headline}
          </h2>
          <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
            Choose one: if this summary looks right, we open final results directly. Otherwise, we take you to the suggested tool to edit details.
          </p>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-3 max-h-[50vh] overflow-y-auto">
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
            Not correct — open suggested tool
          </button>
          <button
            type="button"
            disabled={loading || !readyToRun}
            onClick={onConfirmRun}
            className="flex-1 px-4 py-3 rounded-xl bg-primary text-[#001b3f] text-sm font-semibold hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 border-2 border-[#001b3f]/30 border-t-[#001b3f] rounded-full animate-spin" />
                Running…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]" aria-hidden>
                  check_circle
                </span>
                Yes, this is right — show final results
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
