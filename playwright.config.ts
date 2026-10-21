import { defineConfig } from '@playwright/test'
import { randomBytes, scryptSync } from 'node:crypto'
import path from 'node:path'
import { testOrigin, testPort } from './tests/helpers/origin'

const password = process.env.HUB_TEST_ADMIN_PASSWORD ||= randomBytes(24).toString('base64url')
const salt = randomBytes(16)
const baseURL = testOrigin
const testDataDirectory = process.env.HUB_TEST_DATA_DIR ||= path.resolve('.tmp', `studio-e2e-${randomBytes(8).toString('hex')}`)
const blogFixture = process.env.HUB_TEST_BLOG_FIXTURE ||= path.join(testDataDirectory, 'wordpress-fixture.json')

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  testIgnore: ['**/accounts*.spec.ts','**/members*.spec.ts','**/content.spec.ts','**/p3-*.spec.ts','**/edgeone.spec.ts'],
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
    command: 'node --import ./tests/helpers/wordpress-fixture.mjs ' + (process.env.HUB_TEST_OFFLINE === '1' ? '--import ./tests/helpers/offline.mjs ' : '') + 'node_modules/next/dist/bin/next ' +
      (process.env.HUB_TEST_SERVER_MODE === 'production' ? 'start' : 'dev') + ' -H 127.0.0.1 -p ' + testPort,
    url: `${baseURL}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      HUB_SITE_URL: baseURL,
      HUB_DATA_DIR: testDataDirectory,
      HUB_TEST_BLOG_FIXTURE: blogFixture,
      HUB_CONTENT_WORDPRESS_URL: 'https://wordpress-fixture.invalid/subsite/',
      HUB_ADMIN_USERNAME: 'duanap',
      HUB_ADMIN_PASSWORD_HASH: `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`,
    },
  },
})
