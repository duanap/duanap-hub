import { test,expect } from '@playwright/test'
import path from 'node:path'
import { writeFileSync,unlinkSync } from 'node:fs'
import Database from 'better-sqlite3'
import { enableAccounts,loginAccount,beginAccount,authorizeAccount,accountOrigin } from './helpers/accounts'
test.beforeEach(async({request})=>enableAccounts(request))

test('old epoch callback cannot erase sessions created after disable/re-enable',async({playwright,request})=>{
  const first=await playwright.request.newContext({baseURL:accountOrigin}),second=await playwright.request.newContext({baseURL:accountOrigin})
  const callback=await authorizeAccount(first,await beginAccount(first))
  await request.post('http://127.0.0.1:1031/__fixture/control',{data:{mode:'hold-token'}})
  const stale=first.get(callback,{maxRedirects:0})
  await new Promise(resolve=>setTimeout(resolve,100))
  for(const enabled of [false,true])await request.patch('/api/studio/modules',{headers:{Origin:accountOrigin},data:{id:'accounts',enabled}})
  await loginAccount(second,'bob')
  await request.post('http://127.0.0.1:1031/__fixture/control',{data:{releaseToken:true}})
  await stale
  expect((await second.get('/api/account/me')).status()).toBe(200)
  await first.dispose();await second.dispose()
})

test('slow Alice logout cannot remove a newer Bob cookie',async({playwright,request})=>{
  const member=await playwright.request.newContext({baseURL:accountOrigin}),a=await loginAccount(member)
  await request.post('http://127.0.0.1:1031/__fixture/control',{data:{mode:'hold-revoke'}})
  const logout=member.post('/api/auth/logout',{headers:{Origin:accountOrigin,'X-Hub-CSRF':a.me.csrfToken}})
  await new Promise(resolve=>setTimeout(resolve,100))
  await loginAccount(member,'bob')
  await request.post('http://127.0.0.1:1031/__fixture/control',{data:{releaseRevoke:true}})
  await logout
  const current=await member.get('/api/account/me')
  expect(current.status()).toBe(200);expect((await current.json()).user.displayName).toBe('Bob')
  await member.dispose()
})

test('late Alice unauthorized response leaves Bob session cookie intact',async({page})=>{
  await loginAccount(page.request)
  let release!:()=>void
  const blocked=new Promise<void>(resolve=>{release=resolve})
  let reached!:()=>void
  const started=new Promise<void>(resolve=>{reached=resolve})
  await page.route('**/api/account/me',async route=>{
    const original=route.request()
    // Keep the old request's Cookie, emulate an authoritative rejection after Bob login.
    reached();await blocked
    const response=await page.request.get(original.url(),{headers:{Cookie:original.headers().cookie||''}})
    await route.fulfill({response})
  },{times:1})
  await page.goto('/account');await started
  // Old token is revoked; the recorded cookie belongs to Alice, not the replacement.
  await page.request.post('http://127.0.0.1:1031/__fixture/control',{data:{revoke:true}})
  await loginAccount(page.request,'bob')
  release()
  await expect(page.getByRole('status')).toBeVisible()
  const current=await page.request.get('/api/account/me')
  expect(current.status()).toBe(200);expect((await current.json()).user.displayName).toBe('Bob')
})

test('identity mismatch clears all private UI rather than showing Alice under Bob login',async({page})=>{
  await loginAccount(page.request)
  let release!:()=>void,reached!:()=>void
  const blocked=new Promise<void>(resolve=>{release=resolve}),started=new Promise<void>(resolve=>{reached=resolve})
  await page.route('**/api/account/me',async route=>{
    const response=await route.fetch();reached();await blocked;await route.fulfill({response})
  },{times:1})
  await page.goto('/account');await started
  await loginAccount(page.request,'bob');release()
  await expect(page.getByRole('status')).toContainText('账号已变化')
  await expect(page.getByRole('heading',{name:'Alice',exact:true})).toHaveCount(0)
  await expect(page.locator('.account-balance')).toHaveCount(0)
})

test('first-time simultaneous tab authorizations both have valid browser bindings',async({playwright})=>{
  const user=await playwright.request.newContext({baseURL:accountOrigin})
  const starts=await Promise.all([beginAccount(user),beginAccount(user)])
  for(const url of starts){const callback=await authorizeAccount(user,url);expect((await user.get(callback,{maxRedirects:0})).headers().location).toBe(accountOrigin+'/account')}
  await user.dispose()
})

test('homepage ordering does not change account authentication generation',async({playwright,request})=>{
  const user=await playwright.request.newContext({baseURL:accountOrigin});await loginAccount(user)
  await request.patch('/api/studio/modules',{headers:{Origin:accountOrigin},data:{order:['tools','games','projects','about','blog','photos','notes','links','content','accounts','edgeone','github']}})
  expect((await user.get('/api/account/me')).status()).toBe(200)
  await user.dispose()
})

test('same-millisecond lifecycle changes still produce a new authentication generation',async({request})=>{
  const file=process.env.HUB_TEST_ACCOUNTS_CLOCKFILE!,directory=process.env.HUB_TEST_ACCOUNTS_DATA_DIR!
  if(path.dirname(file)!==directory||!path.basename(directory).startsWith('accounts-e2e-'))throw new Error('Explicit synthetic clock required')
  writeFileSync(file,String(Date.now()))
  const db=new Database(path.join(directory,'hub.sqlite'))
  try{
    await request.patch('/api/studio/modules',{headers:{Origin:accountOrigin},data:{id:'accounts',enabled:true}})
    const before=db.prepare("SELECT updated_at FROM module_settings WHERE id='accounts'").get() as {updated_at:string}
    for(const enabled of [false,true])await request.patch('/api/studio/modules',{headers:{Origin:accountOrigin},data:{id:'accounts',enabled}})
    const after=db.prepare("SELECT updated_at FROM module_settings WHERE id='accounts'").get() as {updated_at:string}
    expect(after.updated_at).not.toBe(before.updated_at)
  }finally{db.close();unlinkSync(file)}
})
