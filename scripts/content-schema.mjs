import { chmodSync, lstatSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'

export const CONTENT_SCHEMA_VERSION = 2
export const CONTENT_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    cover_url TEXT NOT NULL DEFAULT '',
    images TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(images) AND json_type(images) = 'array'),
    published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
    published_at TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS friend_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    group_name TEXT NOT NULL DEFAULT '',
    icon_url TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_albums_public ON albums(published, sort_order, id);
  CREATE INDEX IF NOT EXISTS idx_notes_public ON notes(published, published_at, sort_order, id);
  CREATE INDEX IF NOT EXISTS idx_friend_links_public ON friend_links(published, sort_order, id);
`

export const CONTENT_TABLE_SHAPES = {
  albums: { pk: 'id', columns: { id: 'INTEGER', title: 'TEXT', summary: 'TEXT', cover_url: 'TEXT', images: 'TEXT', published: 'INTEGER', sort_order: 'INTEGER', created_at: 'TEXT', updated_at: 'TEXT' } },
  notes: { pk: 'id', columns: { id: 'INTEGER', title: 'TEXT', body: 'TEXT', image_url: 'TEXT', published: 'INTEGER', published_at: 'TEXT', sort_order: 'INTEGER', created_at: 'TEXT', updated_at: 'TEXT' } },
  friend_links: { pk: 'id', columns: { id: 'INTEGER', title: 'TEXT', url: 'TEXT', summary: 'TEXT', group_name: 'TEXT', icon_url: 'TEXT', published: 'INTEGER', sort_order: 'INTEGER', created_at: 'TEXT', updated_at: 'TEXT' } },
}

export function migrateContentSchema(db) {
  if (Number(db.pragma('user_version', { simple: true })) > CONTENT_SCHEMA_VERSION) throw new Error('数据库版本高于当前应用')
  db.transaction(() => { db.exec(CONTENT_SCHEMA_SQL); db.pragma('user_version = 2') })()
}

// VACUUM INTO includes committed WAL contents; no production file is copied or imported.
export function snapshotBeforeContentMigration(db, directory) {
  if (Number(db.pragma('user_version', { simple: true })) >= CONTENT_SCHEMA_VERSION) return null
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='site_settings'").get()) return null
  const folder = path.join(directory, 'migration-snapshots')
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  if (lstatSync(folder).isSymbolicLink()) throw new Error('升级快照目录不可为符号链接')
  const snapshot = path.join(folder, 'before-content-v2-' + randomUUID() + '.sqlite')
  db.prepare('VACUUM INTO ?').run(snapshot)
  chmodSync(snapshot, 0o600)
  const copy = new Database(snapshot)
  try {
    copy.pragma('journal_mode = DELETE')
    copy.pragma('secure_delete = ON')
    copy.exec('DELETE FROM admin_sessions; DELETE FROM admin_login_attempts; VACUUM;')
  } finally { copy.close() }
  return snapshot
}
