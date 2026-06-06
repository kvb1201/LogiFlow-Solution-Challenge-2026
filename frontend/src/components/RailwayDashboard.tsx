'use client';

import React, { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import InputForm from '@/components/InputForm';
import RailwayLoading from '@/components/RailwayLoading';
import { PipelineModeLanding } from '@/components/cockpit/PipelineModeLanding';
import { RailMlQuantifiers } from '@/components/rail/RailMlQuantifiers';
import { PipelineResultsChrome } from '@/components/cockpit/PipelineResultsChrome';
import {
  buildTrainCorridorGeometry,
  fetchExplanation,
  type Recommendation,
  type RankedOption,
  type RouteGeometryStop,
} from '@/services/api';
import { ensureBackendWarm } from '@/lib/backendWarmup';
import {
  formatRailDataSource,
  formatRailDelaySource,
  isLogiFlowMlDelaySource,
  isLogiFlowVerifiedDelaySource,
} from '@/lib/rail-branding';

const RailwayMap = dynamic(() => import('@/components/Map'), { ssr: false });


// ── Metric Chip ──────────────────────────────────────────────────────

function MetricChip({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-surface-container-lowest/50 border border-outline-variant/8 px-2 py-1.5 rounded-lg text-center">
      <div className="text-[9px] text-outline/70 tracking-[0.12em] mb-0.5 font-label font-semibold uppercase">
        {label}
      </div>
      <div className={`text-[11px] mono font-bold leading-tight ${accent ? 'text-primary' : 'text-on-surface'}`}>
        {value}
      </div>
    </div>
  );
}

// ── Section Header ────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span
        className="material-symbols-outlined text-primary leading-none"
        style={{
          fontSize: '14px',
          fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20",
        }}
      >
        {icon}
      </span>
      <h3 className="text-[10px] font-label font-bold uppercase tracking-[0.12em] text-on-surface-variant">
        {title}
      </h3>
    </div>
  );
}

// ── Info Row ──────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  mono = true,
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline gap-2 py-1.5 border-b border-outline-variant/5 last:border-0">
      <span className="text-[10px] text-outline shrink-0">{label}</span>
      <span
        className={`text-[11px] text-right break-all ${mono ? 'font-mono' : ''} ${accent ? 'text-primary font-bold' : 'text-on-surface'}`}
      >
        {value}
      </span>
    </div>
  );
}

// ── Recommendation Card ───────────────────────────────────────────────

