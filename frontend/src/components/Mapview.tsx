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
};

export default function MapView({ routes, selectedRoute = 0 }: { routes: Route[]; selectedRoute?: number }) {
  if (!routes || routes.length === 0) return null;

  const mapRef = useRef<LeafletMap | null>(null);

  // Convert [lng, lat] → [lat, lng]
  const convert = (coords: [number, number][]): LatLngTuple[] =>
    coords.map(([lng, lat]) => [lat, lng] as LatLngTuple);

  const bestRoute = routes[selectedRoute];
  const bestCoords = convert(bestRoute.geometry);
  const center = bestCoords[0];

  useEffect(() => {
    if (!mapRef.current) return;
    const bounds = L.latLngBounds(bestCoords);
    mapRef.current.fitBounds(bounds, { padding: [20, 20] });
  }, [selectedRoute, routes]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mt-6 h-[400px] w-full rounded-xl overflow-hidden border border-outline-variant/20">
      <MapContainer
        ref={mapRef}
        center={center}
        zoom={7}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution="© OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* All routes */}
        {routes.map((route, index) => {
          if (!route.geometry || route.geometry.length === 0) return null;

          return (
            <Polyline
              key={index}
              positions={convert(route.geometry)}
              pathOptions={{
                color: index === selectedRoute ? '#00E5FF' : '#888',
                weight: index === selectedRoute ? 6 : 3,
                opacity: index === selectedRoute ? 1 : 0.4,
              }}
            >
              <Popup>
                <div>
                  <b>{index === selectedRoute ? 'Selected Route' : 'Alternative'}</b><br/>
                  Time: {route.time} hrs<br/>
                  Cost: ₹{route.cost}<br/>
                  Risk: {Math.round(route.risk * 100)}%
                </div>
              </Popup>
            </Polyline>
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