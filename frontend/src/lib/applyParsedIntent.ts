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

export const MODE_WEIGHT_MAX_KG: Record<string, number> = {
  rail: 500_000,
  road: 5_000,
  air: 2_000,
  water: 500_000,
  hybrid: 500_000,
  comparator: 500_000,
  home: 500_000,
};

export function clampWeightForMode(weightKg: number, mode: string): number {
  const max = MODE_WEIGHT_MAX_KG[mode] ?? 500_000;
  return Math.min(Math.max(1, Math.round(weightKg)), max);
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
    balanced: 'balanced',
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
  let intent = parsed;

  if (intent.source) setters.setSource(intent.source);
  if (intent.destination) setters.setDestination(intent.destination);
  const priority = normalizePriority(intent.priority);
  if (priority) setters.setPriority(priority);
  if (intent.cargo_weight_kg != null && intent.cargo_weight_kg > 0) {
    const mode = intent.suggested_mode || 'hybrid';
    const raw = Math.round(intent.cargo_weight_kg);
    const clamped = clampWeightForMode(raw, mode);
    setters.setCargoWeight(clamped);
    if (clamped < raw) {
      intent = {
        ...intent,
        cargo_weight_kg: clamped,
        parse_warning:
          intent.parse_warning ||
          `Weight capped to ${clamped.toLocaleString('en-IN')} kg for ${mode} (max ${MODE_WEIGHT_MAX_KG[mode]?.toLocaleString('en-IN') ?? 'limit'}).`,
      };
    }
  }
  if (intent.cargo_type) setters.setCargoType(intent.cargo_type);
  if (intent.departure_date) setters.setDepartureDate(intent.departure_date);
  if (intent.budget_max_inr != null) setters.setBudgetMax(intent.budget_max_inr);
  if (intent.deadline_hours != null) setters.setDeadlineHours(intent.deadline_hours);
  if (intent.avoid_tolls != null) setters.setAvoidTolls(intent.avoid_tolls);
  if (intent.avoid_highways != null) setters.setAvoidHighways(intent.avoid_highways);
  if (intent.traffic_aware != null) setters.setTrafficAware(intent.traffic_aware);
  if (
    intent.vehicle_type &&
    ['mini_truck', 'truck', 'heavy_truck'].includes(intent.vehicle_type)
  ) {
    setters.setVehicleType(intent.vehicle_type);
  }
  const brief = intent.scenario_brief?.trim();
  if (brief) setters.setScenarioBrief(brief);
  set({ lastParsedIntent: intent });
}
