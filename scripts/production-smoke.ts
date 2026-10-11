import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'
import assert from 'node:assert/strict'

async function main() {
  const probe = createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const address = probe.address()
  if (!address || typeof address === 'string') throw new Error('Unable to select a local test port')
  const port = address.port
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  )
  await mkdir('.tmp', { recursive: true })
  const data = await mkdtemp(path.resolve('.tmp', 'production-smoke-')),
    origin = 'http://127.0.0.1:' + port
  process.env.HUB_DATA_DIR = data
  process.env.HUB_SITE_URL = origin
  const { createProject, createEntry } = await import('../lib/db')
  const project = createProject({
    slug: 'production-check',
    title: '生产构建验收用项目',
    summary: '仅供隔离启动验证',
    body: '## production-cold-ssr\n\n不依赖浏览器 JavaScript 的真实正文。',
    published: true,
  })
  createEntry({
    projectId: project.id,
    type: 'changelog',
    title: '生产构建验收日志',
    published: true,
    body: '隔离测试记录',
  })
  const server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)],
    {
      env: { ...process.env, HUB_ADMIN_PASSWORD_HASH: '', NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let output = '',
    exited = false
  server.stdout.on('data', (chunk) => {
    output = (output + chunk.toString()).slice(-4000)
  })
  server.stderr.on('data', (chunk) => {
    output = (output + chunk.toString()).slice(-4000)
  })
  server.on('exit', () => {
    exited = true
  })
  try {
    let ready = false
    for (let i = 0; i < 100; i++) {
      if (exited) throw new Error('Production server exited: ' + output)
      try {
        const response = await fetch(origin + '/api/health')
        if (response.ok) {
          ready = true
          break
        }
      } catch {}
      await wait(150)
    }
    assert.equal(
      ready,
      true,
      'Production server must start without external-service or administrator setup',
    )
    const routes = [
      '/',
      '/about',
      '/projects',
      '/projects/production-check',
      '/games',
      '/tools',
      '/tools/password',
      '/tools/json',
      '/robots.txt',
      '/sitemap.xml',
      '/feed.xml',
      '/duanap/login',
      '/opengraph-image',
    ]
    for (const route of routes) {
      const response = await fetch(origin + route)
      assert.equal(response.status, 200, route + ' must return 200')
    }
    const detail = await (await fetch(origin + '/projects/production-check')).text()
    const visibleHTML = detail.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    assert.ok(visibleHTML.includes('production-cold-ssr'), 'Project body must exist in server HTML')
    assert.ok(
      visibleHTML.includes(origin + '/projects/production-check'),
      'Canonical must use runtime Origin',
    )
    const admin = await fetch(origin + '/duanap', { redirect: 'manual' })
    assert.equal(admin.status, 307, 'Unauthenticated Studio remains protected')
    console.log(
      JSON.stringify({
        ok: true,
        routes: routes.length,
        serverRenderedBody: true,
        administratorRequiredForPublicStartup: false,
        externalServicesConfigured: false,
      }),
    )
  } finally {
    if (!exited) {
      const done = once(server, 'exit')
      server.kill('SIGTERM')
      await Promise.race([done, wait(5000)])
    }
  }
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
