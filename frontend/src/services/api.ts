/**
 * API service for the LogiFlow Railway Cargo Decision Engine.
 * Connects to the LogiFlow FastAPI backend.
 */

const BACKEND_BASE = '/api';
const RAILRADAR_BASE = '/railradar';

/** Client-side key for RailRadar via Next rewrite. Must be set in `frontend/.env.local` as NEXT_PUBLIC_RAILRADAR_API_KEY. */
const RAILRADAR_API_KEY =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_RAILRADAR_API_KEY?.trim()) || '';

// ── Types ────────────────────────────────────────────────────────────

export interface CargoPayload {
  origin_city: string;
  destination_city: string;
  cargo_weight_kg: number;
  cargo_type: string;
  budget_max_inr?: number;
  deadline_hours?: number;
  priority: string;
  departure_date: string;
}

export interface RoadPayload {
  source: string;
  destination: string;
  priority: string;
  budget?: number;
  deadline_hours?: number;
  cargo_weight_kg: number;
  cargo_type: string;
  avoid_tolls: boolean;
  avoid_highways: boolean;
  traffic_aware: boolean;
  vehicle_type?: 'mini_truck' | 'truck' | 'heavy_truck';
  fuel_price?: number;
  /** Intermediate waypoints for multi-stop routing */
  stops?: string[];
  /** When true the backend reorders stops using nearest-neighbour heuristic */
  optimize_stop_order?: boolean;
  // simulation controls
  mode?: 'realtime' | 'simulation';
  simulation?: {
    traffic_level: number;
    weather_level: number;
    incident_count: number;
  };
}

export interface AirPayload {
  source: string;
  destination: string;
  priority: string;
  departure_date?: string;
  cargo_weight_kg: number;
  cargo_type: string;
  max_stops?: number;
  budget_limit?: number;
  deadline_hours?: number;
}

export interface DelayInfo {
  avg_delay_minutes: number;
  max_delay_minutes?: number;
  stations_measured?: number;
  delay_data_source: string;
  /** Raw ML prediction before scenario scaling (simulation mode only). */
  ml_baseline_minutes?: number;
}

export interface Recommendation {
  priority: string;
  reason: string;
  route_type: string;
  train_number: string;
  train_name: string;
  train_type: string;
  departure: string;
  arrival: string;
  duration_hours: number;
  parcel_cost_inr: number;
  risk_score: number;
  risk_pct: string;
  booking_ease: number;
  parcel_van_type: string;
  has_transfer: boolean;
  distance_km: number;
  avg_speed_kmph: number;
  running_days: string[];
  segments: RouteSegment[];
  /** [lng, lat] polyline from schedule + station coords (when available) */
  geometry?: [number, number][];
  delay_info: DelayInfo;
  data_source: string;
  llm_explanation?: string;
}

export interface RankedOption {
  rank: number;
  train_number: string;
  train_name: string;
  train_type: string;
  route_type: string;
  parcel_cost_inr: number;
  effective_hours: number;
  risk_score: number;
  booking_ease: number;
  has_transfer: boolean;
  total_score: number;
  distance_km: number;
  avg_speed_kmph: number;
  avg_delay_min: number;
  delay_source: string;
  running_days: string[];
  segments: RouteSegment[];
  geometry?: [number, number][];
  data_source: string;
}

export interface RouteSegment {
  mode: string;
  from: string;
  to: string;
  from_name?: string;
  to_name?: string;
  train_no?: string;
  train_name?: string;
  train_type?: string;
  departure?: string;
  arrival?: string;
  distance_km?: number;
  duration_minutes?: number;
  avg_speed_kmph?: number;
  running_days?: string[];
}

export interface RailSimulationPayload {
  origin_city: string;
  destination_city: string;
  cargo_weight_kg: number;
  cargo_type: string;
  priority: string;
  weather: {
    temp: number;
    rain: number;
    condition: string;
  };
  congestion_level: number;
  season: string;
  departure_hour: number;
}

