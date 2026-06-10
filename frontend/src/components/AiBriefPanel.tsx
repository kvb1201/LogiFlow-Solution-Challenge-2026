'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  parseShipmentIntent,
  TrafficQueueError,
  type IntentContextMode,
  type ParsedIntent,
} from '@/services/api';
import { routeForMode } from '@/lib/applyParsedIntent';
import { setShipmentAutorun } from '@/lib/shipmentAutorun';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import ParagraphInputWithStt from '@/components/ParagraphInputWithStt';
import IntentConfirmModal from '@/components/IntentConfirmModal';
import { sanitizeUserMessage } from '@/lib/user-facing-messages';

type AiBriefPanelProps = {
  contextMode: IntentContextMode;
  /** Home: navigate after parse. Mode pages: stay and fill form only */
  navigateOnApply?: boolean;
  /** Show secondary button to parse + navigate (home / comparator) */
  showRouteButton?: boolean;
  /** Called after a successful parse — mode is fill-only vs run-optimize */
  onIntentApplied?: (parsed: ParsedIntent, action: 'fill' | 'run') => void;
  className?: string;
};

function IntentChips({ parsed }: { parsed: ParsedIntent }) {
  const chips: string[] = [];
  if (parsed.source && parsed.destination) chips.push(`${parsed.source} → ${parsed.destination}`);
  if (parsed.suggested_mode) chips.push(`Mode: ${parsed.suggested_mode}`);
  if (parsed.priority) chips.push(`Priority: ${parsed.priority}`);
  if (parsed.cargo_weight_kg != null) chips.push(`${parsed.cargo_weight_kg} kg`);
  if (parsed.cargo_type) chips.push(parsed.cargo_type);
  if (parsed.budget_max_inr != null) chips.push(`Budget ₹${Math.round(parsed.budget_max_inr)}`);
  if (parsed.deadline_hours != null) chips.push(`Deadline ${parsed.deadline_hours}h`);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {chips.map((c) => (
        <span
          key={c}
          className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-violet-400/25 bg-violet-500/10 text-violet-100"
        >
          {c}
        </span>
      ))}
    </div>
  );
}

