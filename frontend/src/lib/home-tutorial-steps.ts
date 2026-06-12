import type { LogisticsMode } from '@/lib/mode-meta';

export type HomeTutorialVisual =
  | 'welcome'
  | 'hero-cta'
  | 'ai-brief'
  | 'three-lenses'
  | 'mode-picker'
  | 'results';

export type HomeTutorialStep = {
  id: string;
  title: string;
  body: string;
  tip?: string;
  visual: HomeTutorialVisual;
  /** Scroll + spotlight this home section while on this step */
  highlightId?: string;
  accent?: LogisticsMode | 'home';
};

export const HOME_TUTORIAL_STEPS: HomeTutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to LogiFlow',
    body: 'LogiFlow helps you plan freight across India — compare rail, road, air, water, hybrid chains, or all four modes at once.',
    tip: 'Use this guide any time from the ? button.',
    visual: 'welcome',
    accent: 'home',
  },
  {
    id: 'hero-cta',
    title: 'Start with a quick action',
    body: 'Not sure where to begin? Jump straight into Hybrid for chained routes, or Comparator to run every single mode on the same corridor.',
    visual: 'hero-cta',
    highlightId: 'home-hero-cta',
    accent: 'hybrid',
  },
  {
    id: 'ai-brief',
    title: 'Describe your shipment',
    body: 'Type a plain-English brief — origin, destination, cargo, priority. LogiFlow parses it and suggests the best tool.',
    tip: 'Type in the parser on the right — e.g. “80kg medicines Delhi to Chennai, max ₹12,000, prefer train.”',
    visual: 'ai-brief',
    highlightId: 'home-ai-brief',
    accent: 'hybrid',
  },
  {
    id: 'three-lenses',
    title: 'Every route through three lenses',
    body: 'On the left: cost, time, and risk lenses plus the brief → decide flow. LogiFlow ranks every corridor on all three — not just one number.',
    visual: 'three-lenses',
    highlightId: 'home-logiflow-way',
    accent: 'comparator',
  },
  {
    id: 'mode-picker',
    title: 'Or pick a tool directly',
    body: 'Six specialized pipelines when you already know the mode — Railways, Roadways, Airways, Waterways, Hybrid, or Comparator.',
    visual: 'mode-picker',
    highlightId: 'home-mode-picker',
    accent: 'rail',
  },
  {
    id: 'results',
    title: 'Confirm, optimize, decide',
    body: 'After you confirm the corridor, the tool runs optimization. You get ranked routes, maps, AI notes, and can save a report to your planner.',
    visual: 'results',
    accent: 'road',
  },
];
