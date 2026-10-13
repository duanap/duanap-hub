import { getSiteSettings, isEnabled, recentPublicEntries } from '@/lib/db'
import { SITE_BASE } from '@/lib/config'
export const runtime='nodejs'
export const dynamic='force-dynamic'
function xml(s:string){return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;')}
export async function GET(){
  const site=getSiteSettings()
  const entries=isEnabled('projects')?recentPublicEntries(30):[]
  const items=entries.map(e=>{
    const url=new URL(`/projects/${e.projectSlug}#update-${e.id}`,SITE_BASE).href
    return `<item><title>${xml(e.title)}</title><link>${xml(url)}</link><guid isPermaLink="false">hub-entry-${e.id}</guid><description>${xml(e.body.slice(0,300))}</description>${e.publishedAt?`<pubDate>${new Date(e.publishedAt).toUTCString()}</pubDate>`:''}</item>`
  }).join('')
  const result=`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(site.siteName)} · 项目动态</title><link>${xml(SITE_BASE)}</link><description>${xml(site.seoDescription)}</description><language>zh-cn</language>${items}</channel></rss>`
  return new Response(result,{headers:{'content-type':'application/rss+xml; charset=utf-8','cache-control':'no-store'}})
}
