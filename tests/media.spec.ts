import { expect, test } from '@playwright/test'
import sharp from 'sharp'

test('media upload validates images, serves immutable raster data and protects mutations', async ({ page }) => {
  const origin = 'http://127.0.0.1:1027'
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#3167cf' } }).png().toBuffer()
  const anonymous = await page.request.post('/api/studio/media', {
    headers: { Origin: origin }, multipart: { file: { name: 'cover.png', mimeType: 'image/png', buffer: image } },
  })
  expect(anonymous.status()).toBe(401)
  const login = await page.request.post('/api/studio/login', {
    headers: { Origin: origin }, data: { username: 'duanap', password: process.env.HUB_TEST_ADMIN_PASSWORD },
  })
  expect(login.ok()).toBeTruthy()
  const invalid = await page.request.post('/api/studio/media', {
    headers: { Origin: origin }, multipart: { file: { name: 'evil.png', mimeType: 'image/png', buffer: Buffer.from('<script>alert(1)</script>') } },
  })
  expect(invalid.status()).toBe(400)
  const foreign = await page.request.post('/api/studio/media', {
    headers: { Origin: 'https://evil.invalid' }, multipart: { file: { name: 'cover.png', mimeType: 'image/png', buffer: image } },
  })
  expect(foreign.status()).toBe(403)
  const uploaded = await page.request.post('/api/studio/media', {
    headers: { Origin: origin }, multipart: { file: { name: '../../cover.png', mimeType: 'image/png', buffer: image } },
  })
  expect(uploaded.status()).toBe(201)
  const { media } = await uploaded.json()
  expect(media.url).toMatch(/^\/media\/[a-f0-9-]+\.webp$/)
  const served = await page.request.get(media.url)
  expect(served.status()).toBe(200)
  expect(served.headers()['content-type']).toContain('image/webp')
  expect(served.headers()['x-content-type-options']).toBe('nosniff')
  expect((await sharp(await served.body()).metadata()).width).toBe(8)
  const list = await page.request.get('/api/studio/media')
  expect((await list.json()).media.some((entry: { url: string }) => entry.url === media.url)).toBeTruthy()
  const updated = await page.request.put('/api/studio/site', { headers: { Origin: origin }, data: { avatarUrl: media.url } })
  expect(updated.ok()).toBeTruthy()
  const used = await page.request.delete('/api/studio/media/' + media.name, { headers: { Origin: origin } })
  expect(used.status()).toBe(409)
  await page.request.put('/api/studio/site', { headers: { Origin: origin }, data: { avatarUrl: '' } })
  const removed = await page.request.delete('/api/studio/media/' + media.name, { headers: { Origin: origin } })
  expect(removed.ok()).toBeTruthy()
  expect((await page.request.get(media.url)).status()).toBe(404)
})
test('uploading a cover prevents editing or switching the owning project', async ({ page }) => {
  await page.request.post('/api/studio/login', { headers: { Origin: 'http://127.0.0.1:1027' }, data: { username: 'duanap', password: process.env.HUB_TEST_ADMIN_PASSWORD } })
  await page.goto('/duanap')
  await page.getByRole('button', { name: '项目与公告', exact: true }).click()
  await page.getByRole('button', { name: '+ 新增项目' }).click()
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#3167cf' } }).png().toBuffer()
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/studio/media', async route => { await pending; await route.continue() })
  try {
    await page.getByLabel('上传封面图片地址').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: image })
    await expect(page.getByLabel('项目名称', { exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '返回项目列表' })).toBeDisabled()
    await expect(page.getByRole('button', { name: '主页资料', exact: true })).toBeDisabled()
  } finally { release() }
  await expect(page.getByLabel('封面图片地址', { exact: true })).toHaveValue(/\/media\/.*\.webp$/)
  await expect(page.getByLabel('项目名称', { exact: true })).toBeEnabled()
})
