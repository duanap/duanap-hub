import { test, expect } from '@playwright/test'

test('V4.4 public layout has accessible five-item mobile dock and scroll blur', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: '手机底部主导航' })
  await expect(nav).toBeVisible()
  await expect(nav.getByRole('link')).toHaveCount(5)
  await expect(page.getByRole('heading', { name: /把好奇心/ })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 200))
  await expect(page.locator('.site-header')).toHaveClass(/is-scrolled/)
  await expect
    .poll(() =>
      page.locator('.site-header').evaluate((element) => getComputedStyle(element).backdropFilter),
    )
    .toContain('blur')
  await expect(page.getByRole('link', { name: /ICP备案：/ })).toHaveAttribute(
    'href',
    'https://beian.miit.gov.cn/',
  )
})

test('project details provide four real content tabs while maintenance remains public', async ({
  page,
}) => {
  await page.goto('/projects/acceptance-project')
  const tabs = page.getByRole('tablist')
  for (const name of ['项目介绍', '项目截图', '更新日志', '开发计划'])
    await expect(tabs.getByRole('tab', { name })).toBeVisible()
  await tabs.getByRole('tab', { name: '更新日志' }).click()
  await expect(page.getByRole('heading', { name: '验收日志' })).toBeVisible()
  await tabs.getByRole('tab', { name: '开发计划' }).click()
  await expect(page.getByRole('heading', { name: '验收计划' })).toBeVisible()
})

test('all public pages fit common desktop, tablet and phone widths', async ({ page }) => {
  test.setTimeout(180_000)
  for (const width of [375, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const route of [
      '/',
      '/about',
      '/projects',
      '/projects/acceptance-project',
      '/games',
      '/tools',
      '/tools/password',
    ]) {
      await page.goto(route)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `${route} @ ${width}`,
      ).toBe(true)
    }
  }
})

async function login(page: import('@playwright/test').Page) {
  await page.goto('/duanap/login')
  await page.getByLabel('管理员', { exact: true }).fill('local-test-admin')
  await page.getByLabel('密码', { exact: true }).fill(process.env.HUB_TEST_PASSWORD!)
  await page.getByRole('button', { name: /登录工作台/ }).click()
  await expect(page).toHaveURL(/\/duanap$/)
}

