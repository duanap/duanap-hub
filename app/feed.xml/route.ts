import { after } from 'next/server'
import { getSiteSettings, isEnabled, recentPublicEntries } from '@/lib/db'
import { SITE_BASE } from '@/lib/config'
import { listPersonalNotes } from '@/lib/managed-content'
import { contentSnapshot, getContentSettings, refreshContent } from '@/lib/content'
import { contentPosts } from '@/lib/content-types'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
function xml(value: string) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;') }
export async function GET() {
  const site = getSiteSettings()
  const items = (isEnabled('projects') ? recentPublicEntries(30) : []).map(entry => ({ title: entry.title, body: entry.body, date: entry.publishedAt || '', url: new URL('/projects/' + entry.projectSlug + '#update-' + entry.id, SITE_BASE).href, guid: 'hub-entry-' + entry.id }))
  if (isEnabled('notes')) items.push(...listPersonalNotes(true).map(note => ({ title: note.title, body: note.body, date: note.publishedAt, url: new URL('/notes#note-' + note.id, SITE_BASE).href, guid: 'hub-note-' + note.id })))
  if (isEnabled('content')) {
    const snapshot = contentSnapshot()
    items.push(...contentPosts(snapshot, getContentSettings(), 30).map(post => ({ title: post.title, body: post.summary, date: post.publishedAt, url: post.url, guid: snapshot.source + 'post-' + post.id })))
    after(async () => { try { await refreshContent() } catch { /* The response never waits for external services. */ } })
  }
  const body = items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40).map(item => '<item><title>' + xml(item.title) + '</title><link>' + xml(item.url) + '</link><guid isPermaLink="false">' + xml(item.guid) + '</guid><description>' + xml(item.body.slice(0, 400)) + '</description>' + (item.date ? '<pubDate>' + new Date(item.date).toUTCString() + '</pubDate>' : '') + '</item>').join('')
  const result = '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>' + xml(site.siteName) + ' · 站点动态</title><link>' + xml(SITE_BASE) + '</link><description>' + xml(site.seoDescription) + '</description><language>zh-cn</language><ttl>15</ttl>' + body + '</channel></rss>'
  return new Response(result, { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'no-store' } })
}
