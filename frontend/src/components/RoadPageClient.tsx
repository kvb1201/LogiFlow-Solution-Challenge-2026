'use client';

import Link from 'next/link';
import { usePlannerRegenerateParams } from '@/hooks/usePlannerRegenerateParams';
import RoadInputForm from '@/components/roadInputForm';
import RouteResults from '@/components/RouteResults';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';

// ── Road capability metrics ───────────────────────────────────────────
// These represent the three core differentiators of the road pipeline:
//   1. Network reach — cities reachable via the routing engine
//   2. Live signal sources — TomTom Traffic + Weather API + ML Delay Model
//   3. AI Route Intelligence — health scoring, confidence, reoptimization

const ROAD_METRICS = [
  { value: '120+', label: 'Connected Cities' },
  { value: '3',    label: 'Live Signal Sources' },
  { value: 'AI',   label: 'Route Intelligence' },
] as const;

// ── Capability badges ────────────────────────────────────────────────

const CAPABILITY_BADGES = [
  { icon: 'traffic',          label: 'TomTom Traffic'    },
  { icon: 'cloud',            label: 'Weather API'        },
  { icon: 'psychology',       label: 'ML Delay Model'     },
  { icon: 'favorite',         label: 'Route Health'       },
  { icon: 'auto_awesome',     label: 'Reoptimization'     },
] as const;

// ── Metric item (shared between landing and results header) ──────────

function MetricItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-xl sm:text-2xl font-black text-secondary">{value}</div>
      <div className="text-[10px] sm:text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
        {label}
      </div>
    </div>
  );
}

// ── Results header metrics (inline dot-separated, matching Air page) ─

function ResultsMetricsStrip() {
  return (
    <div className="flex flex-wrap items-center gap-2 mt-5 text-xs font-medium text-secondary/70 uppercase tracking-wider">
      {ROAD_METRICS.map((m, i) => (
        <span key={m.label} className="flex items-center gap-2">
          {i > 0 && <span className="w-1 h-1 rounded-full bg-secondary/50" />}
          <strong className="text-secondary/90 font-bold text-[13px]">{m.value}</strong>{' '}
          {m.label}
        </span>
      ))}
    </div>
  );
}

// ── Main client ───────────────────────────────────────────────────────

