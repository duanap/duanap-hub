import type { Metadata } from 'next'
import { HomeBoard } from '@/components/public/HomeBoard'
import { PublicShell } from '@/components/PublicShell'
import { getSiteSettings } from '@/lib/db'
import { pageMetadata, safeJsonLd } from '@/lib/seo'
import { SITE_BASE } from '@/lib/config'

export function generateMetadata(): Metadata {
  const site = getSiteSettings()
  return pageMetadata(site.seoTitle, site.seoDescription, '/')
}
export default function HomePage() {
  const site = getSiteSettings()
  const jsonLd = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', name: site.siteName, url: SITE_BASE, inLanguage: 'zh-CN' },
    { '@type': 'Person', name: site.displayName, url: SITE_BASE, description: site.tagline,
      image: site.avatarUrl ? new URL(site.avatarUrl, SITE_BASE).href : undefined,
      sameAs: [site.githubUrl, ...site.socialLinks.map(link => link.url)].filter(Boolean) },
  ] }
  return <PublicShell wide>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
    <HomeBoard />
  </PublicShell>
}