export interface OptimizeResult {
  cheapest: Recommendation;
  fastest: Recommendation;
  safest: Recommendation;
  all_options: RankedOption[];
  constraints_applied: {
    budget_inr: number | null;
    deadline_hours: number | null;
    routes_before_filter: number;
    routes_after_filter: number;
    priority: string;
  };
  route_metadata?: {
    total_routes_found: number;
    feasible_routes: number;
    data_source: string;
    simulation?: boolean;
    simulation_params?: Record<string, unknown>;
  };
}

/** Normalized live-map train position (RailRadar field names may vary). */
export interface LiveTrainPosition {
  train_number: string;
  train_name: string;
  type: string;
  current_lat: number;
  current_lng: number;
  current_station: string;
  current_station_name: string;
  next_station: string;
  next_station_name: string;
  next_lat: number;
  next_lng: number;
  curr_distance: number;
  next_distance: number;
  mins_since_dep: number;
}

/** Live status from GET /railway/trains/{no}/live (RailRadar train live payload). */
export type LiveTrainStatus = Record<string, unknown>;

export interface StationSearchResult {
  code: string;
  name: string;
}

export interface StationInfo {
  code: string;
  name: string;
  lat: number;
  lng: number;
  zone?: string;
  address?: string;
}

export interface TrainDelayStation {
  stationCode: string;
  arrivalDelayMinutes: number;
  departureDelayMinutes: number;
}

export interface TrainDelayData {
  train: { number: string; name: string };
  route: TrainDelayStation[];
}

export interface AirCostBreakdown {
  base_freight: number;
  fuel_surcharge: number;
  terminal_fee: number;
  handling_fee: number;
  cargo_markup: number;
  heavy_lift_fee: number;
  total: number;
  currency: string;
  pricing_basis: string;
}

export interface AirAirportInfo {
  code: string;
  name: string;
  city_name?: string;
}

export interface AirRoute {
  type: string;
  mode: string;
  time: number;
  cost: number;
  risk: number;
  delay_prob: number;
  airline: string;
  stops: number;
  distance: number;
  cost_per_kg: number;
  weather_risk: number;
  congestion_risk: number;
  reliability: number;
  cargo_type: string;
  cargo_weight: number;
  data_source: string;
  route_support_type: string;
  supported_by: string;
  confidence_score: number;
  confidence_label: string;
  confidence_reasons: string[];
  cost_breakdown: AirCostBreakdown;
  business_rules_applied: string[];
  reason: string;
  key_factors: string[];
  eta: string;
  score?: number;
  segments: RouteSegment[];
  air_details: {
    source_airport: AirAirportInfo;
    destination_airport: AirAirportInfo;
    hub_airport?: AirAirportInfo | null;
    supporting_airlines?: string[];
    confidence_reasons?: string[];
    business_rules_applied?: string[];
    cost_breakdown?: AirCostBreakdown;
  };
}

export interface AirOptimizeResult {
  mode: 'air';
  best_route: AirRoute | null;
  alternatives: AirRoute[];
  ranked_routes: AirRoute[];
  total_routes: number;
  constraints_applied: {
    budget_limit: number | null;
    deadline_hours: number | null;
    max_stops: number | null;
    cargo_type: string;
    cargo_weight_kg: number;
  };
}

export interface HybridComparisonRow {
  mode: string;
  time_hr?: number | null;
  cost_inr?: number | null;
  risk?: number | null;
  confidence?: number | null;
  explanation?: string | null;
}

export interface AiConstraintsApplied {
  priority?: string;
  scenario_summary?: string;
  constraints?: {
    budget_max_inr?: number;
    delay_tolerance_hours?: number;
    risk_threshold?: number;
    excluded_modes?: string[];
  };
}

export interface HybridModeRoute {
  mode?: string;
  time_hr?: number | null;
  cost_inr?: number | null;
  risk?: number | null;
  train_name?: string | null;
  airline?: string | null;
  distance_km?: number | null;
}

