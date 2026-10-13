import { expect, test, type Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'

const headers = { Origin: 'http://127.0.0.1:1027' }
async function create(page: Page, extra: object = {}) {
  const slug = `p1-${randomBytes(8).toString('hex')}`
  const response = await page.request.post('/api/studio/projects', { headers, data: { title: slug, slug, published: true, ...extra } })
  expect(response.status()).toBe(201)
  return (await response.json()).project as { id: number; slug: string; [key: string]: unknown }
}
test.beforeEach(async ({ page }) => {
  const response = await page.request.post('/api/studio/login', { headers, data: { username: 'duanap', password: process.env.HUB_TEST_ADMIN_PASSWORD } })
  expect(response.ok()).toBeTruthy()
})

test('project media, grouping, tags and release date persist and display publicly', async ({ page }) => {
  const project = await create(page, { iconUrl: '/media/0123456789abcdef0123456789abcdef.png', coverUrl: 'https://example.com/cover.webp', screenshots: ['https://example.com/screen.png'], groupName: '独立工具', tags: ['隐私', '开源'], version: 'v2.1', versionDate: '2026-10-13', sortOrder: 2 })
  expect(project).toMatchObject({ groupName: '独立工具', tags: ['隐私', '开源'], screenshots: ['https://example.com/screen.png'], versionDate: '2026-10-13', sortOrder: 2 })
  await page.goto(`/projects/${project.slug}`)
  await expect(page.getByText('独立工具', { exact: true })).toBeVisible()
  await expect(page.getByText('隐私', { exact: true })).toBeVisible()
  await expect(page.locator('time[datetime="2026-10-13"]')).toBeVisible()
  await expect(page.getByRole('img', { name: `${project.slug} 截图 1` })).toHaveAttribute('src', 'https://example.com/screen.png')
  await page.goto('/duanap')
  await page.getByRole('button', { name: '项目与公告', exact: true }).click()
  await page.getByRole('button', { name: `编辑项目：${project.slug}`, exact: true }).click()
  await expect(page.getByLabel('分组', { exact: true })).toHaveValue('独立工具')
  await expect(page.getByLabel('版本发布日期', { exact: true })).toHaveValue('2026-10-13')
})

test('project ordering respects manual sort order', async ({ page }) => {
  const later = await create(page, { sortOrder: 90 })
  const earlier = await create(page, { sortOrder: 1 })
  await page.goto('/projects')
  const links = await page.locator('.project-card').evaluateAll(elements => elements.map(element => element.getAttribute('href')))
  expect(links.indexOf(`/projects/${earlier.slug}`)).toBeLessThan(links.indexOf(`/projects/${later.slug}`))
})

test('scheduled published announcements remain private until their effective time', async ({ page }) => {
  const project = await create(page)
  const hidden = `排期-${randomBytes(5).toString('hex')}`
  const visible = `路线图-${randomBytes(5).toString('hex')}`
  for (const data of [{ title: hidden, effectiveAt: '2099-01-01T00:00:00.000Z' }, { title: visible, effectiveAt: '2020-01-01T00:00:00.000Z' }]) {
    const response = await page.request.post('/api/studio/entries', { headers, data: { projectId: project.id, type: 'roadmap', published: true, roadmapStatus: 'in-progress', version: 'v3', ...data } })
    expect(response.status()).toBe(201)
    expect((await response.json()).entry).toMatchObject({ roadmapStatus: 'in-progress', version: 'v3', effectiveAt: data.effectiveAt })
  }
  await page.goto(`/projects/${project.slug}`)
  await expect(page.getByRole('heading', { name: hidden })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: visible })).toBeVisible()
  await expect(page.getByText('开发中', { exact: true }).last()).toBeVisible()
  expect(await (await page.request.get('/feed.xml')).text()).not.toContain(hidden)
  expect(await (await page.request.get('/feed.xml')).text()).toContain(visible)
  expect(await (await page.request.get('/')).text()).not.toContain(hidden)
})
test('cancelling a future schedule publishes now with a current publication date', async ({ page }) => {
  const project = await create(page)
  const result = await page.request.post('/api/studio/entries', { headers, data: { projectId: project.id, type: 'notice', title: '立即发布', published: true, effectiveAt: '2099-01-01T00:00:00.000Z' } })
  const { entry } = await result.json()
  const before = Date.now()
  const response = await page.request.patch('/api/studio/entries/' + entry.id, { headers, data: { effectiveAt: '' } })
  expect(response.ok()).toBeTruthy()
  const date = Date.parse((await response.json()).entry.publishedAt)
  expect(date).toBeGreaterThanOrEqual(before); expect(date).toBeLessThanOrEqual(Date.now())
})

