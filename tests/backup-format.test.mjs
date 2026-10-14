import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { encodeBackup, decodeBackup } from '../scripts/backup-format.mjs'

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

test('offline content restore invalidates separate account sessions and auth transactions',()=>{
  const folder=mkdtempSync(path.join(os.tmpdir(),'hub-accounts-restore-')),target=path.join(folder,'data');mkdirSync(target)
  writeFileSync(path.join(target,'hub.sqlite'),database('原作品'))
  for(const suffix of ['','-wal','-shm'])writeFileSync(path.join(target,'accounts.sqlite'+suffix),'private synthetic session data')
  const input=path.join(folder,'backup.hub.gz');writeFileSync(input,encodeBackup(database(),[]))
  const result=spawnSync(process.execPath,['scripts/restore-backup.mjs','--input',input,'--data-dir',target,'--confirm-restore'],{encoding:'utf8'})
  assert.equal(result.status,0,result.stderr)
  for(const suffix of ['','-wal','-shm'])assert.equal(existsSync(path.join(target,'accounts.sqlite'+suffix)),false,'old local auth data must not survive content restore')
})
