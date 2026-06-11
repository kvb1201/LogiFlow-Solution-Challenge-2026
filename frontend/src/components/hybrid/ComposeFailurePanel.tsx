'use client';

import type { ComposeResult } from '@/services/api';
import { ComposeContextBanner } from '@/components/hybrid/ComposeContextBanner';

export function ComposeFailurePanel({
  result,
  message,
  onEdit,
}: {
  result: ComposeResult;
  message: string;
  onEdit: () => void;
}) {
  return (
    <div className="mt-6 space-y-4 animate-fade-in">
      <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        <div className="flex gap-2 items-start">
          <span className="material-symbols-outlined text-base shrink-0">error</span>
          <div className="space-y-2">
            <p>{message}</p>
            {result.feeder_corridor && (
              <p className="text-xs text-red-100/80">
                We detected a local station near a major hub — try naming the nearest city (e.g. Prayagraj)
                if the local leg could not be scheduled.
              </p>
            )}
            {result.rural_corridor && !result.feeder_corridor && (
              <p className="text-xs text-red-100/80">
                For villages, include the nearest town or district in your brief (e.g. &quot;from Rampur
                Bekal near Bareilly to Delhi&quot;).
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="mt-3 text-xs font-semibold text-red-100 underline"
        >
          Edit corridor and try again
        </button>
      </div>
      <ComposeContextBanner result={result} />
    </div>
  );
}
