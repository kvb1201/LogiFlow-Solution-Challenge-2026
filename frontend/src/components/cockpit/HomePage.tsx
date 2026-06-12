import Link from 'next/link';
import type { ReactNode } from 'react';
import { Play, Sparkles, Zap } from 'lucide-react';
import { CapabilityStrip } from './CapabilityStrip';
import { HomeIntroSection } from './HomeIntroSection';
import { AmbientMesh } from './AmbientMesh';
import { AmbientMetricTile } from './AmbientSurface';
import { ModePickerCard } from './ModePickerCard';
import { modeOrder } from '@/lib/mode-meta';
import { accentMix, accentVar } from '@/lib/pipeline-theme';

const HERO_METRICS = [
  { value: '6', label: 'Transport modes' },
  { value: '56', label: 'Interchange hubs' },
  { value: 'AI', label: 'Intent parser' },
  { value: 'Live', label: 'Rail & road data' },
] as const;

const CAPABILITY_CHIPS = [
  { icon: 'psychology', label: 'Plain-English briefs' },
  { icon: 'hub', label: 'Multimodal chains' },
  { icon: 'compare_arrows', label: '4-mode comparator' },
  { icon: 'monitoring', label: 'Risk & cost scoring' },
] as const;

export function HomePage({ intentSection }: { intentSection: ReactNode }) {
  return (
    <div className="relative w-full overflow-x-clip" style={{ background: 'var(--background)' }}>
      <AmbientMesh variant="hero" tone="home" />

      <div className="relative z-10 mx-auto w-full max-w-[860px] px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
        <section className="mb-14 text-center animate-slide-up">
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

          <h1 className="mb-5 font-headline text-3xl font-black leading-[1.05] tracking-tight text-foreground xs:text-4xl sm:text-5xl md:text-[3.25rem] text-balance">
            LogiFlow moves cargo smarter
          </h1>

          <p className="mx-auto max-w-xl text-sm sm:text-[15px] leading-relaxed text-muted-foreground text-balance">
            One platform to plan and compare{' '}
            <span className="font-medium text-foreground/90">rail, road, water, air, and hybrid</span>{' '}
            options with real data where it matters — schedules, traffic, risk, and live visibility —
            so teams ship with confidence across India.
          </p>

          <div
            className="mt-8 flex flex-wrap justify-center gap-6 sm:gap-8 animate-fade-in"
            style={{ animationDelay: '0.2s', animationFillMode: 'backwards' }}
          >
            {HERO_METRICS.map((m, i) => (
              <div
                key={m.label}
                className="animate-fade-in"
                style={{ animationDelay: `${0.22 + i * 0.05}s`, animationFillMode: 'backwards' }}
              >
                <AmbientMetricTile
                  className="min-w-[5.5rem] text-center"
                  mode={(['hybrid', 'comparator', 'rail', 'road'] as const)[i % 4]}
                >
                  <div className="text-xl sm:text-2xl font-black bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-transparent">
                    {m.value}
                  </div>
                  <div className="mt-0.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {m.label}
                  </div>
                </AmbientMetricTile>
              </div>
            ))}
          </div>

          <div
            className="mt-9 flex flex-wrap justify-center gap-3 animate-fade-in"
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
            className="mt-10 animate-fade-in"
            delayBase={0.55}
            delayStep={0.07}
          />
        </section>

        <section
          className="relative mb-10 animate-fade-in"
          style={{ animationDelay: '0.16s', animationFillMode: 'backwards' }}
        >
          <HomeIntroSection />
        </section>

        <section
          className="relative mb-14 animate-fade-in"
          style={{ animationDelay: '0.22s', animationFillMode: 'backwards' }}
        >
          {intentSection}
        </section>

        <section
          className="relative animate-fade-in"
          style={{ animationDelay: '0.28s', animationFillMode: 'backwards' }}
        >
          <div className="relative overflow-hidden rounded-2xl border border-border/30 bg-surface/10 p-4 sm:p-5 backdrop-blur-sm">
            <AmbientMesh variant="section" tone="home" className="rounded-2xl" />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-px opacity-50"
              style={{
                background:
                  'linear-gradient(90deg, transparent, var(--hybrid), var(--comparator), var(--rail), transparent)',
              }}
            />

            <div className="relative z-10 mb-5 flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">
                  Choose a mode
                </h2>
                <p className="mt-1 text-sm text-muted-foreground/80">
                  Each pipeline tuned for a distinct freight corridor type
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
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
