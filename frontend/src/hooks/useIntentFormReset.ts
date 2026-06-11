'use client';

import type { ParsedIntent } from '@/services/api';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';

/** Reset local wizard / results when AiBriefPanel applies a new intent on a mode page. */
export function useIntentFormReset(
  onReset: (parsed: ParsedIntent, action: 'fill' | 'run') => void
) {
  return (parsed: ParsedIntent, action: 'fill' | 'run') => {
    useLogiFlowStore.getState().resetResults();
    onReset(parsed, action);
  };
}