export interface HybridOptimizeResult {
  recommended_mode?: string | null;
  reason?: string | null;
  tradeoffs?: string[] | null;
  ai_constraints?: AiConstraintsApplied | null;
  demo_mode?: boolean;
  unavailable_modes?: string[];
  comparison?: HybridComparisonRow[] | null;
  best_per_mode?: Partial<Record<'road' | 'rail' | 'air' | 'water', HybridModeRoute | null>> | null;
}

export interface HybridPayload {
  source: string;
  destination: string;
  priority: string;
  departure_date?: string;
  cargo_weight_kg?: number;
  cargo_type?: string;
  cargo?: { weight: number; type: string };
  scenario_brief?: string;
  preferences?: { preferred_mode?: string };
  constraints?: {
    excluded_modes?: string[];
    risk_threshold?: number;
    delay_tolerance_hours?: number;
    max_transshipments?: number;
    budget_max_inr?: number;
    max_stops?: number;
    budget_limit?: number;
  };
}

// ── Backend API calls (proxied via Next.js) ──────────────────────────

export const BACKEND_UNAVAILABLE_MSG =
  'Backend is still waking up. Wait ~30 seconds and try again — Render free tier sleeps after ~15 min idle.';

async function fetchBackend(
  path: string,
  init: RequestInit,
  options?: { retries?: number; retryDelayMs?: number }
): Promise<Response> {
  const retries = options?.retries ?? 2;
  const retryDelayMs = options?.retryDelayMs ?? 4000;
  const retryStatuses = new Set([502, 503, 504]);

  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const res = await fetch(`${BACKEND_BASE}${path}`, init);
    if (res.ok || !retryStatuses.has(res.status) || attempt === retries) {
      return res;
    }
    lastRes = res;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
  }
  return lastRes!;
}

export async function optimizeCargoRoute(payload: CargoPayload): Promise<OptimizeResult> {
  const res = await fetch(`${BACKEND_BASE}/railway/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = '';
    const rawBody = await res.text();
    try {
      const data = rawBody ? JSON.parse(rawBody) : null;
      if (data && typeof data === 'object' && 'detail' in data) {
        detail = String((data as { detail?: unknown }).detail ?? '').trim();
      }
    } catch {
      detail = rawBody.trim();
    }
    throw new Error(detail || `Optimize failed (${res.status})`);
  }
  return res.json();
}

export async function simulateCargoRoute(payload: RailSimulationPayload) {
  const res = await fetch(`${BACKEND_BASE}/railway/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = '';
    const rawBody = await res.text();
    try {
      const data = rawBody ? JSON.parse(rawBody) : null;
      if (data && typeof data === 'object' && 'detail' in data) {
        detail = String((data as { detail?: unknown }).detail ?? '').trim();
      }
    } catch {
      detail = rawBody.trim();
    }
    throw new Error(detail || `Simulation failed (${res.status})`);
  }
  return res.json();
}

