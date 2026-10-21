import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { encodeBackup, decodeBackup } from '../scripts/backup-format.mjs'
import { migrateContentSchema, snapshotBeforeContentMigration } from '../scripts/content-schema.mjs'

const schema = `
CREATE TABLE site_settings(id INTEGER PRIMARY KEY,json TEXT NOT NULL);
CREATE TABLE module_settings(id TEXT PRIMARY KEY,enabled INTEGER NOT NULL,sort_order INTEGER NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE projects(id INTEGER PRIMARY KEY,slug TEXT NOT NULL UNIQUE,title TEXT NOT NULL,summary TEXT NOT NULL DEFAULT '',body TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT 'website',status TEXT NOT NULL DEFAULT 'development',version TEXT NOT NULL DEFAULT '',external_url TEXT NOT NULL DEFAULT '',repository_url TEXT NOT NULL DEFAULT '',cover_url TEXT NOT NULL DEFAULT '',featured INTEGER NOT NULL DEFAULT 0,published INTEGER NOT NULL DEFAULT 0,seo_title TEXT NOT NULL DEFAULT '',seo_description TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT '');
CREATE TABLE project_entries(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,type TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',published INTEGER NOT NULL DEFAULT 0,published_at TEXT,created_at TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT '');
CREATE TABLE admin_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
CREATE TABLE admin_login_attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL);
INSERT INTO site_settings VALUES(1,'{"siteName":"测试","displayName":"duanap"}');`
function database(title = '恢复后的作品') {
  const db = new Database(':memory:')
  db.exec(schema)
  db.prepare('INSERT INTO projects(id,slug,title) VALUES(1,?,?)').run('sample', title)
  const data = db.serialize(); db.close(); return data
}
test('backup format verifies database and media integrity and rejects traversal', () => {
  const data = database(), name = '11111111-1111-1111-1111-111111111111.webp'
  const backup = encodeBackup(data, [{ name, data: Buffer.from('raster') }])
  assert.equal(decodeBackup(backup).media[0].name, name)
  assert.throws(() => encodeBackup(data, [{ name: '../secret', data: Buffer.from('x') }]))
  const damaged = Buffer.from(backup); damaged[damaged.length - 1] ^= 1
  assert.throws(() => decodeBackup(damaged))
})
test('offline restore replaces content and media and keeps a rollback snapshot', () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'hub-restore-'))
  const target = path.join(folder, 'data'); mkdirSync(target)
  writeFileSync(path.join(target, 'hub.sqlite'), database('原作品'))
  const input = path.join(folder, 'backup.hub.gz')
  writeFileSync(input, encodeBackup(database(), [{ name: '11111111-1111-1111-1111-111111111111.webp', data: Buffer.from('raster') }]))
  const result = spawnSync(process.execPath, ['scripts/restore-backup.mjs', '--input', input, '--data-dir', target, '--confirm-restore'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const db = new Database(path.join(target, 'hub.sqlite'), { readonly: true })
  assert.equal(db.prepare('SELECT title FROM projects').get().title, '恢复后的作品'); db.close()
  assert.equal(readFileSync(path.join(target, 'media', '11111111-1111-1111-1111-111111111111.webp'), 'utf8'), 'raster')
  assert.match(result.stdout, /rollback/)
  assert.equal(existsSync(path.join(target, '.hub-maintenance.lock')), false)
  const rollback = result.stdout.trim().split('rollback: ')[1]
  const rollbackResult = spawnSync(process.execPath, ['scripts/restore-backup.mjs', '--input', path.join(rollback, 'rollback.hub.gz'), '--data-dir', target, '--confirm-restore'], { encoding: 'utf8' })
  assert.equal(rollbackResult.status, 0, rollbackResult.stderr)
  const original = new Database(path.join(target, 'hub.sqlite'), { readonly: true })
  assert.equal(original.prepare('SELECT title FROM projects').get().title, '原作品'); original.close()
})
test('schema validation refuses databases that have table names but cannot boot Hub', () => {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE site_settings(id INTEGER,json TEXT); CREATE TABLE projects(id INTEGER,title TEXT); CREATE TABLE project_entries(id INTEGER,title TEXT); CREATE TABLE admin_sessions(token_hash TEXT); CREATE TABLE admin_login_attempts(key TEXT);')
  const data = db.serialize(); db.close()
  assert.throws(() => encodeBackup(data, []), /结构|schema/)
})
test('failed replacement and failed rollback retain the startup barrier and recovery files', () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'hub-fault-')), target = path.join(folder, 'data')
  mkdirSync(target); mkdirSync(path.join(target, 'media')); writeFileSync(path.join(target, 'hub.sqlite'), database('原作品'))
  const input = path.join(folder, 'backup.hub.gz'); writeFileSync(input, encodeBackup(database(), []))
  const loader = path.join(folder, 'fault.mjs')
  writeFileSync(loader, `import fs from 'node:fs'; import path from 'node:path'; import {syncBuiltinESMExports} from 'node:module'; const rename=fs.renameSync; fs.renameSync=(source,target)=>{ if((String(source).includes('.restore-') && path.basename(source)==='media') || path.basename(source)==='original-hub.sqlite') throw new Error('simulated filesystem failure'); return rename(source,target) }; syncBuiltinESMExports();`)
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(loader).href, 'scripts/restore-backup.mjs', '--input', input, '--data-dir', target, '--confirm-restore'], { encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.equal(existsSync(path.join(target, '.hub-maintenance.lock')), true, result.stderr)
  assert.match(result.stderr, /rollback/)
})
test('failure while moving original files preserves the original database and media', () => {
  for (const failedName of ['hub.sqlite', 'media']) {
    const folder = mkdtempSync(path.join(os.tmpdir(), 'hub-original-fault-')), target = path.join(folder, 'data')
    const name = '11111111-1111-1111-1111-111111111111.webp'
    mkdirSync(target); mkdirSync(path.join(target, 'media'))
    writeFileSync(path.join(target, 'hub.sqlite'), database('原作品'))
    writeFileSync(path.join(target, 'media', name), 'original raster')
    const input = path.join(folder, 'backup.hub.gz'); writeFileSync(input, encodeBackup(database(), []))
    const loader = path.join(folder, 'fault.mjs')
    writeFileSync(loader, `import fs from 'node:fs'; import path from 'node:path'; import {syncBuiltinESMExports} from 'node:module'; const rename=fs.renameSync; let injected=false; fs.renameSync=(source,target)=>{ if(!injected && path.basename(target)==='original-${failedName}') { injected=true; throw new Error('simulated original move failure') } return rename(source,target) }; syncBuiltinESMExports();`)
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(loader).href, 'scripts/restore-backup.mjs', '--input', input, '--data-dir', target, '--confirm-restore'], { encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /simulated original move failure/)
    const original = new Database(path.join(target, 'hub.sqlite'), { readonly: true })
    assert.equal(original.prepare('SELECT title FROM projects').get().title, '原作品'); original.close()
    assert.equal(readFileSync(path.join(target, 'media', name), 'utf8'), 'original raster')
    assert.equal(existsSync(path.join(target, '.hub-maintenance.lock')), false)
  }
})

