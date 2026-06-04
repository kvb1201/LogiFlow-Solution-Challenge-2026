'use client';

import Link from 'next/link';
<<<<<<< Updated upstream
import React, { useMemo, useState } from 'react';
import { optimizeHybridRoute, type HybridComparisonRow, type HybridOptimizeResult } from '@/services/api';
=======
import React, { useCallback, useMemo, useState } from 'react';
import { useShipmentAutorun } from '@/hooks/useShipmentAutorun';
import { hasShipmentAutorunPending } from '@/lib/shipmentAutorun';
import {
  optimizeHybridRoute,
  type AiConstraintsApplied,
  type HybridComparisonRow,
  type HybridOptimizeResult,
} from '@/services/api';
import dynamic from 'next/dynamic';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import AiBriefPanel from '@/components/AiBriefPanel';
import ParagraphInputWithStt from '@/components/ParagraphInputWithStt';
import { PipelineModeLanding } from '@/components/cockpit/PipelineModeLanding';
import { formInputClass } from '@/components/forms/pipeline-form-ui';
import { Sparkles } from 'lucide-react';
>>>>>>> Stashed changes

type Priority = 'cost' | 'time' | 'balanced';
type Mode = 'road' | 'rail' | 'air';

const MODE_META: Record<Mode, { label: string; icon: string; tint: string; cardTint: string }> = {
  road: { label: 'Road', icon: '🚚', tint: 'text-secondary', cardTint: 'border-secondary/30 bg-secondary/10' },
  rail: { label: 'Rail', icon: '🚆', tint: 'text-primary', cardTint: 'border-primary/30 bg-primary/10' },
  air: { label: 'Air', icon: '✈️', tint: 'text-sky-300', cardTint: 'border-sky-400/30 bg-sky-400/10' },
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
  return n == null ? 'N/A' : `${n.toFixed(2)} hrs`;
}

function formatInr(v: unknown): string {
  const n = toNum(v);
  if (n == null) return 'N/A';
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))}`;
}

function formatRisk(v: unknown): string {
  const n = toNum(v);
  if (n == null) return 'N/A';
  return `${Math.round(n * 100)}%`;
}

function normalizeMode(value: unknown): Mode | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'road' || v === 'rail' || v === 'air') return v;
  return null;
}

function ComparisonTable({ rows, recommendedMode }: { rows: HybridComparisonRow[]; recommendedMode: Mode | null }) {
  const validRows = rows.filter((row) => normalizeMode(row.mode));
  if (!validRows.length) return null;

  const minTime = Math.min(...validRows.map((row) => toNum(row.time_hr) ?? Number.POSITIVE_INFINITY));
  const minCost = Math.min(...validRows.map((row) => toNum(row.cost_inr) ?? Number.POSITIVE_INFINITY));
  const maxRisk = Math.max(...validRows.map((row) => toNum(row.risk) ?? Number.NEGATIVE_INFINITY));

  return (
    <div className="rounded-2xl border border-outline-variant/15 bg-surface-container-low/35 overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-outline-variant/10">
        <h3 className="text-sm font-semibold text-on-surface">Mode Comparison</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-container/45 text-on-surface-variant">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Mode</th>
              <th className="px-4 py-3 text-left font-semibold">Time</th>
              <th className="px-4 py-3 text-left font-semibold">Cost</th>
              <th className="px-4 py-3 text-left font-semibold">Risk</th>
              <th className="px-4 py-3 text-left font-semibold">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {validRows.map((row) => {
              const mode = normalizeMode(row.mode) as Mode;
              const modeMeta = MODE_META[mode];
              const time = toNum(row.time_hr);
              const cost = toNum(row.cost_inr);
              const risk = toNum(row.risk);
              const conf = toNum(row.confidence);
              const isRecommended = mode === recommendedMode;
              return (
                <tr key={`hybrid-row-${mode}`} className={isRecommended ? 'bg-primary/10' : 'bg-transparent'}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span>{modeMeta.icon}</span>
                      <span className={`font-semibold ${modeMeta.tint}`}>{modeMeta.label}</span>
                      {isRecommended && (
                        <span className="rounded-full border border-primary/30 bg-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                          Recommended
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-on-surface">
                    {formatHours(time)}
                    {time != null && time === minTime && (
                      <span className="ml-2 text-[10px] text-emerald-300 font-semibold">Fastest</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-on-surface">
                    {formatInr(cost)}
                    {cost != null && cost === minCost && (
                      <span className="ml-2 text-[10px] text-sky-300 font-semibold">Cheapest</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-on-surface">
                    {formatRisk(risk)}
                    {risk != null && risk === maxRisk && (
                      <span className="ml-2 text-[10px] text-red-300 font-semibold">High risk</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-on-surface">{conf == null ? 'N/A' : `${Math.round(conf)}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function HybridPageClient() {
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [priority, setPriority] = useState<Priority>('balanced');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HybridOptimizeResult | null>(null);

  const comparisonRows = useMemo(() => {
    return Array.isArray(result?.comparison) ? result?.comparison : [];
  }, [result]);
  const recommendedMode = normalizeMode(result?.recommended_mode);
  const recommendedRow = useMemo(() => {
    if (!comparisonRows.length || !recommendedMode) return null;
    return comparisonRows.find((row) => normalizeMode(row.mode) === recommendedMode) ?? null;
  }, [comparisonRows, recommendedMode]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!source.trim() || !destination.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const data = await optimizeHybridRoute({
        source: source.trim(),
        destination: destination.trim(),
        priority,
      });
      setResult(data);
    } catch (err: unknown) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Failed to optimize hybrid route.');
    } finally {
      setLoading(false);
    }
  }

