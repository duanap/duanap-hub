import { test, expect, type Page } from '@playwright/test'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { spawnSync } from 'node:child_process'
import Database from 'better-sqlite3'
import type { HubSettings } from '@/lib/types'

const headers = { Origin: 'http://127.0.0.1:1027' }
const fixtureFile = () => process.env.HUB_TEST_BLOG_FIXTURE!
const dataDirectory = () => process.env.HUB_TEST_DATA_DIR!
let original: HubSettings
async function login(page: Page) {
  expect((await page.request.post('/api/studio/login', { headers, data: { username: 'duanap', password: process.env.HUB_TEST_ADMIN_PASSWORD } })).ok()).toBeTruthy()
}
async function settings(page: Page, data: Partial<HubSettings>) {
  const response = await page.request.put('/api/studio/site', { headers, data })
  expect(response.status()).toBe(200)
  return (await response.json()).settings as HubSettings
}
async function fixture(mode: string, posts: unknown[] = []) { await mkdir(dataDirectory(), { recursive: true }); await writeFile(fixtureFile(), JSON.stringify({ mode, posts })) }
function posts(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: index + 1, status: 'publish', date_gmt: '2026-01-01T00:00:00', link: `https://wordpress-fixture.invalid/subsite/posts/${index + 1}`, title: { rendered: `文章 ${index + 1} &amp; 想法` }, excerpt: { rendered: '<p>仅公开摘要 <strong>正文</strong><script>window.evil=1</script></p>' }, _embedded: { 'wp:term': [[{ name: index % 2 ? '生活' : '开发' }]], 'wp:featuredmedia': [] } }))
}
async function sync(page: Page) { return (await page.request.post('/api/studio/blog', { headers })).json() }
async function requests() { return (await readFile(fixtureFile() + '.requests', 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) }

test.beforeEach(async ({ page }) => {
  await login(page)
  original = await settings(page, {})
  await page.request.patch('/api/studio/modules', { headers, data: { id: 'blog', enabled: true } })
})
test.afterEach(async ({ page }) => {
  await login(page)
  await settings(page, original)
  await page.request.patch('/api/studio/modules', { headers, data: { id: 'blog', enabled: true } })
})

test('Studio card composition and text persist, public layouts follow order and default can be restored', async ({ page }) => {
  await page.goto('/duanap')
  await page.getByRole('button', { name: '首页编排', exact: true }).click()
  await page.getByLabel('一句话卡片（留空使用个人介绍）').fill('每天记录一点。')
  await page.getByLabel('终端文字（留空使用默认命令）').fill('$ hello\n来自后台的文字')
  await page.getByLabel('最近记录文字（留空显示最新动态）').fill('一本新书')
  await page.getByLabel('最近记录链接', { exact: true }).fill('/notes')
  await page.getByRole('button', { name: '上移卡片 时钟', exact: true }).click()
  await page.getByLabel('时钟宽度').selectOption('full')
  await page.getByLabel('作品概览', { exact: true }).uncheck()
  await page.getByRole('button', { name: '保存首页设置', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('站点设置已保存')
  await page.reload()
  await page.getByRole('button', { name: '首页编排', exact: true }).click()
  await expect(page.getByLabel('时钟宽度')).toHaveValue('full')
  await expect(page.getByLabel('作品概览', { exact: true })).not.toBeChecked()
  await page.goto('/')
  await expect(page.locator('.hub-board')).toHaveClass(/hub-board-custom/)
  await expect(page.locator('[data-widget=garden]')).toHaveCount(0)
  expect(await page.locator('.hub-board>.hub-tile').first().getAttribute('data-widget')).toBe('clock')
  await expect(page.locator('.hub-quote-tile')).toContainText('每天记录一点。')
  await expect(page.locator('.hub-console')).toContainText('来自后台的文字')
  await expect(page.locator('.hub-reading-tile a')).toHaveAttribute('href', '/notes')
  const widths = await page.locator('.hub-board').evaluate(board => ({ board: board.clientWidth, clock: board.querySelector('[data-widget=clock]')!.getBoundingClientRect().width }))
  expect(Math.abs(widths.board - widths.clock)).toBeLessThan(2)
  await page.setViewportSize({ width: 820, height: 1000 })
  const tablet = await page.locator('.hub-board').evaluate(board => ({ board: board.clientWidth, clock: board.querySelector('[data-widget=clock]')!.getBoundingClientRect().width }))
  expect(Math.abs(tablet.board - tablet.clock)).toBeLessThan(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.screenshot({ path: 'test-results/home-custom-mobile.png', fullPage: true })
  await page.goto('/duanap'); await page.getByRole('button', { name: '首页编排', exact: true }).click()
  await page.getByRole('button', { name: '恢复默认卡片', exact: true }).click()
  await page.getByRole('button', { name: '保存首页设置', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('站点设置已保存')
  await page.goto('/')
  await expect(page.locator('.hub-board')).not.toHaveClass(/hub-board-custom/)
  await expect(page.locator('.hub-board>.hub-tile')).toHaveCount(13)
})

function wav(seconds = 1) {
  const rate = 8000, size = rate * seconds * 2, buffer = Buffer.alloc(44 + size)
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + size, 4); buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36); buffer.writeUInt32LE(size, 40)
  return buffer
}
test('Studio playlist plays real audio, advances on ending, handles failure and local file fallback', async ({ page }) => {
  let mediaRequests = 0
  await page.route('https://audio.example.test/**', async route => { mediaRequests++; await route.fulfill({ contentType: 'audio/wav', body: wav(route.request().url().endsWith('/one.wav') ? 1 : 30) }) })
  await page.goto('/duanap'); await page.getByRole('button', { name: '首页编排', exact: true }).click()
  await page.getByRole('button', { name: '添加歌曲', exact: true }).click()
  await page.getByLabel('歌曲名称 1', { exact: true }).fill('第一首')
  await page.getByLabel('作者 1', { exact: true }).fill('本地验收')
  await page.getByLabel('音频直链 1', { exact: true }).fill('https://audio.example.test/one.wav')
  await page.getByRole('button', { name: '添加歌曲', exact: true }).click()
  await page.getByLabel('歌曲名称 2', { exact: true }).fill('第二首')
  await page.getByLabel('音频直链 2', { exact: true }).fill('https://audio.example.test/two.wav')
  await page.getByRole('button', { name: '保存首页设置', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('站点设置已保存')
  await page.goto('/')
  const audio = page.getByLabel('音乐播放器', { exact: true })
  await expect(audio).toHaveAttribute('preload', 'none')
  expect(await audio.evaluate(element => (element as HTMLAudioElement).paused)).toBeTruthy()
  expect(mediaRequests).toBe(0)
  await audio.evaluate(element => (element as HTMLAudioElement).play())
  await expect(audio).toHaveAttribute('src', 'https://audio.example.test/two.wav')
  await expect.poll(() => audio.evaluate(element => !(element as HTMLAudioElement).paused)).toBeTruthy()
  await page.getByRole('button', { name: '上一首', exact: true }).click()
  await expect(audio).toHaveAttribute('src', 'https://audio.example.test/one.wav')
  await expect.poll(() => audio.evaluate(element => !(element as HTMLAudioElement).paused)).toBeTruthy()
  await page.locator('input[aria-label="选择本地音乐"]').setInputFiles({ name: 'local-test.wav', mimeType: 'audio/wav', buffer: wav() })
  await expect(page.locator('.hub-audio-body>strong')).toHaveText('local-test.wav')
  await expect(audio).toHaveAttribute('src', /^blob:/)
  await page.getByRole('button', { name: '返回站点歌单', exact: true }).click()
  await expect(audio).toHaveAttribute('src', 'https://audio.example.test/one.wav')
  await page.unroute('https://audio.example.test/**')
  await page.route('https://audio.example.test/**', route => route.abort())
  await page.getByRole('button', { name: '下一首', exact: true }).click()
  await audio.evaluate(element => (element as HTMLAudioElement).play().catch(() => undefined))
  await expect(page.locator('.hub-audio [role=status]')).toContainText('音频暂时无法播放')
  await page.unroute('https://audio.example.test/**')
  await page.route('https://audio.example.test/**', route => route.fulfill({ contentType: 'audio/wav', body: wav(30) }))
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await audio.evaluate(element => (element as HTMLAudioElement).play())
  await expect(page.locator('.hub-audio [role=status]')).toHaveCount(0)
})

test('new settings reject malformed composition and unsafe URLs while preserving saved data', async ({ page }) => {
  for (const data of [
    { homeWidgets: [] }, { homeWidgets: original.homeWidgets.map(() => original.homeWidgets[0]) },
    { homeWidgets: original.homeWidgets.map(widget => ({ ...widget, enabled: 'false' })) },
    { homeReadingUrl: '//evil.test' }, { homeReadingUrl: 'javascript:alert(1)' }, { blogSyncEnabled: 'true' },
    { musicPlaylist: [{ title: 'unsafe', artist: '', url: 'javascript:alert(1)', coverUrl: '' }] },
    { musicPlaylist: [{ title: 'unsafe', artist: '', url: 'https://user:secret@example.com/a.mp3', coverUrl: '' }] },
    { musicPlaylist: [{ title: 'unsafe', artist: '', url: 'https://example.com/a.mp3', coverUrl: 'data:image/svg+xml,hi' }] },
  ]) expect((await page.request.put('/api/studio/site', { headers, data })).status()).toBe(400)
  expect(await settings(page, {})).toEqual(original)
  const anonymous = await page.context().browser()!.newContext()
  expect((await anonymous.request.get('http://127.0.0.1:1027/api/studio/blog')).status()).toBe(401)
  expect((await anonymous.request.post('http://127.0.0.1:1027/api/studio/blog', { headers })).status()).toBe(401)
  await anonymous.close()
  expect((await page.request.post('/api/studio/blog', { headers: { Origin: 'https://evil.test' } })).status()).toBe(403)
})

test('home editor stays readable in dark mode and fits a phone with song fields', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hub-theme', 'dark'))
  await page.goto('/duanap'); await page.getByRole('button', { name: '首页编排', exact: true }).click()
  await page.getByRole('button', { name: '添加歌曲', exact: true }).click()
  await page.getByLabel('歌曲名称 1', { exact: true }).fill('可编辑的歌曲')
  await page.getByLabel('音频直链 1', { exact: true }).fill('javascript:bad')
  const luminance = (color: string) => {
    const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
  }
  for (const label of ['最近记录文字（留空显示最新动态）', '歌曲名称 1', '时钟宽度']) {
    const colors = await page.getByLabel(label, { exact: true }).evaluate(element => ({ bg: getComputedStyle(element).backgroundColor, text: getComputedStyle(element).color }))
    const bg = luminance(colors.bg), text = luminance(colors.text)
    expect(bg, label).toBeLessThan(.2)
    expect((Math.max(bg, text) + .05) / (Math.min(bg, text) + .05), label).toBeGreaterThanOrEqual(4.5)
  }
  await page.getByRole('button', { name: '保存首页设置', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: '歌单' })).toBeVisible()
  await expect(page.getByLabel('歌曲名称 1', { exact: true })).toHaveValue('可编辑的歌曲')
  await page.getByLabel('音频直链 1', { exact: true }).fill('https://example.com/song.mp3')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.screenshot({ path: 'test-results/home-studio-dark-mobile.png', fullPage: true })
  await page.getByRole('button', { name: '保存首页设置', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('站点设置已保存')
})

test('WordPress index supports search, tags, pagination and safe canonical excerpt details', async ({ page }) => {
  const values = posts(12)
  await fixture('success', [...values,
    { ...values[0], id: 13, status: 'draft', title: { rendered: '不应公开的草稿' } },
    { ...values[0], id: 14, date_gmt: '2099-01-01T00:00:00', title: { rendered: '不应公开的未来文章' } },
    { ...values[0], id: 15, link: 'javascript:alert(1)' },
  ])
  await settings(page, { blogSyncEnabled: true })
  expect(await sync(page)).toMatchObject({ status: 'ready', count: 12, stale: false })
  await page.goto('/blog')
  await expect(page.locator('.hub-article')).toHaveCount(9)
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/)
  await page.getByRole('link', { name: '下一页 →', exact: true }).click()
  await expect(page.locator('.hub-article')).toHaveCount(3)
  await page.getByRole('link', { name: '文章 12 & 想法', exact: true }).click()
  await expect(page.getByRole('heading', { name: '文章 12 & 想法' })).toBeVisible()
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', values[11].link)
  await expect(page.getByRole('link', { name: '阅读完整原文与讨论 ↗' })).toHaveAttribute('href', values[11].link)
  await expect(page.locator('.hub-blog-excerpt')).toHaveText('仅公开摘要 正文')
  expect(await page.evaluate(() => 'evil' in window)).toBeFalsy()
  await page.getByRole('link', { name: '#生活', exact: true }).click()
  await expect(page.locator('.hub-article')).toHaveCount(6)
  await page.getByRole('searchbox', { name: '搜索文章' }).fill('文章 12')
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await expect(page.locator('.hub-article')).toHaveCount(1)
  await page.getByRole('searchbox', { name: '搜索文章' }).fill('不存在的文章')
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await expect(page.locator('[role=status]')).toContainText('没有找到匹配的文章')
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/blog')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.screenshot({ path: 'test-results/blog-dynamic-mobile.png', fullPage: true })
  expect((await page.request.get('/blog/999999')).status()).toBe(404)
  expect((await requests()).every(request => request.redirect === 'error' && new URL(request.url).pathname === '/subsite/wp-json/wp/v2/posts')).toBeTruthy()
})

test('WordPress fetch is bounded to five pages and Studio can refresh without editing originals', async ({ page }) => {
  await fixture('success', posts(501))
  await settings(page, { blogSyncEnabled: true })
  const before = (await requests()).length
  await page.goto('/duanap'); await page.getByRole('button', { name: '主页资料', exact: true }).click()
  await page.getByRole('button', { name: '刷新文章摘要', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已同步 500 篇公开摘要')
  expect((await requests()).length - before).toBe(5)
  await page.goto('/blog?page=9999')
  await expect(page.locator('.hub-pagination')).toContainText('56 / 56')
  await expect(page.locator('.hub-status-note')).toContainText('最近500篇')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: 'test-results/blog-dynamic-desktop.png', fullPage: true })
})

test('timeouts, invalid and oversized WordPress responses preserve cache and never block Core', async ({ page }) => {
  await fixture('success', posts(3)); await settings(page, { blogSyncEnabled: true })
  expect((await sync(page)).status).toBe('ready')
  const cacheFile = path.join(dataDirectory(), 'cache/wordpress-index.json'), baseline = await readFile(cacheFile, 'utf8')
  for (const mode of ['failure', 'invalid', 'oversize', 'timeout']) {
    await fixture(mode)
    expect(await sync(page)).toMatchObject({ status: 'unavailable', count: 3, stale: true })
    expect(await readFile(cacheFile, 'utf8')).toBe(baseline)
  }
  await page.goto('/blog')
  await expect(page.locator('.hub-article')).toHaveCount(3)
  await expect(page.locator('[role=status]')).toContainText('上次保存的摘要')
  const before = (await requests()).length
  for (const url of ['/', '/about', '/projects', '/photos', '/notes', '/links', '/duanap', '/robots.txt', '/sitemap.xml', '/feed.xml']) expect((await page.request.get(url)).status()).toBe(200)
  expect((await requests()).length).toBe(before)
  expect((await page.request.get('/cache/wordpress-index.json')).status()).toBe(404)
  await settings(page, { blogSyncEnabled: false })
  expect((await sync(page)).status).toBe('disabled')
  expect((await page.request.get('/blog/1')).status()).toBe(404)
  expect((await requests()).length).toBe(before)
  await page.request.patch('/api/studio/modules', { headers, data: { id: 'blog', enabled: false } })
  await settings(page, { blogSyncEnabled: true })
  expect((await sync(page)).status).toBe('disabled')
  expect((await page.request.get('/blog')).status()).toBe(404)
  expect((await requests()).length).toBe(before)
  await fixture('success', []) // No network state leaks to later suites.
})

test('new home, playlist and blog settings survive actual online backup, offline restore and rollback', async ({ page }) => {
  const changed = await settings(page, { homeQuote: '恢复演练', homeWidgets: original.homeWidgets.map(widget => ({ ...widget, enabled: widget.id !== 'clock' })), musicPlaylist: [{ title: '演练歌曲', artist: '本地', url: 'https://example.com/song.mp3', coverUrl: '' }], blogSyncEnabled: true })
  const response = await page.request.post('/api/studio/backups', { headers })
  expect(response.status()).toBe(201)
  const archive = await (await page.request.get('/api/studio/backups/' + (await response.json()).backup.name)).body()
  const decoded = JSON.parse(gunzipSync(archive).toString('utf8'))
  const db = new Database(Buffer.from(decoded.database, 'base64'), { readonly: true })
  expect(JSON.parse((db.prepare('SELECT json FROM site_settings').get() as { json: string }).json)).toEqual(changed)
  expect(db.prepare('SELECT COUNT(*) AS count FROM admin_sessions').get()).toEqual({ count: 0 }); db.close()
  const target = path.join(dataDirectory(), 'restore-home-test'), input = path.join(dataDirectory(), 'home-test.hub.gz')
  await mkdir(target)
  const prior = new Database(Buffer.from(decoded.database, 'base64'))
  prior.prepare('UPDATE site_settings SET json=? WHERE id=1').run(JSON.stringify(original))
  await writeFile(path.join(target, 'hub.sqlite'), prior.serialize()); prior.close()
  await writeFile(input, archive)
  const restored = spawnSync(process.execPath, ['scripts/restore-backup.mjs', '--input', input, '--data-dir', target, '--confirm-restore'], { encoding: 'utf8' })
  expect(restored.status, restored.stderr).toBe(0)
  const after = new Database(path.join(target, 'hub.sqlite'), { readonly: true })
  expect(JSON.parse((after.prepare('SELECT json FROM site_settings').get() as { json: string }).json)).toEqual(changed); after.close()
  const rollback = restored.stdout.trim().split('rollback: ')[1]
  const reversed = spawnSync(process.execPath, ['scripts/restore-backup.mjs', '--input', path.join(rollback, 'rollback.hub.gz'), '--data-dir', target, '--confirm-restore'], { encoding: 'utf8' })
  expect(reversed.status, reversed.stderr).toBe(0)
  const before = new Database(path.join(target, 'hub.sqlite'), { readonly: true })
  expect(JSON.parse((before.prepare('SELECT json FROM site_settings').get() as { json: string }).json)).toEqual(original); before.close()
})
