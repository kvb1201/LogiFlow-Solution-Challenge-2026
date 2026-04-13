'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import type { LiveTrainPosition, Recommendation, RankedOption } from '@/services/api';

// ── Custom train icon as SVG ─────────────────────────────────────────

const trainDotSvg = (color: string, size = 8, ring = false) =>
  `<svg width="${size * 2}" height="${size * 2}" viewBox="0 0 ${size * 2} ${size * 2}" xmlns="http://www.w3.org/2000/svg">
    ${ring ? `<circle cx="${size}" cy="${size}" r="${size + 2}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.5"/>` : ''}
    <circle cx="${size}" cy="${size}" r="${size - 1}" fill="${color}" fill-opacity="0.9" stroke="#000" stroke-width="0.5"/>
    <circle cx="${size}" cy="${size}" r="${size * 0.3}" fill="#fff" fill-opacity="0.7"/>
  </svg>`;

const stationDotSvg = (color: string, isEndpoint = false) => {
  const size = isEndpoint ? 10 : 7;
  return `<svg width="${size * 2 + 4}" height="${size * 2 + 4}" viewBox="0 0 ${size * 2 + 4} ${size * 2 + 4}" xmlns="http://www.w3.org/2000/svg">
    ${isEndpoint ? `<circle cx="${size + 2}" cy="${size + 2}" r="${size + 1}" fill="${color}" fill-opacity="0.2"/>` : ''}
    <circle cx="${size + 2}" cy="${size + 2}" r="${size}" fill="${color}" stroke="#fff" stroke-width="2"/>
    ${isEndpoint ? `<circle cx="${size + 2}" cy="${size + 2}" r="${size * 0.35}" fill="#fff"/>` : ''}
  </svg>`;
};

