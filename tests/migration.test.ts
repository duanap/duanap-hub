import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
const root = mkdtempSync(path.join(tmpdir(), 'hub-v0-migration-'))
process.env.HUB_DATA_DIR = root
const original = new Database(path.join(root, 'hub.sqlite'))
original.exec(`CREATE TABLE site_settings(id INTEGER PRIMARY KEY,json TEXT NOT NULL);
CREATE TABLE projects(id INTEGER PRIMARY KEY AUTOINCREMENT,slug TEXT UNIQUE NOT NULL,title TEXT NOT NULL,summary TEXT NOT NULL DEFAULT '',body TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT 'website',status TEXT NOT NULL DEFAULT 'development',version TEXT NOT NULL DEFAULT '',external_url TEXT NOT NULL DEFAULT '',repository_url TEXT NOT NULL DEFAULT '',cover_url TEXT NOT NULL DEFAULT '',featured INTEGER NOT NULL DEFAULT 0,published INTEGER NOT NULL DEFAULT 0,seo_title TEXT NOT NULL DEFAULT '',seo_description TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE project_entries(id INTEGER PRIMARY KEY AUTOINCREMENT,project_id INTEGER NOT NULL REFERENCES projects(id),type TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',published INTEGER NOT NULL DEFAULT 0,published_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`)
original
  .prepare('INSERT INTO site_settings VALUES (1,?)')
  .run(JSON.stringify({ displayName: '原有资料', siteName: '旧站名称' }))
original
  .prepare(
    "INSERT INTO projects(slug,title,body,published,created_at,updated_at) VALUES ('legacy','原有作品','不能丢失的正文',1,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z')",
  )
  .run()
original.close()
let db: typeof import('../lib/db')
before(async () => {
  db = await import('../lib/db')
})
test('v0 migration preserves existing content and creates a pristine pre-change snapshot', () => {
  const migrated = db.getProjectBySlug('legacy')!
  assert.equal(migrated.body, '不能丢失的正文')
  assert.equal(db.getSiteSettings().displayName, '原有资料')
  assert.equal(db.getDatabase().pragma('user_version', { simple: true }), 1)
  const backups = readdirSync(path.join(root, 'migration-backups'))
  assert.equal(backups.length, 1)
  const snapshot = new Database(path.join(root, 'migration-backups', backups[0]), {
    readonly: true,
  })
  assert.equal(
    (
      snapshot
        .prepare(
          "SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name!='sqlite_sequence'",
        )
        .get() as { n: number }
    ).n,
    3,
  )
  assert.equal(snapshot.pragma('user_version', { simple: true }), 0)
  assert.equal(
    (snapshot.prepare('SELECT body FROM projects').get() as { body: string }).body,
    '不能丢失的正文',
  )
  snapshot.close()
  assert.equal(db.getDatabase(), db.getDatabase())
})
