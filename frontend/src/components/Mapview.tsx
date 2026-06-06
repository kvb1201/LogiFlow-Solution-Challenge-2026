'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { LatLngTuple, Map as LeafletMap } from 'leaflet';
import IndiaBoundaryOverlay from '@/components/IndiaBoundaryOverlay';

type IconDefaultProto = typeof L.Icon.Default.prototype & { _getIconUrl?: unknown };
delete (L.Icon.Default.prototype as IconDefaultProto)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

export type MapRoute = {
  geometry: [number, number][];
  time: number;
  cost: number;
  risk: number;
  traffic_factor?: number;
  ml_summary?: {
    traffic: 'high' | 'moderate' | 'low';
    delay_hours: number;
  };
  /** Waypoints list — present for multi-stop routes */
  waypoints?: string[];
  /** Per-leg segments for multi-stop routes */
  segments?: Array<{
    from: string;
    to: string;
    distance_km?: number;
    duration_minutes?: number;
  }>;
};

function formatCostK(n: number): string {
  if (!Number.isFinite(n)) return '₹0';
  const a = Math.abs(n);
  if (a >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
}

function segmentTooltipText(route: MapRoute, segIndex: number): string {
  const tf = Number(route.traffic_factor ?? 1);
  const traffic =
    route.ml_summary?.traffic ??
    (tf > 1.25 ? 'high' : tf > 1.08 ? 'moderate' : 'low');
  const delay = route.ml_summary?.delay_hours ?? 0;
  return `Seg ${segIndex + 1} · Traffic: ${traffic} · Delay: +${delay.toFixed(1)}h`;
}

function midpointLatLng(geometry: [number, number][]): LatLngTuple | null {
  if (!geometry.length) return null;
  const i = Math.floor(geometry.length / 2);
  const [lng, lat] = geometry[i];
  return [lat, lng];
}

/** Build a numbered stop marker icon for intermediate waypoints */
function makeStopIcon(label: string, stopNumber: number): L.DivIcon {
  const colors = [
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#f59e0b', // amber
    '#10b981', // emerald
    '#f43f5e', // rose
    '#6366f1', // indigo
    '#ec4899', // pink
    '#14b8a6', // teal
    '#84cc16', // lime
    '#f97316', // orange
  ];
  const bg = colors[(stopNumber - 1) % colors.length];
  const short = label.length > 12 ? `${label.slice(0, 11)}…` : label;
  const html = `
    <div style="
      display:flex;align-items:center;gap:4px;
      background:rgba(15,15,20,0.92);
      color:#f1f5f9;
      padding:4px 8px 4px 4px;
      border-radius:20px;
      font-size:10px;
      font-family:ui-monospace,Menlo,monospace;
      white-space:nowrap;
      border:1.5px solid ${bg};
      box-shadow:0 2px 8px rgba(0,0,0,0.5);
    ">
      <span style="
        width:16px;height:16px;border-radius:50%;
        background:${bg};color:#fff;
        display:inline-flex;align-items:center;justify-content:center;
        font-size:9px;font-weight:700;flex-shrink:0;
      ">${stopNumber}</span>
      <span>${short}</span>
    </div>`;
  return L.divIcon({
    className: 'logiflow-stop-marker',
    html,
    iconSize: [160, 26],
    iconAnchor: [80, 13],
  });
}

export default function MapView({
  routes,
  selectedRoute = 0,
  waypoints,
}: {
  routes: MapRoute[];
  selectedRoute?: number;
  /** Optional waypoints to render stop markers — passed from RouteResults */
  waypoints?: string[];
}) {
  const mapRef = useRef<LeafletMap | null>(null);
  const hasRoutes = Array.isArray(routes) && routes.length > 0;
  const safeRoutes = hasRoutes ? routes : [];

  const convert = (coords: [number, number][]): LatLngTuple[] =>
    coords.map(([lng, lat]) => [lat, lng] as LatLngTuple);

  function downsample(points: LatLngTuple[], maxPoints = 500): LatLngTuple[] {
    if (points.length <= maxPoints) return points;
    const step = Math.ceil(points.length / maxPoints);
    const out: LatLngTuple[] = [];
    for (let i = 0; i < points.length; i += step) out.push(points[i]);
    if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
    return out;
  }

  function chunk(points: LatLngTuple[], chunkSize = 10): LatLngTuple[][] {
    if (points.length < 2) return [];
    const out: LatLngTuple[][] = [];
    const step = Math.max(2, chunkSize - 1);
    for (let i = 0; i < points.length - 1; i += step) {
      const seg = points.slice(i, i + chunkSize);
      if (seg.length >= 2) out.push(seg);
    }
    return out;
  }

  function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
  }

  function segmentTrafficColor(segIndex: number, totalSegments: number, trafficFactor: number): string {
    const normTraffic = clamp((trafficFactor - 1) / 0.6, 0, 1);
    const noise = Math.abs(Math.sin(segIndex * 12.9898 + totalSegments * 78.233)) % 1;
    const bias = normTraffic * 0.6;
    const intensity = 0.5 * noise + bias;
    if (intensity < 0.35) return '#22c55e';
    if (intensity < 0.65) return '#f97316';
    return '#ef4444';
  }

  const bestRoute = safeRoutes[selectedRoute] ?? safeRoutes[0];
  const bestCoords = bestRoute ? convert(bestRoute.geometry) : [];
  const center = bestCoords[0] ?? ([20.5937, 78.9629] as LatLngTuple);
  const allCoords = safeRoutes
    .filter((route) => Array.isArray(route.geometry) && route.geometry.length > 0)
    .flatMap((route) => convert(route.geometry));

  const routeLabelMarkers = useMemo(() => {
    return safeRoutes.map((route, index) => {
      const position = midpointLatLng(route.geometry);
      if (!position) return null;
      const label = `Route ${index + 1} · ${formatCostK(route.cost)} · ${Number(route.time).toFixed(1)}h`;
      const muted = index !== selectedRoute;
      const bg = muted ? 'rgba(24,24,28,0.88)' : 'rgba(30,58,95,0.92)';
      const border = muted ? 'rgba(100,116,139,0.35)' : 'rgba(59,130,246,0.5)';
      const html = `<div style="background:${bg};color:#e2e8f0;padding:5px 12px;border-radius:10px;font-size:11px;font-family:ui-monospace,Menlo,monospace;white-space:nowrap;border:1px solid ${border};box-shadow:0 2px 12px rgba(0,0,0,0.45);font-weight:600">${label}</div>`;
      const icon = L.divIcon({
        className: 'logiflow-route-label',
        html,
        iconSize: [200, 32],
        iconAnchor: [100, 16],
      });
      return { position, icon, index };
    });
  }, [safeRoutes, selectedRoute]);

  /**
   * Resolve intermediate stop positions from geometry.
   * For multi-stop routes the geometry is a stitched polyline; we estimate each
   * stop's position by splitting the geometry proportionally by leg distances.
   * When per-leg segment data is available we use cumulative distance fractions;
   * otherwise we distribute evenly.
   */
  const stopMarkers = useMemo(() => {
    if (!waypoints || waypoints.length <= 2 || !bestRoute?.geometry?.length) return [];

    const intermediateStops = waypoints.slice(1, waypoints.length - 1);
    const geo = bestRoute.geometry;
    const totalPoints = geo.length;
    const n = intermediateStops.length;

    // Try distance-weighted split if segments exist
    const segs = bestRoute.segments;
    let fractions: number[] = [];

    if (segs && segs.length >= n + 1) {
      const legDistances = segs.map(s => Number(s.distance_km ?? 0) || 1);
      const totalDist = legDistances.reduce((a, b) => a + b, 0) || 1;
      let cumulative = 0;
      for (let i = 0; i < n; i++) {
        cumulative += legDistances[i];
        fractions.push(cumulative / totalDist);
      }
    } else {
      // Even distribution fallback
      for (let i = 1; i <= n; i++) {
        fractions.push(i / (n + 1));
      }
    }

    return intermediateStops.map((stopName, si) => {
      const pointIdx = Math.round(fractions[si] * (totalPoints - 1));
      const safeIdx = Math.max(0, Math.min(totalPoints - 1, pointIdx));
      const [lng, lat] = geo[safeIdx];
      const position: LatLngTuple = [lat, lng];
      const icon = makeStopIcon(stopName.split(',')[0].trim(), si + 1);
      return { position, icon, stopName, stopNumber: si + 1 };
    });
  }, [waypoints, bestRoute]);

  useEffect(() => {
    if (!hasRoutes || !mapRef.current || !allCoords.length) return;
    const bounds = L.latLngBounds(allCoords);
    mapRef.current.fitBounds(bounds, { padding: [20, 20] });
  }, [hasRoutes, allCoords]);

  if (!hasRoutes || !bestRoute || bestCoords.length === 0) return null;

  return (
    <div className="h-full w-full min-h-[260px] rounded-xl overflow-hidden border border-outline-variant/20">
      <MapContainer
        ref={mapRef}
        center={center}
        zoom={7}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <IndiaBoundaryOverlay theme="light" />

        {routeLabelMarkers.map((item) =>
          item ? (
            <Marker
              key={`lbl-${item.index}`}
              position={item.position}
              icon={item.icon}
              interactive={false}
              zIndexOffset={400 + item.index}
            />
          ) : null
        )}

        {safeRoutes.map((route, index) => {
          if (!route.geometry || route.geometry.length === 0) return null;
          const pts = downsample(convert(route.geometry), 500);
          const segments = chunk(pts, 10);
          const trafficFactor = Number(route.traffic_factor ?? 1);
          const totalSegs = Math.max(1, segments.length);

          return (
            <React.Fragment key={index}>
              {segments.map((segPts, segIndex) => {
                const color = segmentTrafficColor(segIndex, totalSegs, trafficFactor);
                return (
                  <Polyline
                    key={`${index}-${segIndex}`}
                    positions={segPts}
                    pathOptions={{
                      color,
                      weight: index === selectedRoute ? 7 : 3,
                      opacity: index === selectedRoute ? 1 : 0.32,
                    }}
                  >
                    <Tooltip
                      direction="top"
                      offset={[0, -6]}
                      opacity={0.95}
                      className="rounded-md px-2 py-1 text-[10px] font-mono bg-zinc-900/95 text-zinc-100 border border-zinc-600/40 shadow-md"
                    >
                      {segmentTooltipText(route, segIndex)}
                    </Tooltip>
                  </Polyline>
                );
              })}

              {index === selectedRoute && (
                <Polyline positions={segments[0] ?? pts} pathOptions={{ opacity: 0 }}>
                  <Popup>
                    <div className="text-xs">
                      <b>Selected route</b>
                      <br />
                      Time: <span className="font-semibold">{route.time}</span>h
                      <br />
                      Cost: <span className="font-semibold">{formatCostK(route.cost)}</span>
                      <br />
                      Risk: <span className="font-semibold">{Math.round(route.risk * 100)}</span>%
                    </div>
                  </Popup>
                </Polyline>
              )}
            </React.Fragment>
          );
        })}

        {/* Origin marker */}
        <Marker position={bestCoords[0]}>
          <Popup>
            <b>Origin{waypoints?.[0] ? `: ${waypoints[0]}` : ''}</b>
          </Popup>
        </Marker>

        {/* Destination marker */}
        <Marker position={bestCoords[bestCoords.length - 1]}>
          <Popup>
            <b>Destination{waypoints?.[waypoints.length - 1] ? `: ${waypoints[waypoints.length - 1]}` : ''}</b>
          </Popup>
        </Marker>

        {/* Intermediate stop markers (multi-stop only) */}
        {stopMarkers.map(sm => (
          <Marker
            key={`stop-${sm.stopNumber}`}
            position={sm.position}
            icon={sm.icon}
            zIndexOffset={300 + sm.stopNumber}
          >
            <Popup>
              <div className="text-xs">
                <b>Stop {sm.stopNumber}: {sm.stopName}</b>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
