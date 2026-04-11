'use client';

import React, { useMemo } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function confidenceTone(score: number) {
  if (score >= 82) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20';
  if (score >= 64) return 'bg-amber-500/15 text-amber-200 border-amber-500/20';
  return 'bg-red-500/15 text-red-200 border-red-500/20';
}

function sourceLabel(dataSource: string) {
  if (dataSource.includes('openflights')) return 'OpenFlights route support';
  if (dataSource.includes('mock')) return 'Fallback catalog';
  if (dataSource.includes('dynamic')) return 'Dynamic fallback';
  return dataSource;
}

function routeTagTone(routeSupportType: string) {
  if (routeSupportType.includes('direct')) return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
  if (routeSupportType.includes('hub')) return 'bg-sky-500/10 text-sky-200 border-sky-500/20';
  return 'bg-secondary/10 text-secondary border-secondary/20';
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of items) {
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-outline-variant/12 bg-surface-container-low/50 p-3.5 sm:p-4">
      <div className="text-[9px] uppercase tracking-[0.18em] text-outline font-semibold">{label}</div>
      <div className="mt-1.5 text-base sm:text-lg font-semibold text-on-surface tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-[10px] sm:text-[11px] leading-snug text-on-surface-variant">{hint}</div>}
    </div>
  );
}

