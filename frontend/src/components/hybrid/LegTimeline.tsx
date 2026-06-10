'use client';

import { useState } from 'react';
import type { ComposedItinerary, ComposedLeg, ComposedTransfer } from '@/services/api';
import {
  formatInr,
  formatHours,
  legDetailLine,
  legStationAlightLine,
  legStationBoardLine,
  modeLabel,
  modeMeta,
  transferSeverityMeta,
} from '@/lib/hybrid-ui';

function TransferBlock({ transfer }: { transfer: ComposedTransfer }) {
  const meta = transferSeverityMeta(transfer.severity);
  const place = transfer.at_display || transfer.at;
  const tips = transfer.warnings?.length
    ? transfer.warnings
    : [`Allow ${formatHours(transfer.buffer_hr)} to transfer cargo at ${place}`];

  return (
    <div className={`rounded-xl border ${meta.chip} px-4 py-3.5 ml-8 sm:ml-10`}>
      <div className="flex items-start gap-2.5">
        <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5 opacity-90" aria-hidden>
          {meta.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-on-surface">
            {meta.label} · <span className="text-amber-100/95">{place}</span>
          </p>
          <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
            Wait ~{formatHours(transfer.buffer_hr)}
            {transfer.scheduled_gap_hr != null &&
              ` · trains ${formatHours(transfer.scheduled_gap_hr)} apart`}
            {transfer.handling_fee_inr
              ? ` · handling ~${formatInr(transfer.handling_fee_inr)}`
              : ''}
          </p>
          <ul className="mt-2.5 space-y-1.5 border-t border-white/[0.06] pt-2.5">
            {tips.map((tip, i) => (
              <li key={i} className="text-xs leading-relaxed text-on-surface-variant/90">
                {tip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function LegBlock({
  leg,
  step,
  total,
  rich,
}: {
  leg: ComposedLeg;
  step: number;
  total: number;
  rich: boolean;
}) {
  const [showStops, setShowStops] = useState(false);
  const m = modeMeta(leg.mode);
  const trainInfo = legDetailLine(leg);
  const board = legStationBoardLine(leg);
  const alight = legStationAlightLine(leg);
  const hasStops = (leg.segments?.length ?? 0) > 1;

  return (
    <div className="relative flex gap-3 sm:gap-4">
      {/* Timeline rail */}
      <div className="flex flex-col items-center shrink-0 w-8 sm:w-10">
        <div
          className={`flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border-2 font-bold text-xs ${m.chip}`}
        >
          {step}
        </div>
        {step < total && (
          <div className="flex-1 w-px min-h-[1rem] bg-gradient-to-b from-border/80 to-border/30 mt-1" />
        )}
      </div>

      <div className="flex-1 min-w-0 pb-1">
        <div
          className={
            rich
              ? 'rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3.5'
              : 'rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2.5'
          }
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${m.chip}`}
                >
                  <span className="material-symbols-outlined text-[14px]" aria-hidden>
                    {m.icon}
                  </span>
                  {modeLabel(leg.mode)}
                </span>
                <span className="text-sm font-semibold text-on-surface">
                  {leg.source}
                  <span className="text-muted-foreground font-normal mx-1.5">→</span>
                  {leg.destination}
                </span>
              </div>
              {trainInfo && (
                <p className="text-xs text-on-surface-variant mt-2 font-medium">{trainInfo}</p>
              )}
              {board && <p className="text-xs text-muted-foreground mt-1.5">{board}</p>}
              {alight && board !== alight && (
                <p className="text-xs text-muted-foreground mt-0.5">{alight}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold font-mono">{formatHours(leg.time_hr)}</p>
              <p className="text-xs font-mono text-muted-foreground">{formatInr(leg.cost_inr)}</p>
            </div>
          </div>

          {hasStops && rich && (
            <button
              type="button"
              onClick={() => setShowStops((v) => !v)}
              className="mt-3 text-xs font-medium text-violet-300/90 hover:text-violet-200"
            >
              {showStops ? 'Hide stops' : 'Show intermediate stops'}
            </button>
          )}

          {showStops && leg.segments && (
            <ul className="mt-2 space-y-2 text-xs text-muted-foreground border-t border-white/[0.06] pt-2">
              {leg.segments.map((seg, i) => (
                <li key={i} className="leading-relaxed">
                  <span className="text-on-surface-variant font-medium">
                    {[seg.train_no, seg.train_name].filter(Boolean).join(' · ')}
                  </span>
                  <br />
                  {String(seg.from ?? '')} → {String(seg.to ?? '')}
                  {seg.departure ? ` · dep ${String(seg.departure)}` : ''}
                  {seg.arrival ? ` · arr ${String(seg.arrival)}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function LegTimeline({
  itinerary,
  rich = true,
}: {
  itinerary: ComposedItinerary;
  rich?: boolean;
}) {
  const legs = itinerary.legs || [];
  const transfers = itinerary.transfers || [];

  if (!legs.length) return null;

  return (
    <div className={rich ? '' : ''}>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-4">
        Itinerary detail
      </p>
      <div className="space-y-0">
        {legs.map((leg, i) => (
          <div key={`${leg.mode}-${leg.source}-${i}`}>
            <LegBlock leg={leg} step={i + 1} total={legs.length} rich={rich} />
            {i < transfers.length && transfers[i] && (
              <div className="py-3">
                <TransferBlock transfer={transfers[i]} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Compact preview — same timeline, tighter spacing */
export function LegPreview({ itinerary }: { itinerary: ComposedItinerary }) {
  return <LegTimeline itinerary={itinerary} rich={false} />;
}
