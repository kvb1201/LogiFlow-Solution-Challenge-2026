import type { LucideIcon } from 'lucide-react';
import { GitMerge, Network, Plane, Ship, TrainFront, Truck } from 'lucide-react';
import type { LogisticsMode } from '@/lib/mode-meta';

const icons: Record<LogisticsMode, LucideIcon> = {
  hybrid: GitMerge,
  comparator: Network,
  rail: TrainFront,
  road: Truck,
  air: Plane,
  water: Ship,
};

export function ModeIcon({
  mode,
  className,
  strokeWidth = 2,
}: {
  mode: LogisticsMode;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = icons[mode];
  return <Icon className={className} strokeWidth={strokeWidth} />;
}
