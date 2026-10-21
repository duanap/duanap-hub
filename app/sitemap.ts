import type { MetadataRoute } from 'next'
import { SITE_BASE } from '@/lib/config'
import { getSiteSettings, isEnabled, listProjects } from '@/lib/db'
import { publicTools } from '@/lib/tool-settings'
import { getPublicAlbums, getPublicLinks, getPublicNotes } from '@/lib/public-content'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export default function sitemap():MetadataRoute.Sitemap{
  if(!getSiteSettings().seoIndexable)return []
  const data:MetadataRoute.Sitemap=[{url:SITE_BASE}]
  if(isEnabled('about'))data.push({url:new URL('/about',SITE_BASE).href})
  if(isEnabled('projects')){
    data.push({url:new URL('/projects',SITE_BASE).href})
    for(const p of listProjects({publishedOnly:true})) data.push({url:new URL(`/projects/${p.slug}`,SITE_BASE).href})
  }
  if(isEnabled('games')&&isEnabled('projects'))data.push({url:new URL('/games',SITE_BASE).href})
  if(isEnabled('tools')){data.push({url:new URL('/tools',SITE_BASE).href}); for (const tool of publicTools()) data.push({url:new URL(tool.path,SITE_BASE).href})}
  if(isEnabled('photos')&&getPublicAlbums().length)data.push({url:new URL('/photos',SITE_BASE).href})
  if(isEnabled('notes')&&getPublicNotes().length)data.push({url:new URL('/notes',SITE_BASE).href})
  if(isEnabled('links')&&getPublicLinks().length)data.push({url:new URL('/links',SITE_BASE).href})
  return data
}
