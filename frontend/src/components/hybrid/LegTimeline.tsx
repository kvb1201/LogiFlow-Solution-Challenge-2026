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
  const [open, setOpen] = useState(false);
  const meta = transferSeverityMeta(transfer.severity);
  const place = transfer.at_display || transfer.at;
  const tips = transfer.warnings?.length
    ? transfer.warnings
    : [`Allow ${formatHours(transfer.buffer_hr)} to transfer cargo at ${place}`];
  const summary = `Wait ~${formatHours(transfer.buffer_hr)}${
    transfer.handling_fee_inr ? ` · ~${formatInr(transfer.handling_fee_inr)} handling` : ''
  }`;

  return (
    <div className="ml-7 sm:ml-8 border-l border-dashed border-border/50 pl-4 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2.5 text-left group"
      >
        <span
          className="material-symbols-outlined shrink-0 text-muted-foreground mt-0.5"
          style={{ fontSize: 16 }}
          aria-hidden
        >
          {meta.icon}
        </span>
        <span className="min-w-0 flex-1 text-sm text-muted-foreground leading-snug">
          <span className="font-medium text-on-surface">{meta.label}</span>
          {' · '}
          <span style={{ color: 'var(--hybrid)' }}>{place}</span>
          {' · '}
          {summary}
          {tips.length > 0 && (
            <span className="ml-1.5 text-xs text-muted-foreground/70 group-hover:text-muted-foreground">
              {open ? '(hide)' : '(details)'}
            </span>
          )}
        </span>
      </button>
      {open && tips.length > 0 && (
        <ul className="mt-2 ml-6 space-y-1">
          {tips.map((tip, i) => (
            <li key={i} className="text-xs leading-relaxed text-muted-foreground">
              {tip}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LegBlock({ leg, step, total }: { leg: ComposedLeg; step: number; total: number }) {
  const [showStops, setShowStops] = useState(false);
  const m = modeMeta(leg.mode);
  const trainInfo = legDetailLine(leg);
  const board = legStationBoardLine(leg);
  const alight = legStationAlightLine(leg);
  const hasStops = (leg.segments?.length ?? 0) > 1;

  return (
    <div className="relative flex gap-3 sm:gap-4">
      <div className="flex flex-col items-center shrink-0 w-6 pt-0.5">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${m.chip}`}
        >
          {step}
        </span>
        {step < total && <div className="flex-1 w-px min-h-[0.75rem] bg-border/50 mt-1" />}
      </div>

      <div className="flex-1 min-w-0 pb-3 border-b border-border/30 last:pb-0 last:border-b-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`inline-flex items-center gap-1 text-xs font-semibold ${m.tint}`}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
                  {m.icon}
                </span>
                {modeLabel(leg.mode)}
              </span>
              <span className="text-sm font-semibold text-on-surface">
                {leg.source}
                <span className="text-muted-foreground/50 font-normal mx-1.5">→</span>
                {leg.destination}
              </span>
            </div>

            {(trainInfo || board || alight) && (
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                {[trainInfo, board !== alight ? board : null, alight].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          <div className="text-right shrink-0 font-mono text-sm leading-snug">
            <div className="font-semibold text-on-surface">{formatHours(leg.time_hr)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{formatInr(leg.cost_inr)}</div>
          </div>
        </div>

        {hasStops && (
          <button
            type="button"
            onClick={() => setShowStops((v) => !v)}
            className="mt-2 text-xs font-medium hover:underline"
            style={{ color: 'var(--hybrid)' }}
          >
            {showStops ? 'Hide stops' : 'Show stops'}
          </button>
        )}

        {showStops && leg.segments && (
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {leg.segments.map((seg, i) => (
              <li key={i}>
                {[seg.train_no, seg.train_name].filter(Boolean).join(' · ')}{' '}
                {String(seg.from ?? '')} → {String(seg.to ?? '')}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function LegTimeline({
  itinerary,
  rich = true,
  showLabel = true,
}: {
  itinerary: ComposedItinerary;
  rich?: boolean;
  showLabel?: boolean;
}) {
  const legs = itinerary.legs || [];
  const transfers = itinerary.transfers || [];

  if (!legs.length) return null;

  return (
    <div>
      {showLabel && rich && (
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Itinerary
        </p>
      )}
      <div className="space-y-1">
        {legs.map((leg, i) => (
          <div key={`${leg.mode}-${leg.source}-${i}`}>
            <LegBlock leg={leg} step={i + 1} total={legs.length} />
            {i < transfers.length && transfers[i] && (
              <TransferBlock transfer={transfers[i]} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function LegPreview({ itinerary }: { itinerary: ComposedItinerary }) {
  return <LegTimeline itinerary={itinerary} rich showLabel={false} />;
}
