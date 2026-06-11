'use client';

import { PipelineModeChrome } from '@/components/cockpit/PipelineModeChrome';

type ComparatorResultsChromeProps = {
  source: string;
  destination: string;
  cargoWeight?: number;
  onEdit: () => void;
};

export function ComparatorResultsChrome(props: ComparatorResultsChromeProps) {
  return <PipelineModeChrome mode="comparator" {...props} />;
}
