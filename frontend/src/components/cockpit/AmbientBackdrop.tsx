import type { LogisticsMode } from '@/lib/mode-meta';
import { AmbientMesh } from './AmbientMesh';

type AmbientVariant = 'home' | LogisticsMode | 'subtle';

export function AmbientBackdrop({
  variant = 'home',
  className = '',
}: {
  variant?: AmbientVariant;
  className?: string;
}) {
  const tone = variant === 'subtle' ? 'home' : variant;
  const meshVariant = variant === 'subtle' ? 'section' : 'hero';

  return (
    <AmbientMesh
      variant={meshVariant}
      tone={tone}
      className={className}
    />
  );
}
