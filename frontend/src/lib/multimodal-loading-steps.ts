/** User-facing progress steps for slow multimodal API calls. */

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
  stepDelaysMs: number[];
  steps: MultimodalLoadingStep[];
  tips: string[];
}

const SHARED_RESOLVE: MultimodalLoadingStep = {
  id: 'resolve',
  label: 'Reading your corridor',
  detail: 'Matching origin and destination to cities, stations, and hubs',
};

const SHARED_WARM: MultimodalLoadingStep = {
  id: 'warm',
  label: 'Connecting to LogiFlow',
  detail: 'First request after idle can take up to a minute — please stay on this page',
};

const SHARED_PIPELINES: MultimodalLoadingStep = {
  id: 'pipelines',
  label: 'Checking each transport mode',
  detail: 'Road, rail, air, and water options are evaluated in parallel',
};

const SHARED_SCORE: MultimodalLoadingStep = {
  id: 'score',
  label: 'Scoring your options',
  detail: 'Balancing time, cost, and risk using your priority',
};

const SHARED_RECOMMEND: MultimodalLoadingStep = {
  id: 'recommend',
  label: 'Choosing the best fit',
  detail: 'Picking a winner and noting trade-offs versus other modes',
};

const SHARED_READY: MultimodalLoadingStep = {
  id: 'ready',
  label: 'Preparing your results',
  detail: 'Building the comparison table, map, and recommendation',
};

export const OPTIMIZE_LOADING_CONFIG: MultimodalLoadingConfig = {
  variant: 'optimize',
  title: 'Comparing all transport modes',
  badge: 'Multimodal comparison',
  accentClass: 'text-comparator',
  accentBorder: 'border-comparator/40',
  accentBg: 'bg-comparator/10',
  ambient: 'comparator',
  stepDelaysMs: [0, 1200, 2800, 4500, 10500, 13500, 15000],
  steps: [SHARED_RESOLVE, SHARED_WARM, SHARED_PIPELINES, SHARED_SCORE, SHARED_RECOMMEND, SHARED_READY],
  tips: [
    'Four transport modes are compared side by side.',
    'Scores include typical delays and weather risk where available.',
    'Strictly worse options are removed before ranking.',
    'Your priority setting changes how time, cost, and safety are weighted.',
  ],
};

export const COMPARE_LOADING_CONFIG: MultimodalLoadingConfig = {
  ...OPTIMIZE_LOADING_CONFIG,
  variant: 'compare',
  badge: 'All-mode comparison',
  steps: [SHARED_RESOLVE, SHARED_WARM, SHARED_PIPELINES, SHARED_SCORE, SHARED_RECOMMEND, SHARED_READY],
};

export const COMPOSE_LOADING_CONFIG: MultimodalLoadingConfig = {
  variant: 'compose',
  title: 'Building multimodal routes',
  badge: 'Hybrid route planner',
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
      label: 'Finding hub cities',
      detail: 'Looking for sensible transfer cities between road, rail, and air',
    },
    {
      id: 'pipelines',
      label: 'Planning each leg',
      detail: 'Optimizing road, train, and flight segments for your corridor',
    },
    {
      id: 'chain',
      label: 'Linking legs together',
      detail: 'Adding realistic transfer and handling time between segments',
    },
    {
      id: 'score',
      label: 'Ranking route chains',
      detail: 'Sorting itineraries by time, cost, risk, and your priority',
    },
    {
      id: 'recommend',
      label: 'Selecting the best chain',
      detail: 'Finalizing the recommended multimodal itinerary',
    },
    SHARED_READY,
  ],
  tips: [
    'Hub routes can beat a single mode on cost or reliability.',
    'Rural corridors may route through the nearest major city.',
    'Transfer time between modes is included in the total.',
    'Repeat corridors usually load faster.',
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
