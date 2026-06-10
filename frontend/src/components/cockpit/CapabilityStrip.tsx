import type { LogisticsMode } from '@/lib/mode-meta';
import { accentVar } from '@/lib/pipeline-theme';

export type CapabilityBadge = { icon: string; label: string };

const STRIP_ITEM_CLASS =
  'flex items-center gap-2 rounded-lg border border-outline-variant/10 bg-surface-container/50 px-3.5 py-2 text-xs text-on-surface-variant backdrop-blur-sm animate-fade-in';

type CapabilityStripProps = {
  badges: readonly CapabilityBadge[];
  /** Mode accent for icons — preferred */
  mode?: LogisticsMode;
  /** Override icon color (CSS value) */
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
          className={STRIP_ITEM_CLASS}
          style={{
            animationDelay: `${delayBase + i * delayStep}s`,
            animationFillMode: 'backwards',
          }}
        >
          <span
            className="material-symbols-outlined shrink-0"
            style={{
              fontSize: '14px',
              fontVariationSettings: "'FILL' 1",
              color,
            }}
            aria-hidden
          >
            {badge.icon}
          </span>
          <span className="whitespace-nowrap">{badge.label}</span>
        </div>
      ))}
    </div>
  );
}

/** @deprecated use CapabilityStrip — kept for grep / re-exports */
export const CAPABILITY_STRIP_ITEM_CLASS = STRIP_ITEM_CLASS;
