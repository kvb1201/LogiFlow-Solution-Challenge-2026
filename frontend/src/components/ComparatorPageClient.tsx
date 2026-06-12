'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  optimizeHybridRoute,
  TrafficQueueError,
  type AiConstraintsApplied,
  type HybridComparisonRow,
  type HybridOptimizeResult,
} from '@/services/api';
import dynamic from 'next/dynamic';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import ParagraphInputWithStt from '@/components/ParagraphInputWithStt';
import { CorridorRow } from '@/components/forms/pipeline-form-ui';
import { ensureBackendWarm } from '@/lib/backendWarmup';
import {
  markShipmentAutorunStarted,
  shouldRunShipmentAutorun,
  syncAutorunFromSession,
} from '@/lib/shipmentAutorun';
import { useShipmentAutorun } from '@/hooks/useShipmentAutorun';
import { BACKEND_UNAVAILABLE_MSG } from '@/services/api';
import { sanitizeUserMessage } from '@/lib/user-facing-messages';
import { SaveReportModal } from '@/components/planner/SaveReportModal';
import MultimodalPipelineLoading from '@/components/MultimodalPipelineLoading';
import { InvalidCorridorInline } from '@/components/InvalidCorridorCard';
import { usePlannerRegenerateParams } from '@/hooks/usePlannerRegenerateParams';
import AiBriefPanel from '@/components/AiBriefPanel';
import { useIntentFormReset } from '@/hooks/useIntentFormReset';
import { HeroMetricsGrid } from '@/components/cockpit/HeroMetricsGrid';
import { PipelineLogiLanding } from '@/components/cockpit/PipelineLogiLanding';
import { PipelineResultsLayout } from '@/components/cockpit/PipelineResultsLayout';
import { AmbientSurface } from '@/components/cockpit/AmbientSurface';
import { ModeIcon } from '@/components/cockpit/ModeIcon';
import { accentMix, accentVar, PIPELINE_ACTION_PRIMARY, PIPELINE_ACTION_SECONDARY } from '@/lib/pipeline-theme';
import { modeMeta } from '@/lib/mode-meta';
import {
  COMPARATOR_CAPABILITY_BADGES,
  COMPARATOR_HERO_METRICS,
} from '@/lib/comparator-metrics';
import { ComparatorModePicks } from '@/components/comparator/ComparatorModePicks';

const MapView = dynamic(() => import('@/components/Mapview'), { ssr: false });

type Priority = 'cost' | 'time' | 'balanced' | 'safety';
type Mode = 'road' | 'rail' | 'air' | 'water';

const DEMO_SOURCE = 'Delhi';
const DEMO_DEST = 'Mumbai';
const DEMO_SCENARIO =
  'Monsoon season, perishable pharma cargo, max budget ₹8,000, must arrive within 36 hours — avoid high-risk air if weather is poor.';

const MODE_META: Record<
  Mode,
  { label: string; tint: string; cardTint: string; symbol: string }
> = {
  road: {
    label: 'Road',
    tint: 'text-secondary',
    cardTint: 'border-secondary/35 bg-secondary/10',
    symbol: 'local_shipping',
  },
  rail: {
    label: 'Rail',
    tint: 'text-rail',
    cardTint: 'border-rail/35 bg-rail/10',
    symbol: 'train',
  },
  air: {
    label: 'Air',
    tint: 'text-sky-300',
    cardTint: 'border-sky-400/35 bg-sky-400/10',
    symbol: 'flight_takeoff',
  },
  water: {
    label: 'Water',
    tint: 'text-teal-300',
    cardTint: 'border-teal-400/35 bg-teal-400/10',
    symbol: 'directions_boat',
  },
};

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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

function normalizeMode(value: unknown): Mode | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'road' || v === 'rail' || v === 'air' || v === 'water') return v;
  return null;
}

