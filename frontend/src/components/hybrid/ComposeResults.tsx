'use client';

import type { ComposeResult } from '@/services/api';
import { ItineraryCard } from '@/components/hybrid/ItineraryCard';
import { ComposeContextBanner } from '@/components/hybrid/ComposeContextBanner';
import { formatHours, formatInr, modeLabel } from '@/lib/hybrid-ui';

export function ComposeResults({
  result,
  loadingMore = false,
  onEdit,
  onSave,
}: {
  result: ComposeResult;
  loadingMore?: boolean;
  onEdit: () => void;
  onSave?: () => void;
}) {
  const recommended = result.recommended;
  const alternatives = (result.alternatives || []).filter((a) => a.id !== recommended?.id);
  const baselines = result.baselines ? Object.entries(result.baselines) : [];

  if (!recommended && alternatives.length === 0) return null;

  return (
    <div className="space-y-5 animate-fade-in pb-8 w-full">
      <ComposeContextBanner result={result} />

      {recommended && (
        <section>
          <ItineraryCard itinerary={recommended} recommended variant="full" />
          {onSave && (
            <div className="flex justify-end mt-3">
              <button
                type="button"
                onClick={onSave}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ color: 'var(--hybrid)' }}
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden>
                  save
                </span>
                Save report
              </button>
            </div>
          )}
        </section>
      )}

      {baselines.length > 0 && (
        <section className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Baselines
          </span>
          {baselines.map(([mode, b]) => (
            <span
              key={mode}
              className="inline-flex items-center gap-2 rounded-lg border border-border/40 px-3 py-1.5 text-sm"
            >
              <span className="font-medium text-on-surface">{modeLabel(mode)}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {formatHours(b.time_hr)} · {formatInr(b.cost_inr)}
              </span>
            </span>
          ))}
        </section>
      )}

      {alternatives.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {alternatives.length} alternative{alternatives.length === 1 ? '' : 's'}
          </p>
          <div className="space-y-3">
            {alternatives.slice(0, 5).map((it) => (
              <ItineraryCard key={it.id} itinerary={it} variant="alt" />
            ))}
          </div>
        </section>
      )}

      {loadingMore && (
        <div
          className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/40 px-4 py-3 text-sm text-muted-foreground animate-pulse"
          role="status"
          aria-live="polite"
        >
          <span
            className="material-symbols-outlined text-[20px] animate-spin"
            style={{ color: 'var(--hybrid)' }}
            aria-hidden
          >
            progress_activity
          </span>
          Still searching hub chains and rail legs — new routes will appear below as they are found.
        </div>
      )}

      <button
        type="button"
        onClick={onEdit}
        className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Edit corridor
      </button>
    </div>
  );
}
