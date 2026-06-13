import Link from 'next/link';
import type { ReactNode } from 'react';
import { Play, Sparkles, Zap } from 'lucide-react';
import { CapabilityStrip } from './CapabilityStrip';
import { HeroMetricsGrid } from './HeroMetricsGrid';
import { HomeIntroSection } from './HomeIntroSection';
import { LogiFlowWordmark } from './LogiFlowWordmark';
import { AmbientMesh } from './AmbientMesh';
import { ModePickerCard } from './ModePickerCard';
import { modeOrder } from '@/lib/mode-meta';
import { HOME_HERO_METRICS } from '@/lib/home-metrics';
import { accentMix, accentVar } from '@/lib/pipeline-theme';

const CAPABILITY_CHIPS = [
  { icon: 'psychology', label: 'Plain-English briefs' },
  { icon: 'hub', label: 'Multimodal chains' },
  { icon: 'compare_arrows', label: '4-mode comparator' },
  { icon: 'monitoring', label: 'Risk & cost scoring' },
] as const;

export function HomePage({ intentSection }: { intentSection: ReactNode }) {
  return (
    <div className="home-main-inset relative w-full overflow-x-clip" style={{ background: 'var(--background)' }}>
      <AmbientMesh variant="hero" tone="home" />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
        <section className="mx-auto mb-10 max-w-[860px] text-center animate-slide-up">
          <div className="mb-8 flex flex-wrap items-center justify-center gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground backdrop-blur-md">
              <span className="live-dot" />
              Multimodal logistics · India
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] backdrop-blur-md"
              style={{
                color: accentMix('hybrid', 88, 'white'),
                borderColor: accentMix('hybrid', 30, 'transparent'),
                background: accentMix('hybrid', 10, 'transparent'),
              }}
            >
              <Sparkles className="h-3 w-3" />
              AI-ranked
            </span>
          </div>

          <LogiFlowWordmark variant="home" tagline="moves cargo smarter" className="mb-4 text-balance" />

          <p className="mx-auto max-w-lg text-sm sm:text-[15px] leading-relaxed text-muted-foreground text-balance">
            Plan, compare, and rank{' '}
            <span className="font-medium text-foreground/90">every major freight mode</span> on cost,
            time, and risk — built for corridors across India.
          </p>

          <div
            className="mt-6 animate-fade-in"
            style={{ animationDelay: '0.2s', animationFillMode: 'backwards' }}
          >
            <HeroMetricsGrid metrics={HOME_HERO_METRICS} mode="home" />
          </div>

          <div
            id="home-hero-cta"
            className="mt-8 flex flex-wrap justify-center gap-3 animate-fade-in scroll-mt-24"
            style={{ animationDelay: '0.35s', animationFillMode: 'backwards' }}
          >
            <Link
              href="/hybrid"
              className="group inline-flex items-center gap-2 rounded-xl bg-foreground px-6 py-3 text-sm font-semibold text-background transition-all duration-300 hover:scale-[1.02] hover:brightness-110"
              style={{ boxShadow: `0 0 48px -10px ${accentVar('hybrid')}` }}
            >
              <Play className="h-4 w-4 fill-current transition-transform group-hover:scale-110" />
              Plan multimodal route
            </Link>
            <Link
              href="/comparator"
              className="group inline-flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold backdrop-blur-sm transition-all duration-300 hover:scale-[1.02]"
              style={{
                borderColor: accentMix('comparator', 35, 'var(--border)'),
                background: accentMix('comparator', 8, 'transparent'),
                color: accentMix('comparator', 92, 'white'),
                boxShadow: `0 0 32px -14px ${accentVar('comparator')}`,
              }}
            >
              <Zap className="h-4 w-4" />
              Compare all modes
            </Link>
          </div>

          <CapabilityStrip
            badges={CAPABILITY_CHIPS}
            mode="hybrid"
            className="mt-8 animate-fade-in"
            delayBase={0.55}
            delayStep={0.07}
          />
        </section>

        <section
          id="home-workspace"
          className="relative mb-10 grid animate-fade-in scroll-mt-24 gap-4 lg:grid-cols-2 lg:items-stretch lg:gap-5"
          style={{ animationDelay: '0.16s', animationFillMode: 'backwards' }}
        >
          <div id="home-logiflow-way" className="flex min-h-0 flex-col">
            <HomeIntroSection className="flex-1" />
          </div>
          <div id="home-ai-brief" className="flex min-h-0 flex-col">
            {intentSection}
          </div>
        </section>

        <section
          id="home-mode-picker"
          className="relative mx-auto max-w-[860px] animate-fade-in scroll-mt-24"
          style={{ animationDelay: '0.28s', animationFillMode: 'backwards' }}
        >
          <div className="relative overflow-hidden rounded-2xl border border-border/30 bg-surface/10 p-4 sm:p-5 backdrop-blur-sm">
            <AmbientMesh variant="section" tone="home" className="rounded-2xl" />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-px opacity-50"
              style={{
                background: `linear-gradient(90deg, transparent, ${accentVar('hybrid')}, ${accentVar('comparator')}, ${accentVar('rail')}, ${accentVar('road')}, ${accentVar('air')}, ${accentVar('water')}, transparent)`,
              }}
            />

            <div className="relative z-10 mb-5 flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                <h2 className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                  Choose a mode
                </h2>
                <p className="mt-1 font-headline text-base font-bold text-foreground sm:text-lg">
                  Each pipeline tuned for a distinct corridor
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                6 specialized tools
              </span>
            </div>

            <ul className="relative z-10 grid gap-3 sm:grid-cols-2">
              {modeOrder.map((mode, i) => (
                <ModePickerCard key={mode} mode={mode} index={i} />
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