export async function fetchRoadRoutes(payload: RoadPayload) {
  console.log('[API] ROAD REQUEST →', payload);
  const res = await fetch(`${BACKEND_BASE}/road/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  console.log('[API] ROAD RESPONSE →', {
    routeCount: data?.all?.length,
    firstRoute: data?.all?.[0],
    simulation: data?.simulation,
  });

  if (!res.ok) {
    throw new Error(`Road optimize failed (${res.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

export async function optimizeAirRoute(payload: AirPayload): Promise<AirOptimizeResult> {
  const res = await fetch(`${BACKEND_BASE}/air/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Air optimize failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ── Multimodal compose (chained legs across modes) ───────────────────

export interface ComposedLeg {
  mode: string;
  source: string;
  destination: string;
  time_hr: number;
  cost_inr: number;
  risk: number;
  segments: Array<Record<string, unknown>>;
  status?: string;
  board_station?: string;
  alight_station?: string;
  train_no?: string;
  train_name?: string;
  departure?: string;
  arrival?: string;
  flight_label?: string;
  vehicle_label?: string;
}

export interface ComposedTransfer {
  at: string;
  at_display?: string;
  buffer_hr: number;
  handling_fee_inr?: number;
  from_mode: string;
  to_mode: string;
  notes?: string;
  severity?: 'ok' | 'caution' | 'warning';
  warnings?: string[];
  leg1_alight_station?: string;
  leg2_board_station?: string;
  leg1_train?: string;
  leg2_train?: string;
  leg1_arrival?: string;
  leg2_departure?: string;
  scheduled_gap_hr?: number | null;
}

export interface ComposedItinerary {
  id: string;
  template_id: string;
  type: 'direct' | 'multimodal';
  hub_cities: string[];
  legs: ComposedLeg[];
  transfers: ComposedTransfer[];
  total_time_hr: number;
  total_cost_inr: number;
  total_risk: number;
  transshipments: number;
  segments?: Array<Record<string, unknown>>;
  explanation?: string;
  score?: number;
}

export interface ComposePayload {
  source: string;
  destination: string;
  priority: string;
  departure_date?: string;
  cargo_weight_kg?: number;
  cargo_type?: string;
  scenario_brief?: string;
  cargo?: { weight: number; type: string };
  constraints?: {
    excluded_modes?: string[];
    max_transshipments?: number;
    budget_max_inr?: number;
    budget_limit?: number;
    delay_tolerance_hours?: number;
  };
  compose_options?: {
    max_hubs?: number;
    budget_seconds?: number;
    include_road_water?: boolean;
  };
}

export interface ComposeResult {
  priority?: string;
  recommended?: ComposedItinerary;
  alternatives?: ComposedItinerary[];
  baselines?: Record<string, { time_hr: number; cost_inr: number; risk: number; type: string }>;
  beats_single_mode?: {
    baseline_mode?: string;
    time_delta_hr?: number;
    cost_delta_inr?: number;
  } | null;
  hubs_considered?: Array<{ city: string; display_name: string; rail_stations: string[]; airport_code?: string | null }>;
  unavailable_templates?: Record<string, string>;
  total_candidates?: number;
  multimodal_count?: number;
  partial?: boolean;
  cold_corridor?: boolean;
  short_corridor?: boolean;
  corridor_distance_km?: number | null;
  compose_note?: string | null;
  error?: string;
}

export async function composeMultimodalRoute(payload: ComposePayload): Promise<ComposeResult> {
  const budgetMs = ((payload.compose_options?.budget_seconds ?? 42) + 50) * 1000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), budgetMs);
  let res: Response;
  try {
    res = await fetch(`${BACKEND_BASE}/compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        'Compose took too long for a new corridor. Retry in a few seconds — legs are cached after the first run.'
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      /* use raw body */
    }
    if (res.status === 503 || res.status === 502 || res.status === 504) {
      throw new Error(message || BACKEND_UNAVAILABLE_MSG);
    }
    throw new Error(`Compose failed (${res.status}): ${message}`);
  }
  return res.json();
}

export async function optimizeHybridRoute(payload: HybridPayload): Promise<HybridOptimizeResult> {
  const res = await fetchBackend(
    '/optimize',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    { retries: 2, retryDelayMs: 5000 }
  );
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 503 || res.status === 502 || res.status === 504) {
      throw new Error(BACKEND_UNAVAILABLE_MSG);
    }
    throw new Error(`Hybrid optimize failed (${res.status}): ${text}`);
  }
  return res.json();
}

export type WaterRoute = {
  type: 'Water';
  mode: 'water';
  time: number;
  cost: number;
  risk: number;
  segments: Array<{ mode: string; from: string; to: string }>;
  origin_port?: string;
  destination_port?: string;
  distance_nm?: number;
  transshipments?: number;
  risk_breakdown?: Record<string, number>;
  expected_delay_hours?: number;
  delay_prob?: number;
  reliability_score?: number;
  notes?: string;
  // Cost breakdown (populated by engineer.py Item #2)
  cost_breakdown?: {
    sea_freight?: number;
    road_drayage?: number;
    port_fees?: number;
    transshipment_fees?: number;
    regional_surcharge?: number;
  };
  // Route insight (populated by engineer.py Item #3)
  reason?: string;
  key_factors?: string[];
};

export type WaterPayload = {
  source: string;
  destination: string;
  cargo_weight_kg?: number;
  cargo_type?: string;
  priority?: string;
  constraints?: {
    risk_threshold?: number | null;
    delay_tolerance_hours?: number | null;
    max_transshipments?: number | null;
    budget_max_inr?: number | null;
  };
};

export async function fetchWaterRoutes(payload: WaterPayload): Promise<WaterRoute[]> {
  const res = await fetch(`${BACKEND_BASE}/water/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = '';
    const rawBody = await res.text();
    try {
      const data = rawBody ? JSON.parse(rawBody) : null;
      if (data && typeof data === 'object' && 'detail' in data) {
        detail = String((data as { detail?: unknown }).detail ?? '').trim();
      }
    } catch {
      detail = rawBody.trim();
    }
    throw new Error(detail || `Water optimize failed (${res.status})`);
  }
  return res.json();
}

export interface RailMlQuantifier {
  id: string;
  label: string;
  short_label: string;
  value: number | null;
  unit: string;
  summary: string;
  derivation: string;
}

export interface RailModelInfo {
  delay_model?: string;
  models_loaded?: boolean;
  training_data?: string;
  training_rows?: number;
  model_kind?: string;
  cv_metrics?: {
    mae?: number;
    rmse?: number;
    r2?: number;
    within_15_min_pct?: number;
    within_30_min_pct?: number;
    n_samples?: number;
  };
  quantifiers?: RailMlQuantifier[];
  documentation_url?: string;
  trained_at?: string;
  meets_accuracy_goal?: boolean;
  error?: string;
}

const RAIL_ML_FALLBACK_URL = '/data/rail-ml-metrics.json';

function hasQuantifierValues(info: RailModelInfo | null): boolean {
  return Boolean(
    info?.quantifiers?.some((q) => q.value != null && !Number.isNaN(q.value))
  );
}

async function fetchRailModelInfoFallback(): Promise<RailModelInfo> {
  const res = await fetch(RAIL_ML_FALLBACK_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('Static ML metrics unavailable');
  return res.json() as Promise<RailModelInfo>;
}

export async function fetchRailModelInfo(): Promise<RailModelInfo> {
  try {
    const res = await fetch(`${BACKEND_BASE}/railway/model-info`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`Model info failed (${res.status})`);
    const data = (await res.json()) as RailModelInfo;
    if (hasQuantifierValues(data)) return data;
    const fallback = await fetchRailModelInfoFallback();
    return { ...fallback, ...data, quantifiers: fallback.quantifiers ?? data.quantifiers };
  } catch {
    return fetchRailModelInfoFallback();
  }
}

export async function searchStations(query: string): Promise<StationSearchResult[]> {
  if (!query || query.length < 2) return [];
  const res = await fetch(`${BACKEND_BASE}/railway/search/stations?query=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.stations || [];
}

export async function searchCities(query: string): Promise<Array<{ name: string; lat?: number; lng?: number }>> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=in&q=${encodeURIComponent(q)}`,
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    return rows.flatMap((r) => {
      const name = String(r.display_name ?? '').split(',').slice(0, 2).join(',').trim();
      const lat = Number(r.lat);
      const lng = Number(r.lon);
      if (!name) return [];
      return [{
        name,
        lat: Number.isNaN(lat) ? undefined : lat,
        lng: Number.isNaN(lng) ? undefined : lng,
      }];
    });
  } catch {
    return [];
  }
}

export async function getTrainDelay(trainNumber: string): Promise<TrainDelayData | null> {
  const res = await fetch(`${BACKEND_BASE}/railway/trains/${encodeURIComponent(trainNumber)}/delay`);
  if (!res.ok) return null;
  return res.json();
}

export async function getLiveTrainStatus(trainNumber: string): Promise<LiveTrainStatus | null> {
  const res = await fetch(`${BACKEND_BASE}/railway/trains/${encodeURIComponent(trainNumber)}/live`);
  if (!res.ok) return null;
  return res.json();
}

/** @deprecated Use getLiveTrainStatus */
export const getTrainLiveStatus = getLiveTrainStatus;

export async function getTrainSchedule(trainNumber: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BACKEND_BASE}/railway/trains/${encodeURIComponent(trainNumber)}/schedule`);
  if (!res.ok) return null;
  return res.json();
}

