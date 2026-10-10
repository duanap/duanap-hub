import type { MetadataRoute } from 'next'
import { SITE_BASE } from '@/lib/config'
export default function robots():MetadataRoute.Robots{
  return {rules:[{userAgent:'*',allow:'/',disallow:['/duanap','/api/','/account','/go/']}],sitemap:new URL('/sitemap.xml',SITE_BASE).href}
}
