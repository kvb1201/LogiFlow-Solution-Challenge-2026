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

// Exclude the comparator mode from this generic mapping (it has its own page meta)
export const pipelinePageMeta: Record<Exclude<LogisticsMode, 'comparator'>, PipelinePageConfig> = {
  rail: {
    badge: 'Railway Cargo Intelligence · RailRadar Powered',
    titleLead: 'Rail',
    titleRest: ' operations',
    description:
      'AI-powered cargo routing across Indian Railways with real schedule data, live tracking and ML delay prediction.',
    pills: [
      { icon: 'train', label: 'Live Schedule Data' },
      { icon: 'radar', label: 'RailRadar Tracking' },
      { icon: 'psychology', label: 'ML Predictions' },
      { icon: 'route', label: 'Optimal Routing' },
    ],
    footer: 'Powered by RailRadar API · Real Indian Railways Data',
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
    badge: 'Maritime Cargo · Port routing',
    titleLead: 'Water',
    titleRest: ' operations',
    description:
      'Port-to-port maritime routes with transshipment options, cost, and reliability scoring.',
    pills: [
      { icon: 'directions_boat', label: 'Indian ports' },
      { icon: 'swap_horiz', label: 'Transshipment' },
      { icon: 'shield', label: 'Maritime risk' },
      { icon: 'anchor', label: 'Route compare' },
    ],
    footer: 'Static port dataset · not live AIS',
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
