'use client';

import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { LatLngTuple, Map as LeafletMap } from 'leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

type Route = {
  geometry: [number, number][];
  time: number;
  cost: number;
  risk: number;
  traffic_factor?: number;
};

export default function MapView({ routes, selectedRoute = 0 }: { routes: Route[]; selectedRoute?: number }) {
  if (!routes || routes.length === 0) return null;

  const mapRef = useRef<LeafletMap | null>(null);

  // Convert [lng, lat] → [lat, lng]
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
    const step = Math.max(2, chunkSize - 1); // overlap 1 point to avoid visual gaps
    for (let i = 0; i < points.length - 1; i += step) {
      const seg = points.slice(i, i + chunkSize);
      if (seg.length >= 2) out.push(seg);
    }
    return out;
  }

  function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
  }

  /** Google Maps–style: sin noise + traffic bias; never uniform across segments. */
  function segmentTrafficColor(
    segIndex: number,
    totalSegments: number,
    trafficFactor: number
  ): string {
    const normTraffic = clamp((trafficFactor - 1) / 0.6, 0, 1);
    const noise = Math.abs(Math.sin(segIndex * 12.9898 + totalSegments * 78.233)) % 1;
    const bias = normTraffic * 0.6;
    const intensity = 0.5 * noise + bias;
    if (intensity < 0.35) return 'green';
    if (intensity < 0.65) return 'orange';
    return 'red';
  }

  const bestRoute = routes[selectedRoute];
  const bestCoords = convert(bestRoute.geometry);
  const center = bestCoords[0];
  const allCoords = routes
    .filter((route) => Array.isArray(route.geometry) && route.geometry.length > 0)
    .flatMap((route) => convert(route.geometry));

  useEffect(() => {
    if (!mapRef.current) return;
    if (!allCoords.length) return;
    const bounds = L.latLngBounds(allCoords);
    mapRef.current.fitBounds(bounds, { padding: [20, 20] });
  }, [allCoords]);

  return (
    <div className="mt-6 h-[400px] w-full rounded-xl overflow-hidden border border-outline-variant/20">
      <MapContainer
        ref={mapRef}
        center={center}
        zoom={7}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* All routes */}
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
                      opacity: index === selectedRoute ? 1 : 0.35,
                    }}
                  />
                );
              })}

              {index === selectedRoute && (
                <Polyline positions={segments[0] ?? pts} pathOptions={{ opacity: 0 }}>
                  <Popup>
                    <div>
                      <b>Selected Route</b><br/>
                      Time: {route.time} hrs<br/>
                      Cost: ₹{route.cost}<br/>
                      Risk: {Math.round(route.risk * 100)}%
                    </div>
                  </Popup>
                </Polyline>
              )}
            </React.Fragment>
          );
        })}

        {/* Start Marker */}
        <Marker position={bestCoords[0]}>
          <Popup><b>Start Point</b></Popup>
        </Marker>

        {/* End Marker */}
        <Marker position={bestCoords[bestCoords.length - 1]}>
          <Popup><b>Destination</b></Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}