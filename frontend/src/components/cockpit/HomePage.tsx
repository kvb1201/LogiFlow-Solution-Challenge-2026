import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, BarChart3, Globe, Sparkles, Zap } from 'lucide-react';
import { modeMeta, modeOrder, type LogisticsMode } from '@/lib/mode-meta';
import { ModeIcon } from './ModeIcon';
import { AmbientBackdrop } from './AmbientBackdrop';
import { RailMlQuantifiers } from '@/components/rail/RailMlQuantifiers';

export function HomePage({ intentSection }: { intentSection: ReactNode }) {
  return (
    <div className="relative w-full overflow-hidden">
      <AmbientBackdrop variant="home" />

      <div className="relative z-10 pointer-events-auto mx-auto w-full max-w-5xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16">

        {/* ── Hero ── */}
        <section className="mb-14 animate-slide-up">
          {/* Eyebrow */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="badge border-border bg-surface/80 text-muted-foreground backdrop-blur-sm">
              <span className="live-dot" />
              Multimodal freight · India
            </span>
            <span className="badge border-hybrid/30 bg-hybrid/8 text-hybrid">
              <Sparkles className="h-2.5 w-2.5" />
              AI-ranked routes
            </span>
          </div>

          {/* Headline + subhead */}
          <div className="max-w-2xl">
            <h1 className="text-balance font-display text-4xl font-black leading-[1.02] tracking-tight text-gradient sm:text-5xl md:text-6xl">
              Ship smarter,<br />anywhere in India
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-[17px]">
              Compare rail, road, air, and water routes on cost, time, and risk — all in one place.
              Describe your shipment in plain English and we'll do the rest.
            </p>
          </div>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/hybrid"
              className="btn-app btn-app-primary inline-flex items-center gap-2 rounded-xl bg-foreground px-6 py-2.5 text-sm font-semibold text-background"
            >
              <Zap className="h-4 w-4 fill-current" />
              Plan a route
            </Link>
            <Link
              href="/comparator"
              className="inline-flex items-center gap-2 rounded-xl border border-border-strong bg-surface/60 px-5 py-2.5 text-sm font-semibold text-foreground backdrop-blur-sm transition-all duration-200 hover:bg-surface hover:border-border-strong"
            >
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Compare all modes
            </Link>
          </div>

          {/* Quick stats */}
          <div className="mt-8 flex flex-wrap gap-2">
            {[
              { icon: <Globe className="h-3 w-3" />, text: 'India-wide coverage' },
              { icon: <Zap className="h-3 w-3" />, text: 'Live train tracking' },
              { icon: <Sparkles className="h-3 w-3" />, text: 'Gemini AI parsing' },
            ].map((s) => (
              <span key={s.text} className="stat-chip">
                <span className="text-muted-foreground">{s.icon}</span>
                {s.text}
              </span>
            ))}
          </div>
        </section>

        {/* ── AI Intent Box ── */}
        <section
          className="mb-14 animate-fade-in"
          style={{ animationDelay: '0.12s', animationFillMode: 'backwards' }}
        >
          {intentSection}
        </section>

        {/* ── Mode cards ── */}
        <section
          className="mb-14 animate-fade-in"
          style={{ animationDelay: '0.2s', animationFillMode: 'backwards' }}
        >
          <div className="divider-label mb-6">Choose a transport mode</div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modeOrder.map((mode, i) => (
              <ModeCard key={mode} mode={mode} featured={mode === 'hybrid'} index={i} />
            ))}
          </ul>
        </section>

        {/* ── ML Stats ── */}
        <section
          className="animate-fade-in"
          style={{ animationDelay: '0.3s', animationFillMode: 'backwards' }}
        >
          <RailMlQuantifiers variant="compact" />
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
  const accent = meta.accent;

  return (
    <li
      className={`animate-fade-in ${featured ? 'sm:col-span-2 lg:col-span-1' : ''}`}
      style={{ animationDelay: `${0.28 + index * 0.06}s`, animationFillMode: 'backwards' }}
    >
      <Link
        href={meta.href}
        className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border bg-surface/50 p-4 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface/80"
        style={
          featured
            ? {
                boxShadow: `inset 0 1px 0 color-mix(in oklab, ${accent} 16%, transparent), 0 0 60px -40px ${accent}`,
              }
            : undefined
        }
      >
        {/* Mode colour strip */}
        <span
          className="absolute left-0 top-0 h-full w-0.5 rounded-r-full opacity-50 transition-opacity duration-300 group-hover:opacity-80"
          style={{ background: accent }}
        />

        {/* Icon */}
        <span
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background/60 transition-all duration-300 group-hover:scale-105"
          style={{ color: accent }}
        >
          <ModeIcon mode={mode} className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </span>

        {/* Label */}
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold leading-snug text-foreground">
            {meta.label}
          </span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
            {meta.tag}
          </span>
        </span>

        {/* Arrow */}
        <ArrowRight
          className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
          aria-hidden
        />
      </Link>
    </li>
  );
}
