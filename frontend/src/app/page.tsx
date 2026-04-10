'use client';

import React, { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import InputForm from '@/components/InputForm';
import RailwayLoading from '@/components/RailwayLoading';
import type { Recommendation, RankedOption } from '@/services/api';

const MapView = dynamic(() => import('@/components/Map'), { ssr: false });

// ── Recommendation Card ──────────────────────────────────────────────

function RecCard({
  rec,
  label,
  icon,
  color,
  isActive,
  onClick,
}: {
  rec: Recommendation;
  label: string;
  icon: string;
  color: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const delay = rec.delay_info;
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 ${
        isActive
          ? `bg-gradient-to-br ${color} border-current shadow-lg scale-[1.01]`
          : 'bg-surface-container-lowest/50 border-outline-variant/10 hover:border-outline-variant/30 hover:bg-surface-container/30'
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-lg">{icon}</span>
        <span className="text-[10px] font-label font-bold uppercase tracking-widest text-on-surface-variant">{label}</span>
      </div>

      <div className="flex justify-between items-baseline mb-2">
        <span className="text-sm font-bold text-on-surface truncate max-w-[65%]">{rec.train_name}</span>
        <span className="mono text-sm font-bold text-primary">₹{rec.parcel_cost_inr?.toLocaleString()}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px] mono">
        <div className="bg-surface-container-low/50 px-2 py-1.5 rounded-lg text-center">
          <div className="text-outline mb-0.5">TIME</div>
          <div className="text-on-surface font-medium">{rec.duration_hours}h</div>
        </div>
        <div className="bg-surface-container-low/50 px-2 py-1.5 rounded-lg text-center">
          <div className="text-outline mb-0.5">RISK</div>
          <div className="text-on-surface font-medium">{rec.risk_pct}</div>
        </div>
        <div className="bg-surface-container-low/50 px-2 py-1.5 rounded-lg text-center">
          <div className="text-outline mb-0.5">DELAY</div>
          <div className="text-on-surface font-medium">
            {delay?.avg_delay_minutes?.toFixed(0) || '?'}m
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2 text-[9px] text-on-surface-variant">
        <span className="material-symbols-outlined text-xs text-primary">train</span>
        <span className="mono">{rec.train_number}</span>
        <span>·</span>
        <span>{rec.train_type}</span>
        {rec.running_days?.length > 0 && (
          <>
            <span>·</span>
            <span>{rec.running_days.length === 7 ? 'Daily' : rec.running_days.join(',')}</span>
          </>
        )}
      </div>

      {rec.data_source && (
        <div className="mt-1.5 text-[9px] text-outline mono truncate" title={rec.data_source}>
          Source: {rec.data_source}
        </div>
      )}

      {delay?.delay_data_source === 'railradar_api_real' && (
        <div className="flex items-center gap-1 mt-2 text-[9px] text-tertiary">
          <span className="material-symbols-outlined text-[10px]">verified</span>
          Real delay data ({delay.stations_measured} stations)
        </div>
      )}
    </div>
  );
}

// ── Ranked Option Row ────────────────────────────────────────────────

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
      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border ${
        isActive
          ? 'bg-surface-container border-primary/30 shadow-md'
          : 'bg-surface-container-lowest/30 border-transparent hover:bg-surface-container/50 hover:border-outline-variant/10'
      }`}
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold mono ${
        isActive ? 'bg-primary text-on-primary' : 'bg-surface-container text-outline'
      }`}>
        {opt.rank}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-on-surface truncate">{opt.train_name}</div>
        <div className="text-[10px] text-on-surface-variant mono">
          {opt.train_number} · {opt.train_type}
          {opt.running_days?.length > 0 && ` · ${opt.running_days.length === 7 ? 'Daily' : opt.running_days.slice(0, 3).join(',')}`}
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="text-sm font-bold mono text-primary">₹{opt.parcel_cost_inr?.toLocaleString()}</div>
        <div className="text-[10px] text-on-surface-variant mono">{opt.effective_hours}h · risk:{(opt.risk_score * 100).toFixed(0)}%</div>
      </div>

      <div className="shrink-0 text-right">
        <div className={`text-[9px] mono px-1.5 py-0.5 rounded ${
          opt.delay_source === 'railradar_api'
            ? 'bg-tertiary/10 text-tertiary'
            : 'bg-surface-container text-outline'
        }`}>
          {opt.avg_delay_min?.toFixed(0)}m delay
        </div>
      </div>
    </div>
  );
}

