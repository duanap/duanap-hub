import { testOrigin } from './helpers/origin'
import { test, expect } from '@playwright/test'
import https from 'node:https'
import { Readable } from 'node:stream'
import { mock } from 'node:test'
import { inspectWebsite, isPublicAddress, parseWebsiteMetadata, websiteUrl } from '@/lib/site-preview'

test('website metadata handles entities, site names, relative icons and hostile icon URLs as text', () => {
  expect(parseWebsiteMetadata('<head><title>Fallback</title><meta property="og:site_name" content="站点 &amp; 朋友"><link rel="shortcut icon" href="../favicon.png"></head>', new URL('https://example.com/blog/'))).toEqual({ title: '站点 & 朋友', iconUrl: 'https://example.com/favicon.png' })
  expect(parseWebsiteMetadata('<title>&lt;script&gt;hello&lt;/script&gt;</title><link rel="icon" href="javascript:alert(1)">', new URL('https://example.com'))).toEqual({ title: '<script>hello</script>', iconUrl: 'https://example.com/favicon.ico' })
  expect(websiteUrl('example.com/a#top').href).toBe('https://example.com/a')
  expect(parseWebsiteMetadata('<link rel="ICON" href="/brand.png">',new URL('https://example.com')).iconUrl).toBe('https://example.com/brand.png')
  expect(() => websiteUrl('https://user:pass@example.com')).toThrow()
  expect(() => websiteUrl('https://example.com:8080')).toThrow()
  expect(() => websiteUrl('file:///etc/passwd')).toThrow()
})

test('public address checks reject private, loopback, link-local, multicast and mapped addresses', () => {
  for (const ip of ['127.0.0.1','0.0.0.0','10.1.2.3','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','224.0.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','2001:db8::1']) expect(isPublicAddress(ip), ip).toBe(false)
  expect(isPublicAddress('8.8.8.8')).toBe(true)
  expect(isPublicAddress('2606:4700:4700::1111')).toBe(true)
})

test('metadata pipeline checks every redirect, rejects mixed DNS and bounds size and redirect count', async () => {
  let calls = 0
  const resolve = async () => [{ address: '8.8.8.8', family: 4 }]
  await expect(inspectWebsite('https://example.com', { resolve, requestHtml: async (_url, address) => { expect(address.address).toBe('8.8.8.8'); calls++; return { status: 302, location: 'http://127.0.0.1/private' } } })).rejects.toThrow('公开网站')
  expect(calls).toBe(1)
  await expect(inspectWebsite('https://example.com', { resolve: async () => [...await resolve(), { address:'10.0.0.1',family:4 }], requestHtml: async () => { throw Error('must not connect') } })).rejects.toThrow('公开网站')
  await expect(inspectWebsite('https://example.com', { resolve, requestHtml: async () => ({ status:200, html:'x'.repeat(256 * 1024 + 1) }) })).rejects.toThrow('上限')
  calls = 0
  await expect(inspectWebsite('https://example.com', { resolve, requestHtml: async () => { calls++; return { status:302,location:'/again' } } })).rejects.toThrow('跳转过多')
  expect(calls).toBe(4)
})

test('real HTTP transport pins the checked address, disables pooling and sends no credentials', async () => {
  let options: any
  const stub = mock.method(https, 'request', ((url: URL, value: any, callback: (response: any) => void) => {
    expect(url.hostname).toBe('example.com'); options = value
    return { on() { return this }, end() { const response = Readable.from([Buffer.from('<head><title>Website</title></head>')]) as any; response.statusCode = 200; response.headers = { 'content-type':'text/html' }; callback(response) } }
  }) as any)
  try {
    const result = await inspectWebsite('https://example.com', { resolve: async () => [{ address:'8.8.8.8',family:4 }], requestHtml: async (url, address, signal) => {
      const native = await import('@/lib/site-preview')
      return native.requestWebsiteHtml(url,address,signal)
    } })
    expect(result.title).toBe('Website')
    expect(options.agent).toBe(false); expect(options.family).toBe(4)
    expect(options.headers.Cookie).toBeUndefined(); expect(options.headers.Authorization).toBeUndefined()
    const pinned = await new Promise(resolve => options.lookup('example.com', {}, (_error: unknown, address: string, family: number) => resolve({address,family})))
    expect(pinned).toEqual({address:'8.8.8.8',family:4})
  } finally { stub.mock.restore() }
})

test('link preview API protects admin access and refuses internal targets', async ({ page }) => {
  const headers = { Origin: testOrigin }
  expect((await page.request.post('/api/studio/link-preview',{headers,data:{url:'https://example.com'}})).status()).toBe(401)
  await page.request.post('/api/studio/login',{headers,data:{username:'duanap',password:process.env.HUB_TEST_ADMIN_PASSWORD}})
  expect((await page.request.post('/api/studio/link-preview',{headers:{Origin:'https://evil.invalid'},data:{url:'https://example.com'}})).status()).toBe(403)
  for (const url of ['http://127.0.0.1','http://2130706433','http://[::1]/','http://169.254.169.254','file:///etc/passwd','https://example.com:8888']) expect((await page.request.post('/api/studio/link-preview',{headers,data:{url}})).status(),url).toBe(400)
})
