import type { ComposeResult } from '@/services/api';

/** Extract road-unavailable reason from compose unavailable_templates keys. */
export function extractRoadUnavailableReason(
  unavailable?: Record<string, string> | null
): string | null {
  if (!unavailable) return null;
  if (unavailable.road) return unavailable.road;
  if (unavailable.direct_road) return unavailable.direct_road;
  for (const [key, reason] of Object.entries(unavailable)) {
    if (key.startsWith('rural:road:') || key.includes(':road:')) return reason;
  }
  return null;
}

export function extractFeederUnavailableNotes(
  unavailable?: Record<string, string> | null
): string[] {
  if (!unavailable) return [];
  return Object.entries(unavailable)
    .filter(([key]) => key.startsWith('feeder:'))
    .map(([, reason]) => reason);
}

export function extractPartialNote(result: ComposeResult): string | null {
  const u = result.unavailable_templates;
  if (!u) return null;
  if (u._budget) return 'Time budget reached — showing the best routes found so far. Retry for more options.';
  if (u._leg_cap) return 'Partial results — not every mode was evaluated. Retry in a few seconds for a fuller set.';
  return result.partial ? 'Partial results — retry shortly for additional route options.' : null;
}

export function extractColdCorridorNote(result: ComposeResult): string | null {
  if (!result.cold_corridor) return null;
  return 'First-time corridor — legs are cached after this run, so a quick retry usually returns faster, richer results.';
}

/** Compose failed but backend returned useful corridor context. */
export function isComposeFailureWithContext(data: ComposeResult): boolean {
  return Boolean(
    data.error &&
    !data.recommended &&
    (data.compose_note ||
      data.feeder_corridor ||
      data.rural_corridor ||
      data.hub_pairs_considered?.length ||
      Object.keys(data.unavailable_templates || {}).length)
  );
}
