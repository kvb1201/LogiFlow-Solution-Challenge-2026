'use client';

import React from 'react';
import type { HybridComparisonRow, HybridOptimizeResult } from '@/services/api';
import { InvalidCorridorInline } from '@/components/InvalidCorridorCard';
import { AmbientSurface } from '@/components/cockpit/AmbientSurface';
import { ModeIcon } from '@/components/cockpit/ModeIcon';
import { modeMeta } from '@/lib/mode-meta';
import { accentMix, accentVar, PIPELINE_ACTION_SECONDARY } from '@/lib/pipeline-theme';

type Mode = 'road' | 'rail' | 'air' | 'water';

const MODE_LABEL: Record<Mode, string> = {
  road: 'Road',
  rail: 'Rail',
  air: 'Air',
  water: 'Water',
};

const ALL_MODES: Mode[] = ['road', 'rail', 'air', 'water'];

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickNum(data: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const n = toNum(data[key]);
    if (n != null) return n;
  }
  return null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function formatHours(v: unknown): string {
  const n = toNum(v);
  return n == null ? '—' : `${n.toFixed(1)}h`;
}

function formatInr(v: unknown): string {
  const n = toNum(v);
  if (n == null) return '—';
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))}`;
}

function formatRisk(v: unknown): string {
  const n = toNum(v);
  if (n == null) return '—';
  const pct = n <= 1 ? Math.round(n * 100) : Math.round(n);
  return `${pct}%`;
}

function formatConfidence(v: unknown): string {
  const n = toNum(v);
  if (n == null) return '—';
  const pct = n <= 1 ? Math.round(n * 100) : Math.round(n);
  return `${pct}%`;
}

function airportLabel(ap: unknown): string | null {
  const rec = asRecord(ap);
  if (!rec) return typeof ap === 'string' && ap.trim() ? ap.trim() : null;
  const code = String(rec.code ?? rec.iata ?? '').trim();
  const name = String(rec.name ?? '').trim();
  if (code && name) return `${code} · ${name}`;
  return code || name || null;
}

interface ModePickCopy {
  title: string;
  subtitle: string;
  /** Prominent identifier — train #, flight, port pair */
  identityLine?: string;
  identityDetail?: string;
  facts: { label: string; value: string }[];
  highlights: string[];
}

interface RailLeg {
  trainNo: string;
  trainName: string;
  trainType: string;
  from: string;
  to: string;
  departure: string;
  arrival: string;
  distanceKm: number | null;
}

function parseRailLegs(data: Record<string, unknown>): RailLeg[] {
  const legs: RailLeg[] = [];

  const pushLeg = (raw: Record<string, unknown>) => {
    const trainNo = String(raw.train_no ?? raw.train_number ?? raw.trainNumber ?? '').trim();
    const trainName = String(raw.train_name ?? raw.trainName ?? '').trim();
    const from = String(
      raw.from ?? raw.from_name ?? raw.from_station_name ?? raw.from_station ?? ''
    ).trim();
    const to = String(raw.to ?? raw.to_name ?? raw.to_station_name ?? raw.to_station ?? '').trim();
    const departure = String(raw.departure ?? raw.departure_time ?? '').trim();
    const arrival = String(raw.arrival ?? raw.arrival_time ?? '').trim();
    const trainType = String(raw.train_type ?? raw.trainType ?? '').trim();
    const distanceKm = pickNum(raw, 'distance_km', 'distanceKm');

    if (!trainNo && !trainName && !from && !to) return;

    legs.push({ trainNo, trainName, trainType, from, to, departure, arrival, distanceKm });
  };

  for (const seg of Array.isArray(data.segments) ? data.segments : []) {
    const rec = asRecord(seg);
    if (rec) pushLeg(rec);
  }

  for (const train of Array.isArray(data.trains) ? data.trains : []) {
    const rec = asRecord(train);
    if (rec) pushLeg(rec);
  }

  if (!legs.length) {
    pushLeg(data);
  }

  return legs;
}

function stringList(v: unknown, max = 4): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean)
    .slice(0, max);
}

function extractRoadPick(data: Record<string, unknown>): ModePickCopy {
  const distance = pickNum(data, 'distance_km', 'distance');
  const highway = toNum(data.highway_ratio);
  const delay = pickNum(data, 'predicted_delay', 'delay_hr', 'delay_hours');
  const routeId = String(data.route_id ?? '').trim();

  const facts: { label: string; value: string }[] = [];
  if (distance != null) facts.push({ label: 'Distance', value: `${Math.round(distance)} km` });
  if (highway != null) facts.push({ label: 'Highway share', value: `${Math.round(highway * 100)}%` });
  if (delay != null && delay > 0) facts.push({ label: 'Expected delay', value: formatHours(delay) });
  if (routeId) facts.push({ label: 'Route id', value: routeId });

  const subtitleParts: string[] = [];
  if (distance != null) subtitleParts.push(`${Math.round(distance)} km corridor`);
  if (highway != null) {
    subtitleParts.push(highway >= 0.72 ? 'Mostly highways' : highway <= 0.42 ? 'Mixed local roads' : 'Highway + mixed');
  }

  return {
    title: distance != null ? `Road · ${Math.round(distance)} km` : 'Best road route',
    subtitle: subtitleParts.join(' · ') || 'Top-ranked drivable corridor',
    identityLine: distance != null ? `${Math.round(distance)} km` : undefined,
    identityDetail: highway != null ? `${Math.round(highway * 100)}% on highways` : undefined,
    facts,
    highlights: stringList(data.key_factors, 3),
  };
}

function extractRailPick(data: Record<string, unknown>): ModePickCopy {
  const details = asRecord(data.rail_details);
  const legs = parseRailLegs(data);
  const primary = legs[0];
  const hasTransfer = Boolean(data.has_transfer ?? details?.has_transfer) || legs.length > 1;

  const trainNo =
    primary?.trainNo ||
    String(data.train_number ?? data.train_no ?? '').trim();
  const trainName =
    primary?.trainName ||
    String(data.train_name ?? '').trim();
  const trainType =
    primary?.trainType ||
    String(data.train_type ?? '').trim();

  const from = primary?.from || '';
  const to = primary?.to || (legs.length > 1 ? legs[legs.length - 1]?.to : '') || '';
  const departure = primary?.departure || String(data.departure ?? data.departure_time ?? '').trim();
  const arrival =
    (legs.length > 1 ? legs[legs.length - 1]?.arrival : primary?.arrival) ||
    String(data.arrival ?? data.arrival_time ?? '').trim();

  const distance =
    pickNum(details ?? {}, 'distance_km') ??
    primary?.distanceKm ??
    pickNum(data, 'distance_km', 'total_distance_km');

  const van = String(data.parcel_van_type ?? details?.parcel_van_type ?? '').trim();
  const tariffScale = String(data.tariff_scale ?? details?.tariff_scale ?? '').trim();
  const tariff = asRecord(details?.tariff_breakdown);
  const scaleName = String(tariff?.scale_name ?? '').trim();
  const punctuality = pickNum(details ?? {}, 'punctuality_pct');
  const delayMin = pickNum(data, 'predicted_delay_min');
  const routeType = String(details?.route_type ?? data.route_type ?? '').trim();
  const priority = String(data.priority ?? '').trim();
  const reason = String(data.reason ?? '').trim();

  const facts: { label: string; value: string }[] = [];

  if (trainNo) facts.push({ label: 'Train number', value: trainNo });
  if (trainName) facts.push({ label: 'Train name', value: trainName });
  if (trainType) facts.push({ label: 'Train type', value: trainType });
  if (from) facts.push({ label: 'From station', value: from });
  if (to) facts.push({ label: 'To station', value: to });
  if (departure) facts.push({ label: 'Departure', value: departure });
  if (arrival) facts.push({ label: 'Arrival', value: arrival });
  if (distance != null) facts.push({ label: 'Distance', value: `${Math.round(distance)} km` });
  if (routeType) facts.push({ label: 'Route type', value: routeType });
  if (van) facts.push({ label: 'Parcel van', value: van });
  if (tariffScale || scaleName) {
    facts.push({
      label: 'Tariff',
      value: [tariffScale, scaleName].filter(Boolean).join(' · '),
    });
  }
  if (punctuality != null) facts.push({ label: 'Punctuality', value: `${Math.round(punctuality)}%` });
  if (delayMin != null && delayMin > 0) facts.push({ label: 'Delay buffer', value: `+${Math.round(delayMin)} min` });

  legs.slice(1).forEach((leg, index) => {
    const legLabel = `Leg ${index + 2}`;
    const legTrain = [leg.trainNo, leg.trainName].filter(Boolean).join(' · ');
    if (legTrain) facts.push({ label: `${legLabel} train`, value: legTrain });
    if (leg.from && leg.to) facts.push({ label: `${legLabel} corridor`, value: `${leg.from} → ${leg.to}` });
  });

  const corridor =
    from && to ? `${from} → ${to}` : from || to || '';
  const schedule =
    departure && arrival ? `${departure} → ${arrival}` : departure || arrival || '';

  const identityLine = [trainNo && `#${trainNo}`, trainName].filter(Boolean).join(' · ');
  const identityDetail = [corridor, schedule].filter(Boolean).join(' · ');

  const subtitleParts = [
    hasTransfer ? `${legs.length || 2}-leg transfer` : 'Direct train',
    priority ? `Picked for ${priority}` : '',
  ].filter(Boolean);

  return {
    title: trainName || (trainNo ? `Train ${trainNo}` : 'Best rail option'),
    subtitle: subtitleParts.join(' · ') || reason || 'Top cargo rail recommendation',
    identityLine: identityLine || undefined,
    identityDetail: identityDetail || undefined,
    facts,
    highlights: stringList(data.key_factors, 3),
  };
}

