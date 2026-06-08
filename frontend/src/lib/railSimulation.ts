import type {
  OptimizeResult,
  RankedOption,
  Recommendation,
  RouteSegment,
} from '@/services/api';
import { dedupeRailOptions } from '@/lib/dedupeRailOptions';

export type RailSeason = 'normal' | 'monsoon' | 'fog' | 'festival' | 'summer' | 'winter';

export type RailWeatherCondition = 'Clear' | 'Clouds' | 'Fog' | 'Rain' | 'Thunderstorm';

export interface RailSimulationParams {
  congestion_level: number;
  season: RailSeason;
  departure_hour: number;
  weather: {
    temp: number;
    rain: number;
    condition: RailWeatherCondition;
  };
}

export interface RailSimulatedRoute {
  train_number: string;
  train_name: string;
  train_type: string;
  route_type: string;
  distance_km: number;
  base_duration_hours: number;
  delay_hours: number;
  adjusted_eta_hours: number;
  cost_inr: number;
  risk_score: number;
  risk_pct: string;
  booking_ease: number;
  key_factors?: string[];
  segments?: RouteSegment[];
  has_transfer: boolean;
  ml_delay_minutes?: number | null;
  scenario_multiplier?: number | null;
}

export interface RailSimulateResult {
  simulation_params: RailSimulationParams & {
    origin_city: string;
    destination_city: string;
    cargo_weight_kg: number;
    cargo_type: string;
    priority: string;
  };
  best: RailSimulatedRoute | null;
  cheapest: RailSimulatedRoute | null;
  fastest: RailSimulatedRoute | null;
  safest: RailSimulatedRoute | null;
  all_results: RailSimulatedRoute[];
  total_routes: number;
}

export const RAIL_SIMULATION_PRESETS: Array<{
  name: string;
  params: RailSimulationParams;
}> = [
  {
    name: 'Clear Run',
    params: {
      season: 'normal',
      congestion_level: 0.15,
      departure_hour: 10,
      weather: { temp: 28, rain: 0, condition: 'Clear' },
    },
  },
  {
    name: 'Monsoon Peak',
    params: {
      season: 'monsoon',
      congestion_level: 0.65,
      departure_hour: 8,
      weather: { temp: 26, rain: 45, condition: 'Rain' },
    },
  },
  {
    name: 'Winter Fog',
    params: {
      season: 'fog',
      congestion_level: 0.45,
      departure_hour: 6,
      weather: { temp: 12, rain: 2, condition: 'Fog' },
    },
  },
  {
    name: 'Festival Rush',
    params: {
      season: 'festival',
      congestion_level: 0.9,
      departure_hour: 18,
      weather: { temp: 30, rain: 5, condition: 'Clouds' },
    },
  },
  {
    name: 'Night Express',
    params: {
      season: 'normal',
      congestion_level: 0.2,
      departure_hour: 2,
      weather: { temp: 22, rain: 0, condition: 'Clear' },
    },
  },
];

export const RAIL_SEASON_OPTIONS: { value: RailSeason; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'monsoon', label: 'Monsoon' },
  { value: 'fog', label: 'Fog' },
  { value: 'festival', label: 'Festival' },
  { value: 'summer', label: 'Summer' },
  { value: 'winter', label: 'Winter' },
];

export const DEFAULT_RAIL_SIMULATION: RailSimulationParams = {
  season: 'normal',
  congestion_level: 0.3,
  departure_hour: 12,
  weather: { temp: 30, rain: 0, condition: 'Clear' },
};

function segmentMeta(segments: RouteSegment[] | undefined) {
  const first = segments?.[0];
  const last = segments?.[segments.length - 1];
  return {
    departure: first?.departure || '',
    arrival: last?.arrival || '',
    running_days: first?.running_days || [],
    avg_speed:
      first?.avg_speed_kmph ??
      (first?.distance_km && first?.duration_minutes
        ? (first.distance_km / (first.duration_minutes / 60))
        : 0),
  };
}

