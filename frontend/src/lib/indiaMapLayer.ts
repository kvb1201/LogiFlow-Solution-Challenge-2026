import type { Feature, FeatureCollection, GeoJsonObject } from 'geojson';
import L from 'leaflet';

/** Survey-of-India-aligned state boundaries (J&K, Ladakh, Arunachal included). */
export const INDIA_GEOJSON_URL = '/geo/india-states-simplified.geojson';

const TERRITORIAL_STATES = new Set([
  'Jammu and Kashmir',
  'Ladakh',
  'Arunachal Pradesh',
]);

type MapTheme = 'dark' | 'light';

const THEME_STYLES: Record<
  MapTheme,
  { fill: string; fillOpacity: number; border: string; borderOpacity: number }
> = {
  dark: {
    fill: '#161616',
    fillOpacity: 0.9,
    border: '#475569',
    borderOpacity: 0.6,
  },
  light: {
    fill: '#ebe9e3',
    fillOpacity: 0.92,
    border: '#94a3b8',
    borderOpacity: 0.5,
  },
};

function stateName(feature: Feature): string {
  const props = feature.properties as Record<string, string> | null;
  return props?.NAME_1 ?? '';
}

function ensureBoundaryPane(map: L.Map): void {
  if (map.getPane('indiaBoundary')) return;
  const pane = map.createPane('indiaBoundary');
  pane.style.zIndex = '350';
}

/** Paint official Indian boundaries over OSM tiles (fixes J&K / Arunachal rendering). */
export function addIndiaBoundaryToMap(
  map: L.Map,
  geojson: GeoJsonObject,
  theme: MapTheme = 'dark'
): L.LayerGroup {
  ensureBoundaryPane(map);
  const styles = THEME_STYLES[theme];
  const group = L.layerGroup();

  L.geoJSON(geojson, {
    pane: 'indiaBoundary',
    style: (feature) => {
      const name = feature ? stateName(feature as Feature) : '';
      const territorial = TERRITORIAL_STATES.has(name);
      return {
        color: styles.border,
        weight: territorial ? 1.25 : 0.65,
        opacity: styles.borderOpacity,
        fillColor: territorial ? styles.fill : 'transparent',
        fillOpacity: territorial ? styles.fillOpacity : 0,
      };
    },
    interactive: false,
  }).addTo(group);

  group.addTo(map);
  return group;
}

let cachedGeojson: FeatureCollection | null = null;

export async function loadIndiaGeojson(): Promise<FeatureCollection> {
  if (cachedGeojson) return cachedGeojson;
  const res = await fetch(INDIA_GEOJSON_URL);
  if (!res.ok) throw new Error(`India GeoJSON fetch failed: ${res.status}`);
  cachedGeojson = (await res.json()) as FeatureCollection;
  return cachedGeojson;
}
