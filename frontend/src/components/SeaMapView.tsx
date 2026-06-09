'use client';

/**
 * SeaMapView — Maritime route map with OpenSeaMap tiles.
 *
 * Features:
 *  - OpenSeaMap nautical chart overlay (sea depths, buoys, shipping lanes)
 *  - Great-circle arc polylines between ports
 *  - Chokepoint markers pinned along routes
 *  - Origin / destination markers
 *  - Route label at midpoint
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, Tooltip, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { LatLngTuple, Map as LeafletMap } from 'leaflet';
import type { WaterRoute } from '@/services/api';

// Fix default marker icons
type IconDefaultProto = typeof L.Icon.Default.prototype & { _getIconUrl?: unknown };
delete (L.Icon.Default.prototype as IconDefaultProto)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// ── Port coordinate lookup ────────────────────────────────────────────
// Keyed by the port name strings returned by the backend
const PORT_COORDS: Record<string, [number, number]> = {
  // India – West
  'Mundra Port, Gujarat, India':                     [22.763,  69.622],
  'Deendayal Port (Kandla), Gujarat, India':         [23.009,  70.216],
  'Jawaharlal Nehru Port (JNPT), Navi Mumbai, India':[18.917,  72.940],
  'Hazira Port, Gujarat, India':                     [21.087,  72.646],
  'Dahej Port, Gujarat, India':                      [21.703,  72.575],
  'Pipavav Port, Gujarat, India':                    [20.908,  71.466],
  'Mormugao Port, Goa, India':                       [15.407,  73.802],
  'New Mangalore Port, Karnataka, India':            [12.938,  74.819],
  'Cochin Port (Kochi), Kerala, India':              [ 9.969,  76.259],
  // India – East
  'V.O. Chidambaranar Port (Tuticorin), Tamil Nadu, India': [8.766, 78.189],
  'Chennai Port, Tamil Nadu, India':                 [13.100,  80.294],
  'Kamarajar Port (Ennore), Tamil Nadu, India':      [13.279,  80.339],
  'Krishnapatnam Port, Andhra Pradesh, India':       [14.261,  80.118],
  'Visakhapatnam Port, Andhra Pradesh, India':       [17.655,  83.231],
  'Paradip Port, Odisha, India':                     [20.280,  86.649],
  'Haldia Dock Complex, West Bengal, India':         [22.058,  88.104],
  'Kolkata Port (Syama Prasad Mookerjee), West Bengal, India': [22.536, 88.300],
  // Middle East
  'Jebel Ali Port (Dubai), UAE':                     [25.013,  55.061],
  'Jeddah Islamic Port, Saudi Arabia':               [21.486,  39.188],
  'Port of Salalah, Oman':                           [16.950,  54.010],
  'Port Said (Suez Canal Gateway), Egypt':           [31.260,  32.310],
  'Alexandria Port, Egypt':                          [31.200,  29.900],
  // South Asia
  'Port of Colombo, Sri Lanka':                      [ 6.935,  79.848],
  // Southeast Asia
  'Port of Singapore, Singapore':                    [ 1.264, 103.840],
  'Port Klang, Malaysia':                            [ 3.000, 101.350],
  'Tanjung Pelepas Port, Malaysia':                  [ 1.363, 103.553],
  'Laem Chabang Port, Thailand':                     [13.080, 100.890],
  'Ho Chi Minh City Port (Cat Lai), Vietnam':        [10.760, 106.790],
  'Jakarta (Tanjung Priok), Indonesia':              [-6.101, 106.870],
  // East Asia
  'Port of Shanghai, China':                         [31.220, 121.480],
  'Port of Ningbo, China':                           [29.867, 121.550],
  'Port of Hong Kong':                               [22.300, 114.160],
  'Port of Busan, South Korea':                      [35.096, 129.040],
  'Port of Tokyo, Japan':                            [35.630, 139.780],
  // Europe
  'Port of Rotterdam, Netherlands':                  [51.924,   4.477],
  'Port of Antwerp-Bruges, Belgium':                 [51.219,   4.402],
  'Port of Hamburg, Germany':                        [53.551,   9.993],
  'Port of Istanbul (Ambarli), Türkiye':             [41.020,  28.660],
  // Africa
  'Port of Durban, South Africa':                    [-29.870,  31.040],
  'Tanger Med, Morocco':                             [35.890,  -5.500],
  // Americas
  'Port of Houston, United States':                  [29.749, -95.208],
  'Port of Santos, Brazil':                          [-23.970, -46.320],
};

// Known chokepoint coordinates (by common name)
const CHOKEPOINT_COORDS: Record<string, [number, number]> = {
  'Suez Canal':          [30.593,  32.437],
  'Panama Canal':        [ 9.121, -79.767],
  'Strait of Hormuz':    [26.297,  56.860],
  'Bab el-Mandeb Strait':[12.789,  43.350],
  'Malacca Strait':      [ 1.517, 102.665],
  'Gibraltar Strait':    [35.942,  -5.755],
  'Dover Strait':        [51.030,   1.506],
  'Taiwan Strait':       [24.724, 119.831],
  'Korea Strait':        [34.131, 129.209],
  'Cape of Good Hope':   [-34.927, 20.883],
  'Bosporus Strait':     [41.169,  29.092],
  'Lombok Strait':       [-8.419, 115.801],
  'Sunda Strait':        [-5.967, 105.775],
};

// ── Great-circle interpolation ────────────────────────────────────────

function toRad(deg: number) { return deg * Math.PI / 180; }
function toDeg(rad: number) { return rad * 180 / Math.PI; }

/**
 * Generate great-circle arc points between two lat/lng coordinates.
 * Returns an array of [lat, lng] tuples suitable for Leaflet.
 * Splits at the antimeridian to avoid wrap-around rendering artifacts.
 */