export default function RoadPageClient() {
  usePlannerRegenerateParams('road');

  const error      = useLogiFlowStore(s => s.error);
  const loading    = useLogiFlowStore(s => s.loading);
  const loadingMode = useLogiFlowStore(s => s.loadingMode);
  const routes     = useLogiFlowStore(s => s.routes);
  const source     = useLogiFlowStore(s => s.source);
  const destination = useLogiFlowStore(s => s.destination);
  const hasSearched = useLogiFlowStore(s => s.hasSearched);
  const resetResults = useLogiFlowStore(s => s.resetResults);
  const searchMode  = useLogiFlowStore(s => s.searchMode);
  const roadNoRoutesReason = useLogiFlowStore(s => s.roadNoRoutesReason);

  const showRoadLoading = loading && loadingMode === 'road';
  const hasResults = routes.length > 0 || !!roadNoRoutesReason;

  // ── Pre-search landing ────────────────────────────────────────────

  if (!hasSearched) {
    return (
      <div className="flex-1 flex flex-col overflow-x-hidden">
        {showRoadLoading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#06080d]/70 backdrop-blur-sm" />
        )}
        <div
          className="flex-1 flex flex-col items-center sm:justify-center px-4 py-10 relative overflow-y-auto overflow-x-hidden"
          style={{ background: '#06080d' }}
        >
          {/* Ambient backdrop */}
          <div className="absolute inset-0 z-0 pointer-events-none">
            <div className="absolute w-[680px] h-[680px] rounded-full opacity-[0.08] blur-[130px] bg-secondary animate-mesh-1 top-[-20%] left-[-10%]" />
            <div className="absolute w-[500px] h-[500px] rounded-full opacity-[0.06] blur-[110px] bg-primary animate-mesh-2 bottom-[-10%] right-[-8%]" />
            <div className="absolute w-[380px] h-[380px] rounded-full opacity-[0.04] blur-[90px] bg-tertiary animate-mesh-3 top-[50%] left-[55%]" />
            <div className="absolute inset-0 hero-dot-grid opacity-[0.28]" />
            <div
              className="absolute inset-0"
              style={{ background: 'radial-gradient(ellipse at center, transparent 20%, #06080d 75%)' }}
            />
          </div>

          <div className="relative z-10 w-full max-w-[860px] animate-slide-up">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-secondary/8 border border-secondary/15 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-secondary/90">
                  Road Logistics · Traffic-aware routing
                </span>
              </div>
            </div>

            {/* Title + description */}
            <div className="text-center mb-10">
              <h1 className="text-[2.5rem] xs:text-5xl sm:text-6xl md:text-[72px] font-black font-headline tracking-tighter mb-4 leading-none">
                <span
                  className="bg-gradient-to-r from-secondary via-amber-300 to-primary bg-clip-text text-transparent animate-gradient-shift"
                  style={{ backgroundSize: '200% auto' }}
                >
                  Logi
                </span>
                <span className="text-on-surface">Flow</span>
              </h1>
              <p className="text-sm sm:text-[15px] text-on-surface-variant max-w-lg mx-auto leading-relaxed">
                AI-powered cargo routing across{' '}
                <span className="text-secondary font-medium">road</span> with live traffic,
                weather intelligence, and ML risk scoring.
              </p>

              {/* ── Hero metrics ── */}
              <div
                className="flex flex-wrap justify-center gap-6 mt-6 animate-fade-in"
                style={{ animationDelay: '0.3s', animationFillMode: 'backwards' }}
              >
                {ROAD_METRICS.map(m => (
                  <MetricItem key={m.label} value={m.value} label={m.label} />
                ))}
              </div>
            </div>

            {/* ── Capability badges ── */}
            <div className="flex flex-wrap justify-center gap-2 mb-8">
              {CAPABILITY_BADGES.map((badge, i) => (
                <div
                  key={badge.label}
                  className="flex items-center gap-2 px-3.5 py-2 bg-surface-container/50 border border-outline-variant/10 rounded-lg text-xs text-on-surface-variant backdrop-blur-sm animate-fade-in"
                  style={{
                    animationDelay: `${0.5 + i * 0.1}s`,
                    animationFillMode: 'backwards',
                  }}
                >
                  <span
                    className="material-symbols-outlined text-secondary"
                    style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
                  >
                    {badge.icon}
                  </span>
                  {badge.label}
                </div>
              ))}
            </div>

            {/* Form */}
            <RoadInputForm />

            {/* Footer note */}
            <div
              className="text-center mt-8 animate-fade-in"
              style={{ animationDelay: '0.8s', animationFillMode: 'backwards' }}
            >
              <p className="text-[10px] text-outline/50 uppercase tracking-[0.2em] font-label">
                Powered by TomTom routing · live traffic · ML delay prediction
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Post-search results view ──────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col overflow-x-hidden min-h-0 bg-[var(--color-background)] text-[var(--color-on-surface)]">
      {/* Results header — matches Air page structure */}
      <div className="relative border-b border-outline-variant/10 overflow-hidden bg-[#06080d]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute w-[520px] h-[520px] rounded-full opacity-[0.10] blur-[100px] bg-secondary -top-[40%] right-[-15%] animate-mesh-1" />
          <div className="absolute w-[420px] h-[420px] rounded-full opacity-[0.06] blur-[90px] bg-primary bottom-[-35%] left-[-10%] animate-mesh-2" />
        </div>
        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-11">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
            <div>
              {/* Mode badge */}
              <div className="inline-flex items-center gap-2 rounded-full border border-secondary/25 bg-secondary/10 px-3 py-1.5 mb-4">
                <span
                  className="material-symbols-outlined text-secondary leading-none"
                  style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
                >
                  local_shipping
                </span>
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-secondary/90">
                  Road cargo
                </span>
              </div>

              <h1 className="font-headline text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-on-surface mb-3">
                Road route optimization
              </h1>

              <p className="text-[15px] text-on-surface-variant max-w-2xl leading-relaxed">
                Traffic-aware highway routing with ML risk scoring and cost breakdowns — alongside{' '}
                <Link href="/railway" className="text-primary hover:underline underline-offset-2">
                  rail
                </Link>{' '}
                and{' '}
                <Link href="/air" className="text-secondary hover:underline underline-offset-2">
                  air
                </Link>{' '}
                in one workflow.
              </p>

              {/* ── Results metrics strip — matches Air page exactly ── */}
              <ResultsMetricsStrip />
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={resetResults}
                className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant hover:text-on-surface hover:border-outline-variant/35 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">restart_alt</span>
                Reset
              </button>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant hover:text-on-surface hover:border-outline-variant/35 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">home</span>
                Home
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-6xl w-full mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-6">
        {/* Error banner — only for genuine API failures, not corridor rejections */}
        {error && !roadNoRoutesReason && (
          <div className="bg-error/10 border border-error/20 px-4 py-3 rounded-xl text-sm text-error flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">error</span>
            {error}
          </div>
        )}

        {/* Loading state */}
        {showRoadLoading && !hasResults && (
          <div className="flex items-center justify-center py-16 gap-3">
            <span className="material-symbols-outlined text-2xl text-secondary animate-spin">
              progress_activity
            </span>
            <span className="text-sm text-on-surface-variant">Calculating road paths…</span>
          </div>
        )}

        {/* Form always shown in results view for re-search */}
        <RoadInputForm />

        {/* No routes found (post-search, non-corridor-rejection) */}
        {!loading && !hasResults && hasSearched && searchMode === 'road' && !error && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 flex items-start gap-3">
            <span
              className="material-symbols-outlined text-amber-400 mt-0.5"
              style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
            >
              info
            </span>
            <div>
              <p className="text-sm font-medium text-on-surface mb-1">
                No road routes found between {source || 'origin'} and {destination || 'destination'}
              </p>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Try relaxing the cargo constraints or explore{' '}
                <Link href="/railway" className="text-primary hover:underline underline-offset-2">
                  rail
                </Link>{' '}
                and{' '}
                <Link href="/air" className="text-secondary hover:underline underline-offset-2">
                  air
                </Link>{' '}
                alternatives.
              </p>
            </div>
          </div>
        )}

        {/* Route results (handles InvalidCorridorCard internally when roadNoRoutesReason is set) */}
        {!loading && <RouteResults />}
      </div>
    </div>
  );
}