export default function AirResults() {
  const airRoutes = useLogiFlowStore((state) => state.airRoutes);
  const selectedAirRouteIndex = useLogiFlowStore((state) => state.selectedAirRouteIndex);
  const setSelectedAirRouteIndex = useLogiFlowStore((state) => state.setSelectedAirRouteIndex);
  const source = useLogiFlowStore((state) => state.source);
  const destination = useLogiFlowStore((state) => state.destination);
  const airConstraintsApplied = useLogiFlowStore((state) => state.airConstraintsApplied);

  const selected = airRoutes[selectedAirRouteIndex] ?? airRoutes[0];

  const breakdown = useMemo(() => {
    const b = selected?.cost_breakdown;
    if (!b) {
      const total = Number(selected?.cost ?? 0);
      return {
        base_freight: 0,
        fuel_surcharge: 0,
        terminal_fee: 0,
        handling_fee: 0,
        cargo_markup: 0,
        heavy_lift_fee: 0,
        total,
        pricing_basis: 'Breakdown not provided by API.',
        currency: 'INR',
      };
    }
    return b;
  }, [selected]);

  const supportingAirlines = useMemo(() => {
    const raw = selected?.air_details?.supporting_airlines;
    if (!Array.isArray(raw)) return [];
    return dedupeStrings(raw.map(String));
  }, [selected]);

  if (!airRoutes.length || !selected) {
    return (
      <div className="rounded-2xl border border-outline-variant/15 bg-surface-container-low/40 p-6 text-sm text-on-surface-variant">
        No air routes matched the active cargo rules and constraints. Try a wider budget or a less restrictive cargo profile.
      </div>
    );
  }

  const confidenceReasons = Array.isArray(selected.confidence_reasons) ? selected.confidence_reasons : [];
  const businessRules = Array.isArray(selected.business_rules_applied) ? selected.business_rules_applied : [];
  const keyFactors = Array.isArray(selected.key_factors) ? selected.key_factors : [];
  const details = selected.air_details ?? {
    source_airport: { code: '—', name: '—' },
    destination_airport: { code: '—', name: '—' },
  };

  const breakdownRows: [string, number][] = [
    ['Base freight', Number(breakdown.base_freight)],
    ['Fuel surcharge', Number(breakdown.fuel_surcharge)],
    ['Terminal fee', Number(breakdown.terminal_fee)],
    ['Handling fee', Number(breakdown.handling_fee)],
    ['Cargo markup', Number(breakdown.cargo_markup)],
    ['Heavy lift fee', Number(breakdown.heavy_lift_fee)],
  ];
  const maxBreakdown = Math.max(...breakdownRows.map(([, v]) => v), 1);

  return (
    <div className="w-full space-y-6">
      {/* Mobile / tablet: horizontal route picker */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5 lg:hidden [scrollbar-width:thin]">
        {airRoutes.map((route, index) => {
          const isSel = index === selectedAirRouteIndex;
          return (
            <button
              key={`air-route-pill-${index}-${route.airline}-${route.stops}`}
              type="button"
              onClick={() => setSelectedAirRouteIndex(index)}
              className={`shrink-0 rounded-xl border px-3 py-2 text-left text-[11px] transition-all ${
                isSel
                  ? 'border-sky-400/40 bg-sky-500/15 text-on-surface'
                  : 'border-outline-variant/15 bg-surface-container-low/40 text-on-surface-variant hover:border-outline-variant/30'
              }`}
            >
              <div className="font-semibold text-on-surface">{route.airline}</div>
              <div className="mono text-[10px] opacity-80">
                ₹{formatCurrency(route.cost)} · {route.time.toFixed(1)}h
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(240px,32%)_1fr] lg:items-start">
        {/* Desktop route queue */}
        <aside className="hidden lg:block space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-outline px-1">Routes</div>
          <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {airRoutes.map((route, index) => {
              const isSelected = index === selectedAirRouteIndex;
              return (
                <button
                  key={`air-route-${index}-${route.airline}-${route.stops}-${route.route_support_type}`}
                  type="button"
                  onClick={() => setSelectedAirRouteIndex(index)}
                  className={`w-full rounded-xl border p-3.5 text-left transition-all ${
                    isSelected
                      ? 'border-sky-400/35 bg-sky-500/10 shadow-md shadow-black/20'
                      : 'border-outline-variant/12 bg-surface-container-low/35 hover:border-outline-variant/25'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-outline">#{index + 1}</div>
                      <div className="truncate font-semibold text-on-surface">{route.airline}</div>
                      <div className="text-[10px] text-on-surface-variant">
                        {route.stops === 0 ? 'Direct' : `${route.stops} stop(s)`}
                      </div>
                    </div>
                    <div className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${confidenceTone(route.confidence_score)}`}>
                      {formatPercent(route.confidence_score)}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
                    <div className="rounded-lg border border-outline-variant/10 bg-surface-container/30 px-2 py-1.5">
                      <div className="text-outline">ETA</div>
                      <div className="mono font-medium text-on-surface">{route.time.toFixed(1)}h</div>
                    </div>
                    <div className="rounded-lg border border-outline-variant/10 bg-surface-container/30 px-2 py-1.5">
                      <div className="text-outline">Cost</div>
                      <div className="mono font-medium text-on-surface">₹{formatCurrency(route.cost)}</div>
                    </div>
                    <div className="rounded-lg border border-outline-variant/10 bg-surface-container/30 px-2 py-1.5">
                      <div className="text-outline">Delay</div>
                      <div className="mono font-medium text-on-surface">{formatPercent(route.delay_prob * 100)}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main detail */}
        <div className="min-w-0 space-y-5">
          <div className="rounded-2xl border border-outline-variant/12 bg-surface-container-low/40 overflow-hidden">
            <div className="border-b border-outline-variant/10 bg-gradient-to-br from-sky-500/10 via-primary/5 to-transparent px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-outline">Selected route</div>
                  <h2 className="mt-1 font-headline text-xl sm:text-2xl font-bold text-on-surface truncate">{selected.airline}</h2>
                  <p className="mt-1 text-[11px] sm:text-sm text-on-surface-variant">
                    {source} → {destination}
                  </p>
                </div>
                <div className={`shrink-0 self-start rounded-xl border px-3 py-2 ${confidenceTone(selected.confidence_score)}`}>
                  <div className="text-[9px] font-semibold uppercase tracking-wider">Confidence</div>
                  <div className="text-sm font-semibold">
                    {formatPercent(selected.confidence_score)} · {selected.confidence_label}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">{selected.reason}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${routeTagTone(selected.route_support_type)}`}>
                  {selected.route_support_type.replace(/_/g, ' ')}
                </span>
                <span className="rounded-full border border-outline-variant/12 bg-surface-container/50 px-2.5 py-1 text-[10px] text-on-surface-variant">
                  {sourceLabel(selected.data_source)}
                </span>
                <span className="rounded-full border border-outline-variant/12 bg-surface-container/50 px-2.5 py-1 text-[10px] text-on-surface-variant">
                  {selected.stops === 0 ? 'Non-stop' : `${selected.stops} stop(s)`}
                </span>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <StatCard label="Total cost" value={`₹${formatCurrency(selected.cost)}`} hint="Estimated freight" />
                <StatCard label="ETA" value={`${selected.time.toFixed(1)} h`} hint="Transit time" />
                <StatCard label="Risk" value={formatPercent(selected.risk * 100)} hint="Disruption exposure" />
                <StatCard label="Delay prob." value={formatPercent(selected.delay_prob * 100)} hint="Schedule slip" />
              </div>

              {airConstraintsApplied && (
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <StatCard
                    label="Budget cap"
                    value={`₹${formatCurrency(airConstraintsApplied.budget_limit ?? 0)}`}
                    hint="Constraint applied"
                  />
                  <StatCard
                    label="Deadline"
                    value={`${airConstraintsApplied.deadline_hours ?? '—'} h`}
                    hint="Target window"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest/30 p-4">
                  <div className="mb-3 text-[9px] font-bold uppercase tracking-[0.18em] text-outline">Cost breakdown</div>
                  <div className="space-y-2.5">
                    {breakdownRows.map(([label, amount]) => {
                      const width = maxBreakdown > 0 ? Math.max(6, (amount / maxBreakdown) * 100) : 0;
                      return (
                        <div key={label}>
                          <div className="flex justify-between gap-2 text-[11px]">
                            <span className="text-on-surface-variant">{label}</span>
                            <span className="mono shrink-0 text-on-surface">₹{formatCurrency(amount)}</span>
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-container">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-sky-500/70 to-primary/80"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex justify-between gap-2 border-t border-outline-variant/10 pt-2.5 text-sm font-semibold">
                      <span className="text-on-surface">Total</span>
                      <span className="mono text-sky-200">₹{formatCurrency(Number(breakdown.total))}</span>
                    </div>
                  </div>
                  {breakdown.pricing_basis && (
                    <p className="mt-2 text-[10px] leading-relaxed text-on-surface-variant">{breakdown.pricing_basis}</p>
                  )}
                </div>

                <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest/30 p-4">
                  <div className="mb-3 text-[9px] font-bold uppercase tracking-[0.18em] text-outline">Airports & airlines</div>
                  <dl className="space-y-2.5 text-[12px]">
                    <div className="flex justify-between gap-3 border-b border-outline-variant/8 pb-2">
                      <dt className="text-on-surface-variant shrink-0">Origin</dt>
                      <dd className="text-right text-on-surface min-w-0">
                        <span className="break-words">{details.source_airport?.name}</span>
                        <span className="mono text-outline ml-1">({details.source_airport?.code})</span>
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 border-b border-outline-variant/8 pb-2">
                      <dt className="text-on-surface-variant shrink-0">Destination</dt>
                      <dd className="text-right text-on-surface min-w-0">
                        <span className="break-words">{details.destination_airport?.name}</span>
                        <span className="mono text-outline ml-1">({details.destination_airport?.code})</span>
                      </dd>
                    </div>
                    {details.hub_airport && (
                      <div className="flex justify-between gap-3 border-b border-outline-variant/8 pb-2">
                        <dt className="text-on-surface-variant shrink-0">Hub</dt>
                        <dd className="text-right text-on-surface min-w-0">
                          <span className="break-words">{details.hub_airport.name}</span>
                          <span className="mono text-outline ml-1">({details.hub_airport.code})</span>
                        </dd>
                      </div>
                    )}
                  </dl>
                  {supportingAirlines.length > 0 && (
                    <div className="mt-4">
                      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-outline">Supporting airlines</div>
                      <div className="flex flex-wrap gap-1.5">
                        {supportingAirlines.map((airline, i) => (
                          <span
                            key={`support-airline-${i}-${airline}`}
                            className="rounded-full border border-outline-variant/12 bg-surface-container/60 px-2.5 py-1 text-[10px] text-on-surface"
                          >
                            {airline}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest/30 p-4">
                  <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-outline">Confidence signals</div>
                  <ul className="space-y-2">
                    {confidenceReasons.map((line, i) => (
                      <li
                        key={`conf-${i}-${line.slice(0, 24)}`}
                        className="flex gap-2 rounded-lg border border-outline-variant/8 bg-surface-container/25 px-2.5 py-2 text-[11px] leading-relaxed text-on-surface-variant"
                      >
                        <span className="shrink-0 font-mono text-[10px] text-sky-400/90 w-5">{i + 1}</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest/30 p-4">
                  <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-outline">Business rules</div>
                  <ul className="space-y-2">
                    {businessRules.map((line, i) => (
                      <li
                        key={`rule-${i}-${line.slice(0, 24)}`}
                        className="flex gap-2 rounded-lg border border-outline-variant/8 bg-surface-container/25 px-2.5 py-2 text-[11px] leading-relaxed text-on-surface-variant"
                      >
                        <span className="shrink-0 font-mono text-[10px] text-primary/90 w-5">{i + 1}</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest/30 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-outline">Key factors</div>
                  <div className="flex flex-wrap gap-3 text-[11px] text-on-surface-variant">
                    <span>
                      <span className="text-outline">Distance </span>
                      <span className="mono text-on-surface">{selected.distance} km</span>
                    </span>
                    <span>
                      <span className="text-outline">Reliability </span>
                      <span className="mono text-on-surface">{formatPercent(selected.reliability * 100)}</span>
                    </span>
                  </div>
                </div>
                <ul className="space-y-2">
                  {keyFactors.slice(0, 8).map((line, i) => (
                    <li
                      key={`kf-${i}-${line.slice(0, 24)}`}
                      className="flex gap-2 text-[11px] leading-relaxed text-on-surface-variant"
                    >
                      <span className="text-secondary shrink-0">▸</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