function greatCircleArc(
  from: [number, number],
  to: [number, number],
  numPoints = 80,
): LatLngTuple[] {
  const [lat1, lon1] = from.map(toRad);
  const [lat2, lon2] = to.map(toRad);

  const points: LatLngTuple[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const A = Math.sin((1 - f) * Math.acos(
      Math.sin(lat1) * Math.sin(lat2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1)
    )) / Math.sin(Math.acos(
      Math.sin(lat1) * Math.sin(lat2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1)
    ));
    const B = Math.sin(f * Math.acos(
      Math.sin(lat1) * Math.sin(lat2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1)
    )) / Math.sin(Math.acos(
      Math.sin(lat1) * Math.sin(lat2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1)
    ));
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    const lng = toDeg(Math.atan2(y, x));
    points.push([lat, lng]);
  }
  return points;
}

/** Fallback straight line if great-circle calc produces NaN */
function straightLine(from: [number, number], to: [number, number], n = 20): LatLngTuple[] {
  const pts: LatLngTuple[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    pts.push([from[0] + f * (to[0] - from[0]), from[1] + f * (to[1] - from[1])]);
  }
  return pts;
}

function makeArc(from: [number, number], to: [number, number]): LatLngTuple[] {
  try {
    const pts = greatCircleArc(from, to, 60);
    if (pts.some(([lat, lng]) => isNaN(lat) || isNaN(lng))) throw new Error('NaN');
    return pts;
  } catch {
    return straightLine(from, to);
  }
}

// ── Marker icon builders ──────────────────────────────────────────────

function portIcon(label: string, color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="background:rgba(15,15,20,0.92);color:#f1f5f9;padding:3px 8px;border-radius:12px;font-size:10px;font-family:ui-monospace,monospace;white-space:nowrap;border:1.5px solid ${color};box-shadow:0 2px 8px rgba(0,0,0,0.5);">${label}</div>`,
    iconSize: [160, 22],
    iconAnchor: [80, 11],
  });
}

function chokepointIcon(name: string): L.DivIcon {
  const short = name.length > 18 ? name.slice(0, 16) + '…' : name;
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;gap:3px;background:rgba(20,20,25,0.92);color:#fbbf24;padding:2px 6px;border-radius:10px;font-size:9px;font-family:ui-monospace,monospace;white-space:nowrap;border:1px solid rgba(251,191,36,0.35);box-shadow:0 1px 6px rgba(0,0,0,0.4);">⚓ ${short}</div>`,
    iconSize: [140, 18],
    iconAnchor: [70, 9],
  });
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN').format(Math.round(n));
}

// ── Main component ────────────────────────────────────────────────────

