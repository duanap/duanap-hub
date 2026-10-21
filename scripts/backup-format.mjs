import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import Database from 'better-sqlite3'
import { CONTENT_SCHEMA_VERSION, CONTENT_TABLE_SHAPES } from './content-schema.mjs'
import { mediaName, mediaLimit, audioExtension } from './media-policy.mjs'

export const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024
export { mediaName }
const digest = data => createHash('sha256').update(data).digest('hex')
function bytes(value, expected) {
  if (typeof value !== 'string' || value.length > MAX_ARCHIVE_BYTES || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('备份编码无效')
  const data = Buffer.from(value, 'base64')
  if (!data.length || data.toString('base64') !== value || digest(data) !== expected) throw new Error('备份校验失败')
  return data
}
export function validateDatabase(data) {
  if (!Buffer.isBuffer(data) || data.subarray(0, 16).toString() !== 'SQLite format 3\0') throw new Error('SQLite 备份无效')
  const db = new Database(data, { readonly: true })
  try {
    if (db.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('数据库完整性检查失败')
    const version = Number(db.pragma('user_version', { simple: true }))
    if (version > CONTENT_SCHEMA_VERSION) throw new Error('备份来自更高版本，不能使用旧应用恢复')
    const schema = {
      site_settings: { pk: 'id', columns: { id: 'INTEGER', json: 'TEXT' } },
      module_settings: { pk: 'id', columns: { id: 'TEXT', enabled: 'INTEGER', sort_order: 'INTEGER', updated_at: 'TEXT' } },
      projects: { pk: 'id', columns: { id: 'INTEGER', slug: 'TEXT', title: 'TEXT', summary: 'TEXT', body: 'TEXT', category: 'TEXT', status: 'TEXT', version: 'TEXT', external_url: 'TEXT', repository_url: 'TEXT', cover_url: 'TEXT', featured: 'INTEGER', published: 'INTEGER', seo_title: 'TEXT', seo_description: 'TEXT', created_at: 'TEXT', updated_at: 'TEXT' } },
      project_entries: { pk: 'id', columns: { id: 'INTEGER', project_id: 'INTEGER', type: 'TEXT', title: 'TEXT', body: 'TEXT', published: 'INTEGER', published_at: 'TEXT', created_at: 'TEXT', updated_at: 'TEXT' } },
      admin_sessions: { pk: 'token_hash', columns: { token_hash: 'TEXT', expires_at: 'INTEGER' } },
      admin_login_attempts: { pk: 'key', columns: { key: 'TEXT', count: 'INTEGER', reset_at: 'INTEGER' } },
    }
    if (version >= 1) schema.project_aliases = { pk: 'slug', columns: { slug: 'TEXT', project_id: 'INTEGER' } }
    // Even legacy archives must not hide conflicting tables that prevent migration.
    for (const [table, shape] of Object.entries(CONTENT_TABLE_SHAPES)) {
      if (version >= 2 || db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) schema[table] = shape
    }
    for (const [table, expected] of Object.entries(schema)) {
      const definition = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table)
      if (!definition || /^\s*CREATE\s+VIRTUAL/i.test(definition.sql)) throw new Error('Hub 数据库结构无效：' + table)
      const columns = db.prepare('SELECT * FROM pragma_table_info(?)').all(table)
      for (const [name, type] of Object.entries(expected.columns)) {
        if (!columns.some(column => column.name === name && column.type.toUpperCase() === type)) throw new Error('Hub 数据库结构缺少字段：' + table + '.' + name)
      }
      if (columns.filter(column => column.pk).length !== 1 || !columns.some(column => column.name === expected.pk && column.pk === 1)) throw new Error('Hub 数据库主键结构无效：' + table)
    }
    const slugUnique = db.prepare('SELECT * FROM pragma_index_list(?)').all('projects').some(index => {
      const columns = db.prepare('SELECT name FROM pragma_index_info(?)').all(index.name)
      return index.unique === 1 && index.partial === 0 && columns.length === 1 && columns[0].name === 'slug'
    })
    if (!slugUnique) throw new Error('Hub 数据库缺少唯一 slug 结构')
    for (const table of ['project_entries', ...(schema.project_aliases ? ['project_aliases'] : [])]) {
      if (!db.prepare('SELECT * FROM pragma_foreign_key_list(?)').all(table).some(key => key.table === 'projects' && key.from === 'project_id' && key.to === 'id' && key.on_delete === 'CASCADE')) throw new Error('Hub 数据库外键结构无效：' + table)
    }
    if (db.pragma('foreign_key_check').length) throw new Error('Hub 数据库引用不完整')
    for (const table of Object.keys(CONTENT_TABLE_SHAPES).filter(table => schema[table])) if (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count > 1000) throw new Error('独立内容数量超过应用上限')
    if (schema.albums) {
      for (const row of db.prepare('SELECT images FROM albums').all()) {
        const images = JSON.parse(row.images)
        if (!Array.isArray(images) || images.length > 48 || images.some(image => !image || typeof image.url !== 'string' || typeof image.caption !== 'string')) throw new Error('相册图片数据无效')
      }
    }
    const setting = db.prepare('SELECT json FROM site_settings WHERE id=1').get()
    if (!setting || !JSON.parse(setting.json) || typeof JSON.parse(setting.json) !== 'object' || Array.isArray(JSON.parse(setting.json))) throw new Error('Hub 站点配置无效')
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('trigger','view') LIMIT 1").get()) throw new Error('备份含不支持的数据库对象')
  } finally { db.close() }
}
export function encodeBackup(database, media) {
  validateDatabase(database)
  if (!Array.isArray(media) || media.length > 1000) throw new Error('媒体数量无效')
  const names = new Set()
  const files = media.map(file => {
    if (!mediaName(file.name) || names.has(file.name) || !Buffer.isBuffer(file.data) || file.data.length > mediaLimit(file.name)) throw new Error('媒体文件无效')
    if (!file.name.endsWith('.webp') && !file.name.endsWith('.' + audioExtension(file.data))) throw new Error('备份音频格式无效')
    names.add(file.name)
    return { name: file.name, data: file.data.toString('base64'), sha256: digest(file.data) }
  })
  const version = media.some(file => !file.name.endsWith('.webp')) ? 2 : 1
  const payload = Buffer.from(JSON.stringify({ format: 'duanap-hub', version, createdAt: new Date().toISOString(), database: database.toString('base64'), sha256: digest(database), media: files }))
  if (payload.length > MAX_ARCHIVE_BYTES) throw new Error('备份超过 128 MiB，请使用离线磁盘备份')
  return gzipSync(payload)
}
export function decodeBackup(archive) {
  if (archive.length > MAX_ARCHIVE_BYTES) throw new Error('备份文件过大')
  const payload = JSON.parse(gunzipSync(archive, { maxOutputLength: MAX_ARCHIVE_BYTES }).toString('utf8'))
  if (payload.format !== 'duanap-hub' || ![1, 2].includes(payload.version) || !Array.isArray(payload.media) || payload.media.length > 1000) throw new Error('备份格式不支持')
  const database = bytes(payload.database, payload.sha256)
  validateDatabase(database)
  const names = new Set()
  const media = payload.media.map(file => {
    if (!mediaName(file.name) || names.has(file.name) || (payload.version === 1 && !file.name.endsWith('.webp'))) throw new Error('媒体路径无效')
    names.add(file.name)
    const data = bytes(file.data, file.sha256)
    if (data.length > mediaLimit(file.name)) throw new Error('媒体文件过大')
    if (!file.name.endsWith('.webp') && !file.name.endsWith('.' + audioExtension(data))) throw new Error('备份音频格式无效')
    return { name: file.name, data }
  })
  return { database, media, createdAt: payload.createdAt }
}
