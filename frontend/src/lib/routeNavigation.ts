/**
 * routeNavigation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for converting a LogiFlow RoadRoute into a
 * Google Maps directions URL and for extracting the canonical waypoint list.
 *
 * IMPORTANT — route order contract
 * ─────────────────────────────────
 * Always use `route.waypoints` (the final sequence returned by the backend).
 * Never reconstruct the stop order from form inputs, roadStops state, or the
 * source/destination store fields.  The backend may have reordered stops via
 * the nearest-neighbour optimiser; only `route.waypoints` reflects that.
 *
 * Used by:
 *   • Start Driving   (opens Google Maps in a new tab)
 *   • Share Route     (copies URL to clipboard)
 *
 * Future extension points:
 *   • The returned object includes `routeId` so navigation actions can be
 *     associated with a specific route for Shipment Health / Route Lock.
 *   • `waypointCount` is exposed for analytics.
 */

import type { RoadRoute } from '@/store/useLogiFlowStore';

// ── Types ────────────────────────────────────────────────────────────

export interface RouteNavigationInfo {
  /** The Google Maps directions URL — identical for Start Driving and Share Route */
  mapsUrl: string;
  /** Full ordered waypoint list from route.waypoints (source of truth) */
  waypoints: string[];
  /** Number of intermediate stops (waypoints.length - 2, clamped to ≥ 0) */
  waypointCount: number;
  /** Stable route identifier for future Shipment Health / Route Lock integration */
  routeId: string | null;
  /** True when the backend reordered stops via nearest-neighbour optimisation */
  wasStopOrderOptimised: boolean;
  /** True when the route has waypoints data (i.e. is navigable) */
  isNavigable: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Extract the canonical ordered waypoint list from a route.
 *
 * Priority:
 *   1. route.waypoints   — authoritative backend sequence (multi-stop or plain)
 *   2. [source, destination] fallback using the geometry endpoints
 *      (only used for plain single-leg routes that pre-date the waypoints field)
 *
 * The fallback is intentionally simple — it should never be needed for routes
 * generated after the multi-stop feature was introduced.
 */
export function getRouteWaypoints(route: RoadRoute): string[] {
  if (
    Array.isArray(route.waypoints) &&
    route.waypoints.length >= 2 &&
    route.waypoints.every(w => typeof w === 'string' && w.trim())
  ) {
    return route.waypoints.map(w => w.trim());
  }
  return [];
}

/**
 * Build a Google Maps directions deep-link from route.waypoints.
 *
 * URL format:
 *   https://www.google.com/maps/dir/Origin/Stop1/Stop2/.../Destination
 *
 * Google Maps will plan turn-by-turn navigation through those waypoints in
 * that order.  Road selection between waypoints is handled by Google Maps;
 * LogiFlow controls the stop sequence.
 *
 * Returns null when the route has fewer than 2 waypoints (not navigable).
 */
export function buildGoogleMapsUrl(route: RoadRoute): string | null {
  const waypoints = getRouteWaypoints(route);
  if (waypoints.length < 2) return null;

  // Encode each waypoint — use the city name as-is; Google resolves it
  const encoded = waypoints.map(w => encodeURIComponent(w)).join('/');
  return `https://www.google.com/maps/dir/${encoded}`;
}

/**
 * Derive full navigation info for a route.
 * Exported as the primary entry-point for both Start Driving and Share Route.
 */
export function getRouteNavigationInfo(route: RoadRoute): RouteNavigationInfo {
  const waypoints = getRouteWaypoints(route);
  const mapsUrl = buildGoogleMapsUrl(route) ?? '';
  const waypointCount = Math.max(0, waypoints.length - 2);
  const isNavigable = waypoints.length >= 2 && mapsUrl !== '';

  return {
    mapsUrl,
    waypoints,
    waypointCount,
    routeId: (route as Record<string, unknown>).route_id as string | null ?? null,
    wasStopOrderOptimised: route.stop_order_optimised ?? false,
    isNavigable,
  };
}

// ── Dev validation ────────────────────────────────────────────────────

/**
 * Assert that the URL's waypoints match the displayed route.
 * Runs only in development — no-op in production.
 */
export function devAssertNavigationConsistency(
  route: RoadRoute,
  info: RouteNavigationInfo,
): void {
  if (process.env.NODE_ENV !== 'development') return;

  const displayedChain = getRouteWaypoints(route).join(' → ');
  const urlChain = info.waypoints.join(' → ');

  if (displayedChain !== urlChain) {
    console.warn(
      '[routeNavigation] Consistency mismatch!\n' +
        `  Displayed route: ${displayedChain}\n` +
        `  URL waypoints:   ${urlChain}\n` +
        '  Route_id: ' + (info.routeId ?? 'n/a'),
    );
  } else {
    console.info(
      `[routeNavigation] ✓ Consistent — ${urlChain} (route_id: ${info.routeId ?? 'n/a'})`,
    );
  }
}
