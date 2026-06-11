'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !parsed || !mounted) return null;

  const { lines, modeLabel, readyToRun, headline } = buildIntentSummary(parsed);
  const mode = resolveMode(parsed);
  const accent = accentVar(
    (['rail', 'road', 'air', 'water', 'hybrid', 'comparator'] as const).includes(
      mode as 'rail'
    )
      ? (mode as 'rail')
      : 'hybrid'
  );

  const modal = (
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
        innerClassName="flex min-h-0 flex-1 flex-col"
        className="relative z-10 flex h-[min(92dvh,34rem)] w-full max-w-lg flex-col overflow-hidden !rounded-xl sm:h-auto sm:max-h-[min(88dvh,36rem)] pointer-events-auto"
      >
        <div
          className="shrink-0 border-b border-border/50 px-5 py-4 sm:px-6"
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

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
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

        <div className="shrink-0 border-t border-outline-variant/20 bg-surface-container-low/90 px-5 py-4 sm:px-6 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_-20px_rgba(0,0,0,0.5)]">
          <button
            type="button"
            disabled={loading}
            onClick={onEdit}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-4 text-base font-bold text-zinc-950 hover:brightness-110 disabled:opacity-50"
            style={{ background: accent }}
          >
            <span className="material-symbols-outlined text-[22px]" aria-hidden>
              arrow_forward
            </span>
            Continue to {modeLabel}
          </button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={loading || !readyToRun}
              onClick={onConfirmRun}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-outline-variant/30 bg-surface/50 px-4 py-3 text-sm font-semibold text-on-surface hover:border-outline-variant/50 disabled:opacity-50"
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
                  Continue &amp; run optimize
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex flex-1 items-center justify-center rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-surface/40 hover:text-foreground"
            >
              Stay on home
            </button>
          </div>
        </div>
      </AmbientSurface>
    </div>
  );

  return createPortal(modal, document.body);
}
