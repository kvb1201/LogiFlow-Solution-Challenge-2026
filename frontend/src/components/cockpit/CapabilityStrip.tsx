import type { LogisticsMode } from '@/lib/mode-meta';
import { accentMix, accentVar } from '@/lib/pipeline-theme';

export type CapabilityBadge = { icon: string; label: string };

type CapabilityStripProps = {
  badges: readonly CapabilityBadge[];
  mode?: LogisticsMode;
  iconColor?: string;
  className?: string;
  delayBase?: number;
  delayStep?: number;
};

export function CapabilityStrip({
  badges,
  mode,
  iconColor,
  className = '',
  delayBase = 0.5,
  delayStep = 0.08,
}: CapabilityStripProps) {
  const color = iconColor ?? (mode ? accentVar(mode) : 'var(--primary)');

  if (!badges.length) return null;

  return (
    <div className={`flex flex-wrap justify-center gap-2 ${className}`}>
      {badges.map((badge, i) => (
        <div
          key={badge.label}
          className="group/chip relative flex items-center gap-2 overflow-hidden rounded-lg border border-border/35 bg-surface/20 px-3.5 py-2 text-xs text-muted-foreground backdrop-blur-md transition-all duration-300 animate-fade-in hover:border-border/55 hover:text-foreground"
          style={{
            animationDelay: `${delayBase + i * delayStep}s`,
            animationFillMode: 'backwards',
            boxShadow: mode
              ? `0 12px 32px -28px ${accentVar(mode)}`
              : undefined,
          }}
        >
          {mode ? (
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-4 -right-4 h-10 w-10 rounded-full opacity-0 blur-xl transition-opacity duration-300 group-hover/chip:opacity-40"
              style={{ background: accentVar(mode) }}
            />
          ) : null}
          <span
            className="material-symbols-outlined relative z-[1] shrink-0 transition-transform duration-300 group-hover/chip:scale-110"
            style={{
              fontSize: '14px',
              fontVariationSettings: "'FILL' 1",
              color,
              filter: mode ? `drop-shadow(0 0 6px ${accentMix(mode, 35, 'transparent')})` : undefined,
            }}
            aria-hidden
          >
            {badge.icon}
          </span>
          <span className="relative z-[1] whitespace-normal sm:whitespace-nowrap">{badge.label}</span>
        </div>
      ))}
    </div>
  );
}

/** @deprecated use CapabilityStrip */
export const CAPABILITY_STRIP_ITEM_CLASS =
  'flex items-center gap-2 rounded-lg border border-outline-variant/10 bg-surface-container/50 px-3.5 py-2 text-xs';
