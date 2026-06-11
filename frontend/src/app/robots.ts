import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/** Generated at build time — no runtime or client bundle cost. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/dashboard/', '/reports/', '/login/', '/waiting/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
