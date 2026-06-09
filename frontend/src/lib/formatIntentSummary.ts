import type { ParsedIntent } from '@/services/api';

const MODE_LABELS: Record<string, string> = {
  rail: 'Indian Railways',
  road: 'Road freight',
  air: 'Air cargo',
  water: 'Water / ports',
  hybrid: 'Hybrid multimodal composer',
  comparator: 'All modes compared (comparator)',
};

export type IntentSummaryLine = { label: string; value: string };

export function buildIntentSummary(parsed: ParsedIntent): {
  lines: IntentSummaryLine[];
  modeLabel: string;
  readyToRun: boolean;
  headline: string;
} {
  const origin = parsed.source?.trim() || '—';
  const dest = parsed.destination?.trim() || '—';
  const weight =
    parsed.cargo_weight_kg != null ? `${Math.round(parsed.cargo_weight_kg)} kg` : 'Not specified';
  const cargo = parsed.cargo_type?.trim() || 'General cargo';
  const budget =
    parsed.budget_max_inr != null
      ? `₹${new Intl.NumberFormat('en-IN').format(Math.round(parsed.budget_max_inr))}`
      : 'Not specified';
  const deadline =
    parsed.deadline_hours != null ? `Within ${parsed.deadline_hours} hours` : 'Not specified';
  const priority = parsed.priority
    ? parsed.priority.charAt(0).toUpperCase() + parsed.priority.slice(1)
    : 'Balanced';

  const mode = (parsed.suggested_mode || 'comparator').toLowerCase();
  const modeLabel = MODE_LABELS[mode] || 'Multimodal compare';

  const readyToRun = Boolean(parsed.source?.trim() && parsed.destination?.trim());

  const headline = readyToRun
    ? `Moving cargo from ${origin} to ${dest}`
    : 'We need a clearer origin and destination before we can run optimization';

  const lines: IntentSummaryLine[] = [
    { label: 'From', value: origin },
    { label: 'To', value: dest },
    { label: 'Weight', value: weight },
    { label: 'Cargo type', value: cargo },
    { label: 'Budget cap', value: budget },
    { label: 'Deadline', value: deadline },
    { label: 'Priority', value: priority },
    { label: 'Recommended tool', value: modeLabel },
  ];

  if (parsed.scenario_summary?.trim()) {
    lines.push({ label: 'Summary', value: parsed.scenario_summary.trim() });
  }

  return { lines, modeLabel, readyToRun, headline };
}
