import type Database from 'better-sqlite3'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export function backupBeforeMigration(db: Database.Database, folder: string) {
  const dir = path.join(folder, 'migration-backups')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  writeFileSync(path.join(dir, `before-v1-${Date.now()}.sqlite`), db.serialize(), {
    mode: 0o600,
    flag: 'wx',
  })
}

export function migrateDatabase(db: Database.Database) {
  const version = db.pragma('user_version', { simple: true }) as number
  if (version > 1) throw new Error('数据库版本高于当前应用，请使用相容版本')
  if (version === 1) return
  db.transaction(() => {
    db.exec(`ALTER TABLE projects ADD COLUMN details_json TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE projects ADD COLUMN content_updated_at TEXT NOT NULL DEFAULT '';
      ALTER TABLE project_entries ADD COLUMN details_json TEXT NOT NULL DEFAULT '{}';
      CREATE TABLE project_slug_redirects(slug TEXT PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE);
      CREATE TABLE tool_settings(id TEXT PRIMARY KEY, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), title TEXT NOT NULL, summary TEXT NOT NULL);
      CREATE TABLE media(id TEXT PRIMARY KEY, filename TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL);
      UPDATE projects SET content_updated_at=updated_at;
      PRAGMA user_version=1;`)
  })()
}