export interface RouteGeometryStop {
  code: string;
  name: string;
  city: string;
  lng: number;
  lat: number;
}

export interface TrainRouteGeometryResult {
  geometry: [number, number][];
  stops: RouteGeometryStop[];
  source?: string;
}

const GEOMETRY_FETCH_TIMEOUT_MS = 120_000;

/** Fetch map polyline + labelled stops for one train leg. */
export async function getTrainRouteGeometry(
  trainNumber: string,
  fromCode: string,
  toCode: string,
  signal?: AbortSignal,
  attempt = 0
): Promise<TrainRouteGeometryResult> {
  try {
    const params = new URLSearchParams({
      from_code: fromCode.trim(),
      to_code: toCode.trim(),
    });
    const timeoutSignal = AbortSignal.timeout(GEOMETRY_FETCH_TIMEOUT_MS);
    const combined =
      signal && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([signal, timeoutSignal])
        : timeoutSignal;

    const res = await fetch(
      `${BACKEND_BASE}/railway/trains/${encodeURIComponent(trainNumber)}/geometry?${params}`,
      { signal: combined }
    );
    if (!res.ok) {
      if (attempt < 1) {
        await new Promise((r) => setTimeout(r, 2000));
        return getTrainRouteGeometry(trainNumber, fromCode, toCode, signal, attempt + 1);
      }
      return { geometry: [], stops: [] };
    }
    const data = (await res.json()) as {
      geometry?: [number, number][];
      stops?: RouteGeometryStop[];
      source?: string;
    };
    return {
      geometry: Array.isArray(data.geometry) ? data.geometry : [],
      stops: Array.isArray(data.stops) ? data.stops : [],
      source: data.source,
    };
  } catch (err) {
    if (attempt < 1 && !(err instanceof DOMException && err.name === 'AbortError')) {
      await new Promise((r) => setTimeout(r, 2000));
      return getTrainRouteGeometry(trainNumber, fromCode, toCode, signal, attempt + 1);
    }
    return { geometry: [], stops: [] };
  }
}

