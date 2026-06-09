'use client';

import type { ComposeResult } from '@/services/api';
import { ItineraryCard } from '@/components/hybrid/ItineraryCard';
import { formatHours, formatInr, modeLabel } from '@/lib/hybrid-ui';

export function ComposeResults({
  result,
  onEdit,
  onSave,
}: {
  result: ComposeResult;
  onEdit: () => void;
  onSave?: () => void;
}) {
  const recommended = result.recommended;
  const alternatives = (result.alternatives || []).filter((a) => a.id !== recommended?.id);
  const baselines = result.baselines ? Object.entries(result.baselines) : [];

  if (!recommended) return null;

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {result.short_corridor && result.compose_note && (
        <div
          className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90 leading-relaxed"
          role="status"
        >
          <p className="font-medium text-amber-200/95 mb-1">Short corridor — direct routes only</p>
          <p>{result.compose_note}</p>
        </div>
      )}

      {result.rural_corridor && result.compose_note && !result.short_corridor && (
        <div
          className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100/90 leading-relaxed"
          role="status"
        >
          <p className="font-medium text-sky-200/95 mb-1">Village / remote place — hub-connected routes</p>
          <p>{result.compose_note}</p>
          {result.hub_pairs_considered && result.hub_pairs_considered.length > 0 && (
            <p className="mt-2 text-xs text-sky-200/75">
              Hub pairs:{' '}
              {result.hub_pairs_considered
                .slice(0, 4)
                .map((p) => `${p.origin_hub.city} ↔ ${p.dest_hub.city}`)
                .join(' · ')}
            </p>
          )}
        </div>
      )}

      <ItineraryCard itinerary={recommended} recommended variant="full" />

      {onSave && (
        <div className="flex justify-end mt-2">
          <button
            onClick={onSave}
            className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 border border-violet-400/30 px-4 py-2 text-sm font-semibold text-violet-300 hover:bg-violet-500/20 transition-all"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>save</span>
            Save Report
          </button>
        </div>
      )}

      {baselines.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground self-center mr-1">Direct options:</span>
          {baselines.map(([mode, b]) => (
            <span
              key={mode}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/40 px-3 py-1 text-xs"
            >
              <span className="font-medium text-on-surface-variant">{modeLabel(mode)}</span>
              <span className="font-mono text-muted-foreground">
                {formatHours(b.time_hr)} · {formatInr(b.cost_inr)}
              </span>
            </span>
          ))}
        </div>
      )}

      {alternatives.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-on-surface-variant mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-violet-300/80">alt_route</span>
            Other routes we considered
            <span className="text-xs font-normal text-muted-foreground">({alternatives.length})</span>
          </h3>
          <div className="space-y-3">
            {alternatives.slice(0, 5).map((it) => (
              <ItineraryCard key={it.id} itinerary={it} variant="alt" />
            ))}
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={onEdit}
        className="text-sm font-medium text-violet-300/90 hover:text-violet-200 transition-colors"
      >
        ← Change corridor or re-run
      </button>
    </div>
  );
}
