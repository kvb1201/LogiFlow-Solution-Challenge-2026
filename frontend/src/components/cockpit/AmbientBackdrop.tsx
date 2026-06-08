import type { LogisticsMode } from '@/lib/mode-meta';

type AmbientVariant = 'home' | LogisticsMode | 'subtle';

/** Per-variant primary accent blob colour */
const primaryBlob: Record<string, string> = {
  home: 'var(--hybrid)',
  hybrid: 'var(--hybrid)',
  comparator: 'var(--comparator)',
  rail: 'var(--rail)',
  road: 'var(--road)',
  air: 'var(--air)',
  water: 'var(--water)',
  subtle: 'var(--rail)',
};

/** Per-variant secondary accent */
const secondaryBlob: Record<string, string> = {
  home: 'var(--rail)',
  hybrid: 'var(--air)',
  comparator: 'var(--rail)',
  rail: 'var(--water)',
  road: 'var(--warn)',
  air: 'var(--hybrid)',
  water: 'var(--air)',
  subtle: 'var(--water)',
};

export function AmbientBackdrop({
  variant = 'home',
  className = '',
}: {
  variant?: AmbientVariant;
  className?: string;
}) {
  const primary = primaryBlob[variant] ?? primaryBlob.home;
  const secondary = secondaryBlob[variant] ?? secondaryBlob.home;

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden [&_*]:pointer-events-none ${className}`}
      aria-hidden
    >
      {/* Primary blob — top-left */}
      <div
        className="absolute -left-[18%] -top-[28%] h-[min(90vw,700px)] w-[min(90vw,700px)] rounded-full opacity-[0.12] blur-[130px] animate-mesh-1"
        style={{ background: primary }}
      />
      {/* Secondary blob — bottom-right */}
      <div
        className="absolute -bottom-[22%] -right-[14%] h-[min(72vw,540px)] w-[min(72vw,540px)] rounded-full opacity-[0.09] blur-[110px] animate-mesh-2"
        style={{ background: secondary }}
      />
      {/* Tertiary blob — center */}
      <div
        className="absolute left-[40%] top-[30%] h-[min(55vw,380px)] w-[min(55vw,380px)] rounded-full opacity-[0.055] blur-[95px] animate-mesh-3"
        style={{ background: 'var(--water)' }}
      />

      {/* Dot grid — masked to top half */}
      <div
        className="absolute inset-0 hero-dot-grid opacity-[0.18]"
        style={{
          maskImage:
            'radial-gradient(ellipse 80% 65% at 50% 10%, black, transparent)',
        }}
      />

      {/* Top-edge radial glow */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 90% 52% at 50% -8%, color-mix(in oklab, ${primary} 12%, transparent), transparent 52%)`,
        }}
      />

      {/* Vignette — fade edges to background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 105% 105% at 50% 50%, transparent 40%, color-mix(in oklab, var(--background) 70%, transparent) 100%)',
        }}
      />
    </div>
  );
}
