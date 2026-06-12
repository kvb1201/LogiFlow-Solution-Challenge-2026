'use client';

import dynamic from 'next/dynamic';
import React, { useMemo, useState } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { fetchExplanation, type WaterRoute } from '@/services/api';
import { useWaterPortCatalog } from '@/hooks/useWaterPortCatalog';
import type { WaterPortOption } from '@/lib/water-port-catalog';
import { classifyWaterNoRoute, isWaterNoRouteMessage } from '@/lib/water-no-route';
import { SaveReportModal } from '@/components/planner/SaveReportModal';

const SeaMapView = dynamic(() => import('@/components/SeaMapView'), { ssr: false });

// ── Formatting helpers ────────────────────────────────────────────────

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

function riskTone(risk: number) {
  if (risk < 0.25) return { text: 'text-emerald-300', badge: 'green' as const };
  if (risk < 0.5) return { text: 'text-amber-200', badge: 'amber' as const };
  return { text: 'text-red-300', badge: 'neutral' as const };
}

function reliabilityLabel(score: number): string {
  if (score >= 0.85) return 'Excellent';
  if (score >= 0.7) return 'Good';
  if (score >= 0.5) return 'Fair';
  return 'Limited';
}

function reliabilityTone(score: number): string {
  if (score >= 0.85) return 'text-emerald-300';
  if (score >= 0.7) return 'text-teal-300';
  if (score >= 0.5) return 'text-amber-200';
  return 'text-red-300';
}

function routeKey(route: WaterRoute) {
  return `${route.origin_port ?? ''}-${route.destination_port ?? ''}-${route.cost}-${route.time}-${route.risk}`;
}

function stopsLabel(route: WaterRoute) {
  const stops = Number(route.transshipments ?? 0);
  if (stops <= 0) return 'Direct';
  return `${stops} stop${stops === 1 ? '' : 's'}`;
}

/** Detect which regions a route spans based on port names */
function routeRegions(route: WaterRoute, ports: WaterPortOption[]): string[] {
  const regionMap: Record<string, string> = {};
  for (const port of ports) regionMap[port.name] = port.region;
  const regions = new Set<string>();
  for (const seg of route.segments ?? []) {
    if (seg.mode === 'Water') {
      const fromRegion = regionMap[seg.from];
      const toRegion = regionMap[seg.to];
      if (fromRegion) regions.add(fromRegion);
      if (toRegion) regions.add(toRegion);
    }
  }
  return [...regions];
}

function whyThisRoute(route: WaterRoute, minCost: number, minTime: number, minRisk: number) {
  if (route.reason) return route.reason;
  const reasons: string[] = [];
  if (Number(route.cost) === minCost) reasons.push('lowest cost');
  if (Number(route.time) === minTime) reasons.push('fastest transit');
  if (Number(route.risk) === minRisk) reasons.push('lowest risk');
  if (reasons.length) return `Best match for ${reasons.join(', ')} among the returned maritime options.`;
  return `${stopsLabel(route)} with ${riskLabel(Number(route.risk ?? 0)).toLowerCase()} and ${reliabilityLabel(Number(route.reliability_score ?? 0)).toLowerCase()} reliability.`;
}

