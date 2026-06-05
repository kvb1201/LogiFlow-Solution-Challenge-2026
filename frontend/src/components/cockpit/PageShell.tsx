import type { ReactNode } from 'react';
import type { LogisticsMode } from '@/lib/mode-meta';
import { modeMeta } from '@/lib/mode-meta';
import { ModeIcon } from './ModeIcon';
import { AmbientBackdrop } from './AmbientBackdrop';

export function PageShell({
  mode,
  title,
  description,
  actions,
  children,
  contentClassName = 'max-w-4xl',
}: {
  mode?: LogisticsMode;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}) {
  const accent = mode ? modeMeta[mode].accent : 'var(--rail)';

  return (
    <div className="relative w-full overflow-hidden">
      {mode ? <AmbientBackdrop variant={mode} className="opacity-50" /> : null}

      <div className={`relative z-10 pointer-events-auto mx-auto w-full px-4 py-8 sm:px-6 sm:py-10 ${contentClassName}`}>
        <header
          className="panel-hard mb-8 animate-slide-up overflow-hidden rounded-2xl p-5 sm:p-6"
          style={{ boxShadow: `inset 0 1px 0 0 color-mix(in oklab, ${accent} 20%, transparent)` }}
        >
          <div
            aria-hidden
            className="pointer-events-none mb-4 h-px w-full"
            style={{
              background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
            }}
          />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              {mode && (
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background/50"
                    style={{ color: accent }}
                  >
                    <ModeIcon mode={mode} className="h-4 w-4" />
                  </span>
                  <span
                    className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em]"
                    style={{
                      color: accent,
                      borderColor: `color-mix(in oklab, ${accent} 34%, transparent)`,
                      background: `color-mix(in oklab, ${accent} 9%, transparent)`,
                    }}
                  >
                    {modeMeta[mode].label}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                    <span className="live-dot" />
                    live
                  </span>
                </div>
              )}
              <h1 className="text-balance font-display text-2xl font-black leading-tight text-gradient sm:text-[1.85rem]">
                {title}
              </h1>
              {description ? (
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
              ) : null}
            </div>
            {actions ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
            ) : null}
          </div>
        </header>

        <div className="animate-fade-in" style={{ animationDelay: '0.12s', animationFillMode: 'backwards' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