function RecCard({
  rec,
  label,
  icon,
  accentBar,
  iconChipClass,
  isActive,
  onClick,
}: {
  rec: Recommendation;
  label: string;
  icon: string;
  accentBar: string;
  iconChipClass: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const delay = rec.delay_info;

  return (
    <div
      onClick={onClick}
      className={`relative p-3.5 rounded-xl border cursor-pointer transition-all duration-200 overflow-hidden ${
        isActive
          ? 'bg-surface-container/80 border-outline-variant/25 shadow-lg shadow-black/20'
          : 'bg-surface-container-lowest/20 border-outline-variant/8 hover:bg-surface-container/40 hover:border-outline-variant/15'
      }`}
    >
      {/* Left accent bar */}
      <div
        className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-0'} ${accentBar}`}
      />

      <div className="pl-2">
        {/* Label row */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${iconChipClass}`}>
              <span
                className="material-symbols-outlined leading-none"
                style={{
                  fontSize: '13px',
                  fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 20",
                }}
              >
                {icon}
              </span>
            </div>
            <span className="text-[10px] font-label font-bold uppercase tracking-[0.14em] text-on-surface-variant">
              {label}
            </span>
          </div>
          {isActive && (
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
          )}
        </div>

        {/* Train + cost */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-on-surface truncate leading-tight">
              {rec.train_name}
            </div>
            <div className="text-[10px] text-outline mono mt-0.5">
              {rec.train_number} · {rec.train_type}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[15px] font-black mono text-primary leading-tight">
              ₹{rec.parcel_cost_inr?.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-1.5">
          <MetricChip label="TIME" value={`${rec.duration_hours}h`} />
          <MetricChip label="RISK IDX" value={rec.risk_pct} />
          <MetricChip
            label="DELAY"
            value={
              delay?.avg_delay_minutes != null
                ? `${Number(delay.avg_delay_minutes).toFixed(1)}m`
                : '?'
            }
          />
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1.5 mt-2.5 text-[9px] text-outline mono">
          <span>{rec.running_days?.length === 7 ? 'Daily' : `${rec.running_days?.length ?? 0}d/wk`}</span>
          {isLogiFlowVerifiedDelaySource(delay?.delay_data_source) && (
            <>
              <span className="text-outline/30">·</span>
              <span className="text-tertiary flex items-center gap-0.5">
                <span
                  className="material-symbols-outlined leading-none"
                  style={{ fontSize: '10px', fontVariationSettings: "'FILL' 1" }}
                >
                  verified
                </span>
                LogiFlow verified
              </span>
            </>
          )}
          {isLogiFlowMlDelaySource(delay?.delay_data_source) && (
            <>
              <span className="text-outline/30">·</span>
              <span className="text-primary/80">LogiFlow ML</span>
            </>
          )}
          {rec.data_source && (
            <>
              <span className="text-outline/30">·</span>
              <span className="truncate max-w-[100px]" title={rec.data_source}>
                {formatRailDataSource(rec.data_source)}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Option Row ────────────────────────────────────────────────────────

function OptionRow({
  opt,
  isActive,
  onClick,
}: {
  opt: RankedOption;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer transition-all duration-150 border ${
        isActive
          ? 'bg-surface-container/80 border-primary/15 shadow-sm'
          : 'bg-surface-container-lowest/10 border-transparent hover:bg-surface-container/40 hover:border-outline-variant/8'
      }`}
    >
      {/* Rank */}
      <div
        className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold mono shrink-0 transition-colors ${
          isActive ? 'bg-primary text-on-primary' : 'bg-surface-container text-outline'
        }`}
      >
        {opt.rank}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-on-surface truncate leading-tight">
          {opt.train_name}
        </div>
        <div className="text-[10px] text-outline mono">
          {opt.train_number}
          {opt.running_days?.length > 0 &&
            ` · ${opt.running_days.length === 7 ? 'Daily' : `${opt.running_days.length}d`}`}
        </div>
      </div>

      {/* Metrics */}
      <div className="text-right shrink-0">
        <div className="text-[12px] font-bold mono text-primary">
          ₹{opt.parcel_cost_inr?.toLocaleString()}
        </div>
        <div className="text-[10px] text-outline mono">
          {opt.effective_hours}h · {(opt.risk_score * 100).toFixed(0)}%
        </div>
      </div>

      {/* Delay badge */}
      <div
        className={`hidden text-[9px] mono px-1.5 py-0.5 rounded shrink-0 min-[400px]:block ${
          isLogiFlowVerifiedDelaySource(opt.delay_source) ||
          isLogiFlowMlDelaySource(opt.delay_source)
            ? 'bg-tertiary/10 text-tertiary border border-tertiary/15'
            : 'bg-surface-container text-outline'
        }`}
      >
        {opt.avg_delay_min?.toFixed(0)}m
      </div>
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────

function formatLiveLine(key: string, val: unknown): string | null {
  if (val == null || val === '') return null;
  if (typeof val === 'object') return `${key}: ${JSON.stringify(val)}`;
  return `${key}: ${String(val)}`;
}

function DetailPanel({
  rec,
  ranked,
  trainDelayDetail,
  selectedTrainLive,
}: {
  rec: Recommendation | null;
  ranked: RankedOption | null;
  trainDelayDetail: import('@/services/api').TrainDelayData | null;
  selectedTrainLive: Record<string, unknown> | null;
}) {
  const liveEntries = useMemo(() => {
    if (!selectedTrainLive || typeof selectedTrainLive !== 'object') return [];
    const preferred = ['currentStationName', 'currentStation', 'nextStationName', 'nextStation', 'delayMinutes', 'delay', 'status', 'position', 'speed'];
    const rows: string[] = [];
    const seen = new Set<string>();
    for (const k of preferred) {
      if (k in selectedTrainLive) {
        const line = formatLiveLine(k, (selectedTrainLive as Record<string, unknown>)[k]);
        if (line) { rows.push(line); seen.add(k); }
      }
    }
    for (const [k, v] of Object.entries(selectedTrainLive)) {
      if (seen.has(k) || k === 'success') continue;
      const line = formatLiveLine(k, v);
      if (line && rows.length < 14) rows.push(line);
    }
    return rows;
  }, [selectedTrainLive]);

  const base = rec ?? ranked;

  if (!base) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-surface-container/40 border border-outline-variant/8 flex items-center justify-center">
          <span
            className="material-symbols-outlined text-outline"
            style={{ fontSize: '20px', fontVariationSettings: "'FILL' 0" }}
          >
            info
          </span>
        </div>
        <p className="text-[11px] text-on-surface-variant leading-relaxed max-w-[180px]">
          Select a recommendation or ranked route to view delay breakdown and live status
        </p>
      </div>
    );
  }

  const isRec = !!rec;
  const delay = isRec ? rec!.delay_info : null;
  const segments = (isRec ? rec!.segments : ranked!.segments) || [];
  const trainNo = isRec ? rec!.train_number : ranked!.train_number;
  const trainName = isRec ? rec!.train_name : ranked!.train_name;
  const trainType = isRec ? rec!.train_type : ranked!.train_type;
  const parcelCost = isRec ? rec!.parcel_cost_inr : ranked!.parcel_cost_inr;
  const durationH = isRec ? rec!.duration_hours : ranked!.effective_hours;
  const riskPct = isRec ? rec!.risk_pct : `${(ranked!.risk_score * 100).toFixed(0)}%`;
  const riskScore = isRec ? rec!.risk_score : ranked!.risk_score;
  const avgDelay = isRec ? delay?.avg_delay_minutes : ranked!.avg_delay_min;
  const delaySrc = isRec ? delay?.delay_data_source : ranked!.delay_source;
  const runningDays = isRec ? rec!.running_days : ranked!.running_days;
  const distanceKm = isRec ? rec!.distance_km : ranked!.distance_km;
  const llmExplanation = isRec ? rec!.llm_explanation : undefined;

  const riskColor =
    riskScore < 0.2 ? '#10b981' : riskScore < 0.4 ? '#f59e0b' : '#ef4444';

  return (
    <div className="space-y-5">
      {/* Summary card */}
      <div className="bg-surface-container/30 rounded-xl border border-outline-variant/10 p-3">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-on-surface leading-tight truncate">{trainName}</div>
            <div className="text-[10px] text-outline mono mt-0.5">{trainNo} · {trainType}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-black mono text-primary leading-tight">₹{parcelCost?.toLocaleString()}</div>
            <div className="text-[10px] text-outline mono">{distanceKm} km</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <MetricChip label="HOURS" value={`${durationH}h`} />
          <MetricChip label="RISK IDX" value={riskPct} />
          <MetricChip
            label="DELAY"
            value={avgDelay != null ? `${Number(avgDelay).toFixed(1)}m` : '?'}
          />
        </div>
      </div>

      {/* Train details */}
      <section>
        <SectionHeader icon="train" title="Train Details" />
        <div className="bg-surface-container/20 rounded-xl border border-outline-variant/8 px-3 py-0.5">
          <InfoRow label="Train" value={`${trainNo} ${trainName}`} />
          <InfoRow label="Type" value={trainType} mono={false} />
          {isRec && (
            <>
              <InfoRow label="Schedule" value={`${rec!.departure} → ${rec!.arrival}`} />
              <InfoRow label="Speed" value={`${rec!.avg_speed_kmph} km/h`} />
            </>
          )}
          <InfoRow
            label="Runs"
            value={runningDays?.length === 7 ? 'Daily' : runningDays?.join(', ') ?? '—'}
            mono={false}
          />
          {isRec && rec!.parcel_van_type && (
            <InfoRow label="Van" value={rec!.parcel_van_type} mono={false} />
          )}
        </div>
      </section>

      {/* Risk */}
      <section>
        <SectionHeader icon="shield" title="Risk Index" />
        <div className="bg-surface-container/20 rounded-xl border border-outline-variant/8 p-3">
          <p className="text-[10px] text-on-surface-variant mb-2 leading-snug">
            Composite routing index (delay, season, weather, transfers) — not ML hit-rate accuracy.
          </p>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-outline">Index</span>
            <span className="mono text-sm font-bold" style={{ color: riskColor }}>{riskPct}</span>
          </div>
          <div className="w-full h-1.5 bg-surface-container-highest/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, riskScore * 100)}%`, background: riskColor }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[9px] text-outline mono">
            <span>LOW</span><span>HIGH</span>
          </div>
        </div>
      </section>

      {/* Delay */}
      <section>
        <SectionHeader icon="schedule" title="Delay Analysis" />
        <div className="bg-surface-container/20 rounded-xl border border-outline-variant/8 px-3 py-0.5">
          <InfoRow label="Avg Delay" value={avgDelay != null ? `${Number(avgDelay).toFixed(1)} min` : '?'} accent />
          {isRec && delay?.ml_baseline_minutes != null && (
            <InfoRow
              label="ML baseline"
              value={`${Number(delay.ml_baseline_minutes).toFixed(1)} min (before scenario scaling)`}
              mono={false}
            />
          )}
          {isRec && delay?.max_delay_minutes !== undefined && (
            <InfoRow label="Max Delay" value={`${delay.max_delay_minutes} min`} />
          )}
          {isRec && delay?.stations_measured !== undefined && (
            <InfoRow label="Measured At" value={`${delay.stations_measured} stations`} mono={false} />
          )}
          <InfoRow
            label="Source"
            value={
              <span
                className={`text-[9px] mono px-1.5 py-0.5 rounded inline-block ${
                  (isRec && isLogiFlowVerifiedDelaySource(delay?.delay_data_source)) ||
                  (isRec && isLogiFlowMlDelaySource(delay?.delay_data_source)) ||
                  (!isRec &&
                    (isLogiFlowVerifiedDelaySource(delaySrc) ||
                      isLogiFlowMlDelaySource(delaySrc)))
                    ? 'bg-tertiary/10 text-tertiary'
                    : 'bg-surface-container text-outline'
                }`}
              >
                {isRec
                  ? formatRailDelaySource(delay?.delay_data_source)
                  : formatRailDelaySource(delaySrc)}
              </span>
            }
            mono={false}
          />
        </div>
      </section>

      {/* Explanation */}
      {llmExplanation && (
        <section>
          <SectionHeader icon="lightbulb" title="Why this recommendation" />
          <div className="bg-surface-container/20 rounded-xl border border-outline-variant/8 p-3">
            <ul className="space-y-1.5 text-[11px] text-on-surface-variant leading-relaxed">
              {llmExplanation
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean)
                .slice(0, 5)
                .map((line, i) => (
                  <li key={`${line}-${i}`} className="flex gap-2">
                    <span className="text-primary/70 shrink-0">•</span>
                    <span>{line.replace(/^[-*]\s*/, '')}</span>
                  </li>
                ))}
            </ul>
          </div>
        </section>
      )}

      {/* Station delays */}
      {trainDelayDetail?.route && trainDelayDetail.route.length > 0 && (
        <section>
          <SectionHeader icon="timeline" title="Station Delays" />
          <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
            {trainDelayDetail.route.slice(0, 40).map((row, i) => (
              <div
                key={`${row.stationCode}-${i}`}
                className="flex justify-between text-[10px] mono bg-surface-container/25 rounded px-2 py-1 border border-outline-variant/6"
              >
                <span className="text-on-surface">{row.stationCode}</span>
                <span className="text-outline">
                  arr {row.arrivalDelayMinutes}m · dep {row.departureDelayMinutes}m
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Live tracking */}
      <section>
        <SectionHeader icon="my_location" title="Live Tracking" />
        <div className="bg-surface-container/20 rounded-xl border border-outline-variant/8 p-3">
          {liveEntries.length > 0 ? (
            <ul className="space-y-1.5 text-[10px] mono text-on-surface-variant break-words">
              {liveEntries.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary/50 shrink-0 mt-px">›</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-outline">
              No live data for the current selection.
            </p>
          )}
        </div>
      </section>

      {/* Route segments */}
      {segments.length > 0 && (
        <section>
          <SectionHeader icon="route" title="Route Segments" />
          <div className="space-y-1.5">
            {segments.map((seg, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-[11px] bg-surface-container/20 rounded-lg px-2.5 py-2 border border-outline-variant/8"
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    i === 0 ? 'bg-tertiary' : i === segments.length - 1 ? 'bg-error' : 'bg-primary/60'
                  }`}
                />
                <span className="text-on-surface truncate">{seg.from_name || seg.from}</span>
                <span
                  className="material-symbols-outlined text-outline shrink-0"
                  style={{ fontSize: '11px' }}
                >
                  arrow_forward
                </span>
                <span className="text-on-surface truncate">{seg.to_name || seg.to}</span>
                {seg.distance_km != null && (
                  <span className="text-[10px] mono text-outline shrink-0 ml-auto">
                    {seg.distance_km}km
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────

export default function RailwayDashboard() {
  const {
    source,
    destination,
    recommendations,
    allOptions,
    selectedOptionIndex,
    setSelectedOptionIndex,
    loading,
    loadingMode,
    hasSearched,
    activeView,
    setActiveView,
    trainDelayDetail,
    selectedTrainLive,
    error,
    resetSearch,
    setLiveMapMode,
    routeMetadata,
  } = useLogiFlowStore();

  const [selectedRecType, setSelectedRecType] = useState<'cheapest' | 'fastest' | 'safest'>('cheapest');
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null);
  const [routeStops, setRouteStops] = useState<RouteGeometryStop[]>([]);
  const [geometryLoading, setGeometryLoading] = useState(false);

  const activeRec = activeView === 'recommendations' ? recommendations[selectedRecType] : null;
  const activeOption = activeView === 'all_options' ? allOptions[selectedOptionIndex] : null;

  const activeTrainNumber = activeRec?.train_number || activeOption?.train_number || '';
  const activeTrainName = activeRec?.train_name || activeOption?.train_name || '';
  const activeSegments = activeRec?.segments || activeOption?.segments || [];

  useEffect(() => {
    if (!hasSearched || loading) return;
    setLiveMapMode('route');
  }, [hasSearched, loading, setLiveMapMode]);

  useEffect(() => {
    const trainNo = activeRec?.train_number || activeOption?.train_number || '';
    const segments = activeRec?.segments || activeOption?.segments || [];
    const controller = new AbortController();

    if (!trainNo || !segments.length) {
      setRouteGeometry(null);
      setRouteStops([]);
      setGeometryLoading(false);
      return () => controller.abort();
    }

    setGeometryLoading(true);

    void ensureBackendWarm(120_000)
      .then(() => buildTrainCorridorGeometry(trainNo, segments, controller.signal))
      .then((result) => {
        if (controller.signal.aborted) return;
        setRouteGeometry(result.geometry.length >= 2 ? result.geometry : null);
        setRouteStops(result.stops);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setRouteGeometry(null);
        setRouteStops([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setGeometryLoading(false);
      });

    return () => controller.abort();
  }, [activeRec, activeOption]);

  const showRailLoading = loading && loadingMode === 'rail';
  const showNoRoutePage =
    !!error &&
    /route is not available right now|no train routes found|no feasible routes found/i.test(error);

  // ── Landing ───────────────────────────────────────────────────────
  if (!hasSearched) {
    return (
      <div className="flex-1 flex flex-col overflow-x-hidden">
        {showRailLoading && <RailwayLoading />}
        <PipelineModeLanding mode="rail">
          <div className="space-y-6">
            <InputForm />
            <RailMlQuantifiers variant="panel" />
          </div>
        </PipelineModeLanding>
      </div>
    );
  }

  if (!loading && showNoRoutePage) {
    return (
      <div className="flex-1 flex flex-col overflow-x-hidden">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-(--color-background)">
          <div className="max-w-xl w-full rounded-2xl border border-outline-variant/15 bg-surface-container-low/40 p-8 text-center">
            <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary">train</span>
            </div>
            <h2 className="text-xl font-semibold text-on-surface mb-2">Route Not Available Right Now</h2>
            <p className="text-sm text-on-surface-variant mb-6">
              Sorry, this train route does not exist right now on ConfirmTkt. We are continuously
              expanding route coverage.
            </p>
            <button
              onClick={resetSearch}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition"
            >
              Try Another Route
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Results dashboard ─────────────────────────────────────────────
  return (
    <div className="flex flex-col w-full bg-background text-foreground lg:h-[calc(100dvh-4rem)] lg:max-h-[calc(100dvh-4rem)] lg:overflow-hidden">
      {showRailLoading && <RailwayLoading />}

      <PipelineResultsChrome mode="rail" />

      {routeMetadata?.simulation && (
        <div className="bg-rail/10 border-b border-rail/20 px-4 py-2 text-xs text-on-surface-variant flex items-center gap-2 shrink-0">
          <span className="material-symbols-outlined shrink-0 text-sm text-rail">science</span>
          <span>
            LogiFlow simulation — ML delay baseline scaled by your season, weather, congestion,
            and departure-hour scenario (not live feeds).
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-error/10 border-b border-error/20 px-4 py-2 text-xs text-error flex items-start gap-2 shrink-0">
          <span className="material-symbols-outlined shrink-0 text-sm">error</span>
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      {/* List | map | detail — road-style map column on desktop */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-12 lg:overflow-hidden">
        {/* Train list */}
        <aside className="flex min-h-0 w-full shrink-0 flex-col border-b border-outline-variant/8 bg-surface-container-low/30 max-h-[min(38vh,340px)] lg:col-span-3 lg:max-h-none lg:h-auto lg:border-b-0 lg:border-r">
          {/* Toggle */}
          <div className="p-3 pb-2 shrink-0">
            <div className="flex bg-surface-container/50 rounded-lg p-0.5 border border-outline-variant/8">
              <button
                onClick={() => setActiveView('recommendations')}
                className={`flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all ${
                  activeView === 'recommendations'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Top Picks
              </button>
              <button
                onClick={() => setActiveView('all_options')}
                className={`flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all ${
                  activeView === 'all_options'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                All ({allOptions.length})
              </button>
            </div>
          </div>

          {/* Cards */}
          <div className="flex-1 overflow-y-auto p-3 pt-1 space-y-2.5 min-h-0">
            {loading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <span className="material-symbols-outlined text-3xl text-primary animate-spin">
                  progress_activity
                </span>
                <span className="text-xs text-on-surface-variant">Optimizing routes...</span>
              </div>
            )}

            {!loading && activeView === 'recommendations' && (
              <>
                {recommendations.cheapest && (
                  <RecCard
                    rec={recommendations.cheapest}
                    label="Cheapest"
                    icon="savings"
                    accentBar="bg-emerald-500"
                    iconChipClass="bg-emerald-500/15 text-emerald-400"
                    isActive={selectedRecType === 'cheapest'}
                    onClick={() => setSelectedRecType('cheapest')}
                  />
                )}
                {recommendations.fastest && (
                  <RecCard
                    rec={recommendations.fastest}
                    label="Fastest"
                    icon="bolt"
                    accentBar="bg-amber-500"
                    iconChipClass="bg-amber-500/15 text-amber-400"
                    isActive={selectedRecType === 'fastest'}
                    onClick={() => setSelectedRecType('fastest')}
                  />
                )}
                {recommendations.safest && (
                  <RecCard
                    rec={recommendations.safest}
                    label="Safest"
                    icon="shield"
                    accentBar="bg-blue-500"
                    iconChipClass="bg-blue-500/15 text-blue-400"
                    isActive={selectedRecType === 'safest'}
                    onClick={() => setSelectedRecType('safest')}
                  />
                )}
              </>
            )}

            {!loading &&
              activeView === 'all_options' &&
              allOptions.map((opt, i) => (
                <OptionRow
                  key={`${opt.train_number}-${i}`}
                  opt={opt}
                  isActive={i === selectedOptionIndex}
                  onClick={() => setSelectedOptionIndex(i)}
                />
              ))}
          </div>
        </aside>

        {/* Map — sticky center column like road results */}
        <section className="flex min-h-[240px] shrink-0 flex-col border-b border-outline-variant/8 bg-surface-container-lowest/40 p-3 sm:min-h-[280px] sm:p-4 lg:col-span-5 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-7rem)] lg:border-b-0 lg:border-r">
          <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
              <span
                className="material-symbols-outlined text-primary"
                style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
              >
                map
              </span>
              Route on map
            </span>
            <span className="max-w-[min(100%,240px)] truncate text-[10px] font-mono text-on-surface-variant">
              {activeTrainNumber
                ? `${activeTrainNumber} · ${activeTrainName}`
                : 'Select a train'}
              {geometryLoading ? ' · …' : ''}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-outline-variant/15">
            <RailwayMap
              selectedRec={activeRec}
              selectedOption={activeOption}
              highlightType={activeView === 'recommendations' ? selectedRecType : 'selected'}
              routeGeometry={routeGeometry}
              routeStops={routeStops}
            />
          </div>
        </section>

        {/* Train detail */}
        <aside className="min-h-0 overflow-y-auto bg-surface-container-lowest/35 p-4 sm:p-5 lg:col-span-4">
          <DetailPanel
            rec={activeRec}
            ranked={activeOption}
            trainDelayDetail={trainDelayDetail}
            selectedTrainLive={selectedTrainLive as Record<string, unknown> | null}
          />
        </aside>
      </main>
    </div>
  );
}
