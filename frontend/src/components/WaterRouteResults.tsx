'use client';

import React, { useState, useEffect } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { fetchExplanation, type WaterRoute } from '@/services/api';

// ── Helpers ───────────────────────────────────────────────────────────

function fmt(val: unknown) {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('en-IN').format(Math.round(n));
}

function riskColor(risk: number): string {
  if (risk < 0.25) return '#2dd4bf'; // teal — low
  if (risk < 0.5) return '#f59e0b';  // amber — moderate
  return '#ef4444';                   // red — high
}

function riskLabel(risk: number): string {
  if (risk < 0.25) return 'Low';
  if (risk < 0.5) return 'Moderate';
  return 'High';
}

function reliabilityLabel(score: number): string {
  if (score >= 0.85) return 'Excellent';
  if (score >= 0.7) return 'Good';
  if (score >= 0.5) return 'Fair';
  return 'Poor';
}

// ── Metric Tile ───────────────────────────────────────────────────────

function MetricTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 px-3 py-2.5">
      <div className="text-[10px] text-outline mb-1 flex items-center gap-1 font-medium">
        <span
          className="material-symbols-outlined leading-none"
          style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1" }}
        >
          {icon}
        </span>
        {label}
      </div>
      <div className="text-sm font-bold mono tabular-nums text-teal-400 leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-outline mono mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Route Card ────────────────────────────────────────────────────────

