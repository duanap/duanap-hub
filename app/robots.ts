import type { MetadataRoute } from 'next'
import { SITE_BASE } from '@/lib/config'
import { getSiteSettings } from '@/lib/db'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export default function robots():MetadataRoute.Robots{
  return {rules:[{userAgent:'*',allow:'/',disallow:['/duanap','/api/','/account','/login','/oauth','/go/']}],sitemap:getSiteSettings().seoIndexable ? new URL('/sitemap.xml',SITE_BASE).href : undefined}
}
