import { testOrigin } from './helpers/origin'
import { expect, test } from '@playwright/test'
import { readLimitedBody } from '@/lib/request-body'
test('body limit cancels an oversized stream before fully buffering it', async () => {
  let pulled = 0, cancelled = false
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { pulled++; controller.enqueue(new Uint8Array(8192)); if (pulled === 100) controller.close() },
    cancel() { cancelled = true },
  })
  const request = new Request('http://localhost/test', { method: 'POST', body, duplex: 'half' } as RequestInit)
  await expect(readLimitedBody(request, 2048)).rejects.toThrow('请求内容过大')
  expect(cancelled).toBeTruthy(); expect(pulled).toBeLessThan(5)
})
test('administrator endpoints reject forged origins and oversized JSON', async ({ page }) => {
  const headers = { Origin: testOrigin }
  const anonymous = await page.request.post('/api/studio/projects', { headers, data: { slug: 'private', title: 'private' } })
  expect(anonymous.status()).toBe(401)
  await page.request.post('/api/studio/login', { headers, data: { username: 'duanap', password: process.env.HUB_TEST_ADMIN_PASSWORD } })
  expect((await page.request.put('/api/studio/site', { headers: { Origin: 'https://evil.invalid' }, data: { siteName: 'changed' } })).status()).toBe(403)
  expect((await page.request.put('/api/studio/site', { headers, data: { biography: 'x'.repeat(100_000) } })).status()).toBe(400)
  const response = await page.request.get('/duanap')
  expect(response.headers()['cache-control']).toContain('no-store')
  expect(response.headers()['x-robots-tag']).toContain('noindex')
})

test('server account gate stays closed even if Studio module is enabled',async({request})=>{
  const headers={Origin:testOrigin}
  await request.post('/api/studio/login',{headers,data:{username:'duanap',password:process.env.HUB_TEST_ADMIN_PASSWORD}})
  expect((await request.patch('/api/studio/modules',{headers,data:{id:'accounts',enabled:true}})).status()).toBe(200)
  try{
    for(const route of ['/account','/api/auth/login','/api/account/me'])expect((await request.get(route)).status()).toBe(404)
    expect((await request.get('/')).status()).toBe(200)
  }finally{await request.patch('/api/studio/modules',{headers,data:{id:'accounts',enabled:false}})}
})