/** Resolve station coords for segment endpoints when geometry API is unavailable. */
async function fallbackLegGeometry(
  fromCode: string,
  toCode: string,
  fromName?: string,
  toName?: string
): Promise<TrainRouteGeometryResult> {
  const [fromInfo, toInfo] = await Promise.all([
    getStationInfo(fromCode),
    getStationInfo(toCode),
  ]);
  if (!fromInfo?.lat || !toInfo?.lat) return { geometry: [], stops: [] };

  const fromCity = fromName || fromInfo.name || fromCode;
  const toCity = toName || toInfo.name || toCode;
  return {
    geometry: [
      [fromInfo.lng, fromInfo.lat],
      [toInfo.lng, toInfo.lat],
    ],
    stops: [
      { code: fromCode, name: fromCity, city: fromCity, lng: fromInfo.lng, lat: fromInfo.lat },
      { code: toCode, name: toCity, city: toCity, lng: toInfo.lng, lat: toInfo.lat },
    ],
    source: 'segment_fallback',
  };
}

function mergeGeometryLegs(legs: TrainRouteGeometryResult[]): TrainRouteGeometryResult {
  const merged: [number, number][] = [];
  const mergedStops: RouteGeometryStop[] = [];

  for (const leg of legs) {
    if (!leg.geometry.length) continue;

    if (merged.length) {
      const [plng, plat] = merged[merged.length - 1];
      const [flng, flat] = leg.geometry[0];
      if (Math.abs(plng - flng) < 1e-6 && Math.abs(plat - flat) < 1e-6) {
        merged.push(...leg.geometry.slice(1));
        mergedStops.push(...leg.stops.slice(1));
        continue;
      }
    }
    merged.push(...leg.geometry);
    mergedStops.push(...leg.stops);
  }

  return { geometry: merged, stops: mergedStops };
}

