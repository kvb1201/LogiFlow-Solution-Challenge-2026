import type { LogisticsMode } from '@/lib/mode-meta';

export type PipelinePageConfig = {
  badge: string;
  titleLead: string;
  titleRest: string;
  description: string;
  highlight?: { text: string; className: string }[];
  pills: { icon: string; label: string }[];
  footer?: string;
  analyticsLabel: string;
  loadingMessage: string;
  storeMode: 'rail' | 'road' | 'air' | 'water';
};

// Exclude comparator & hybrid — they have dedicated page clients
export const pipelinePageMeta: Record<
  Exclude<LogisticsMode, 'comparator' | 'hybrid'>,
  PipelinePageConfig
> = {
  rail: {
    badge: 'LogiFlow Railway Intelligence',
    titleLead: 'Rail',
    titleRest: ' operations',
    description:
      'LogiFlow-optimized cargo routing across Indian Railways — schedule discovery, scenario simulation, and ML delay prediction tuned by our team.',
    pills: [
      { icon: 'train', label: 'Indian Railways schedule' },
      { icon: 'verified', label: 'LogiFlow optimized' },
      { icon: 'psychology', label: 'ML delay model' },
      { icon: 'route', label: 'Multi-route ranking' },
    ],
    footer: 'Optimized by the LogiFlow team · Real Indian Railways data',
    analyticsLabel: 'Rail analytics panel',
    loadingMessage: 'Finding routes…',
    storeMode: 'rail',
  },
  road: {
    badge: 'Road Logistics · Traffic-aware routing',
    titleLead: 'Road',
    titleRest: ' operations',
    description:
      'Compare highway corridors with traffic, tolls, and ML risk scoring — built for Indian freight lanes.',
    pills: [
      { icon: 'local_shipping', label: 'Traffic-aware' },
      { icon: 'toll', label: 'Toll & cost' },
      { icon: 'shield', label: 'Risk scoring' },
      { icon: 'route', label: 'Multi-path compare' },
    ],
    footer: 'LogiFlow road optimization · OSRM-backed routing',
    analyticsLabel: 'Road analytics panel',
    loadingMessage: 'Calculating road paths…',
    storeMode: 'road',
  },
  air: {
    badge: 'Air Cargo · Airport pair routing',
    titleLead: 'Air',
    titleRest: ' operations',
    description:
      'Rank direct and connecting airport pairs with cargo rules, cut-offs, and confidence scoring.',
    pills: [
      { icon: 'flight_takeoff', label: 'Airport pairs' },
      { icon: 'schedule', label: 'Cut-off aware' },
      { icon: 'shield', label: 'Risk & rules' },
      { icon: 'payments', label: 'Cost breakdown' },
    ],
    footer: 'LogiFlow air cargo pipeline',
    analyticsLabel: 'Air analytics panel',
    loadingMessage: 'Optimizing air corridors…',
    storeMode: 'air',
  },
  water: {
    badge: 'Maritime Cargo · Global port routing',
    titleLead: 'Water',
    titleRest: ' operations',
    description:
      'Route port-to-port cargo across India, Middle East, Southeast Asia, East Asia, and Europe with transshipment, cost, and reliability scoring.',
    pills: [
      { icon: 'public', label: '28 global ports' },
      { icon: 'swap_horiz', label: 'Transshipment' },
      { icon: 'shield', label: 'Maritime risk' },
      { icon: 'anchor', label: 'Route compare' },
    ],
    footer: 'Global static port network · not live AIS',
    analyticsLabel: 'Water analytics panel',
    loadingMessage: 'Charting maritime routes…',
    storeMode: 'water',
  },
};

// Comparator page meta (formerly hybrid)
export const comparatorPageMeta = {
  badge: 'Comparator · AI multimodal planner',
  titleLead: 'Comparator',
  titleRest: ' compare',
  description:
    'One scenario across road, rail, air, and water — Gemini parses constraints before scoring all four modes.',
  pills: [
    { icon: 'hub', label: '4-mode scoring' },
    { icon: 'psychology', label: 'Gemini constraints' },
    { icon: 'compare_arrows', label: 'Normalized rank' },
    { icon: 'verified', label: 'Explainable pick' },
  ],
  footer: 'LogiFlow comparator decision engine',
};
