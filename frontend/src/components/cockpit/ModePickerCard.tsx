import Link from 'next/link';
import type { LogisticsMode } from '@/lib/mode-meta';
import { modeMeta } from '@/lib/mode-meta';
import { accentMix, accentVar } from '@/lib/pipeline-theme';
import { AmbientMesh } from './AmbientMesh';
import { ModeIcon } from './ModeIcon';

type ModePickerCardProps = {
  mode: LogisticsMode;
  index?: number;
};

export function ModePickerCard({ mode, index = 0 }: ModePickerCardProps) {
  const meta = modeMeta[mode];

  return (
    <li
      className="animate-fade-in"
      style={{ animationDelay: `${0.32 + index * 0.06}s`, animationFillMode: 'backwards' }}
    >
      <Link
        href={meta.href}
        className={`group relative flex items-center gap-4 overflow-hidden rounded-xl border border-border/40 bg-surface/15 p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-border/65 hover:bg-surface/25`}
        style={{
          boxShadow: `inset 0 1px 0 0 ${accentMix(mode, 14, 'transparent')}, 0 16px 48px -36px ${accentVar(mode)}`,
        }}
      >
        <AmbientMesh variant="card" tone={mode} />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-px opacity-50 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: `linear-gradient(90deg, transparent, ${meta.accent}, transparent)` }}
        />

        <span
          className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border/45 bg-background/50 backdrop-blur-sm transition-all duration-300 group-hover:scale-105"
          style={{
            color: meta.accent,
            boxShadow: `0 0 28px -6px ${accentVar(mode)}`,
          }}
        >
          <ModeIcon mode={mode} className="h-5 w-5" />
        </span>

        <span className="relative z-10 min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-foreground">{meta.label}</span>
          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{meta.tag}</span>
        </span>

        <span
          className="material-symbols-outlined relative z-10 shrink-0 text-base opacity-50 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
          style={{ color: meta.accent }}
          aria-hidden
        >
          arrow_outward
        </span>
      </Link>
    </li>
  );
}

type ModeShortcutCardProps = {
  mode: LogisticsMode;
  label?: string;
  href?: string;
};

/** Compact ambient tile — dashboard / quick-launch grids. */
export function ModeShortcutCard({ mode, label, href }: ModeShortcutCardProps) {
  const meta = modeMeta[mode];
  const displayLabel = label ?? meta.label;
  const link = href ?? meta.href;

  return (
    <Link
      href={link}
      className="group relative flex flex-col items-center overflow-hidden rounded-xl border border-border/40 bg-surface/15 p-4 text-center backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-border/65 hover:bg-surface/25"
      style={{
        boxShadow: `inset 0 1px 0 0 ${accentMix(mode, 12, 'transparent')}, 0 12px 36px -28px ${accentVar(mode)}`,
      }}
    >
      <AmbientMesh variant="card" tone={mode} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-px opacity-40 transition-opacity duration-300 group-hover:opacity-80"
        style={{ background: `linear-gradient(90deg, transparent, ${meta.accent}, transparent)` }}
      />
      <span
        className="relative z-10 mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-border/45 bg-background/50 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110"
        style={{
          color: meta.accent,
          boxShadow: `0 0 24px -8px ${accentVar(mode)}`,
        }}
      >
        <ModeIcon mode={mode} className="h-5 w-5" />
      </span>
      <span className="relative z-10 text-sm font-semibold text-foreground">{displayLabel}</span>
    </Link>
  );
}