function ComparisonScoreboard({
  rows,
  recommendedMode,
}: {
  rows: HybridComparisonRow[];
  recommendedMode: Mode | null;
}) {
  const validRows = rows.filter((row) => normalizeMode(row.mode));
  if (!validRows.length) return null;

  const minTime = Math.min(...validRows.map((row) => toNum(row.time_hr) ?? Number.POSITIVE_INFINITY));
  const minCost = Math.min(...validRows.map((row) => toNum(row.cost_inr) ?? Number.POSITIVE_INFINITY));

  return (
    <AmbientSurface mode="comparator" mesh="section" className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/25 px-4 py-3 sm:px-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Scoreboard</p>
          <p className="font-headline text-sm font-bold text-foreground sm:text-base">Delay-adjusted comparison</p>
        </div>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">4 modes</span>
      </div>
      <ul className="divide-y divide-border/20">
        {validRows.map((row) => {
          const mode = normalizeMode(row.mode) as Mode;
          const time = toNum(row.time_hr);
          const cost = toNum(row.cost_inr);
          const isRec = mode === recommendedMode;
          const accent = modeMeta[mode].accent;

          return (
            <li
              key={`row-${mode}`}
              className="px-4 py-3 transition-colors sm:px-5 sm:py-3.5"
              style={
                isRec
                  ? { background: accentMix('comparator', 6, 'transparent') }
                  : undefined
              }
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-background/40 backdrop-blur-sm"
                    style={{ color: accent, boxShadow: `0 0 20px -8px ${accentVar(mode)}` }}
                  >
                    <ModeIcon mode={mode} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{MODE_META[mode].label}</span>
                      {isRec && (
                        <span
                          className="rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em]"
                          style={{
                            color: accentVar('comparator'),
                            borderColor: accentMix('comparator', 28, 'transparent'),
                            background: accentMix('comparator', 8, 'transparent'),
                          }}
                        >
                          Pick
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground sm:line-clamp-1">
                      {row.explanation?.trim() || 'Scored on time, cost, and risk for your priority.'}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                  {[
                    {
                      label: 'Time',
                      value: formatHours(time),
                      tag: time != null && time === minTime ? 'fastest' : null,
                    },
                    {
                      label: 'Cost',
                      value: formatInr(cost),
                      tag: cost != null && cost === minCost ? 'cheapest' : null,
                    },
                    { label: 'Risk', value: formatRisk(row.risk), tag: null },
                  ].map(({ label, value, tag }) => (
                    <div
                      key={label}
                      className="min-w-[4.5rem] rounded-lg border border-border/30 bg-surface/10 px-2.5 py-1.5 text-center backdrop-blur-sm"
                    >
                      <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        {label}
                      </div>
                      <div className="mt-0.5 font-headline text-sm font-bold tabular-nums text-foreground">
                        {value}
                      </div>
                      {tag && (
                        <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400/90">
                          {tag}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </AmbientSurface>
  );
}

function ComparatorWinnerHero({
  recommendedMode,
  recommendedRow,
  reason,
}: {
  recommendedMode: Mode | null;
  recommendedRow: HybridComparisonRow | null;
  reason?: string | null;
}) {
  const metrics = [
    { value: formatHours(recommendedRow?.time_hr), label: 'Time' },
    { value: formatInr(recommendedRow?.cost_inr), label: 'Cost' },
    { value: formatRisk(recommendedRow?.risk), label: 'Risk' },
  ];

  return (
    <AmbientSurface mode="comparator" mesh="section" className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {recommendedMode ? (
            <>
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-background/45 backdrop-blur-sm"
                style={{
                  color: modeMeta[recommendedMode].accent,
                  boxShadow: `0 0 32px -10px ${accentVar(recommendedMode)}`,
                }}
              >
                <ModeIcon mode={recommendedMode} className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                  Recommended mode
                </p>
                <h2
                  className="font-headline text-2xl font-bold tracking-tight sm:text-3xl"
                  style={{ color: modeMeta[recommendedMode].accent }}
                >
                  {MODE_META[recommendedMode].label}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">Best fit for your priority and constraints</p>
              </div>
            </>
          ) : (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Result</p>
              <h2 className="font-headline text-xl font-bold text-foreground">No single mode won</h2>
            </div>
          )}
        </div>
        <HeroMetricsGrid metrics={metrics} mode={recommendedMode ?? 'comparator'} className="lg:justify-end" />
      </div>
      {reason?.trim() && (
        <p className="mt-4 border-t border-border/25 pt-3 text-sm leading-relaxed text-muted-foreground">
          {reason.trim()}
        </p>
      )}
    </AmbientSurface>
  );
}

function AiConstraintsPanel({ ai }: { ai: AiConstraintsApplied }) {
  const c = ai.constraints || {};
  const chips: string[] = [];
  if (ai.priority) chips.push(`Priority → ${ai.priority}`);
  if (c.budget_max_inr) chips.push(`Budget cap ₹${Math.round(c.budget_max_inr)}`);
  if (c.delay_tolerance_hours) chips.push(`Deadline ${c.delay_tolerance_hours}h`);
  if (c.risk_threshold != null) chips.push(`Max risk ${Math.round(Number(c.risk_threshold) * 100)}%`);
  if (c.excluded_modes?.length) chips.push(`Exclude: ${c.excluded_modes.join(', ')}`);

  return (
    <AmbientSurface mode="comparator" mesh={false} className="px-4 py-3 sm:px-5">
      <div className="flex items-start gap-3">
        <span
          className="material-symbols-outlined shrink-0 text-base"
          style={{ color: accentVar('comparator'), fontVariationSettings: "'FILL' 1" }}
        >
          auto_awesome
        </span>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Shipment understood
          </p>
          <p className="text-sm leading-relaxed text-foreground/90">
            {ai.scenario_summary || 'Scenario parsed into optimization constraints before scoring.'}
          </p>
          {chips.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-border/35 bg-surface/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground backdrop-blur-sm"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </AmbientSurface>
  );
}

export default function ComparatorPageClient() {
  usePlannerRegenerateParams('comparator');

  const source = useLogiFlowStore((s) => s.source);
  const setSource = useLogiFlowStore((s) => s.setSource);
  const destination = useLogiFlowStore((s) => s.destination);
  const setDestination = useLogiFlowStore((s) => s.setDestination);
  const priority = useLogiFlowStore((s) => s.priority);
  const setPriority = useLogiFlowStore((s) => s.setPriority);
  const cargoWeight = useLogiFlowStore((s) => s.cargoWeight);
  const setCargoWeight = useLogiFlowStore((s) => s.setCargoWeight);
  const cargoType = useLogiFlowStore((s) => s.cargoType);
  const setCargoType = useLogiFlowStore((s) => s.setCargoType);
  const budgetMax = useLogiFlowStore((s) => s.budgetMax);
  const setBudgetMax = useLogiFlowStore((s) => s.setBudgetMax);
  const departureDate = useLogiFlowStore((s) => s.departureDate);
  const deadlineHours = useLogiFlowStore((s) => s.deadlineHours);
  const storeScenarioBrief = useLogiFlowStore((s) => s.scenarioBrief);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [scenarioBrief, setScenarioBrief] = useState(() => useLogiFlowStore.getState().scenarioBrief || '');
  const [loading, setLoading] = useState(false);
  const [autoTriggered, setAutoTriggered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HybridOptimizeResult | null>(null);
  const [saveMode, setSaveMode] = useState<Mode | null>(null);

  const loadDemo = useCallback(() => {
    setSource(DEMO_SOURCE);
    setDestination(DEMO_DEST);
    setScenarioBrief(DEMO_SCENARIO);
    setPriority('balanced');
    setCargoWeight(120);
    setCargoType('Perishable');
    setBudgetMax(8000);
    setStep(2);
    setError(null);
    setResult(null);
  }, [setSource, setDestination, setPriority, setCargoWeight, setCargoType, setBudgetMax]);

  const comparisonRows = useMemo(
    () => (Array.isArray(result?.comparison) ? result!.comparison! : []),
    [result]
  );
  const recommendedMode = normalizeMode(result?.recommended_mode);
  const recommendedRow = useMemo(() => {
    if (!comparisonRows.length || !recommendedMode) return null;
    return comparisonRows.find((row) => normalizeMode(row.mode) === recommendedMode) ?? null;
  }, [comparisonRows, recommendedMode]);

  const runOptimize = useCallback(async () => {
    const state = useLogiFlowStore.getState();
    const origin = state.source.trim();
    const dest = state.destination.trim();
    if (!origin || !dest) return;

    const brief = (scenarioBrief || state.scenarioBrief || '').trim();
    setError(null);
    setLoading(true);
    setStep(3);
    setAutoTriggered(true);

    try {
      const warm = await ensureBackendWarm(90_000);
      if (!warm) throw new Error(BACKEND_UNAVAILABLE_MSG);

      const data = await optimizeHybridRoute({
        source: origin,
        destination: dest,
        priority: state.priority,
        departure_date: state.departureDate,
        cargo_weight_kg: state.cargoWeight,
        cargo_type: state.cargoType,
        scenario_brief: brief || undefined,
        cargo: { weight: state.cargoWeight, type: state.cargoType.toLowerCase() },
        constraints: {
          budget_max_inr: state.budgetMax,
          budget_limit: state.budgetMax,
          delay_tolerance_hours: state.deadlineHours,
        },
      });
      if ((data as { error?: string }).error) {
        throw new Error((data as { error?: string }).error);
      }
      setResult(data);
    } catch (err: unknown) {
      if (err instanceof TrafficQueueError) return;
      setResult(null);
      setError(
        sanitizeUserMessage(
          err instanceof Error
            ? err.message
            : 'Optimization failed. Try the demo corridor or simplify constraints.'
        )
      );
    } finally {
      setLoading(false);
    }
  }, [scenarioBrief]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runOptimize();
  }

  const runOptimizeRef = useRef(runOptimize);
  runOptimizeRef.current = runOptimize;

  const corridorReady = Boolean(source.trim() && destination.trim());

  const beginOptimizeRun = useCallback(() => {
    setResult(null);
    setError(null);
    setAutoTriggered(true);
    setStep(3);
    setLoading(true);
    void runOptimizeRef.current();
  }, []);

  useEffect(() => {
    if (storeScenarioBrief?.trim()) {
      setScenarioBrief(storeScenarioBrief);
    }
  }, [storeScenarioBrief]);

  useShipmentAutorun('comparator', beginOptimizeRun, corridorReady);

  const onIntentApplied = useIntentFormReset((_parsed, action) => {
    setError(null);
    setResult(null);
    if (action === 'run') {
      if (storeScenarioBrief?.trim()) setScenarioBrief(storeScenarioBrief);
      return;
    }
    setAutoTriggered(false);
    setStep(1);
  });

  useLayoutEffect(() => {
    syncAutorunFromSession();
    if (!shouldRunShipmentAutorun('comparator')) return;

    const state = useLogiFlowStore.getState();
    if (!state.source.trim() || !state.destination.trim()) return;

    if (state.scenarioBrief?.trim()) {
      setScenarioBrief(state.scenarioBrief);
    }
    markShipmentAutorunStarted('comparator');
    beginOptimizeRun();
  }, [beginOptimizeRun]);

  const inResultsView = loading || Boolean(result) || Boolean(error && autoTriggered);

  function resetToEdit() {
    setResult(null);
    setError(null);
    setAutoTriggered(false);
    setStep(1);
  }

  const stepDots = (
    <div className="flex items-center gap-2 mb-6">
      {[
        { n: 1, label: 'Corridor' },
        { n: 2, label: 'Scenario' },
        { n: 3, label: 'Decision' },
      ].map(({ n, label }) => (
        <button
          key={n}
          type="button"
          onClick={() => !loading && setStep(n as 1 | 2 | 3)}
          className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
            step === n ? 'text-foreground' : 'text-muted-foreground hover:text-on-surface-variant'
          }`}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: step >= n ? 'var(--comparator)' : 'var(--border)' }}
          />
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={loadDemo}
        className="ml-auto text-[11px] text-muted-foreground hover:brightness-110"
      >
        Demo
      </button>
    </div>
  );

  const saveModal = (
    <SaveReportModal
      isOpen={saveMode !== null}
      onClose={() => setSaveMode(null)}
      prefill={{
        source,
        destination,
        stops: [],
        mode: 'comparator',
        cargoType,
        optimizationInput: { priority },
        optimizationResult: saveMode
          ? ({
              ...(result?.best_per_mode?.[saveMode] || {}),
              selected_from_comparator: true,
              selected_mode: saveMode,
            } as Record<string, unknown>)
          : undefined,
        estimatedCost: saveMode
          ? (result?.best_per_mode?.[saveMode]?.cost_inr ??
            result?.best_per_mode?.[saveMode]?.cost ??
            undefined)
          : undefined,
        estimatedTime: saveMode
          ? (result?.best_per_mode?.[saveMode]?.time_hr ??
            result?.best_per_mode?.[saveMode]?.time ??
            undefined)
          : undefined,
        riskScore: saveMode ? (result?.best_per_mode?.[saveMode]?.risk ?? undefined) : undefined,
      }}
    />
  );

  const resultsBody = result && !loading && (
    <div className="animate-fade-in space-y-4 pb-6">
      {result.demo_mode && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/90 backdrop-blur-sm">
          Demo snapshot
        </span>
      )}

      {result.ai_constraints && <AiConstraintsPanel ai={result.ai_constraints} />}

      <ComparatorWinnerHero
        recommendedMode={recommendedMode}
        recommendedRow={recommendedRow}
        reason={result.reason?.trim() || 'Recommendation based on multimodal scoring.'}
      />

      <ComparisonScoreboard rows={comparisonRows} recommendedMode={recommendedMode} />

      <ComparatorModePicks
        result={result}
        recommendedMode={recommendedMode}
        comparisonRows={comparisonRows}
        onSaveMode={setSaveMode}
      />

      {(() => {
        const unavailableModes = Array.isArray(result.unavailable_modes) ? result.unavailable_modes : [];
        return unavailableModes.length > 0 ? (
          <AmbientSurface mode="comparator" mesh={false} className="space-y-2 px-4 py-3 sm:px-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Unavailable modes
            </p>
            {unavailableModes.map((entry, entryIdx) => {
              const modeRaw =
                typeof entry === 'object' && entry !== null ? String(entry.mode ?? '') : String(entry ?? '');
              const reasonRaw =
                typeof entry === 'object' && entry !== null
                  ? String(entry.reason ?? 'Not available for this corridor.')
                  : 'Not available for this corridor.';
              return (
                <InvalidCorridorInline
                  key={modeRaw || `unavail-${entryIdx}`}
                  mode={modeRaw}
                  reason={reasonRaw}
                />
              );
            })}
          </AmbientSurface>
        ) : null;
      })()}

      {Array.isArray(result.tradeoffs) && result.tradeoffs.length > 0 && (
        <AmbientSurface mode="comparator" mesh={false} className="p-4 sm:p-5">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Tradeoffs</p>
          <ul className="space-y-1.5">
            {result.tradeoffs.map((line, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                <span style={{ color: accentVar('comparator') }}>·</span>
                {line}
              </li>
            ))}
          </ul>
        </AmbientSurface>
      )}

      {(() => {
        const road = result.best_per_mode?.road;
        const geometry = road?.geometry;
        if (!Array.isArray(geometry) || geometry.length < 2) return null;
        const waypoints = Array.isArray((road as { waypoints?: string[] }).waypoints)
          ? (road as { waypoints: string[] }).waypoints
          : undefined;

        return (
          <AmbientSurface
            mode="road"
            mesh="section"
            className="min-h-[280px] h-[min(52vh,360px)] overflow-hidden sm:h-[360px]"
            innerClassName="flex h-full min-h-0 flex-col p-3 sm:p-4"
          >
            <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Road corridor map
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {formatHours(road?.time_hr ?? road?.time)} · {formatInr(road?.cost_inr ?? road?.cost)}
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <MapView
                key={`comparator-road-${geometry.length}-${geometry[0]?.join?.(',') ?? ''}`}
                routes={[
                  {
                    geometry,
                    time: road?.time_hr ?? road?.time ?? 0,
                    cost: road?.cost_inr ?? road?.cost ?? 0,
                    risk: road?.risk ?? 0,
                  },
                ]}
                selectedRoute={0}
                waypoints={waypoints}
              />
            </div>
          </AmbientSurface>
        );
      })()}

      <button
        type="button"
        onClick={() => {
          setStep(2);
          setResult(null);
        }}
        className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Adjust scenario and re-run
      </button>
    </div>
  );

  if (!inResultsView) {
    return (
      <>
        <PipelineLogiLanding
          mode="comparator"
          badge="Comparator · AI multimodal planner"
          description={
            <>
              Compare{' '}
              <span style={{ color: accentVar('comparator') }} className="font-medium">
                road, rail, air, and water
              </span>{' '}
              on delay-adjusted time, cost, and risk — describe your shipment in plain English first.
            </>
          }
          metrics={<HeroMetricsGrid metrics={COMPARATOR_HERO_METRICS} mode="comparator" />}
          badges={COMPARATOR_CAPABILITY_BADGES}
          actions={
            <>
              <button
                type="button"
                onClick={loadDemo}
                className={`${PIPELINE_ACTION_PRIMARY} text-white`}
                style={{ background: accentVar('comparator') }}
              >
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                  play_circle
                </span>
                Run demo · Delhi → Mumbai
              </button>
              <Link href="/hybrid" className={PIPELINE_ACTION_SECONDARY}>
                Hybrid chains
              </Link>
            </>
          }
          footer={
            <p className="text-[10px] text-outline/50 uppercase tracking-[0.2em] font-label">
              LogiFlow comparator decision engine · explainable 4-mode scoring
            </p>
          }
        >
          <AiBriefPanel contextMode="comparator" className="mb-6" onIntentApplied={onIntentApplied} />
          {stepDots}
          <form id="logiflow-pipeline-form" onSubmit={onSubmit}>
            {step === 1 && (
              <AmbientSurface mode="comparator" mesh="card" className="space-y-4 p-4 sm:p-5">
                <h2 className="text-base font-bold text-on-surface">Where is the shipment moving?</h2>
                <CorridorRow
                  accentVar="--comparator"
                  swapDisabled={!source.trim() && !destination.trim()}
                  onSwap={() => {
                    const t = source;
                    setSource(destination);
                    setDestination(t);
                  }}
                >
                  <label className="block">
                    <span className="text-xs text-muted-foreground mb-1.5 block">From</span>
                    <input
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      placeholder="Delhi, India"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background/60 text-sm focus:outline-none focus:ring-1 focus:ring-[color-mix(in_oklab,var(--comparator)_40%,transparent)]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground mb-1.5 block">To</span>
                    <input
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="Mumbai, India"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background/60 text-sm focus:outline-none focus:ring-1 focus:ring-[color-mix(in_oklab,var(--comparator)_40%,transparent)]"
                    />
                  </label>
                </CorridorRow>
                <div className="grid sm:grid-cols-3 gap-3">
                  <label className="block">
                    <span className="text-xs text-muted-foreground mb-1.5 block">Kg</span>
                    <input
                      type="number"
                      value={cargoWeight}
                      onChange={(e) => setCargoWeight(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background/60 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground mb-1.5 block">Cargo type</span>
                    <select
                      value={cargoType}
                      onChange={(e) => setCargoType(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background/60 text-sm"
                    >
                      <option value="General">General</option>
                      <option value="Perishable">Perishable</option>
                      <option value="Fragile">Fragile</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground mb-1.5 block">Max budget (₹)</span>
                    <input
                      type="number"
                      value={budgetMax}
                      onChange={(e) => setBudgetMax(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background/60 text-sm"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!source.trim() || !destination.trim()}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-foreground text-background text-sm font-semibold disabled:opacity-40"
                >
                  Continue
                </button>
              </AmbientSurface>
            )}

            {step === 2 && (
              <AmbientSurface mode="comparator" mesh="card" className="space-y-4 p-4 sm:p-5">
                <div>
                  <h2 className="text-base font-bold text-on-surface">What constraints matter?</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Parsed before comparing modes — can change priority, budget, deadlines, and exclusions.
                  </p>
                </div>
                <ParagraphInputWithStt
                  value={scenarioBrief}
                  onChange={setScenarioBrief}
                  rows={4}
                  placeholder="Monsoon delays expected, budget under ₹10k, must deliver within 48h…"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background/60 text-sm resize-y min-h-[100px]"
                  lang="en-IN"
                />
                <div className="flex flex-wrap gap-2">
                  {['Urgent — minimize time', 'Tight budget', 'Monsoon — avoid air', 'Bulk — prefer rail'].map(
                    (chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setScenarioBrief((prev) => (prev ? `${prev}. ${chip}` : chip))}
                        className="text-xs px-3 py-1.5 rounded-full border border-border/60 bg-surface/30 text-muted-foreground hover:text-foreground"
                      >
                        + {chip}
                      </button>
                    )
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 sm:flex-none px-5 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ background: accentVar('comparator') }}
                  >
                    {loading ? (
                      <>
                        <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Scoring 4 modes…
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-lg">bolt</span>
                        Get recommendation
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2.5 rounded-lg border border-border text-sm text-muted-foreground"
                  >
                    Back
                  </button>
                </div>
              </AmbientSurface>
            )}
          </form>
        </PipelineLogiLanding>
        {saveModal}
      </>
    );
  }

  return (
    <>
      <PipelineResultsLayout
        mode="comparator"
        source={source}
        destination={destination}
        cargoWeight={cargoWeight}
        onEdit={resetToEdit}
      >
        {error && (
          <div className="mb-4 rounded-lg border border-red-400/20 bg-red-500/5 px-4 py-3 text-sm text-red-200 flex flex-col gap-2">
            <div className="flex gap-2 items-start">
              <span className="material-symbols-outlined text-base shrink-0">error</span>
              <span>{error}</span>
            </div>
            {autoTriggered && (
              <button
                type="button"
                onClick={resetToEdit}
                className="self-start text-xs font-semibold text-red-100 underline"
              >
                Edit shipment and try again
              </button>
            )}
          </div>
        )}

        {loading && <MultimodalPipelineLoading variant="optimize" />}
        {resultsBody}
      </PipelineResultsLayout>
      {saveModal}
    </>
  );
}
