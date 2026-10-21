import { expect, test, type Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import type { HubSettings } from '@/lib/types'

const headers = { Origin: 'http://127.0.0.1:1027' }
const publicModules = ['about', 'projects', 'games', 'tools', 'blog', 'photos', 'notes', 'links']
let savedSettings: HubSettings

test.beforeEach(async ({ page }) => {
  const login = await page.request.post('/api/studio/login', { headers, data: { username: 'duanap', password: process.env.HUB_TEST_ADMIN_PASSWORD } })
  expect(login.ok()).toBeTruthy()
  const result = await page.request.put('/api/studio/site', { headers, data: {} })
  expect(result.ok()).toBeTruthy()
  savedSettings = (await result.json()).settings
  for (const id of publicModules) expect((await page.request.patch('/api/studio/modules', { headers, data: { id, enabled: true } })).ok()).toBeTruthy()
})

test.afterEach(async ({ page }) => {
  if (savedSettings) await page.request.put('/api/studio/site', { headers, data: savedSettings })
  for (const id of publicModules) await page.request.patch('/api/studio/modules', { headers, data: { id, enabled: true } })
})

async function project(page: Page, extra: object = {}) {
  const marker = randomBytes(6).toString('hex')
  const response = await page.request.post('/api/studio/projects', { headers, data: { slug: 'layout-' + marker, title: '动态布局-' + marker, published: true, summary: '真实项目数据与页面联动', ...extra } })
  expect(response.status()).toBe(201)
  return (await response.json()).project as { id: number; slug: string; title: string }
}

async function image(page: Page, color: string) {
  const buffer = await sharp({ create: { width: 32, height: 24, channels: 3, background: color } }).png().toBuffer()
  const response = await page.request.post('/api/studio/media', { headers, multipart: { file: { name: 'layout.png', mimeType: 'image/png', buffer } } })
  expect(response.status()).toBe(201)
  return (await response.json()).media.url as string
}

test('Studio profile edits persist into the home, About, Links and Blog pages', async ({ page }) => {
  const name = '布局验收-' + randomBytes(4).toString('hex')
  await page.goto('/duanap')
  await page.getByRole('button', { name: '主页资料', exact: true }).click()
  await page.getByLabel('昵称', { exact: true }).fill(name)
  await page.getByLabel('一句话介绍', { exact: true }).fill('后台保存，公开页面立即更新。')
  await page.getByLabel('博客地址', { exact: true }).fill('https://example.com/layout-blog')
  await page.getByRole('button', { name: '保存站点资料', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已保存')
  await page.goto('/')
  await expect(page.locator('.hub-intro h1')).toContainText(name)
  await expect(page.locator('.hub-intro')).toContainText('后台保存，公开页面立即更新。')
  await page.goto('/about')
  await expect(page.locator('.hub-profile-card h2')).toHaveText(name)
  await page.goto('/blog')
  await expect(page.getByRole('link', { name: '前往博客 ↗', exact: true })).toHaveAttribute('href', 'https://example.com/layout-blog')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  await page.goto('/links')
  await expect(page.locator('a[href="https://example.com/layout-blog"]')).toBeVisible()
})

test('published project covers and screenshots form albums; drafts never enter the gallery', async ({ page }) => {
  const coverUrl = await image(page, '#4b8aab'), screenshot = await image(page, '#b8a577')
  const visible = await project(page, { coverUrl, screenshots: [screenshot], status: 'maintenance' })
  const hidden = await project(page, { published: false, coverUrl })
  await page.goto('/photos')
  await expect(page.getByRole('button', { name: '打开相册：' + hidden.title, exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '打开相册：' + visible.title, exact: true }).click()
  await expect(page.getByRole('button', { name: /^查看图片 / })).toHaveCount(2)
  await page.getByRole('button', { name: '查看图片 1', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '图片预览' })).toBeVisible()
  await expect(page.locator('.hub-lightbox-counter')).toHaveText('1 / 2')
  await page.getByRole('button', { name: '下一张图片', exact: true }).click()
  await expect(page.locator('.hub-lightbox-counter')).toHaveText('2 / 2')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '图片预览' })).not.toBeVisible()
  await page.getByRole('button', { name: '← 全部相册', exact: true }).click()
  await expect(page.getByRole('button', { name: '打开相册：' + visible.title, exact: true })).toBeVisible()
})

