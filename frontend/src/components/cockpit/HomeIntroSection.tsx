import type { LogisticsMode } from '@/lib/mode-meta';
import { accentMix, accentVar } from '@/lib/pipeline-theme';
import { AmbientMesh } from './AmbientMesh';
import { WorkspacePanel } from './WorkspacePanel';

const LENSES = [
  {
    icon: 'payments',
    label: 'Cost',
    line: 'Rank routes by tariff, toll & fuel — not guesswork.',
    mode: 'comparator' as const,
  },
  {
    icon: 'schedule',
    label: 'Time',
    line: 'ETAs that factor traffic, delays & hand-offs.',
    mode: 'rail' as const,
  },
  {
    icon: 'shield',
    label: 'Risk',
    line: 'Weather, congestion & reliability in one score.',
    mode: 'road' as const,
  },
] as const;

const FLOW = ['Your brief', 'LogiFlow reads it', 'Best mode opens', 'You decide'] as const;

function FlowStepBadge({ index }: { index: number }) {
  return (
    <span
      className="mb-2 flex h-7 w-7 items-center justify-center rounded-full border bg-background text-[11px] font-bold font-headline"
      style={{
        borderColor: accentMix('hybrid', 35, 'var(--border)'),
        color: accentMix('hybrid', 90, 'white'),
      }}
    >
      {index + 1}
    </span>
  );
}

const MODE_SPECTRUM: { mode: LogisticsMode; label: string }[] = [
  { mode: 'rail', label: 'Rail' },
  { mode: 'road', label: 'Road' },
  { mode: 'air', label: 'Air' },
  { mode: 'water', label: 'Water' },
  { mode: 'hybrid', label: 'Hybrid' },
  { mode: 'comparator', label: 'Compare' },
];

const LF_BADGE = (
  <div
    aria-hidden
    className="flex h-11 w-11 items-center justify-center rounded-full border border-border/40"
    style={{
      background: `conic-gradient(from 210deg, ${accentVar('rail')}, ${accentVar('road')}, ${accentVar('air')}, ${accentVar('water')}, ${accentVar('hybrid')}, ${accentVar('comparator')}, ${accentVar('rail')})`,
      boxShadow: `0 0 32px -12px ${accentVar('hybrid')}`,
    }}
  >
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background/95 text-[9px] font-black uppercase tracking-wider text-foreground">
      LF
    </span>
  </div>
);

type HomeIntroSectionProps = {
  className?: string;
};

export function HomeIntroSection({ className = '' }: HomeIntroSectionProps) {
  return (
    <WorkspacePanel
      className={className}
      eyebrow="The LogiFlow way"
      title={
        <>
          Every corridor through <span className="text-gradient">three lenses</span>
        </>
      }
      icon={LF_BADGE}
      bodyClassName="gap-4"
    >
      <div className="grid flex-1 auto-rows-fr grid-cols-1 gap-2.5">
        {LENSES.map(({ icon, label, line, mode }) => (
          <div
            key={label}
            className="group relative flex h-full min-h-[4.5rem] overflow-hidden rounded-xl border border-border/35 bg-background/20 p-3 backdrop-blur-sm"
            style={{
              boxShadow: `inset 0 1px 0 0 ${accentMix(mode, 10, 'transparent')}`,
            }}
          >
            <AmbientMesh variant="card" tone={mode} />
            <div className="relative z-10 flex items-center gap-3">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/35 bg-surface/30"
                style={{ color: accentVar(mode) }}
              >
                <span
                  className="material-symbols-outlined text-[17px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {icon}
                </span>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{line}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="shrink-0 rounded-xl border border-border/30 bg-surface/10 px-2.5 py-3">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FLOW.map((step, i) => (
            <li key={step} className="flex flex-col items-center text-center">
              <FlowStepBadge index={i} />
              <span className="text-[10px] font-medium leading-tight text-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-auto shrink-0 space-y-2 border-t border-border/20 pt-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          One brief in. Six ways to move it.
        </p>
        <div className="flex flex-wrap gap-1.5" role="presentation" aria-hidden>
          {MODE_SPECTRUM.map(({ mode, label }) => (
            <span
              key={mode}
              className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]"
              style={{
                color: accentMix(mode, 88, 'white'),
                background: accentMix(mode, 10, 'transparent'),
                border: `1px solid ${accentMix(mode, 20, 'transparent')}`,
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </WorkspacePanel>
  );
}