function extractAirPick(data: Record<string, unknown>): ModePickCopy {
  const details = asRecord(data.air_details);
  const airline = String(data.airline ?? details?.airline ?? '').trim();
  const stops = toNum(data.stops ?? details?.stops) ?? 0;
  const support = String(data.route_support_type ?? details?.route_support_type ?? '').trim();
  const reliability = pickNum(data, 'reliability') ?? pickNum(details ?? {}, 'reliability');
  const confLabel = String(data.confidence_label ?? '').trim();
  const src = airportLabel(data.source_airport ?? details?.source_airport);
  const dst = airportLabel(data.destination_airport ?? details?.destination_airport);
  const hub = airportLabel(data.hub_airport ?? details?.hub_airport);
  const schedule = asRecord(details?.schedule);
  const depLocal = String(schedule?.departure_local ?? details?.departure_local ?? '').trim();
  const arrLocal = String(schedule?.arrival_local ?? details?.arrival_local ?? '').trim();

  const facts: { label: string; value: string }[] = [];
  if (src) facts.push({ label: 'From', value: src });
  if (dst) facts.push({ label: 'To', value: dst });
  if (hub) facts.push({ label: 'Via hub', value: hub });
  if (depLocal) facts.push({ label: 'Departure', value: depLocal });
  if (arrLocal) facts.push({ label: 'Arrival', value: arrLocal });
  if (reliability != null) facts.push({ label: 'Reliability', value: formatConfidence(reliability) });
  if (confLabel) facts.push({ label: 'Confidence', value: confLabel });

  let routeLabel = 'Direct flight';
  if (support.includes('one_stop') || stops === 1) routeLabel = '1 stop';
  else if (stops > 1) routeLabel = `${stops} stops`;
  else if (support && !support.includes('direct')) routeLabel = support.replace(/_/g, ' ');

  const identityLine = airline || undefined;
  const identityDetail = [src, dst].filter(Boolean).join(' → ') || undefined;

  return {
    title: airline || 'Best air option',
    subtitle: routeLabel,
    identityLine,
    identityDetail: identityDetail ? `${identityDetail}${depLocal && arrLocal ? ` · ${depLocal}–${arrLocal}` : ''}` : undefined,
    facts,
    highlights: stringList(data.confidence_reasons ?? details?.confidence_reasons, 3),
  };
}

