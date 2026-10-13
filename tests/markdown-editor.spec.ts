import { expect, test } from '@playwright/test'
import { randomBytes } from 'node:crypto'

test.beforeEach(async ({ page }) => {
  const response = await page.request.post('/api/studio/login', {
    headers: { Origin: 'http://127.0.0.1:1027' },
    data: { username: 'duanap', password: process.env.HUB_TEST_ADMIN_PASSWORD },
  })
  expect(response.ok()).toBeTruthy()
  await page.goto('/duanap')
  await page.getByRole('button', { name: '项目与公告', exact: true }).click()
  await page.getByRole('button', { name: '+ 新增项目' }).click()
})

test('typing Markdown formats the project editor immediately and persists Markdown', async ({ page }) => {
  const slug = `visual-${randomBytes(8).toString('hex')}`
  await page.getByLabel('项目名称', { exact: true }).fill('可视化编辑回归')
  await page.getByLabel('URL 标识（slug）').fill(slug)
  const editor = page.getByRole('textbox', { name: '项目介绍（Markdown）', exact: true })
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await editor.pressSequentially('## 实时标题')
  await editor.press('Enter')
  await editor.pressSequentially('**即时加粗**')
  await expect(editor.getByRole('heading', { name: '实时标题', level: 2 })).toBeVisible()
  await expect(editor.locator('strong')).toHaveText('即时加粗')
  await expect(editor).not.toContainText('**')
  await page.getByRole('button', { name: '预览项目正文' }).click()
  await expect(page.getByRole('region', { name: '项目正文预览' }).locator('strong')).toHaveText('即时加粗')
  await page.getByLabel('公开发布', { exact: true }).first().check()
  const saved = page.waitForResponse(response => response.url().endsWith('/api/studio/projects') && response.request().method() === 'POST')
  await page.getByRole('button', { name: '保存项目', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('项目已创建')
  const { project } = await (await saved).json() as { project: { body: string } }
  expect(project.body).toContain('## 实时标题')
  expect(project.body).toContain('**即时加粗**')
  expect(project.body).not.toContain('<h2>')
  await page.getByLabel('标题', { exact: true }).fill('可视化公告')
  const announcement = page.getByRole('textbox', { name: '正文（Markdown）', exact: true })
  await expect(announcement).toHaveAttribute('contenteditable', 'true')
  await announcement.pressSequentially('**公告同步**')
  await expect(announcement.locator('strong')).toHaveText('公告同步')
  await page.getByLabel('公开发布', { exact: true }).last().check()
  await page.getByRole('button', { name: '新增记录', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('更新记录已创建')
  const publicPage = await page.context().newPage()
  await publicPage.goto(`/projects/${slug}`)
  await expect(publicPage.getByRole('heading', { name: '实时标题', level: 2 })).toBeVisible()
  await expect(publicPage.locator('.markdown strong')).toHaveText(['即时加粗', '公告同步'])
  await publicPage.close()
})

test('source, visual editing and preview preserve existing Markdown without dirtying the draft', async ({ page }) => {
  const body = '## 已有正文\n\n**加粗**与[链接](https://example.com)\n\n- [x] 完成\n- [ ] 计划\n\n| 版本 | 状态 |\n| --- | --- |\n| v1 | ~~旧版~~ |\n\n```js\nconst sample = "<tag>"\n```'
  const response = await page.request.post('/api/studio/projects', {
    headers: { Origin: 'http://127.0.0.1:1027' },
    data: { title: '保留 Markdown 原文', slug: `roundtrip-${randomBytes(8).toString('hex')}`, body },
  })
  expect(response.status()).toBe(201)
  await page.getByRole('button', { name: '返回项目列表' }).click()
  await page.reload()
  await page.getByRole('button', { name: '项目与公告', exact: true }).click()
  await page.getByRole('button', { name: '编辑项目：保留 Markdown 原文', exact: true }).click()
  const workspace = page.getByRole('group', { name: '项目正文编辑器' })
  const editor = workspace.getByRole('textbox', { name: '项目介绍（Markdown）' })
  await expect(editor.getByRole('heading', { name: '已有正文' })).toBeVisible()
  await expect(editor.getByRole('table')).toBeVisible()
  await expect(editor.getByRole('checkbox').first()).toBeChecked()
  await workspace.getByRole('button', { name: 'Markdown 源码', exact: true }).click()
  await expect(editor).toHaveValue(body)
  await workspace.getByRole('button', { name: '预览项目正文' }).click()
  const preview = page.getByRole('region', { name: '项目正文预览' })
  await expect(preview.getByRole('table')).toBeVisible()
  await expect(preview.locator('del')).toHaveText('旧版')
  await workspace.getByRole('button', { name: '可视化编辑', exact: true }).click()
  await expect(page.getByText('没有未保存的修改', { exact: true })).toBeVisible()
  const saved = page.waitForResponse(response => response.request().method() === 'PATCH' && /\/api\/studio\/projects\/\d+$/.test(response.url()))
  await page.getByRole('button', { name: '保存项目', exact: true }).click()
  const { project } = await (await saved).json() as { project: { body: string } }
  expect(project.body).toBe(body)
})

test('unsupported rich editing preserves source instead of losing footnotes or HTML', async ({ page }) => {
  const body = '正文[^note]\n\n[^note]: 不能丢失的脚注\n\n<script>window.markdownExecuted = true</script>'
  const workspace = page.getByRole('group', { name: '项目正文编辑器' })
  await workspace.getByRole('button', { name: 'Markdown 源码', exact: true }).click()
  await workspace.getByRole('textbox').fill(body)
  await workspace.getByRole('button', { name: '可视化编辑', exact: true }).click()
  await expect(workspace.getByRole('textbox')).toHaveValue(body)
  await expect(workspace.getByRole('status')).toContainText('保留源码')
  expect(await page.evaluate(() => (window as unknown as { markdownExecuted?: boolean }).markdownExecuted)).toBeUndefined()
})

test('pasting Markdown renders headings and bold immediately', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: '项目介绍（Markdown）', exact: true })
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await editor.focus()
  await editor.evaluate(element => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', '## 粘贴标题\n\n**粘贴加粗**')
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  })
  await expect(editor.getByRole('heading', { name: '粘贴标题', level: 2 })).toBeVisible()
  await expect(editor.locator('strong')).toHaveText('粘贴加粗')
})

