/**
 * plannerApi.ts
 * All Shipment Report API calls go through apiClient so the JWT is
 * automatically attached and 401s are handled centrally.
 *
 * Backend proxy: /api/planner/* → http://127.0.0.1:8000/planner/*
 */

import { apiClient } from '@/lib/apiClient';

// ── Types ─────────────────────────────────────────────────────────────

export type ReportStatus = 'draft' | 'planned' | 'active' | 'completed' | 'cancelled';
export type ReportMode = 'road' | 'rail' | 'air' | 'water' | 'hybrid' | 'comparator';

export interface ShipmentReport {
  id: string;
  user_id: string;
  parent_report_id: string | null;
  name: string;
  source: string;
  destination: string;
  stops: string[];
  mode: ReportMode;
  cargo_type: string | null;
  optimization_input: Record<string, unknown> | null;
  optimization_result: Record<string, unknown> | null;
  estimated_cost: number | null;
  estimated_time: number | null;
  risk_score: number | null;
  status: ReportStatus;
  started_at: string | null;
  completed_at: string | null;
  expected_end_time: string | null;
  buffer_minutes: number | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

export interface CreateReportPayload {
  name: string;
  parent_report_id?: string;
  source: string;
  destination: string;
  stops?: string[];
  mode: ReportMode;
  cargo_type?: string;
  optimization_input?: Record<string, unknown>;
  optimization_result?: Record<string, unknown>;
  estimated_cost?: number;
  estimated_time?: number;
  risk_score?: number;
  status?: ReportStatus;
}

export interface UpdateReportPayload {
  name?: string;
  status?: ReportStatus;
  optimization_result?: Record<string, unknown>;
  estimated_cost?: number;
  estimated_time?: number;
  risk_score?: number;
}

export interface RouteHealthResponse {
  report_id: string;
  status: string;
  health_level: 'healthy' | 'moderate' | 'at_risk';
  progress_percentage: number;
  elapsed_minutes: number;
  remaining_minutes: number;
  eta_variance_minutes: number;
  delay_risk: 'low' | 'medium' | 'high';
  recommended_action: 'continue' | 'monitor' | 'reoptimize';
  estimated_location: {
    label: string;
    latitude: number | null;
    longitude: number | null;
    segment_start: string;
    segment_end: string;
    confidence: string;
  };
  actual_location: {
    label: string;
    latitude: number | null;
    longitude: number | null;
    confidence: string;
  } | null;
  deviation_level: 'none' | 'minor' | 'major';
  deviation_km: number | null;
  // Phase 3 — Corridor Detection
  corridor_status: 'ON_ROUTE' | 'NEAR_ROUTE' | 'OFF_ROUTE';
  corridor_matched_city: string;
  // Phase 4 — Remaining Journey
  updated_eta_minutes: number | null;
  updated_cost: number | null;
  updated_risk: number | null;
  // Phase 6 — Reoptimization trigger
  reoptimization_recommended: boolean;
  reoptimization_reason: string;
  mode: string;
  source: string;
  destination: string;
  checked_at: string;
}

export interface ReoptimizationMetrics {
  cost: number | null;
  time: number | null;
  risk: number | null;
}

export interface ReoptimizationRecommendation {
  generated_at: string;
  parent_report_id: string;
  mode: string;
  current_location: string;
  remaining_stops: string[];
  destination: string;
  current_plan: {
    source: string;
    destination: string;
    stops: string[];
    metrics: ReoptimizationMetrics;
  };
  updated_plan: {
    source: string;
    destination: string;
    stops: string[];
    metrics: ReoptimizationMetrics;
    optimization_result: Record<string, unknown>;
  };
  eta_delta_minutes: number | null;
  recommended_action: 'save_revision';
}

export interface ReoptimizationResponse {
  report_id: string;
  status: string;
  recommendation: ReoptimizationRecommendation;
}

export interface ShipmentNotification {
  id: string;
  user_id: string;
  report_id: string | null;
  type: string;
  message: string;
  created_at: string;
  read: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────

async function parseJson<T>(res: Response): Promise<T> {
  const body = await res.text();
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(body) as { detail?: string };
      if (parsed.detail) detail = parsed.detail;
    } catch {
      if (body.trim()) detail = body.trim();
    }
    throw new Error(detail);
  }
  return JSON.parse(body) as T;
}

// ── Report CRUD ───────────────────────────────────────────────────────

export async function createReport(payload: CreateReportPayload): Promise<ShipmentReport> {
  const res = await apiClient('/api/planner/reports', {
    method: 'POST',
    body: JSON.stringify(payload),
    requireAuth: true,
  });
  return parseJson<ShipmentReport>(res);
}