/** Build a full corridor polyline (handles transfers with multiple segments). */
export async function buildTrainCorridorGeometry(
  trainNumber: string,
  segments: RouteSegment[],
  signal?: AbortSignal
): Promise<TrainRouteGeometryResult> {
  if (!segments.length) return { geometry: [], stops: [] };

  const legs = await Promise.all(
    segments.map(async (seg) => {
      const from = (seg.from || '').trim();
      const to = (seg.to || '').trim();
      const tno = (seg.train_no || trainNumber || '').trim();
      if (!from || !to || !tno) return { geometry: [], stops: [] } as TrainRouteGeometryResult;

      const primary = await getTrainRouteGeometry(tno, from, to, signal);
      if (primary.geometry.length >= 2) return primary;
      return fallbackLegGeometry(from, to, seg.from_name, seg.to_name);
    })
  );

  const merged = mergeGeometryLegs(legs);
  if (merged.geometry.length >= 2) return merged;
  return mergeGeometryLegs(
    await Promise.all(
      segments.map((seg) =>
        fallbackLegGeometry(
          (seg.from || '').trim(),
          (seg.to || '').trim(),
          seg.from_name,
          seg.to_name
        )
      )
    )
  );
}

export async function getStationInfo(stationCode: string): Promise<StationInfo | null> {
  const res = await fetch(`${BACKEND_BASE}/railway/stations/${encodeURIComponent(stationCode)}`);
  if (!res.ok) return null;
  return res.json();
}

/** Get coordinates for a city/town name from the backend. */
export async function getLocationCoords(name: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`${BACKEND_BASE}/railway/coords?name=${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return { lat: data.lat, lng: data.lng };
  } catch {
    return null;
  }
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v);
    return Number.isNaN(n) ? fallback : n;
  }
  return fallback;
}

function str(v: unknown, fallback = ''): string {
  if (v == null) return fallback;
  return String(v);
}

/** Normalize one RailRadar live-map row to LiveTrainPosition. */
function normalizeLiveMapRow(raw: Record<string, unknown>): LiveTrainPosition | null {
  const train_number = str(raw.train_number ?? raw.trainNumber ?? raw.number);
  if (!train_number) return null;
  const current_lat = num(raw.current_lat ?? raw.currentLat ?? raw.lat);
  const current_lng = num(raw.current_lng ?? raw.currentLng ?? raw.lng ?? raw.lon);
  if (!current_lat && !current_lng) return null;
  return {
    train_number,
    train_name: str(raw.train_name ?? raw.trainName ?? raw.name, train_number),
    type: str(raw.type ?? raw.train_type ?? raw.trainType, 'Train'),
    current_lat,
    current_lng,
    current_station: str(raw.current_station ?? raw.currentStation ?? ''),
    current_station_name: str(raw.current_station_name ?? raw.currentStationName ?? ''),
    next_station: str(raw.next_station ?? raw.nextStation ?? ''),
    next_station_name: str(raw.next_station_name ?? raw.nextStationName ?? ''),
    next_lat: num(raw.next_lat ?? raw.nextLat, current_lat),
    next_lng: num(raw.next_lng ?? raw.nextLng, current_lng),
    curr_distance: num(raw.curr_distance ?? raw.currDistance),
    next_distance: num(raw.next_distance ?? raw.nextDistance),
    mins_since_dep: num(raw.mins_since_dep ?? raw.minsSinceDep),
  };
}

// ── RailRadar direct calls (bypass backend for live-map performance) ──

export async function getLiveTrainMap(): Promise<LiveTrainPosition[]> {
  try {
    const res = await fetch(`${RAILRADAR_BASE}/trains/live-map`, {
      headers: { 'X-API-Key': RAILRADAR_API_KEY },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as Record<string, unknown> | unknown[];
    let rows: unknown[] = [];
    if (Array.isArray(body)) rows = body;
    else if (body && typeof body === 'object') {
      const d = (body as Record<string, unknown>).data;
      if (Array.isArray(d)) rows = d;
      else if (d && typeof d === 'object' && Array.isArray((d as Record<string, unknown>).trains))
        rows = (d as { trains: unknown[] }).trains;
    }
    const out: LiveTrainPosition[] = [];
    for (const r of rows) {
      if (r && typeof r === 'object') {
        const n = normalizeLiveMapRow(r as Record<string, unknown>);
        if (n) out.push(n);
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function getTrainsBetweenDirect(fromCode: string, toCode: string) {
  try {
    const res = await fetch(
      `${RAILRADAR_BASE}/trains/between?from=${fromCode}&to=${toCode}`,
      { headers: { 'X-API-Key': RAILRADAR_API_KEY } }
    );
    if (!res.ok) return null;
    const body = await res.json();
    return body.data || body;
  } catch {
    return null;
  }
}

export async function getStationInfoDirect(code: string): Promise<StationInfo | null> {
  try {
    const res = await fetch(`${RAILRADAR_BASE}/stations/${code}/info`, {
      headers: { 'X-API-Key': RAILRADAR_API_KEY },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.data || body;
  } catch {
    return null;
  }
}

export async function fetchExplanation(payload: {
  pipeline: string;
  priority: string;
  route_data: unknown;
  context?: unknown;
}): Promise<string | null> {
  try {
    const res = await fetch(`${BACKEND_BASE}/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.explanation ?? null;
  } catch {
    return null;
  }
}