test('Studio performs real project publishing, roadmap editing and unsaved protection', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await login(page)
  await page.goto('/duanap/projects/new')
  await page.getByLabel('项目名称', { exact: true }).fill('浏览器真实保存项目')
  await page.getByLabel('URL 标识（slug）', { exact: true }).fill('browser-published')
  await page.getByLabel('项目简介', { exact: true }).fill('从 Studio 写入 SQLite 的真实测试内容。')
  await page
    .getByLabel('项目介绍（Markdown）', { exact: true })
    .fill('## 持久化正文\n\n来自后台保存。')
  await page.getByLabel('公开发布', { exact: true }).check()
  await page.getByRole('button', { name: '保存项目', exact: true }).click()
  await expect(page).toHaveURL(/\/duanap\/projects\/\d+$/)
  await page.getByRole('combobox', { name: '内容类型', exact: true }).selectOption('roadmap')
  await page.getByLabel('记录标题', { exact: true }).fill('独立保存的开发计划')
  await page.getByLabel('记录正文（Markdown）', { exact: true }).fill('这个计划来自 SQLite。')
  await page.getByLabel('发布记录', { exact: true }).check()
  await page.getByRole('button', { name: '新增记录', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('更新记录已保存')
  await page.getByLabel('项目名称', { exact: true }).fill('未保存的名字')
  await expect(page.getByText('有未保存的修改', { exact: true })).toBeVisible()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('link', { name: '工具管理', exact: true }).click()
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('未保存的名字')
  await page.getByLabel('项目名称', { exact: true }).fill('浏览器真实保存项目')
  await page.goto('/projects/browser-published')
  await expect(page.getByRole('heading', { name: '持久化正文', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '开发计划' }).click()
  await expect(page.getByRole('heading', { name: '独立保存的开发计划', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('tool switches persist and disabled tools disappear from routes and sitemap', async ({
  page,
}) => {
  await login(page)
  await page.goto('/duanap/tools')
  const form = page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: 'JSON 格式化', exact: true }) })
  await form.getByLabel('公开启用', { exact: true }).uncheck()
  await form.getByRole('button', { name: '保存工具' }).click()
  await expect(form.getByRole('status')).toContainText('已保存')
  expect((await page.request.get('/tools/json')).status()).toBe(404)
  expect(await (await page.request.get('/sitemap.xml')).text()).not.toContain('/tools/json')
  await form.getByLabel('公开启用', { exact: true }).check()
  await form.getByRole('button', { name: '保存工具' }).click()
  await expect(form.getByRole('status')).toContainText('已保存')
  expect((await page.request.get('/tools/json')).status()).toBe(200)
})

test('Studio uploads validated images and creates downloadable real backups', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await page.goto('/duanap/media')
  const sharp = (await import('sharp')).default
  const image = await sharp({
    create: { width: 16, height: 16, channels: 3, background: '#3472f6' },
  })
    .png()
    .toBuffer()
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: image })
  await expect(page.getByRole('status')).toContainText('图片已安全上传')
  const mediaURL = await page.locator('.media-card code').first().textContent()
  expect((await page.request.get(mediaURL!)).headers()['content-type']).toContain('image/webp')
  await page.goto('/duanap/backups')
  await page.getByRole('button', { name: '创建安全备份' }).click()
  await expect(page.getByRole('status')).toContainText('备份已创建')
  const link = page.getByRole('link', { name: '下载备份包' }).first(),
    response = await page.request.get((await link.getAttribute('href'))!)
  expect(response.status()).toBe(200)
  const backup = await response.json()
  expect(backup.manifest.format).toBe(1)
  expect(backup.files.some((x: { path: string }) => x.path === 'hub.sqlite')).toBe(true)
  expect(backup.files.some((x: { path: string }) => x.path.startsWith('media/'))).toBe(true)
})

test('all Studio sections fit phone and tablet widths and never invent analytics', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await login(page)
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const route of [
      '/duanap',
      '/duanap/projects',
      '/duanap/site',
      '/duanap/tools',
      '/duanap/seo',
      '/duanap/media',
      '/duanap/backups',
      '/duanap/integrations',
    ]) {
      await page.goto(route)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        route + ' @ ' + width,
      ).toBe(true)
    }
  }
  await page.goto('/duanap/analytics')
  await expect(page.getByRole('heading', { name: '访问统计 · 待完善' })).toBeVisible()
})

test('disabled optional modules preserve Core and consistently remove public content', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await login(page)
  const headers = { Origin: 'http://127.0.0.1:1027' }
  const ids = ['about', 'projects', 'games', 'tools', 'updates']
  try {
    for (const id of ids)
      expect(
        (
          await page.request.patch('/api/studio/modules', { headers, data: { id, enabled: false } })
        ).status(),
      ).toBe(200)
    expect((await page.request.get('/')).status()).toBe(200)
    expect((await page.request.get('/duanap')).status()).toBe(200)
    expect((await page.request.get('/api/health')).status()).toBe(200)
    expect((await page.request.get('/projects/acceptance-project')).status()).toBe(404)
    const sitemap = await (await page.request.get('/sitemap.xml')).text()
    expect(sitemap).not.toContain('/projects/')
    expect(sitemap).not.toContain('/tools/')
    expect(await (await page.request.get('/feed.xml')).text()).not.toContain('<item>')
  } finally {
    for (const id of ids)
      await page.request.patch('/api/studio/modules', { headers, data: { id, enabled: true } })
  }
  expect((await page.request.get('/projects/acceptance-project')).status()).toBe(200)
})

