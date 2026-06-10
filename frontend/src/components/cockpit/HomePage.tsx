import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRight, Play, Sparkles, Zap } from 'lucide-react';
import { CapabilityStrip } from './CapabilityStrip';
import { modeMeta, modeOrder, type LogisticsMode } from '@/lib/mode-meta';
import { accentMix, accentVar } from '@/lib/pipeline-theme';
import { ModeIcon } from './ModeIcon';

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
    <div className="relative w-full overflow-x-clip">
      {/* ── Ambient hero backdrop ── */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div
          className="absolute w-[min(100vw,780px)] h-[min(100vw,780px)] rounded-full opacity-[0.11] blur-[130px] animate-mesh-1 -top-[28%] -left-[18%]"
          style={{ background: 'var(--hybrid)' }}
        />
        <div
          className="absolute w-[min(90vw,620px)] h-[min(90vw,620px)] rounded-full opacity-[0.09] blur-[120px] animate-mesh-2 bottom-[-12%] -right-[14%]"
          style={{ background: 'var(--comparator)' }}
        />
        <div
          className="absolute w-[min(70vw,480px)] h-[min(70vw,480px)] rounded-full opacity-[0.07] blur-[100px] animate-mesh-3 top-[42%] left-[52%]"
          style={{ background: 'var(--rail)' }}
        />
        <div
          className="absolute w-[min(55vw,360px)] h-[min(55vw,360px)] rounded-full opacity-[0.06] blur-[90px] animate-mesh-4 top-[18%] right-[8%]"
          style={{ background: 'var(--road)' }}
        />
        <div className="absolute inset-0 hero-dot-grid opacity-[0.22]" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 90% 70% at 50% -8%, color-mix(in oklab, var(--hybrid) 12%, transparent), transparent 58%)',
          }}
        />
        <div
          className="absolute inset-x-0 top-0 h-px opacity-80"
          style={{
            background:
              'linear-gradient(90deg, transparent, var(--hybrid), var(--comparator), var(--rail), var(--road), transparent)',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[860px] px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
        {/* ── Hero ── */}
        <section className="mb-14 text-center animate-slide-up">
          <div className="mb-8 flex flex-wrap items-center justify-center gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground backdrop-blur-md">
              <span className="live-dot" />
              Multimodal freight · India
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

          <h1 className="font-headline text-[2.75rem] xs:text-5xl sm:text-6xl md:text-[4.5rem] font-black tracking-tighter leading-[0.95] mb-5">
            <span
              className="bg-gradient-to-r from-violet-400 via-sky-300 via-50% to-teal-300 bg-clip-text text-transparent animate-gradient-shift"
              style={{ backgroundSize: '200% auto' }}
            >
              Logi
            </span>
            <span className="text-foreground">Flow</span>
          </h1>

          <p className="mx-auto max-w-lg text-sm sm:text-[15px] leading-relaxed text-muted-foreground text-balance">
            Compare road, rail, air, and water on cost, time, and risk. Describe your shipment in
            plain English — we parse constraints and route you to the right tool.
          </p>

          <div
            className="mt-8 flex flex-wrap justify-center gap-6 sm:gap-8 animate-fade-in"
            style={{ animationDelay: '0.2s', animationFillMode: 'backwards' }}
          >
            {HERO_METRICS.map((m) => (
              <div key={m.label} className="text-center min-w-[4.5rem]">
                <div
                  className="text-xl sm:text-2xl font-black bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-transparent"
                >
                  {m.value}
                </div>
                <div className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-0.5">
                  {m.label}
                </div>
              </div>
            ))}
          </div>

          <div
            className="mt-9 flex flex-wrap justify-center gap-3 animate-fade-in"
            style={{ animationDelay: '0.35s', animationFillMode: 'backwards' }}
          >
            <Link
              href="/hybrid"
              className="group inline-flex items-center gap-2 rounded-xl bg-foreground px-6 py-3 text-sm font-semibold text-background transition-all duration-300 hover:brightness-110 hover:scale-[1.02]"
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
            <Link
              href="/railway"
              className="inline-flex items-center gap-2 rounded-xl border border-border/55 bg-surface/30 px-6 py-3 text-sm font-semibold text-foreground backdrop-blur-sm transition-all duration-300 hover:border-border-strong hover:bg-surface/50 hover:scale-[1.02]"
            >
              Railway search
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

        {/* ── AI intent ── */}
        <section
          className="mb-14 animate-fade-in"
          style={{ animationDelay: '0.18s', animationFillMode: 'backwards' }}
        >
          {intentSection}
        </section>

        {/* ── Mode picker ── */}
        <section
          className="animate-fade-in"
          style={{ animationDelay: '0.28s', animationFillMode: 'backwards' }}
        >
          <div className="mb-6 flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
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

          <ul className="grid gap-3 sm:grid-cols-2">
            {modeOrder.map((mode, i) => (
              <ModeCard key={mode} mode={mode} featured={mode === 'hybrid' || mode === 'comparator'} index={i} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function ModeCard({
  mode,
  featured,
  index,
}: {
  mode: LogisticsMode;
  featured?: boolean;
  index: number;
}) {
  const meta = modeMeta[mode];

  return (
    <li
      className={`animate-fade-in ${featured ? 'sm:col-span-1' : ''}`}
      style={{ animationDelay: `${0.32 + index * 0.06}s`, animationFillMode: 'backwards' }}
    >
      <Link
        href={meta.href}
        className="group relative flex items-center gap-4 overflow-hidden rounded-xl border border-border/45 bg-surface/20 p-4 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-border/70 hover:bg-surface/30"
        style={{
          boxShadow: featured
            ? `inset 0 1px 0 0 ${accentMix(mode, 18, 'transparent')}, 0 20px 50px -40px ${accentVar(mode)}`
            : undefined,
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: `linear-gradient(90deg, transparent, ${meta.accent}, transparent)` }}
        />
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/40 transition-all duration-300 group-hover:scale-105"
          style={{
            color: meta.accent,
            boxShadow: `0 0 24px -8px ${accentVar(mode)}`,
          }}
        >
          <ModeIcon mode={mode} className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-foreground">{meta.label}</span>
          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{meta.tag}</span>
        </span>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 opacity-60 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
          style={{ color: meta.accent }}
          aria-hidden
        />
      </Link>
    </li>
  );
}
