'use client';

import React, { useMemo, useState } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { fetchExplanation, type WaterRoute } from '@/services/api';
import { WATER_PORTS, WATER_PORT_REGION_COUNT } from '@/lib/water-ports';

function fmt(val: unknown) {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('en-IN').format(Math.round(n));
}

function riskLabel(risk: number): string {
  if (risk < 0.25) return 'Low risk';
  if (risk < 0.5) return 'Moderate risk';
  return 'High risk';
}

function reliabilityLabel(score: number): string {
  if (score >= 0.85) return 'Excellent';
  if (score >= 0.7) return 'Good';
  if (score >= 0.5) return 'Fair';
  return 'Limited';
}

function routeKey(route: WaterRoute) {
  return `${route.origin_port ?? ''}-${route.destination_port ?? ''}-${route.cost}-${route.time}-${route.risk}`;
}

function stopsLabel(route: WaterRoute) {
  const stops = Number(route.transshipments ?? 0);
  if (stops <= 0) return 'Direct';
  return `${stops} transshipment${stops === 1 ? '' : 's'}`;
}

function whyThisRoute(route: WaterRoute, minCost: number, minTime: number, minRisk: number) {
  const reasons: string[] = [];
  if (Number(route.cost) === minCost) reasons.push('lowest cost');
  if (Number(route.time) === minTime) reasons.push('fastest transit');
  if (Number(route.risk) === minRisk) reasons.push('lowest risk');
  if (reasons.length) return `Best match for ${reasons.join(', ')} among the returned maritime options.`;
  return `${stopsLabel(route)} with ${riskLabel(Number(route.risk ?? 0)).toLowerCase()} and ${reliabilityLabel(Number(route.reliability_score ?? 0)).toLowerCase()} reliability.`;
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'teal' | 'green' | 'amber' | 'blue' }) {
  const classes = {
    neutral: 'border-outline-variant/15 bg-surface-container-lowest/40 text-on-surface-variant',
    teal: 'border-teal-400/25 bg-teal-500/10 text-teal-300',
    green: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300',
    amber: 'border-amber-400/20 bg-amber-500/10 text-amber-200',
    blue: 'border-blue-400/20 bg-blue-500/10 text-blue-200',
  };
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${classes[tone]}`}>
      {children}
    </span>
  );
}

function Metric({
  label,
  value,
  tone = 'text-teal-300',
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-outline-variant/10 bg-surface-container-lowest/35 px-3 py-2">
      <div className="text-[9px] font-label font-bold uppercase tracking-[0.12em] text-outline">{label}</div>
      <div className={`mt-1 mono text-sm font-black tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function WaterRouteCard({
  route,
  index,
  isSelected,
  onSelect,
  isCheapest,
  isFastest,
  isSafest,
}: {
  route: WaterRoute;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  isCheapest: boolean;
  isFastest: boolean;
  isSafest: boolean;
}) {
  const risk = Number(route.risk ?? 0);

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
      className={[
        'w-full rounded-2xl border p-4 text-left transition-all duration-200',
        isSelected
          ? 'border-teal-400/50 bg-teal-500/10 shadow-[0_0_0_2px_rgba(45,212,191,0.10)]'
          : 'border-outline-variant/12 bg-surface-container-lowest/30 hover:border-teal-400/25 hover:bg-surface-container/30',
      ].join(' ')}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-label font-bold uppercase tracking-[0.14em] text-outline">
            Route {index + 1}
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-on-surface">
            {route.origin_port ?? 'Origin port'} → {route.destination_port ?? 'Destination port'}
          </div>
        </div>
        {index === 0 ? <Badge tone="teal">Top pick</Badge> : null}
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Metric label="Cost" value={`₹${fmt(route.cost)}`} tone="text-emerald-300" />
        <Metric label="Time" value={`${Number(route.time).toFixed(1)}h`} tone="text-amber-200" />
        <Metric label="Risk" value={`${Math.round(risk * 100)}%`} tone={risk < 0.25 ? 'text-emerald-300' : risk < 0.5 ? 'text-amber-200' : 'text-red-300'} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge tone={Number(route.transshipments ?? 0) <= 0 ? 'green' : 'neutral'}>{stopsLabel(route)}</Badge>
        <Badge tone={risk < 0.25 ? 'green' : risk < 0.5 ? 'amber' : 'neutral'}>{riskLabel(risk)}</Badge>
        {isCheapest ? <Badge tone="green">Best cost</Badge> : null}
        {isFastest ? <Badge tone="amber">Fastest</Badge> : null}
        {isSafest ? <Badge tone="blue">Safest</Badge> : null}
      </div>
    </button>
  );
}