// ── Natural-language intent (Gemini / heuristic) ────────────────────

export type IntentContextMode = 'home' | 'rail' | 'road' | 'air' | 'water' | 'hybrid' | 'comparator';

export interface ParsedIntent {
  applied?: boolean;
  error?: string;
  source?: string | null;
  destination?: string | null;
  suggested_mode?: string;
  priority?: string;
  cargo_weight_kg?: number | null;
  cargo_type?: string | null;
  budget_max_inr?: number | null;
  deadline_hours?: number | null;
  departure_date?: string | null;
  scenario_summary?: string;
  scenario_brief?: string;
  avoid_tolls?: boolean | null;
  avoid_highways?: boolean | null;
  traffic_aware?: boolean | null;
  vehicle_type?: 'mini_truck' | 'truck' | 'heavy_truck' | null;
  max_stops?: number | null;
  max_transshipments?: number | null;
  excluded_modes?: string[];
  special_notes?: string | null;
  source_engine?: string;
  parse_warning?: string;
}

export async function parseShipmentIntent(
  user_brief: string,
  context_mode: IntentContextMode = 'home'
): Promise<ParsedIntent> {
  const res = await fetchBackend(
    '/intent/parse',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_brief, context_mode }),
    },
    { retries: 2, retryDelayMs: 4000 }
  );
  const raw = await res.text();
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      res.ok
        ? 'Intent parse returned invalid JSON'
        : `Backend unavailable — start the API server (got: ${raw.slice(0, 80)})`
    );
  }
  if (!res.ok) {
    if (res.status === 503 || res.status === 502 || res.status === 504) {
      throw new Error(BACKEND_UNAVAILABLE_MSG);
    }
    const err = parsed as { detail?: string; error?: string };
    throw new Error(
      (typeof err.detail === 'string' ? err.detail : null) ||
        err.error ||
        `Intent parse failed (${res.status})`
    );
  }
  return parsed as ParsedIntent;
}

// ── Legacy fallback (for the old /optimize endpoint) ─────────────────

export async function fetchOptimizedRoute(
  source: string,
  destination: string,
  priority: string,
  preferences: Record<string, unknown> = {},
  constraints: Record<string, unknown> = {}
) {
  const res = await fetch(`${BACKEND_BASE}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, destination, priority, preferences, constraints }),
  });
  if (!res.ok) throw new Error(`API failed: ${res.status}`);
  return res.json();
}
