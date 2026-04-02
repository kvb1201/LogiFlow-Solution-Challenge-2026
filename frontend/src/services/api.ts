/**
 * API service for the LogiFlow Railway Cargo Decision Engine.
 * Connects to the FastAPI backend and RailRadar API.
 */

const BACKEND_BASE = '/api';
const RAILRADAR_BASE = '/railradar';

/** Client-side key for RailRadar via Next rewrite. Prefer `frontend/.env.local` (see NEXT_PUBLIC_RAILRADAR_API_KEY). Production builds must set this in the host environment; no fallback is bundled in production. */
const RAILRADAR_API_KEY =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_RAILRADAR_API_KEY?.trim()) ||
  (process.env.NODE_ENV !== 'production'
    ? 'rr_9sin19cmlpkreju3t8svyxizrnz0c2b6'
    : '');

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

export interface DelayInfo {
  avg_delay_minutes: number;
  max_delay_minutes?: number;
  stations_measured?: number;
  delay_data_source: string;
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
  delay_info: DelayInfo;
  data_source: string;
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

// ── Backend API calls (proxied via Next.js) ──────────────────────────

export async function optimizeCargoRoute(payload: CargoPayload): Promise<OptimizeResult> {
  const res = await fetch(`${BACKEND_BASE}/railway/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Optimize failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function searchStations(query: string): Promise<StationSearchResult[]> {
  if (!query || query.length < 2) return [];
  const res = await fetch(`${BACKEND_BASE}/railway/search/stations?query=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.stations || [];
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

export async function getStationInfo(stationCode: string): Promise<StationInfo | null> {
  const res = await fetch(`${BACKEND_BASE}/railway/stations/${encodeURIComponent(stationCode)}`);
  if (!res.ok) return null;
  return res.json();
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