test('restore refuses a live application and corrupt archive without changing the original', () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'hub-lock-'))
  const target = path.join(folder, 'data'); mkdirSync(target)
  const input = path.join(folder, 'backup.hub.gz'); writeFileSync(input, encodeBackup(database(), []))
  const original = Buffer.from('original'); writeFileSync(path.join(target, 'hub.sqlite'), original)
  writeFileSync(path.join(target, '.hub-runtime.lock'), JSON.stringify({ pid: process.pid }))
  const result = spawnSync(process.execPath, ['scripts/restore-backup.mjs', '--input', input, '--data-dir', target, '--confirm-restore'], { encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.deepEqual(readFileSync(path.join(target, 'hub.sqlite')), original)
})

function legacyWithAliases(file) {
  const db = new Database(file)
  db.exec(schema)
  db.exec('CREATE TABLE project_aliases(slug TEXT PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE); PRAGMA user_version=1;')
  db.prepare('INSERT INTO projects(id,slug,title) VALUES(1,?,?)').run('kept-project', '保留的项目')
  return db
}

test('content schema migration snapshots committed WAL content and clears snapshot sessions', () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'hub-content-upgrade-'))
  const db = legacyWithAliases(path.join(folder, 'hub.sqlite'))
  db.pragma('journal_mode = WAL')
  db.prepare('UPDATE projects SET title=? WHERE id=1').run('WAL 中的新标题')
  db.prepare('INSERT INTO admin_sessions VALUES(?,?)').run('private-session', Date.now() + 60000)
  const snapshot = snapshotBeforeContentMigration(db, folder)
  const copy = new Database(snapshot, { readonly: true })
  assert.equal(copy.pragma('user_version', { simple: true }), 1)
  assert.equal(copy.prepare('SELECT title FROM projects').get().title, 'WAL 中的新标题')
  assert.equal(copy.prepare('SELECT COUNT(*) AS count FROM admin_sessions').get().count, 0)
  copy.close()
  migrateContentSchema(db)
  assert.equal(db.pragma('user_version', { simple: true }), 2)
  assert.equal(db.prepare('SELECT title FROM projects').get().title, 'WAL 中的新标题')
  for (const table of ['albums', 'notes', 'friend_links']) assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0)
  assert.equal(snapshotBeforeContentMigration(db, folder), null)
  db.close()
})

