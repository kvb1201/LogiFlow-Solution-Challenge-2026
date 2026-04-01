'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Segment {
  mode: string;
  from: any;
  to: any;
}

const modeColors: Record<string, string> = {
  Road: '#3b82f6',
  Rail: '#10b981',
  Water: '#06b6d4',
  Hybrid: '#f59e0b',
};

export default function MapView({ segments, sourceName, destName }: { segments?: Segment[]; sourceName: string; destName: string }) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([22.5, 75.0], 5);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OSM & CartoDB',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;
    
    // Clear everything
    map.eachLayer((layer) => {
      if (layer instanceof L.Polyline || layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });

    if (segments && segments.length > 0 && sourceName && destName) {
      let accumulatedCoords: [number, number][] = [];
      const markersToAdd: [number, number][] = [];

      segments.forEach((segment) => {
        let fromCoord: [number, number] | null = null;
        let toCoord: [number, number] | null = null;

        if (segment.from?.lat && segment.from?.lng) {
          fromCoord = [segment.from.lat, segment.from.lng];
          accumulatedCoords.push(fromCoord);
          
          // Add marker for the "from" node if we haven't already
          if (!markersToAdd.some(m => m[0] === fromCoord![0] && m[1] === fromCoord![1])) {
            markersToAdd.push(fromCoord);
            const isSource = markersToAdd.length === 1;
            L.marker(fromCoord, { 
              icon: L.divIcon({
                html: `<div style="width: 14px; height: 14px; border-radius: 50%; background-color: ${isSource ? '#acc7ff' : '#ffffff'}; border: 2px solid ${isSource ? '#2F81F7' : '#333'}; box-shadow: 0 0 8px rgba(0,0,0,0.5);"></div>`,
                className: '',
                iconSize: [14, 14],
                iconAnchor: [7, 7]
              })
            })
            .bindTooltip(`Node: ${segment.from.name || 'Waypoint'}`, { permanent: false })
            .addTo(map);
          }
        }
        if (segment.to?.lat && segment.to?.lng) {
          toCoord = [segment.to.lat, segment.to.lng];
          accumulatedCoords.push(toCoord);
          
          // Add marker for the "to" node if we haven't already
          if (!markersToAdd.some(m => m[0] === toCoord![0] && m[1] === toCoord![1])) {
            markersToAdd.push(toCoord);
            L.marker(toCoord, { 
              icon: L.divIcon({
                html: `<div style="width: 14px; height: 14px; border-radius: 50%; background-color: #ffffff; border: 2px solid #333; box-shadow: 0 0 8px rgba(0,0,0,0.5);"></div>`,
                className: '',
                iconSize: [14, 14],
                iconAnchor: [7, 7]
              })
            })
            .bindTooltip(`Node: ${segment.to.name || 'Waypoint'}`, { permanent: false })
            .addTo(map);
          }
        }

        if (fromCoord && toCoord) {
          const color = modeColors[segment.mode] || '#6b7280';
          L.polyline([fromCoord, toCoord], {
            color,
            weight: 5,
            opacity: 0.8,
            smoothFactor: 1,
          }).addTo(map)
          .bindTooltip(`Mode: ${segment.mode}`, { sticky: true });
        }
      });

      if (accumulatedCoords.length > 0) {
        const bounds = L.latLngBounds(accumulatedCoords);
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [segments, sourceName, destName]);

  return <div ref={mapContainerRef} className="w-full h-full" />;
}
