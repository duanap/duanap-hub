import { test, expect } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { beginAccount,authorizeAccount,loginAccount,enableAccounts,accountOrigin } from './helpers/accounts'
test.beforeEach(async({request})=>enableAccounts(request))
const headers={Origin:'http://127.0.0.1:1027'}
test('enabled account module starts isolated OAuth login without Studio permission',async({request})=>{
  await request.post('/api/studio/login',{headers,data:{username:'duanap',password:process.env.HUB_TEST_ADMIN_PASSWORD}})
  expect((await request.patch('/api/studio/modules',{headers,data:{id:'accounts',enabled:true}})).status()).toBe(200)
  const login=await request.get('/api/auth/login',{maxRedirects:0})
  expect(login.status()).toBe(303)
  const target=new URL(login.headers().location)
  expect(target.origin).toBe('http://127.0.0.1:1031')
  expect(target.searchParams.get('code_challenge_method')).toBe('S256')
  expect(target.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(target.searchParams.has('client_secret')).toBeFalsy()
})

test('login callback creates private session and never grants Studio privileges',async({playwright})=>{
  const user=await playwright.request.newContext({baseURL:accountOrigin})
  const {me}=await loginAccount(user)
  expect(me.user.displayName).toBe('Alice')
  expect(JSON.stringify(me)).not.toContain('MUST_NOT_LEAK');expect(JSON.stringify(me)).not.toContain('access_token');expect(JSON.stringify(me)).not.toContain('administrator')
  expect((await user.get('/api/account/me')).headers()['cache-control']).toContain('private, no-store')
  expect((await user.post('/api/studio/site',{headers,data:{siteName:'illegal'}})).status()).toBe(405)
  expect((await user.put('/api/studio/site',{headers,data:{siteName:'illegal'}})).status()).toBe(401)
  const state=await user.storageState(),cookie=state.cookies.find(c=>c.name==='hub_user_session')!
  expect(cookie.httpOnly).toBeTruthy();expect(cookie.sameSite).toBe('Lax');expect(cookie.path).toBe('/')
  expect(cookie.expires-Date.now()/1000).toBeLessThanOrEqual(3600)
  const fresh=await playwright.request.newContext({baseURL:accountOrigin,storageState:{cookies:[{...cookie,name:'hub_admin_session'}],origins:[]}})
  expect((await fresh.put('/api/studio/site',{headers,data:{siteName:'illegal'}})).status()).toBe(401)
  await fresh.dispose();await user.dispose()
})

test('state is browser-bound, forged or duplicate values fail, and valid callback consumes once',async({playwright})=>{
  const owner=await playwright.request.newContext({baseURL:accountOrigin}),other=await playwright.request.newContext({baseURL:accountOrigin})
  const callback=await authorizeAccount(owner,await beginAccount(owner))
  const forged=new URL(callback);forged.searchParams.set('state',randomBytes(32).toString('base64url'))
  for(const [ctx,url] of [[owner,forged.href],[other,callback]] as const){expect((await ctx.get(url,{maxRedirects:0})).headers().location).toContain('auth=failed');expect((await ctx.get('/api/account/me')).status()).toBe(401)}
  const duplicate=new URL(callback);duplicate.searchParams.append('state',duplicate.searchParams.get('state')!)
  expect((await owner.get(duplicate.href,{maxRedirects:0})).headers().location).toContain('auth=failed')
  expect((await owner.get(callback,{maxRedirects:0})).headers().location).toBe(accountOrigin+'/account')
  const cookie=(await owner.storageState()).cookies.find(c=>c.name==='hub_user_session')!.value
  expect((await owner.get(callback,{maxRedirects:0})).headers().location).toContain('auth=failed')
  expect((await owner.storageState()).cookies.find(c=>c.name==='hub_user_session')!.value).toBe(cookie)
  await owner.dispose();await other.dispose()
})

test('two pending tabs have distinct transactions without overwriting each other',async({playwright})=>{
  const user=await playwright.request.newContext({baseURL:accountOrigin})
  const first=await beginAccount(user),second=await beginAccount(user)
  expect(new URL(first).searchParams.get('state')).not.toBe(new URL(second).searchParams.get('state'))
  for(const auth of [second,first])expect((await user.get(await authorizeAccount(user,auth),{maxRedirects:0})).headers().location).toBe(accountOrigin+'/account')
  expect((await user.get('/api/account/sessions')).status()).toBe(200)
  await user.dispose()
})

test('open returns and cross-site login initiation are rejected',async({request})=>{
  for(const target of ['https://evil.invalid/','//evil.invalid/','/account/../../duanap','/account/%2f%2fevil.invalid','/account\\evil','/api/studio/site'])expect((await request.get('/api/auth/login?returnTo='+encodeURIComponent(target),{maxRedirects:0})).status()).toBe(400)
  expect((await request.get('/api/auth/login',{headers:{'Sec-Fetch-Site':'cross-site'},maxRedirects:0})).status()).toBe(403)
})

test('logout requires CSRF and origin; local session stays revoked when blog is unavailable',async({playwright,request})=>{
  const user=await playwright.request.newContext({baseURL:accountOrigin}),{me}=await loginAccount(user),saved=await user.storageState()
  for(const h of [{Origin:accountOrigin},{Origin:'https://evil.invalid','X-Hub-CSRF':me.csrfToken}] as Record<string,string>[])expect((await user.post('/api/auth/logout',{headers:h})).status()).toBe(403)
  expect((await user.get('/api/account/me')).status()).toBe(200)
  await request.post('http://127.0.0.1:1031/__fixture/control',{data:{mode:'unavailable'}})
  const result=await user.post('/api/auth/logout',{headers:{...headers,'X-Hub-CSRF':me.csrfToken}})
  expect(result.status()).toBe(200);expect((await result.json()).upstreamRevoked).toBeFalsy()
  const replay=await playwright.request.newContext({baseURL:accountOrigin,storageState:saved})
  expect((await replay.get('/api/account/me')).status()).toBe(401)
  await user.dispose();await replay.dispose()
})

test('existing WordPress names up to the native 250-character limit remain valid',async({playwright,request})=>{
  await request.post('http://127.0.0.1:1031/__fixture/control',{data:{mode:'long-name'}})
  const user=await playwright.request.newContext({baseURL:accountOrigin})
  const {me}=await loginAccount(user)
  expect(me.user.displayName.length).toBe(250)
  await user.dispose()
})

test('overlong token lifetime cannot create a local authenticated session',async({playwright,request})=>{
  await request.post('http://127.0.0.1:1031/__fixture/control',{data:{lifetime:7200}})
  const user=await playwright.request.newContext({baseURL:accountOrigin})
  const callback=await authorizeAccount(user,await beginAccount(user))
  expect((await user.get(callback,{maxRedirects:0})).headers().location).toContain('auth=failed')
  expect((await user.get('/api/account/me')).status()).toBe(401)
  await user.dispose()
})
