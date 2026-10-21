import { testOrigin } from './helpers/origin'
import { test, expect, type Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import Database from 'better-sqlite3'
import { gunzipSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import type { ContentKind, HubSettings } from '@/lib/types'

const headers = { Origin: testOrigin }
let original: HubSettings
let records: { kind: ContentKind; id: number }[]
let projects: number[]
let media: string[]
const marker = () => randomBytes(5).toString('hex')
async function login(page: Page) {
  expect((await page.request.post('/api/studio/login', { headers, data: { username: 'duanap', password: process.env.HUB_TEST_ADMIN_PASSWORD } })).ok()).toBeTruthy()
}
async function settings(page: Page, data: Partial<HubSettings>) {
  const response = await page.request.put('/api/studio/site', { headers, data })
  expect(response.status(), await response.text()).toBe(200)
  return (await response.json()).settings as HubSettings
}
async function create(page: Page, kind: ContentKind, data: object) {
  const response = await page.request.post('/api/studio/content/' + kind, { headers, data })
  expect(response.status(), await response.text()).toBe(201)
  const item = (await response.json()).item
  records.push({ kind, id: item.id }); return item
}
async function image(page: Page) {
  const buffer = await sharp({ create: { width: 60, height: 40, channels: 3, background: '#da798e' } }).png().toBuffer()
  const response = await page.request.post('/api/studio/media', { headers, multipart: { file: { name: 'test.png', mimeType: 'image/png', buffer } } })
  expect(response.status()).toBe(201)
  const item = (await response.json()).media; media.push(item.name); return item.url as string
}
test.beforeEach(async ({ page }) => {
  records = []; projects = []; media = []; await login(page); original = await settings(page, {})
  for (const id of ['photos', 'notes', 'links', 'blog', 'about']) await page.request.patch('/api/studio/modules', { headers, data: { id, enabled: true } })
})
test.afterEach(async ({ page }) => {
  await login(page); await settings(page, original)
  for (const record of records) await page.request.delete(`/api/studio/content/${record.kind}/${record.id}`, { headers })
  for (const id of projects) await page.request.delete('/api/studio/projects/' + id, { headers })
  for (const name of media) await page.request.delete('/api/studio/media/' + name, { headers })
  for (const id of ['projects', 'tools', 'games', 'content']) await page.request.patch('/api/studio/modules', { headers, data: { id, enabled: false } })
})

test('project data never supplies replica albums, notes, tags, links or extra home sections', async ({ page }) => {
  const suffix = marker(), url = await image(page)
  await page.request.patch('/api/studio/modules', { headers, data: { id: 'projects', enabled: true } })
  const response = await page.request.post('/api/studio/projects', { headers, data: { title: '旧项目-' + suffix, slug: 'old-' + suffix, published: true, coverUrl: url, screenshots: [url], tags: ['旧项目标签-' + suffix] } })
  expect(response.status()).toBe(201)
  const project = (await response.json()).project; projects.push(project.id)
  expect((await page.request.post('/api/studio/entries', { headers, data: { projectId: project.id, title: '旧项目公告-' + suffix, type: 'notice', body: '不属于朋友圈文案', published: true } })).status()).toBe(201)
  for (const pathname of ['/', '/photos', '/notes', '/links', '/feed.xml']) {
    const text = await (await page.request.get(pathname)).text()
    expect(text).not.toContain(project.title)
    expect(text).not.toContain('旧项目公告-' + suffix)
    expect(text).not.toContain('旧项目标签-' + suffix)
  }
  expect(await (await page.request.get('/sitemap.xml')).text()).not.toContain('/projects')
  await page.goto('/')
  await expect(page.locator('.hub-board>.hub-tile')).toHaveCount(13)
  await expect(page.locator('.home-widgets,[data-module=projects]')).toHaveCount(0)
  await expect(page.locator('.hub-desktop-nav a')).toHaveCount(5)
  await expect(page.locator('.hub-header a[href="/projects"],.hub-header a[href="/tools"],.hub-header a[href="/account"]')).toHaveCount(0)
})

test('a title-free sentence is published from Studio as a note and can be withdrawn', async ({ page }) => {
  const body = '今晚的风很轻。' + marker()
  await page.goto('/duanap'); await page.getByRole('button', { name: '文案管理', exact: true }).click()
  await page.getByRole('button', { name: '+ 新增文案', exact: true }).click()
  await page.getByRole('group', { name: '文案正文编辑器', exact: true }).getByRole('button', { name: 'Markdown 源码', exact: true }).click()
  await page.getByLabel('文案正文（Markdown）', { exact: true }).fill(body)
  await page.getByLabel('公开发布文案').check()
  const pending = page.waitForResponse(response => response.url().endsWith('/api/studio/content/notes') && response.request().method() === 'POST')
  await page.getByRole('button', { name: '保存文案', exact: true }).click()
  const saved = await pending; expect(saved.status()).toBe(201)
  const item = (await saved.json()).item; records.push({ kind: 'notes', id: item.id })
  expect(item.title).toBe('')
  await page.goto('/notes'); await expect(page.locator('#note-' + item.id)).toContainText(body)
  await expect(page.locator('#note-' + item.id + ' h2')).toHaveCount(0)
  expect(await (await page.request.get('/feed.xml')).text()).toContain(body)
  await page.request.patch('/api/studio/content/notes/' + item.id, { headers, data: { published: false } })
  expect(await (await page.request.get('/notes')).text()).not.toContain(body)
})

test('Studio home content, chosen photos, colored icons and card layout persist independently', async ({ page }) => {
  const url = await image(page)
  await page.goto('/duanap'); await page.getByRole('button', { name: '首页编排', exact: true }).click()
  await page.getByLabel('兴趣标签（一行一个）').fill('摄影\n慢跑\n写字')
  await page.getByLabel('小花园文字', { exact: true }).fill('照顾一株绿植。')
  await page.getByLabel('一句话卡片', { exact: true }).fill('今天也有值得留下的小事。')
  await page.getByLabel('一句话署名', { exact: true }).fill('自己')
  await page.getByLabel('在读卡片内容', { exact: true }).fill('一本喜欢的书')
  await page.getByLabel('首页照片来源').selectOption('custom')
  await page.getByLabel('新增首页照片', { exact: true }).fill(url)
  await page.getByRole('button', { name: '添加首页照片', exact: true }).click()
  await page.getByLabel('站点标志', { exact: true }).fill(url)
  await page.getByLabel('文案图标', { exact: true }).fill(url)
  await page.getByRole('button', { name: '上移卡片 时钟', exact: true }).click()
  await page.getByLabel('时钟宽度').selectOption('full')
  await page.getByRole('button', { name: '保存首页设置', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('站点设置已保存')
  await page.reload(); await page.getByRole('button', { name: '首页编排', exact: true }).click()
  await expect(page.getByLabel('兴趣标签（一行一个）')).toHaveValue('摄影\n慢跑\n写字')
  await page.goto('/')
  await expect(page.locator('.hub-garden')).toContainText('照顾一株绿植。')
  await expect(page.locator('.hub-reading-tile')).toContainText('一本喜欢的书')
  await expect(page.locator('.hub-tag-cloud')).toHaveText('摄影慢跑写字')
  await expect(page.locator('.hub-photo-strip img').first()).toHaveAttribute('src', url)
  await expect(page.locator('.hub-wordmark img')).toHaveAttribute('src', url)
  const icon = page.locator('.hub-desktop-nav a[href="/notes"] img')
  await expect(icon).toHaveAttribute('src', url)
  expect(await icon.evaluate(element => getComputedStyle(element).filter)).toBe('none')
  expect(await page.locator('.hub-board>.hub-tile').first().getAttribute('data-widget')).toBe('clock')
  expect((await page.request.delete('/api/studio/media/' + media[0], { headers })).status()).toBe(409)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
})

test('albums batch-upload photos, separate the cover, persist order and honor publication', async ({ page }) => {
  const title = '生活相册-' + marker(), cover = await image(page)
  const buffer = await sharp({ create: { width: 40, height: 60, channels: 3, background: '#8dbeab' } }).png().toBuffer()
  await page.goto('/duanap'); await page.getByRole('button', { name: '相册管理', exact: true }).click()
  await page.getByRole('button', { name: '+ 新增相册', exact: true }).click()
  await page.getByLabel('相册标题', { exact: true }).fill(title)
  await page.getByLabel('相册封面', { exact: true }).fill(cover)
  const uploads: string[] = []
  page.on('response', async response => { if (response.url().endsWith('/api/studio/media') && response.request().method() === 'POST' && response.status() === 201) { const item = (await response.json()).media; uploads.push(item.name) } })
  await page.getByLabel('批量上传相册照片').setInputFiles([{ name: 'one.png', mimeType: 'image/png', buffer }, { name: 'two.png', mimeType: 'image/png', buffer }])
  await expect(page.locator('.studio-album-row')).toHaveCount(2)
  media.push(...uploads)
  await page.getByLabel('图片说明 1', { exact: true }).fill('在路上')
  await page.getByRole('button', { name: '上移图片 2', exact: true }).click()
  await page.getByLabel('公开发布相册').check()
  const pending = page.waitForResponse(response => response.url().endsWith('/api/studio/content/albums') && response.request().method() === 'POST')
  await page.getByRole('button', { name: '保存相册', exact: true }).click()
  const saved = await pending; expect(saved.status()).toBe(201)
  const item = (await saved.json()).item; records.push({ kind: 'albums', id: item.id })
  await page.goto('/photos'); await page.getByRole('button', { name: '打开相册：' + title }).click()
  await expect(page.locator('.hub-image-grid>button')).toHaveCount(2)
  expect(await page.locator('.hub-image-grid img').evaluateAll(images => images.map(image => image.getAttribute('src')))).not.toContain(cover)
  await page.getByRole('button', { name: '查看图片 2', exact: true }).click()
  await expect(page.locator('.hub-lightbox-caption')).toHaveText('在路上')
  await page.keyboard.press('Escape')
  await page.request.patch('/api/studio/content/albums/' + item.id, { headers, data: { published: false } })
  expect(await (await page.request.get('/photos')).text()).not.toContain(title)
})

function wav(seconds: number) {
  const size = 8000 * seconds * 2, buffer = Buffer.alloc(44 + size)
  buffer.write('RIFF'); buffer.writeUInt32LE(36 + size, 4); buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(size, 40); return buffer
}
test('the managed library really plays, advances, searches, seeks and survives public navigation', async ({ page }) => {
  let requests = 0
  await page.route('https://replica-audio.invalid/**', async route => {
    requests++
    const buffer = wav(route.request().url().endsWith('one.wav') ? 1 : 30)
    const range = route.request().headers()['range']?.match(/^bytes=(\d+)-(\d*)$/)
    const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), buffer.length - 1) : buffer.length - 1
    await route.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${buffer.length}` } : {}) }, body: buffer.subarray(start, end + 1) })
  })
  await page.goto('/duanap'); await page.getByRole('button', { name: '歌曲库', exact: true }).click()
  for (const [position, name, filename] of [[1, '第一首', 'one'], [2, '第二首', 'two']] as const) {
    await page.getByRole('button', { name: '添加歌曲', exact: true }).click()
    await page.getByLabel('歌曲名称 ' + position, { exact: true }).fill(name)
    await page.getByLabel('歌手 ' + position, { exact: true }).fill('测试歌手')
    await page.getByLabel('音频直链 ' + position, { exact: true }).fill('https://replica-audio.invalid/' + filename + '.wav')
  }
  await page.getByRole('button', { name: '保存歌曲库', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('站点设置已保存')
  await page.goto('/')
  const audio = page.getByTestId('site-audio')
  expect(await audio.evaluate(element => (element as HTMLAudioElement).paused)).toBeTruthy(); expect(requests).toBe(0)
  await page.locator('.hub-music-open').click()
  await page.getByRole('button', { name: '播放歌曲：第一首', exact: true }).click()
  await expect(audio).toHaveAttribute('src', 'https://replica-audio.invalid/two.wav')
  await expect.poll(() => audio.evaluate(element => !(element as HTMLAudioElement).paused)).toBeTruthy()
  await page.getByLabel('搜索歌曲', { exact: true }).fill('第二')
  await expect(page.getByRole('button', { name: '播放歌曲：第一首', exact: true })).toHaveCount(0)
  await page.getByLabel('音量', { exact: true }).fill('0.3')
  expect(await audio.evaluate(element => (element as HTMLAudioElement).volume)).toBe(0.3)
  await page.getByLabel('播放进度', { exact: true }).fill('8')
  await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).currentTime)).toBeGreaterThan(7)
  await audio.evaluate(element => { element.dataset.continuity = 'same-element' })
  await page.keyboard.press('Escape')
  await page.locator('.hub-desktop-nav').getByRole('link', { name: '文案', exact: true }).click()
  await expect(page).toHaveURL(/\/notes$/)
  await expect(audio).toHaveAttribute('data-continuity', 'same-element')
  await expect.poll(() => audio.evaluate(element => !(element as HTMLAudioElement).paused && (element as HTMLAudioElement).currentTime > 7)).toBeTruthy()
  await page.getByRole('button', { name: '打开歌曲库', exact: true }).click()
  await page.getByRole('button', { name: '暂停音乐', exact: true }).click()
  expect(await audio.evaluate(element => (element as HTMLAudioElement).paused)).toBeTruthy()
  await page.getByRole('button', { name: '切换播放模式', exact: true }).click()
  await expect(page.getByRole('button', { name: '切换播放模式', exact: true })).toHaveText('随机播放')
})

test('unpublished songs stay private and playback failure has a recoverable UI', async ({ page }) => {
  await settings(page, { musicPlaylist: [{ title: '公开歌曲', artist: '', url: 'https://replica-audio.invalid/broken.wav', coverUrl: '' }, { title: '私有歌曲', artist: '不能泄漏', url: 'https://private.invalid/secret.mp3', coverUrl: '', enabled: false }] })
  let healthy = false
  await page.route('https://replica-audio.invalid/**', async route => healthy ? route.fulfill({ contentType: 'audio/wav', body: wav(30) }) : route.abort())
  await page.goto('/')
  expect(await page.content()).not.toContain('不能泄漏')
  await page.locator('.hub-music-open').click(); await page.getByRole('button', { name: '播放歌曲：公开歌曲', exact: true }).click()
  await expect(page.locator('.hub-player-error')).toBeVisible()
  healthy = true; await page.getByRole('button', { name: '重试播放', exact: true }).click()
  await expect.poll(() => page.getByTestId('site-audio').evaluate(element => !(element as HTMLAudioElement).paused)).toBeTruthy()
  await expect(page.getByLabel('播放进度', { exact: true })).toBeDisabled()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  const box = await page.getByRole('dialog', { name: '歌曲库与播放器' }).boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'test-results/replica-player-mobile.png', fullPage: true })
})

test('settings reject unsafe icons and song data, allow the promised full library, and preserve prior values', async ({ page }) => {
  for (const data of [{ publicIcons: { logo: 'javascript:alert(1)' } }, { publicIcons: { constructor: 'https://example.com/i.png' } }, { homeTags: ['x'.repeat(41)] }, { homePhotosSource: 'projects' }, { homePhotoUrls: ['data:image/svg+xml,<svg/>'] }, { socialLinks: [{ label: 'test', url: 'https://example.com', iconUrl: '//evil.invalid/a.png' }] }]) {
    expect((await page.request.put('/api/studio/site', { headers, data })).status()).toBe(400)
  }
  const tracks = Array.from({ length: 200 }, (_, index) => ({ title: '歌'.repeat(120), artist: '手'.repeat(120), url: 'https://audio.invalid/' + index + '/' + 'x'.repeat(900), coverUrl: '' }))
  expect(JSON.stringify(tracks).length).toBeGreaterThan(100_000)
  await settings(page, { musicPlaylist: tracks })
  expect((await page.request.put('/api/studio/site', { headers, data: { musicPlaylist: [...tracks, tracks[0]] } })).status()).toBe(400)
  expect((await page.request.put('/api/studio/site', { headers, data: { biography: 'x'.repeat(1_000_001) } })).status()).toBe(400)
  expect((await settings(page, {})).musicPlaylist).toHaveLength(200)
})

test('new content, home sources, icons and library survive an actual backup, restore and rollback', async ({ page }) => {
  const url = await image(page)
  const changed = await settings(page, { homeTags: ['生活'], homePhotosSource: 'custom', homePhotoUrls: [url], publicIcons: { notes: url }, musicPlaylist: [{ title: '备份歌曲', artist: '', url: 'https://audio.invalid/backup.wav', coverUrl: url, enabled: false }] })
  const note = await create(page, 'notes', { body: '一句备份里的文案', published: true })
  await create(page, 'albums', { title: '独立相册', images: [{ url, caption: '照片说明' }], published: true })
  const response = await page.request.post('/api/studio/backups', { headers }); expect(response.status()).toBe(201)
  const archive = await (await page.request.get('/api/studio/backups/' + (await response.json()).backup.name)).body()
  const decoded = JSON.parse(gunzipSync(archive).toString('utf8'))
  const target = path.join(process.env.HUB_TEST_DATA_DIR!, 'replica-restore-' + marker()), input = target + '.hub.gz'
  await mkdir(target)
  const prior = new Database(Buffer.from(decoded.database, 'base64'))
  expect(prior.prepare('SELECT COUNT(*) AS count FROM admin_sessions').get()).toEqual({ count: 0 })
  prior.prepare('UPDATE site_settings SET json=? WHERE id=1').run(JSON.stringify(original))
  await writeFile(path.join(target, 'hub.sqlite'), prior.serialize()); prior.close(); await writeFile(input, archive)
  const restore = spawnSync(process.execPath, ['scripts/restore-backup.mjs', '--input', input, '--data-dir', target, '--confirm-restore'], { encoding: 'utf8' })
  expect(restore.status, restore.stderr).toBe(0)
  const after = new Database(path.join(target, 'hub.sqlite'), { readonly: true })
  expect(JSON.parse((after.prepare('SELECT json FROM site_settings').get() as { json: string }).json)).toEqual(changed)
  expect((after.prepare('SELECT body FROM notes WHERE id=?').get(note.id) as { body: string }).body).toBe('一句备份里的文案'); after.close()
  const rollback = restore.stdout.trim().split('rollback: ')[1]
  const reversed = spawnSync(process.execPath, ['scripts/restore-backup.mjs', '--input', path.join(rollback, 'rollback.hub.gz'), '--data-dir', target, '--confirm-restore'], { encoding: 'utf8' })
  expect(reversed.status, reversed.stderr).toBe(0)
  const before = new Database(path.join(target, 'hub.sqlite'), { readonly: true })
  expect(JSON.parse((before.prepare('SELECT json FROM site_settings').get() as { json: string }).json)).toEqual(original); before.close()
})

test('replica routes, mobile navigation, SEO and disabled-module Core have no client errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const url = await image(page)
  await create(page, 'notes', { body: '这是一条后台添加的朋友圈文案。', published: true })
  await create(page, 'albums', { title: '生活影像', images: [{ url, caption: '生活的颜色' }], published: true })
  await create(page, 'links', { title: '朋友的小站', url: 'https://example.com', iconUrl: url, published: true })
  for (const route of ['/', '/blog', '/photos', '/notes', '/links', '/about']) {
    await page.goto(route)
    await expect(page.locator('#main-content')).toBeVisible()
    await expect(page.locator('.hub-desktop-nav a')).toHaveCount(5)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  }
  for (const route of ['/robots.txt', '/sitemap.xml', '/feed.xml', '/og-image']) expect((await page.request.get(route)).status()).toBe(200)
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/')
  await page.getByRole('button', { name: '展开导航', exact: true }).click()
  await page.locator('#hub-mobile-nav').getByRole('link', { name: '文案', exact: true }).click()
  await expect(page.locator('.hub-note')).toContainText('朋友圈文案')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.screenshot({ path: 'test-results/replica-notes-mobile.png', fullPage: true })
  for (const id of ['about', 'blog', 'photos', 'notes', 'links', 'content', 'projects', 'games', 'tools', 'accounts', 'github', 'edgeone']) await page.request.patch('/api/studio/modules', { headers, data: { id, enabled: false } })
  await page.goto('/'); await expect(page.locator('.hub-board')).toBeVisible()
  expect((await page.request.get('/duanap')).status()).toBe(200)
  expect((await page.request.get('/robots.txt')).status()).toBe(200)
  expect(errors).toEqual([])
  for (const id of ['about', 'blog', 'photos', 'notes', 'links']) await page.request.patch('/api/studio/modules', { headers, data: { id, enabled: true } })
})
