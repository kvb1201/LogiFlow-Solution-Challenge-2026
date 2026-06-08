import type { RankedOption } from '@/services/api';

function normalizeTrainNumber(raw: string | undefined): string {
  const s = (raw || '').trim().toUpperCase();
  if (!s) return '';
  if (/^\d+$/.test(s)) {
    const norm = s.replace(/^0+/, '');
    return norm || '0';
  }
  return s;
}

/** One ranked row per train — hub API loops (HWH/KOAA/SRC) can return the same service thrice. */
export function dedupeRailOptions(options: RankedOption[]): RankedOption[] {
  const seen = new Set<string>();
  const out: RankedOption[] = [];

  for (const opt of options) {
    const key = normalizeTrainNumber(opt.train_number);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(opt);
  }

  return out.map((opt, i) => ({ ...opt, rank: i + 1 }));
}
