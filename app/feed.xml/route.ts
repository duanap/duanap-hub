import { getSiteSettings, isEnabled, recentPublicEntries } from '@/lib/db'
import { SITE_BASE } from '@/lib/config'
import { after } from 'next/server'
import { contentSnapshot,getContentSettings,refreshContent } from '@/lib/content'
import { contentPosts } from '@/lib/content-types'
export const runtime='nodejs'
export const dynamic='force-dynamic'
function xml(s:string){return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;')}
export async function GET(){
  const site=getSiteSettings()
  const entries=isEnabled('projects')?recentPublicEntries(30):[]
  const items=entries.map(e=>{
    const url=new URL(`/projects/${e.projectSlug}#update-${e.id}`,SITE_BASE).href
    return {date:e.publishedAt||'',xml:`<item><title>${xml(e.title)}</title><link>${xml(url)}</link><guid isPermaLink="false">hub-entry-${e.id}</guid><description>${xml(e.body.slice(0,300))}</description>${e.publishedAt?`<pubDate>${new Date(e.publishedAt).toUTCString()}</pubDate>`:''}</item>`}
  })
  if(isEnabled('content')){
    const snapshot=contentSnapshot()
    for(const post of contentPosts(snapshot,getContentSettings(),30))items.push({date:post.publishedAt,xml:`<item><title>${xml(post.title)}</title><link>${xml(post.url)}</link><guid isPermaLink="false">${xml(snapshot.source+'post-'+post.id)}</guid><description>${xml(post.summary)}</description><pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate></item>`})
    after(async()=>{try{await refreshContent()}catch{/* A feed response never waits for the blog. */}})
  }
  const body=items.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,40).map(item=>item.xml).join('')
  const result=`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(site.siteName)} · 站点动态</title><link>${xml(SITE_BASE)}</link><description>${xml(site.seoDescription)}</description><language>zh-cn</language><ttl>15</ttl>${body}</channel></rss>`
  return new Response(result,{headers:{'content-type':'application/rss+xml; charset=utf-8','cache-control':'no-store'}})
}
