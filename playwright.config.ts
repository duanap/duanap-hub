import { defineConfig } from '@playwright/test'
import { randomBytes, scryptSync } from 'node:crypto'
import path from 'node:path'

// Playwright reloads this config in workers. Keep one ephemeral identity per run.
if (!process.env.HUB_E2E_RUN_ID) {
  process.env.HUB_E2E_RUN_ID = randomBytes(6).toString('hex')
  const password = randomBytes(24).toString('base64url'),
    salt = randomBytes(16)
  process.env.HUB_TEST_PASSWORD = password
  process.env.HUB_ADMIN_PASSWORD_HASH = `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`
  process.env.HUB_ADMIN_USERNAME = 'local-test-admin'
  process.env.HUB_DATA_DIR = path.resolve('.tmp', 'e2e-' + process.env.HUB_E2E_RUN_ID)
  process.env.HUB_SITE_URL = 'http://127.0.0.1:1027'
}

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: process.env.HUB_SITE_URL,
    headless: true,
    trace: 'retain-on-failure',
    channel: 'chrome',
  },
  reporter: [['list']],
  webServer: {
    command: 'node node_modules/tsx/dist/cli.mjs scripts/e2e-server.ts',
    url: 'http://127.0.0.1:1027/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
