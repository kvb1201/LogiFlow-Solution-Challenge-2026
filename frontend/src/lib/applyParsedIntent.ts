import type { ParsedIntent } from '@/services/api';
import type { LogiFlowState } from '@/store/useLogiFlowStore';

export const MODE_TO_PATH: Record<string, string> = {
  rail: '/railway',
  road: '/road',
  air: '/air',
  water: '/water',
  hybrid: '/hybrid',
  comparator: '/comparator',
};

export function routeForMode(mode: string): string {
  return MODE_TO_PATH[mode] || '/hybrid';
}

function normalizePriority(priority: string | undefined | null): string | undefined {
  if (!priority) return undefined;
  const key = priority.toLowerCase();
  const map: Record<string, string> = {
    cost: 'cost',
    cheapest: 'cost',
    time: 'time',
    fastest: 'time',
    safe: 'safe',
    safest: 'safe',
    balanced: 'cost',
  };
  return map[key] ?? priority;
}

/** Apply AI-parsed fields into zustand setters */
export function buildIntentPatch(
  parsed: ParsedIntent,
  set: (partial: Partial<LogiFlowState>) => void,
  setters: Pick<
    LogiFlowState,
    | 'setSource'
    | 'setDestination'
    | 'setPriority'
    | 'setCargoWeight'
    | 'setCargoType'
    | 'setDepartureDate'
    | 'setBudgetMax'
    | 'setDeadlineHours'
    | 'setAvoidTolls'
    | 'setAvoidHighways'
    | 'setTrafficAware'
    | 'setVehicleType'
    | 'setScenarioBrief'
  >
): void {
  if (parsed.source) setters.setSource(parsed.source);
  if (parsed.destination) setters.setDestination(parsed.destination);
  const priority = normalizePriority(parsed.priority);
  if (priority) setters.setPriority(priority);
  if (parsed.cargo_weight_kg != null && parsed.cargo_weight_kg > 0) {
    setters.setCargoWeight(Math.round(parsed.cargo_weight_kg));
  }
  if (parsed.cargo_type) setters.setCargoType(parsed.cargo_type);
  if (parsed.departure_date) setters.setDepartureDate(parsed.departure_date);
  if (parsed.budget_max_inr != null) setters.setBudgetMax(parsed.budget_max_inr);
  if (parsed.deadline_hours != null) setters.setDeadlineHours(parsed.deadline_hours);
  if (parsed.avoid_tolls != null) setters.setAvoidTolls(parsed.avoid_tolls);
  if (parsed.avoid_highways != null) setters.setAvoidHighways(parsed.avoid_highways);
  if (parsed.traffic_aware != null) setters.setTrafficAware(parsed.traffic_aware);
  if (
    parsed.vehicle_type &&
    ['mini_truck', 'truck', 'heavy_truck'].includes(parsed.vehicle_type)
  ) {
    setters.setVehicleType(parsed.vehicle_type);
  }
  const brief = parsed.scenario_brief?.trim();
  if (brief) setters.setScenarioBrief(brief);
  set({ lastParsedIntent: parsed });
}
