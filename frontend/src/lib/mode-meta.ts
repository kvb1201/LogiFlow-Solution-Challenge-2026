export type LogisticsMode = 'rail' | 'road' | 'air' | 'water' | 'hybrid';

export const modeMeta: Record<
  LogisticsMode,
  { label: string; accent: string; tag: string; href: string }
> = {
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
  hybrid: {
    label: 'Hybrid',
    accent: 'var(--hybrid)',
    tag: 'AI planning · all modes',
    href: '/hybrid',
  },
};

export const modeOrder: LogisticsMode[] = ['hybrid', 'rail', 'road', 'air', 'water'];