function extractWaterPick(data: Record<string, unknown>): ModePickCopy {
  const origin = String(data.origin_port ?? '').trim();
  const dest = String(data.destination_port ?? '').trim();
  const distanceNm = pickNum(data, 'distance_nm');
  const transshipments = toNum(data.transshipments) ?? 0;
  const reliability = pickNum(data, 'reliability_score');
  const delay = pickNum(data, 'expected_delay_hours');
  const reason = String(data.reason ?? '').trim();
  const chokepoints = stringList(data.chokepoints_transited, 2);

  const facts: { label: string; value: string }[] = [];
  if (origin) facts.push({ label: 'Origin port', value: origin });
  if (dest) facts.push({ label: 'Dest. port', value: dest });
  if (distanceNm != null) facts.push({ label: 'Sea distance', value: `${Math.round(distanceNm)} nm` });
  facts.push({
    label: 'Transshipments',
    value: transshipments <= 0 ? 'Direct' : `${transshipments} stop${transshipments === 1 ? '' : 's'}`,
  });
  if (reliability != null) facts.push({ label: 'Reliability', value: formatConfidence(reliability) });
  if (delay != null && delay > 0) facts.push({ label: 'Expected delay', value: formatHours(delay) });
  if (chokepoints.length) facts.push({ label: 'Chokepoints', value: chokepoints.join(', ') });

  return {
    title: origin && dest ? `${origin} → ${dest}` : 'Best maritime route',
    subtitle: transshipments <= 0 ? 'Direct sea leg' : `${transshipments}-stop maritime path`,
    identityLine: origin && dest ? `${origin} → ${dest}` : undefined,
    identityDetail: distanceNm != null ? `${Math.round(distanceNm)} nm` : undefined,
    facts,
    highlights: stringList(data.key_factors, 3),
  };
}

