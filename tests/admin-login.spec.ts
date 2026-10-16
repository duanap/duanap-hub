import { expect, test } from '@playwright/test'

test('administrator login reads password-manager values without input events', async ({ page }) => {
  await page.goto('/duanap/login')
  for (const [label, value] of [['管理员', 'duanap'], ['密码', process.env.HUB_TEST_ADMIN_PASSWORD!]]) {
    // Native autofill may change an input without dispatching React onChange.
    await page.getByLabel(label, { exact: true }).evaluate((input, text) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
    }, value)
  }
  const response = page.waitForResponse(r => r.url().endsWith('/api/studio/login') && r.request().method() === 'POST')
  await page.getByRole('button', { name: /登录工作台/ }).click()
  expect((await response).status()).toBe(200)
  await expect(page).toHaveURL('/duanap')
})
