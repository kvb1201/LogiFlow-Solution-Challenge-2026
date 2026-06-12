import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import type { LogisticsMode } from '@/lib/mode-meta';
import { modeMeta } from '@/lib/mode-meta';
import { accentMix } from '@/lib/pipeline-theme';
import { AmbientSurface } from './AmbientSurface';
import { ModeIcon } from './ModeIcon';

const FEATURE_GUIDES: {
  mode: LogisticsMode;
  description: string;
}[] = [
  {
    mode: 'rail',
    description:
      'Optimize parcel-friendly trains, compare cheapest / fastest / safest, and inspect delays and live position on the map.',
  },
  {
    mode: 'road',
    description:
      'Run road optimization with traffic awareness, toll and vehicle preferences, and side-by-side route comparison.',
  },
  {
    mode: 'air',
    description:
      'Find express air cargo lanes, compare OTP risk and cut-off times, and balance speed against cost.',
  },
  {
    mode: 'water',
    description:
      'Plan port-to-port maritime corridors with disruption signals, ETA estimates, and transshipment awareness.',
  },
  {
    mode: 'hybrid',
    description:
      'Chain rail, road, air, and water legs through hub cities — ideal when no single mode covers the full corridor.',
  },
  {
    mode: 'comparator',
    description:
      'Run all four single modes in parallel on one corridor and see which wins on cost, time, and risk.',
  },
];

export function HomeIntroSection() {
  return (
    <div className="space-y-4">
      <AmbientSurface mode="home" mesh="section" className="p-5 sm:p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-rail">About us</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
          LogiFlow is built for operators who juggle tight budgets, deadlines, and uncertain networks.
          We combine optimization engines with live feeds — like RailRadar for railways — so you see
          not just a route, but cost, time, risk, and what is happening on the ground right now.
        </p>
      </AmbientSurface>

      <AmbientSurface mode="home" mesh="section" className="p-5 sm:p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-road">What you can do</p>
        <ul className="mt-4 space-y-4">
          {FEATURE_GUIDES.map(({ mode, description }) => {
            const meta = modeMeta[mode];
            return (
              <li key={mode} className="flex gap-3">
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-background/40"
                  style={{ color: meta.accent }}
                >
                  <ModeIcon mode={mode} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={meta.href}
                    className="group inline-flex items-center gap-1.5 text-sm font-semibold text-foreground transition-colors hover:opacity-90"
                  >
                    {meta.label}
                    <CheckCircle2
                      className="h-3.5 w-3.5 opacity-70 transition-opacity group-hover:opacity-100"
                      style={{ color: meta.accent }}
                    />
                  </Link>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <p
          className="mt-5 rounded-lg border border-border/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground"
          style={{ background: accentMix('hybrid', 6, 'transparent') }}
        >
          <span className="font-semibold text-foreground">How to start:</span> type a shipment brief
          below, confirm origin and destination, then open the recommended mode — or pick a tool from
          the list at the bottom of this page.
        </p>
      </AmbientSurface>
    </div>
  );
}
