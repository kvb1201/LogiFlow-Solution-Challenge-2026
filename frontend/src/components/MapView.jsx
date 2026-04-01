import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getCoords } from "../utils/helpers.js";
import { modeColor } from "../utils/constants.js";

const MapView = ({ segments, sourceName, destName }) => {
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const layersRef = useRef({ polylines: [], markers: [] });
  
  const clearLayers = () => {
    if (!mapRef.current) return;
    layersRef.current.polylines.forEach(line => mapRef.current.removeLayer(line));
    layersRef.current.markers.forEach(marker => mapRef.current.removeLayer(marker));
    layersRef.current.polylines = [];
    layersRef.current.markers = [];
  };
  
  const drawSegments = (segmentsList) => {
    if (!mapRef.current || !segmentsList) return;
    let accumulatedCoords = [];
    
    segmentsList.forEach((segment, idx) => {
      const fromCoord = getCoords(segment.from);
      const toCoord = getCoords(segment.to);
      const segCoords = [fromCoord, toCoord];
      const color = modeColor[segment.mode] || "#6b7280";
      const polyline = L.polyline(segCoords, {
        color: color,
        weight: 5,
        opacity: 0.8,
        smoothFactor: 1,
        className: `segment-line-${idx}`
      }).addTo(mapRef.current);
      
      polyline.on('mouseover', () => {
        polyline.setStyle({ weight: 7, opacity: 1 });
      });
      polyline.on('mouseout', () => {
        polyline.setStyle({ weight: 5, opacity: 0.8 });
      });
      
      layersRef.current.polylines.push(polyline);
      accumulatedCoords.push(fromCoord, toCoord);
    });
    
    return accumulatedCoords;
  };
  
  const addMarkers = (srcName, dstName) => {
    if (!mapRef.current) return;
    const srcCoord = getCoords(srcName);
    const dstCoord = getCoords(dstName);
    
    const sourceIcon = L.divIcon({ html: '<i class="fas fa-location-dot text-blue-600 text-2xl drop-shadow"></i>', iconSize: [24, 24], className: 'bg-transparent' });
    const destIcon = L.divIcon({ html: '<i class="fas fa-flag-checkered text-green-600 text-2xl drop-shadow"></i>', iconSize: [24, 24], className: 'bg-transparent' });
    
    const srcMarker = L.marker(srcCoord, { icon: sourceIcon }).addTo(mapRef.current);
    srcMarker.bindTooltip(`<b>Source:</b> ${srcName}`, { sticky: true });
    const dstMarker = L.marker(dstCoord, { icon: destIcon }).addTo(mapRef.current);
    dstMarker.bindTooltip(`<b>Destination:</b> ${dstName}`, { sticky: true });
    
    layersRef.current.markers.push(srcMarker, dstMarker);
    return [srcCoord, dstCoord];
  };
  
  const fitBoundsToRoute = (allCoords) => {
    if (!mapRef.current || !allCoords.length) return;
    const bounds = L.latLngBounds(allCoords);
    mapRef.current.fitBounds(bounds, { padding: [50, 50] });
  };
  
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current).setView([22.5, 75.0], 5);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> & CartoDB',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(mapRef.current);
      
      L.control.scale({ metric: true, imperial: false }).addTo(mapRef.current);
    }
    
    clearLayers();
    
    if (segments && segments.length > 0 && sourceName && destName) {
      const coordsList = drawSegments(segments);
      const markerCoords = addMarkers(sourceName, destName);
      const allPoints = [...coordsList, ...markerCoords].filter(c => c);
      if (allPoints.length) fitBoundsToRoute(allPoints);
    }
  }, [segments, sourceName, destName]);
  
  useEffect(() => {
    if (!mapRef.current) return;
    const legendControl = L.control({ position: 'bottomright' });
    legendControl.onAdd = () => {
      const div = L.DomUtil.create('div', 'map-legend');
      div.innerHTML = `
        <div class="text-xs font-semibold text-slate-700 mb-1">Transport modes</div>
        <div class="flex items-center gap-2"><span style="background:#3b82f6; width:16px; height:4px; display:inline-block; border-radius:2px;"></span> Road</div>
        <div class="flex items-center gap-2"><span style="background:#10b981; width:16px; height:4px; display:inline-block; border-radius:2px;"></span> Rail</div>
        <div class="flex items-center gap-2"><span style="background:#f59e0b; width:16px; height:4px; display:inline-block; border-radius:2px;"></span> Hybrid</div>
        <div class="mt-1 text-xs text-slate-500"><i class="fas fa-location-dot"></i> Source &nbsp;&nbsp; <i class="fas fa-flag-checkered"></i> Destination</div>
      `;
      return div;
    };
    legendControl.addTo(mapRef.current);
    
    return () => {
      legendControl.remove();
    };
  }, []);
  
  return (
    <div className="w-full h-[420px] md:h-[500px] rounded-2xl map-container bg-slate-100 border border-slate-200 shadow-md">
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
};

export default MapView;
