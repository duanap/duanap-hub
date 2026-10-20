import { getSiteSettings, isEnabled, recentPublicEntries } from '@/lib/db'
import { SITE_BASE } from '@/lib/config'
import { listPersonalNotes } from '@/lib/managed-content'
export const runtime='nodejs'
export const dynamic='force-dynamic'
function xml(s:string){return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;')}
export async function GET(){
  const site=getSiteSettings()
  const entries=isEnabled('projects')?recentPublicEntries(30):[]
  const projectItems=entries.map(e=>{
    const url=new URL(`/projects/${e.projectSlug}#update-${e.id}`,SITE_BASE).href
    return { title:e.title,body:e.body,date:e.publishedAt||'',url,guid:'hub-entry-'+e.id }
  })
  const noteItems=isEnabled('notes')?listPersonalNotes(true).map(note=>({title:note.title,body:note.body,date:note.publishedAt,url:new URL('/notes#note-'+note.id,SITE_BASE).href,guid:'hub-note-'+note.id})):[]
  const items=[...projectItems,...noteItems].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30).map(item=>`<item><title>${xml(item.title)}</title><link>${xml(item.url)}</link><guid isPermaLink="false">${xml(item.guid)}</guid><description>${xml(item.body.slice(0,300))}</description>${item.date?`<pubDate>${new Date(item.date).toUTCString()}</pubDate>`:''}</item>`).join('')
  const result=`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(site.siteName)} · 随记与项目动态</title><link>${xml(SITE_BASE)}</link><description>${xml(site.seoDescription)}</description><language>zh-cn</language>${items}</channel></rss>`
  return new Response(result,{headers:{'content-type':'application/rss+xml; charset=utf-8','cache-control':'no-store'}})
}
