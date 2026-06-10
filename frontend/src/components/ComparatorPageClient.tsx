'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  optimizeHybridRoute,
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
import { BACKEND_UNAVAILABLE_MSG } from '@/services/api';
import { SaveReportModal } from '@/components/planner/SaveReportModal';
import MultimodalPipelineLoading from '@/components/MultimodalPipelineLoading';
import { InvalidCorridorInline } from '@/components/InvalidCorridorCard';

const MapView = dynamic(() => import('@/components/Mapview'), { ssr: false });

type Priority = 'cost' | 'time' | 'balanced' | 'safety';
type Mode = 'road' | 'rail' | 'air' | 'water';

const DEMO_SOURCE = 'Delhi';
const DEMO_DEST = 'Mumbai';
const DEMO_SCENARIO =
  'Monsoon season, perishable pharma cargo, max budget ₹8,000, must arrive within 36 hours — avoid high-risk air if weather is poor.';

const MODE_META: Record<
  Mode,
  { label: string; icon: string; tint: string; cardTint: string; symbol: string }
> = {
  road: {
    label: 'Road',
    icon: '🚚',
    tint: 'text-secondary',
    cardTint: 'border-secondary/35 bg-secondary/10',
    symbol: 'local_shipping',
  },
  rail: {
    label: 'Rail',
    icon: '🚆',
    tint: 'text-primary',
    cardTint: 'border-primary/35 bg-primary/10',
    symbol: 'train',
  },
  air: {
    label: 'Air',
    icon: '✈️',
    tint: 'text-sky-300',
    cardTint: 'border-sky-400/35 bg-sky-400/10',
    symbol: 'flight_takeoff',
  },
  water: {
    label: 'Water',
    icon: '🚢',
    tint: 'text-teal-300',
    cardTint: 'border-teal-400/35 bg-teal-400/10',
    symbol: 'directions_boat',
  },
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

function ComparisonTable({
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
    <div className="rounded-2xl border border-white/[0.06] bg-[#0c1018]/80 overflow-hidden shadow-[0_24px_80px_-40px_rgba(0,0,0,0.9)]">
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-on-surface tracking-tight">Multimodal comparison</h3>
        <span className="text-[10px] uppercase tracking-widest text-outline">4 modes · delay-adjusted</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-white/[0.03] text-on-surface-variant text-[11px] uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3 text-left font-semibold">Mode</th>
              <th className="px-5 py-3 text-left font-semibold">Time</th>
              <th className="px-5 py-3 text-left font-semibold">Cost</th>
              <th className="px-5 py-3 text-left font-semibold">Risk</th>
              <th className="px-5 py-3 text-left font-semibold hidden md:table-cell">Insight</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {validRows.map((row) => {
              const mode = normalizeMode(row.mode) as Mode;
              const meta = MODE_META[mode];
              const time = toNum(row.time_hr);
              const cost = toNum(row.cost_inr);
              const isRec = mode === recommendedMode;
              return (
                <tr
                  key={`row-${mode}`}
                  className={isRec ? 'bg-primary/[0.08]' : 'hover:bg-white/[0.02] transition-colors'}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${meta.cardTint}`}
                      >
                        <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
                          {meta.symbol}
                        </span>
                      </span>
                      <div>
                        <span className={`font-semibold ${meta.tint}`}>{meta.label}</span>
                        {isRec && (
                          <span className="ml-2 text-[9px] font-bold uppercase tracking-wider text-primary border border-primary/30 rounded-full px-2 py-0.5">
                            Pick
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-on-surface font-mono text-[13px]">
                    {formatHours(time)}
                    {time != null && time === minTime && (
                      <span className="ml-2 text-[9px] text-emerald-400 font-sans font-semibold">fastest</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-on-surface font-mono text-[13px]">
                    {formatInr(cost)}
                    {cost != null && cost === minCost && (
                      <span className="ml-2 text-[9px] text-sky-300 font-sans font-semibold">cheapest</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-on-surface font-mono text-[13px]">{formatRisk(row.risk)}</td>
                  <td className="px-5 py-4 text-on-surface-variant text-xs leading-relaxed hidden md:table-cell max-w-xs">
                    {row.explanation?.trim() || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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
    <div className="rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-500/10 via-transparent to-primary/5 p-5">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-violet-300 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
          auto_awesome
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300 mb-1">
            Shipment understood
          </p>
          <p className="text-sm text-on-surface leading-relaxed">
            {ai.scenario_summary || 'Scenario parsed into optimization constraints before scoring.'}
          </p>
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-violet-400/20 bg-violet-500/10 text-violet-100"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ComparatorPageClient() {
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

  const skipWizard = loading || Boolean(result) || (autoTriggered && !error);

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
      setResult(null);
      setError(
        err instanceof Error
          ? err.message
          : 'Optimization failed. Try the demo corridor or simplify constraints.'
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

  useEffect(() => {
    if (storeScenarioBrief?.trim()) {
      setScenarioBrief(storeScenarioBrief);
    }
  }, [storeScenarioBrief]);

  useLayoutEffect(() => {
    syncAutorunFromSession();
    if (!shouldRunShipmentAutorun('comparator')) return;

    const state = useLogiFlowStore.getState();
    if (!state.source.trim() || !state.destination.trim()) return;

    if (state.scenarioBrief?.trim()) {
      setScenarioBrief(state.scenarioBrief);
    }
    markShipmentAutorunStarted('comparator');
    setAutoTriggered(true);
    setStep(3);
    setLoading(true);
    void runOptimizeRef.current();
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-x-hidden bg-[#05070c] min-h-0">
      {/* Hero */}
      <section className="relative border-b border-white/[0.06] overflow-hidden">
        <div className="pointer-events-none absolute inset-0 [&_*]:pointer-events-none">
          <div className="absolute w-[min(90vw,640px)] h-[min(90vw,640px)] rounded-full opacity-[0.14] blur-[110px] bg-violet-600 -top-[50%] right-[-20%]" />
          <div className="absolute w-[min(70vw,480px)] h-[min(70vw,480px)] rounded-full opacity-[0.1] blur-[90px] bg-primary bottom-[-40%] left-[-15%]" />
        </div>
        <div className="relative z-10 pointer-events-auto max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-12">
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">
              Smart Supply Chain
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200">
              Smart planning
            </span>
          </div>
          <h1 className="font-headline text-3xl sm:text-[2.75rem] font-black tracking-tight text-on-surface leading-[1.05] max-w-3xl">
            Decide the best way to move cargo — not just display routes
          </h1>
          <p className="mt-4 text-[15px] sm:text-base text-on-surface-variant max-w-2xl leading-relaxed">
            Compare <strong className="text-on-surface">road, rail, air, and water</strong> on delay-adjusted time,
            cost, and risk. Describe your shipment in plain English and we turn it into constraints before scoring.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={loadDemo}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary font-semibold text-sm hover:bg-primary/90 transition-all shadow-[0_0_40px_-12px_rgba(172,199,255,0.5)]"
            >
              <span className="material-symbols-outlined text-lg">play_circle</span>
              Run judge demo (Delhi → Mumbai)
            </button>
            <Link
              href="/railway"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:border-white/20 transition-colors"
            >
              Deep-dive rail
            </Link>
          </div>
          {/* Impact strip — alignment scoring */}
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { k: 'SDG 9', v: 'Resilient logistics infra' },
              { k: '< 60s', v: 'Multimodal compare' },
              { k: '4 modes', v: 'Single decision view' },
              { k: 'MSME', v: 'India freight operators' },
            ].map((item) => (
              <div
                key={item.k}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 backdrop-blur-sm"
              >
                <div className="text-lg font-black text-primary font-headline">{item.k}</div>
                <div className="text-[11px] text-on-surface-variant mt-0.5">{item.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Steps */}
      <div className="relative z-10 pointer-events-auto max-w-6xl mx-auto w-full px-5 sm:px-8 pt-8">
        <div className="flex items-center gap-2 sm:gap-4 mb-8">
          {[
            { n: 1, label: 'Corridor' },
            { n: 2, label: 'Scenario (AI)' },
            { n: 3, label: 'Decision' },
          ].map(({ n, label }) => (
            <button
              key={n}
              type="button"
              onClick={() => setStep(n as 1 | 2 | 3)}
              className={`flex-1 flex items-center gap-2 sm:gap-3 py-3 px-3 sm:px-4 rounded-xl border transition-all ${
                step === n
                  ? 'border-primary/40 bg-primary/10 text-on-surface'
                  : 'border-white/[0.06] bg-white/[0.02] text-on-surface-variant hover:border-white/10'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  step >= n ? 'bg-primary text-on-primary' : 'bg-white/10'
                }`}
              >
                {n}
              </span>
              <span className="text-xs sm:text-sm font-semibold truncate">{label}</span>
            </button>
          ))}
        </div>

        {skipWizard && (
          <div className="mb-6 rounded-2xl border border-primary/25 bg-primary/5 px-5 py-4">
            <p className="text-sm font-semibold text-on-surface">
              {loading
                ? 'Running multimodal comparison with your confirmed shipment…'
                : result
                  ? 'Recommendation ready — based on your confirmed shipment'
                  : 'Preparing your multimodal comparison…'}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">
              {source && destination ? `${source} → ${destination}` : 'Using parsed corridor from home'}
              {cargoWeight ? ` · ${cargoWeight} kg` : ''}
              {priority ? ` · priority: ${priority}` : ''}
            </p>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-6">
          {!skipWizard && step === 1 && (
            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0e16]/90 p-6 sm:p-8 backdrop-blur-xl space-y-5 animate-fade-in">
              <h2 className="text-lg font-bold text-on-surface">Where is the shipment moving?</h2>
              <CorridorRow
                accentVar="--hybrid"
                swapDisabled={!source.trim() && !destination.trim()}
                onSwap={() => {
                  const t = source;
                  setSource(destination);
                  setDestination(t);
                }}
              >
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-outline mb-2 block">
                    Origin
                  </span>
                  <input
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder="Delhi, India"
                    className="w-full px-4 py-3.5 rounded-xl border border-white/10 bg-black/30 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-outline mb-2 block">
                    Destination
                  </span>
                  <input
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Mumbai, India"
                    className="w-full px-4 py-3.5 rounded-xl border border-white/10 bg-black/30 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </label>
              </CorridorRow>
              <div className="grid sm:grid-cols-3 gap-4">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-outline mb-2 block">
                    Weight (kg)
                  </span>
                  <input
                    type="number"
                    value={cargoWeight}
                    onChange={(e) => setCargoWeight(Number(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border border-white/10 bg-black/30 text-on-surface"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-outline mb-2 block">
                    Cargo type
                  </span>
                  <select
                    value={cargoType}
                    onChange={(e) => setCargoType(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-white/10 bg-black/30 text-on-surface"
                  >
                    <option value="General">General</option>
                    <option value="Perishable">Perishable</option>
                    <option value="Fragile">Fragile</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-outline mb-2 block">
                    Max budget (₹)
                  </span>
                  <input
                    type="number"
                    value={budgetMax}
                    onChange={(e) => setBudgetMax(Number(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border border-white/10 bg-black/30 text-on-surface"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!source.trim() || !destination.trim()}
                className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 font-semibold text-sm disabled:opacity-40"
              >
                Next: describe scenario →
              </button>
            </div>
          )}

          {!skipWizard && step === 2 && (
            <div className="rounded-2xl border border-violet-400/20 bg-gradient-to-b from-violet-500/[0.06] to-transparent p-6 sm:p-8 space-y-5 animate-fade-in">
              <div>
                <h2 className="text-lg font-bold text-on-surface">What constraints matter?</h2>
                <p className="text-sm text-on-surface-variant mt-1">
                  We use this <em>before</em> comparing modes — it can change priority, budget caps, deadlines,
                  and excluded modes.
                </p>
              </div>
              <ParagraphInputWithStt
                value={scenarioBrief}
                onChange={setScenarioBrief}
                rows={4}
                placeholder="e.g. Monsoon delays expected, budget under ₹10k, must deliver within 48h, prefer rail over air…"
                className="w-full px-4 py-3.5 rounded-xl border border-violet-400/20 bg-black/40 text-on-surface placeholder:text-outline/60 focus:outline-none focus:ring-2 focus:ring-violet-400/30 resize-y min-h-[100px]"
                lang="en-IN"
              />
              <div className="flex flex-wrap gap-2">
                {['Urgent — minimize time', 'Tight budget', 'Monsoon — avoid air', 'Bulk — prefer water/rail'].map(
                  (chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() =>
                        setScenarioBrief((prev) => (prev ? `${prev}. ${chip}` : chip))
                      }
                      className="text-[11px] px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-on-surface-variant hover:text-on-surface hover:border-white/20"
                    >
                      + {chip}
                    </button>
                  )
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-3 rounded-xl bg-primary text-on-primary font-semibold text-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
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
                  className="px-5 py-3 rounded-xl border border-white/10 text-sm font-semibold text-on-surface-variant"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {!skipWizard && step === 3 && !result && !loading && (
            <div className="text-center py-12 text-on-surface-variant text-sm">
              Complete steps 1–2 and run optimization, or use the demo button above.
            </div>
          )}
        </form>

        {error && (
          <div className="mt-6 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex flex-col gap-3">
            <div className="flex gap-2 items-start">
              <span className="material-symbols-outlined text-base shrink-0">error</span>
              <span>{error}</span>
            </div>
            {autoTriggered && (
              <button
                type="button"
                onClick={() => {
                  setAutoTriggered(false);
                  setStep(1);
                }}
                className="self-start text-xs font-semibold text-red-100 underline"
              >
                Edit shipment details and try again
              </button>
            )}
          </div>
        )}

        {loading && <MultimodalPipelineLoading variant="optimize" />}

        {result && !loading && (
          <div className="mt-8 pb-16 space-y-6 animate-fade-in">
            {result.demo_mode && (
              <p className="text-[11px] text-amber-200/90 border border-amber-400/20 bg-amber-500/10 rounded-lg px-3 py-2 inline-block">
                Demo cache mode — stable snapshot for judging (set LOGIFLOW_DEMO_MODE=0 for live APIs).
              </p>
            )}

            {result.ai_constraints && <AiConstraintsPanel ai={result.ai_constraints} />}

            {/* Verdict card */}
            <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-[#0c1018] to-[#05070c] p-6 sm:p-8 shadow-[0_32px_100px_-48px_rgba(172,199,255,0.35)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary mb-3">Recommended mode</p>
              <div className="flex flex-wrap items-center gap-4 mb-4">
                {recommendedMode ? (
                  <>
                    <span
                      className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl border text-2xl ${MODE_META[recommendedMode].cardTint}`}
                    >
                      {MODE_META[recommendedMode].icon}
                    </span>
                    <div>
                      <h2 className={`text-3xl font-black font-headline ${MODE_META[recommendedMode].tint}`}>
                        {MODE_META[recommendedMode].label}
                      </h2>
                      <p className="text-sm text-on-surface-variant mt-1">Best fit for your stated priority & constraints</p>
                    </div>
                  </>
                ) : (
                  <span className="text-lg font-semibold">No single mode won</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 max-w-md">
                <div className="rounded-xl bg-black/30 border border-white/[0.06] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-outline">Time</div>
                  <div className="text-lg font-bold font-mono text-on-surface">{formatHours(recommendedRow?.time_hr)}</div>
                </div>
                <div className="rounded-xl bg-black/30 border border-white/[0.06] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-outline">Cost</div>
                  <div className="text-lg font-bold font-mono text-on-surface">{formatInr(recommendedRow?.cost_inr)}</div>
                </div>
                <div className="rounded-xl bg-black/30 border border-white/[0.06] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-outline">Risk</div>
                  <div className="text-lg font-bold font-mono text-on-surface">{formatRisk(recommendedRow?.risk)}</div>
                </div>
              </div>
              <p className="mt-5 text-[15px] text-on-surface leading-relaxed border-l-2 border-primary/50 pl-4">
                {result.reason?.trim() || 'Recommendation based on multimodal scoring.'}
              </p>
            </div>

            <ComparisonTable rows={comparisonRows} recommendedMode={recommendedMode} />

            {result.unavailable_modes && result.unavailable_modes.length > 0 && (
              <div className="rounded-xl border border-outline-variant/15 bg-surface-container/20 px-4 py-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-outline mb-1">
                  Unavailable modes
                </p>
                {result.unavailable_modes.map((entry) => {
                  // Entry may be a plain mode name "road" or a "mode: reason" string
                  const colonIdx = entry.indexOf(':');
                  const modeRaw = colonIdx > -1 ? entry.slice(0, colonIdx).trim() : entry.trim();
                  const reasonRaw = colonIdx > -1 ? entry.slice(colonIdx + 1).trim() : 'Not available for this corridor.';
                  return (
                    <InvalidCorridorInline
                      key={modeRaw}
                      mode={modeRaw}
                      reason={reasonRaw}
                    />
                  );
                })}
              </div>
            )}

            {Array.isArray(result.tradeoffs) && result.tradeoffs.length > 0 && (
              <div className="rounded-2xl border border-white/[0.06] bg-[#0a0e16]/60 p-5">
                <h3 className="text-sm font-semibold mb-3">Tradeoffs</h3>
                <ul className="space-y-2">
                  {result.tradeoffs.map((line, i) => (
                    <li key={i} className="text-sm text-on-surface-variant flex gap-2">
                      <span className="text-primary">•</span>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {ALL_MODES.map((mode) => {
                const data = result.best_per_mode?.[mode];
                const won = mode === recommendedMode;
                // Check if this mode is listed as unavailable
                const unavailableEntry = (result.unavailable_modes ?? []).find(
                  e => e.toLowerCase().startsWith(mode)
                );
                const unavailableReason = unavailableEntry
                  ? (unavailableEntry.includes(':')
                      ? unavailableEntry.slice(unavailableEntry.indexOf(':') + 1).trim()
                      : 'Not available for this corridor.')
                  : null;
                return (
                  <div
                    key={mode}
                    className={`rounded-xl border p-4 ${won ? MODE_META[mode].cardTint : 'border-white/[0.06] bg-white/[0.02]'}`}
                  >
                    <h4 className={`font-semibold text-sm ${MODE_META[mode].tint} mb-2`}>
                      {MODE_META[mode].label}
                    </h4>
                    {data ? (
                      <>
                        <div className="text-xs space-y-1 font-mono text-on-surface-variant">
                          <p>Time {formatHours(data.time_hr ?? data.time)}</p>
                          <p>Cost {formatInr(data.cost_inr ?? data.cost)}</p>
                        </div>
                        <button
                          onClick={() => setSaveMode(mode)}
                          className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-lg bg-surface/50 border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-on-surface hover:bg-white/10 transition-all"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>save</span>
                          Save Report
                        </button>
                      </>
                    ) : unavailableReason ? (
                      <InvalidCorridorInline mode={mode} reason={unavailableReason} />
                    ) : (
                      <p className="text-[11px] text-outline italic">Unavailable for this corridor</p>
                    )}
                  </div>
                );
              })}
            </div>

            {Boolean(
              result.best_per_mode?.road?.geometry?.length
            ) && (
              <div className="rounded-2xl border border-white/[0.06] overflow-hidden h-[360px]">
                <MapView
                  routes={[
                    {
                      geometry: result.best_per_mode!.road!.geometry!,
                      time: result.best_per_mode!.road!.time_hr ?? result.best_per_mode!.road!.time ?? 0,
                      cost: result.best_per_mode!.road!.cost_inr ?? result.best_per_mode!.road!.cost ?? 0,
                      risk: result.best_per_mode!.road!.risk ?? 0,
                    },
                  ]}
                  selectedRoute={0}
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setStep(2);
                setResult(null);
              }}
              className="text-sm font-semibold text-primary hover:underline"
            >
              ← Adjust scenario and re-run
            </button>
          </div>
        )}
      </div>

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
          optimizationResult: saveMode ? { 
            ...(result?.best_per_mode?.[saveMode] || {}), 
            selected_from_comparator: true, 
            selected_mode: saveMode 
          } as Record<string, unknown> : undefined,
          estimatedCost: saveMode ? (result?.best_per_mode?.[saveMode]?.cost_inr ?? result?.best_per_mode?.[saveMode]?.cost ?? undefined) : undefined,
          estimatedTime: saveMode ? (result?.best_per_mode?.[saveMode]?.time_hr ?? result?.best_per_mode?.[saveMode]?.time ?? undefined) : undefined,
          riskScore: saveMode ? (result?.best_per_mode?.[saveMode]?.risk ?? undefined) : undefined,
        }}
      />
    </div>
  );
}