export default function AiBriefPanel({
  contextMode,
  navigateOnApply = false,
  showRouteButton = false,
  onIntentApplied,
  className = '',
}: AiBriefPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const applyParsedIntent = useLogiFlowStore((s) => s.applyParsedIntent);
  const setScenarioBrief = useLogiFlowStore((s) => s.setScenarioBrief);
  const scenarioBrief = useLogiFlowStore((s) => s.scenarioBrief);
  const lastParsed = useLogiFlowStore((s) => s.lastParsedIntent);

  const [text, setText] = useState(scenarioBrief || '');

  useEffect(() => {
    setText(scenarioBrief || '');
  }, [scenarioBrief]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fillNotice, setFillNotice] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedIntent | null>(lastParsed);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingRouteIntent, setPendingRouteIntent] = useState<ParsedIntent | null>(null);

  function resolveTargetMode(result: ParsedIntent): Exclude<IntentContextMode, 'home'> {
    const llmMode = result.suggested_mode;
    if (
      llmMode === 'rail' ||
      llmMode === 'road' ||
      llmMode === 'air' ||
      llmMode === 'water' ||
      llmMode === 'hybrid' ||
      llmMode === 'comparator'
    ) {
      return llmMode;
    }
    // Home default: chained multimodal hybrid (not single-mode comparator).
    return contextMode === 'home' ? 'hybrid' : (contextMode as Exclude<IntentContextMode, 'home'>);
  }

  function getModePath(result: ParsedIntent): string {
    return routeForMode(resolveTargetMode(result));
  }

  function navigateToPipeline(result: ParsedIntent, runImmediately: boolean) {
    const path = getModePath(result);
    const mode = resolveTargetMode(result);
    const corridorReady = Boolean(result.source?.trim() && result.destination?.trim());
    if (runImmediately && corridorReady) {
      setShipmentAutorun(mode);
    }
    setConfirmOpen(false);
    setPendingRouteIntent(null);
    router.push(path);
  }

  function scrollToPipelineForm() {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('logiflow-pipeline-form');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('ring-2', 'ring-violet-400/40');
      window.setTimeout(() => el.classList.remove('ring-2', 'ring-violet-400/40'), 1600);
    }
  }

  async function runParse(andNavigate: boolean) {
    const brief = text.trim();
    if (brief.length < 3) {
      setError('Write at least a short description of your shipment.');
      return;
    }
    setError(null);
    setFillNotice(null);
    setLoading(true);
    try {
      const result = await parseShipmentIntent(brief, contextMode);
      if (result.error) {
        throw new Error(result.error);
      }
      result.scenario_brief = result.scenario_brief || brief;
      applyParsedIntent(result);
      const appliedIntent = useLogiFlowStore.getState().lastParsedIntent;
      const mergedResult = appliedIntent
        ? { ...result, ...appliedIntent, scenario_brief: result.scenario_brief || appliedIntent.scenario_brief }
        : result;
      setScenarioBrief(mergedResult.scenario_brief || brief);
      setParsed(mergedResult);

      const corridorReady = Boolean(
        mergedResult.source?.trim() && mergedResult.destination?.trim()
      );

      if (!corridorReady) {
        setError(
          sanitizeUserMessage(
            mergedResult.parse_warning ||
              'Could not detect both origin and destination — we filled what we could; check the form.'
          )
        );
      }

      if (contextMode === 'home' && (andNavigate || navigateOnApply)) {
        setPendingRouteIntent(mergedResult);
        setConfirmOpen(true);
        return;
      }

      if (andNavigate && corridorReady) {
        const mode = resolveTargetMode(mergedResult);
        const targetPath = getModePath(mergedResult);
        setShipmentAutorun(mode);
        onIntentApplied?.(mergedResult, 'run');
        setFillNotice('Form updated — running optimization…');
        if (pathname !== targetPath) {
          router.push(targetPath);
        } else {
          scrollToPipelineForm();
        }
        return;
      }

      onIntentApplied?.(mergedResult, 'fill');

      let notice =
        contextMode === 'home'
          ? corridorReady
            ? 'Shipment understood — open a mode from the nav or use “Route me to the right tool”.'
            : 'Partial fields saved — complete the corridor on a mode page.'
          : corridorReady
            ? 'Form updated below — review origin, destination, weight, and date.'
            : 'Partial fields applied — complete the form below.';

      if (mergedResult.parse_warning) {
        notice = `${notice} ${sanitizeUserMessage(mergedResult.parse_warning)}`;
      }
      setFillNotice(notice);

      if (contextMode !== 'home') {
        scrollToPipelineForm();
      }
    } catch (e: unknown) {
      if (e instanceof TrafficQueueError) return;
      setError(
        sanitizeUserMessage(e instanceof Error ? e.message : 'Could not understand that brief.')
      );
    } finally {
      setLoading(false);
    }
  }

  const title =
    contextMode === 'home'
      ? 'Describe your shipment'
      : 'Or describe in your own words';

  return (
    <div
      className={`rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-500/[0.08] via-surface-container-low/60 to-transparent p-5 sm:p-6 ${className}`}
    >
      <div className="flex items-start gap-2 mb-3">
        <span
          className="material-symbols-outlined text-violet-300 shrink-0"
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden
        >
          auto_awesome
        </span>
        <div>
          <h3 className="text-sm font-bold text-on-surface">{title}</h3>
          <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
            Write in English, Hindi, or Hinglish. We extract origin, destination, weight, budget,
            and preferred transport mode.
          </p>
        </div>
      </div>

      <ParagraphInputWithStt
        value={text}
        onChange={(v) => {
          setText(v);
          if (
            parsed &&
            v.trim() !== (parsed.scenario_brief || scenarioBrief || '').trim()
          ) {
            setParsed(null);
            setFillNotice(null);
            setError(null);
          }
        }}
        rows={contextMode === 'home' ? 5 : 4}
        placeholder="e.g. I have 80kg medicines from Delhi to Chennai, max ₹12,000, need delivery within 2 days, prefer train not flight…"
        className="px-4 py-3 rounded-xl border border-violet-400/25 bg-surface-container-lowest text-on-surface text-sm placeholder:text-outline/50 focus:outline-none focus:ring-2 focus:ring-violet-400/35 resize-y min-h-[100px]"
        lang="en-IN"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => runParse(false)}
          className="px-4 py-2.5 rounded-xl bg-violet-500/20 border border-violet-400/35 text-sm font-semibold text-violet-100 hover:bg-violet-500/30 disabled:opacity-50"
        >
          {loading ? 'Understanding…' : 'Understand & fill form'}
        </button>
        {(showRouteButton || navigateOnApply || contextMode !== 'home') && (
          <button
            type="button"
            disabled={loading}
            onClick={() => runParse(true)}
            className="px-4 py-2.5 rounded-xl bg-primary text-[#001b3f] text-sm font-semibold hover:brightness-110 disabled:opacity-50"
          >
            {contextMode === 'home'
              ? 'Route me to the right tool'
              : 'Understand & run optimize'}
          </button>
        )}
      </div>

      {fillNotice && (
        <p className="mt-3 text-xs text-emerald-200 border border-emerald-400/25 bg-emerald-500/10 rounded-lg px-3 py-2">
          {fillNotice}
        </p>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-300 border border-red-400/20 bg-red-500/10 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {parsed?.scenario_summary && (
        <p className="mt-3 text-xs text-on-surface-variant border-l-2 border-violet-400/40 pl-3">
          {parsed.scenario_summary}
        </p>
      )}
      {parsed && <IntentChips parsed={parsed} />}

      <IntentConfirmModal
        open={confirmOpen}
        parsed={pendingRouteIntent}
        loading={loading}
        onClose={() => {
          setConfirmOpen(false);
          setPendingRouteIntent(null);
        }}
        onConfirmRun={() => {
          if (!pendingRouteIntent) return;
          navigateToPipeline(pendingRouteIntent, true);
        }}
        onEdit={() => {
          if (!pendingRouteIntent) return;
          navigateToPipeline(pendingRouteIntent, false);
        }}
      />
    </div>
  );
}
