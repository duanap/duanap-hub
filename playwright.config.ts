import { defineConfig } from '@playwright/test'
import { randomBytes, scryptSync } from 'node:crypto'
import path from 'node:path'

const password = process.env.HUB_TEST_ADMIN_PASSWORD ||= randomBytes(24).toString('base64url')
const salt = randomBytes(16)
const baseURL = 'http://127.0.0.1:1027'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: 'list',
  use: {
    baseURL,
    browserName: 'chromium',
    channel: process.env.HUB_TEST_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next ' +
      (process.env.HUB_TEST_SERVER_MODE === 'production' ? 'start' : 'dev') + ' -H 127.0.0.1 -p 1027',
    url: `${baseURL}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      HUB_SITE_URL: baseURL,
      HUB_DATA_DIR: path.resolve('.tmp', `studio-e2e-${randomBytes(8).toString('hex')}`),
      HUB_ADMIN_USERNAME: 'duanap',
      HUB_ADMIN_PASSWORD_HASH: `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`,
    },
  },
})
