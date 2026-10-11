import type { MetadataRoute } from 'next'
import { SITE_BASE } from '@/lib/config'
import { getSiteSettings } from '@/lib/db'
export const dynamic = 'force-dynamic'
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: getSiteSettings().seoIndexable ? '/' : undefined,
        disallow: getSiteSettings().seoIndexable ? ['/duanap', '/api/', '/account', '/go/'] : '/',
      },
    ],
    sitemap: new URL('/sitemap.xml', SITE_BASE).href,
  }
}