export default function SeaMapView({
  routes,
  selectedRoute = 0,
  source,
  destination,
}: {
  routes: WaterRoute[];
  selectedRoute?: number;
  source?: string;
  destination?: string;
}) {
  const mapRef = useRef<LeafletMap | null>(null);

  const active = routes[selectedRoute] ?? routes[0];

  /** Resolve port coords from route segments */
  const resolvePortCoords = (portName?: string): [number, number] | null => {
    if (!portName) return null;
    // Exact match first
    if (PORT_COORDS[portName]) return PORT_COORDS[portName];
    // Fuzzy: find first key that contains portName or vice versa
    const lower = portName.toLowerCase();
    for (const [key, coord] of Object.entries(PORT_COORDS)) {
      if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase().split(',')[0].toLowerCase())) {
        return coord;
      }
    }
    return null;
  };

  /**
   * Build arc segments for the selected route from its port segments.
   * Each Water-mode segment produces one great-circle arc.
   */
  const arcSegments = useMemo(() => {
    if (!active?.segments?.length) return [];
    const segs: { arc: LatLngTuple[]; from: string; to: string }[] = [];
    for (const seg of active.segments) {
      if (seg.mode !== 'Water') continue;
      const fromCoord = resolvePortCoords(seg.from);
      const toCoord   = resolvePortCoords(seg.to);
      if (!fromCoord || !toCoord) continue;
      segs.push({ arc: makeArc(fromCoord, toCoord), from: seg.from, to: seg.to });
    }
    return segs;
  }, [active]);

  /** All other (non-selected) routes — faint arcs */
  const otherArcs = useMemo(() => {
    return routes
      .map((r, i) => {
        if (i === selectedRoute || !r.segments?.length) return null;
        const firstWater = r.segments.find(s => s.mode === 'Water');
        if (!firstWater) return null;
        const fromCoord = resolvePortCoords(firstWater.from);
        const toCoord   = resolvePortCoords(firstWater.to);
        if (!fromCoord || !toCoord) return null;
        return { arc: makeArc(fromCoord, toCoord), index: i };
      })
      .filter(Boolean) as { arc: LatLngTuple[]; index: number }[];
  }, [routes, selectedRoute]);

  /** Chokepoints on the selected route */
  const chokepointMarkers = useMemo(() => {
    const cps = active?.chokepoints_transited ?? [];
    return cps
      .map(name => {
        const coord = CHOKEPOINT_COORDS[name];
        if (!coord) return null;
        return { name, coord };
      })
      .filter(Boolean) as { name: string; coord: [number, number] }[];
  }, [active]);

  /** Origin and destination markers */
  const originCoord  = resolvePortCoords(active?.origin_port ?? source);
  const destCoord    = resolvePortCoords(active?.destination_port ?? destination);

  /** Fit map to all arc points */
  const allPoints = useMemo(() => {
    const pts: LatLngTuple[] = [];
    for (const seg of arcSegments) pts.push(...seg.arc);
    if (originCoord) pts.push(originCoord as LatLngTuple);
    if (destCoord)   pts.push(destCoord as LatLngTuple);
    return pts;
  }, [arcSegments, originCoord, destCoord]);

  useEffect(() => {
    if (!mapRef.current || allPoints.length < 2) return;
    const bounds = L.latLngBounds(allPoints);
    mapRef.current.fitBounds(bounds, { padding: [28, 28] });
  }, [allPoints]);

  const center: LatLngTuple = originCoord
    ? [originCoord[0], originCoord[1]]
    : [20, 60];

  return (
    <MapContainer
      ref={mapRef}
      center={center}
      zoom={4}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
    >
      {/* Base nautical chart */}
      <TileLayer
        attribution='Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Nautical data © <a href="https://www.openseamap.org">OpenSeaMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        opacity={0.7}
      />
      {/* OpenSeaMap nautical overlay */}
      <TileLayer
        url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
        opacity={0.75}
      />

      {/* Non-selected routes — faint */}
      {otherArcs.map(({ arc, index }) => (
        <Polyline
          key={`other-${index}`}
          positions={arc}
          pathOptions={{ color: '#5eead4', weight: 2, opacity: 0.22, dashArray: '6 6' }}
        />
      ))}

      {/* Selected route arcs */}
      {arcSegments.map((seg, i) => (
        <React.Fragment key={`arc-${i}`}>
          {/* Glow layer */}
          <Polyline
            positions={seg.arc}
            pathOptions={{ color: '#2dd4bf', weight: 8, opacity: 0.15 }}
          />
          {/* Main arc */}
          <Polyline
            positions={seg.arc}
            pathOptions={{ color: '#2dd4bf', weight: 3, opacity: 0.9 }}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={0.95}
              className="rounded-md px-2 py-1 text-[10px] font-mono bg-zinc-900/95 text-zinc-100 border border-zinc-600/40 shadow-md">
              {seg.from} → {seg.to}
            </Tooltip>
          </Polyline>
          {/* Direction arrow at 60% point */}
          {seg.arc.length > 3 && (() => {
            const mid = seg.arc[Math.floor(seg.arc.length * 0.6)];
            return (
              <CircleMarker
                center={mid}
                radius={3}
                pathOptions={{ color: '#2dd4bf', fillColor: '#2dd4bf', fillOpacity: 1, weight: 0 }}
              />
            );
          })()}
        </React.Fragment>
      ))}

      {/* Chokepoint markers */}
      {chokepointMarkers.map(({ name, coord }) => (
        <Marker
          key={name}
          position={coord as LatLngTuple}
          icon={chokepointIcon(name)}
          zIndexOffset={200}
        >
          <Popup>
            <div className="text-xs">
              <b>⚓ {name}</b>
              <br />
              <span className="text-amber-600">Strategic chokepoint</span>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Origin marker */}
      {originCoord && (
        <Marker
          position={originCoord as LatLngTuple}
          icon={portIcon(active?.origin_port?.split(',')[0] ?? source ?? 'Origin', '#2dd4bf')}
          zIndexOffset={500}
        >
          <Popup>
            <div className="text-xs">
              <b>Origin: {active?.origin_port ?? source}</b>
              {active && <><br />₹{fmt(active.cost)} · {Number(active.time).toFixed(1)}h</>}
            </div>
          </Popup>
        </Marker>
      )}

      {/* Destination marker */}
      {destCoord && (
        <Marker
          position={destCoord as LatLngTuple}
          icon={portIcon(active?.destination_port?.split(',')[0] ?? destination ?? 'Destination', '#818cf8')}
          zIndexOffset={500}
        >
          <Popup>
            <div className="text-xs">
              <b>Destination: {active?.destination_port ?? destination}</b>
            </div>
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