test('published slug changes redirect directly to the latest public slug and reserve aliases', async ({ page }) => {
  const project = await create(page)
  const middle = `${project.slug}-next`, target = `${project.slug}-final`
  for (const slug of [middle, target]) expect((await page.request.patch(`/api/studio/projects/${project.id}`, { headers, data: { slug } })).status()).toBe(200)
  for (const slug of [project.slug, middle]) {
    const response = await page.request.get(`/projects/${slug}`, { maxRedirects: 0 })
    expect(response.status()).toBe(308)
    expect(response.headers().location).toBe(`/projects/${target}`)
  }
  const conflict = await page.request.post('/api/studio/projects', { headers, data: { title: '冲突', slug: project.slug } })
  expect(conflict.status()).toBe(400)
  const revert = await page.request.patch(`/api/studio/projects/${project.id}`, { headers, data: { slug: project.slug } })
  expect(revert.status()).toBe(200)
  expect((await page.request.get(`/projects/${target}`, { maxRedirects: 0 })).headers().location).toBe(`/projects/${project.slug}`)
  expect(await (await page.request.get('/sitemap.xml')).text()).not.toContain(`/projects/${middle}`)
  await page.request.patch(`/api/studio/projects/${project.id}`, { headers, data: { published: false } })
  expect((await page.request.get(`/projects/${target}`, { maxRedirects: 0 })).status()).toBe(404)
  await page.request.delete(`/api/studio/projects/${project.id}`, { headers })
  expect((await page.request.get(`/projects/${middle}`, { maxRedirects: 0 })).status()).toBe(404)
  expect((await page.request.post('/api/studio/projects', { headers, data: { title: '可重新使用', slug: middle } })).status()).toBe(201)
})

test('draft slug changes do not create public redirects', async ({ page }) => {
  const project = await create(page, { published: false })
  await page.request.patch(`/api/studio/projects/${project.id}`, { headers, data: { slug: `${project.slug}-new`, published: true } })
  expect((await page.request.get(`/projects/${project.slug}`, { maxRedirects: 0 })).status()).toBe(404)
})

test('project and announcement validation rejects unsafe media and invalid calendar inputs', async ({ page }) => {
  const project = await create(page)
  for (const data of [{ iconUrl: '//example.com/icon.png' }, { screenshots: ['javascript:alert(1)'] }, { coverUrl: '/media/../../env.png' }, { iconUrl: 'https:\\example.com/icon.png' }, { tags: Array(21).fill('x') }, { screenshots: Array(21).fill('https://example.com/image.png') }, { sortOrder: -1 }, { sortOrder: 1.5 }, { versionDate: '2026-02-30' }]) {
    expect((await page.request.patch(`/api/studio/projects/${project.id}`, { headers, data })).status(), JSON.stringify(data)).toBe(400)
  }
  for (const data of [{ roadmapStatus: 'unknown' }, { effectiveAt: '2026-02-30T00:00:00.000Z' }, { effectiveAt: 'tomorrow' }]) {
    expect((await page.request.post('/api/studio/entries', { headers, data: { projectId: project.id, type: 'notice', title: '非法输入', ...data } })).status()).toBe(400)
  }
})