function simRowToRecommendation(
  row: RailSimulatedRoute,
  priority: string,
  reason: string
): Recommendation {
  const meta = segmentMeta(row.segments);
  const avgSpeed =
    meta.avg_speed > 0
      ? meta.avg_speed
      : row.distance_km > 0 && row.adjusted_eta_hours > 0
        ? row.distance_km / row.adjusted_eta_hours
        : 0;

  return {
    priority,
    reason,
    route_type: row.route_type,
    train_number: row.train_number,
    train_name: row.train_name,
    train_type: row.train_type,
    departure: meta.departure,
    arrival: meta.arrival,
    duration_hours: row.adjusted_eta_hours,
    parcel_cost_inr: row.cost_inr,
    risk_score: row.risk_score,
    risk_pct: row.risk_pct,
    booking_ease: row.booking_ease,
    parcel_van_type: 'SLR',
    has_transfer: row.has_transfer,
    distance_km: row.distance_km,
    avg_speed_kmph: Math.round(avgSpeed * 10) / 10,
    running_days: meta.running_days,
    segments: row.segments || [],
    delay_info: {
      avg_delay_minutes: Math.round(row.delay_hours * 60 * 10) / 10,
      ml_baseline_minutes:
        row.ml_delay_minutes != null ? Math.round(row.ml_delay_minutes * 10) / 10 : undefined,
      delay_data_source: 'logiflow_ml_simulation',
    },
    data_source: 'logiflow_simulation',
    llm_explanation: (row.key_factors || []).join('\n'),
  };
}

function simRowToRankedOption(row: RailSimulatedRoute, rank: number): RankedOption {
  const meta = segmentMeta(row.segments);
  const avgSpeed =
    meta.avg_speed > 0
      ? meta.avg_speed
      : row.distance_km > 0 && row.adjusted_eta_hours > 0
        ? row.distance_km / row.adjusted_eta_hours
        : 0;

  return {
    rank,
    train_number: row.train_number,
    train_name: row.train_name,
    train_type: row.train_type,
    route_type: row.route_type,
    parcel_cost_inr: row.cost_inr,
    effective_hours: row.adjusted_eta_hours,
    risk_score: row.risk_score,
    booking_ease: row.booking_ease,
    has_transfer: row.has_transfer,
    total_score: 0,
    distance_km: row.distance_km,
    avg_speed_kmph: Math.round(avgSpeed * 10) / 10,
    avg_delay_min: Math.round(row.delay_hours * 60),
    delay_source: 'logiflow_ml_simulation',
    running_days: meta.running_days,
    segments: row.segments || [],
    data_source: 'logiflow_simulation',
  };
}

function pickRecommendation(
  sim: RailSimulateResult,
  key: 'cheapest' | 'fastest' | 'safest',
  reason: string
): Recommendation | null {
  const row = sim[key] ?? sim.best;
  if (!row) return null;
  return simRowToRecommendation(row, key, reason);
}

export function railSimulateToOptimizeResult(
  sim: RailSimulateResult,
  priority: string
): OptimizeResult {
  const cheapest = pickRecommendation(sim, 'cheapest', 'Lowest parcel tariff under simulated conditions');
  const fastest = pickRecommendation(sim, 'fastest', 'Shortest adjusted ETA in this scenario');
  const safest = pickRecommendation(sim, 'safest', 'Lowest composite risk under simulated conditions');

  return {
    cheapest: cheapest!,
    fastest: fastest!,
    safest: safest!,
    all_options: dedupeRailOptions(
      (sim.all_results || []).map((row, i) => simRowToRankedOption(row, i + 1))
    ),
    constraints_applied: {
      budget_inr: null,
      deadline_hours: null,
      routes_before_filter: sim.total_routes,
      routes_after_filter: sim.total_routes,
      priority,
    },
    route_metadata: {
      total_routes_found: sim.total_routes,
      feasible_routes: sim.total_routes,
      data_source: 'simulation',
      simulation: true,
      simulation_params: sim.simulation_params as unknown as Record<string, unknown>,
    },
  };
}
