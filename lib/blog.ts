import { constants } from 'node:fs'
import { lstat, mkdir, open, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { getSiteSettings, isEnabled } from '@/lib/db'
import { publicHttpUrl } from '@/lib/config'
import { DATA_DIR, ensureDataDirectory } from '@/lib/storage'
import type { BlogIndex, BlogPost } from '@/lib/types'

const directory = path.join(DATA_DIR, 'cache')
const filename = path.join(directory, 'wordpress-index.json')
const MAX_BYTES = 3 * 1024 * 1024
const TTL = 10 * 60_000
type Snapshot = { source: string; posts: BlogPost[]; fetchedAt: string; truncated: boolean }
const state = globalThis as typeof globalThis & { hubBlogPending?: Promise<BlogIndex>; hubBlogRetryAt?: number }

export function wordpressSource(): URL | null {
  const raw = process.env.HUB_WORDPRESS_URL || ''
  if (!publicHttpUrl(raw)) return null
  const url = new URL(raw)
  if (url.search || url.hash) return null
  url.pathname = url.pathname.replace(/\/$/, '') + '/'
  return url
}
function text(value: unknown, max: number) {
  if (typeof value !== 'string') return ''
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' }
  return value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, ' ').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (_, entity: string) => {
    if (entity[0] !== '#') return entities[entity.toLowerCase()] || ' '
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ' '
  }).replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}
function normalizePost(value: unknown, source: URL): BlogPost | null {
  if (!value || typeof value !== 'object') return null
  const post = value as Record<string, unknown>
  if (!Number.isSafeInteger(post.id) || Number(post.id) <= 0 || post.status !== 'publish' || typeof post.link !== 'string' || !publicHttpUrl(post.link) || new URL(post.link).origin !== source.origin) return null
  const date = typeof post.date_gmt === 'string' ? new Date(post.date_gmt.replace(/Z$/, '') + 'Z') : new Date(NaN)
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now()) return null
  const title = text((post.title as { rendered?: unknown })?.rendered, 200)
  if (!title) return null
  const embed = post._embedded as { 'wp:term'?: { name?: unknown }[][]; 'wp:featuredmedia'?: { source_url?: unknown }[] } | undefined
  const tags = Array.isArray(embed?.['wp:term']) ? [...new Set(embed['wp:term'].flatMap(group => Array.isArray(group) ? group.map(term => text(term?.name, 60)).filter(Boolean) : []))].slice(0, 24) : []
  const image = embed?.['wp:featuredmedia']?.[0]?.source_url
  return { id: Number(post.id), title, excerpt: text((post.excerpt as { rendered?: unknown })?.rendered, 2000), url: post.link.slice(0, 1000), date: date.toISOString(), imageUrl: typeof image === 'string' && image.length <= 1000 && publicHttpUrl(image) ? image : '', tags }
}
async function readSnapshot(source: URL): Promise<Snapshot | null> {
  try {
    if ((await lstat(directory)).isSymbolicLink()) return null
    const stat = await lstat(filename)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) return null
    const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
    let raw: string
    try { raw = await handle.readFile('utf8') } finally { await handle.close() }
    const data = JSON.parse(raw) as Snapshot
    if (data.source !== source.href || !Array.isArray(data.posts) || data.posts.length > 500 || !Number.isFinite(Date.parse(data.fetchedAt)) || typeof data.truncated !== 'boolean') return null
    if (data.posts.some(post => !post || !Number.isSafeInteger(post.id) || typeof post.title !== 'string' || typeof post.excerpt !== 'string' || typeof post.url !== 'string' || !publicHttpUrl(post.url) || new URL(post.url).origin !== source.origin || typeof post.date !== 'string' || !Number.isFinite(Date.parse(post.date)) || typeof post.imageUrl !== 'string' || (post.imageUrl && !publicHttpUrl(post.imageUrl)) || !Array.isArray(post.tags) || post.tags.some(tag => typeof tag !== 'string'))) return null
    return data
  } catch { return null } // Cache is disposable; corrupt or missing cache never blocks Core.
}
async function saveSnapshot(snapshot: Snapshot) {
  ensureDataDirectory()
  await mkdir(directory, { recursive: true, mode: 0o700 })
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('缓存目录无效')
  const temporary = path.join(directory, randomUUID() + '.tmp')
  try { await writeFile(temporary, JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 }); await rename(temporary, filename) }
  finally { await unlink(temporary).catch(() => undefined) }
}
async function readJson(response: Response) {
  if (!response.ok || !response.body) throw new Error('博客暂不可用')
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('博客响应超出限制')
  const reader = response.body.getReader(), parts: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      size += item.value.byteLength
      if (size > MAX_BYTES) throw new Error('博客响应超出限制')
      parts.push(item.value)
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown
  } finally { await reader.cancel().catch(() => undefined) }
}
export async function loadBlogIndex(force = false): Promise<BlogIndex> {
  const empty = { posts: [], fetchedAt: '', stale: false, truncated: false } as const
  if (!isEnabled('blog') || !getSiteSettings().blogSyncEnabled) return { ...empty, posts: [], status: 'disabled' }
  const source = wordpressSource()
  if (!source) return { ...empty, posts: [], status: 'unconfigured' }
  const cached = await readSnapshot(source)
  const fresh = cached && Date.now() - Date.parse(cached.fetchedAt) < TTL
  if (!force && fresh && !state.hubBlogRetryAt) return { ...cached, status: 'ready', stale: false }
  if (state.hubBlogPending) return state.hubBlogPending
  if (!force && Date.now() < (state.hubBlogRetryAt || 0)) return { ...empty, ...cached, posts: cached?.posts || [], status: 'unavailable', stale: Boolean(cached) }
  const pending = (async (): Promise<BlogIndex> => {
    try {
      const posts = new Map<number, BlogPost>()
      let truncated = false
      const signal = AbortSignal.timeout(5000) // One deadline includes all pages and response bodies.
      for (let page = 1; page <= 5; page++) {
        const url = new URL('wp-json/wp/v2/posts', source)
        url.search = new URLSearchParams({ per_page: '100', page: String(page), status: 'publish', _embed: 'wp:term,wp:featuredmedia', _fields: 'id,status,link,date_gmt,title,excerpt,_links,_embedded' }).toString()
        const response = await fetch(url, { cache: 'no-store', redirect: 'error', signal, headers: { Accept: 'application/json' } })
        const values = await readJson(response)
        if (!Array.isArray(values) || values.length > 100) throw new Error('博客返回格式无效')
        for (const value of values) { const post = normalizePost(value, source); if (post) posts.set(post.id, post) }
        const total = Number(response.headers.get('x-wp-totalpages'))
        if (total > 0 ? page >= total : values.length < 100) break
        if (page === 5) truncated = true
      }
      const snapshot: Snapshot = { source: source.href, posts: [...posts.values()].sort((a, b) => b.date.localeCompare(a.date)), fetchedAt: new Date().toISOString(), truncated }
      await saveSnapshot(snapshot)
      state.hubBlogRetryAt = 0
      return { ...snapshot, status: 'ready', stale: false }
    } catch {
      state.hubBlogRetryAt = Date.now() + 60_000
      return { ...empty, ...cached, posts: cached?.posts || [], status: 'unavailable', stale: Boolean(cached) }
    }
  })()
  state.hubBlogPending = pending
  try { return await pending } finally { state.hubBlogPending = undefined }
}
