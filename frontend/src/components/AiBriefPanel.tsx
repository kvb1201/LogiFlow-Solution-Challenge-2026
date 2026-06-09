'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  parseShipmentIntent,
  type IntentContextMode,
  type ParsedIntent,
} from '@/services/api';
import { routeForMode } from '@/lib/applyParsedIntent';
import { setShipmentAutorun } from '@/lib/shipmentAutorun';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import ParagraphInputWithStt from '@/components/ParagraphInputWithStt';
import IntentConfirmModal from '@/components/IntentConfirmModal';

type AiBriefPanelProps = {
  contextMode: IntentContextMode;
  /** Home: navigate after parse. Mode pages: stay and fill form only */
  navigateOnApply?: boolean;
  /** Show secondary button to parse + navigate (home / comparator) */
  showRouteButton?: boolean;
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
  if (parsed.source_engine && parsed.source_engine !== 'heuristic') {
    chips.push(`via ${parsed.source_engine}`);
  }
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
  className = '',
}: AiBriefPanelProps) {
  const router = useRouter();
  const applyParsedIntent = useLogiFlowStore((s) => s.applyParsedIntent);
  const setScenarioBrief = useLogiFlowStore((s) => s.setScenarioBrief);
  const scenarioBrief = useLogiFlowStore((s) => s.scenarioBrief);
  const lastParsed = useLogiFlowStore((s) => s.lastParsedIntent);

  const [text, setText] = useState(scenarioBrief || '');

  useEffect(() => {
    if (scenarioBrief?.trim()) setText(scenarioBrief);
  }, [scenarioBrief]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function runParse(andNavigate: boolean) {
    const brief = text.trim();
    if (brief.length < 3) {
      setError('Write at least a short description of your shipment.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await parseShipmentIntent(brief, contextMode);
      if (result.error) {
        throw new Error(result.error);
      }
      result.scenario_brief = result.scenario_brief || brief;
      applyParsedIntent(result);
      setScenarioBrief(result.scenario_brief);
      setParsed(result);

      if (!result.applied) {
        setError(
          result.parse_warning ||
            'Could not detect both origin and destination — we filled what we could; check the form.'
        );
      }

      if (andNavigate || navigateOnApply) {
        setPendingRouteIntent(result);
        setConfirmOpen(true);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'AI parse failed');
    } finally {
      setLoading(false);
    }
  }

  const title =
    contextMode === 'home'
      ? 'Describe your shipment (AI)'
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
            Write in English, Hindi, or Hinglish — AI turns it into origin, destination, weight,
            and mode. Works best when GEMINI_API_KEY is set on the backend.
          </p>
        </div>
      </div>

      <ParagraphInputWithStt
        value={text}
        onChange={setText}
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
        {(showRouteButton || navigateOnApply) && (
          <button
            type="button"
            disabled={loading}
            onClick={() => runParse(true)}
            className="px-4 py-2.5 rounded-xl bg-primary text-[#001b3f] text-sm font-semibold hover:brightness-110 disabled:opacity-50"
          >
            {contextMode === 'home' ? 'Route me to the right tool' : 'Fill & open results page'}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-300 border border-red-400/20 bg-red-500/10 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {parsed?.scenario_summary && (
        <p className="mt-3 text-xs text-on-surface-variant border-l-2 border-violet-400/40 pl-3">
          {parsed.scenario_summary}
          {parsed.source_engine && (
            <span className="block mt-1 text-[10px] text-outline">
              via {parsed.source_engine}
              {parsed.parse_warning ? ` · ${parsed.parse_warning}` : ''}
            </span>
          )}
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