const makeIcon = (svg: string, size: number) =>
  L.divIcon({
    html: svg,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

// ── Map colors ───────────────────────────────────────────────────────

const ROUTE_COLORS: Record<string, string> = {
  cheapest: '#10b981',
  fastest: '#f59e0b',
  safest: '#3b82f6',
  selected: '#8b5cf6',
  default: '#6b7280',
};

const TRAIN_TYPE_COLORS: Record<string, string> = {
  'Rajdhani Express': '#ef4444',
  'Shatabdi Express': '#f59e0b',
  'Superfast Express': '#3b82f6',
  'Duronto Express': '#8b5cf6',
  'Mail/Express': '#10b981',
  default: '#6b7280',
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Smooth oscillation between current and next position for “moving” trains */
function animatedLatLng(t: LiveTrainPosition, phase: number): [number, number] {
  const tClamped = Math.max(0, Math.min(1, phase));
  const lat = lerp(t.current_lat, t.next_lat || t.current_lat, tClamped);
  const lng = lerp(t.current_lng, t.next_lng || t.current_lng, tClamped);
  return [lat, lng];
}

interface MapProps {
  selectedRec?: Recommendation | null;
  selectedOption?: RankedOption | null;
  highlightType?: 'cheapest' | 'fastest' | 'safest' | 'selected';
}

export default function MapView({ selectedRec, selectedOption, highlightType }: MapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const trainLayerRef = useRef<L.LayerGroup | null>(null);
  const stationLayerRef = useRef<L.LayerGroup | null>(null);
  const [mapTick, setMapTick] = useState(0);
  const [animPhase, setAnimPhase] = useState(0);

  const {
    liveTrains,
    stationCoords,
    liveMapMode,
    fetchStationCoord,
    trainDelayDetail,
    mapFocusedTrainNumber,
    setMapFocusedTrain,
    source,
    destination,
    hasSearched,
  } = useLogiFlowStore();

  // ── Draw source/dest city dots (even if optimization fails) ────────
  useEffect(() => {
    if (!stationLayerRef.current || !mapRef.current) return;
    
    // If we have a selected route, the route drawing handles station dots.
    // However, if we don't have a route (fail case), we still want the cities.
    const segments = selectedRec?.segments || selectedOption?.segments;
    if (segments && segments.length > 0) return;

    if (!hasSearched) {
       stationLayerRef.current.clearLayers();
       return;
    }

    stationLayerRef.current.clearLayers();
    const srcCoord = stationCoords[source.trim()];
    const dstCoord = stationCoords[destination.trim()];

    if (srcCoord) {
      const marker = L.marker([srcCoord.lat, srcCoord.lng], {
        icon: makeIcon(stationDotSvg('#10b981', true), 24),
      }).addTo(stationLayerRef.current);
      marker.bindTooltip(`<strong>Source:</strong> ${source}`, { direction: 'top', permanent: true });
    }
    if (dstCoord) {
      const marker = L.marker([dstCoord.lat, dstCoord.lng], {
        icon: makeIcon(stationDotSvg('#ef4444', true), 24),
      }).addTo(stationLayerRef.current);
      marker.bindTooltip(`<strong>Destination:</strong> ${destination}`, { direction: 'top', permanent: true });
    }

    if (srcCoord || dstCoord) {
       const pts = [
         srcCoord ? ([srcCoord.lat, srcCoord.lng] as [number, number]) : null,
         dstCoord ? ([dstCoord.lat, dstCoord.lng] as [number, number]) : null
       ].filter(Boolean) as [number, number][];
       
       if (pts.length > 0) {
         const bounds = L.latLngBounds(pts);
         mapRef.current.fitBounds(bounds, { padding: [100, 100], maxZoom: 6 });
       }
    }
  }, [source, destination, stationCoords, hasSearched, selectedRec, selectedOption]);

  // ── Animation loop for train positions ─────────────────────────────
  useEffect(() => {
    let id: number;
    const start = performance.now();
    const loop = (now: number) => {
      const elapsed = (now - start) / 1000;
      const wave = (Math.sin(elapsed * 0.7) + 1) / 2;
      setAnimPhase(wave);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  // ── Initialize map ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([22.5, 78.0], 5);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OSM & CartoDB',
      subdomains: 'abcd',
      maxZoom: 18,
    }).addTo(mapRef.current);

    L.control.zoom({ position: 'topright' }).addTo(mapRef.current);

    routeLayerRef.current = L.layerGroup().addTo(mapRef.current);
    trainLayerRef.current = L.layerGroup().addTo(mapRef.current);
    stationLayerRef.current = L.layerGroup().addTo(mapRef.current);

    const map = mapRef.current;
    const bump = () => setMapTick(n => n + 1);
    map.on('moveend', bump);
    map.on('zoomend', bump);

    return () => {
      map.off('moveend', bump);
      map.off('zoomend', bump);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Draw live trains (bounds + animation + click → live detail) ──
  useEffect(() => {
    if (!trainLayerRef.current || !mapRef.current) return;
    trainLayerRef.current.clearLayers();

    if (liveMapMode === 'hidden' || !liveTrains.length) return;

    let filteredTrains = liveTrains;
    if (liveMapMode === 'route') {
      const activeTrainNo = selectedRec?.train_number || selectedOption?.train_number;
      filteredTrains = activeTrainNo ? liveTrains.filter(t => t.train_number === activeTrainNo) : [];
    }

    const bounds = mapRef.current.getBounds();
    const visibleTrains = filteredTrains.filter(
      t => t.current_lat && t.current_lng && bounds.contains([t.current_lat, t.current_lng])
    );

    visibleTrains.forEach(train => {
      const [lat, lng] = animatedLatLng(train, animPhase);
      const color = TRAIN_TYPE_COLORS[train.type] || TRAIN_TYPE_COLORS.default;
      const focused = mapFocusedTrainNumber === train.train_number;
      const marker = L.marker([lat, lng], {
        icon: makeIcon(trainDotSvg(color, 5, focused), focused ? 14 : 10),
        zIndexOffset: focused ? 400 : -100,
      });

      marker.bindTooltip(
        `<div style="font-family:system-ui,sans-serif;font-size:11px;line-height:1.4">
          <strong>${train.train_number}</strong> ${train.train_name}<br/>
          <span style="opacity:0.7">${train.type}</span><br/>
          At: ${train.current_station_name || train.current_station}<br/>
          Next: ${train.next_station_name || train.next_station}<br/>
          <span style="opacity:0.65;font-size:10px">Click for live tracking</span>
        </div>`,
        { direction: 'top', offset: [0, -8] }
      );

      marker.on('click', () => {
        setMapFocusedTrain(train.train_number);
      });

      trainLayerRef.current!.addLayer(marker);
    });
  }, [liveTrains, liveMapMode, mapTick, animPhase, mapFocusedTrainNumber, setMapFocusedTrain, selectedRec, selectedOption]);

  // ── Delay lookup for station popups (RailRadar per-station breakdown) ──
  const delayForCode = useCallback(
    (code: string) => {
      if (!trainDelayDetail?.route?.length || !code) return null;
      const u = code.toUpperCase();
      return (
        trainDelayDetail.route.find(r => (r.stationCode || '').toUpperCase() === u) ?? null
      );
    },
    [trainDelayDetail]
  );

  // ── Draw route when selection changes ────────────────────────────────
  const drawRoute = useCallback(
    async (
      segments: Recommendation['segments'] | undefined,
      color: string,
      fitBounds = true
    ) => {
      if (!routeLayerRef.current || !stationLayerRef.current || !mapRef.current) return;
      routeLayerRef.current.clearLayers();
      stationLayerRef.current.clearLayers();

      if (!segments || segments.length === 0) return;

      const coords: [number, number][] = [];

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const fromCode = typeof seg.from === 'string' ? seg.from : '';
        const toCode = typeof seg.to === 'string' ? seg.to : '';

        let fromCoord = stationCoords[fromCode];
        let toCoord = stationCoords[toCode];

        if (!fromCoord && fromCode) {
          const fetched = await fetchStationCoord(fromCode);
          if (fetched) fromCoord = fetched;
        }
        if (!toCoord && toCode) {
          const fetched = await fetchStationCoord(toCode);
          if (fetched) toCoord = fetched;
        }

        const dFrom = fromCode ? delayForCode(fromCode) : null;
        const dTo = toCode ? delayForCode(toCode) : null;

        if (fromCoord) {
          const latLng: [number, number] = [fromCoord.lat, fromCoord.lng];
          coords.push(latLng);

          const isFirst = i === 0;
          const stationMarker = L.marker(latLng, {
            icon: makeIcon(stationDotSvg(isFirst ? '#10b981' : color, isFirst), isFirst ? 24 : 18),
            zIndexOffset: 100,
          });

          const delayLine =
            dFrom != null
              ? `<br/><span style="color:#94a3b8">Arr delay: ${dFrom.arrivalDelayMinutes}m · Dep delay: ${dFrom.departureDelayMinutes}m</span>`
              : '';

          stationMarker.bindPopup(
            `<div style="font-family:system-ui,sans-serif;font-size:11px;line-height:1.5;min-width:160px">
              <strong>${fromCoord.name}</strong> (${fromCoord.code})<br/>
              ${seg.train_name ? `🚂 ${seg.train_no ?? ''} ${seg.train_name}` : ''}<br/>
              ${seg.departure ? `Departs: ${seg.departure}` : ''}
              ${delayLine}
            </div>`,
            { maxWidth: 280 }
          );

          stationMarker.bindTooltip(
            `<div style="font-family:system-ui,sans-serif;font-size:11px;line-height:1.5">
              <strong>${fromCoord.name}</strong> (${fromCoord.code})<br/>
              ${seg.train_name ? `🚂 ${seg.train_no ?? ''} ${seg.train_name}` : ''}<br/>
              ${seg.departure ? `Departs: ${seg.departure}` : ''}
              ${delayLine}
            </div>`,
            { direction: 'top', offset: [0, -10], permanent: isFirst }
          );

          stationLayerRef.current!.addLayer(stationMarker);
        }

        if (toCoord) {
          const latLng: [number, number] = [toCoord.lat, toCoord.lng];
          coords.push(latLng);

          const isLast = i === segments.length - 1;
          const stationMarker = L.marker(latLng, {
            icon: makeIcon(stationDotSvg(isLast ? '#ef4444' : color, isLast), isLast ? 24 : 18),
            zIndexOffset: 100,
          });

          const delayLine =
            dTo != null
              ? `<br/><span style="color:#94a3b8">Arr delay: ${dTo.arrivalDelayMinutes}m · Dep delay: ${dTo.departureDelayMinutes}m</span>`
              : '';

          stationMarker.bindPopup(
            `<div style="font-family:system-ui,sans-serif;font-size:11px;line-height:1.5;min-width:160px">
              <strong>${toCoord.name}</strong> (${toCoord.code})<br/>
              ${seg.arrival ? `Arrives: ${seg.arrival}` : ''}<br/>
              ${seg.distance_km ? `${seg.distance_km} km` : ''}
              ${delayLine}
            </div>`,
            { maxWidth: 280 }
          );

          stationMarker.bindTooltip(
            `<div style="font-family:system-ui,sans-serif;font-size:11px;line-height:1.5">
              <strong>${toCoord.name}</strong> (${toCoord.code})<br/>
              ${seg.arrival ? `Arrives: ${seg.arrival}` : ''}<br/>
              ${seg.distance_km ? `${seg.distance_km} km` : ''}
              ${delayLine}
            </div>`,
            { direction: 'top', offset: [0, -10], permanent: isLast }
          );

          stationLayerRef.current!.addLayer(stationMarker);
        }

        if (fromCoord && toCoord) {
          const polyline = L.polyline(
            [
              [fromCoord.lat, fromCoord.lng],
              [toCoord.lat, toCoord.lng],
            ],
            {
              color,
              weight: 4,
              opacity: 0.85,
              smoothFactor: 1.5,
            }
          );

          const glow = L.polyline(
            [
              [fromCoord.lat, fromCoord.lng],
              [toCoord.lat, toCoord.lng],
            ],
            { color, weight: 12, opacity: 0.15, smoothFactor: 1.5 }
          );

          routeLayerRef.current!.addLayer(glow);
          routeLayerRef.current!.addLayer(polyline);

          polyline.bindTooltip(
            `<div style="font-family:system-ui,sans-serif;font-size:11px">
              ${seg.train_name || 'Route'}<br/>
              ${seg.distance_km ? `${seg.distance_km} km` : ''}
              ${seg.duration_minutes ? ` · ${Math.round(seg.duration_minutes / 60)}h` : ''}
            </div>`,
            { sticky: true }
          );
        }
      }

      if (fitBounds && coords.length > 0) {
        const bounds = L.latLngBounds(coords);
        mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 8 });
      }
    },
    [stationCoords, fetchStationCoord, delayForCode]
  );

  // ── React to selection + delay data ─────────────────────────────────
  useEffect(() => {
    const key = highlightType && ROUTE_COLORS[highlightType] ? highlightType : 'selected';
    const color = ROUTE_COLORS[key] ?? ROUTE_COLORS.selected;
    const segments = selectedRec?.segments || selectedOption?.segments;
    drawRoute(segments, color);
  }, [selectedRec, selectedOption, highlightType, drawRoute, trainDelayDetail]);

  return <div ref={mapContainerRef} className="w-full h-full" />;
}
