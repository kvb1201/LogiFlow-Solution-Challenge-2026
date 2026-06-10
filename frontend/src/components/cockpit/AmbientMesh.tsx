import type { LogisticsMode } from '@/lib/mode-meta';
import { accentVar } from '@/lib/pipeline-theme';

export type AmbientMeshVariant = 'hero' | 'section' | 'card';
export type AmbientMeshTone = 'home' | LogisticsMode;

const SECONDARY_BLOB: Partial<Record<AmbientMeshTone, string>> = {
  home: 'var(--comparator)',
  hybrid: 'var(--comparator)',
  comparator: 'var(--hybrid)',
  rail: 'var(--rail-shine)',
  road: 'var(--primary)',
  air: 'var(--primary)',
  water: 'var(--teal-400, var(--primary))',
};

type AmbientMeshProps = {
  variant?: AmbientMeshVariant;
  tone?: AmbientMeshTone;
  className?: string;
};

/** Layered mesh blobs + dot grid — use behind heroes, sections, and cards. */
export function AmbientMesh({ variant = 'hero', tone = 'home', className = '' }: AmbientMeshProps) {
  const primary = tone === 'home' ? 'var(--hybrid)' : accentVar(tone);
  const secondary = SECONDARY_BLOB[tone] ?? 'var(--primary)';

  if (variant === 'card') {
    return (
      <div
        className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}
        aria-hidden
      >
        <div
          className="absolute -bottom-[35%] -right-[25%] h-[85%] w-[85%] rounded-full opacity-[0.22] blur-[42px] transition-opacity duration-500 group-hover:opacity-[0.42]"
          style={{ background: primary }}
        />
        <div
          className="absolute -left-[20%] -top-[30%] h-[55%] w-[55%] rounded-full opacity-[0.08] blur-[36px] transition-opacity duration-500 group-hover:opacity-[0.16]"
          style={{ background: secondary }}
        />
        <div
          className="absolute inset-0 opacity-[0.12] hero-dot-grid"
          style={{ maskImage: 'radial-gradient(ellipse 90% 80% at 70% 80%, black, transparent)' }}
        />
      </div>
    );
  }

  if (variant === 'section') {
    return (
      <div
        className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}
        aria-hidden
      >
        <div
          className="absolute -left-[10%] top-[-40%] h-[min(80vw,420px)] w-[min(80vw,420px)] rounded-full opacity-[0.1] blur-[100px] animate-mesh-1"
          style={{ background: primary }}
        />
        <div
          className="absolute -bottom-[30%] -right-[8%] h-[min(60vw,320px)] w-[min(60vw,320px)] rounded-full opacity-[0.07] blur-[90px] animate-mesh-2"
          style={{ background: secondary }}
        />
        <div className="absolute inset-0 hero-dot-grid opacity-[0.16]" />
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in oklab, ${primary} 10%, transparent), transparent 65%)`,
          }}
        />
      </div>
    );
  }

  // hero — full landing page atmosphere
  if (tone === 'home') {
    return (
      <div
        className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}
        aria-hidden
      >
        <div
          className="absolute h-[min(100vw,780px)] w-[min(100vw,780px)] rounded-full opacity-[0.11] blur-[130px] animate-mesh-1 -top-[28%] -left-[18%]"
          style={{ background: 'var(--hybrid)' }}
        />
        <div
          className="absolute h-[min(90vw,620px)] w-[min(90vw,620px)] rounded-full opacity-[0.09] blur-[120px] animate-mesh-2 bottom-[-12%] -right-[14%]"
          style={{ background: 'var(--comparator)' }}
        />
        <div
          className="absolute h-[min(70vw,480px)] w-[min(70vw,480px)] rounded-full opacity-[0.07] blur-[100px] animate-mesh-3 top-[42%] left-[52%]"
          style={{ background: 'var(--rail)' }}
        />
        <div
          className="absolute h-[min(55vw,360px)] w-[min(55vw,360px)] rounded-full opacity-[0.06] blur-[90px] animate-mesh-4 top-[18%] right-[8%]"
          style={{ background: 'var(--road)' }}
        />
        <div
          className="absolute h-[min(45vw,280px)] w-[min(45vw,280px)] rounded-full opacity-[0.05] blur-[80px] animate-mesh-3 bottom-[25%] left-[5%]"
          style={{ background: 'var(--water)' }}
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
    );
  }

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}
      aria-hidden
    >
      <div
        className="absolute h-[min(100vw,780px)] w-[min(100vw,780px)] rounded-full opacity-[0.15] blur-[130px] animate-mesh-1 -top-[24%] -left-[14%]"
        style={{ background: primary }}
      />
      <div
        className="absolute h-[min(80vw,580px)] w-[min(80vw,580px)] rounded-full opacity-[0.10] blur-[120px] animate-mesh-2 bottom-[-14%] -right-[12%]"
        style={{ background: secondary }}
      />
      <div
        className="absolute h-[min(52vw,360px)] w-[min(52vw,360px)] rounded-full opacity-[0.07] blur-[95px] animate-mesh-3 top-[28%] right-[4%]"
        style={{ background: primary }}
      />
      <div className="absolute inset-0 hero-dot-grid opacity-[0.22]" />
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 90% 70% at 50% -8%, color-mix(in oklab, ${primary} 16%, transparent), transparent 58%)`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 120% 80% at 50% 110%, color-mix(in oklab, var(--background) 88%, transparent), transparent 70%)',
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-px opacity-65"
        style={{
          background: `linear-gradient(90deg, transparent, ${primary}, transparent)`,
        }}
      />
    </div>
  );
}
