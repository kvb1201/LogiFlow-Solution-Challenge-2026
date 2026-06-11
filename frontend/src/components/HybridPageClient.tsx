'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  streamComposeMultimodalRoute,
  composeMultimodalRoute,
  BACKEND_UNAVAILABLE_MSG,
  TrafficQueueError,
  type ComposeResult,
} from '@/services/api';
import { ComposeResults } from '@/components/hybrid/ComposeResults';
import { HybridMetricsStrip } from '@/components/hybrid/HybridMetricItem';
import { HYBRID_CAPABILITY_BADGES } from '@/lib/hybrid-metrics';
import { PipelineLogiLanding } from '@/components/cockpit/PipelineLogiLanding';
import { PipelineResultsLayout } from '@/components/cockpit/PipelineResultsLayout';
import { AmbientSurface } from '@/components/cockpit/AmbientSurface';
import { accentVar } from '@/lib/pipeline-theme';
import MultimodalPipelineLoading from '@/components/MultimodalPipelineLoading';
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
import { useShipmentAutorun } from '@/hooks/useShipmentAutorun';
import { InvalidCorridorCard } from '@/components/InvalidCorridorCard';
import { usePlannerRegenerateParams } from '@/hooks/usePlannerRegenerateParams';
import AiBriefPanel from '@/components/AiBriefPanel';
import { sanitizeUserMessage } from '@/lib/user-facing-messages';
import {
  extractRoadUnavailableReason,
  isComposeFailureWithContext,
} from '@/lib/compose-insights';
import { ComposeFailurePanel } from '@/components/hybrid/ComposeFailurePanel';
import { useIntentFormReset } from '@/hooks/useIntentFormReset';

const DEMO_SOURCE = 'Lucknow, India';
const DEMO_DEST = 'Delhi, India';
const DEMO_SCENARIO =
  '10 kg wood, time priority, open to train + flight via hubs.';

const STEPS = ['Corridor', 'Brief', 'Route'] as const;