export async function listReports(): Promise<ShipmentReport[]> {
  const res = await apiClient('/api/planner/reports', {
    method: 'GET',
    requireAuth: true,
  });
  return parseJson<ShipmentReport[]>(res);
}

export async function getReport(id: string): Promise<ShipmentReport> {
  const res = await apiClient(`/api/planner/reports/${encodeURIComponent(id)}`, {
    method: 'GET',
    requireAuth: true,
  });
  return parseJson<ShipmentReport>(res);
}

export async function updateReport(id: string, payload: UpdateReportPayload): Promise<ShipmentReport> {
  const res = await apiClient(`/api/planner/reports/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    requireAuth: true,
  });
  return parseJson<ShipmentReport>(res);
}

export async function deleteReport(id: string): Promise<void> {
  const res = await apiClient(`/api/planner/reports/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    requireAuth: true,
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
}

// ── Trip Lifecycle ────────────────────────────────────────────────────

export async function executeTrip(id: string): Promise<ShipmentReport> {
  const res = await apiClient(`/api/planner/reports/${encodeURIComponent(id)}/execute`, {
    method: 'POST',
    requireAuth: true,
  });
  return parseJson<ShipmentReport>(res);
}

export async function stopTrip(id: string): Promise<ShipmentReport> {
  const res = await apiClient(`/api/planner/reports/${encodeURIComponent(id)}/stop`, {
    method: 'POST',
    requireAuth: true,
  });
  return parseJson<ShipmentReport>(res);
}

export async function cancelTrip(id: string): Promise<ShipmentReport> {
  const res = await apiClient(`/api/planner/reports/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    requireAuth: true,
  });
  return parseJson<ShipmentReport>(res);
}

export async function restartTrip(id: string): Promise<ShipmentReport> {
  const res = await apiClient(`/api/planner/reports/${encodeURIComponent(id)}/restart`, {
    method: 'POST',
    requireAuth: true,
  });
  return parseJson<ShipmentReport>(res);
}

// ── Route Health ──────────────────────────────────────────────────────

export async function getRouteHealth(id: string, actualLocation?: string): Promise<RouteHealthResponse> {
  const params = new URLSearchParams();
  if (actualLocation?.trim()) params.set('actual_location', actualLocation.trim());
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiClient(`/api/planner/reports/${encodeURIComponent(id)}/route-health${query}`, {
    method: 'GET',
    requireAuth: true,
  });
  return parseJson<RouteHealthResponse>(res);
}

export async function reoptimizeTrip(
  id: string,
  payload: { current_location: string; remaining_stops: string[]; destination: string }
): Promise<ReoptimizationResponse> {
  const res = await apiClient(`/api/planner/reports/${encodeURIComponent(id)}/reoptimize`, {
    method: 'POST',
    body: JSON.stringify(payload),
    requireAuth: true,
  });
  return parseJson<ReoptimizationResponse>(res);
}

export async function saveRevision(
  id: string,
  payload: {
    name?: string;
    current_location: string;
    remaining_stops: string[];
    destination: string;
    recommendation: ReoptimizationRecommendation;
  }
): Promise<ShipmentReport> {
  const res = await apiClient(`/api/planner/reports/${encodeURIComponent(id)}/revisions`, {
    method: 'POST',
    body: JSON.stringify(payload),
    requireAuth: true,
  });
  return parseJson<ShipmentReport>(res);
}

// ── Notifications ─────────────────────────────────────────────────────

export async function listNotifications(): Promise<ShipmentNotification[]> {
  const res = await apiClient('/api/planner/notifications', {
    method: 'GET',
    requireAuth: true,
  });
  return parseJson<ShipmentNotification[]>(res);
}

export async function getUnreadCount(): Promise<number> {
  const res = await apiClient('/api/planner/notifications/unread-count', {
    method: 'GET',
    requireAuth: true,
  });
  const data = await parseJson<{ unread_count: number }>(res);
  return data.unread_count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiClient(`/api/planner/notifications/${encodeURIComponent(id)}/read`, {
    method: 'POST',
    requireAuth: true,
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiClient('/api/planner/notifications/read-all', {
    method: 'POST',
    requireAuth: true,
  });
}

// ── Utilities ─────────────────────────────────────────────────────────

export function isExpired(report: ShipmentReport): boolean {
  if (!report.expires_at) return false;
  return new Date(report.expires_at) < new Date();
}

export function expiresIn(report: ShipmentReport): string {
  if (!report.expires_at) return '';
  const diff = new Date(report.expires_at).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `Expires in ${h}h ${m}m`;
  return `Expires in ${m}m`;
}
