import { getDatabase } from '@/lib/db'
import type { Album, AlbumImage, ContentKind, FriendLink, ManagedContent, PersonalNote } from '@/lib/types'

const tables = { albums: 'albums', notes: 'notes', links: 'friend_links' } as const
const fields = {
  albums: ['title', 'summary', 'coverUrl', 'images', 'published', 'sortOrder'],
  notes: ['title', 'body', 'imageUrl', 'publishedAt', 'published', 'sortOrder'],
  links: ['title', 'url', 'summary', 'groupName', 'iconUrl', 'published', 'sortOrder'],
} as const
const columns: Record<string, string> = { coverUrl: 'cover_url', imageUrl: 'image_url', publishedAt: 'published_at', groupName: 'group_name', iconUrl: 'icon_url', sortOrder: 'sort_order' }
type Row = { id: number; title: string; published: number; sort_order: number; created_at: string; updated_at: string; summary: string; cover_url: string; images: string; body: string; image_url: string; published_at: string; url: string; group_name: string; icon_url: string }

export function contentKind(value: string): ContentKind {
  if (!Object.hasOwn(tables, value)) throw new Error('未知内容类型')
  return value as ContentKind
}
export function contentId(value: string) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('内容 ID 无效')
  return id
}
function toContent<K extends ContentKind>(kind: K, row: Row): ManagedContent[K] {
  const common = { id: row.id, title: row.title, published: !!row.published, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at }
  if (kind === 'albums') return { ...common, summary: row.summary, coverUrl: row.cover_url, images: JSON.parse(row.images) as AlbumImage[] } as ManagedContent[K]
  if (kind === 'notes') return { ...common, body: row.body, imageUrl: row.image_url, publishedAt: row.published_at } as ManagedContent[K]
  return { ...common, url: row.url, summary: row.summary, groupName: row.group_name, iconUrl: row.icon_url } as ManagedContent[K]
}
export function listContent<K extends ContentKind>(kind: K, publicOnly = false): ManagedContent[K][] {
  const where = publicOnly ? "WHERE published=1" + (kind === 'notes' ? " AND published_at<>'' AND published_at<=?" : '') : ''
  const args = publicOnly && kind === 'notes' ? [new Date().toISOString()] : []
  const order = kind === 'notes' ? 'sort_order ASC, published_at DESC, id DESC' : 'sort_order ASC, id DESC'
  const rows = getDatabase().prepare(`SELECT * FROM ${tables[kind]} ${where} ORDER BY ${order} LIMIT 1000`).all(...args) as Row[]
  return rows.map(row => toContent(kind, row))
}
function getContent<K extends ContentKind>(kind: K, id: number) {
  const row = getDatabase().prepare(`SELECT * FROM ${tables[kind]} WHERE id=?`).get(id) as Row | undefined
  if (!row) throw new Error('内容不存在')
  return toContent(kind, row)
}
export function safeContentUrl(value: string, media = false) {
  if (!value) return true
  if (/[\\\x00-\x20]/.test(value)) return false
  if (media && /^\/media\/[a-f0-9-]{36}\.webp$/.test(value)) return true
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password } catch { return false }
}
function validate(kind: ContentKind, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('无效的内容数据')
  const result: Record<string, string | number | boolean | AlbumImage[]> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (!(fields[kind] as readonly string[]).includes(key)) throw new Error('不支持的内容字段：' + key)
    if (key === 'published') { if (typeof raw !== 'boolean') throw new Error('发布状态无效'); result[key] = raw; continue }
    if (key === 'sortOrder') { if (typeof raw !== 'number' || !Number.isInteger(raw) || Math.abs(raw) > 1_000_000) throw new Error('排序须为 -1000000 到 1000000 的整数'); result[key] = raw; continue }
    if (key === 'images') {
      if (!Array.isArray(raw) || raw.length > 48) throw new Error('每个相册最多 48 张图片')
      const urls = new Set<string>()
      result[key] = raw.map(image => {
        if (!image || typeof image !== 'object' || Array.isArray(image) || Object.keys(image).some(key => !['url', 'caption'].includes(key)) || typeof image.url !== 'string' || !image.url.trim() || image.url.length > 500 || !safeContentUrl(image.url.trim(), true) || typeof image.caption !== 'string' || image.caption.length > 300) throw new Error('图片地址或说明无效')
        if (urls.has(image.url.trim())) throw new Error('同一相册不能重复添加图片')
        urls.add(image.url.trim())
        return { url: image.url.trim(), caption: image.caption.trim() }
      })
      continue
    }
    const max = key === 'body' ? 50_000 : key === 'title' ? 120 : key === 'groupName' ? 60 : 500
    if (typeof raw !== 'string' || raw.length > max) throw new Error(key + ' 类型或长度无效')
    const text = raw.trim()
    if (['url', 'coverUrl', 'iconUrl', 'imageUrl'].includes(key) && !safeContentUrl(text, key !== 'url')) throw new Error('请使用有效 HTTP(S) 地址或已上传图片')
    if (key === 'publishedAt' && text && (Number.isNaN(Date.parse(text)) || new Date(text).toISOString() !== text)) throw new Error('发布时间须为有效 ISO 日期')
    result[key] = text
  }
  return result
}
function checked<K extends ContentKind>(kind: K, patch: ReturnType<typeof validate>, old?: ManagedContent[K]) {
  const defaults = { title: '', summary: '', coverUrl: '', images: [], body: '', imageUrl: '', publishedAt: '', url: '', groupName: '', iconUrl: '', sortOrder: 0, published: false }
  const merged = { ...defaults, ...old, ...patch }
  if (kind !== 'notes' && !merged.title) throw new Error('请填写标题')
  if (kind === 'albums' && merged.published && !(merged.images as AlbumImage[]).length) throw new Error('公开相册至少需要一张照片，封面单独设置')
  if (kind === 'notes') {
    if (merged.published && !merged.body) throw new Error('请填写文案正文')
    if (!merged.body && !merged.title) throw new Error('请填写文案正文或草稿标题')
    if (merged.published && !merged.publishedAt) merged.publishedAt = new Date().toISOString()
  }
  if (kind === 'links' && merged.published && !merged.url) throw new Error('公开友链需要地址')
  return Object.fromEntries(fields[kind].map(key => [key, merged[key]]))
}
function values(data: ReturnType<typeof checked>) {
  return Object.entries(data).map(([key, value]) => [columns[key] || key, key === 'images' ? JSON.stringify(value) : typeof value === 'boolean' ? Number(value) : value] as const)
}
export function createContent<K extends ContentKind>(kind: K, payload: unknown): ManagedContent[K] {
  const db = getDatabase()
  const data = values(checked(kind, validate(kind, payload)))
  if ((db.prepare(`SELECT COUNT(*) AS count FROM ${tables[kind]}`).get() as { count: number }).count >= 1000) throw new Error('每类内容最多保存 1000 条，请先整理归档')
  const now = new Date().toISOString()
  const result = db.prepare(`INSERT INTO ${tables[kind]} (${data.map(([key]) => key).join(',')},created_at,updated_at) VALUES (${data.map(() => '?').join(',')},?,?)`).run(...data.map(([, value]) => value), now, now)
  return getContent(kind, Number(result.lastInsertRowid))
}
export function updateContent<K extends ContentKind>(kind: K, id: number, payload: unknown): ManagedContent[K] {
  const old = getContent(kind, id)
  const data = values(checked(kind, validate(kind, payload), old))
  getDatabase().prepare(`UPDATE ${tables[kind]} SET ${data.map(([key]) => key + '=?').join(',')},updated_at=? WHERE id=?`).run(...data.map(([, value]) => value), new Date().toISOString(), id)
  return getContent(kind, id)
}
export function deleteContent(kind: ContentKind, id: number) {
  getContent(kind, id)
  getDatabase().prepare(`DELETE FROM ${tables[kind]} WHERE id=?`).run(id)
}
export const listAlbums = (publicOnly = false): Album[] => listContent('albums', publicOnly)
export const listPersonalNotes = (publicOnly = false): PersonalNote[] => listContent('notes', publicOnly)
export const listFriendLinks = (publicOnly = false): FriendLink[] => listContent('links', publicOnly)