function DetailDisclosure({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest/25 px-3 py-2">
      <summary className="cursor-pointer text-[10px] font-label font-bold uppercase tracking-[0.14em] text-on-surface-variant">
        {title}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function DetailPanel({
  route,
  source,
  destination,
  minCost,
  minTime,
  minRisk,
}: {
  route: WaterRoute;
  source: string;
  destination: string;
  minCost: number;
  minTime: number;
  minRisk: number;
}) {
  const priority = useLogiFlowStore((s) => s.priority);
  const [explanation, setExplanation] = useState<{ key: string; text: string } | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const currentKey = routeKey(route);
  const activeExplanation = explanation?.key === currentKey ? explanation.text : null;
  const risk = Number(route.risk ?? 0);
  const reliability = Number(route.reliability_score ?? 0);
  const delay = Number(route.expected_delay_hours ?? 0);

  const handleExplain = async () => {
    setLoadingExplanation(true);
    const text = await fetchExplanation({ pipeline: 'water', priority, route_data: route });
    if (text) setExplanation({ key: currentKey, text });
    setLoadingExplanation(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-teal-400/15 bg-teal-500/5 p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-label font-bold uppercase tracking-[0.14em] text-teal-300">
              Why this route
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-on-surface">
              {whyThisRoute(route, minCost, minTime, minRisk)}
            </p>
          </div>
          <Badge tone="teal">{stopsLabel(route)}</Badge>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Metric label="Cost" value={`₹${fmt(route.cost)}`} tone="text-emerald-300" />
          <Metric label="Time" value={`${Number(route.time).toFixed(1)}h`} tone="text-amber-200" />
          <Metric label="Risk" value={`${Math.round(risk * 100)}%`} tone={risk < 0.25 ? 'text-emerald-300' : risk < 0.5 ? 'text-amber-200' : 'text-red-300'} />
        </div>
      </div>

      <div className="rounded-xl border border-outline-variant/10 bg-surface-container/20 p-3">
        <div className="text-[10px] font-label font-bold uppercase tracking-[0.14em] text-outline">
          Port lane
        </div>
        <div className="mt-1 text-sm font-semibold text-on-surface">
          {route.origin_port ?? source} → {route.destination_port ?? destination}
        </div>
        <div className="mt-1 text-[11px] text-on-surface-variant">
          {route.distance_nm != null ? `${Number(route.distance_nm).toFixed(0)} nautical miles · ` : ''}
          {reliabilityLabel(reliability)} reliability
          {delay > 0.1 ? ` · +${delay.toFixed(1)}h expected delay` : ' · no major expected delay'}
        </div>
      </div>

      {route.segments?.length ? (
        <DetailDisclosure title="Route segments">
          <div className="space-y-1.5">
            {route.segments.map((segment, index) => (
              <div
                key={`${index}-${segment.from}-${segment.to}`}
                className="flex items-center gap-2 rounded-lg border border-outline-variant/8 bg-surface-container/20 px-2.5 py-2 text-[11px]"
              >
                <span className="mono text-[9px] uppercase text-outline">{segment.mode}</span>
                <span className="truncate text-on-surface">{segment.from}</span>
                <span className="material-symbols-outlined text-outline" style={{ fontSize: '11px' }}>
                  arrow_forward
                </span>
                <span className="truncate text-on-surface">{segment.to}</span>
              </div>
            ))}
          </div>
        </DetailDisclosure>
      ) : null}

      {route.risk_breakdown && Object.keys(route.risk_breakdown).length > 0 ? (
        <DetailDisclosure title="Risk and performance">
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(route.risk_breakdown).map(([key, value]) => (
              <div key={key} className="flex justify-between rounded-lg bg-surface-container/25 px-3 py-2 text-[11px]">
                <span className="capitalize text-on-surface-variant">{key.replace(/_/g, ' ')}</span>
                <span className="mono font-bold text-on-surface">{Math.round(Number(value) * 100)}%</span>
              </div>
            ))}
            <div className="flex justify-between rounded-lg bg-surface-container/25 px-3 py-2 text-[11px]">
              <span className="text-on-surface-variant">Delay probability</span>
              <span className="mono font-bold text-on-surface">
                {route.delay_prob != null ? `${Math.round(Number(route.delay_prob) * 100)}%` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between rounded-lg bg-surface-container/25 px-3 py-2 text-[11px]">
              <span className="text-on-surface-variant">Reliability score</span>
              <span className="mono font-bold text-emerald-300">{Math.round(reliability * 100)}%</span>
            </div>
          </div>
        </DetailDisclosure>
      ) : null}

      <DetailDisclosure title="AI route explanation">
        {activeExplanation ? (
          <ul className="space-y-1.5 text-[11px] leading-relaxed text-on-surface-variant">
            {activeExplanation
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line, index) => (
                <li key={`${line}-${index}`} className="flex gap-2">
                  <span className="text-teal-400/70">•</span>
                  <span>{line.replace(/^[-*]\s*/, '')}</span>
                </li>
              ))}
          </ul>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] text-on-surface-variant">
              Generate this only when you need deeper reasoning.
            </span>
            <button
              type="button"
              onClick={handleExplain}
              disabled={loadingExplanation}
              className="rounded-lg bg-teal-500/10 px-3 py-1.5 text-[10px] font-semibold text-teal-300 transition hover:bg-teal-500/20 disabled:opacity-50"
            >
              {loadingExplanation ? 'Analyzing...' : 'Analyze route'}
            </button>
          </div>
        )}
      </DetailDisclosure>
    </div>
  );
}

