import { expect, test } from '@playwright/test'
import Database from 'better-sqlite3'
import { gunzipSync } from 'node:zlib'

test('protected backup creates a consistent downloadable snapshot without sessions', async ({ page }) => {
  expect((await page.request.get('/api/studio/backups')).status()).toBe(401)
  const headers = { Origin: 'http://127.0.0.1:1027' }
  expect((await page.request.post('/api/studio/login', { headers, data: { username: 'duanap', password: process.env.HUB_TEST_ADMIN_PASSWORD } })).ok()).toBeTruthy()
  const backup = await page.request.post('/api/studio/backups', { headers })
  expect(backup.status()).toBe(201)
  const { backup: entry } = await backup.json()
  const list = await page.request.get('/api/studio/backups')
  expect((await list.json()).backups.some((item: { name: string }) => item.name === entry.name)).toBeTruthy()
  const download = await page.request.get('/api/studio/backups/' + entry.name)
  expect(download.status()).toBe(200)
  expect(download.headers()['cache-control']).toContain('no-store')
  const archive = JSON.parse(gunzipSync(await download.body()).toString('utf8'))
  expect(archive.format).toBe('duanap-hub')
  const db = new Database(Buffer.from(archive.database, 'base64'), { readonly: true })
  expect(db.prepare('SELECT COUNT(*) AS count FROM admin_sessions').get()).toEqual({ count: 0 })
  expect(db.pragma('quick_check', { simple: true })).toBe('ok'); db.close()
  expect((await page.request.post('/api/studio/backups', { headers: { Origin: 'https://evil.invalid' } })).status()).toBe(403)
})
