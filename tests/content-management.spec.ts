import { expect, test, type Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import Database from 'better-sqlite3'
import { gunzipSync } from 'node:zlib'
import type { ContentKind } from '@/lib/types'

const headers = { Origin: 'http://127.0.0.1:1027' }
let records: { kind: ContentKind; id: number }[] = []
let media: string[] = []
const marker = () => randomBytes(5).toString('hex')
async function login(page: Page) {
  expect((await page.request.post('/api/studio/login', { headers, data: { username: 'duanap', password: process.env.HUB_TEST_ADMIN_PASSWORD } })).ok()).toBeTruthy()
}
async function create(page: Page, kind: ContentKind, payload: object) {
  const response = await page.request.post('/api/studio/content/' + kind, { headers, data: payload })
  expect(response.status()).toBe(201)
  const item = (await response.json()).item
  records.push({ kind, id: item.id })
  return item as { id: number; title: string }
}
async function image(page: Page, color = '#527a8e') {
  const buffer = await sharp({ create: { width: 32, height: 24, channels: 3, background: color } }).png().toBuffer()
  const response = await page.request.post('/api/studio/media', { headers, multipart: { file: { name: 'content.png', mimeType: 'image/png', buffer } } })
  expect(response.status()).toBe(201)
  const item = (await response.json()).media
  media.push(item.name)
  return item.url as string
}
async function trackSave(page: Page, kind: ContentKind) {
  const response = await page.waitForResponse(response => response.url().endsWith('/api/studio/content/' + kind) && response.request().method() === 'POST')
  const item = (await response.json()).item
  if (item) records.push({ kind, id: item.id })
}
test.beforeEach(async ({ page }) => { records = []; media = []; await login(page) })
test.afterEach(async ({ page }) => {
  await login(page)
  for (const record of records) await page.request.delete(`/api/studio/content/${record.kind}/${record.id}`, { headers })
  for (const name of media) await page.request.delete('/api/studio/media/' + name, { headers })
  for (const id of ['projects', 'photos', 'notes', 'links']) await page.request.patch('/api/studio/modules', { headers, data: { id, enabled: true } })
})

test('Studio albums persist ordered images, captions and publication across reloads', async ({ page }) => {
  const title = '漫步相册-' + marker(), first = await image(page), second = await image(page, '#b89476')
  await page.goto('/duanap')
  await page.getByRole('button', { name: '相册管理', exact: true }).click()
  await page.getByRole('button', { name: '+ 新增相册', exact: true }).click()
  await page.getByLabel('相册标题', { exact: true }).fill(title)
  await page.getByLabel('相册简介', { exact: true }).fill('独立于项目的生活相册。')
  for (const [url, caption] of [[first, '第一张说明'], [second, '第二张说明']]) {
    await page.getByLabel('新增相册图片', { exact: true }).fill(url)
    await page.getByRole('button', { name: '添加图片到相册', exact: true }).click()
    await page.getByLabel('图片说明 ' + (url === first ? '1' : '2'), { exact: true }).fill(caption)
  }
  await page.getByRole('button', { name: '上移图片 2', exact: true }).click()
  await page.getByLabel('公开发布相册', { exact: true }).check()
  const saved = trackSave(page, 'albums')
  await page.getByRole('button', { name: '保存相册', exact: true }).click()
  await saved
  await expect(page.getByRole('status')).toContainText('相册已保存')
  await page.reload()
  await page.getByRole('button', { name: '相册管理', exact: true }).click()
  await page.getByRole('button', { name: '编辑相册：' + title, exact: true }).click()
  await expect(page.getByLabel('图片说明 1', { exact: true })).toHaveValue('第二张说明')
  await expect(page.getByLabel('图片说明 2', { exact: true })).toHaveValue('第一张说明')
  await page.goto('/photos')
  await page.getByRole('button', { name: '打开相册：' + title, exact: true }).click()
  await page.getByRole('button', { name: '查看图片 1', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '图片预览' }).getByRole('img')).toHaveAttribute('src', second)
  await expect(page.locator('.hub-lightbox-caption')).toHaveText('第二张说明')
})