export default function HybridPageClient() {
  usePlannerRegenerateParams('hybrid');

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [autoTriggered, setAutoTriggered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ComposeResult | null>(null);
  const [failureContext, setFailureContext] = useState<ComposeResult | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [roadUnavailableReason, setRoadUnavailableReason] = useState<string | null>(null);

  const inResultsView =
    loading || loadingMore || Boolean(result?.recommended) || Boolean(error && autoTriggered);

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
    setRoadUnavailableReason(null);
  }, [setSource, setDestination, setPriority, setCargoWeight, setCargoType, setBudgetMax]);

  const runCompose = useCallback(async () => {
    const state = useLogiFlowStore.getState();
    const origin = state.source.trim();
    const dest = state.destination.trim();
    if (!origin || !dest) return;

    const brief = (scenarioBrief || state.scenarioBrief || '').trim();
    setError(null);
    setFailureContext(null);
    setRoadUnavailableReason(null);
    setLoading(true);
    setLoadingMore(false);
    setResult(null);
    setStep(2);
    setAutoTriggered(true);

    const composePayload = {
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
      compose_options: { max_hubs: 2, budget_seconds: 75 },
    };

    try {
      const warm = await ensureBackendWarm(90_000);
      if (!warm) throw new Error(BACKEND_UNAVAILABLE_MSG);

      let data: ComposeResult;
      try {
        data = await streamComposeMultimodalRoute(composePayload, (partial) => {
          if (!partial.recommended) return;
          setResult(partial);
          setLoading(false);
          setLoadingMore(!partial.done);
        });
      } catch {
        data = await composeMultimodalRoute(composePayload);
      }

      if (data.error && !data.recommended) {
        if (isComposeFailureWithContext(data)) {
          setFailureContext(data);
          throw new Error(data.error);
        }
        throw new Error(data.error);
      }

      const roadUnavail = extractRoadUnavailableReason(data.unavailable_templates);
      if (roadUnavail) setRoadUnavailableReason(roadUnavail);

      setFailureContext(null);
      setResult(data);
    } catch (err: unknown) {
      if (err instanceof TrafficQueueError) return;
      setResult(null);
      setRoadUnavailableReason(null);
      setError(
        sanitizeUserMessage(
          err instanceof Error
            ? err.message
            : 'Could not compose a route. Try the demo corridor.'
        )
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [scenarioBrief]);

  const runComposeRef = useRef(runCompose);
  runComposeRef.current = runCompose;

  const corridorReady = Boolean(source.trim() && destination.trim());

  const beginComposeRun = useCallback(() => {
    setResult(null);
    setError(null);
    setFailureContext(null);
    setRoadUnavailableReason(null);
    setAutoTriggered(true);
    setStep(2);
    setLoading(true);
    setLoadingMore(false);
    void runComposeRef.current();
  }, []);

  useEffect(() => {
    if (storeScenarioBrief?.trim()) setScenarioBrief(storeScenarioBrief);
  }, [storeScenarioBrief]);

  useShipmentAutorun('hybrid', beginComposeRun, corridorReady);

  function resetToEdit(stepTarget = 0) {
    setResult(null);
    setFailureContext(null);
    setRoadUnavailableReason(null);
    setAutoTriggered(false);
    setError(null);
    setStep(stepTarget);
  }

  const handleIntentApplied = useIntentFormReset((_parsed, action) => {
    setError(null);
    setFailureContext(null);
    setRoadUnavailableReason(null);
    setResult(null);
    if (action === 'run') {
      if (storeScenarioBrief?.trim()) setScenarioBrief(storeScenarioBrief);
      return;
    }
    resetToEdit(0);
  });

  useLayoutEffect(() => {
    syncAutorunFromSession();
    if (!shouldRunShipmentAutorun('hybrid')) return;

    const state = useLogiFlowStore.getState();
    if (!state.source.trim() || !state.destination.trim()) return;

    if (state.scenarioBrief?.trim()) setScenarioBrief(state.scenarioBrief);
    markShipmentAutorunStarted('hybrid');
    beginComposeRun();
  }, [beginComposeRun]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runCompose();
  }

  const stepDots = (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {STEPS.map((label, i) => (
        <button
          key={label}
          type="button"
          onClick={() => !loading && setStep(i)}
          className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
            step === i ? 'text-foreground' : 'text-muted-foreground hover:text-on-surface-variant'
          }`}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: step >= i ? 'var(--hybrid)' : 'var(--border)',
            }}
          />
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={loadDemo}
        className="w-full text-[11px] text-muted-foreground hover:brightness-110 sm:ml-auto sm:w-auto"
      >
        Demo
      </button>
    </div>
  );

  const corridorForm = (
    <AmbientSurface mode="hybrid" mesh="card" className="space-y-4 p-4 sm:p-5">
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
            className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background/60 text-sm focus:outline-none focus:ring-1 focus:ring-[color-mix(in_oklab,var(--hybrid)_40%,transparent)]"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground mb-1.5 block">To</span>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Delhi"
            className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background/60 text-sm focus:outline-none focus:ring-1 focus:ring-[color-mix(in_oklab,var(--hybrid)_40%,transparent)]"
          />
        </label>
      </CorridorRow>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs text-muted-foreground mb-1.5 block">Kg</span>
          <input
            type="number"
            value={cargoWeight}
            onChange={(e) => setCargoWeight(Number(e.target.value))}
            className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background/60 text-sm"
          />
        </label>
        <label className="block sm:col-span-2">
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
    </AmbientSurface>
  );

  const briefForm = (
    <AmbientSurface mode="hybrid" mesh="card" className="space-y-4 p-4 sm:p-5">
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
          className="flex-1 sm:flex-none px-5 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--hybrid)' }}
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
    </AmbientSurface>
  );

  if (!inResultsView) {
    return (
      <PipelineLogiLanding
        mode="hybrid"
        badge="Hybrid · Multimodal route composer"
        description={
          <>
            Chain{' '}
            <span style={{ color: accentVar('hybrid') }} className="font-medium">
              rail, road, and air
            </span>{' '}
            through hub cities — village feeder access, changeover scoring, and ranked itineraries.
          </>
        }
        metrics={<HybridMetricsStrip />}
        badges={HYBRID_CAPABILITY_BADGES}
        footer={
          <>
            <p className="text-[10px] text-outline/50 uppercase tracking-[0.2em] font-label">
              9,524 mapped stations · 56 interchange hubs · 55s compose budget
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Or{' '}
              <Link href="/comparator" className="hover:underline" style={{ color: accentVar('comparator') }}>
                compare single modes
              </Link>
            </p>
          </>
        }
      >
        <AiBriefPanel contextMode="hybrid" className="mb-6" onIntentApplied={handleIntentApplied} />
        {stepDots}
        <form id="logiflow-pipeline-form" onSubmit={onSubmit}>
          {step === 0 && corridorForm}
          {step === 1 && briefForm}
        </form>
      </PipelineLogiLanding>
    );
  }

  return (
    <>
      <PipelineResultsLayout
        mode="hybrid"
        source={source}
        destination={destination}
        cargoWeight={cargoWeight}
        onEdit={() => resetToEdit(0)}
      >
        {error && (
          <div className="mb-6 space-y-4">
            {failureContext ? (
              <ComposeFailurePanel
                result={failureContext}
                message={error}
                onEdit={() => resetToEdit(0)}
              />
            ) : (
              <div className="text-sm text-red-300/90 rounded-lg border border-red-400/20 bg-red-500/5 px-4 py-3">
                <p>{error}</p>
                {autoTriggered && (
                  <button
                    type="button"
                    onClick={() => resetToEdit(0)}
                    className="mt-3 text-xs font-semibold text-red-100 underline"
                  >
                    Edit corridor and try again
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {loading && !result?.recommended && (
          <MultimodalPipelineLoading variant="compose" />
        )}

        {roadUnavailableReason && !loading && !loadingMore && (
          <div className="mb-3">
            <InvalidCorridorCard
              mode="road"
              source={source}
              destination={destination}
              reason={roadUnavailableReason}
              compact
            />
          </div>
        )}

        {result?.recommended && (
          <ComposeResults
            result={result}
            loadingMore={loadingMore}
            onEdit={() => resetToEdit(0)}
            onSave={() => setSaveModalOpen(true)}
          />
        )}
      </PipelineResultsLayout>

      <SaveReportModal
        isOpen={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        prefill={{
          source,
          destination,
          stops: result?.recommended?.segments?.map((s) => String(s.to_city)).slice(0, -1) || [],
          mode: 'hybrid',
          cargoType,
          optimizationInput: { priority },
          optimizationResult: result?.recommended as unknown as Record<string, unknown>,
          estimatedCost: result?.recommended?.total_cost_inr,
          estimatedTime: result?.recommended?.total_time_hr,
          riskScore:
            (result?.recommended as { total_risk_score?: number; risk_score?: number })?.total_risk_score ||
            (result?.recommended as { risk_score?: number })?.risk_score,
        }}
      />
    </>
  );
}
