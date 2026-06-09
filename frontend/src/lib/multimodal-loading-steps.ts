/** Backend-aligned steps for slow multimodal API calls (15–25s). */

export type MultimodalLoadingVariant = 'optimize' | 'compare' | 'compose';

export type MultimodalLoadingStepId =
  | 'resolve'
  | 'warm'
  | 'pipelines'
  | 'hubs'
  | 'chain'
  | 'score'
  | 'recommend'
  | 'ready';

export interface MultimodalLoadingStep {
  id: MultimodalLoadingStepId;
  label: string;
  backend: string;
  detail: string;
}

export interface MultimodalLoadingConfig {
  variant: MultimodalLoadingVariant;
  title: string;
  badge: string;
  accentClass: string;
  accentBorder: string;
  accentBg: string;
  ambient: 'hybrid' | 'comparator';
  /** Milliseconds after load start when each step becomes active */
  stepDelaysMs: number[];
  steps: MultimodalLoadingStep[];
  tips: string[];
}

const SHARED_RESOLVE: MultimodalLoadingStep = {
  id: 'resolve',
  label: 'Resolve corridor endpoints',
  backend: 'location_funnel · geocoder',
  detail: 'Map city names to canonical hubs and station clusters',
};

const SHARED_WARM: MultimodalLoadingStep = {
  id: 'warm',
  label: 'Connect to API',
  backend: 'GET /health · warm-backend',
  detail: 'Wake Render if sleeping (free tier may take up to 90s on cold start)',
};

const SHARED_PIPELINES: MultimodalLoadingStep = {
  id: 'pipelines',
  label: 'Run transport pipelines in parallel',
  backend: 'POST /road · /railway · /air · /water',
  detail: 'TomTom routing · IR schedules · OpenFlights · port graph — up to 30s each',
};

const SHARED_SCORE: MultimodalLoadingStep = {
  id: 'score',
  label: 'Normalize & score modes',
  backend: 'HybridPipeline · Pareto rank',
  detail: 'Delay-adjusted time, cost, risk — weighted by your priority',
};

const SHARED_RECOMMEND: MultimodalLoadingStep = {
  id: 'recommend',
  label: 'Build recommendation',
  backend: 'tradeoffs · mode insights',
  detail: 'Pick winner and explain why other modes were not chosen',
};

const SHARED_READY: MultimodalLoadingStep = {
  id: 'ready',
  label: 'Render results',
  backend: 'client',
  detail: 'Apply comparison table, map, and verdict card',
};

export const OPTIMIZE_LOADING_CONFIG: MultimodalLoadingConfig = {
  variant: 'optimize',
  title: 'Comparing all transport modes',
  badge: 'Hybrid optimizer · POST /optimize',
  accentClass: 'text-comparator',
  accentBorder: 'border-comparator/40',
  accentBg: 'bg-comparator/10',
  ambient: 'comparator',
  stepDelaysMs: [0, 1200, 2800, 4500, 10500, 13500, 15000],
  steps: [
    SHARED_RESOLVE,
    SHARED_WARM,
    SHARED_PIPELINES,
    SHARED_SCORE,
    SHARED_RECOMMEND,
    SHARED_READY,
  ],
  tips: [
    'Four pipelines run in parallel — road, rail, air, and water.',
    'Scores factor in ML delay prediction and weather risk.',
    'Pareto dominance removes strictly worse options before ranking.',
    'Your priority weights cost, time, and safety differently.',
  ],
};

export const COMPARE_LOADING_CONFIG: MultimodalLoadingConfig = {
  ...OPTIMIZE_LOADING_CONFIG,
  variant: 'compare',
  badge: 'Mode comparator · POST /compare/routes',
  steps: [
    SHARED_RESOLVE,
    SHARED_WARM,
    { ...SHARED_PIPELINES, backend: 'POST /compare/routes → 4 pipelines' },
    SHARED_SCORE,
    SHARED_RECOMMEND,
    SHARED_READY,
  ],
};

export const COMPOSE_LOADING_CONFIG: MultimodalLoadingConfig = {
  variant: 'compose',
  title: 'Composing multimodal chains',
  badge: 'Route composer · POST /compose',
  accentClass: 'text-hybrid',
  accentBorder: 'border-hybrid/40',
  accentBg: 'bg-hybrid/10',
  ambient: 'hybrid',
  stepDelaysMs: [0, 1200, 2800, 5000, 9000, 13500, 17500, 20500, 22000],
  steps: [
    SHARED_RESOLVE,
    SHARED_WARM,
    {
      id: 'hubs',
      label: 'Discover hub cities',
      backend: 'geo_hub_finder · hub_catalog',
      detail: 'Find transfer cities for rail→air, rail→road, and rail→rail chains',
    },
    {
      id: 'pipelines',
      label: 'Optimize corridor legs',
      backend: 'rail+road · rail+air · rail+rail templates',
      detail: 'Black-box pipeline calls per leg with per-mode timeouts',
    },
    {
      id: 'chain',
      label: 'Chain itineraries',
      backend: 'transfer buffers · leg cache',
      detail: 'Join legs with realistic transshipment and handling fees',
    },
    {
      id: 'score',
      label: 'Score chained routes',
      backend: 'itinerary_scorer',
      detail: 'Rank hub itineraries by time, cost, risk, and your priority',
    },
    {
      id: 'recommend',
      label: 'Pick best chain',
      backend: 'POST /compose',
      detail: 'Select recommended multimodal itinerary with segment breakdown',
    },
    SHARED_READY,
  ],
  tips: [
    'Chained routes can beat single-mode on cost or reliability.',
    'Hub discovery considers rural corridors and known freight lanes.',
    'Transfer buffers account for rail→air and rail→road handoffs.',
    'Leg results are cached so repeat corridors respond faster.',
  ],
};

export function getMultimodalLoadingConfig(
  variant: MultimodalLoadingVariant
): MultimodalLoadingConfig {
  if (variant === 'compose') return COMPOSE_LOADING_CONFIG;
  if (variant === 'compare') return COMPARE_LOADING_CONFIG;
  return OPTIMIZE_LOADING_CONFIG;
}

export function multimodalStepProgress(activeIndex: number, totalSteps: number): number {
  if (activeIndex < 0 || totalSteps <= 0) return 0;
  if (activeIndex >= totalSteps) return 100;
  const unit = 100 / totalSteps;
  return Math.min(100, Math.round(activeIndex * unit + unit * 0.45));
}