test('Studio personal notes support Markdown, images, draft publication and withdrawal', async ({ page }) => {
  const title = '日常随记-' + marker(), url = await image(page)
  await page.goto('/duanap')
  await page.getByRole('button', { name: '个人随记', exact: true }).click()
  await page.getByRole('button', { name: '+ 新增随记', exact: true }).click()
  await page.getByLabel('随记标题', { exact: true }).fill(title)
  await page.getByLabel('随记配图', { exact: true }).fill(url)
  await page.getByRole('group', { name: '随记正文编辑器', exact: true }).getByRole('button', { name: 'Markdown 源码', exact: true }).click()
  await page.getByLabel('随记正文（Markdown）', { exact: true }).fill('## 生活片段\n\n**后台编辑的独立随记**')
  const saved = trackSave(page, 'notes')
  await page.getByRole('button', { name: '保存随记', exact: true }).click()
  await saved
  await expect(page.getByRole('status')).toContainText('随记已保存')
  expect(await (await page.request.get('/notes')).text()).not.toContain(title)
  await page.getByLabel('公开发布随记', { exact: true }).check()
  await page.getByRole('button', { name: '保存随记', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('随记已保存')
  await page.goto('/notes')
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(page.locator('.hub-note strong').filter({ hasText: '后台编辑的独立随记' })).toBeVisible()
  expect(await (await page.request.get('/feed.xml')).text()).toContain(title)
  await page.goto('/duanap')
  await page.getByRole('button', { name: '个人随记', exact: true }).click()
  await page.getByRole('button', { name: '编辑随记：' + title, exact: true }).click()
  await page.getByLabel('公开发布随记', { exact: true }).uncheck()
  await page.getByRole('button', { name: '保存随记', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('随记已保存')
  expect(await (await page.request.get('/notes')).text()).not.toContain(title)
  expect(await (await page.request.get('/feed.xml')).text()).not.toContain(title)
})

test('Studio friend links keep errors editable and publish grouping, icon and URL', async ({ page }) => {
  const title = '朋友的网站-' + marker(), group = '朋友-' + marker(), icon = await image(page)
  await page.goto('/duanap')
  await page.getByRole('button', { name: '友链管理', exact: true }).click()
  await page.getByRole('button', { name: '+ 新增友链', exact: true }).click()
  await page.getByLabel('友链标题', { exact: true }).fill(title)
  await page.getByLabel('友链地址', { exact: true }).fill('javascript:alert(1)')
  await page.getByLabel('友链分组', { exact: true }).fill(group)
  await page.getByLabel('友链图标', { exact: true }).fill(icon)
  await page.getByLabel('公开发布友链', { exact: true }).check()
  await page.getByRole('button', { name: '保存友链', exact: true }).click()
  await expect(page.locator('.studio-content-manager').getByRole('alert')).toContainText('HTTP(S)')
  await expect(page.getByLabel('友链标题', { exact: true })).toHaveValue(title)
  await page.getByLabel('友链地址', { exact: true }).fill('https://example.com/friend')
  const saved = trackSave(page, 'links')
  await page.getByRole('button', { name: '保存友链', exact: true }).click()
  await saved
  await expect(page.getByRole('status')).toContainText('友链已保存')
  await page.goto('/links')
  await page.getByRole('button', { name: group, exact: true }).click()
  await expect(page.locator('.hub-directory-link')).toHaveCount(1)
  await expect(page.locator('.hub-directory-link')).toHaveAttribute('href', 'https://example.com/friend')
  await expect(page.locator('.hub-directory-link img').first()).toHaveAttribute('src', icon)
})

test('independent content survives disabling projects, honors schedule and leaves Core available', async ({ page }) => {
  const url = await image(page), suffix = marker()
  const album = await create(page, 'albums', { title: '独立相册-' + suffix, images: [{ url, caption: '独立说明' }], published: true })
  const note = await create(page, 'notes', { title: '排期随记-' + suffix, body: '稍后公开', published: true, publishedAt: '2099-01-01T00:00:00.000Z' })
  const hidden = await create(page, 'notes', { title: '私有随记-' + suffix, body: '保留草稿', published: false })
  const link = await create(page, 'links', { title: '独立友链-' + suffix, url: 'https://example.com', published: true })
  expect((await page.request.patch('/api/studio/modules', { headers, data: { id: 'projects', enabled: false } })).ok()).toBeTruthy()
  for (const path of ['/photos', '/notes', '/links']) expect((await page.request.get(path)).status()).toBe(200)
  expect(await (await page.request.get('/photos')).text()).toContain(album.title)
  expect(await (await page.request.get('/links')).text()).toContain(link.title)
  expect(await (await page.request.get('/notes')).text()).not.toContain(note.title)
  expect(await (await page.request.get('/notes')).text()).not.toContain(hidden.title)
  expect(await (await page.request.get('/feed.xml')).text()).not.toContain(note.title)
  expect(await (await page.request.get('/sitemap.xml')).text()).not.toContain('/notes')
  expect((await page.request.patch('/api/studio/content/notes/' + note.id, { headers, data: { publishedAt: '2020-01-01T00:00:00.000Z' } })).ok()).toBeTruthy()
  expect(await (await page.request.get('/notes')).text()).toContain(note.title)
  expect(await (await page.request.get('/feed.xml')).text()).toContain(note.title)
  expect(await (await page.request.get('/sitemap.xml')).text()).toContain('/notes')
  await page.goto('/')
  await expect(page.locator('.hub-header a[href="/photos"]')).toBeVisible()
  await expect(page.locator('.hub-header a[href="/notes"]')).toBeVisible()
  expect((await page.request.patch('/api/studio/modules', { headers, data: { id: 'notes', enabled: false } })).ok()).toBeTruthy()
  expect((await page.request.get('/notes')).status()).toBe(404)
  expect(await (await page.request.get('/feed.xml')).text()).not.toContain(note.title)
  expect((await page.request.get('/')).status()).toBe(200)
})

test('draft content protects every referenced media kind until its record is removed', async ({ page }) => {
  for (const kind of ['albums', 'notes', 'links'] as const) {
    const url = await image(page), name = url.split('/').pop()!
    const extra = kind === 'albums' ? { images: [{ url, caption: '草稿也引用图片' }] } : kind === 'notes' ? { imageUrl: url } : { iconUrl: url, url: 'https://example.com' }
    const item = await create(page, kind, { title: '媒体引用-' + marker(), published: false, ...extra })
    expect((await page.request.delete('/api/studio/media/' + name, { headers })).status()).toBe(409)
    expect((await page.request.delete(`/api/studio/content/${kind}/${item.id}`, { headers })).ok()).toBeTruthy()
    expect((await page.request.delete('/api/studio/media/' + name, { headers })).status()).toBe(200)
  }
})

test('content API rejects anonymous access, forged origins, injected kinds and invalid fields', async ({ page }) => {
  await page.request.post('/api/studio/logout', { headers })
  for (const kind of ['albums', 'notes', 'links']) {
    expect((await page.request.get('/api/studio/content/' + kind)).status()).toBe(401)
    expect((await page.request.post('/api/studio/content/' + kind, { headers, data: { title: 'unauthorized' } })).status()).toBe(401)
  }
  await login(page)
  expect((await page.request.post('/api/studio/content/notes', { headers: { Origin: 'https://evil.invalid' }, data: { title: 'forged' } })).status()).toBe(403)
  for (const [kind, payload] of [
    ['albums', { title: 'bad', images: [{ url: 'javascript:alert(1)', caption: '' }] }],
    ['notes', { title: 'bad', publishedAt: '2026-02-30T00:00:00.000Z' }],
    ['links', { title: 'bad', url: 'https://user:secret@example.com' }],
    ['notes', { title: 'bad', published: 'true' }],
    ['links', { title: 'bad', unexpected: 1 }],
    ['albums', { title: 'bad', coverUrl: 'https://example.com/cover.png', images: Array.from({ length: 48 }, (_, index) => ({ url: 'https://example.com/' + index + '.png', caption: '' })) }],
  ]) expect((await page.request.post('/api/studio/content/' + kind, { headers, data: payload })).status()).toBe(400)
  expect((await page.request.post('/api/studio/content/constructor', { headers, data: { title: 'bad' } })).status()).toBe(400)
  expect((await page.request.patch('/api/studio/content/notes/NaN', { headers, data: { title: 'bad' } })).status()).toBe(400)
  expect((await page.request.post('/api/studio/content/notes', { headers, data: { title: 'bad', body: 'x'.repeat(250_000) } })).status()).toBe(400)
})

test('dirty content blocks tab changes and in-flight saves lock the editor and sidebar', async ({ page }) => {
  const title = '请求期间保护-' + marker()
  await page.goto('/duanap')
  await page.getByRole('button', { name: '友链管理', exact: true }).click()
  await page.getByRole('button', { name: '+ 新增友链', exact: true }).click()
  await page.getByLabel('友链标题', { exact: true }).fill(title)
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: '个人随记', exact: true }).click()
  await expect(page.getByLabel('友链标题', { exact: true })).toHaveValue(title)
  await page.getByLabel('友链地址', { exact: true }).fill('https://example.com')
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/studio/content/links', async route => { if (route.request().method() === 'POST') await pending; await route.continue() })
  const saved = trackSave(page, 'links')
  await page.getByRole('button', { name: '保存友链', exact: true }).click()
  await expect(page.getByLabel('友链标题', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '个人随记', exact: true })).toBeDisabled()
  release(); await saved
  await expect(page.getByRole('status')).toContainText('友链已保存')
  await expect(page.getByLabel('友链标题', { exact: true })).toHaveValue(title)
})

test('content ordering and safe text remain correct on the public pages', async ({ page }) => {
  const suffix = marker(), url = await image(page)
  const later = await create(page, 'albums', { title: '后一相册-' + suffix, images: [{ url, caption: '<script>no execution</script>' }], published: true, sortOrder: 99 })
  const earlier = await create(page, 'albums', { title: '前一相册-' + suffix, images: [{ url, caption: '排在前面' }], published: true, sortOrder: -99 })
  await page.goto('/photos')
  const covers = await page.locator('.hub-album-cover').allTextContents()
  expect(covers.findIndex(text => text.includes(earlier.title))).toBeLessThan(covers.findIndex(text => text.includes(later.title)))
  await page.getByRole('button', { name: '打开相册：' + later.title, exact: true }).click()
  await expect(page.locator('.hub-image-caption')).toHaveText('<script>no execution</script>')
  await expect(page.locator('.hub-image-grid script')).toHaveCount(0)
  const note = await create(page, 'notes', { title: '转义随记-' + suffix, body: '<script>window.bad=1</script>\n\n[bad](javascript:alert(1))', published: true })
  await page.goto('/notes')
  const card = page.locator('#note-' + note.id)
  await expect(card.locator('script')).toHaveCount(0)
  await expect(card.locator('a[href^="javascript:"]')).toHaveCount(0)
})

test('new content editors and public media remain within phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const url = await image(page)
  await page.goto('/duanap')
  await page.getByRole('button', { name: '相册管理', exact: true }).click()
  await page.getByRole('button', { name: '+ 新增相册', exact: true }).click()
  await page.getByLabel('相册标题', { exact: true }).fill('手机编辑-' + marker())
  await page.getByLabel('新增相册图片', { exact: true }).fill(url)
  await page.getByRole('button', { name: '添加图片到相册', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.screenshot({ path: 'test-results/content-album-editor-mobile.png', fullPage: true })
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '个人随记', exact: true }).click()
  await page.getByRole('button', { name: '+ 新增随记', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
})

test('online backups include all independent content and continue excluding sessions', async ({ page }) => {
  const suffix = marker(), url = await image(page)
  const album = await create(page, 'albums', { title: '备份相册-' + suffix, images: [{ url, caption: '图片说明' }], published: true })
  const note = await create(page, 'notes', { title: '备份随记-' + suffix, body: '**保存的正文**', imageUrl: url, published: true })
  const friend = await create(page, 'links', { title: '备份友链-' + suffix, url: 'https://example.com', iconUrl: url, published: true })
  const response = await page.request.post('/api/studio/backups', { headers })
  expect(response.status()).toBe(201)
  const name = (await response.json()).backup.name
  const backup = JSON.parse(gunzipSync(await (await page.request.get('/api/studio/backups/' + name)).body()).toString('utf8'))
  const db = new Database(Buffer.from(backup.database, 'base64'), { readonly: true })
  expect(db.pragma('user_version', { simple: true })).toBe(2)
  expect(db.prepare('SELECT title FROM albums WHERE id=?').get(album.id)).toEqual({ title: album.title })
  expect(db.prepare('SELECT title FROM notes WHERE id=?').get(note.id)).toEqual({ title: note.title })
  expect(db.prepare('SELECT title FROM friend_links WHERE id=?').get(friend.id)).toEqual({ title: friend.title })
  expect(db.prepare('SELECT COUNT(*) AS count FROM admin_sessions').get()).toEqual({ count: 0 })
  db.close()
  expect(backup.media.some((item: { name: string }) => url.endsWith(item.name))).toBeTruthy()
})

test('new dark content forms use dark input surfaces and readable text', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hub-theme', 'dark'))
  await page.goto('/duanap')
  await page.getByRole('button', { name: '相册管理', exact: true }).click()
  await page.getByRole('button', { name: '+ 新增相册', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const luminance = (value: string) => {
    const channels = value.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2]
  }
  for (const label of ['相册标题', '相册排序', '相册封面', '新增相册图片']) {
    const colors = await page.getByLabel(label, { exact: true }).evaluate(element => ({ background: getComputedStyle(element).backgroundColor, text: getComputedStyle(element).color }))
    const background = luminance(colors.background), text = luminance(colors.text)
    expect(background).toBeLessThan(.2)
    expect((Math.max(text, background) + .05) / (Math.min(text, background) + .05)).toBeGreaterThanOrEqual(4.5)
  }
  await page.screenshot({ path: 'test-results/content-album-editor-dark.png', fullPage: true })
})
