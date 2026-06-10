'use client';

import type { ComposeResult } from '@/services/api';
import { extractColdCorridorNote, extractFeederUnavailableNotes, extractPartialNote } from '@/lib/compose-insights';

export function ComposeContextBanner({ result }: { result: ComposeResult }) {
  const partialNote = extractPartialNote(result);
  const coldNote = extractColdCorridorNote(result);
  const feederFailures = extractFeederUnavailableNotes(result.unavailable_templates);

  const showShort = Boolean(result.short_corridor && result.compose_note);
  const showFeeder = Boolean(result.feeder_corridor && result.compose_note && !result.short_corridor);
  const showRural = Boolean(
    result.rural_corridor && result.compose_note && !result.short_corridor && !result.feeder_corridor
  );

  if (!showShort && !showFeeder && !showRural && !partialNote && !coldNote && !feederFailures.length) {
    return null;
  }

  return (
    <div className="space-y-3">
      {showShort && (
        <div
          className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90 leading-relaxed"
          role="status"
        >
          <p className="font-medium text-amber-200/95 mb-1">Short corridor — direct routes only</p>
          <p>{result.compose_note}</p>
        </div>
      )}

      {showFeeder && (
        <div
          className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/90 leading-relaxed"
          role="status"
        >
          <p className="font-medium text-emerald-200/95 mb-1">Local hub connection included</p>
          <p>{result.compose_note}</p>
          {result.resolved_source?.feeder_access && (
            <p className="mt-2 text-xs text-emerald-200/75">
              Origin: {result.resolved_source.feeder_access.local_place} via{' '}
              {result.resolved_source.feeder_access.hub_city}
              {result.resolved_source.feeder_access.local_station
                ? ` (${result.resolved_source.feeder_access.local_station})`
                : ''}
            </p>
          )}
          {result.resolved_destination?.feeder_access && (
            <p className="mt-1 text-xs text-emerald-200/75">
              Destination: {result.resolved_destination.feeder_access.hub_city} hub →{' '}
              {result.resolved_destination.feeder_access.local_place}
            </p>
          )}
        </div>
      )}

      {showRural && (
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

      {feederFailures.length > 0 && (
        <div
          className="rounded-xl border border-orange-500/25 bg-orange-500/10 px-4 py-3 text-sm text-orange-100/90"
          role="status"
        >
          <p className="font-medium text-orange-200/95 mb-1">Local connection note</p>
          <ul className="list-disc list-inside text-xs space-y-1">
            {feederFailures.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {partialNote && (
        <div
          className="rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 py-2.5 text-xs text-violet-100/90"
          role="status"
        >
          {partialNote}
        </div>
      )}

      {coldNote && (
        <div
          className="rounded-xl border border-slate-400/20 bg-slate-500/10 px-4 py-2.5 text-xs text-slate-200/90"
          role="status"
        >
          {coldNote}
        </div>
      )}
    </div>
  );
}
