'use client';

import { useState } from 'react';
import type { ComposedItinerary, ComposedLeg, ComposedTransfer } from '@/services/api';
import {
  formatInr,
  formatHours,
  legDetailLine,
  legStationAlightLine,
  legStationBoardLine,
  modeMeta,
  segmentHeading,
  transferSeverityMeta,
} from '@/lib/hybrid-ui';

function TransferPanel({ transfer }: { transfer: ComposedTransfer }) {
  const meta = transferSeverityMeta(transfer.severity);
  const tips = transfer.warnings?.length
    ? transfer.warnings
    : [`Wait about ${formatHours(transfer.buffer_hr)} at ${transfer.at} to move your cargo`];

  return (
    <div className={`my-3 rounded-xl border px-4 py-3 ${meta.chip}`}>
      <p className="text-sm font-semibold">
        {meta.label} at {transfer.at}
      </p>
      <p className="text-xs mt-1 opacity-90">
        Wait about {formatHours(transfer.buffer_hr)}
        {transfer.scheduled_gap_hr != null &&
          ` (trains are ${formatHours(transfer.scheduled_gap_hr)} apart on the timetable)`}
        {transfer.handling_fee_inr
          ? ` · cargo handling about ${formatInr(transfer.handling_fee_inr)}`
          : ''}
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {tips.map((tip, i) => (
          <li key={i} className="text-xs leading-relaxed opacity-95 pl-3 relative before:content-['•'] before:absolute before:left-0">
            {tip}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TripSegment({
  leg,
  index,
  totalLegs,
  hubCity,
  transferAfter,
  rich,
}: {
  leg: ComposedLeg;
  index: number;
  totalLegs: number;
  hubCity?: string;
  transferAfter?: ComposedTransfer;
  rich: boolean;
}) {
  const [showStops, setShowStops] = useState(false);
  const m = modeMeta(leg.mode);
  const heading = segmentHeading(leg, index, totalLegs, hubCity);
  const trainInfo = legDetailLine(leg);
  const startLine = legStationBoardLine(leg);
  const endLine = legStationAlightLine(leg);
  const hasStops = (leg.segments?.length ?? 0) > 1;

  const body = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3 min-w-0 flex-1">
          <span
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${m.chip}`}
          >
            <span className="material-symbols-outlined text-[17px]">{m.icon}</span>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-on-surface">{heading}</p>
            {trainInfo && (
              <p className="text-xs text-on-surface-variant mt-1">{trainInfo}</p>
            )}
            {startLine && (
              <p className="text-xs text-muted-foreground mt-1.5">{startLine}</p>
            )}
            {endLine && startLine !== endLine && (
              <p className="text-xs text-muted-foreground mt-0.5">{endLine}</p>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold font-mono text-on-surface">{formatHours(leg.time_hr)}</p>
          <p className="text-xs font-mono text-muted-foreground">{formatInr(leg.cost_inr)}</p>
        </div>
      </div>

      {hasStops && rich && (
        <button
          type="button"
          onClick={() => setShowStops((v) => !v)}
          className="mt-2 ml-11 text-xs text-violet-300/90 hover:text-violet-200"
        >
          {showStops ? 'Hide intermediate stops' : 'See intermediate stops'}
        </button>
      )}

      {showStops && leg.segments && (
        <ul className="mt-2 ml-11 space-y-2 text-xs text-muted-foreground border-l border-border/40 pl-3">
          {leg.segments.map((seg, i) => (
            <li key={i}>
              <span className="text-on-surface-variant font-medium">
                {[seg.train_no, seg.train_name].filter(Boolean).join(' · ')}
              </span>
              <br />
              {String(seg.from ?? '')} → {String(seg.to ?? '')}
              {seg.departure ? ` · leaves ${String(seg.departure)}` : ''}
              {seg.arrival ? ` · arrives ${String(seg.arrival)}` : ''}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <div>
      {rich ? (
        <div className="rounded-xl border border-border/50 bg-background/30 px-4 py-3.5">{body}</div>
      ) : (
        <div className="py-1">{body}</div>
      )}
      {transferAfter && <TransferPanel transfer={transferAfter} />}
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
  const hub = itinerary.hub_cities?.[0];

  if (legs.length === 0) return null;

  return (
    <div className={`space-y-3 ${rich ? 'mt-5 pt-5 border-t border-border/40' : 'mt-3'}`}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Trip breakdown
      </p>
      {legs.map((leg, i) => (
        <TripSegment
          key={`${leg.mode}-${i}`}
          leg={leg}
          index={i}
          totalLegs={legs.length}
          hubCity={hub}
          transferAfter={i < transfers.length ? transfers[i] : undefined}
          rich={rich}
        />
      ))}
    </div>
  );
}

/** Compact preview for alternative route cards */
export function LegPreview({ itinerary }: { itinerary: ComposedItinerary }) {
  const legs = itinerary.legs || [];
  const transfers = itinerary.transfers || [];
  const hub = itinerary.hub_cities?.[0];
  if (!legs.length) return null;

  return (
    <div className="mt-3 space-y-0">
      {legs.map((leg, i) => {
        const m = modeMeta(leg.mode);
        const heading = segmentHeading(leg, i, legs.length, hub);
        const transfer = i < transfers.length ? transfers[i] : undefined;

        return (
          <div key={i}>
            <div className="rounded-lg border border-border/40 bg-background/20 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <span className={`material-symbols-outlined text-[16px] mt-0.5 ${m.tint}`}>
                  {m.icon}
                </span>
                <div className="min-w-0 flex-1 text-xs">
                  <p className="font-medium text-on-surface">{heading}</p>
                  {legDetailLine(leg) && (
                    <p className="text-muted-foreground mt-0.5">{legDetailLine(leg)}</p>
                  )}
                  {legStationBoardLine(leg) && (
                    <p className="text-muted-foreground mt-1">{legStationBoardLine(leg)}</p>
                  )}
                </div>
                <span className="font-mono text-muted-foreground shrink-0 text-xs">
                  {formatHours(leg.time_hr)}
                </span>
              </div>
            </div>
            {transfer && (
              <div className="py-1.5">
                <TransferPanel transfer={transfer} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
