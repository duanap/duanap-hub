import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
const root = mkdtempSync(path.join(tmpdir(), 'hub-operations-'))
process.env.HUB_DATA_DIR = path.join(root, 'data')
let db: typeof import('../lib/db')
before(async () => {
  db = await import('../lib/db')
})
test('JSON reader rejects oversized streamed input before parsing', async () => {
  const { parseJson } = await import('../lib/api')
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode('123456789'))
      c.close()
    },
  })
  await assert.rejects(() =>
    parseJson(
      new Request('http://local', { method: 'POST', body: stream, duplex: 'half' } as RequestInit),
      4,
    ),
  )
})
test('verified media reject fake files and store immutable local images', async () => {
  const { saveMedia } = await import('../lib/media')
  await assert.rejects(() =>
    saveMedia(new File(['<svg>bad</svg>'], 'fake.png', { type: 'image/png' })),
  )
  const sharp = (await import('sharp')).default
  const bytes = await sharp({
    create: { width: 10, height: 10, channels: 3, background: '#3472f6' },
  })
    .png()
    .toBuffer()
  const media = await saveMedia(
    new File([new Uint8Array(bytes)], 'tiny.png', { type: 'image/png' }),
  )
  assert.match(media.url, /^\/media\/[a-f0-9-]+\.webp$/)
})
test('online backup retains WAL commits and restore refuses corruption and existing targets', async () => {
  const ops = await import('../lib/backups')
  db.createProject({ slug: 'backup-project', title: '备份测试', published: true })
  db.getDatabase().pragma('wal_autocheckpoint=0')
  db.updateSiteSettings({ displayName: 'WAL 中的内容' })
  const backup = await ops.createBackup()
  const restored = path.join(root, 'restored')
  const result = await ops.restoreBackup(backup.directory, restored)
  assert.equal(result.projects, 1)
  const Database = (await import('better-sqlite3')).default
  const recovered = new Database(path.join(restored, 'hub.sqlite'), { readonly: true })
  assert.equal(
    JSON.parse((recovered.prepare('SELECT json FROM site_settings').get() as any).json).displayName,
    'WAL 中的内容',
  )
  recovered.close()
  await assert.rejects(() => ops.restoreBackup(backup.directory, restored))
  const file = path.join(backup.directory, 'hub.sqlite'),
    original = readFileSync(file)
  writeFileSync(file, Buffer.from('corrupt'))
  const rejected = path.join(root, 'rejected')
  await assert.rejects(() => ops.restoreBackup(backup.directory, rejected))
  assert.equal(existsSync(rejected), false)
  writeFileSync(file, original)
})

test('failed backups remove only their own temporary snapshot and preserve valid backups', async () => {
  const { createBackup, listBackups } = await import('../lib/backups')
  const before = await listBackups()
  const id = '11111111-1111-1111-1111-111111111111'
  db.getDatabase()
    .prepare(
      'INSERT INTO media(id,filename,original_name,mime,size,created_at) VALUES (?,?,?,?,?,?)',
    )
    .run(id, id + '.webp', 'missing.webp', 'image/webp', 123, new Date().toISOString())
  await assert.rejects(() => createBackup())
  const names = readdirSync(path.join(process.env.HUB_DATA_DIR!, 'backups'))
  assert.equal(
    names.some((n) => n.startsWith('.pending-')),
    false,
  )
  assert.deepEqual(
    (await listBackups()).map((b) => b.id),
    before.map((b) => b.id),
  )
  db.getDatabase().prepare('DELETE FROM media WHERE id=?').run(id)
})

test('malformed backup metadata is rejected without breaking valid backup history', async () => {
  const { listBackups } = await import('../lib/backups')
  const original = await listBackups()
  const id = '99999999999999999-aaaaaaaa',
    directory = path.join(process.env.HUB_DATA_DIR!, 'backups', id)
  mkdirSync(directory)
  writeFileSync(
    path.join(directory, 'manifest.json'),
    JSON.stringify({ format: 1, id, createdAt: 42, schemaVersion: 1, files: [] }),
  )
  const history = await listBackups()
  assert.deepEqual(
    history.map((b) => b.id),
    original.map((b) => b.id),
  )
})
