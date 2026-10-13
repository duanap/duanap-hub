import { expect, test, type Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'

async function authenticate(page: Page) {
  const response = await page.request.post('/api/studio/login', {
    headers: { Origin: 'http://127.0.0.1:1027' },
    data: { username: 'duanap', password: process.env.HUB_TEST_ADMIN_PASSWORD },
  })
  expect(response.ok()).toBeTruthy()
}

async function createProject(page: Page, title: string, extra: object = {}) {
  const response = await page.request.post('/api/studio/projects', {
    headers: { Origin: 'http://127.0.0.1:1027' },
    data: { title, slug: `test-${randomBytes(8).toString('hex')}`, ...extra },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).project as { id: number; slug: string }
}

test.beforeEach(async ({ page }) => { await authenticate(page) })

test('switching tabs cannot discard an unsaved project without confirmation', async ({ page }) => {
  await page.goto('/duanap')
  await page.getByRole('button', { name: '项目与公告', exact: true }).click()
  await page.getByRole('button', { name: '+ 新增项目' }).click()
  await page.getByLabel('项目名称', { exact: true }).fill('未保存的作品')
  let warned = false
  page.on('dialog', async dialog => { warned = true; await dialog.dismiss() })
  await page.getByRole('button', { name: '主页资料', exact: true }).click()
  expect(warned).toBeTruthy()
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('未保存的作品')
})

test('search and combined filters select the intended projects', async ({ page }) => {
  const marker = randomBytes(4).toString('hex')
  const game = await createProject(page, `Game ${marker}`, { category: 'game', published: true, status: 'maintenance' })
  await createProject(page, `Draft ${marker}`, { category: 'website', published: false })
  await page.goto('/duanap')
  await page.getByRole('button', { name: '项目与公告', exact: true }).click()
  await page.getByLabel('搜索项目').fill(marker)
  const cards = page.getByRole('button', { name: /^编辑项目：/ })
  await expect(cards).toHaveCount(2)
  await page.getByLabel('发布筛选').selectOption('published')
  await page.getByLabel('分类筛选').selectOption('game')
  await page.getByLabel('运营状态筛选').selectOption('maintenance')
  await expect(cards).toHaveCount(1)
  await expect(cards).toContainText(`Game ${marker}`)
  await page.getByLabel('搜索项目').fill(game.slug.toUpperCase())
  await expect(cards).toHaveCount(1)
  await page.screenshot({ path: 'test-results/studio-desktop-list.png', fullPage: true })
  await page.getByLabel('搜索项目').fill('no-such-project')
  await expect(cards).toHaveCount(0)
  await expect(page.getByText('没有符合条件的项目')).toBeVisible()
})

test('project and announcement editing publish real Markdown and can be withdrawn', async ({ page }) => {
  const slug = `studio-${randomBytes(8).toString('hex')}`
  await page.goto('/duanap')
  await page.getByRole('button', { name: '项目与公告', exact: true }).click()
  await page.getByRole('button', { name: '+ 新增项目' }).click()
  await page.getByLabel('项目名称', { exact: true }).fill('浏览器验收项目')
  await page.getByLabel('URL 标识（slug）').fill(slug)
  await page.getByRole('group', { name: '项目正文编辑器' }).getByRole('button', { name: 'Markdown 源码', exact: true }).click()
  await page.getByLabel('项目介绍（Markdown）').fill('## 正文标题\n\n**真实介绍**')
  await page.getByRole('button', { name: '预览项目正文' }).click()
  await expect(page.getByRole('region', { name: '项目正文预览' }).getByRole('heading', { name: '正文标题' })).toBeVisible()
  await page.getByLabel('公开发布', { exact: true }).first().check()
  await page.getByRole('button', { name: '保存项目', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('项目已创建')
  await page.getByLabel('标题', { exact: true }).fill('维护计划')
  await page.getByRole('group', { name: '公告正文编辑器' }).getByRole('button', { name: 'Markdown 源码', exact: true }).click()
  await page.getByLabel('正文（Markdown）', { exact: true }).fill('**公告内容**')
  await page.getByLabel('公开发布', { exact: true }).last().check()
  await page.getByRole('button', { name: '新增记录', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('更新记录已创建')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'test-results/studio-desktop-editor.png', fullPage: true })
  const publicPage = await page.context().newPage()
  await publicPage.goto(`/projects/${slug}`)
  await expect(publicPage.getByRole('heading', { name: '正文标题' })).toBeVisible()
  await expect(publicPage.getByRole('heading', { name: '维护计划' })).toBeVisible()
  await page.getByLabel('公开发布', { exact: true }).first().uncheck()
  await page.getByRole('button', { name: '保存项目', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('项目已更新')
  expect((await page.request.get(`/projects/${slug}`)).status()).toBe(404)
  expect(await (await page.request.get('/sitemap.xml')).text()).not.toContain(`/projects/${slug}`)
  await publicPage.close()
})

test('cancelled announcement switches preserve the draft and confirmed switches reset it', async ({ page }) => {
  const marker = randomBytes(4).toString('hex')
  await createProject(page, `Entry ${marker}`)
  await page.goto('/duanap')
  await page.getByRole('button', { name: '项目与公告', exact: true }).click()
  await page.getByRole('button', { name: `编辑项目：Entry ${marker}`, exact: true }).click()
  await page.getByLabel('标题', { exact: true }).fill('已有公告')
  await page.getByRole('button', { name: '新增记录', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('更新记录已创建')
  await page.getByLabel('标题', { exact: true }).fill('新的未保存公告')
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: '编辑公告：已有公告' }).click()
  await expect(page.getByLabel('标题', { exact: true })).toHaveValue('新的未保存公告')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '编辑公告：已有公告' }).click()
  await expect(page.getByLabel('标题', { exact: true })).toHaveValue('已有公告')
  await page.getByRole('button', { name: '取消编辑', exact: true }).click()
  await expect(page.getByLabel('标题', { exact: true })).toHaveValue('')
})

test('leaving an unsaved site form can be cancelled', async ({ page }) => {
  await page.goto('/duanap')
  await page.getByRole('button', { name: '主页资料', exact: true }).click()
  await page.getByLabel('昵称', { exact: true }).fill('未保存昵称')
  let warned = false
  page.on('dialog', async dialog => { warned = true; await dialog.dismiss() })
  await page.getByRole('button', { name: '项目与公告', exact: true }).click()
  expect(warned).toBeTruthy()
  await expect(page.getByLabel('昵称', { exact: true })).toHaveValue('未保存昵称')
})

test('duplicate slug errors preserve the project draft for correction', async ({ page }) => {
  const original = await createProject(page, '已存在项目')
  await page.goto('/duanap')
  await page.getByRole('button', { name: '项目与公告', exact: true }).click()
  await page.getByRole('button', { name: '+ 新增项目' }).click()
  await page.getByLabel('项目名称', { exact: true }).fill('待修正项目')
  await page.getByLabel('URL 标识（slug）').fill(original.slug)
  await page.getByRole('button', { name: '保存项目', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('待修正项目')
  await page.getByLabel('URL 标识（slug）').fill(`corrected-${randomBytes(8).toString('hex')}`)
  await page.getByRole('button', { name: '保存项目', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('项目已创建')
})

test('in-flight saves prevent changing the submitted draft or leaving the editor', async ({ page }) => {
  await page.goto('/duanap')
  await page.getByRole('button', { name: '项目与公告', exact: true }).click()
  await page.getByRole('button', { name: '+ 新增项目' }).click()
  await page.getByLabel('项目名称', { exact: true }).fill('请求中的项目')
  await page.getByLabel('URL 标识（slug）').fill(`pending-${randomBytes(8).toString('hex')}`)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/studio/projects', async route => { await pending; await route.continue() })
  try {
    await page.getByRole('button', { name: '保存项目', exact: true }).click()
    await expect(page.getByLabel('项目名称', { exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '返回项目列表', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '主页资料', exact: true })).toBeDisabled()
  } finally { release() }
  await expect(page.getByRole('status')).toContainText('项目已创建')
})

test('mobile navigation and project forms remain inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/duanap')
  await page.getByRole('button', { name: '项目与公告', exact: true }).click()
  await page.getByRole('button', { name: '+ 新增项目' }).click()
  await expect(page.getByLabel('项目名称', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存项目', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/studio-mobile.png', fullPage: true })
  const overflow = await page.evaluate(() => ({
    width: window.innerWidth,
    document: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll('*')].filter(element => element.getBoundingClientRect().right > window.innerWidth + 1)
      .map(element => ({ tag: element.tagName, className: element.className, width: element.getBoundingClientRect().width })).slice(0, 12),
  }))
  expect(overflow.document, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width)
})

test('administrator can log in through the form and logout revokes access', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/duanap')
  await expect(page).toHaveURL(/\/duanap\/login$/)
  await page.getByLabel('密码', { exact: true }).fill(process.env.HUB_TEST_ADMIN_PASSWORD!)
  await page.getByRole('button', { name: '登录工作台 →' }).click()
  await expect(page.getByRole('heading', { name: '概览', exact: true })).toBeVisible()
  const dialogs: string[] = []
  page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.accept() })
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page).toHaveURL(/\/duanap\/login$/)
  expect(dialogs).toEqual([])
  const response = await page.request.post('/api/studio/projects', {
    headers: { Origin: 'http://127.0.0.1:1027' }, data: { title: '不允许创建', slug: 'unauthorized' },
  })
  expect(response.status()).toBe(401)
})

test('confirmed project deletion removes its published announcements too', async ({ page }) => {
  const marker = randomBytes(4).toString('hex')
  const project = await createProject(page, `Delete ${marker}`, { published: true })
  const response = await page.request.post('/api/studio/entries', {
    headers: { Origin: 'http://127.0.0.1:1027' },
    data: { projectId: project.id, type: 'notice', title: `Notice ${marker}`, published: true },
  })
  expect(response.status()).toBe(201)
  await page.goto('/duanap')
  await page.getByRole('button', { name: '项目与公告', exact: true }).click()
  await page.getByRole('button', { name: `编辑项目：Delete ${marker}`, exact: true }).click()
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: '删除项目', exact: true }).click()
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue(`Delete ${marker}`)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '删除项目', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('项目已删除')
  await expect(page.getByRole('button', { name: `编辑项目：Delete ${marker}`, exact: true })).toHaveCount(0)
  expect((await page.request.get(`/projects/${project.slug}`)).status()).toBe(404)
  expect(await (await page.request.get('/feed.xml')).text()).not.toContain(`Notice ${marker}`)
})

