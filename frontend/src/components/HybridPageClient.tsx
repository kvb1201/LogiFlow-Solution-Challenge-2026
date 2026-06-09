'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  composeMultimodalRoute,
  BACKEND_UNAVAILABLE_MSG,
  type ComposeResult,
} from '@/services/api';
import { ComposeResults } from '@/components/hybrid/ComposeResults';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { SaveReportModal } from '@/components/planner/SaveReportModal';
import ParagraphInputWithStt from '@/components/ParagraphInputWithStt';
import { CorridorRow } from '@/components/forms/pipeline-form-ui';
import { ensureBackendWarm } from '@/lib/backendWarmup';
import {
  markShipmentAutorunStarted,
  shouldRunShipmentAutorun,
  syncAutorunFromSession,
} from '@/lib/shipmentAutorun';

const DEMO_SOURCE = 'Lucknow, India';
const DEMO_DEST = 'Delhi, India';
const DEMO_SCENARIO =
  '10 kg wood, time priority, open to train + flight via hubs.';

const STEPS = ['Corridor', 'Brief', 'Route'] as const;

export default function HybridPageClient() {
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
  const setBudgetMax = useLogiFlowStore((s) => s.setBudgetMax);
  const storeScenarioBrief = useLogiFlowStore((s) => s.scenarioBrief);

  const [step, setStep] = useState(0);
  const [scenarioBrief, setScenarioBrief] = useState(() => useLogiFlowStore.getState().scenarioBrief || '');
  const [loading, setLoading] = useState(false);
  const [autoTriggered, setAutoTriggered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ComposeResult | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  const showForm = !loading && !result?.recommended;

  const loadDemo = useCallback(() => {
    setSource(DEMO_SOURCE);
    setDestination(DEMO_DEST);
    setScenarioBrief(DEMO_SCENARIO);
    setPriority('time');
    setCargoWeight(10);
    setCargoType('General');
    setBudgetMax(0);
    setStep(1);
    setError(null);
    setResult(null);
  }, [setSource, setDestination, setPriority, setCargoWeight, setCargoType, setBudgetMax]);

  const runCompose = useCallback(async () => {
    const state = useLogiFlowStore.getState();
    const origin = state.source.trim();
    const dest = state.destination.trim();
    if (!origin || !dest) return;

    const brief = (scenarioBrief || state.scenarioBrief || '').trim();
    setError(null);
    setLoading(true);
    setStep(2);
    setAutoTriggered(true);

    try {
      const warm = await ensureBackendWarm(25_000);
      if (!warm) throw new Error(BACKEND_UNAVAILABLE_MSG);

      const data = await composeMultimodalRoute({
        source: origin,
        destination: dest,
        priority: state.priority,
        departure_date: state.departureDate,
        cargo_weight_kg: state.cargoWeight,
        cargo_type: state.cargoType,
        scenario_brief: brief || undefined,
        cargo: { weight: state.cargoWeight, type: state.cargoType.toLowerCase() },
        constraints: {
          budget_max_inr: state.budgetMax || undefined,
          budget_limit: state.budgetMax || undefined,
          delay_tolerance_hours: state.deadlineHours,
        },
        compose_options: { max_hubs: 2, budget_seconds: 55 },
      });

      if (data.error && !data.recommended) {
        throw new Error(data.error);
      }
      setResult(data);
    } catch (err: unknown) {
      setResult(null);
      setError(
        err instanceof Error
          ? err.message
          : 'Could not compose a route. Try the demo corridor.'
      );
    } finally {
      setLoading(false);
    }
  }, [scenarioBrief]);

  const runComposeRef = useRef(runCompose);
  runComposeRef.current = runCompose;

  useEffect(() => {
    if (storeScenarioBrief?.trim()) setScenarioBrief(storeScenarioBrief);
  }, [storeScenarioBrief]);

  useEffect(() => {
    syncAutorunFromSession();
    if (shouldRunShipmentAutorun('hybrid')) {
      markShipmentAutorunStarted('hybrid');
      setAutoTriggered(true);
      if (source.trim() && destination.trim()) {
        void runComposeRef.current();
      }
    }
  }, [source, destination]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runCompose();
  }

  return (
    <div className="relative min-h-full pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* Header — compact */}
        <header className="mb-8">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-300/80 mb-1">
            Hybrid
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">
            Multimodal routes
          </h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Chain trains, flights, and more through hub cities.{' '}
            <Link href="/comparator" className="text-violet-300 hover:underline">
              Compare single modes
            </Link>
          </p>
        </header>

        {/* Step dots — minimal */}
        {(showForm || loading) && (
          <div className="flex items-center gap-2 mb-6">
            {STEPS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => !loading && setStep(i)}
                className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                  step === i ? 'text-violet-300' : 'text-muted-foreground hover:text-on-surface-variant'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    step >= i ? 'bg-violet-400' : 'bg-border'
                  }`}
                />
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={loadDemo}
              className="ml-auto text-[11px] text-muted-foreground hover:text-violet-300"
            >
              Demo
            </button>
          </div>
        )}

        {/* Status strip when autorunning */}
        {autoTriggered && (loading || result?.recommended) && (
          <p className="text-xs text-muted-foreground mb-4 font-mono truncate">
            {source} → {destination}
            {cargoWeight ? ` · ${cargoWeight} kg` : ''}
          </p>
        )}

        <form onSubmit={onSubmit}>
          {showForm && step === 0 && (
            <div className="space-y-4 rounded-2xl border border-border/60 bg-surface/40 p-5 sm:p-6">
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
                  <span className="text-xs text-muted-foreground mb-1.5 block">From</span>
                  <input
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder="Lucknow"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background/60 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400/40"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground mb-1.5 block">To</span>
                  <input
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Delhi"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background/60 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400/40"
                  />
                </label>
              </CorridorRow>
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-xs text-muted-foreground mb-1.5 block">Kg</span>
                  <input
                    type="number"
                    value={cargoWeight}
                    onChange={(e) => setCargoWeight(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background/60 text-sm"
                  />
                </label>
                <label className="block col-span-2">
                  <span className="text-xs text-muted-foreground mb-1.5 block">Priority</span>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background/60 text-sm"
                  >
                    <option value="balanced">Balanced</option>
                    <option value="time">Fastest</option>
                    <option value="cost">Cheapest</option>
                    <option value="safe">Safest</option>
                  </select>
                </label>
              </div>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={!source.trim() || !destination.trim()}
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-foreground text-background text-sm font-semibold disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          )}

          {showForm && step === 1 && (
            <div className="space-y-4 rounded-2xl border border-border/60 bg-surface/40 p-5 sm:p-6">
              <label className="block">
                <span className="text-xs text-muted-foreground mb-1.5 block">
                  Brief <span className="text-outline">(optional)</span>
                </span>
                <ParagraphInputWithStt
                  value={scenarioBrief}
                  onChange={setScenarioBrief}
                  rows={3}
                  placeholder="Time-critical, OK with train then flight…"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background/60 text-sm resize-none min-h-[80px]"
                  lang="en-IN"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 sm:flex-none px-5 py-2.5 rounded-lg bg-violet-500 text-white text-sm font-semibold disabled:opacity-50"
                >
                  Find route
                </button>
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="px-4 py-2.5 rounded-lg border border-border text-sm text-muted-foreground"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </form>

        {error && (
          <p className="mt-4 text-sm text-red-300/90 rounded-lg border border-red-400/20 bg-red-500/5 px-4 py-3">
            {error}
          </p>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-3 py-20">
            <span className="h-8 w-8 rounded-full border-2 border-violet-400/20 border-t-violet-400 animate-spin" />
            <p className="text-sm text-muted-foreground">Finding best chain…</p>
            <p className="text-xs text-outline">Usually under a minute</p>
          </div>
        )}

        {result?.recommended && !loading && (
          <ComposeResults
            result={result}
            onEdit={() => {
              setResult(null);
              setStep(1);
            }}
            onSave={() => setSaveModalOpen(true)}
          />
        )}
      </div>

      <SaveReportModal
        isOpen={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        prefill={{
          source,
          destination,
          stops: result?.recommended?.segments?.map(s => String(s.to_city)).slice(0, -1) || [],
          mode: 'hybrid',
          cargoType,
          optimizationInput: { priority },
          optimizationResult: result?.recommended as unknown as Record<string, unknown>,
          estimatedCost: result?.recommended?.total_cost_inr,
          estimatedTime: result?.recommended?.total_time_hr,
          riskScore: (result?.recommended as any)?.total_risk_score || (result?.recommended as any)?.risk_score,
        }}
      />
    </div>
  );
}