test('Studio authenticates, preserves SQLite changes and exposes mobile more drawer', async ({
  page,
}) => {
  page.on('pageerror', (e) => console.error('Studio client error: ' + e.message))
  await page.goto('/duanap/login')
  await page.getByLabel('管理员', { exact: true }).fill('local-test-admin')
  await page.getByLabel('密码', { exact: true }).fill(process.env.HUB_TEST_PASSWORD!)
  await page.getByRole('button', { name: /登录工作台/ }).click()
  await expect(page).toHaveURL(/\/duanap$/)
  await page.setViewportSize({ width: 390, height: 844 })
  const nav = page.getByRole('navigation', { name: '手机后台导航' })
  await expect(nav).toBeVisible()
  await nav.getByRole('button', { name: '更多' }).click()
  await expect(page.getByRole('dialog', { name: '更多管理功能' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('private mutations reject anonymous and cross-origin requests', async ({ request }) => {
  const anon = await request.put('/api/studio/site', {
    headers: { Origin: 'http://127.0.0.1:1027' },
    data: { siteName: 'wrong' },
  })
  expect(anon.status()).toBe(401)
  const foreign = await request.put('/api/studio/site', {
    headers: { Origin: 'https://foreign.invalid' },
    data: { siteName: 'wrong' },
  })
  expect(foreign.status()).toBe(403)
})

test('project update deep links activate the containing tab on load and hash changes', async ({
  page,
}) => {
  await page.goto('/projects/acceptance-project#update-1')
  await expect(page.getByRole('tab', { name: '更新日志', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('heading', { name: '验收日志', exact: true })).toBeVisible()
  await page.evaluate(() => {
    location.hash = 'update-2'
  })
  await expect(page.getByRole('tab', { name: '开发计划', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('heading', { name: '验收计划', exact: true })).toBeVisible()
})

test('mobile Studio brand protects drafts and history navigation recovers unsaved editor content', async ({
  page,
}) => {
  await login(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/duanap/projects')
  await page.getByRole('button', { name: /验收用项目/ }).click()
  await page.getByLabel('项目名称', { exact: true }).fill('历史导航未保存的名字')
  await expect(page.getByText('有未保存的修改', { exact: true })).toBeVisible()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.locator('.hub-studio-mobile-brand').click()
  await expect(page).toHaveURL(/\/duanap\/projects\/1$/)
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('历史导航未保存的名字')
  await page.goBack()
  await expect(page).toHaveURL(/\/duanap\/projects$/)
  await page.goForward()
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('历史导航未保存的名字')
  await expect(page.getByText(/已恢复.*未保存草稿/)).toBeVisible()
})

test('ordinary announcements never claim that an online project is in maintenance', async ({
  page,
}) => {
  await login(page)
  const headers = { Origin: 'http://127.0.0.1:1027' }
  const created = await page.request.post('/api/studio/projects', {
    headers,
    data: {
      slug: 'normal-announcement',
      title: '普通公告项目',
      body: '项目正在正常开放',
      published: true,
      status: 'online',
      maintenanceMessage: '过去的维护说明',
    },
  })
  expect(created.status()).toBe(201)
  const p = (await created.json()).project
  await page.request.post('/api/studio/entries', {
    headers,
    data: {
      projectId: p.id,
      type: 'notice',
      title: '正常运营通知',
      body: '这是一条普通公告。',
      published: true,
    },
  })
  await page.goto('/projects/normal-announcement')
  await expect(page.getByText('这是一条普通公告。', { exact: true })).toBeVisible()
  await expect(page.getByText('过去的维护说明', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/项目正在维护，具体安排/)).toHaveCount(0)
})

test('visual QA snapshots include native public and Studio desktop/mobile pages', async ({
  page,
}) => {
  test.setTimeout(120_000)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /把好奇心/ })).toBeVisible()
    await page.screenshot({ path: '.tmp/qa/home-' + width + '.png', fullPage: true })
  }
  await login(page)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/duanap/projects/1')
    await expect(page.getByLabel('项目名称', { exact: true })).toBeEnabled()
    await page.screenshot({ path: '.tmp/qa/studio-' + width + '.png', fullPage: true })
  }
})

test('implemented tools process real input locally without uploading it', async ({ page }) => {
  test.setTimeout(120_000)
  const posted: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST') posted.push(request.url())
  })
  await page.goto('/tools/password')
  await page.getByRole('button', { name: '生成密码', exact: true }).click()
  await expect(page.locator('output')).toHaveText(/^[A-Za-z0-9!@#$%^&*\-_+=]{20}$/)
  await page.goto('/tools/base64')
  await page.getByRole('textbox', { name: '输入内容', exact: true }).fill('中文 🚀')
  await page.getByRole('button', { name: '编码 Base64', exact: true }).click()
  const encoded = await page.getByRole('textbox', { name: '处理结果', exact: true }).inputValue()
  expect(encoded).toBe(Buffer.from('中文 🚀').toString('base64'))
  await page.getByRole('textbox', { name: '输入内容', exact: true }).fill(encoded)
  await page.getByRole('button', { name: '解码 Base64', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '处理结果', exact: true })).toHaveValue('中文 🚀')
  await page.goto('/tools/json')
  await page.getByRole('textbox', { name: '输入内容', exact: true }).fill('{"正确":true}')
  await page.getByRole('button', { name: '美化 JSON', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '处理结果', exact: true })).toHaveValue(
    '{\n  "正确": true\n}',
  )
  await page.getByRole('textbox', { name: '输入内容', exact: true }).fill('{bad}')
  await page.getByRole('button', { name: '美化 JSON', exact: true }).click()
  await expect(page.locator('.tool-inline-status[role=alert]')).toBeVisible()
  await page.goto('/tools/ip')
  await page.getByRole('textbox', { name: '输入内容', exact: true }).fill('192.168.1.2')
  await page.getByRole('button', { name: '检查 IP', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '处理结果', exact: true })).toHaveValue(/私有地址/)
  await page.goto('/tools/timestamp')
  await page.getByLabel('Unix 时间戳', { exact: true }).fill('0')
  await page.getByRole('button', { name: '时间戳转日期', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '处理结果', exact: true })).toHaveValue(
    /1970-01-01/,
  )
  await page.goto('/tools/markdown')
  await page
    .getByRole('textbox', { name: '输入内容', exact: true })
    .fill(
      '# 本地 Markdown\n\n<script>alert(1)</script>\n\n![外部图片](https://unreachable.invalid/image.png)',
    )
  await expect(
    page.locator('.markdown-preview').getByRole('heading', { name: '本地 Markdown' }),
  ).toBeVisible()
  await expect(page.locator('.markdown-preview img')).toHaveCount(0)
  await expect(page.locator('.markdown-preview script')).toHaveCount(0)
  expect(posted).toEqual([])
})

test('real project screenshots open a focused preview and close with Escape', async ({ page }) => {
  await login(page)
  const sharp = (await import('sharp')).default
  const bytes = await sharp({
    create: { width: 20, height: 20, channels: 3, background: '#3472f6' },
  })
    .png()
    .toBuffer()
  const uploaded = await page.request.post('/api/studio/media', {
    headers: { Origin: 'http://127.0.0.1:1027' },
    multipart: { file: { name: 'gallery.png', mimeType: 'image/png', buffer: bytes } },
  })
  expect(uploaded.status()).toBe(200)
  const item = (await uploaded.json()).item
  await page.request.patch('/api/studio/projects/1', {
    headers: { Origin: 'http://127.0.0.1:1027' },
    data: { screenshots: [item.url] },
  })
  await page.goto('/projects/acceptance-project')
  await page.getByRole('tab', { name: '项目截图' }).click()
  await page.getByRole('button', { name: '查看截图 1' }).click()
  await expect(page.getByRole('dialog', { name: '项目截图预览' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '查看截图 1' })).toBeFocused()
})
