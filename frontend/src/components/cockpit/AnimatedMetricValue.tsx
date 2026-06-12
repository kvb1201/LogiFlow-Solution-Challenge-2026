'use client';

import { useEffect, useRef, useState } from 'react';
import { formatAnimatedMetric, parseMetricValue } from '@/lib/metric-animate';

type AnimatedMetricValueProps = {
  value: string;
  className?: string;
  style?: React.CSSProperties;
};

export function AnimatedMetricValue({ value, className, style }: AnimatedMetricValueProps) {
  const parsed = parseMetricValue(value);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);
  const [display, setDisplay] = useState(() =>
    parsed.kind === 'literal' ? parsed.display : formatAnimatedMetric(0, parsed),
  );

  useEffect(() => {
    hasAnimated.current = false;
    const next = parseMetricValue(value);
    if (next.kind === 'literal') {
      setDisplay(next.display);
      return;
    }
    setDisplay(formatAnimatedMetric(0, next));

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || hasAnimated.current) return;
        hasAnimated.current = true;

        const duration = 1400;
        const target = next.target;
        let start: number | null = null;

        const tick = (ts: number) => {
          if (start === null) start = ts;
          const progress = Math.min((ts - start) / duration, 1);
          const eased = 1 - (1 - progress) ** 3;
          const current = Math.round(target * eased);
          setDisplay(formatAnimatedMetric(current, next));
          if (progress < 1) requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
      },
      { threshold: 0.15 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return (
    <span ref={ref} className={className} style={style}>
      {display}
    </span>
  );
}
