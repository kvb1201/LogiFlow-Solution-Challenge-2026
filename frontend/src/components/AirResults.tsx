'use client';

import React from 'react';
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

function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest/45 p-4 shadow-[0_1px_0_rgba(255,255,255,0.03)]">
      <div className="text-[10px] uppercase tracking-[0.22em] text-outline">{label}</div>
      <div className="mt-2 text-lg font-semibold text-on-surface tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-[11px] leading-relaxed text-on-surface-variant">{hint}</div>}
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

  if (!airRoutes.length) {
    return (
      <div className="rounded-2xl border border-outline-variant/15 bg-surface-container-low/40 p-6 text-sm text-on-surface-variant">
        No air routes matched the active cargo rules and constraints. Try a wider budget or a less restrictive cargo profile.
      </div>
    );
  }

  const selected = airRoutes[selectedAirRouteIndex] ?? airRoutes[0];

  return (
    <section className="w-full max-w-[1380px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)_320px] gap-6 items-start">
        <aside className="space-y-4">
          <div className="rounded-3xl border border-outline-variant/15 bg-surface-container-low/40 p-5 shadow-[0_12px_30px_rgba(0,0,0,0.16)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-label font-bold uppercase tracking-[0.22em] text-outline">Air Lane</div>
                <div className="mt-2 text-lg font-semibold text-on-surface">{source} to {destination}</div>
              </div>
              <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${confidenceTone(selected.confidence_score)}`}>
                {formatPercent(selected.confidence_score)} confidence
              </div>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
              Ranked using cargo handling rules, stop tolerance, delay probability, route support, and pricing pressure.
            </p>

            <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
              <span className={`rounded-full border px-3 py-1 ${routeTagTone(selected.route_support_type)}`}>
                {selected.route_support_type.replace(/_/g, ' ')}
              </span>
              <span className="rounded-full border border-outline-variant/15 bg-surface-container-lowest/50 px-3 py-1 text-on-surface-variant">
                {sourceLabel(selected.data_source)}
              </span>
              <span className="rounded-full border border-outline-variant/15 bg-surface-container-lowest/50 px-3 py-1 text-on-surface-variant">
                {selected.stops === 0 ? 'Non-stop' : `${selected.stops} stops`}
              </span>
            </div>

            {airConstraintsApplied && (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <StatCard
                  label="Budget"
                  value={`INR ${formatCurrency(airConstraintsApplied.budget_limit ?? 0)}`}
                  hint="Applied constraint for route ranking"
                />
                <StatCard
                  label="Deadline"
                  value={`${airConstraintsApplied.deadline_hours ?? '-'}h`}
                  hint="Target delivery window"
                />
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-outline-variant/15 bg-surface-container-low/35 p-4">
            <div className="mb-3 text-[10px] font-label font-bold uppercase tracking-[0.22em] text-outline">Route Queue</div>
            <div className="space-y-3">
              {airRoutes.map((route, index) => {
                const isSelected = index === selectedAirRouteIndex;

                return (
                  <button
                    key={`${route.airline}-${route.route_support_type}-${index}`}
                    type="button"
                    onClick={() => setSelectedAirRouteIndex(index)}
                    className={`w-full rounded-2xl border p-4 text-left transition-all duration-200 ${isSelected ? 'border-secondary/35 bg-secondary/10 shadow-[0_10px_30px_rgba(255,182,137,0.10)]' : 'border-outline-variant/10 bg-surface-container-lowest/35 hover:border-outline-variant/25 hover:bg-surface-container/45'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-on-surface-variant">
                          Route {index + 1}
                        </div>
                        <div className="mt-1 text-base font-semibold text-on-surface">{route.airline}</div>
                        <div className="mt-1 text-[11px] text-on-surface-variant">
                          {route.stops === 0 ? 'Direct uplift' : `${route.stops} stop chain`}
                        </div>
                      </div>
                      <div className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${confidenceTone(route.confidence_score)}`}>
                        {formatPercent(route.confidence_score)}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
                      <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low/45 px-3 py-2">
                        <div className="text-outline">ETA</div>
                        <div className="mono mt-1 text-on-surface">{route.time.toFixed(1)}h</div>
                      </div>
                      <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low/45 px-3 py-2">
                        <div className="text-outline">Cost</div>
                        <div className="mono mt-1 text-on-surface">INR {formatCurrency(route.cost)}</div>
                      </div>
                      <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low/45 px-3 py-2">
                        <div className="text-outline">Delay</div>
                        <div className="mono mt-1 text-on-surface">{formatPercent(route.delay_prob * 100)}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                      <span className="rounded-full border border-outline-variant/10 bg-surface-container px-2.5 py-1 text-on-surface-variant">
                        {sourceLabel(route.data_source)}
                      </span>
                      <span className="rounded-full border border-outline-variant/10 bg-surface-container px-2.5 py-1 text-on-surface-variant">
                        {route.route_support_type.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="overflow-hidden rounded-3xl border border-outline-variant/15 bg-surface-container-low/35 shadow-[0_16px_50px_rgba(0,0,0,0.14)]">
          <div className="border-b border-outline-variant/10 bg-[linear-gradient(135deg,rgba(255,182,137,0.14),rgba(73,143,255,0.08),rgba(103,223,112,0.05))] px-6 py-6 sm:px-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-label font-bold uppercase tracking-[0.24em] text-outline">Selected Air Route</div>
                <h3 className="mt-2 text-2xl sm:text-3xl font-headline font-bold text-on-surface">{selected.airline}</h3>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-on-surface-variant">
                  {selected.reason}
                </p>
              </div>

              <div className={`rounded-2xl border px-4 py-3 ${confidenceTone(selected.confidence_score)}`}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em]">Route Confidence</div>
                <div className="mt-1 text-sm font-semibold">
                  {formatPercent(selected.confidence_score)} · {selected.confidence_label}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6 p-6 sm:p-7">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Total Cost" value={`INR ${formatCurrency(selected.cost)}`} hint="Estimated freight spend" />
              <StatCard label="ETA" value={`${selected.time.toFixed(1)}h`} hint="Projected transit time" />
              <StatCard label="Operational Risk" value={formatPercent(selected.risk * 100)} hint="Higher means more disruption exposure" />
              <StatCard label="Delay Probability" value={formatPercent(selected.delay_prob * 100)} hint="Chance of schedule slip" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-4">
              <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest/35 p-5">
                <div className="mb-4 text-[10px] font-label font-bold uppercase tracking-[0.22em] text-outline">Cost Optimization Breakdown</div>
                <div className="space-y-3 text-sm">
                  {[
                    ['Base freight', selected.cost_breakdown.base_freight],
                    ['Fuel surcharge', selected.cost_breakdown.fuel_surcharge],
                    ['Terminal fee', selected.cost_breakdown.terminal_fee],
                    ['Handling fee', selected.cost_breakdown.handling_fee],
                    ['Cargo markup', selected.cost_breakdown.cargo_markup],
                    ['Heavy lift fee', selected.cost_breakdown.heavy_lift_fee],
                  ].map(([label, value], index) => {
                    const amount = Number(value);
                    const maxAmount = Math.max(
                      selected.cost_breakdown.base_freight,
                      selected.cost_breakdown.fuel_surcharge,
                      selected.cost_breakdown.terminal_fee,
                      selected.cost_breakdown.handling_fee,
                      selected.cost_breakdown.cargo_markup,
                      selected.cost_breakdown.heavy_lift_fee,
                    );
                    const width = maxAmount > 0 ? Math.max(8, (amount / maxAmount) * 100) : 0;

                    return (
                      <div key={String(label)} className="space-y-2">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-on-surface-variant">{label}</span>
                          <span className="mono text-on-surface">INR {formatCurrency(amount)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-container">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r from-secondary to-primary ${index === 0 ? 'opacity-90' : 'opacity-75'}`}
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="mt-2 flex items-center justify-between gap-4 border-t border-outline-variant/10 pt-3">
                    <span className="font-semibold text-on-surface">Total</span>
                    <span className="mono font-semibold text-secondary">INR {formatCurrency(selected.cost_breakdown.total)}</span>
                  </div>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-on-surface-variant">
                  {selected.cost_breakdown.pricing_basis}
                </p>
              </div>

              <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest/35 p-5">
                <div className="mb-4 text-[10px] font-label font-bold uppercase tracking-[0.22em] text-outline">Confidence Signals</div>
                <div className="space-y-3 text-sm text-on-surface-variant">
                  <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low/45 p-4">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-outline">Source</div>
                    <div className="mt-1 text-on-surface">{sourceLabel(selected.data_source)}</div>
                    <div className="mt-1 text-[11px] text-on-surface-variant">
                      Support type: {selected.route_support_type.replace(/_/g, ' ')}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {selected.confidence_reasons.map((line, index) => (
                      <div key={line} className="flex items-start gap-3 rounded-xl border border-outline-variant/10 bg-surface-container-lowest/30 px-3 py-2">
                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary/12 text-[11px] font-semibold text-secondary">
                          {index + 1}
                        </span>
                        <span className="leading-relaxed">{line}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest/35 p-5">
                <div className="mb-4 text-[10px] font-label font-bold uppercase tracking-[0.22em] text-outline">Route Support</div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-on-surface-variant">Origin airport</span>
                    <span className="text-right text-on-surface">
                      {selected.air_details.source_airport?.name} ({selected.air_details.source_airport?.code})
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-on-surface-variant">Destination airport</span>
                    <span className="text-right text-on-surface">
                      {selected.air_details.destination_airport?.name} ({selected.air_details.destination_airport?.code})
                    </span>
                  </div>
                  {selected.air_details.hub_airport && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-on-surface-variant">Hub airport</span>
                      <span className="text-right text-on-surface">
                        {selected.air_details.hub_airport.name} ({selected.air_details.hub_airport.code})
                      </span>
                    </div>
                  )}
                  {!!selected.air_details.supporting_airlines?.length && (
                    <div>
                      <div className="mb-2 text-on-surface-variant">Supporting airlines</div>
                      <div className="flex flex-wrap gap-2">
                        {selected.air_details.supporting_airlines.map((airline) => (
                          <span key={airline} className="rounded-full border border-outline-variant/10 bg-surface-container px-2.5 py-1 text-[11px] text-on-surface">
                            {airline}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest/35 p-5">
                <div className="mb-4 text-[10px] font-label font-bold uppercase tracking-[0.22em] text-outline">Cargo Business Rules</div>
                <div className="space-y-2">
                  {selected.business_rules_applied.map((line, index) => (
                    <div key={`${line}-${index}`} className="flex items-start gap-3 rounded-xl border border-outline-variant/10 bg-surface-container-lowest/30 px-3 py-2 text-sm text-on-surface-variant">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[11px] font-semibold text-primary">
                        {index + 1}
                      </span>
                      <span className="leading-relaxed">{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-outline-variant/15 bg-surface-container-low/40 p-5">
            <div className="mb-3 text-[10px] font-label font-bold uppercase tracking-[0.22em] text-outline">Selection Summary</div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-on-surface-variant">Airline</span>
                <span className="text-on-surface">{selected.airline}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-on-surface-variant">Stops</span>
                <span className="text-on-surface">{selected.stops}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-on-surface-variant">Distance</span>
                <span className="mono text-on-surface">{selected.distance} km</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-on-surface-variant">Reliability</span>
                <span className="mono text-on-surface">{formatPercent(selected.reliability * 100)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-outline-variant/15 bg-surface-container-low/40 p-5">
            <div className="mb-3 text-[10px] font-label font-bold uppercase tracking-[0.22em] text-outline">Why This Score</div>
            <div className="space-y-2">
              {selected.key_factors.slice(0, 6).map((line, index) => (
                <div key={`${line}-${index}`} className="flex items-start gap-3 rounded-xl border border-outline-variant/10 bg-surface-container-lowest/30 px-3 py-2 text-sm text-on-surface-variant">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary/12 text-[11px] font-semibold text-secondary">
                    {index + 1}
                  </span>
                  <span className="leading-relaxed">{line}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
