'use client';

import type { ComposeResult } from '@/services/api';
import { ItineraryCard } from '@/components/hybrid/ItineraryCard';
import { ComposeContextBanner } from '@/components/hybrid/ComposeContextBanner';
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

  if (!recommended && alternatives.length === 0) return null;

  return (
    <div className="space-y-10 animate-fade-in pb-12">
      <ComposeContextBanner result={result} />

      {recommended && (
        <section>
          <ItineraryCard itinerary={recommended} recommended variant="full" />
          {onSave && (
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={onSave}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/10 px-5 py-2.5 text-sm font-semibold text-violet-100 hover:bg-violet-500/20 transition-colors"
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
        <section>
          <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-3">
            Direct mode baselines
          </h3>
          <div className="flex flex-wrap gap-2">
            {baselines.map(([mode, b]) => (
              <div
                key={mode}
                className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs"
              >
                <span className="font-semibold text-on-surface">{modeLabel(mode)}</span>
                <span className="font-mono text-muted-foreground">
                  {formatHours(b.time_hr)} · {formatInr(b.cost_inr)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {alternatives.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-on-surface mb-1">Other options</h3>
          <p className="text-xs text-muted-foreground mb-4">
            {alternatives.length} alternative{alternatives.length === 1 ? '' : 's'} ranked lower for
            your priority
          </p>
          <div className="space-y-3">
            {alternatives.slice(0, 5).map((it) => (
              <ItineraryCard key={it.id} itinerary={it} variant="alt" />
            ))}
          </div>
        </section>
      )}

      <div className="pt-2 border-t border-white/[0.06]">
        <button
          type="button"
          onClick={onEdit}
          className="text-sm font-medium text-violet-300 hover:text-violet-200 transition-colors"
        >
          ← Edit corridor and re-run
        </button>
      </div>
    </div>
  );
}