test('saving an announcement keeps the unsaved project draft protected', async ({ page }) => {
  const marker = randomBytes(4).toString('hex')
  await createProject(page, `Separate ${marker}`)
  await page.goto('/duanap')
  await page.getByRole('button', { name: '项目与公告', exact: true }).click()
  await page.getByRole('button', { name: `编辑项目：Separate ${marker}`, exact: true }).click()
  await page.getByLabel('项目名称', { exact: true }).fill('未保存的项目标题')
  await page.getByLabel('标题', { exact: true }).fill('独立保存的公告')
  await page.getByRole('button', { name: '新增记录', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('更新记录已创建')
  let warned = false
  page.once('dialog', async dialog => { warned = true; await dialog.dismiss() })
  await page.getByRole('button', { name: '返回项目列表', exact: true }).click()
  expect(warned).toBeTruthy()
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('未保存的项目标题')
})

test('confirmed dirty logout asks once before revoking the session', async ({ page }) => {
  await page.goto('/duanap')
  await page.getByRole('button', { name: '项目与公告', exact: true }).click()
  await page.getByRole('button', { name: '+ 新增项目' }).click()
  await page.getByLabel('项目名称', { exact: true }).fill('登出前的草稿')
  const dialogs: string[] = []
  page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.accept() })
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page).toHaveURL(/\/duanap\/login$/)
  expect(dialogs).toEqual(['confirm'])
})
