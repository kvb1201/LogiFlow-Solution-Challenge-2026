import type { Metadata } from 'next';
import type { LogisticsMode } from './mode-meta';
import { modeMeta } from './mode-meta';

/** Canonical public site URL — set in Vercel for custom domain (e.g. https://logiflow.in). */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  process.env.VERCEL_URL?.trim() ||
  'https://logi-flow-solution-challenge-2026.vercel.app'
).replace(/\/$/, '');

export const SITE_NAME = 'LogiFlow';

/** GA4 measurement ID — GCP-linked property (LogiFlow Production web stream). */
export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || 'G-S710XF91X1';

const DEFAULT_DESCRIPTION =
  'Compare rail, road, air, water, and hybrid freight routes across India with live data, AI-assisted planning, and explainable recommendations.';

const PIPELINE_SEO: Record<
  LogisticsMode,
  { title: string; description: string; keywords: string[] }
> = {
  hybrid: {
    title: 'Hybrid Multimodal Routes',
    description:
      'Chain rail, road, and air through hub cities. Village feeder access, changeover scoring, and ranked multimodal itineraries for Indian freight.',
    keywords: ['multimodal logistics', 'hybrid freight India', 'intermodal shipping'],
  },
  comparator: {
    title: 'Mode Comparator',
    description:
      'Compare road, rail, air, and water on cost, time, and risk in one view. Pareto-ranked options for Indian cargo corridors.',
    keywords: ['freight comparator', 'logistics comparison India', 'transport mode compare'],
  },
  rail: {
    title: 'Rail Freight Optimizer',
    description:
      'Indian Railways parcel and freight routing with live train data, delay ML, tariff estimates, and station-to-station itineraries.',
    keywords: ['Indian Railways freight', 'rail cargo India', 'train logistics'],
  },
  road: {
    title: 'Road Freight Optimizer',
    description:
      'Traffic-aware road routing with tolls, ML delay risk, and cost estimates for Indian truck freight corridors.',
    keywords: ['road freight India', 'truck routing', 'logistics tolls'],
  },
  air: {
    title: 'Air Cargo Optimizer',
    description:
      'Express air cargo routing across Indian airports with OTP congestion scoring, cut-offs, and freight cost estimates.',
    keywords: ['air cargo India', 'air freight optimizer', 'airport logistics'],
  },
  water: {
    title: 'Waterway Freight Optimizer',
    description:
      'Port-to-port maritime routing with transshipment, PortWatch data, and ML delay estimates for Indian coastal freight.',
    keywords: ['maritime freight India', 'port logistics', 'waterway cargo'],
  },
};

/** Build-time / server-only metadata — zero extra client JavaScript. */
export function buildPageMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path = '',
  keywords = [],
  noIndex = false,
}: {
  title?: string;
  description?: string;
  path?: string;
  keywords?: string[];
  noIndex?: boolean;
}): Metadata {
  const canonical = path ? `${SITE_URL}${path}` : SITE_URL;
  const fullTitle = title ? `${title} — ${SITE_NAME}` : `${SITE_NAME} — Multimodal Logistics`;

  return {
    title: fullTitle,
    description,
    keywords: keywords.length ? keywords : undefined,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      type: 'website',
      locale: 'en_IN',
      url: canonical,
      siteName: SITE_NAME,
      title: fullTitle,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
    },
  };
}

export function pipelinePageMetadata(mode: LogisticsMode): Metadata {
  const { title, description, keywords } = PIPELINE_SEO[mode];
  return buildPageMetadata({
    title,
    description,
    path: modeMeta[mode].href,
    keywords,
  });
}

export const rootMetadata: Metadata = {
  ...buildPageMetadata({}),
  title: {
    default: `${SITE_NAME} — Multimodal Logistics`,
    template: `%s — ${SITE_NAME}`,
  },
};

/** Public routes included in sitemap — auth/private routes excluded. */
export const SITEMAP_PATHS = [
  '/',
  '/hybrid',
  '/comparator',
  '/railway',
  '/road',
  '/air',
  '/water',
  '/landing',
  '/privacy',
  '/terms',
] as const;
