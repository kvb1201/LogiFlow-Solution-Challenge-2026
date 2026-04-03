'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { LatLngTuple, Map as LeafletMap } from 'leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;

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

export default function MapView({ routes, selectedRoute = 0 }: { routes: MapRoute[]; selectedRoute?: number }) {
  if (!routes || routes.length === 0) return null;

  const mapRef = useRef<LeafletMap | null>(null);

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

  const bestRoute = routes[selectedRoute];
  const bestCoords = convert(bestRoute.geometry);
  const center = bestCoords[0];
  const allCoords = routes
    .filter((route) => Array.isArray(route.geometry) && route.geometry.length > 0)
    .flatMap((route) => convert(route.geometry));

  const routeLabelMarkers = useMemo(() => {
    return routes.map((route, index) => {
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
  }, [routes, selectedRoute]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!allCoords.length) return;
    const bounds = L.latLngBounds(allCoords);
    mapRef.current.fitBounds(bounds, { padding: [20, 20] });
  }, [allCoords]);

  return (
    <div className="mt-2 h-[400px] w-full rounded-xl overflow-hidden border border-outline-variant/20">
      <MapContainer
        ref={mapRef}
        center={center}
        zoom={7}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

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

        {routes.map((route, index) => {
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

        <Marker position={bestCoords[0]}>
          <Popup>
            <b>Start</b>
          </Popup>
        </Marker>

        <Marker position={bestCoords[bestCoords.length - 1]}>
          <Popup>
            <b>Destination</b>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
