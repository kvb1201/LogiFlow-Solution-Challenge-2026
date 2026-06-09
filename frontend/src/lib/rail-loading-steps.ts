/** User-facing progress steps during rail optimization. */

export type RailLoadingStepId = 'resolve' | 'warm' | 'optimize' | 'map' | 'ready';

export interface RailLoadingStep {
  id: RailLoadingStepId;
  label: string;
  detail: string;
}

export const RAIL_LOADING_STEPS: RailLoadingStep[] = [
  {
    id: 'resolve',
    label: 'Reading your corridor',
    detail: 'Matching stations and cities along your route',
  },
  {
    id: 'warm',
    label: 'Connecting to LogiFlow',
    detail: 'First request after idle can take up to a minute — please stay on this page',
  },
  {
    id: 'optimize',
    label: 'Finding train options',
    detail: 'Schedules, tariffs, and delay risk for your cargo',
  },
  {
    id: 'map',
    label: 'Drawing the route map',
    detail: 'Loading station locations and track geometry',
  },
  {
    id: 'ready',
    label: 'Preparing your results',
    detail: 'Applying recommendations to your dashboard',
  },
];

export function stepProgress(activeIndex: number): number {
  if (activeIndex < 0) return 0;
  if (activeIndex >= RAIL_LOADING_STEPS.length) return 100;
  const unit = 100 / RAIL_LOADING_STEPS.length;
  return Math.min(100, Math.round(activeIndex * unit + unit * 0.45));
}
