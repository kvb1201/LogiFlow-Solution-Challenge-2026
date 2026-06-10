/** Default maritime metrics — overridden at runtime when port catalog loads. */
export const WATER_METRICS_DEFAULT = {
  ports: 28,
  routable: 28,
  regions: 5,
  tradeLanes: '12+',
} as const;

export const WATER_CAPABILITY_BADGES = [
  { icon: 'public', label: 'Global ports' },
  { icon: 'swap_horiz', label: 'Transshipment' },
  { icon: 'shield', label: 'Maritime risk' },
  { icon: 'anchor', label: 'Route compare' },
  { icon: 'waves', label: 'Congestion index' },
  { icon: 'route', label: 'Multi-leg paths' },
] as const;

export function waterHeroMetrics(catalog?: {
  total?: number;
  routable?: number;
  regions?: number;
}) {
  const total = catalog?.total || WATER_METRICS_DEFAULT.ports;
  const routable = catalog?.routable || WATER_METRICS_DEFAULT.routable;
  const regions = catalog?.regions || WATER_METRICS_DEFAULT.regions;
  return [
    { value: String(total), label: 'Global Ports' },
    { value: String(routable), label: 'Routable' },
    { value: String(regions), label: 'Trade Regions' },
  ] as const;
}
