'use client';

import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { addIndiaBoundaryToMap, loadIndiaGeojson } from '@/lib/indiaMapLayer';

type Props = {
  theme?: 'dark' | 'light';
};

/** Official India state boundaries for react-leaflet maps. */
export default function IndiaBoundaryOverlay({ theme = 'light' }: Props) {
  const map = useMap();

  useEffect(() => {
    let layer: L.LayerGroup | null = null;
    let cancelled = false;

    void loadIndiaGeojson()
      .then((geojson) => {
        if (cancelled) return;
        layer = addIndiaBoundaryToMap(map, geojson, theme);
      })
      .catch(() => {
        /* Non-fatal: map still works without boundary overlay */
      });

    return () => {
      cancelled = true;
      layer?.remove();
    };
  }, [map, theme]);

  return null;
}
