'use client';

import React from 'react';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────────

export interface InvalidCorridorProps {
  /** Transport mode that was rejected (e.g. "road") */
  mode: string;
  /** Origin city/location */
  source: string;
  /** Destination city/location */
  destination: string;
  /**
   * Human-readable reason returned by the backend, e.g.
   * "No drivable road route between Europe and North America."
   */
  reason: string;
  /**
   * When true the card renders in a compact inline layout suitable for
   * embedding inside a comparator table row or hybrid results panel.
   * When false (default) it renders as a full-page-width card.
   */
  compact?: boolean;
}

// ── Suggested alternative modes per rejected mode ────────────────────

const SUGGESTED_LINKS: Record<
  string,
  Array<{ label: string; href: string; description: string }>
> = {
  road: [
    { label: 'Air Transport', href: '/air', description: 'Fastest option for intercontinental shipments' },
    { label: 'Hybrid Planner', href: '/hybrid', description: 'Chain multiple modes via hub cities' },
    { label: 'Comparator Mode', href: '/comparator', description: 'Compare all modes side by side' },
  ],
};

function getSuggestions(mode: string) {
  return SUGGESTED_LINKS[mode.toLowerCase()] ?? [];
}

// ── Reason display helper ────────────────────────────────────────────

/**
 * Classify the backend reason into a user-friendly headline and body.
 * The backend can return:
 *   - "No drivable road route between Europe and North America…"
 *   - "Straight-line distance (7192 km) exceeds the maximum plausible…"
 *   - "No drivable route exists between source and destination."
 */
function categoriseReason(reason: string): { headline: string; body: string } {
  const r = reason.trim();

  if (/ocean|sea|atlantic|pacific|continent/i.test(r) || /north america/i.test(r) || /europe.*(north|south|ocean)/i.test(r)) {
    return {
      headline: 'No drivable road route exists between these locations.',
      body: 'This corridor crosses an ocean and cannot be served by road transport.',
    };
  }

  if (/distance.*exceeds|threshold|operational limit/i.test(r)) {
    return {
      headline: 'Road transport is not supported for this corridor.',
      body: 'The straight-line distance between these cities exceeds the operational limit for road freight without confirmed road connectivity.',
    };
  }

  if (/not connected|isolated|no continuous/i.test(r)) {
    return {
      headline: 'This destination is not connected by a continuous road network.',
      body: 'Road infrastructure between these locations is not continuous — a ferry, sea, or air segment is required.',
    };
  }

  // Generic fallback: surface the backend message directly
  return {
    headline: 'No drivable road route available.',
    body: r,
  };
}

// ── Full-width card ───────────────────────────────────────────────────

export function InvalidCorridorCard({
  mode,
  source,
  destination,
  reason,
  compact = false,
}: InvalidCorridorProps) {
  const { headline, body } = categoriseReason(reason);
  const suggestions = getSuggestions(mode);
  const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase();

  if (compact) {
    return <InvalidCorridorInline mode={mode} reason={reason} />;
  }

  return (
    <div
      role="status"
      aria-label={`${modeLabel} route unavailable`}
      className="rounded-2xl border border-red-500/25 bg-red-500/5 p-6 sm:p-8"
    >
      {/* Header */}
      <div className="flex items-start gap-4 mb-5">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-300"
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '22px', fontVariationSettings: "'FILL' 1" }}
          >
            block
          </span>
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-400/80 mb-1">
            {modeLabel} Route Unavailable
          </p>
          <h2 className="text-base font-semibold text-on-surface leading-snug">
            🚫 {headline}
          </h2>
        </div>
      </div>

      {/* Corridor */}
      <div className="mb-4 rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-4 py-3">
        <p className="text-[10px] uppercase tracking-widest text-outline font-bold mb-1.5">
          Corridor
        </p>
        <p className="text-sm font-mono text-on-surface">
          {source} <span className="text-outline/60 mx-1.5">→</span> {destination}
        </p>
      </div>

      {/* Reason */}
      <div className="mb-5 rounded-xl bg-red-500/8 border border-red-500/15 px-4 py-3">
        <p className="text-[10px] uppercase tracking-widest text-red-400/70 font-bold mb-1.5">
          Reason
        </p>
        <p className="text-sm text-on-surface-variant leading-relaxed">{body}</p>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-outline font-bold mb-3">
            Suggested alternatives
          </p>
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="flex items-center gap-3 rounded-xl border border-outline-variant/15 bg-surface-container/30 px-4 py-3 hover:bg-surface-container/60 hover:border-outline-variant/30 transition-all group"
                >
                  <span
                    aria-hidden="true"
                    className="text-emerald-400/80 shrink-0 group-hover:translate-x-0.5 transition-transform"
                  >
                    ✓
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-on-surface group-hover:text-primary transition-colors">
                      {s.label}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{s.description}</p>
                  </div>
                  <span
                    className="material-symbols-outlined text-outline/40 ml-auto shrink-0 group-hover:text-primary/60 transition-colors"
                    style={{ fontSize: '16px' }}
                  >
                    arrow_forward
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Compact inline variant (used inside comparator / hybrid) ─────────

export function InvalidCorridorInline({
  mode,
  reason,
}: {
  mode: string;
  reason: string;
}) {
  const { body } = categoriseReason(reason);
  const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase();

  return (
    <div
      role="status"
      aria-label={`${modeLabel} unavailable`}
      className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/5 px-3.5 py-3"
    >
      <span
        className="material-symbols-outlined text-red-400/80 shrink-0 mt-0.5"
        style={{ fontSize: '15px', fontVariationSettings: "'FILL' 1" }}
        aria-hidden="true"
      >
        block
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-red-300/90">
          {modeLabel} ❌ Unavailable
        </p>
        <p className="text-[11px] text-on-surface-variant/80 mt-0.5 leading-relaxed">
          {body}
        </p>
      </div>
    </div>
  );
}

export default InvalidCorridorCard;
