'use client';

import Link from 'next/link';
import React, { useMemo, useState } from 'react';
import { optimizeHybridRoute, type HybridComparisonRow, type HybridOptimizeResult } from '@/services/api';

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
          </div>
        )}
      </div>
    </div>
  );
}
