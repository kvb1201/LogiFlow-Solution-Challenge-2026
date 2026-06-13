import type { MetadataRoute } from 'next';
import { SITE_URL, SITEMAP_PATHS } from '@/lib/seo';

/** Generated at build time — no runtime or client bundle cost. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return SITEMAP_PATHS.map((path) => ({
    url: `${SITE_URL}${path === '/' ? '' : path}`,
    lastModified: now,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : path === '/hybrid' ? 0.9 : 0.8,
  }));
}
