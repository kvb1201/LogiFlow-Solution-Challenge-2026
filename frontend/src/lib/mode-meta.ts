export type LogisticsMode = 'rail' | 'road' | 'air' | 'water' | 'hybrid' | 'comparator';

export const modeMeta: Record<
  LogisticsMode,
  { label: string; accent: string; tag: string; href: string }
> = {
  hybrid: {
    label: 'Hybrid',
    accent: 'var(--hybrid)',
    tag: 'Multimodal · chained legs',
    href: '/hybrid',
  },
  rail: {
    label: 'Railways',
    accent: 'var(--rail)',
    tag: 'Parcel vans · live tracking',
    href: '/railway',
  },
  road: {
    label: 'Roadways',
    accent: 'var(--road)',
    tag: 'Traffic-aware · tolls · ML risk',
    href: '/road',
  },
  air: {
    label: 'Airways',
    accent: 'var(--air)',
    tag: 'Express cargo · cut-offs',
    href: '/air',
  },
  water: {
    label: 'Waterways',
    accent: 'var(--water)',
    tag: 'Port-to-port · transshipment',
    href: '/water',
  },
  comparator: {
    label: 'Comparator',
    accent: 'var(--comparator)',
    tag: 'Compare all single modes',
    href: '/comparator',
  },
};

export const modeOrder: LogisticsMode[] = ['hybrid', 'comparator', 'rail', 'road', 'air', 'water'];

/** Active pipeline from the current route, or null on home / non-pipeline pages. */
export function modeFromPathname(pathname: string | null): LogisticsMode | null {
  if (!pathname) return null;
  for (const mode of modeOrder) {
    const href = modeMeta[mode].href;
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      return mode;
    }
  }
  return null;
}
