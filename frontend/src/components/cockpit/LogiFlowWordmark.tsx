import type { ReactNode } from 'react';
import type { LogisticsMode } from '@/lib/mode-meta';
import { LOGI_GRADIENT, LOGI_GRADIENT_HOME_CLASS } from '@/lib/pipeline-theme';

type LogiFlowWordmarkProps = {
  variant?: LogisticsMode | 'home';
  tagline?: ReactNode;
  className?: string;
};

const TITLE_CLASS =
  'font-headline text-4xl font-black leading-none tracking-tighter xs:text-5xl sm:text-6xl md:text-[72px]';

export function LogiFlowWordmark({ variant = 'home', tagline, className = '' }: LogiFlowWordmarkProps) {
  return (
    <h1 className={`${TITLE_CLASS} ${className}`.trim()}>
      {variant === 'home' ? (
        <span className={LOGI_GRADIENT_HOME_CLASS} style={{ backgroundSize: '200% auto' }}>
          LogiFlow
        </span>
      ) : (
        <>
          <span
            className={`${LOGI_GRADIENT[variant]} bg-clip-text text-transparent animate-gradient-shift`}
            style={{ backgroundSize: '200% auto' }}
          >
            Logi
          </span>
          <span className="text-foreground">Flow</span>
        </>
      )}
      {tagline ? (
        <span className="mt-3 block text-[0.26em] font-bold leading-snug tracking-tight text-muted-foreground sm:text-[0.24em]">
          {tagline}
        </span>
      ) : null}
    </h1>
  );
}
