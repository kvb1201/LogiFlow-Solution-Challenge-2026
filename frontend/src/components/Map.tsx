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
        }
        if (segment.to?.lat && segment.to?.lng) {
          toCoord = [segment.to.lat, segment.to.lng];
          accumulatedCoords.push(toCoord);
        }

        if (fromCoord && toCoord) {
          const color = modeColors[segment.mode] || '#6b7280';
          L.polyline([fromCoord, toCoord], {
            color,
            weight: 5,
            opacity: 0.8,
            smoothFactor: 1,
          }).addTo(map);
        }
      });

      if (accumulatedCoords.length > 0) {
        markersToAdd.push(accumulatedCoords[0]);
        markersToAdd.push(accumulatedCoords[accumulatedCoords.length - 1]);
        
        // Custom markers using icons similar to the Stitch HTML design
        const createIcon = (color: string) => L.divIcon({
          html: `<div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${color}; border: 2px solid white; box-shadow: 0 0 8px rgba(0,0,0,0.5);"></div>`,
          className: '',
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        });

        if (markersToAdd[0]) {
          L.marker(markersToAdd[0], { icon: createIcon('#acc7ff') })
            .bindTooltip(`Source: ${sourceName}`)
            .addTo(map);
        }
        
        if (markersToAdd[1]) {
          L.marker(markersToAdd[1], { icon: createIcon('#acc7ff') })
            .bindTooltip(`Destination: ${destName}`)
            .addTo(map);
        }

        const bounds = L.latLngBounds(accumulatedCoords);
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [segments, sourceName, destName]);

  return <div ref={mapContainerRef} className="w-full h-full" />;
}
