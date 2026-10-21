// Isolated test-server transport: only this reserved source is intercepted.
// No production module imports this helper and no real WordPress is modified.
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
const original = globalThis.fetch
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url)
  if (url.origin !== 'https://wordpress-fixture.invalid') return original(input, options)
  const filename = process.env.HUB_TEST_BLOG_FIXTURE
  if (!filename || !existsSync(filename)) throw new Error('WordPress fixture not installed')
  const fixture = JSON.parse(readFileSync(filename, 'utf8'))
  appendFileSync(filename + '.requests', JSON.stringify({ url: url.href, redirect: options.redirect }) + '\n')
  if (fixture.mode === 'timeout') return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }))
  if (fixture.mode === 'failure') return new Response('temporarily unavailable', { status: 503 })
  if (fixture.mode === 'invalid') return Response.json({ error: 'not an array' })
  if (fixture.mode === 'oversize') return new Response('x'.repeat(3 * 1024 * 1024 + 1))
  if (url.pathname.endsWith('/categories')) return Response.json([{ id: 1, name: '开发', link: 'https://wordpress-fixture.invalid/subsite/dev' }, { id: 2, name: '生活', link: 'https://wordpress-fixture.invalid/subsite/life' }])
  if (url.pathname.endsWith('/media')) return Response.json([])
  const page = Number(url.searchParams.get('page'))
  return Response.json((fixture.posts || []).slice((page - 1) * 100, page * 100), { headers: { 'x-wp-totalpages': String(Math.max(1, Math.ceil((fixture.posts || []).length / 100))) } })
}