// ── UI atoms ──────────────────────────────────────────────────────────

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'teal' | 'green' | 'amber' | 'blue' | 'red' }) {
  const classes = {
    neutral: 'border-outline-variant/15 bg-surface-container-lowest/40 text-on-surface-variant',
    teal: 'border-teal-400/25 bg-teal-500/10 text-teal-300',
    green: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300',
    amber: 'border-amber-400/20 bg-amber-500/10 text-amber-200',
    blue: 'border-blue-400/20 bg-blue-500/10 text-blue-200',
    red: 'border-red-400/20 bg-red-500/10 text-red-300',
  };
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${classes[tone]}`}>
      {children}
    </span>
  );
}

function Metric({ icon, label, value, unit, tone = 'text-teal-300' }: {
  icon: string; label: string; value: React.ReactNode; unit?: string; tone?: string;
}) {
  return (
    <div className="flex flex-col min-w-0 rounded-lg border border-outline-variant/10 bg-surface-container-lowest/35 px-3 py-2" style={{ minWidth: '76px' }}>
      <div className="flex items-center gap-1 text-[9px] font-label font-bold uppercase tracking-[0.12em] text-outline leading-snug min-w-0 overflow-hidden text-ellipsis">
        <span className="material-symbols-outlined shrink-0" style={{ fontSize: '12px' }}>{icon}</span>
        <span className="overflow-hidden text-ellipsis">{label}</span>
      </div>
      <div className={`mt-1 flex items-baseline gap-0.5 whitespace-nowrap ${tone}`}>
        <span className="mono text-sm font-bold tabular-nums">{value}</span>
        {unit && <span className="ml-0.5 text-[10px] font-medium text-outline shrink-0">{unit}</span>}
      </div>
    </div>
  );
}

function DetailDisclosure({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest/25 px-3 py-2">
      <summary className="cursor-pointer text-[10px] font-label font-bold uppercase tracking-[0.14em] text-on-surface-variant select-none">
        {title}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

// ── Transit source badge ──────────────────────────────────────────────

function TransitSourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  const config = {
    ml_model: { label: 'ML model', icon: 'smart_toy', tone: 'bg-violet-500/10 border-violet-400/25 text-violet-300' },
    observed: { label: 'Observed data', icon: 'satellite_alt', tone: 'bg-teal-500/10 border-teal-400/25 text-teal-300' },
    heuristic: { label: 'Estimated', icon: 'calculate', tone: 'bg-outline-variant/10 border-outline-variant/20 text-on-surface-variant' },
  }[source] ?? { label: source, icon: 'info', tone: 'bg-outline-variant/10 border-outline-variant/20 text-on-surface-variant' };
  return (
    <span title={`ETA confidence: ${config.label}`} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${config.tone}`}>
      <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>{config.icon}</span>
      {config.label}
    </span>
  );
}

// ── Risk breakdown bars ───────────────────────────────────────────────

const RISK_COMPONENT_COLORS: Record<string, string> = {
  weather:       'bg-sky-500',
  congestion:    'bg-amber-500',
  security:      'bg-red-500',
  transshipment: 'bg-violet-500',
  chokepoint:    'bg-orange-500',
  disruption:    'bg-rose-600',
};

const RISK_COMPONENT_ICONS: Record<string, string> = {
  weather:       'thunderstorm',
  congestion:    'traffic',
  security:      'security',
  transshipment: 'swap_horiz',
  chokepoint:    'warning',
  disruption:    'crisis_alert',
};

