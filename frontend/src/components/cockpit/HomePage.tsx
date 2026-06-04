import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRight, Play, Sparkles } from 'lucide-react';
import { modeMeta, modeOrder, type LogisticsMode } from '@/lib/mode-meta';
import { ModeIcon } from './ModeIcon';
import { AmbientBackdrop } from './AmbientBackdrop';

export function HomePage({ intentSection }: { intentSection: ReactNode }) {
  return (
    <div className="relative w-full overflow-hidden">
      <AmbientBackdrop variant="home" />

      <div className="relative z-10 mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <section className="mb-10 animate-slide-up">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
              <span className="live-dot" />
              Multimodal freight · India
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-hybrid/35 bg-hybrid/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-hybrid">
              <Sparkles className="h-3 w-3" />
              AI-ranked
            </span>
          </div>

          <h1 className="text-balance font-display text-4xl font-black leading-[1.05] text-gradient sm:text-5xl">
            LogiFlow
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
            Compare road, rail, air, and water on cost, time, and risk. Describe your shipment in
            plain English — we parse constraints and route you to the right tool.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/hybrid"
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-[0_0_40px_-12px_var(--hybrid)] transition-all duration-300 hover:brightness-110 hover:shadow-[0_0_52px_-8px_var(--hybrid)]"
            >
              <Play className="h-4 w-4 fill-current" />
              Compare all modes
            </Link>
            <Link
              href="/railway"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/70 px-5 py-2.5 text-sm font-semibold text-foreground backdrop-blur-sm transition-all duration-300 hover:border-border-strong hover:bg-surface-2"
            >
              Railway search
            </Link>
          </div>
        </section>

        <section className="mb-12 animate-fade-in" style={{ animationDelay: '0.15s', animationFillMode: 'backwards' }}>
          {intentSection}
        </section>

        <section
          className="animate-fade-in"
          style={{ animationDelay: '0.28s', animationFillMode: 'backwards' }}
        >
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Choose a mode
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {modeOrder.map((mode, i) => (
              <ModeCard key={mode} mode={mode} featured={mode === 'hybrid'} index={i} />
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
      className={`animate-fade-in ${featured ? 'sm:col-span-2' : ''}`}
      style={{ animationDelay: `${0.35 + index * 0.07}s`, animationFillMode: 'backwards' }}
    >
      <Link
        href={meta.href}
        className="group flex items-center gap-4 rounded-2xl border border-border bg-surface/60 p-4 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-border-strong hover:bg-surface/90"
        style={{
          boxShadow: featured
            ? `inset 0 1px 0 0 color-mix(in oklab, ${meta.accent} 22%, transparent), 0 24px 70px -48px ${meta.accent}`
            : undefined,
        }}
      >
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-background/50 transition-transform duration-300 group-hover:scale-105"
          style={{ color: meta.accent }}
        >
          <ModeIcon mode={mode} className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-foreground">{meta.label}</span>
          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{meta.tag}</span>
        </span>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          style={{ color: meta.accent }}
          aria-hidden
        />
      </Link>
    </li>
  );
}
