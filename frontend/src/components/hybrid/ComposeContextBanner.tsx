'use client';

import type { ComposeResult } from '@/services/api';
import { extractColdCorridorNote, extractFeederUnavailableNotes, extractPartialNote } from '@/lib/compose-insights';

/** Single compact status strip — no stacked colored boxes. */
export function ComposeContextBanner({ result }: { result: ComposeResult }) {
  const partialNote = extractPartialNote(result);
  const coldNote = extractColdCorridorNote(result);
  const feederFailures = extractFeederUnavailableNotes(result.unavailable_templates);

  const showShort = Boolean(result.short_corridor && result.compose_note);
  const showFeeder = Boolean(result.feeder_corridor && result.compose_note && !result.short_corridor);
  const showRural = Boolean(
    result.rural_corridor && result.compose_note && !result.short_corridor && !result.feeder_corridor
  );

  const lines: { label: string; detail?: string }[] = [];

  if (showShort) {
    lines.push({ label: 'Short corridor', detail: result.compose_note ?? undefined });
  } else if (showFeeder) {
    lines.push({ label: 'Hub feeder', detail: result.compose_note ?? undefined });
  } else if (showRural) {
    const hubPairs =
      result.hub_pairs_considered && result.hub_pairs_considered.length > 0
        ? `Hub pairs: ${result.hub_pairs_considered
            .slice(0, 3)
            .map((p) => `${p.origin_hub.city}↔${p.dest_hub.city}`)
            .join(' · ')}`
        : undefined;
    lines.push({ label: 'Rural / remote', detail: [result.compose_note, hubPairs].filter(Boolean).join(' — ') });
  }

  if (feederFailures.length) {
    lines.push({ label: 'Feeder note', detail: feederFailures.join(' ') });
  }
  if (partialNote) lines.push({ label: 'Note', detail: partialNote });
  if (coldNote) lines.push({ label: 'Note', detail: coldNote });

  if (!lines.length) return null;

  return (
    <div
      className="rounded-md border border-border/40 bg-surface/25 px-4 py-2.5 text-sm leading-relaxed text-muted-foreground"
      role="status"
    >
      {lines.map((line, i) => (
        <p key={i} className={i > 0 ? 'mt-1 pt-1 border-t border-border/30' : ''}>
          <span className="font-semibold text-on-surface/80">{line.label}</span>
          {line.detail ? ` — ${line.detail}` : null}
        </p>
      ))}
    </div>
  );
}
