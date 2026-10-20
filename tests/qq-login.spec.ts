import { test,expect } from '@playwright/test'
const configured=process.env.HUB_TEST_QQ_LOGIN==='1'
const base=process.env.HUB_TEST_QQ_WORDPRESS_URL||'https://qq-blog-fixture.invalid/wordpress/'
const ready=configured&&base.startsWith('https://')

test('QQ login is obvious on the home page without enabling P2',async({page,request})=>{
  await page.goto('/')
  await expect(page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'QQ登录',exact:true})).toBeVisible()
  await expect(page.locator('.hero').getByRole('link',{name:'QQ登录',exact:true})).toBeVisible()
  expect((await request.get('/api/account/me')).status()).toBe(404)
  const img=await request.get('/qq/qq-login.png');expect(img.status()).toBe(200);expect(img.headers()['content-type']).toContain('image/png')
})
test('unconfigured entry is honest and stays independent of WordPress',async({page,request})=>{
  test.skip(ready,'Configured native redirect tested separately')
  await page.goto('/');await page.locator('.hero').getByRole('link',{name:'QQ登录',exact:true}).click()
  await expect(page.getByRole('heading',{name:'QQ登录暂未开通'})).toBeVisible()
  await expect(page.getByRole('link',{name:'返回首页'})).toBeVisible()
  const response=await request.get('/login/qq');expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toContain('no-store');expect(response.headers()['x-robots-tag']).toContain('noindex')
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain('/login/')
  expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /login')
})
test('official image and QQ label fit mobile in light and dark mode',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/')
  for(const theme of ['light','dark']){
    await page.evaluate(value=>{document.documentElement.dataset.theme=value},theme)
    await expect(page.locator('.hero').getByRole('link',{name:'QQ登录',exact:true})).toBeVisible()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.screenshot({path:`test-results/qq-home-${theme}.png`,fullPage:true})
  }
})
test('explicitly configured entry delegates only to fixed native QQ route',async({request})=>{
  test.skip(!ready,'Requires a valid configured blog URL')
  const response=await request.get('/login/qq?returnTo=https://evil.invalid',{maxRedirects:0})
  expect(response.status()).toBe(307);expect(response.headers().location).toBe(new URL('oauth/qq',base).href)
  expect(response.headers()['cache-control']).toContain('no-store')
  expect((await request.get('/api/account/me')).status()).toBe(404)
})
