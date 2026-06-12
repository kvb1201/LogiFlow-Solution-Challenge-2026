import type { ReactNode } from 'react';
import { ArrowDown, ArrowRight } from 'lucide-react';
import type { HomeTutorialVisual } from '@/lib/home-tutorial-steps';
import { accentVar } from '@/lib/pipeline-theme';
import { ModeIcon } from '@/components/cockpit/ModeIcon';

function MockArrow({ className }: { className?: string }) {
  return (
    <ArrowRight
      className={`h-5 w-5 shrink-0 text-foreground/50 ${className ?? ''}`}
      strokeWidth={2.5}
      aria-hidden
    />
  );
}

function MockArrowDown({ className }: { className?: string }) {
  return (
    <ArrowDown
      className={`h-5 w-5 shrink-0 text-foreground/50 ${className ?? ''}`}
      strokeWidth={2.5}
      aria-hidden
    />
  );
}

function MockBlock({
  className = '',
  accent,
  children,
}: {
  className?: string;
  accent?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border border-border/50 bg-surface/30 px-3 py-2 text-[10px] text-muted-foreground ${className}`}
      style={
        accent
          ? { boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent} 25%, transparent)` }
          : undefined
      }
    >
      {children}
    </div>
  );
}

export function HomeTutorialStepVisual({ visual }: { visual: HomeTutorialVisual }) {
  switch (visual) {
    case 'welcome':
      return (
        <div className="flex flex-col items-center gap-3 py-2">
          <p
            className="font-headline text-2xl font-black text-gradient"
            style={{
              backgroundImage: `linear-gradient(90deg, ${accentVar('hybrid')}, ${accentVar('comparator')})`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            LogiFlow
          </p>
          <MockArrowDown className="animate-bounce" />
          <div className="flex flex-wrap justify-center gap-2">
            {(['rail', 'road', 'air', 'water', 'hybrid', 'comparator'] as const).map((mode) => (
              <span
                key={mode}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/40 bg-background/50"
                style={{ color: accentVar(mode) }}
              >
                <ModeIcon mode={mode} className="h-4 w-4" />
              </span>
            ))}
          </div>
          <p className="text-center text-[11px] text-muted-foreground">One home · six freight tools</p>
        </div>
      );

    case 'hero-cta':
      return (
        <div className="flex flex-col items-center gap-3 py-1">
          <MockBlock className="w-full max-w-[14rem] text-center font-semibold text-foreground">
            LogiFlow hero
          </MockBlock>
          <MockArrowDown />
          <div className="flex flex-wrap justify-center gap-2">
            <MockBlock accent={accentVar('hybrid')} className="font-semibold text-foreground">
              ▶ Plan multimodal
            </MockBlock>
            <MockBlock accent={accentVar('comparator')} className="font-semibold text-foreground">
              ⚡ Compare all modes
            </MockBlock>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-hybrid">
            <MockArrow className="h-4 w-4 rotate-[-30deg]" />
            <span>Fastest path when you know the goal</span>
          </div>
        </div>
      );

    case 'ai-brief':
      return (
        <div className="mx-auto flex w-full max-w-[16rem] flex-col gap-2 py-1">
          <MockBlock className="relative border-dashed font-medium text-foreground">
            <span className="absolute -left-1 -top-2 rounded bg-hybrid/20 px-1 text-[9px] font-bold uppercase text-hybrid">
              You type
            </span>
            Mumbai → Delhi, 12t machinery, balanced…
          </MockBlock>
          <div className="flex justify-center">
            <MockArrowDown className="text-hybrid" />
          </div>
          <MockBlock accent={accentVar('hybrid')} className="text-foreground">
            <span className="font-semibold">LogiFlow parses</span>
            <br />
            Origin · Destination · Mode hint
          </MockBlock>
          <div className="flex justify-center">
            <MockArrowDown />
          </div>
          <MockBlock className="font-semibold text-foreground">Confirm → open tool</MockBlock>
        </div>
      );

    case 'three-lenses':
      return (
        <div className="grid grid-cols-3 gap-2 py-1">
          {[
            { label: 'Cost', icon: 'payments', mode: 'comparator' as const },
            { label: 'Time', icon: 'schedule', mode: 'rail' as const },
            { label: 'Risk', icon: 'shield', mode: 'road' as const },
          ].map(({ label, icon, mode }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 text-center">
              <MockBlock accent={accentVar(mode)} className="w-full">
                <span
                  className="material-symbols-outlined mb-1 block text-base"
                  style={{ fontVariationSettings: "'FILL' 1", color: accentVar(mode) }}
                >
                  {icon}
                </span>
                <span className="font-semibold text-foreground">{label}</span>
              </MockBlock>
            </div>
          ))}
          <div className="col-span-3 mt-1 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
            <MockArrow className="h-3 w-3 rotate-180" />
            <span>All three scores on every ranked route</span>
            <MockArrow className="h-3 w-3" />
          </div>
        </div>
      );

    case 'mode-picker':
      return (
        <div className="grid grid-cols-2 gap-2 py-1">
          {(['rail', 'road', 'air', 'water'] as const).map((mode) => (
            <MockBlock key={mode} accent={accentVar(mode)} className="flex items-center gap-2">
              <span style={{ color: accentVar(mode) }}>
                <ModeIcon mode={mode} className="h-4 w-4 shrink-0" />
              </span>
              <span className="font-medium capitalize text-foreground">{mode}</span>
              <MockArrow className="ml-auto h-3 w-3 opacity-60" />
            </MockBlock>
          ))}
          <div className="col-span-2 flex justify-center gap-2">
            <MockBlock accent={accentVar('hybrid')}>Hybrid</MockBlock>
            <MockBlock accent={accentVar('comparator')}>Compare</MockBlock>
          </div>
        </div>
      );

    case 'results':
      return (
        <div className="flex flex-col gap-2 py-1">
          <div className="flex items-center gap-2">
            <MockBlock className="flex-1 font-semibold text-foreground">#1 Cheapest</MockBlock>
            <MockArrow />
            <MockBlock className="flex-1 font-semibold text-foreground">#2 Fastest</MockBlock>
          </div>
          <MockBlock className="h-14 border-dashed text-center leading-[3.25rem]">🗺 Route map</MockBlock>
          <div className="flex items-center justify-between gap-2">
            <MockBlock className="flex-1">AI explanation</MockBlock>
            <MockArrow />
            <MockBlock accent={accentVar('hybrid')} className="font-semibold text-foreground">
              Save report
            </MockBlock>
          </div>
        </div>
      );

    default:
      return null;
  }
}