<<<<<<< Updated upstream
  return (
    <div className="flex-1 flex flex-col overflow-x-hidden bg-[#06080d] min-h-0">
      <div className="relative border-b border-outline-variant/10 overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute w-[520px] h-[520px] rounded-full opacity-[0.11] blur-[100px] bg-tertiary -top-[44%] right-[-12%] animate-mesh-1" />
          <div className="absolute w-[420px] h-[420px] rounded-full opacity-[0.09] blur-[90px] bg-primary bottom-[-35%] left-[-12%] animate-mesh-2" />
        </div>
        <div className="relative max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-11">
          <div className="inline-flex items-center gap-2 rounded-full border border-tertiary/30 bg-tertiary/10 px-3 py-1.5 mb-4">
            <span className="text-sm">🔀</span>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-tertiary">Hybrid logistics</span>
          </div>
          <h1 className="font-headline text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-on-surface mb-3">
            Hybrid Route Optimizer
          </h1>
          <p className="text-[15px] text-on-surface-variant max-w-2xl leading-relaxed">
            Compare road, rail, and air side by side to get a final recommendation with clear tradeoffs.
            Works seamlessly with your existing{' '}
            <Link href="/road" className="text-secondary hover:underline underline-offset-2">
              road
            </Link>
            ,{' '}
            <Link href="/railway" className="text-primary hover:underline underline-offset-2">
              rail
            </Link>
            , and{' '}
            <Link href="/air" className="text-sky-300 hover:underline underline-offset-2">
              air
            </Link>{' '}
            workflows.
          </p>
        </div>
      </div>

      <div className="flex-1 max-w-5xl w-full mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-6">
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-outline-variant/15 bg-surface-container-low/70 p-5 sm:p-6 backdrop-blur-xl"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="block">
              <span className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-widest mb-2 ml-1">Source</span>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Delhi, India"
                className="w-full px-4 py-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/50 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-widest mb-2 ml-1">Destination</span>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Mumbai, India"
                className="w-full px-4 py-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/50 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-widest mb-2 ml-1">Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-4 py-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/50 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/25"
              >
                <option value="balanced">Balanced</option>
                <option value="cost">Cost</option>
                <option value="time">Time</option>
              </select>
            </label>
          </div>
=======
  const formCardClass =
    'panel-hard scanline rounded-2xl p-5 sm:p-6 transition-shadow duration-300';

  const headerActions = (
    <>
      <button
        type="button"
        onClick={loadDemo}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/60 px-3 py-2 text-sm font-medium text-foreground transition-all duration-300 hover:border-hybrid/40 hover:bg-hybrid/10 hover:shadow-[0_0_28px_-12px_var(--hybrid)]"
      >
        <Sparkles className="h-4 w-4 text-hybrid" />
        Demo scenario
      </button>
      <Link
        href="/railway"
        className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        Railways
      </Link>
    </>
  );

  return (
    <PipelineModeLanding mode="hybrid" headerActions={headerActions} compact={step > 1}>
      <div className="w-full pb-8">
        <nav aria-label="Progress" className="mb-6">
          <ol className="grid grid-cols-3 gap-2">
            {[
              { n: 1, label: 'Corridor' },
              { n: 2, label: 'Scenario' },
              { n: 3, label: 'Results' },
            ].map(({ n, label }) => {
              const active = step === n;
              const done = step > n;
              return (
                <li key={n}>
                  <button
                    type="button"
                    onClick={() => setStep(n as 1 | 2 | 3)}
                    className={`flex w-full flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-all duration-300 ${
                      active
                        ? 'border-hybrid/45 bg-hybrid/10 text-foreground shadow-[0_0_32px_-14px_var(--hybrid)]'
                        : done
                          ? 'border-border bg-surface/30 text-muted-foreground'
                          : 'border-border bg-transparent text-muted-foreground hover:border-border-strong hover:bg-surface/40'
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                        active || done ? 'bg-hybrid text-background' : 'bg-surface-2 text-muted-foreground'
                      }`}
                    >
                      {n}
                    </span>
                    <span className="text-xs font-semibold leading-tight">{label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <form onSubmit={onSubmit} className="space-y-6">
          {step === 1 && (
            <section className={`${formCardClass} space-y-5`}>
              <h2 className="text-base font-semibold text-foreground">Where is the shipment moving?</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Origin</span>
                  <input
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder="Delhi"
                    className={formInputClass}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Destination</span>
                  <input
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Mumbai"
                    className={formInputClass}
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Weight (kg)</span>
                  <input
                    type="number"
                    min={1}
                    value={cargoWeight}
                    onChange={(e) => setCargoWeight(Number(e.target.value))}
                    className={formInputClass}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Cargo type</span>
                  <select
                    value={cargoType}
                    onChange={(e) => setCargoType(e.target.value)}
                    className={formInputClass}
                  >
                    <option value="General">General</option>
                    <option value="Perishable">Perishable</option>
                    <option value="Fragile">Fragile</option>
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Max budget (₹)</span>
                  <input
                    type="number"
                    min={0}
                    value={budgetMax}
                    onChange={(e) => setBudgetMax(Number(e.target.value))}
                    className={formInputClass}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!canProceedStep1}
                className="w-full rounded-lg bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-[0_0_36px_-12px_var(--hybrid)] transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-40 hover:brightness-110 sm:w-auto"
              >
                Continue to scenario →
              </button>
            </section>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <AiBriefPanel contextMode="hybrid" />
              <div className={`${formCardClass} space-y-4`}>
              <div>
                <h2 className="text-base font-semibold text-foreground">Scenario for multimodal compare</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Edit below or use AI above — sent to Gemini before scoring all four modes.
                </p>
              </div>
              <ParagraphInputWithStt
                value={scenarioBrief}
                onChange={setScenarioBrief}
                rows={4}
                placeholder="e.g. Monsoon season, perishable cargo, max ₹8,000, deliver within 36 hours, avoid air if risky…"
                className={`${formInputClass} min-h-[120px] resize-y`}
                lang="en-IN"
              />
              <div className="flex flex-wrap gap-2">
                {['Urgent — minimize time', 'Tight budget', 'Monsoon — avoid air', 'Bulk — prefer water/rail'].map(
                  (chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() =>
                        setScenarioBrief(scenarioBrief ? `${scenarioBrief}. ${chip}` : chip)
                      }
                      className="rounded-full border border-border bg-background/40 px-3 py-1.5 text-xs text-muted-foreground hover:border-border-strong hover:text-foreground"
                    >
                      + {chip}
                    </button>
                  )
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={loading || !canProceedStep1}
                  className="flex items-center gap-2 rounded-lg bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-[0_0_36px_-12px_var(--hybrid)] transition-all duration-300 hover:brightness-110 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 border-2 border-[#001b3f]/30 border-t-[#001b3f] rounded-full animate-spin" />
                      Comparing 4 modes…
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">bolt</span>
                      Get recommendation
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-lg border border-border px-5 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  Back
                </button>
              </div>
              </div>
            </div>
          )}
>>>>>>> Stashed changes

          <button
            type="submit"
            disabled={loading || !source.trim() || !destination.trim()}
            className="mt-4 w-full sm:w-auto px-6 py-3 rounded-xl bg-primary text-on-primary font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            {loading ? 'Optimizing...' : 'Optimize'}
          </button>
        </form>

        {error && (
          <div className="bg-error/10 border border-error/20 px-4 py-3 rounded-xl text-sm text-error flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">error</span>
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-6 animate-fade-in">
            <div className="rounded-2xl border border-primary/35 bg-gradient-to-br from-primary/15 via-tertiary/10 to-transparent p-5 sm:p-6">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary mb-2">Recommended mode</div>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                {recommendedMode ? (
                  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${MODE_META[recommendedMode].cardTint}`}>
                    <span>{MODE_META[recommendedMode].icon}</span>
                    {MODE_META[recommendedMode].label}
                  </span>
                ) : (
                  <span className="text-on-surface text-lg font-semibold">Not available</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-outline-variant/12 bg-surface-container/35 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-outline">Time</div>
                  <div className="text-sm font-semibold text-on-surface">{formatHours(recommendedRow?.time_hr)}</div>
                </div>
                <div className="rounded-xl border border-outline-variant/12 bg-surface-container/35 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-outline">Cost</div>
                  <div className="text-sm font-semibold text-on-surface">{formatInr(recommendedRow?.cost_inr)}</div>
                </div>
                <div className="rounded-xl border border-outline-variant/12 bg-surface-container/35 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-outline">Risk</div>
                  <div className="text-sm font-semibold text-on-surface">{formatRisk(recommendedRow?.risk)}</div>
                </div>
              </div>
              <p className="mt-4 text-sm text-on-surface-variant leading-relaxed">
                {result.reason?.trim() || 'No reason provided by the backend for this recommendation.'}
              </p>
            </div>

            <ComparisonTable rows={comparisonRows} recommendedMode={recommendedMode} />

            <div className="rounded-2xl border border-outline-variant/15 bg-surface-container-low/35 p-5">
              <h3 className="text-sm font-semibold text-on-surface mb-3">Tradeoffs</h3>
              {Array.isArray(result.tradeoffs) && result.tradeoffs.length > 0 ? (
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  {result.tradeoffs.map((line, idx) => (
                    <li key={`tradeoff-${idx}`} className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-on-surface-variant">No tradeoffs were returned for this route set.</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(['road', 'rail', 'air'] as Mode[]).map((mode) => {
                const modeData = result.best_per_mode?.[mode] ?? null;
                const isWinner = mode === recommendedMode;
                return (
                  <div
                    key={`best-mode-${mode}`}
                    className={`rounded-2xl border p-4 ${isWinner ? 'border-primary/40 bg-primary/10' : 'border-outline-variant/15 bg-surface-container-low/35'}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className={`text-base font-semibold ${MODE_META[mode].tint}`}>
                        {MODE_META[mode].icon} {MODE_META[mode].label}
                      </h4>
                      {isWinner && (
                        <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">Top pick</span>
                      )}
                    </div>
                    <div className="space-y-1 text-sm">
                      <p className="text-on-surface"><span className="text-outline">Time:</span> {formatHours(modeData?.time_hr)}</p>
                      <p className="text-on-surface"><span className="text-outline">Cost:</span> {formatInr(modeData?.cost_inr)}</p>
                      <p className="text-on-surface"><span className="text-outline">Risk:</span> {formatRisk(modeData?.risk)}</p>
                      {mode === 'rail' && <p className="text-on-surface"><span className="text-outline">Train:</span> {modeData?.train_name || 'N/A'}</p>}
                      {mode === 'air' && <p className="text-on-surface"><span className="text-outline">Airline:</span> {modeData?.airline || 'N/A'}</p>}
                      {mode === 'road' && <p className="text-on-surface"><span className="text-outline">Distance:</span> {toNum(modeData?.distance_km) == null ? 'N/A' : `${toNum(modeData?.distance_km)?.toFixed(1)} km`}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
<<<<<<< Updated upstream
=======

            {Boolean(
              (result.best_per_mode?.road as { geometry?: [number, number][] } | null)?.geometry?.length
            ) && (
              <div className="rounded-2xl border border-white/[0.06] overflow-hidden h-[360px]">
                <MapView
                  routes={[result.best_per_mode!.road! as { geometry: [number, number][]; time: number; cost: number; risk: number }]}
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
              className="text-sm font-semibold text-hybrid hover:underline"
            >
              ← Adjust scenario and re-run
            </button>
>>>>>>> Stashed changes
          </div>
        )}
      </div>
    </PipelineModeLanding>
  );
}
