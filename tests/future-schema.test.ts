import { test } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
const root = mkdtempSync(path.join(tmpdir(), 'hub-future-schema-'))
process.env.HUB_DATA_DIR = root
const original = new Database(path.join(root, 'hub.sqlite'))
original.exec('CREATE TABLE future_content(id INTEGER);PRAGMA user_version=9;')
original.close()
test('a newer schema is refused before any tables are changed', async () => {
  const { getDatabase } = await import('../lib/db')
  assert.throws(() => getDatabase(), /版本/)
  const unchanged = new Database(path.join(root, 'hub.sqlite'), { readonly: true })
  const names = unchanged.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
    name: string
  }[]
  assert.deepEqual(
    names.map((n) => n.name),
    ['future_content'],
  )
  unchanged.close()
})