function RiskBreakdownBars({ breakdown }: { breakdown: Record<string, number> }) {
  const entries = Object.entries(breakdown).sort(([, a], [, b]) => b - a);
  if (!entries.length) return null;
  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => {
        const pct = Math.round(Number(value) * 100);
        const color = RISK_COMPONENT_COLORS[key] ?? 'bg-teal-500';
        const icon = RISK_COMPONENT_ICONS[key] ?? 'bar_chart';
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="material-symbols-outlined text-outline/60 shrink-0" style={{ fontSize: '12px' }}>{icon}</span>
            <span className="w-20 shrink-0 text-[10px] capitalize text-on-surface-variant">{key.replace(/_/g, ' ')}</span>
            <div className="flex-1 rounded-full bg-surface-container/40 h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full ${color} opacity-80 transition-all duration-500`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
            <span className="w-8 text-right mono text-[10px] font-bold text-on-surface">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Marine conditions badges ──────────────────────────────────────────

function MarineConditionsBadges({ conditions }: { conditions?: WaterRoute['marine_conditions'] }) {
  if (!conditions) return null;
  const waveH = conditions.wave_height_max_m;
  const windK = conditions.wind_speed_mean_kn;
  const storm = conditions.storm_flag;
  const current = conditions.ocean_current_max_kmh;

  function waveTone(h: number) {
    if (h < 1.0) return 'green';
    if (h < 2.5) return 'amber';
    return 'red';
  }
  function windTone(k: number) {
    if (k < 17) return 'green';
    if (k < 33) return 'amber';
    return 'red';
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {waveH != null && (
        <Badge tone={waveTone(waveH) as 'green' | 'amber' | 'red'}>
          <span className="material-symbols-outlined mr-0.5" style={{ fontSize: '10px' }}>waves</span>
          {waveH.toFixed(1)}m waves
        </Badge>
      )}
      {windK != null && (
        <Badge tone={windTone(windK) as 'green' | 'amber' | 'red'}>
          <span className="material-symbols-outlined mr-0.5" style={{ fontSize: '10px' }}>air</span>
          {windK.toFixed(0)} kn wind
        </Badge>
      )}
      {storm && (
        <Badge tone="red">
          <span className="material-symbols-outlined mr-0.5" style={{ fontSize: '10px' }}>thunderstorm</span>
          Storm
        </Badge>
      )}
      {current != null && current > 5 && (
        <Badge tone="neutral">
          <span className="material-symbols-outlined mr-0.5" style={{ fontSize: '10px' }}>water</span>
          {current.toFixed(0)} km/h current
        </Badge>
      )}
    </div>
  );
}

// ── Chokepoints path ──────────────────────────────────────────────────

function ChokepointsPath({
  chokepoints,
  riskBreakdown,
}: {
  chokepoints?: string[];
  riskBreakdown?: Record<string, number>;
}) {
  if (!chokepoints?.length) return null;
  const stress = riskBreakdown?.chokepoint ?? 0;
  function stressTone(s: number): 'green' | 'amber' | 'red' {
    if (s < 0.25) return 'green';
    if (s < 0.6) return 'amber';
    return 'red';
  }
  const tone = stressTone(stress);
  const toneClass = tone === 'green' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400' : 'text-red-400';
  const lineCls = tone === 'green' ? 'bg-emerald-500/30' : tone === 'amber' ? 'bg-amber-500/30' : 'bg-red-500/30';

  return (
    <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest/25 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-outline">
        <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>warning</span>
        Chokepoints transited
        <span className={`ml-auto mono text-[9px] ${toneClass}`}>{Math.round(stress * 100)}% stress</span>
      </div>
      <div className="flex flex-wrap items-center gap-0">
        {chokepoints.map((cp, i) => (
          <React.Fragment key={cp}>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              tone === 'green' ? 'border-emerald-400/20 bg-emerald-500/8 text-emerald-300' :
              tone === 'amber' ? 'border-amber-400/20 bg-amber-500/8 text-amber-200' :
              'border-red-400/20 bg-red-500/8 text-red-300'
            }`}>
              <span className="material-symbols-outlined" style={{ fontSize: '10px', fontVariationSettings: "'FILL' 1" }}>anchor</span>
              {cp}
            </span>
            {i < chokepoints.length - 1 && (
              <span className={`mx-1 h-px w-4 rounded-full ${lineCls}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Active disruptions ────────────────────────────────────────────────

function ActiveDisruptions({ disruptions }: { disruptions?: WaterRoute['active_disruptions'] }) {
  const [open, setOpen] = useState(false);
  if (!disruptions?.length) return null;

  const redCount = disruptions.filter(d => d.alert === 'RED').length;
  const orangeCount = disruptions.filter(d => d.alert === 'ORANGE').length;
  const headerTone = redCount > 0 ? 'border-red-400/25 bg-red-500/8' : 'border-amber-400/20 bg-amber-500/8';
  const headerText = redCount > 0 ? 'text-red-300' : 'text-amber-200';

  return (
    <div className={`rounded-xl border ${headerTone} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left ${headerText}`}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>crisis_alert</span>
        <span className="flex-1 text-[10px] font-label font-bold uppercase tracking-[0.14em]">
          Active disruptions
          {redCount > 0 && <span className="ml-2 text-red-300">{redCount} RED</span>}
          {orangeCount > 0 && <span className="ml-2 text-amber-200">{orangeCount} ORANGE</span>}
        </span>
        <span className="material-symbols-outlined text-[12px]">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && (
        <div className="divide-y divide-outline-variant/10 border-t border-outline-variant/10">
          {disruptions.map((d, i) => (
            <div key={`${d.event_id}-${i}`} className="px-3 py-2 flex items-start gap-2">
              <span className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase ${
                d.alert === 'RED' ? 'bg-red-500/20 text-red-300' :
                d.alert === 'ORANGE' ? 'bg-amber-500/15 text-amber-200' :
                'bg-emerald-500/10 text-emerald-300'
              }`}>{d.alert}</span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-on-surface truncate">{d.event_name || d.event_type}</p>
                <p className="text-[10px] text-on-surface-variant">{d.country} · {d.year}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Water Route Card ──────────────────────────────────────────────────

function WaterRouteCard({
  route, index, isSelected, onSelect, isCheapest, isFastest, isSafest, ports,
}: {
  route: WaterRoute; index: number; isSelected: boolean; onSelect: () => void;
  isCheapest: boolean; isFastest: boolean; isSafest: boolean;
  ports: WaterPortOption[];
}) {
  const risk = Number(route.risk ?? 0);
  const reliability = Number(route.reliability_score ?? 0);
  const distanceNm = Number(route.distance_nm ?? 0);
  const transshipments = Number(route.transshipments ?? 0);
  const rt = riskTone(risk);
  const regions = routeRegions(route, ports);
  const hasDisruptions = (route.active_disruptions?.length ?? 0) > 0;
  const hasStorm = route.marine_conditions?.storm_flag;

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
      className={[
        'w-full rounded-xl border text-left transition-all duration-200 overflow-hidden',
        isSelected
          ? 'border-teal-400/50 bg-teal-500/10 shadow-[0_0_0_2px_rgba(45,212,191,0.10)]'
          : 'border-outline-variant/12 bg-surface-container-lowest/30 hover:border-teal-400/25 hover:bg-surface-container/30',
      ].join(' ')}
    >
      {/* Summary bar */}
      <div className="px-4 py-2 bg-surface-container/25 border-b border-outline-variant/8">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-[10px] leading-relaxed text-on-surface-variant mono truncate">
            {route.origin_port ?? 'Origin'} → {route.destination_port ?? 'Dest'}
            {distanceNm > 0 ? ` · ${distanceNm.toFixed(0)} nm` : ''}
            {` · ${stopsLabel(route)}`}
          </p>
          <TransitSourceBadge source={route.transit_days_source} />
        </div>
      </div>

      <div className="p-4">
        {/* Header */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={['w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold mono shrink-0',
              isSelected ? 'bg-teal-500 text-white' : 'bg-surface-container text-outline'].join(' ')}>
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-label font-bold uppercase tracking-[0.12em] text-on-surface-variant">
                Route {index + 1}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {index === 0 && <Badge tone="teal">Top pick</Badge>}
                {isCheapest && <Badge tone="green">₹ Lowest</Badge>}
                {isFastest && <Badge tone="amber">Fastest</Badge>}
                {isSafest && <Badge tone="blue">Safest</Badge>}
                {isSelected && <Badge tone="teal">Selected</Badge>}
                {hasDisruptions && <Badge tone="red">⚠ Disruption</Badge>}
                {hasStorm && <Badge tone="amber">🌩 Storm</Badge>}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[15px] font-black mono text-teal-300 leading-tight whitespace-nowrap">₹{fmt(route.cost)}</div>
          </div>
        </div>

        {/* Core metrics */}
        <div className="mb-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(76px, 1fr))' }}>
          <Metric icon="schedule" label="Time" value={Number(route.time).toFixed(1)} unit="hrs" tone="text-amber-200" />
          <Metric icon="savings" label="Cost" value={`₹${fmt(route.cost)}`} tone="text-emerald-300" />
          <Metric icon="shield" label="Risk" value={`${Math.round(risk * 100)}%`} tone={rt.text} />
          <Metric icon="straighten" label="Distance" value={distanceNm > 0 ? distanceNm.toFixed(0) : '—'} unit="nm" tone="text-teal-300" />
        </div>

        {/* Marine conditions quick glance */}
        {route.marine_conditions && (
          <div className="mb-2">
            <MarineConditionsBadges conditions={route.marine_conditions} />
          </div>
        )}

        {/* Quick-glance pills */}
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={transshipments <= 0 ? 'green' : transshipments <= 2 ? 'neutral' : 'amber'}>{stopsLabel(route)}</Badge>
          <Badge tone={rt.badge}>{riskLabel(risk)}</Badge>
          {reliability > 0 && (
            <Badge tone={reliability >= 0.7 ? 'green' : 'neutral'}>
              {reliabilityLabel(reliability)} reliability
            </Badge>
          )}
          {regions.length > 1 && <Badge tone="blue">{regions.length} regions</Badge>}
        </div>
      </div>
    </button>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────

function DetailPanel({
  route, source, destination, minCost, minTime, minRisk, onSave, ports,
}: {
  route: WaterRoute; source: string; destination: string;
  minCost: number; minTime: number; minRisk: number; onSave?: () => void;
  ports: WaterPortOption[];
}) {
  const priority = useLogiFlowStore((s) => s.priority);
  const [explanation, setExplanation] = useState<{ key: string; text: string } | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const currentKey = routeKey(route);
  const activeExplanation = explanation?.key === currentKey ? explanation.text : null;
  const risk = Number(route.risk ?? 0);
  const reliability = Number(route.reliability_score ?? 0);
  const delay = Number(route.expected_delay_hours ?? 0);
  const distanceNm = Number(route.distance_nm ?? 0);
  const transshipments = Number(route.transshipments ?? 0);
  const regions = routeRegions(route, ports);
  const rt = riskTone(risk);
  const factors = Array.isArray(route.key_factors) ? route.key_factors : [];

  const handleExplain = async () => {
    setLoadingExplanation(true);
    const text = await fetchExplanation({ pipeline: 'water', priority, route_data: route });
    if (text) setExplanation({ key: currentKey, text });
    setLoadingExplanation(false);
  };

  const bd = route.cost_breakdown;

  return (
    <div className="space-y-4">
      {/* Why this route */}
      <div className="rounded-xl border border-teal-400/15 bg-teal-500/5 p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-label font-bold uppercase tracking-[0.14em] text-teal-300">
              Why this route
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-on-surface">
              {whyThisRoute(route, minCost, minTime, minRisk)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="teal">{stopsLabel(route)}</Badge>
            <TransitSourceBadge source={route.transit_days_source} />
            {onSave && (
              <button onClick={onSave}
                className="flex items-center gap-1.5 rounded-xl bg-teal-500/10 border border-teal-400/30 px-3 py-1.5 text-xs font-semibold text-teal-400 hover:bg-teal-500/20 transition-all">
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>save</span>
                Save Report
              </button>
            )}
          </div>
        </div>
        {factors.length > 0 && (
          <ul className="mt-2 space-y-1 text-[11px] text-on-surface-variant">
            {factors.map((f, i) => (
              <li key={`${f}-${i}`} className="flex gap-2">
                <span className="text-teal-400/70 shrink-0">•</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Expanded metrics */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric icon="savings" label="Cost" value={`₹${fmt(route.cost)}`} tone="text-emerald-300" />
        <Metric icon="schedule" label="Time" value={`${Number(route.time).toFixed(1)}h`} tone="text-amber-200" />
        <Metric icon="shield" label="Risk" value={`${Math.round(risk * 100)}%`} tone={rt.text} />
        <Metric icon="straighten" label="Distance" value={distanceNm > 0 ? `${distanceNm.toFixed(0)}` : '—'} unit="nm" tone="text-teal-300" />
        <Metric icon="swap_horiz" label="Stops" value={transshipments} tone={transshipments === 0 ? 'text-emerald-300' : 'text-on-surface'} />
        <Metric icon="verified" label="Reliability" value={`${Math.round(reliability * 100)}%`} tone={reliabilityTone(reliability)} />
      </div>

      {/* Marine conditions */}
      {route.marine_conditions && (
        <div className="rounded-xl border border-sky-400/15 bg-sky-500/5 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-sky-300">
            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>waves</span>
            Sea conditions
            {route.marine_conditions.weather_source && (
              <span className="ml-auto text-outline font-normal normal-case tracking-normal">
                via {route.marine_conditions.weather_source}
              </span>
            )}
          </div>
          <MarineConditionsBadges conditions={route.marine_conditions} />
        </div>
      )}

      {/* Active disruptions */}
      <ActiveDisruptions disruptions={route.active_disruptions} />

      {/* Chokepoints path */}
      <ChokepointsPath
        chokepoints={route.chokepoints_transited}
        riskBreakdown={route.risk_breakdown}
      />

      {/* Port lane / region info */}
      <div className="rounded-xl border border-outline-variant/10 bg-surface-container/20 p-3">
        <div className="text-[10px] font-label font-bold uppercase tracking-[0.14em] text-outline">Port lane</div>
        <div className="mt-1 text-sm font-semibold text-on-surface">
          {route.origin_port ?? source} → {route.destination_port ?? destination}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-on-surface-variant">
          {distanceNm > 0 && <span>{distanceNm.toFixed(0)} nautical miles</span>}
          {distanceNm > 0 && <span className="text-outline">·</span>}
          <span>{reliabilityLabel(reliability)} reliability</span>
          {delay > 0.1 && <><span className="text-outline">·</span><span className="text-amber-200">+{delay.toFixed(1)}h expected delay</span></>}
          {regions.length > 1 && <><span className="text-outline">·</span><span>{regions.join(' → ')}</span></>}
        </div>
      </div>

      {/* Route segments */}
      {route.segments?.length ? (
        <DetailDisclosure title="Route segments" defaultOpen>
          <div className="space-y-1.5">
            {route.segments.map((segment, index) => (
              <div key={`${index}-${segment.from}-${segment.to}`}
                className="flex items-center gap-2 rounded-lg border border-outline-variant/8 bg-surface-container/20 px-2.5 py-2 text-[11px]">
                <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                  segment.mode === 'Water' ? 'bg-teal-500/15 text-teal-300' : 'bg-amber-500/12 text-amber-200'
                }`}>
                  <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>
                    {segment.mode === 'Water' ? 'directions_boat' : 'local_shipping'}
                  </span>
                  {segment.mode}
                </span>
                <span className="truncate text-on-surface">{segment.from}</span>
                <span className="material-symbols-outlined text-outline" style={{ fontSize: '11px' }}>arrow_forward</span>
                <span className="truncate text-on-surface">{segment.to}</span>
              </div>
            ))}
          </div>
        </DetailDisclosure>
      ) : null}

      {/* Cost breakdown */}
      {bd && Object.keys(bd).length > 0 ? (
        <DetailDisclosure title="Cost breakdown">
          <div className="rounded-xl border border-outline-variant/10 overflow-hidden">
            <table className="w-full text-[11px]">
              <tbody className="divide-y divide-outline-variant/8">
                {([
                  ['Sea freight', bd.sea_freight],
                  ['Road drayage', bd.road_drayage],
                  ['Port fees', bd.port_fees],
                  ['Transshipment fees', bd.transshipment_fees],
                  ['Regional surcharge', bd.regional_surcharge],
                ] as [string, number | undefined][])
                  .filter(([, val]) => val != null && val > 0)
                  .map(([label, val]) => (
                    <tr key={label} className="bg-surface-container-lowest/15">
                      <td className="py-2 pl-3 text-on-surface-variant">{label}</td>
                      <td className="py-2 pr-3 text-right mono font-medium text-on-surface tabular-nums">₹{fmt(val)}</td>
                    </tr>
                  ))}
                <tr className="bg-surface-container/30 font-bold">
                  <td className="py-2 pl-3 text-on-surface">Total</td>
                  <td className="py-2 pr-3 text-right mono text-teal-300 tabular-nums">₹{fmt(route.cost)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </DetailDisclosure>
      ) : null}

      {/* Risk breakdown — visual bars */}
      {route.risk_breakdown && Object.keys(route.risk_breakdown).length > 0 ? (
        <DetailDisclosure title="Risk breakdown" defaultOpen>
          <RiskBreakdownBars breakdown={route.risk_breakdown} />
          <div className="mt-3 grid grid-cols-2 gap-2 pt-2 border-t border-outline-variant/8">
            <div className="flex justify-between rounded-lg bg-surface-container/25 px-3 py-2 text-[11px]">
              <span className="text-on-surface-variant">Delay probability</span>
              <span className="mono font-bold text-on-surface">
                {route.delay_prob != null ? `${Math.round(Number(route.delay_prob) * 100)}%` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between rounded-lg bg-surface-container/25 px-3 py-2 text-[11px]">
              <span className="text-on-surface-variant">Reliability</span>
              <span className={`mono font-bold ${reliabilityTone(reliability)}`}>{Math.round(reliability * 100)}%</span>
            </div>
          </div>
        </DetailDisclosure>
      ) : null}

      {/* AI explanation */}
      <DetailDisclosure title="AI route explanation">
        {activeExplanation ? (
          <ul className="space-y-1.5 text-[11px] leading-relaxed text-on-surface-variant">
            {activeExplanation.split('\n').map(l => l.trim()).filter(Boolean).map((line, index) => (
              <li key={`${line}-${index}`} className="flex gap-2">
                <span className="text-teal-400/70">•</span>
                <span>{line.replace(/^[-*]\s*/, '')}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] text-on-surface-variant">
              Generate an AI-powered explanation for this specific route.
            </span>
            <button type="button" onClick={handleExplain} disabled={loadingExplanation}
              className="rounded-lg bg-teal-500/10 px-3 py-1.5 text-[10px] font-semibold text-teal-300 transition hover:bg-teal-500/20 disabled:opacity-50">
              {loadingExplanation ? 'Analyzing…' : 'Analyze route'}
            </button>
          </div>
        )}
      </DetailDisclosure>
    </div>
  );
}

// ── No routes empty state ─────────────────────────────────────────────

function WaterNoRoutesEmpty({
  portTotal,
  portRegions,
  source, destination, error, onTryAgain,
}: {
  portTotal: number;
  portRegions: number;
  source: string;
  destination: string;
  error: string | null;
  onTryAgain: () => void;
}) {
  const kind = classifyWaterNoRoute(error);
  const isConstraints = kind === 'constraints';
  return (
    <section className="flex min-h-[min(70vh,520px)] items-center justify-center px-4 py-12 sm:px-8">
      <div className="w-full max-w-lg rounded-xl border border-teal-400/20 bg-surface-container-low/40 p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-teal-500/10 border border-teal-400/20">
          <span className="material-symbols-outlined text-teal-400" style={{ fontSize: '28px', fontVariationSettings: "'FILL' 1" }}>
            {isConstraints ? 'tune' : 'sailing'}
          </span>
        </div>
        <h2 className="text-lg font-semibold text-on-surface">
          {isConstraints ? 'No routes match your filters' : 'No maritime lane in our network'}
        </h2>
        <p className="mt-2 text-sm font-medium text-on-surface">{source || 'Origin'} → {destination || 'Destination'}</p>
        <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
          {isConstraints
            ? 'We found port paths, but none satisfied your budget, transshipment, or risk constraints.'
            : 'Our global port graph does not connect these ports with a feasible sea lane.'}
        </p>
        <div className="mt-5 rounded-xl border border-outline-variant/12 bg-surface-container/25 px-4 py-3 text-left text-[11px] text-on-surface-variant space-y-2">
          <p className="font-semibold text-on-surface text-xs">What you can try</p>
          <ul className="space-y-1.5">
            <li className="flex gap-2"><span className="text-teal-400 shrink-0">•</span><span>Pick a major hub port closer to each coast (Singapore, Jebel Ali, Colombo).</span></li>
            <li className="flex gap-2"><span className="text-teal-400 shrink-0">•</span><span>Increase max transshipments in advanced options.</span></li>
            <li className="flex gap-2"><span className="text-teal-400 shrink-0">•</span><span>Network: {portTotal} ports across {portRegions} regions.</span></li>
          </ul>
        </div>
        <button type="button" onClick={onTryAgain}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-500/15 px-5 py-2.5 text-sm font-semibold text-teal-300 transition hover:bg-teal-500/25">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit_location_alt</span>
          Search another corridor
        </button>
      </div>
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────

export default function WaterRouteResults() {
  const routes = useLogiFlowStore((s) => s.waterRoutes);
  const selected = useLogiFlowStore((s) => s.selectedWaterRoute);
  const setSelected = useLogiFlowStore((s) => s.setSelectedWaterRoute);
  const source = useLogiFlowStore((s) => s.source);
  const destination = useLogiFlowStore((s) => s.destination);
  const error = useLogiFlowStore((s) => s.error);
  const hasSearched = useLogiFlowStore((s) => s.hasSearched);
  const loading = useLogiFlowStore((s) => s.loading);
  const loadingMode = useLogiFlowStore((s) => s.loadingMode);
  const resetResults = useLogiFlowStore((s) => s.resetResults);
  const cargoType = useLogiFlowStore((s) => s.cargoType);
  const priority = useLogiFlowStore((s) => s.priority);

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const { ports, total: portTotal, regions: portRegions } = useWaterPortCatalog();

  const safeIndex = Math.min(Math.max(selected, 0), Math.max(routes.length - 1, 0));
  const active = routes[safeIndex];

  const stats = useMemo(() => {
    if (!routes.length) return null;
    return {
      minCost: Math.min(...routes.map((r) => Number(r.cost))),
      minTime: Math.min(...routes.map((r) => Number(r.time))),
      minRisk: Math.min(...routes.map((r) => Number(r.risk))),
    };
  }, [routes]);

  const showWaterLoading = loading && loadingMode === 'water';
  const showNoRoutes = hasSearched && !showWaterLoading && routes.length === 0 && (isWaterNoRouteMessage(error) || !error);

  if (showNoRoutes) {
    return (
      <WaterNoRoutesEmpty
        portTotal={portTotal}
        portRegions={portRegions}
        source={source}
        destination={destination}
        error={error}
        onTryAgain={resetResults}
      />
    );
  }
  if (!routes.length || !active || !stats) return null;

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-label font-bold uppercase tracking-[0.12em] text-outline">
            <span className="material-symbols-outlined text-teal-400" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>directions_boat</span>
            Maritime routes
          </div>
          <div className="mt-0.5 text-sm font-semibold text-on-surface">
            {routes.length} option{routes.length !== 1 ? 's' : ''} for {source} → {destination}
          </div>
        </div>
        <div className="rounded-full border border-outline-variant/15 bg-surface-container-lowest/35 px-3 py-1 text-[10px] text-on-surface-variant">
          {portTotal || '…'} ports · {portRegions || '…'} regions · live marine weather
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        {/* Route cards list */}
        <div className="space-y-3 lg:col-span-1 lg:max-h-[80vh] lg:overflow-y-auto lg:pr-1 [scrollbar-gutter:stable]">
          <div className="rounded-xl border border-outline-variant/12 bg-surface-container/20 p-4">
            <div className="text-[9px] font-label font-bold uppercase tracking-[0.14em] text-outline">Recommendation</div>
            <p className="mt-2 text-[12px] leading-relaxed text-on-surface-variant">
              Route {safeIndex + 1} selected — {stopsLabel(active)} via{' '}
              {active.origin_port ?? source} → {active.destination_port ?? destination}.
              {Number(active.reliability_score ?? 0) >= 0.7 ? ' Strong reliability.' : ''}
            </p>
          </div>
          {routes.map((route, index) => (
            <WaterRouteCard
              key={`${index}-${routeKey(route)}`}
              route={route}
              index={index}
              isSelected={index === safeIndex}
              onSelect={() => setSelected(index)}
              isCheapest={Number(route.cost) === stats.minCost}
              isFastest={Number(route.time) === stats.minTime}
              isSafest={Number(route.risk) === stats.minRisk}
              ports={ports}
            />
          ))}
        </div>

        {/* Detail panel + map */}
        <div className="lg:col-span-2 space-y-4">
          {/* Sea map */}
          <div className="h-[280px] sm:h-[340px] rounded-xl overflow-hidden border border-teal-400/10">
            <SeaMapView
              routes={routes}
              ports={ports}
              selectedRoute={safeIndex}
              source={source}
              destination={destination}
            />
          </div>

          {/* Detail panel */}
          <div className="rounded-xl border border-teal-400/10 bg-surface-container-lowest/25 p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 border-b border-outline-variant/8 pb-3">
              <span className="material-symbols-outlined text-teal-400" style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>anchor</span>
              <span className="text-[10px] font-label font-bold uppercase tracking-[0.12em] text-outline">Selected route</span>
              <span className="ml-auto mono text-[10px] font-bold text-teal-300">Route {safeIndex + 1}</span>
            </div>
            <DetailPanel
              route={active}
              source={source}
              destination={destination}
              minCost={stats.minCost}
              minTime={stats.minTime}
              minRisk={stats.minRisk}
              onSave={() => setSaveModalOpen(true)}
              ports={ports}
            />
          </div>
        </div>
      </div>

      <SaveReportModal
        isOpen={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        prefill={{
          source, destination,
          stops: active?.segments?.map(s => s.to).slice(0, -1) || [],
          mode: 'water',
          cargoType,
          optimizationInput: { priority },
          optimizationResult: active as unknown as Record<string, unknown>,
          estimatedCost: active?.cost,
          estimatedTime: active?.time,
          riskScore: active?.risk,
        }}
      />
    </section>
  );
}