function extractModePick(mode: Mode, data: Record<string, unknown>): ModePickCopy {
  switch (mode) {
    case 'road':
      return extractRoadPick(data);
    case 'rail':
      return extractRailPick(data);
    case 'air':
      return extractAirPick(data);
    case 'water':
      return extractWaterPick(data);
  }
}

function modeMetrics(data: Record<string, unknown>) {
  return {
    time: pickNum(data, 'time_hr', 'time', 'duration_hours', 'adjusted_duration_hours', 'effective_hours'),
    cost: pickNum(data, 'cost_inr', 'cost', 'parcel_cost_inr'),
    risk: pickNum(data, 'risk', 'risk_score'),
    confidence: pickNum(data, 'confidence', 'confidence_score'),
  };
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border/30 bg-surface/10 px-2 py-1.5 text-center backdrop-blur-sm">
      <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-headline text-sm font-bold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function ModePickCard({
  mode,
  data,
  comparisonRow,
  insights,
  isRecommended,
  badges,
  onSave,
}: {
  mode: Mode;
  data: Record<string, unknown>;
  comparisonRow?: HybridComparisonRow | null;
  insights?: string[];
  isRecommended: boolean;
  badges: string[];
  onSave: () => void;
}) {
  const accent = modeMeta[mode].accent;
  const copy = extractModePick(mode, data);
  const metrics = modeMetrics(data);
  const time = comparisonRow?.time_hr ?? metrics.time;
  const cost = comparisonRow?.cost_inr ?? metrics.cost;
  const risk = comparisonRow?.risk ?? metrics.risk;
  const confidence = comparisonRow?.confidence ?? metrics.confidence;
  const explanation =
    comparisonRow?.explanation?.trim() ||
    copy.highlights[0] ||
    copy.subtitle;

  return (
    <AmbientSurface
      mode={mode}
      mesh="card"
      className={`flex h-full flex-col p-4 sm:p-4 ${isRecommended ? 'ring-1 ring-[color-mix(in_oklab,var(--comparator)_35%,transparent)]' : ''}`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-background/40 backdrop-blur-sm"
            style={{ color: accent, boxShadow: `0 0 22px -8px ${accentVar(mode)}` }}
          >
            <ModeIcon mode={mode} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {MODE_LABEL[mode]}
            </p>
            <h4 className="truncate text-sm font-semibold text-foreground">{copy.title}</h4>
            <p className="truncate text-xs text-muted-foreground">{copy.subtitle}</p>
          </div>
        </div>
        {isRecommended && (
          <span
            className="shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]"
            style={{
              color: accentVar('comparator'),
              borderColor: accentMix('comparator', 28, 'transparent'),
              background: accentMix('comparator', 8, 'transparent'),
            }}
          >
            Winner
          </span>
        )}
      </div>

      {(copy.identityLine || copy.identityDetail) && (
        <div
          className="mb-3 rounded-lg border border-border/30 px-3 py-2 backdrop-blur-sm"
          style={{ background: accentMix(mode, 5, 'transparent') }}
        >
          {copy.identityLine && (
            <p
              className="font-mono text-sm font-bold tracking-tight sm:text-base"
              style={{ color: mode === 'rail' ? accentVar('rail') : undefined }}
            >
              {copy.identityLine}
            </p>
          )}
          {copy.identityDetail && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.identityDetail}</p>
          )}
        </div>
      )}

      {badges.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-border/35 bg-surface/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
            >
              {badge}
            </span>
          ))}
        </div>
      )}

      <div className="mb-3 flex gap-1.5">
        <MetricPill label="Time" value={formatHours(time)} />
        <MetricPill label="Cost" value={formatInr(cost)} />
        <MetricPill label="Risk" value={formatRisk(risk)} />
        <MetricPill label="Conf." value={formatConfidence(confidence)} />
      </div>

      {copy.facts.length > 0 && (
        <dl className="mb-3 space-y-1 border-t border-border/20 pt-2.5 text-xs">
          {copy.facts.map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium text-foreground/90">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mb-3 flex-1 text-xs leading-relaxed text-muted-foreground">{explanation}</p>

      {insights && insights.length > 0 && (
        <ul className="mb-3 space-y-1">
          {insights.map((line) => (
            <li key={line} className="flex gap-2 text-[11px] leading-snug text-muted-foreground">
              <span style={{ color: accentVar('comparator') }}>·</span>
              {line}
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={onSave} className={`${PIPELINE_ACTION_SECONDARY} mt-auto w-full justify-center`}>
        <span className="material-symbols-outlined text-sm">save</span>
        Save option
      </button>
    </AmbientSurface>
  );
}

export function ComparatorModePicks({
  result,
  recommendedMode,
  comparisonRows,
  onSaveMode,
}: {
  result: HybridOptimizeResult;
  recommendedMode: Mode | null;
  comparisonRows: HybridComparisonRow[];
  onSaveMode: (mode: Mode) => void;
}) {
  const rowByMode = React.useMemo(() => {
    const map = new Map<Mode, HybridComparisonRow>();
    for (const row of comparisonRows) {
      const mode = String(row.mode ?? '').toLowerCase();
      if (mode === 'road' || mode === 'rail' || mode === 'air' || mode === 'water') {
        map.set(mode, row);
      }
    }
    return map;
  }, [comparisonRows]);

  const validRows = comparisonRows.filter((row) => {
    const m = String(row.mode ?? '').toLowerCase();
    return m === 'road' || m === 'rail' || m === 'air' || m === 'water';
  });

  const minTime = Math.min(...validRows.map((row) => toNum(row.time_hr) ?? Number.POSITIVE_INFINITY));
  const minCost = Math.min(...validRows.map((row) => toNum(row.cost_inr) ?? Number.POSITIVE_INFINITY));
  const minRisk = Math.min(...validRows.map((row) => toNum(row.risk) ?? Number.POSITIVE_INFINITY));

  const unavailableModes = Array.isArray(result.unavailable_modes) ? result.unavailable_modes : [];
  const modeInsights = result.mode_insights ?? {};

  function badgesForMode(mode: Mode, row: HybridComparisonRow | undefined): string[] {
    if (!row) return [];
    const badges: string[] = [];
    const time = toNum(row.time_hr);
    const cost = toNum(row.cost_inr);
    const risk = toNum(row.risk);
    if (time != null && time === minTime) badges.push('Fastest');
    if (cost != null && cost === minCost) badges.push('Cheapest');
    if (risk != null && risk === minRisk) badges.push('Lowest risk');
    return badges;
  }

  return (
    <section className="space-y-3">
      <div className="px-0.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
          Pipeline picks
        </p>
        <h3 className="mt-1 font-headline text-base font-bold text-foreground sm:text-lg">
          What each mode recommends
        </h3>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
          Top route from every pipeline — train numbers, flights, ports, and road corridors side by side.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {ALL_MODES.map((mode) => {
          const raw = result.best_per_mode?.[mode];
          const data = asRecord(raw);
          const row = rowByMode.get(mode);
          const unavailableEntry = unavailableModes.find((e) => {
            if (typeof e === 'object' && e !== null) return String(e.mode ?? '').toLowerCase() === mode;
            return String(e ?? '').toLowerCase().startsWith(mode);
          });
          const unavailableReason = unavailableEntry
            ? typeof unavailableEntry === 'object' && unavailableEntry !== null
              ? String((unavailableEntry as { reason?: string }).reason ?? 'Not available for this corridor.')
              : 'Not available for this corridor.'
            : null;

          if (data) {
            return (
              <ModePickCard
                key={mode}
                mode={mode}
                data={data}
                comparisonRow={row}
                insights={modeInsights[mode]}
                isRecommended={mode === recommendedMode}
                badges={badgesForMode(mode, row)}
                onSave={() => onSaveMode(mode)}
              />
            );
          }

          return (
            <AmbientSurface key={mode} mode={mode} mesh="card" className="flex min-h-[160px] flex-col p-4">
              <div className="mb-3 flex items-center gap-2.5">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/40 bg-background/40"
                  style={{ color: modeMeta[mode].accent }}
                >
                  <ModeIcon mode={mode} className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    {MODE_LABEL[mode]}
                  </p>
                  <p className="text-sm font-semibold text-muted-foreground">No route returned</p>
                </div>
              </div>
              {unavailableReason ? (
                <InvalidCorridorInline mode={mode} reason={unavailableReason} />
              ) : (
                <p className="mt-auto text-xs italic text-muted-foreground">
                  Unavailable for this corridor or filtered out during scoring.
                </p>
              )}
            </AmbientSurface>
          );
        })}
      </div>
    </section>
  );
}
