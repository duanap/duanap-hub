import { test,expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { decodeBackup } from '../scripts/backup-format.mjs'
import { enableAccounts,loginAccount,accountOrigin } from './helpers/accounts'
test.beforeEach(async({request})=>enableAccounts(request))
const accountDatabase=()=>new Database(path.join(process.env.HUB_TEST_ACCOUNTS_DATA_DIR!,'accounts.sqlite'))

test('users read their own balance/history and cannot revoke another account session',async({playwright})=>{
  const alice=await playwright.request.newContext({baseURL:accountOrigin}),bob=await playwright.request.newContext({baseURL:accountOrigin})
  const a=await loginAccount(alice),b=await loginAccount(bob,'bob')
  expect(a.me.user.hubUid).not.toBe(b.me.user.hubUid)
  expect((await (await alice.get('/api/account/points')).json()).balance).toBe(100)
  expect((await (await bob.get('/api/account/points')).json()).balance).toBe(200)
  const history=await alice.get('/api/account/points/history');expect(await history.text()).not.toContain('MUST_NOT_LEAK')
  expect((await alice.get('/api/account/me?hub_uid='+b.me.user.hubUid)).status()).toBe(400)
  expect((await alice.get('/api/account/points/history?per_page=999')).status()).toBe(400)
  expect((await alice.post('/api/account/checkin')).status()).toBe(405)
  const sessions=await (await bob.get('/api/account/sessions')).json(),foreign=sessions.sessions[0].id
  expect((await alice.post(`/api/account/sessions/${foreign}/revoke`,{headers:{Origin:accountOrigin,'X-Hub-CSRF':a.me.csrfToken}})).status()).toBe(404)
  expect((await bob.get('/api/account/me')).status()).toBe(200)
  expect(JSON.stringify(sessions)).not.toMatch(/accessToken|payload|hash|csrf/)
  await alice.dispose();await bob.dispose()
})

test('expired or revoked upstream token is rejected without extending local lifetime',async({playwright,request})=>{
  const user=await playwright.request.newContext({baseURL:accountOrigin});await loginAccount(user)
  await request.post('http://127.0.0.1:1031/__fixture/control',{data:{revoke:true}})
  expect((await user.get('/api/account/me')).status()).toBe(401)
  await loginAccount(user)
  const db=accountDatabase();db.prepare('UPDATE sessions SET expires_at=?').run(Math.floor(Date.now()/1000)-1);db.close()
  expect((await user.get('/api/account/me')).status()).toBe(401)
  await user.dispose()
})

test('malformed authoritative balance and changed subject fail without returning private data',async({playwright,request})=>{
  const user=await playwright.request.newContext({baseURL:accountOrigin});await loginAccount(user)
  await request.post('http://127.0.0.1:1031/__fixture/control',{data:{mode:'invalid-data'}})
  const balance=await user.get('/api/account/points');expect(balance.status()).toBe(503);expect(await balance.text()).not.toContain('"balance"')
  await request.post('http://127.0.0.1:1031/__fixture/control',{data:{mode:'wrong-identity'}})
  const identity=await user.get('/api/account/me');expect(identity.status()).toBe(401);expect(await identity.text()).not.toContain('Bob')
  await user.dispose()
})

test('auth expiry and encrypted server storage keep credentials out of backups',async({playwright,request})=>{
  const user=await playwright.request.newContext({baseURL:accountOrigin});await loginAccount(user)
  const db=accountDatabase(),rows=db.prepare('SELECT payload FROM sessions').all() as {payload:string}[]
  expect(rows.length).toBeGreaterThan(0)
  for(const row of rows){expect(()=>JSON.parse(row.payload)).toThrow();expect(row.payload).not.toContain('Alice')}
  const raw=readFileSync(path.join(process.env.HUB_TEST_ACCOUNTS_DATA_DIR!,'accounts.sqlite'))
  expect(raw.includes(Buffer.from(process.env.HUB_TEST_ACCOUNTS_SECRET!))).toBeFalsy()
  const archived=await (await request.post('/api/studio/backups',{headers:{Origin:accountOrigin}})).json()
  const archive=await (await request.get('/api/studio/backups/'+archived.backup.name)).body()
  const copy=new Database(decodeBackup(archive).database)
  expect(copy.prepare("SELECT name FROM sqlite_master WHERE name IN ('sessions','auth_transactions')").all()).toEqual([]);copy.close()
  const login=await user.get('/api/auth/login',{maxRedirects:0})
  const auth=await user.get(login.headers().location,{maxRedirects:0})
  db.prepare('UPDATE auth_transactions SET expires_at=?').run(Math.floor(Date.now()/1000)-1);db.close()
  expect((await user.get(auth.headers().location,{maxRedirects:0})).headers().location).toContain('auth=failed')
  await user.dispose()
})

test('blog failure or hang never blocks Core editing, backup, SEO or returns zero points',async({playwright,request})=>{
  const user=await playwright.request.newContext({baseURL:accountOrigin});await loginAccount(user)
  await request.post('http://127.0.0.1:1031/__fixture/control',{data:{mode:'timeout'}})
  const hanging=user.get('/api/account/points')
  const before=Date.now()
  expect((await request.put('/api/studio/site',{headers:{Origin:accountOrigin},data:{tagline:'账号故障隔离验收'}})).status()).toBe(200)
  expect((await request.post('/api/studio/backups',{headers:{Origin:accountOrigin}})).status()).toBe(201)
  expect(Date.now()-before).toBeLessThan(2400)
  for(const route of ['/','/duanap','/robots.txt','/sitemap.xml','/feed.xml'])expect((await request.get(route)).status()).toBe(200)
  const failed=await hanging;expect(failed.status()).toBe(503);expect(await failed.text()).not.toContain('"balance":0')
  await user.dispose()
})

test('disable hides account routes and re-enable invalidates previous sessions',async({playwright,request})=>{
  const user=await playwright.request.newContext({baseURL:accountOrigin});await loginAccount(user)
  await request.patch('/api/studio/modules',{headers:{Origin:accountOrigin},data:{id:'accounts',enabled:false}})
  for(const route of ['/account','/api/account/me','/api/auth/login'])expect((await user.get(route)).status()).toBe(404)
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain('/account')
  await request.patch('/api/studio/modules',{headers:{Origin:accountOrigin},data:{id:'accounts',enabled:true}})
  expect((await user.get('/api/account/me')).status()).toBe(401)
  await user.dispose()
})

test('read-only account page works on mobile and dark theme with private headers',async({page,request})=>{
  await loginAccount(page.request)
  await page.goto('/account');await expect(page.getByRole('heading',{name:'Alice',exact:true})).toBeVisible()
  await expect(page.locator('.account-balance')).toHaveText('100')
  await page.screenshot({path:'test-results/account-desktop-light.png',fullPage:true})
  await page.setViewportSize({width:390,height:844})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy()
  await page.getByRole('button',{name:'切换深色模式'}).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
  await page.screenshot({path:'test-results/account-mobile-dark.png',fullPage:true})
  const response=await request.get('/account');expect(response.headers()['cache-control']).toContain('no-store');expect(response.headers()['x-robots-tag']).toContain('noindex')
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain('/account')
})