test('failed content DDL rolls back new tables and preserves the legacy schema version', () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'hub-content-failure-'))
  const db = legacyWithAliases(path.join(folder, 'hub.sqlite'))
  db.exec('CREATE TABLE notes(id INTEGER PRIMARY KEY)')
  const snapshot = snapshotBeforeContentMigration(db, folder)
  assert.throws(() => migrateContentSchema(db))
  assert.equal(db.pragma('user_version', { simple: true }), 1)
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name='albums'").get(), undefined)
  assert.equal(db.prepare('SELECT title FROM projects').get().title, '保留的项目')
  assert.equal(existsSync(snapshot), true)
  db.close()
})

test('version two content and media survive real restore and rollback to the prior database', () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'hub-content-restore-')), target = path.join(folder, 'data')
  mkdirSync(target)
  writeFileSync(path.join(target, 'hub.sqlite'), database('回滚前的项目'))
  const db = legacyWithAliases(':memory:')
  migrateContentSchema(db)
  const name = '22222222-2222-2222-2222-222222222222.webp', url = '/media/' + name
  db.prepare('INSERT INTO albums(title,images,published,created_at,updated_at) VALUES(?,?,?,?,?)').run('独立相册', JSON.stringify([{ url, caption: '保留说明' }]), 1, '2026-10-20', '2026-10-20')
  db.prepare('INSERT INTO notes(title,body,image_url,published,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('独立随记', '**正文**', url, 1, '2026-10-20T00:00:00.000Z', '2026-10-20', '2026-10-20')
  db.prepare('INSERT INTO friend_links(title,url,group_name,published,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('独立友链', 'https://example.com', '朋友', 1, '2026-10-20', '2026-10-20')
  const input = path.join(folder, 'content.hub.gz')
  writeFileSync(input, encodeBackup(db.serialize(), [{ name, data: Buffer.from('preserved-raster') }]))
  db.close()
  const result = spawnSync(process.execPath, ['scripts/restore-backup.mjs', '--input', input, '--data-dir', target, '--confirm-restore'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const restored = new Database(path.join(target, 'hub.sqlite'), { readonly: true })
  assert.equal(restored.pragma('user_version', { simple: true }), 2)
  assert.equal(JSON.parse(restored.prepare('SELECT images FROM albums').get().images)[0].caption, '保留说明')
  assert.equal(restored.prepare('SELECT body FROM notes').get().body, '**正文**')
  assert.equal(restored.prepare('SELECT group_name FROM friend_links').get().group_name, '朋友')
  restored.close()
  assert.equal(readFileSync(path.join(target, 'media', name), 'utf8'), 'preserved-raster')
  const rollback = result.stdout.trim().split('rollback: ')[1]
  const reversed = spawnSync(process.execPath, ['scripts/restore-backup.mjs', '--input', path.join(rollback, 'rollback.hub.gz'), '--data-dir', target, '--confirm-restore'], { encoding: 'utf8' })
  assert.equal(reversed.status, 0, reversed.stderr)
  const original = new Database(path.join(target, 'hub.sqlite'), { readonly: true })
  assert.equal(original.prepare('SELECT title FROM projects').get().title, '回滚前的项目')
  assert.equal(original.pragma('user_version', { simple: true }), 0)
  original.close()
})

test('version two backup refuses missing content tables instead of silently losing data', () => {
  const db = legacyWithAliases(':memory:')
  migrateContentSchema(db)
  db.exec('DROP TABLE friend_links')
  assert.throws(() => encodeBackup(db.serialize(), []), /结构/)
  db.close()
})

test('legacy backup refuses a conflicting reserved content table before restoring an unbootable database', () => {
  const db = legacyWithAliases(':memory:')
  db.exec('CREATE TABLE notes(id INTEGER PRIMARY KEY)')
  assert.throws(() => encodeBackup(db.serialize(), []), /结构/)
  db.close()
})

test('offline content restore invalidates separate account sessions and auth transactions',()=>{
  const folder=mkdtempSync(path.join(os.tmpdir(),'hub-accounts-restore-')),target=path.join(folder,'data');mkdirSync(target)
  writeFileSync(path.join(target,'hub.sqlite'),database('原作品'))
  for(const suffix of ['','-wal','-shm'])writeFileSync(path.join(target,'accounts.sqlite'+suffix),'private synthetic session data')
  const input=path.join(folder,'backup.hub.gz');writeFileSync(input,encodeBackup(database(),[]))
  const result=spawnSync(process.execPath,['scripts/restore-backup.mjs','--input',input,'--data-dir',target,'--confirm-restore'],{encoding:'utf8'})
  assert.equal(result.status,0,result.stderr)
  for(const suffix of ['','-wal','-shm'])assert.equal(existsSync(path.join(target,'accounts.sqlite'+suffix)),false,'old local auth data must not survive content restore')
})

test('content restore retains independent users and blog mappings while invalidating access',()=>{
  const folder=mkdtempSync(path.join(os.tmpdir(),'hub-members-content-')),target=path.join(folder,'data');mkdirSync(target)
  writeFileSync(path.join(target,'hub.sqlite'),database('原作品'))
  const member=new Database(path.join(target,'members.sqlite'))
  member.exec("PRAGMA user_version=1;CREATE TABLE members(id TEXT,password TEXT,recovery_hash TEXT);INSERT INTO members VALUES('local-user','salted-password-hash','recovery-hash');CREATE TABLE member_sessions(hash TEXT);INSERT INTO member_sessions VALUES('session');CREATE TABLE member_flows(hash TEXT);INSERT INTO member_flows VALUES('flow');CREATE TABLE member_attempts(key TEXT);CREATE TABLE member_blogs(member_id TEXT,blog_uid TEXT,payload TEXT,authorized INTEGER);INSERT INTO member_blogs VALUES('local-user','blog-user','private-token',1);");member.close()
  const input=path.join(folder,'backup.hub.gz');writeFileSync(input,encodeBackup(database(),[]))
  const result=spawnSync(process.execPath,['scripts/restore-backup.mjs','--input',input,'--data-dir',target,'--confirm-restore'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr)
  const restored=new Database(path.join(target,'members.sqlite'),{readonly:true})
  try{assert.deepEqual(restored.prepare('SELECT * FROM members').get(),{id:'local-user',password:'salted-password-hash',recovery_hash:'recovery-hash'});assert.deepEqual(restored.prepare('SELECT * FROM member_blogs').get(),{member_id:'local-user',blog_uid:'blog-user',payload:'',authorized:0});assert.equal(restored.prepare('SELECT count(*) n FROM member_sessions').get().n,0);assert.equal(restored.prepare('SELECT count(*) n FROM member_flows').get().n,0)}finally{restored.close()}
})
