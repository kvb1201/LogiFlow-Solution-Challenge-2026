'use client';

import { PipelineModeChrome } from '@/components/cockpit/PipelineModeChrome';

type HybridResultsChromeProps = {
  source: string;
  destination: string;
  cargoWeight?: number;
  onEdit: () => void;
};

export function HybridResultsChrome(props: HybridResultsChromeProps) {
  return <PipelineModeChrome mode="hybrid" {...props} />;
}
