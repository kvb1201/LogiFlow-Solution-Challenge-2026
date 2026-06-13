export type ParsedMetric =
  | { kind: 'literal'; display: string }
  | {
      kind: 'numeric';
      target: number;
      prefix: string;
      suffix: string;
      useCommas: boolean;
    };

function parseDigits(raw: string): number {
  return Number.parseInt(raw.replace(/,/g, ''), 10);
}

export function parseMetricValue(value: string): ParsedMetric {
  const trimmed = value.trim();
  if (!trimmed || /^[A-Za-z]+$/.test(trimmed)) {
    return { kind: 'literal', display: trimmed };
  }

  const lessThan = trimmed.match(/^<(\d[\d,]*)(.*)$/);
  if (lessThan) {
    return {
      kind: 'numeric',
      target: parseDigits(lessThan[1]),
      prefix: '<',
      suffix: lessThan[2] ?? '',
      useCommas: lessThan[1].includes(','),
    };
  }

  const compactK = trimmed.match(/^(\d[\d,]*)k\+$/i);
  if (compactK) {
    return {
      kind: 'numeric',
      target: parseDigits(compactK[1]),
      prefix: '',
      suffix: 'k+',
      useCommas: compactK[1].includes(','),
    };
  }

  const plus = trimmed.match(/^(\d[\d,]*)\+$/);
  if (plus) {
    return {
      kind: 'numeric',
      target: parseDigits(plus[1]),
      prefix: '',
      suffix: '+',
      useCommas: plus[1].includes(','),
    };
  }

  const percent = trimmed.match(/^(\d[\d,]*)%$/);
  if (percent) {
    return {
      kind: 'numeric',
      target: parseDigits(percent[1]),
      prefix: '',
      suffix: '%',
      useCommas: percent[1].includes(','),
    };
  }

  const suffix = trimmed.match(/^(\d[\d,]*)([a-z]+)$/i);
  if (suffix) {
    return {
      kind: 'numeric',
      target: parseDigits(suffix[1]),
      prefix: '',
      suffix: suffix[2],
      useCommas: suffix[1].includes(','),
    };
  }

  const plain = trimmed.match(/^(\d[\d,]*)$/);
  if (plain) {
    return {
      kind: 'numeric',
      target: parseDigits(plain[1]),
      prefix: '',
      suffix: '',
      useCommas: plain[1].includes(','),
    };
  }

  return { kind: 'literal', display: trimmed };
}

export function formatAnimatedMetric(current: number, parsed: ParsedMetric): string {
  if (parsed.kind === 'literal') return parsed.display;
  const body = parsed.useCommas ? current.toLocaleString('en-US') : String(current);
  return `${parsed.prefix}${body}${parsed.suffix}`;
}
