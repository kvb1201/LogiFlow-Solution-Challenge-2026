import type { LogisticsMode } from '@/lib/mode-meta';

type AmbientVariant = 'home' | LogisticsMode | 'subtle';

const accentBlob: Record<string, string> = {
  home: 'bg-hybrid',
  hybrid: 'bg-hybrid',
  rail: 'bg-rail',
  road: 'bg-road',
  air: 'bg-air',
  water: 'bg-water',
  subtle: 'bg-rail',
};

export function AmbientBackdrop({
  variant = 'home',
  className = '',
}: {
  variant?: AmbientVariant;
  className?: string;
}) {
  const accent = accentBlob[variant] ?? accentBlob.home;

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden [&_*]:pointer-events-none ${className}`}
      aria-hidden
    >
      <div
        className={`absolute -left-[15%] -top-[25%] h-[min(100vw,720px)] w-[min(100vw,720px)] rounded-full opacity-[0.14] blur-[120px] animate-mesh-1 ${accent}`}
      />
      <div className="absolute -bottom-[20%] -right-[12%] h-[min(80vw,560px)] w-[min(80vw,560px)] rounded-full bg-rail opacity-[0.1] blur-[100px] animate-mesh-2" />
      <div className="absolute left-[45%] top-[35%] h-[min(50vw,400px)] w-[min(50vw,400px)] rounded-full bg-water opacity-[0.07] blur-[90px] animate-mesh-3" />
      <div
        className="absolute inset-0 opacity-[0.2] hero-dot-grid"
        style={{ maskImage: 'radial-gradient(ellipse 75% 60% at 50% 20%, black, transparent)' }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 50% -10%, color-mix(in oklab, var(--rail) 10%, transparent), transparent 55%)',
        }}
      />
    </div>
  );
}