test('pasting unsupported Markdown preserves footnote source at the insertion point', async ({ page }) => {
  const body = '正文[^note]\n\n[^note]: 不能丢失的脚注'
  const workspace = page.getByRole('group', { name: '项目正文编辑器' })
  const editor = workspace.getByRole('textbox')
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await editor.pressSequentially('前文')
  await editor.press('Enter')
  await editor.pressSequentially('后文')
  await editor.press('Home')
  await editor.evaluate((element, text) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', text)
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  }, body)
  await expect(workspace.getByRole('textbox')).toHaveValue(/正文\[\^note\]/)
  const value = await workspace.getByRole('textbox').inputValue()
  expect(value.indexOf('前文')).toBeLessThan(value.indexOf(body))
  expect(value.indexOf(body)).toBeLessThan(value.indexOf('后文'))
  await expect(workspace.getByRole('status')).toContainText('保留源码')
})

test('Markdown copied with an HTML clipboard alternative still formats headings', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: '项目介绍（Markdown）', exact: true })
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await editor.focus()
  await editor.evaluate(element => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', '## 双格式标题\n\n**双格式加粗**')
    clipboardData.setData('text/html', '<div>## 双格式标题</div><div>**双格式加粗**</div>')
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  })
  await expect(editor.getByRole('heading', { name: '双格式标题', level: 2 })).toBeVisible()
  await expect(editor.locator('strong')).toHaveText('双格式加粗')
})

test('unsupported inline paste does not split the surrounding paragraph', async ({ page }) => {
  const workspace = page.getByRole('group', { name: '项目正文编辑器' })
  const editor = workspace.getByRole('textbox')
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await editor.pressSequentially('按这里继续')
  await editor.press('ArrowLeft')
  await editor.press('ArrowLeft')
  await editor.evaluate(element => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', '<kbd>Ctrl</kbd>')
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  })
  await expect(workspace.getByRole('textbox')).toHaveValue('按这里<kbd>Ctrl</kbd>继续')
})

test('format buttons edit the selection and saving locks the rich editor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByLabel('项目名称', { exact: true }).fill('保存保护回归')
  await page.getByLabel('URL 标识（slug）').fill(`locked-${randomBytes(8).toString('hex')}`)
  const workspace = page.getByRole('group', { name: '项目正文编辑器' })
  const editor = workspace.getByRole('textbox')
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await editor.pressSequentially('选中加粗')
  await editor.press('ControlOrMeta+A')
  await workspace.getByRole('button', { name: '加粗', exact: true }).click()
  await expect(editor.locator('strong')).toHaveText('选中加粗')
  await page.screenshot({ path: 'test-results/markdown-visual-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/studio/projects', async route => { await pending; await route.continue() })
  try {
    await page.getByRole('button', { name: '保存项目', exact: true }).click()
    await expect(editor).toHaveAttribute('contenteditable', 'false')
    await expect(workspace.getByRole('button', { name: '加粗', exact: true })).toBeDisabled()
    await expect(workspace.getByRole('button', { name: 'Markdown 源码', exact: true })).toBeDisabled()
  } finally { release() }
  await expect(page.getByRole('status')).toContainText('项目已创建')
})

test('dark Markdown headings and body stay white in visual editing and preview', async ({ page }) => {
  await page.getByRole('button', { name: '切换深色模式' }).click()
  const workspace = page.getByRole('group', { name: '项目正文编辑器' })
  await workspace.getByRole('button', { name: 'Markdown 源码', exact: true }).click()
  await workspace.getByRole('textbox').fill('## 夜间标题\n\n夜间正文 **强调文字**\n\n> 引用正文\n\n```js\nconst theme = "dark"\n```')
  await workspace.getByRole('button', { name: '可视化编辑', exact: true }).click()
  const editor = workspace.getByRole('textbox')
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  for (const element of [editor.getByRole('heading', { name: '夜间标题' }), editor.locator('p').first(), editor.locator('strong'), editor.locator('blockquote'), editor.locator('pre')]) {
    await expect(element).toHaveCSS('color', 'rgb(255, 255, 255)')
  }
  await workspace.getByRole('button', { name: '预览项目正文' }).click()
  const preview = workspace.getByRole('region', { name: '项目正文预览' })
  for (const element of [preview.getByRole('heading', { name: '夜间标题' }), preview.locator('p').first(), preview.locator('strong'), preview.locator('blockquote'), preview.locator('pre')]) {
    await expect(element).toHaveCSS('color', 'rgb(255, 255, 255)')
  }
  const heading = preview.getByRole('heading', { name: '夜间标题' })
  await heading.scrollIntoViewIfNeeded()
  expect(await heading.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const top = document.elementFromPoint(rect.left + 5, rect.top + rect.height / 2)
    return top === element || element.contains(top)
  })).toBe(true)
  await page.screenshot({ path: 'test-results/markdown-preview-dark.png', fullPage: true })
})
