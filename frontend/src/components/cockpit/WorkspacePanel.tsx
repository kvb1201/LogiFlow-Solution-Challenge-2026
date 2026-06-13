import type { ReactNode } from 'react';
import type { LogisticsMode } from '@/lib/mode-meta';
import { AmbientSurface } from './AmbientSurface';

type WorkspacePanelProps = {
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  mode?: LogisticsMode | 'home';
};

/** Matched shell for side-by-side home workspace columns. */
export function WorkspacePanel({
  eyebrow,
  title,
  subtitle,
  icon,
  children,
  className = '',
  bodyClassName = '',
  mode = 'home',
}: WorkspacePanelProps) {
  return (
    <AmbientSurface
      mode={mode}
      mesh="section"
      innerClassName="flex h-full min-h-0 flex-col"
      className={`h-full min-h-[28rem] overflow-hidden rounded-2xl p-5 sm:min-h-[30rem] ${className}`}
    >
      <header className="mb-4 flex shrink-0 items-start justify-between gap-3 border-b border-border/25 pb-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="mt-1 font-headline text-base font-bold leading-snug tracking-tight text-foreground sm:text-lg">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {icon ? <div className="shrink-0">{icon}</div> : null}
      </header>
      <div className={`flex min-h-0 flex-1 flex-col ${bodyClassName}`.trim()}>{children}</div>
    </AmbientSurface>
  );
}