test('Notes show only effective published updates and support search and expansion', async ({ page }) => {
  const visible = await project(page)
  const marker = randomBytes(4).toString('hex'), title = '公开动态-' + marker
  for (const data of [
    { title, published: true, body: ('可以展开的项目开发记录。').repeat(24) },
    { title: '排期动态-' + marker, published: true, effectiveAt: '2099-01-01T00:00:00.000Z' },
    { title: '草稿动态-' + marker, published: false },
  ]) expect((await page.request.post('/api/studio/entries', { headers, data: { projectId: visible.id, type: 'notice', ...data } })).status()).toBe(201)
  const html = await (await page.request.get('/notes')).text()
  expect(html).not.toContain('排期动态-' + marker)
  expect(html).not.toContain('草稿动态-' + marker)
  await page.goto('/notes')
  await page.getByRole('searchbox', { name: '搜索动态' }).fill(title)
  await expect(page.locator('.hub-note')).toHaveCount(1)
  await page.getByRole('button', { name: '展开', exact: true }).click()
  await expect(page.getByRole('button', { name: '收起', exact: true })).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: '随机看看', exact: true }).click()
  await expect(page.getByRole('button', { name: '随机看看', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('searchbox', { name: '搜索动态' }).fill('not-found-' + marker)
  await expect(page.getByRole('status')).toContainText('没有找到匹配的动态')
})

test('Links reflect published project state and remove a withdrawn project', async ({ page }) => {
  const visible = await project(page)
  const hidden = await project(page, { published: false })
  await page.goto('/links')
  await page.getByRole('searchbox', { name: '搜索公开链接' }).fill(visible.title)
  await expect(page.locator('.hub-directory-link')).toHaveCount(1)
  await expect(page.locator('.hub-directory-link')).toHaveAttribute('href', '/projects/' + visible.slug)
  expect(await (await page.request.get('/links')).text()).not.toContain(hidden.title)
  expect((await page.request.patch('/api/studio/projects/' + visible.id, { headers, data: { published: false } })).ok()).toBeTruthy()
  await page.reload()
  await page.getByRole('searchbox', { name: '搜索公开链接' }).fill(visible.title)
  await expect(page.getByRole('status')).toContainText('没有找到匹配的链接')
})

test('new public modules respect route, navigation and sitemap switches', async ({ page }) => {
  const created = await project(page, { coverUrl: await image(page, '#507786') })
  expect((await page.request.post('/api/studio/entries', { headers, data: { projectId: created.id, type: 'changelog', title: '站点地图动态', body: '已发布', published: true } })).ok()).toBeTruthy()
  const map = await (await page.request.get('/sitemap.xml')).text()
  for (const path of ['/photos', '/notes', '/links']) expect(map).toContain(path)
  expect(map).not.toContain('/blog')
  for (const id of ['blog', 'photos', 'notes', 'links']) {
    expect((await page.request.patch('/api/studio/modules', { headers, data: { id, enabled: false } })).ok()).toBeTruthy()
    expect((await page.request.get('/' + id)).status()).toBe(404)
  }
  await page.goto('/')
  for (const path of ['/blog', '/photos', '/notes', '/links']) await expect(page.locator('.hub-header a[href="' + path + '"]')).toHaveCount(0)
  const disabledMap = await (await page.request.get('/sitemap.xml')).text()
  for (const path of ['/blog', '/photos', '/notes', '/links']) expect(disabledMap).not.toContain(path)
  expect((await page.request.get('/')).status()).toBe(200)
  expect((await page.request.get('/api/health')).status()).toBe(200)
})

test('six main pages work at phone width with navigation, local assets and theme controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ['/', '/blog', '/photos', '/notes', '/links', '/about']) {
    const response = await page.goto(path)
    expect(response?.status()).toBe(200)
    await expect(page.locator('h1')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    if (path === '/') {
      const intro = await page.locator('.hub-intro').boundingBox(), music = await page.locator('.hub-music-tile').boundingBox(), main = await page.locator('.hub-main').boundingBox()
      expect(intro && music && main).toBeTruthy()
      expect(intro!.width).toBeGreaterThan(main!.width * .95)
      expect(music!.width).toBeGreaterThan(main!.width * .95)
      expect(music!.y).toBeGreaterThanOrEqual(intro!.y + intro!.height)
    }
    await page.screenshot({ path: 'test-results/public-' + (path.slice(1) || 'home') + '-mobile.png', fullPage: true })
  }
  await page.getByRole('button', { name: '展开导航', exact: true }).click()
  await page.getByRole('navigation', { name: '手机导航' }).getByRole('link', { name: '博客', exact: true }).click()
  await expect(page).toHaveURL('/blog')
  await expect(page.getByRole('navigation', { name: '手机导航' })).toHaveCount(0)
  await page.getByRole('button', { name: '切换浅色模式', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const icons = await page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('.hub-icon')].map(image => ({ complete: image.complete, width: image.naturalWidth })))
  expect(icons.every(icon => icon.complete && icon.width > 0)).toBeTruthy()
})

test('desktop Bento composition retains the wide introduction, clock and image column', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const intro = await page.locator('.hub-intro').boundingBox(), clock = await page.locator('.hub-clock-tile').boundingBox(), photos = await page.locator('.hub-photo-tile').boundingBox()
  expect(intro && clock && photos).toBeTruthy()
  expect(intro!.width).toBeGreaterThan(clock!.width)
  expect(clock!.x).toBeGreaterThanOrEqual(intro!.x + intro!.width)
  expect(Math.abs(clock!.y - intro!.y)).toBeLessThan(2)
  expect(photos!.y).toBeGreaterThanOrEqual(clock!.y + clock!.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  const backdrop = await page.locator('.hub-public').evaluate(element => ({ image: getComputedStyle(element).backgroundImage, size: getComputedStyle(element).backgroundSize }))
  expect(backdrop.image).toContain('linear-gradient')
  expect(backdrop.size).toContain('90px')
  await page.screenshot({ path: 'test-results/public-home-desktop.png', fullPage: true })
})

test('blog URL rejects unsafe and ambiguous addresses without changing saved settings', async ({ page }) => {
  for (const blogUrl of ['javascript:alert(1)', '//evil.invalid', '/local-blog', 'https://example.com\\@evil.invalid']) {
    expect((await page.request.put('/api/studio/site', { headers, data: { blogUrl } })).status()).toBe(400)
  }
  const result = await page.request.put('/api/studio/site', { headers, data: {} })
  expect((await result.json()).settings.blogUrl).toBe(savedSettings.blogUrl)
})