export default function WaterRouteResults() {
  const routes = useLogiFlowStore((s) => s.waterRoutes);
  const selected = useLogiFlowStore((s) => s.selectedWaterRoute);
  const setSelected = useLogiFlowStore((s) => s.setSelectedWaterRoute);
  const source = useLogiFlowStore((s) => s.source);
  const destination = useLogiFlowStore((s) => s.destination);

  const safeIndex = Math.min(Math.max(selected, 0), Math.max(routes.length - 1, 0));
  const active = routes[safeIndex];

  const stats = useMemo(() => {
    if (!routes.length) return null;
    return {
      minCost: Math.min(...routes.map((route) => Number(route.cost))),
      minTime: Math.min(...routes.map((route) => Number(route.time))),
      minRisk: Math.min(...routes.map((route) => Number(route.risk))),
    };
  }, [routes]);

  if (!routes.length || !active || !stats) return null;

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-label font-bold uppercase tracking-[0.12em] text-outline">
            <span className="material-symbols-outlined text-teal-400" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>
              directions_boat
            </span>
            Maritime routes
          </div>
          <div className="mt-0.5 text-sm font-semibold text-on-surface">
            {routes.length} option{routes.length !== 1 ? 's' : ''} for {source} → {destination}
          </div>
        </div>
        <div className="rounded-full border border-outline-variant/15 bg-surface-container-lowest/35 px-3 py-1 text-[10px] text-on-surface-variant">
          Static global port network · {WATER_PORTS.length} ports / {WATER_PORT_REGION_COUNT} regions · not live AIS
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        <div className="space-y-3 lg:col-span-1 lg:max-h-[80vh] lg:overflow-y-auto lg:pr-1 [scrollbar-gutter:stable]">
          <div className="rounded-2xl border border-outline-variant/12 bg-surface-container/20 p-4">
            <div className="text-[9px] font-label font-bold uppercase tracking-[0.14em] text-outline">
              Quick read
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-on-surface-variant">
              Route {safeIndex + 1} is selected. Open details only when you need segments, risk breakdown, or AI reasoning.
            </p>
          </div>

          {routes.map((route, index) => (
            <WaterRouteCard
              key={routeKey(route)}
              route={route}
              index={index}
              isSelected={index === safeIndex}
              onSelect={() => setSelected(index)}
              isCheapest={Number(route.cost) === stats.minCost}
              isFastest={Number(route.time) === stats.minTime}
              isSafest={Number(route.risk) === stats.minRisk}
            />
          ))}
        </div>

        <div className="lg:sticky lg:top-4 lg:col-span-2">
          <div className="rounded-2xl border border-teal-400/10 bg-surface-container-lowest/25 p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 border-b border-outline-variant/8 pb-3">
              <span className="material-symbols-outlined text-teal-400" style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>
                anchor
              </span>
              <span className="text-[10px] font-label font-bold uppercase tracking-[0.12em] text-outline">
                Selected route
              </span>
              <span className="ml-auto mono text-[10px] font-bold text-teal-300">
                Route {safeIndex + 1}
              </span>
            </div>
            <DetailPanel
              route={active}
              source={source}
              destination={destination}
              minCost={stats.minCost}
              minTime={stats.minTime}
              minRisk={stats.minRisk}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