// ── Detail Panel ─────────────────────────────────────────────────────

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
  mapFocusedTrainNumber,
}: {
  rec: Recommendation | null;
  ranked: RankedOption | null;
  trainDelayDetail: import('@/services/api').TrainDelayData | null;
  selectedTrainLive: Record<string, unknown> | null;
  mapFocusedTrainNumber: string | null;
}) {
  const base = rec ?? ranked;
  const liveEntries = useMemo(() => {
    if (!selectedTrainLive || typeof selectedTrainLive !== 'object') return [];
    const preferred = [
      'currentStationName',
      'currentStation',
      'nextStationName',
      'nextStation',
      'delayMinutes',
      'delay',
      'status',
      'position',
      'speed',
    ];
    const rows: string[] = [];
    const seen = new Set<string>();
    for (const k of preferred) {
      if (k in selectedTrainLive) {
        const line = formatLiveLine(k, (selectedTrainLive as Record<string, unknown>)[k]);
        if (line) {
          rows.push(line);
          seen.add(k);
        }
      }
    }
    for (const [k, v] of Object.entries(selectedTrainLive)) {
      if (seen.has(k) || k === 'success') continue;
      const line = formatLiveLine(k, v);
      if (line && rows.length < 14) rows.push(line);
    }
    return rows;
  }, [selectedTrainLive]);
  if (!base) {
    return (
      <div className="flex items-center justify-center h-full text-on-surface-variant text-sm px-4 text-center">
        Select a recommendation or a ranked route to view delay breakdown and live status
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

  return (
    <div className="space-y-6">
      {mapFocusedTrainNumber && (
        <div className="text-[10px] text-tertiary bg-tertiary/10 border border-tertiary/20 rounded-lg px-3 py-2">
          Map focus: live data for train <span className="mono font-semibold">{mapFocusedTrainNumber}</span>
          {trainNo && mapFocusedTrainNumber !== trainNo && (
            <span className="text-outline"> — route delay below is for {trainNo}</span>
          )}
        </div>
      )}

      {/* Train Info */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-primary text-sm">train</span>
          <h3 className="font-headline text-sm font-semibold uppercase tracking-wider text-on-surface-variant">Train Details</h3>
        </div>
        <div className="bg-surface-container/30 p-4 rounded-xl border border-outline-variant/10 space-y-2">
          <div className="flex justify-between gap-2">
            <span className="text-xs text-outline shrink-0">Train</span>
            <span className="text-sm font-medium mono text-right">{trainNo} {trainName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-outline">Type</span>
            <span className="text-sm">{trainType}</span>
          </div>
          {isRec && (
            <>
              <div className="flex justify-between">
                <span className="text-xs text-outline">Schedule</span>
                <span className="text-sm mono">{rec!.departure} → {rec!.arrival}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-outline">Speed</span>
                <span className="text-sm mono">{rec!.avg_speed_kmph} km/h</span>
              </div>
            </>
          )}
          <div className="flex justify-between">
            <span className="text-xs text-outline">Runs</span>
            <span className="text-sm">
              {(isRec ? rec!.running_days : ranked!.running_days)?.length === 7
                ? 'Daily'
                : (isRec ? rec!.running_days : ranked!.running_days)?.join(', ')}
            </span>
          </div>
          {isRec && (
            <div className="flex justify-between">
              <span className="text-xs text-outline">Van</span>
              <span className="text-sm">{rec!.parcel_van_type}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-xs text-outline">Source</span>
            <span className="text-[10px] mono text-tertiary text-right">
              {isRec ? rec!.data_source : ranked!.data_source}
            </span>
          </div>
        </div>
      </section>

      {/* Cost */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-primary text-sm">payments</span>
          <h3 className="font-headline text-sm font-semibold uppercase tracking-wider text-on-surface-variant">Parcel tariff</h3>
        </div>
        <div className="bg-surface-container/30 p-4 rounded-xl border border-outline-variant/10">
          <div className="flex justify-between items-baseline">
            <span className="text-xs text-outline">Total (parcel)</span>
            <span className="mono text-lg font-bold text-primary">₹{parcelCost?.toLocaleString()}</span>
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-on-surface-variant">
            <span>Distance: {isRec ? rec!.distance_km : ranked!.distance_km} km</span>
            <span>Duration: {durationH}h</span>
          </div>
        </div>
      </section>

      {/* Real Delay Data */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-primary text-sm">schedule</span>
          <h3 className="font-headline text-sm font-semibold uppercase tracking-wider text-on-surface-variant">Delay Analysis</h3>
        </div>
        <div className="bg-surface-container/30 p-4 rounded-xl border border-outline-variant/10 space-y-2">
          <div className="flex justify-between">
            <span className="text-xs text-outline">Avg Delay</span>
            <span className="mono text-sm font-medium">
              {avgDelay != null ? `${Number(avgDelay).toFixed(1)} min` : '?'}
            </span>
          </div>
          {isRec && delay?.max_delay_minutes !== undefined && (
            <div className="flex justify-between">
              <span className="text-xs text-outline">Max Delay</span>
              <span className="mono text-sm">{delay.max_delay_minutes} min</span>
            </div>
          )}
          {isRec && delay?.stations_measured !== undefined && (
            <div className="flex justify-between">
              <span className="text-xs text-outline">Measured At</span>
              <span className="text-sm">{delay.stations_measured} stations</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-xs text-outline">Data Source</span>
            <span className={`text-[10px] mono px-2 py-0.5 rounded ${
              (isRec && delay?.delay_data_source === 'railradar_api_real') || (!isRec && delaySrc === 'railradar_api')
                ? 'bg-tertiary/10 text-tertiary'
                : 'bg-surface-container text-outline'
            }`}>
              {isRec ? delay?.delay_data_source || 'N/A' : delaySrc || 'N/A'}
            </span>
          </div>
        </div>
      </section>

      {/* Station-by-station delay (RailRadar) */}
      {trainDelayDetail?.route && trainDelayDetail.route.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary text-sm">timeline</span>
            <h3 className="font-headline text-sm font-semibold uppercase tracking-wider text-on-surface-variant">Station delays</h3>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {trainDelayDetail.route.slice(0, 40).map((row, i) => (
              <div
                key={`${row.stationCode}-${i}`}
                className="flex justify-between text-[11px] mono bg-surface-container/40 rounded-lg px-2 py-1.5 border border-outline-variant/10"
              >
                <span className="text-on-surface truncate mr-2">{row.stationCode}</span>
                <span className="text-on-surface-variant shrink-0">
                  arr {row.arrivalDelayMinutes}m · dep {row.departureDelayMinutes}m
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Live tracking */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-primary text-sm">my_location</span>
          <h3 className="font-headline text-sm font-semibold uppercase tracking-wider text-on-surface-variant">Live tracking</h3>
        </div>
        <div className="bg-surface-container/30 p-4 rounded-xl border border-outline-variant/10">
          {liveEntries.length > 0 ? (
            <ul className="space-y-1.5 text-[11px] mono text-on-surface-variant break-words">
              {liveEntries.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-outline">No live JSON yet — select a route or tap a train on the map.</p>
          )}
        </div>
      </section>

      {/* Risk */}
      <section className="bg-surface-container/30 p-4 rounded-xl border border-outline-variant/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-outline">RISK</span>
          <span className="mono text-lg font-bold">{riskPct}</span>
        </div>
        <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(100, riskScore * 100)}%`,
              background: riskScore < 0.2 ? '#10b981' : riskScore < 0.4 ? '#f59e0b' : '#ef4444',
            }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[9px] text-outline mono">
          <span>LOW</span>
          <span>HIGH</span>
        </div>
      </section>

      {/* Route Segments */}
      {segments.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary text-sm">route</span>
            <h3 className="font-headline text-sm font-semibold uppercase tracking-wider text-on-surface-variant">Route</h3>
          </div>
          <div className="space-y-2">
            {segments.map((seg, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-on-surface">{seg.from_name || seg.from}</span>
                  <span className="text-outline mx-2">→</span>
                  <span className="text-on-surface">{seg.to_name || seg.to}</span>
                </div>
                {seg.distance_km != null && (
                  <span className="text-xs mono text-on-surface-variant shrink-0">{seg.distance_km} km</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────

export default function Dashboard() {
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
    liveMapMode,
    setLiveMapMode,
    fetchLiveTrains,
    fetchTrainDelayAndLive,
    trainDelayDetail,
    selectedTrainLive,
    mapFocusedTrainNumber,
    error,
    resetSearch,
  } = useLogiFlowStore();

  const [selectedRecType, setSelectedRecType] = useState<'cheapest' | 'fastest' | 'safest'>('cheapest');

  // Fetch live trains on mount and every 30s
  useEffect(() => {
    fetchLiveTrains();
    const interval = setInterval(fetchLiveTrains, 30000);
    return () => clearInterval(interval);
  }, [fetchLiveTrains]);

  const activeRec = activeView === 'recommendations' ? recommendations[selectedRecType] : null;
  const activeOption = activeView === 'all_options' ? allOptions[selectedOptionIndex] : null;
  const hasRailResults = Boolean(
    recommendations.cheapest || recommendations.fastest || recommendations.safest || allOptions.length
  );

  const trainNoForDetail = activeRec?.train_number || activeOption?.train_number;

  useEffect(() => {
    if (!trainNoForDetail) return;
    void fetchTrainDelayAndLive(trainNoForDetail);
  }, [trainNoForDetail, fetchTrainDelayAndLive]);

  // Handle Full-Screen Loading for Railways
  const showRailLoading = loading && loadingMode === 'rail';

  // ── LANDING PAGE ───────────────────────────────────────────────────
  if (!hasSearched) {
    return (
      <div className="w-full min-h-screen flex flex-1 flex-col overflow-x-hidden">
        {showRailLoading && <RailwayLoading />}
        <div className="bg-[#080b12] text-[var(--color-on-surface)] w-full flex-1 flex flex-col items-center justify-start pt-20 pb-10 px-6 relative overflow-x-hidden overflow-y-auto">
          {/* Background */}
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-[#080b12]" />
            <div className="absolute w-[600px] h-[600px] rounded-full opacity-[0.12] blur-[100px] bg-[#498fff] animate-mesh-1 top-[-10%] left-[-5%]" />
            <div className="absolute w-[500px] h-[500px] rounded-full opacity-[0.08] blur-[90px] bg-[#67df70] animate-mesh-2 bottom-[-5%] right-[-5%]" />
            <div className="absolute w-[400px] h-[400px] rounded-full opacity-[0.06] blur-[80px] bg-[#acc7ff] animate-mesh-3 top-[40%] left-[50%]" />
            <div className="absolute w-[350px] h-[350px] rounded-full opacity-[0.05] blur-[70px] bg-[#ffb689] animate-mesh-4 top-[10%] right-[20%]" />
            <div className="absolute inset-0 hero-dot-grid opacity-[0.35]" />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_30%,_#080b12_80%)]" />
          </div>

          <div className="w-full max-w-[900px] z-10 animate-slide-up">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary/10 border border-primary/20 rounded-full mb-6 animate-fade-in">
                <div className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
                <span className="text-[11px] font-semibold tracking-widest uppercase text-primary">Railway Cargo Intelligence · Powered by RailRadar</span>
              </div>

              <h1 className="text-6xl md:text-7xl font-black font-headline tracking-tighter mb-5">
                <span className="bg-gradient-to-r from-primary via-primary-fixed-dim to-primary bg-clip-text text-transparent animate-gradient-shift" style={{ backgroundSize: '200% auto' }}>Logi</span>
                <span className="text-on-surface">Flow</span>
              </h1>
              <p className="text-on-surface-variant max-w-2xl mx-auto font-body text-base leading-relaxed">
                Optimize railway cargo routing with <span className="text-primary font-medium">real Indian Railways data</span>,{' '}
                <span className="text-tertiary font-medium">live train tracking</span>, and{' '}
                <span className="text-secondary font-medium">ML-powered delay prediction</span>.
              </p>

              <div className="flex flex-wrap justify-center gap-3 mt-8">
                {[
                  { icon: 'train', label: 'Real Schedule Data' },
                  { icon: 'speed', label: 'Live Train Tracking' },
                  { icon: 'analytics', label: 'ML Delay Prediction' },
                ].map((feature, i) => (
                  <div
                    key={feature.label}
                    className="flex items-center gap-2 px-3.5 py-2 bg-surface-container/50 border border-outline-variant/10 rounded-lg text-xs text-on-surface-variant backdrop-blur-sm animate-fade-in"
                    style={{ animationDelay: `${0.5 + i * 0.15}s`, animationFillMode: 'backwards' }}
                  >
                    <span className="material-symbols-outlined text-primary text-sm">{feature.icon}</span>
                    {feature.label}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap justify-center gap-3 mt-6">
                <span className="inline-flex items-center gap-2 px-3.5 py-2 bg-secondary/10 border border-secondary/20 rounded-lg text-xs text-secondary">
                  <span className="material-symbols-outlined text-sm">flight</span>
                  Air mode is now available
                </span>
                <Link
                  href="/air"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container border border-outline-variant/15 text-xs font-semibold uppercase tracking-wider text-on-surface-variant hover:text-on-surface hover:border-outline-variant/30 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm text-secondary">open_in_new</span>
                  Open Air Cargo
                </Link>
              </div>
            </div>

            <InputForm />

            <div className="text-center mt-8 animate-fade-in" style={{ animationDelay: '0.8s', animationFillMode: 'backwards' }}>
              <p className="text-[10px] text-outline/50 uppercase tracking-[0.2em] font-label">Powered by RailRadar API · Real Indian Railways Data</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── RESULTS DASHBOARD ──────────────────────────────────────────────
  return (
    <div className="bg-[var(--color-background)] text-[var(--color-on-surface)] font-body flex w-full flex-1 min-h-0 flex-col overflow-x-hidden">
       {showRailLoading && <RailwayLoading />}
      {/* Top Nav */}
      <header className="bg-[var(--color-surface)] border-b border-outline-variant/10 flex justify-between items-center w-full px-6 h-14 shrink-0 relative z-20">
        <div className="flex items-center gap-6">
          <span className="text-lg font-bold tracking-tighter text-primary cursor-pointer" onClick={resetSearch}>LogiFlow</span>
          <div className="flex items-center gap-2 text-on-surface-variant bg-surface-container-low px-3 py-1 rounded-full border border-outline-variant/10">
            <span className="material-symbols-outlined text-xs text-primary">train</span>
            <span className="text-sm font-medium">{source}</span>
            <span className="material-symbols-outlined text-xs text-primary">arrow_forward</span>
            <span className="text-sm font-medium">{destination}</span>
            <button className="material-symbols-outlined text-xs ml-2 text-outline hover:text-primary transition-colors" onClick={resetSearch}>edit</button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live map options */}
          <div className="flex bg-surface-container rounded-full p-1 border border-outline-variant/10">
            <button
              onClick={() => setLiveMapMode('all')}
              className={`px-3 py-1 text-[11px] font-semibold rounded-full transition-all uppercase tracking-wider ${
                liveMapMode === 'all' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              All India
            </button>
            <button
              onClick={() => setLiveMapMode('route')}
              className={`px-3 py-1 text-[11px] font-semibold rounded-full transition-all uppercase tracking-wider ${
                liveMapMode === 'route' ? 'bg-tertiary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Route Focus
            </button>
            <button
              onClick={() => setLiveMapMode('hidden')}
              className={`px-3 py-1 text-[11px] font-semibold rounded-full transition-all uppercase tracking-wider ${
                liveMapMode === 'hidden' ? 'bg-surface-container-highest text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Hide Live
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="bg-error/10 border-b border-error/20 px-6 py-2 text-sm text-error flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">error</span>
          {error}
        </div>
      )}

      <main className="flex-1 flex w-full min-h-0 overflow-y-auto overflow-x-hidden">
        {/* ── Left: Recommendations + Options ── */}
        <aside className="w-[28%] bg-surface-container-low flex flex-col border-r border-outline-variant/5">
          {/* View Toggle */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex bg-surface-container rounded-lg p-1">
              <button
                onClick={() => setActiveView('recommendations')}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-all ${
                  activeView === 'recommendations' ? 'bg-primary text-on-primary shadow' : 'text-on-surface-variant'
                }`}
              >
                Top Picks
              </button>
              <button
                onClick={() => setActiveView('all_options')}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-all ${
                  activeView === 'all_options' ? 'bg-primary text-on-primary shadow' : 'text-on-surface-variant'
                }`}
              >
                All ({allOptions.length})
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading && loadingMode === 'rail' && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <span className="material-symbols-outlined text-3xl text-primary animate-spin">progress_activity</span>
                <span className="text-sm text-on-surface-variant">Optimizing topological routes...</span>
              </div>
            )}
            
            {loading && loadingMode === 'road' && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <span className="material-symbols-outlined text-3xl text-secondary animate-spin">progress_activity</span>
                <span className="text-sm text-on-surface-variant">Calculating road paths...</span>
              </div>
            )}

            {!loading && !hasRailResults && (
              <div className="rounded-2xl border border-outline-variant/15 bg-surface-container-lowest/35 p-4 text-sm text-on-surface-variant leading-relaxed">
                No routes are visible yet. Try selecting station suggestions from the dropdown, then submit again. If the lane is unsupported, the error banner above should explain why.
              </div>
            )}

            {!loading && activeView === 'recommendations' && (
              <>
                {recommendations.cheapest && (
                  <RecCard
                    rec={recommendations.cheapest}
                    label="Cheapest"
                    icon="savings"
                    color="from-emerald-500/15 to-emerald-600/5 border-emerald-500/30"
                    isActive={selectedRecType === 'cheapest'}
                    onClick={() => setSelectedRecType('cheapest')}
                  />
                )}
                {recommendations.fastest && (
                  <RecCard
                    rec={recommendations.fastest}
                    label="Fastest"
                    icon="bolt"
                    color="from-amber-500/15 to-amber-600/5 border-amber-500/30"
                    isActive={selectedRecType === 'fastest'}
                    onClick={() => setSelectedRecType('fastest')}
                  />
                )}
                {recommendations.safest && (
                  <RecCard
                    rec={recommendations.safest}
                    label="Safest"
                    icon="shield"
                    color="from-blue-500/15 to-blue-600/5 border-blue-500/30"
                    isActive={selectedRecType === 'safest'}
                    onClick={() => setSelectedRecType('safest')}
                  />
                )}
              </>
            )}

            {!loading && activeView === 'all_options' && allOptions.map((opt, i) => (
              <OptionRow
                key={`${opt.train_number}-${i}`}
                opt={opt}
                isActive={i === selectedOptionIndex}
                onClick={() => {
                  setSelectedOptionIndex(i);
                }}
              />
            ))}
          </div>
        </aside>

        {/* ── Center: Map ── */}
        <section className="flex-1 relative bg-surface-container-lowest">
          <div className="absolute inset-0 z-0 bg-[#0d1117]">
            <MapView
              selectedRec={activeRec}
              selectedOption={activeOption}
              highlightType={activeView === 'all_options' ? 'selected' : selectedRecType}
            />
          </div>

          {/* Map overlay: selected route summary */}
          {(activeRec || activeOption) && (
            <div className="absolute top-4 left-4 z-10">
              <div className="bg-surface-container-highest/85 backdrop-blur-xl p-3 rounded-xl border border-outline-variant/20 shadow-2xl min-w-[200px]">
                <h3 className="font-label text-[10px] text-primary mb-2 uppercase tracking-widest">Selected Route</h3>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-outline">Train</span>
                    <span className="mono font-medium">{activeRec?.train_number || activeOption?.train_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-outline">Distance</span>
                    <span className="mono">{activeRec?.distance_km || activeOption?.distance_km} km</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-outline">Duration</span>
                    <span className="mono">{activeRec?.duration_hours || activeOption?.effective_hours}h</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-outline">Avg Speed</span>
                    <span className="mono">{activeRec?.avg_speed_kmph || activeOption?.avg_speed_kmph} km/h</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── Right: Detail Panel ── */}
        <aside className="w-[28%] bg-surface-container-lowest overflow-y-auto border-l border-outline-variant/5 p-5">
          <DetailPanel
            rec={activeRec}
            ranked={activeOption}
            trainDelayDetail={trainDelayDetail}
            selectedTrainLive={selectedTrainLive as Record<string, unknown> | null}
            mapFocusedTrainNumber={mapFocusedTrainNumber}
          />
        </aside>
      </main>
    </div>
  );
}
