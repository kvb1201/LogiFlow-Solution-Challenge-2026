/** Backend-aligned steps shown during rail optimization. */

export type RailLoadingStepId =
  | 'resolve'
  | 'warm'
  | 'optimize'
  | 'map'
  | 'ready';

export interface RailLoadingStep {
  id: RailLoadingStepId;
  label: string;
  backend: string;
  detail: string;
}

export const RAIL_LOADING_STEPS: RailLoadingStep[] = [
  {
    id: 'resolve',
    label: 'Resolve corridor endpoints',
    backend: 'location_funnel · station_name.pdf',
    detail: 'Map city names and station codes to canonical clusters',
  },
  {
    id: 'warm',
    label: 'Connect to API',
    backend: 'GET /health · warm-backend',
    detail: 'Wake Render instance if sleeping (may take up to 90s on free tier)',
  },
  {
    id: 'optimize',
    label: 'Optimize parcel routes',
    backend: 'POST /railway/optimize',
    detail: 'Schedule sources → tariffs → scraped delay ML → cheapest / fastest / safest',
  },
  {
    id: 'map',
    label: 'Prepare corridor map',
    backend: 'station lookup · Supabase geometry cache',
    detail: 'Load lat/lng for intermediate halts on the recommended train',
  },
  {
    id: 'ready',
    label: 'Render results',
    backend: 'client',
    detail: 'Apply recommendations to dashboard and map',
  },
];

export function stepProgress(activeIndex: number): number {
  if (activeIndex < 0) return 0;
  if (activeIndex >= RAIL_LOADING_STEPS.length) return 100;
  // Completed steps count fully; active step counts half.
  const unit = 100 / RAIL_LOADING_STEPS.length;
  return Math.min(100, Math.round(activeIndex * unit + unit * 0.45));
}
