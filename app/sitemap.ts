import type { MetadataRoute } from 'next'
import { SITE_BASE } from '@/lib/config'
import { getSiteSettings, isEnabled } from '@/lib/db'
import { getPublicAlbums, getPublicLinks, getPublicNotes } from '@/lib/public-content'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export default function sitemap():MetadataRoute.Sitemap{
  if(!getSiteSettings().seoIndexable)return []
  const data:MetadataRoute.Sitemap=[{url:SITE_BASE}]
  if(isEnabled('about'))data.push({url:new URL('/about',SITE_BASE).href})
  if(isEnabled('photos')&&getPublicAlbums().length)data.push({url:new URL('/photos',SITE_BASE).href})
  if(isEnabled('notes')&&getPublicNotes().length)data.push({url:new URL('/notes',SITE_BASE).href})
  if(isEnabled('links')&&getPublicLinks().length)data.push({url:new URL('/links',SITE_BASE).href})
  return data
}
