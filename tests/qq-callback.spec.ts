import { test,expect } from '@playwright/test'
import { createServer } from 'node:http'
const code='fixture_authorization_code_12345678',state='a'.repeat(32)
test('existing public QQ callback is handled privately without a login session',async({request})=>{
  const r=await request.get('/oauth/qq/callback',{maxRedirects:0})
  expect(r.status()).toBe(400);expect(r.headers()['cache-control']).toContain('no-store')
  expect(r.headers()['referrer-policy']).toBe('no-referrer');expect(r.headers()['x-robots-tag']).toContain('noindex')
  expect(r.headers()['set-cookie']).toBeUndefined()
})
test('callback rejects duplicates, identity overrides, error conflicts and control characters',async({request})=>{
  for(const query of [`code=${code}&state=${state}&state=${state}`,`code=${code}&state=${state}&redirect_uri=https://evil.invalid`,`code=${code}&state=${state}&error=cancelled`,`code=%0d%0a&state=${state}`,`code=${code}&state=forged`]){
    const r=await request.get('/oauth/qq/callback?'+query,{maxRedirects:0});expect(r.status()).toBe(400)
    expect(r.headers().location).toBeUndefined();expect(await r.text()).not.toContain(code)
  }
  expect((await request.head('/oauth/qq/callback?'+new URLSearchParams({code,state}),{maxRedirects:0})).status()).toBe(405)
})
test('configured relay carries only opaque code/state to fixed blog callback and grants no Hub session',async({request})=>{
  const configured=['1','browser'].includes(process.env.HUB_TEST_QQ_CALLBACK||'')
  const r=await request.get('/oauth/qq/callback?'+new URLSearchParams({code,state}),{maxRedirects:0})
  if(!configured){expect(r.status()).toBe(503);return}
  expect(r.status()).toBe(303)
  const blog=process.env.HUB_TEST_QQ_CALLBACK==='browser'?'http://127.0.0.1:1031':'https://qq-blog-fixture.invalid'
  expect(r.headers().location).toBe(blog+'/wordpress/oauth/qq/callback?'+new URLSearchParams({code,state}))
  expect(r.headers()['set-cookie']).toBeUndefined();expect(r.headers()['referrer-policy']).toBe('no-referrer')
  expect((await request.get('/api/account/me')).status()).toBe(404)
})
test('browser sends the existing blog session on the fixed callback hop without a referrer',async({page,context})=>{
  test.skip(process.env.HUB_TEST_QQ_CALLBACK!=='browser','Requires loopback browser fixture')
  await context.addCookies([{name:'PHPSESSID',value:'synthetic-blog-session',domain:'127.0.0.1',path:'/wordpress',sameSite:'Lax'}])
  let received: {cookie?:string;referer?:string;url?:string}|undefined
  const blog=createServer((request,response)=>{
    if(!request.url?.startsWith('/wordpress/oauth/qq/callback?')){response.writeHead(204).end();return}
    received={cookie:request.headers.cookie,referer:request.headers.referer,url:request.url}
    response.end('Synthetic blog received its existing browser session')
  })
  await new Promise<void>(resolve=>blog.listen(1031,'127.0.0.1',resolve))
  try{
    await page.goto('/oauth/qq/callback?'+new URLSearchParams({code,state}))
    expect(received?.cookie).toContain('PHPSESSID=synthetic-blog-session')
    expect(received?.referer).toBeUndefined()
    expect(received?.url).toBe('/wordpress/oauth/qq/callback?'+new URLSearchParams({code,state}))
    expect((await context.cookies('http://127.0.0.1:1027')).length).toBe(0)
  }finally{await new Promise<void>((resolve,reject)=>blog.close(error=>error?reject(error):resolve()))}
})