function WaterRouteCard({
  route,
  index,
  isSelected,
  onSelect,
  isCheapest,
  isFastest,
  isSafest,
  source,
  destination,
}: {
  route: WaterRoute;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  isCheapest: boolean;
  isFastest: boolean;
  isSafest: boolean;
  source: string;
  destination: string;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const risk = Number(route.risk ?? 0);
  const reliability = Number(route.reliability_score ?? 0);
  const delay = Number(route.expected_delay_hours ?? 0);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Select route ${index + 1}`}
      aria-pressed={isSelected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={[
        'w-full text-left rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden',
        isSelected
          ? 'border-teal-400/50 bg-surface-container/60 shadow-[0_0_0_2px_rgba(45,212,191,0.12),0_0_24px_rgba(45,212,191,0.08)] scale-[1.01]'
          : 'border-outline-variant/12 bg-surface-container-lowest/30 hover:bg-surface-container/30 hover:border-outline-variant/25',
      ].join(' ')}
    >
      {/* Summary bar */}
      <div className="px-4 py-2 bg-surface-container/20 border-b border-outline-variant/8">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] text-on-surface-variant mono truncate">
            {source} → {destination}
            {route.distance_nm != null && ` · ${Number(route.distance_nm).toFixed(0)} nm`}
            {route.transshipments != null &&
              ` · ${route.transshipments} transshipment${route.transshipments !== 1 ? 's' : ''}`}
          </p>
          {route.notes && (
            <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/15 mono whitespace-nowrap truncate max-w-[140px]">
              {route.notes}
            </span>
          )}
        </div>
      </div>

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={[
                'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold mono shrink-0',
                isSelected ? 'bg-teal-500 text-white' : 'bg-surface-container text-outline',
              ].join(' ')}
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-label font-bold uppercase tracking-[0.12em] text-on-surface-variant mb-1">
                Maritime Route {index + 1}
              </div>
              <div className="flex flex-wrap gap-1">
                {index === 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-teal-500/12 text-teal-300 mono border border-teal-500/20">
                    Top pick
                  </span>
                )}
                {isCheapest && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-500/12 text-emerald-300 mono">
                    ₹ Lowest
                  </span>
                )}
                {isFastest && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-500/12 text-amber-200 mono">
                    Fastest
                  </span>
                )}
                {isSafest && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-blue-500/12 text-blue-200 mono">
                    Safest
                  </span>
                )}
                {isSelected && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-teal-500/12 text-teal-300 mono">
                    Selected
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-[15px] font-black mono text-teal-400 leading-tight">
              ₹{fmt(route.cost)}
            </div>
            <div className="text-[10px] text-outline mono mt-0.5">
              {Number(route.time).toFixed(1)}h transit
            </div>
          </div>
        </div>

        {/* Port route */}
        {(route.origin_port || route.destination_port) && (
          <div className="flex items-center gap-2 mb-4 bg-teal-500/5 border border-teal-400/10 rounded-xl px-3 py-2">
            <span
              className="material-symbols-outlined text-teal-400 shrink-0"
              style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
            >
              anchor
            </span>
            <span className="text-[11px] mono text-on-surface truncate">
              {route.origin_port ?? source} → {route.destination_port ?? destination}
            </span>
          </div>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <MetricTile icon="schedule" label="Transit" value={`${Number(route.time).toFixed(1)}h`} />
          <MetricTile icon="payments" label="Cost" value={`₹${fmt(route.cost)}`} />
          <MetricTile
            icon="warning"
            label="Risk"
            value={`${Math.round(risk * 100)}%`}
            sub={riskLabel(risk)}
          />
          {route.distance_nm != null ? (
            <MetricTile icon="straighten" label="Distance" value={`${Number(route.distance_nm).toFixed(0)}`} sub="nautical mi" />
          ) : (
            <MetricTile icon="hub" label="Stops" value={route.transshipments ?? 0} sub="transshipments" />
          )}
        </div>

        {/* Risk bar */}
        <div className="mb-4">
          <div className="flex justify-between text-[10px] text-outline mono mb-1">
            <span>Risk exposure</span>
            <span style={{ color: riskColor(risk) }}>{riskLabel(risk)} — {Math.round(risk * 100)}%</span>
          </div>
          <div className="w-full h-1.5 bg-surface-container-highest/50 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, risk * 100)}%`, background: riskColor(risk) }}
            />
          </div>
        </div>

        {/* Reliability + delay */}
        <div className="grid grid-cols-2 gap-2 mb-4 text-[10px] mono">
          <div className="px-2.5 py-2 rounded-xl bg-surface-container-low/40 border border-outline-variant/10">
            <div className="text-outline/60 mb-1 text-[9px] uppercase tracking-widest">Reliability</div>
            <div
              className={`font-bold ${
                reliability >= 0.85 ? 'text-emerald-400' : reliability >= 0.7 ? 'text-teal-300' : 'text-amber-300'
              }`}
            >
              {Math.round(reliability * 100)}% — {reliabilityLabel(reliability)}
            </div>
          </div>
          <div className="px-2.5 py-2 rounded-xl bg-surface-container-low/40 border border-outline-variant/10">
            <div className="text-outline/60 mb-1 text-[9px] uppercase tracking-widest">Exp. Delay</div>
            <div className={`font-bold ${delay > 5 ? 'text-red-400' : delay > 2 ? 'text-amber-300' : 'text-emerald-400'}`}>
              {delay > 0.1 ? `+${delay.toFixed(1)}h` : 'On time'}
            </div>
          </div>
        </div>

        {/* Risk breakdown toggle */}
        {route.risk_breakdown && Object.keys(route.risk_breakdown).length > 0 && (
          <div className="pt-3 border-t border-outline-variant/8">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowBreakdown((v) => !v);
              }}
              className="flex items-center justify-between w-full text-[10px] font-label font-bold uppercase tracking-[0.12em] text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <span>Risk breakdown</span>
              <span className="mono text-teal-400">{showBreakdown ? '−' : '+'}</span>
            </button>
            {showBreakdown && (
              <div className="mt-2.5 rounded-xl border border-outline-variant/10 overflow-hidden">
                <table className="w-full text-[11px]">
                  <tbody className="divide-y divide-outline-variant/8">
                    {Object.entries(route.risk_breakdown).map(([k, v]) => (
                      <tr key={k} className="bg-surface-container-lowest/15">
                        <td className="py-2 pl-3 text-on-surface-variant capitalize">{k.replace(/_/g, ' ')}</td>
                        <td className="py-2 pr-3 text-right mono font-medium text-on-surface tabular-nums">
                          {(Number(v) * 100).toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────

function DetailPanel({ route, source, destination }: { route: WaterRoute; source: string; destination: string }) {
  const risk = Number(route.risk ?? 0);
  const reliability = Number(route.reliability_score ?? 0);

  const [dynamicExplanation, setDynamicExplanation] = useState<string | null>(null);
  const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);

  useEffect(() => {
    setDynamicExplanation(null);
    setIsLoadingExplanation(false);
  }, [route]);

  const handleExplain = async () => {
    setIsLoadingExplanation(true);
    const expl = await fetchExplanation({
      pipeline: 'water',
      priority: useLogiFlowStore.getState().priority,
      route_data: route,
    });
    if (expl) setDynamicExplanation(expl);
    setIsLoadingExplanation(false);
  };

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="bg-surface-container/30 rounded-xl border border-teal-400/10 p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-[12px] font-bold text-on-surface">
              {route.origin_port ?? source} → {route.destination_port ?? destination}
            </div>
            <div className="text-[10px] text-outline mono mt-0.5">
              {route.transshipments ?? 0} transshipment(s)
              {route.distance_nm != null && ` · ${Number(route.distance_nm).toFixed(0)} nm`}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xl font-black mono text-teal-400 leading-tight">₹{fmt(route.cost)}</div>
            <div className="text-[10px] text-outline mono">{Number(route.time).toFixed(1)}h</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <div className="bg-surface-container-lowest/50 border border-outline-variant/8 px-2 py-1.5 rounded-lg text-center">
            <div className="text-[9px] text-outline/70 tracking-[0.12em] mb-0.5 font-label font-semibold uppercase">Time</div>
            <div className="text-[11px] mono font-bold text-teal-400">{Number(route.time).toFixed(1)}h</div>
          </div>
          <div className="bg-surface-container-lowest/50 border border-outline-variant/8 px-2 py-1.5 rounded-lg text-center">
            <div className="text-[9px] text-outline/70 tracking-[0.12em] mb-0.5 font-label font-semibold uppercase">Risk</div>
            <div className="text-[11px] mono font-bold" style={{ color: riskColor(risk) }}>{Math.round(risk * 100)}%</div>
          </div>
          <div className="bg-surface-container-lowest/50 border border-outline-variant/8 px-2 py-1.5 rounded-lg text-center">
            <div className="text-[9px] text-outline/70 tracking-[0.12em] mb-0.5 font-label font-semibold uppercase">Rely</div>
            <div className="text-[11px] mono font-bold text-emerald-400">{Math.round(reliability * 100)}%</div>
          </div>
        </div>
      </div>

      {/* Segments */}
      {route.segments && route.segments.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <span
              className="material-symbols-outlined text-teal-400 leading-none"
              style={{ fontSize: '14px', fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
            >
              route
            </span>
            <h3 className="text-[10px] font-label font-bold uppercase tracking-[0.12em] text-on-surface-variant">
              Route Segments
            </h3>
          </div>
          <div className="space-y-1.5">
            {route.segments.map((seg, i) => (
              <div
                key={`${i}-${seg.from}-${seg.to}`}
                className="flex items-center gap-2 text-[11px] bg-surface-container/20 rounded-lg px-2.5 py-2 border border-outline-variant/8"
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    i === 0 ? 'bg-teal-400' : i === route.segments.length - 1 ? 'bg-cyan-400' : 'bg-teal-400/50'
                  }`}
                />
                <span className="text-[9px] mono text-outline/70 uppercase shrink-0">{seg.mode}</span>
                <span className="text-on-surface truncate">{seg.from}</span>
                <span
                  className="material-symbols-outlined text-outline shrink-0"
                  style={{ fontSize: '11px' }}
                >
                  arrow_forward
                </span>
                <span className="text-on-surface truncate">{seg.to}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Risk breakdown */}
      {route.risk_breakdown && Object.keys(route.risk_breakdown).length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <span
              className="material-symbols-outlined text-teal-400 leading-none"
              style={{ fontSize: '14px', fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
            >
              shield
            </span>
            <h3 className="text-[10px] font-label font-bold uppercase tracking-[0.12em] text-on-surface-variant">
              Risk Breakdown
            </h3>
          </div>
          <div className="bg-surface-container/20 rounded-xl border border-outline-variant/8 px-3 py-1 divide-y divide-outline-variant/5">
            {Object.entries(route.risk_breakdown).map(([k, v]) => (
              <div key={k} className="flex justify-between items-baseline gap-2 py-1.5">
                <span className="text-[10px] text-outline capitalize">{k.replace(/_/g, ' ')}</span>
                <span className="text-[11px] mono font-bold" style={{ color: riskColor(Number(v)) }}>
                  {(Number(v) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Delay / reliability */}
      <section>
        <div className="flex items-center gap-2 mb-2.5">
          <span
            className="material-symbols-outlined text-teal-400 leading-none"
            style={{ fontSize: '14px', fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
          >
            schedule
          </span>
          <h3 className="text-[10px] font-label font-bold uppercase tracking-[0.12em] text-on-surface-variant">
            Performance
          </h3>
        </div>
        <div className="bg-surface-container/20 rounded-xl border border-outline-variant/8 px-3 py-1 divide-y divide-outline-variant/5">
          <div className="flex justify-between items-baseline py-1.5">
            <span className="text-[10px] text-outline">Expected Delay</span>
            <span className="text-[11px] mono font-bold text-on-surface">
              {Number(route.expected_delay_hours ?? 0) > 0.1
                ? `+${Number(route.expected_delay_hours).toFixed(1)}h`
                : 'On time'}
            </span>
          </div>
          <div className="flex justify-between items-baseline py-1.5">
            <span className="text-[10px] text-outline">Delay Probability</span>
            <span className="text-[11px] mono font-bold text-on-surface">
              {route.delay_prob != null ? `${Math.round(Number(route.delay_prob) * 100)}%` : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between items-baseline py-1.5">
            <span className="text-[10px] text-outline">Reliability Score</span>
            <span className={`text-[11px] mono font-bold ${reliability >= 0.7 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {Math.round(reliability * 100)}% — {reliabilityLabel(reliability)}
            </span>
          </div>
        </div>
      </section>

      {/* Explanation */}
      {dynamicExplanation ? (
        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <span
              className="material-symbols-outlined text-teal-400 leading-none"
              style={{ fontSize: '14px', fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
            >
              lightbulb
            </span>
            <h3 className="text-[10px] font-label font-bold uppercase tracking-[0.12em] text-on-surface-variant">
              Route Insights
            </h3>
          </div>
          <div className="bg-surface-container/20 rounded-xl border border-outline-variant/8 p-3">
            <ul className="space-y-1.5 text-[11px] text-on-surface-variant leading-relaxed">
              {dynamicExplanation
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean)
                .map((line, i) => (
                  <li key={`${line}-${i}`} className="flex gap-2">
                    <span className="text-teal-400/70 shrink-0">•</span>
                    <span>{line.replace(/^[-*]\s*/, '')}</span>
                  </li>
                ))}
            </ul>
          </div>
        </section>
      ) : (
        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <span
              className="material-symbols-outlined text-teal-400 leading-none"
              style={{ fontSize: '14px', fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
            >
              lightbulb
            </span>
            <h3 className="text-[10px] font-label font-bold uppercase tracking-[0.12em] text-on-surface-variant">
              Route Insights
            </h3>
          </div>
          <div className="bg-surface-container/20 rounded-xl border border-outline-variant/8 p-3 flex items-center justify-between">
            <span className="text-[11px] text-on-surface-variant">No insights available yet.</span>
            <button 
              onClick={handleExplain} 
              disabled={isLoadingExplanation} 
              className="px-3 py-1.5 bg-teal-500/10 text-teal-400 text-[10px] rounded hover:bg-teal-500/20 transition disabled:opacity-50 font-medium"
            >
              {isLoadingExplanation ? 'Analyzing...' : 'Analyze with AI'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// ── Main Results Component ────────────────────────────────────────────

export default function WaterRouteResults() {
  const routes = useLogiFlowStore((s) => s.waterRoutes);
  const selected = useLogiFlowStore((s) => s.selectedWaterRoute);
  const setSelected = useLogiFlowStore((s) => s.setSelectedWaterRoute);
  const source = useLogiFlowStore((s) => s.source);
  const destination = useLogiFlowStore((s) => s.destination);

  if (!routes || routes.length === 0) return null;

  const safeIndex = Math.min(Math.max(selected, 0), routes.length - 1);
  const active = routes[safeIndex];

  const minCost = Math.min(...routes.map((r) => Number(r.cost)));
  const minTime = Math.min(...routes.map((r) => Number(r.time)));
  const minRisk = Math.min(...routes.map((r) => Number(r.risk)));

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-5">
        <div>
          <div className="text-[10px] font-label font-bold uppercase tracking-[0.12em] text-outline flex items-center gap-1.5">
            <span
              className="material-symbols-outlined text-teal-400"
              style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
            >
              directions_boat
            </span>
            Maritime Analysis
          </div>
          <div className="text-sm font-semibold text-on-surface mt-0.5">
            {routes.length} route{routes.length !== 1 ? 's' : ''} found
          </div>
        </div>
        <div className="text-[10px] mono text-on-surface-variant">
          {source} → {destination}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Route cards */}
        <div className="lg:col-span-1 space-y-4 max-h-[80vh] overflow-y-auto pr-1 overscroll-y-contain [scrollbar-gutter:stable]">
          {/* Summary bar */}
          <div className="rounded-2xl border border-outline-variant/12 bg-surface-container/20 p-4 text-[12px] text-on-surface-variant space-y-1.5">
            <div className="text-[9px] font-label font-bold uppercase tracking-[0.14em] text-outline mb-2">
              Best of {routes.length} routes
            </div>
            <div className="flex gap-2">
              <span className="text-emerald-400 shrink-0">→</span>
              <span>Lowest cost: <span className="mono text-on-surface">₹{fmt(minCost)}</span></span>
            </div>
            <div className="flex gap-2">
              <span className="text-amber-400 shrink-0">→</span>
              <span>Fastest: <span className="mono text-on-surface">{minTime.toFixed(1)}h</span></span>
            </div>
            <div className="flex gap-2">
              <span className="text-teal-400 shrink-0">→</span>
              <span>Safest: <span className="mono text-on-surface">{Math.round(minRisk * 100)}% risk</span></span>
            </div>
          </div>

          {routes.map((r, i) => (
            <WaterRouteCard
              key={`${i}-${r.origin_port ?? ''}-${r.destination_port ?? ''}-${r.cost}`}
              route={r}
              index={i}
              isSelected={i === safeIndex}
              onSelect={() => setSelected(i)}
              isCheapest={Number(r.cost) === minCost}
              isFastest={Number(r.time) === minTime}
              isSafest={Number(r.risk) === minRisk}
              source={source}
              destination={destination}
            />
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 lg:sticky lg:top-4">
          <div className="bg-surface-container-lowest/25 border border-teal-400/10 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-outline-variant/8 shrink-0">
              <span
                className="material-symbols-outlined text-teal-400"
                style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
              >
                anchor
              </span>
              <span className="text-[10px] font-label font-bold uppercase tracking-[0.12em] text-outline">
                Route {safeIndex + 1} Detail
              </span>
              <span className="ml-auto mono text-[10px] text-teal-400 font-bold">
                ₹{fmt(active.cost)} · {Number(active.time).toFixed(1)}h
              </span>
            </div>
            <DetailPanel route={active} source={source} destination={destination} />
          </div>
        </div>
      </div>
    </section>
  );
}
