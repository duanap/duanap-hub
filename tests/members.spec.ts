import { test as baseTest,expect,type APIRequestContext } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { enableAccounts,accountOrigin,authorizeAccount } from './helpers/accounts'
const test=baseTest.extend({request:async({playwright},use)=>{const client=await playwright.request.newContext({baseURL:accountOrigin,extraHTTPHeaders:{'X-Real-IP':'isolated-member-'+randomBytes(8).toString('hex')}});try{await use(client)}finally{await client.dispose()}}})
const password='Synthetic-member-password-2026!',origin={Origin:accountOrigin}
const username=()=> 'member_'+randomBytes(5).toString('hex')
async function local(c:APIRequestContext){const name=username(),r=await c.post('/api/member/register',{headers:origin,data:{username:name,password}});expect(r.status(),await r.text()).toBe(200);return {name,...await r.json(),me:await (await c.get('/api/member/me')).json()}}
async function mutation(c:APIRequestContext,action:string,data:unknown={}){const me=await (await c.get('/api/member/me')).json();return c.post('/api/member/'+action,{headers:{...origin,'X-Hub-CSRF':me.csrfToken},data})}
async function link(c:APIRequestContext,user='alice',automatic=false){const r=await mutation(c,'blog/link',{automatic});expect(r.status()).toBe(200);const {url}=await r.json();return authorizeAccount(c,url,user)}
async function qq(c:APIRequestContext,options:{user?:string;mode?:string;avatar?:string;automatic?:boolean;connect?:boolean}={}){await c.post('http://127.0.0.1:1032/__fixture/control',{data:options});const r=options.connect?await mutation(c,'qq/connect',{password}):await c.get('/api/member/qq'+(options.automatic?'?linkBlog=1':'?linkBlog=0'),{maxRedirects:0}),url=options.connect?(await r.json()).url:r.headers().location;const grant=await c.get(url,{maxRedirects:0}),callback=grant.headers().location;return {callback,result:await c.get(callback,{maxRedirects:0})}}
test.beforeEach(async({request})=>{await enableAccounts(request)})
test('independent password registration/login/recovery work during blog failure and recovery is one-use',async({playwright,request})=>{
 const c=await playwright.request.newContext({baseURL:accountOrigin,extraHTTPHeaders:{'X-Real-IP':'member-offline'}})
 try{await request.post('http://127.0.0.1:1031/__fixture/control',{data:{mode:'unavailable'}});const u=await local(c);expect(u.me.blog.linked).toBe(false);expect(u.recovery).toMatch(/^[\w-]{43}$/);expect((await c.put('/api/studio/site',{headers:origin,data:{}})).status()).toBe(401);await mutation(c,'logout');expect((await c.get('/api/member/me')).status()).toBe(401);expect((await c.post('/api/member/login',{headers:origin,data:{username:u.name.toUpperCase(),password}})).status()).toBe(200);const reset=await c.post('/api/member/recover',{headers:origin,data:{username:u.name,password:password+'new',recovery:u.recovery}});expect(reset.status()).toBe(200);expect((await reset.json()).recovery).not.toBe(u.recovery);expect((await c.post('/api/member/recover',{headers:origin,data:{username:u.name,password,recovery:u.recovery}})).status()).toBe(401)}finally{await c.dispose()}
})
test('unlinked users and foreign/missing CSRF requests cannot write or check in',async({request})=>{const u=await local(request);const r=await request.post('/api/account/checkin',{headers:{...origin,'X-Hub-CSRF':u.me.csrfToken},data:{businessDate:'2026-10-16'}});expect(r.status()).toBe(403);expect((await r.json()).code).toBe('blog_binding_required');expect((await request.post('/api/member/blog/link',{headers:origin,data:{}})).status()).toBe(403);expect((await request.post('/api/member/register',{headers:{Origin:'https://evil.invalid'},data:{username:username(),password}})).status()).toBe(403)})
test('blog authorization enables points and single daily receipt; unlink removes access and retains main login',async({request})=>{await local(request);const callback=await link(request,'bob');expect((await request.get(callback,{maxRedirects:0})).headers().location).toBe(accountOrigin+'/account?blog=authorized');let me=await (await request.get('/api/member/me')).json();expect(me.blog.authorized).toBe(true);const checkin=await (await request.get('/api/account/checkin')).json();const results=await Promise.all([1,2].map(()=>request.post('/api/account/checkin',{headers:{...origin,'X-Hub-CSRF':me.csrfToken},data:{businessDate:checkin.businessDate}})));expect(results.map(r=>r.status())).toEqual([200,200]);expect((await results[0].json()).receipt).toBe((await results[1].json()).receipt);await mutation(request,'blog/unlink',{confirm:true});me=await (await request.get('/api/member/me')).json();expect(me.blog.linked).toBe(false);expect((await request.get('/api/account/points')).status()).toBe(403)})
test('one blog account cannot bind two independent local members',async({request,playwright})=>{await local(request);await request.get(await link(request),{maxRedirects:0});const c=await playwright.request.newContext({baseURL:accountOrigin,extraHTTPHeaders:{'X-Real-IP':'member-other'}});try{await local(c);expect((await c.get(await link(c),{maxRedirects:0})).headers().location).toContain('auth=failed');expect((await (await c.get('/api/member/me')).json()).blog.linked).toBe(false)}finally{await mutation(request,'blog/unlink',{confirm:true});await c.dispose()}})
test('logout or unlink cancels pending blog authorization intent',async({request})=>{await local(request);const pending=await link(request);await mutation(request,'blog/unlink',{confirm:true});expect((await request.get(pending,{maxRedirects:0})).headers().location).toContain('auth=failed');expect((await (await request.get('/api/member/me')).json()).blog.linked).toBe(false);const next=await link(request);await mutation(request,'logout');expect((await request.get(next,{maxRedirects:0})).headers().location).toContain('auth=failed')})
test('QQ avatar high-resolution fallback, preferences and callback replay protection',async({request})=>{const {callback,result}=await qq(request,{user:'avatar',avatar:'small'});expect(result.headers().location).toBe(accountOrigin+'/account');let me=await (await request.get('/api/member/me')).json();expect(me.member.avatarUrl).toMatch(/^https:\/\/q\.qlogo\.cn\/.+\/40$/);expect((await request.get(callback,{maxRedirects:0})).headers().location).toContain('qq=failed');await mutation(request,'profile',{displayName:'Chosen name',avatarSource:'initials'});await mutation(request,'logout');await qq(request,{user:'avatar'});me=await (await request.get('/api/member/me')).json();expect(me.member.avatarUrl).toBe('');expect(me.member.displayName).toBe('Chosen name')})
test('QQ wrong-app identity is rejected and missing UnionID only disables automatic matching',async({request})=>{const wrong=await qq(request,{mode:'wrong-app'});expect(wrong.result.headers().location).toContain('qq=failed');expect((await request.get('/api/member/me')).status()).toBe(401);const missing=await qq(request,{mode:'no-union',automatic:true,user:'no-union'});expect(missing.result.headers().location).toContain('blog=manual');expect((await (await request.get('/api/member/me')).json()).blog.linked).toBe(false)})
test('matching server-issued UnionID automatically links after consent; mismatched UnionID refuses',async({request})=>{await request.post('http://127.0.0.1:1031/__fixture/control',{data:{qqUnion:true}});const {result}=await qq(request,{user:'alice',automatic:true});const callback=await authorizeAccount(request,result.headers().location);expect((await request.get(callback,{maxRedirects:0})).headers().location).toBe(accountOrigin+'/account?blog=linked');expect((await (await request.get('/api/member/me')).json()).blog.match).toBe('qq_union');await mutation(request,'blog/unlink',{confirm:true});await mutation(request,'logout');const next=await qq(request,{user:'bob',automatic:true});const mismatch=await authorizeAccount(request,next.result.headers().location);expect((await request.get(mismatch,{maxRedirects:0})).headers().location).toContain('blog=qq-mismatch');expect((await (await request.get('/api/member/me')).json()).blog.linked).toBe(false)})
test('a local member connects QQ and sets password without creating a different UID',async({request})=>{const u=await local(request);await qq(request,{user:'existing',connect:true});const me=await (await request.get('/api/member/me')).json();expect(me.member.id).toBe(u.me.member.id);expect(me.member.qqLinked).toBe(true);expect((await mutation(request,'password',{oldPassword:password,password:password+'new'})).status()).toBe(200)})
test('private member snapshot restores identities, clears sessions and requires blog reauthorization',async({request})=>{
 const u=await local(request);await request.get(await link(request),{maxRedirects:0});const root=path.resolve('.tmp','members-recovery-'+randomBytes(5).toString('hex')),target=path.join(root,'restored'),backup=path.join(root,'private.sqlite');mkdirSync(target,{recursive:true})
 execFileSync(process.execPath,['scripts/backup-members.mjs','--data-dir',process.env.HUB_TEST_ACCOUNTS_DATA_DIR!,'--output',backup],{stdio:'pipe'})
 execFileSync(process.execPath,['scripts/restore-members.mjs','--input',backup,'--data-dir',target,'--confirm-restore'],{stdio:'pipe'})
 const db=new Database(path.join(target,'members.sqlite'),{readonly:true});try{expect(db.prepare('SELECT id FROM members WHERE id=?').get(u.me.member.id)).toBeTruthy();expect((db.prepare('SELECT COUNT(*) n FROM member_sessions').get() as {n:number}).n).toBe(0);expect(db.prepare('SELECT authorized,payload FROM member_blogs WHERE member_id=?').get(u.me.member.id)).toEqual({authorized:0,payload:''})}finally{db.close();await mutation(request,'blog/unlink',{confirm:true})}
})
test('mobile dark UI supports registration, recovery delivery and native autofill form values',async({page})=>{await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'dark'});await page.goto('/account');await page.getByRole('button',{name:'切换深色模式',exact:true}).click();await expect(page.getByRole('button',{name:'切换浅色模式',exact:true})).toBeVisible();await page.getByRole('button',{name:'注册',exact:true}).click();const name=username();await page.getByLabel('用户名',{exact:true}).fill(name);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'创建主站账号'}).click();await expect(page.getByRole('heading',{name:'请保存恢复密钥'})).toBeVisible();await expect(page.getByText('尚未关联博客，签到与积分尚未解锁')).toBeVisible();await page.getByRole('button',{name:'退出主站',exact:true}).click();await page.getByRole('button',{name:'登录',exact:true}).click();await page.locator('input[name=username]').evaluate((el:HTMLInputElement,value)=>{el.value=value},name);await page.locator('input[name=password]').evaluate((el:HTMLInputElement,value)=>{el.value=value},password);await page.getByRole('button',{name:'登录主站',exact:true}).click();await expect(page.getByText('用户名：'+name)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)})

async function stagedQQ(c:APIRequestContext,user:string,action='qq/replace',data:unknown={password}){
  await c.post('http://127.0.0.1:1032/__fixture/control',{data:{user}})
  const start=await mutation(c,action,data);expect(start.status(),await start.text()).toBe(200)
  const url=(await start.json()).url,grant=await c.get(url,{maxRedirects:0});return grant.headers().location
}
test('first QQ binding requires the password of the existing local account',async({request})=>{
  const u=await local(request)
  expect((await mutation(request,'qq/connect')).status()).toBe(403)
  expect((await mutation(request,'qq/connect',{password:'wrong'})).status()).toBe(403)
  expect((await (await request.get('/api/member/me')).json()).member.qqLinked).toBe(false)
  await qq(request,{user:'password-protected-connect',connect:true})
  expect((await (await request.get('/api/member/me')).json()).member.id).toBe(u.me.member.id)
})
test('social-only QQ cannot be unlinked until a password and recovery key exist; unlink revokes peers and pending bind',async({request,playwright})=>{
  await qq(request,{user:'unlink-social-only'})
  const before=await (await request.get('/api/member/me')).json()
  expect((await mutation(request,'qq/unlink',{confirm:true,password})).status()).toBe(403)
  const fallback=await mutation(request,'password',{password});expect(fallback.status()).toBe(200);expect((await fallback.json()).recovery).toMatch(/^[\w-]{43}$/)
  const peer=await playwright.request.newContext({baseURL:accountOrigin,extraHTTPHeaders:{'X-Real-IP':'qq-unlink-peer'}})
  try{
    expect((await peer.post('/api/member/login',{headers:origin,data:{username:before.member.username,password}})).status()).toBe(200)
    const pending=await stagedQQ(request,'unlink-social-only','qq/connect',{})
    expect((await mutation(request,'qq/unlink',{confirm:true,password:'wrong'})).status()).toBe(403)
    expect((await mutation(request,'qq/unlink',{confirm:true,password})).status()).toBe(200)
    const after=await (await request.get('/api/member/me')).json();expect(after.member.id).toBe(before.member.id);expect(after.member.qqLinked).toBe(false);expect(after.member.avatarUrl).toBe('')
    expect((await peer.get('/api/member/me')).status()).toBe(401)
    expect((await request.get(pending,{maxRedirects:0})).headers().location).toContain('qq=failed')
    expect((await (await request.get('/api/member/me')).json()).member.qqLinked).toBe(false)
  }finally{await peer.dispose()}
})
test('QQ replacement is atomic, retains main UID/blog mapping, revokes peers and fences a second pending replacement',async({request,playwright})=>{
  const u=await local(request);await qq(request,{user:'replace-old',connect:true});await request.get(await link(request,'bob'),{maxRedirects:0})
  const peer=await playwright.request.newContext({baseURL:accountOrigin,extraHTTPHeaders:{'X-Real-IP':'qq-replace-peer'}})
  try{
    await peer.post('/api/member/login',{headers:origin,data:{username:u.name,password}})
    const first=await stagedQQ(request,'replace-new'),stale=await stagedQQ(request,'replace-stale')
    expect((await request.get(first,{maxRedirects:0})).headers().location).toContain('qq=updated')
    const after=await (await request.get('/api/member/me')).json();expect(after.member.id).toBe(u.me.member.id);expect(after.member.qqLinked).toBe(true);expect(after.blog.linked).toBe(true);expect(after.blog.authorized).toBe(false)
    expect((await peer.get('/api/member/me')).status()).toBe(401);expect((await request.get('/api/account/points')).status()).toBe(403)
    expect((await request.get(stale,{maxRedirects:0})).headers().location).toContain('qq=failed')
    await mutation(request,'blog/unlink',{confirm:true})
  }finally{await peer.dispose()}
})
test('a QQ owned by another member cannot replace the existing binding',async({request,playwright})=>{
  const u=await local(request);await qq(request,{user:'conflict-old',connect:true})
  const owner=await playwright.request.newContext({baseURL:accountOrigin,extraHTTPHeaders:{'X-Real-IP':'qq-conflict-owner'}})
  try{
    const other=await local(owner);await qq(owner,{user:'conflict-owned',connect:true})
    const callback=await stagedQQ(request,'conflict-owned');expect((await request.get(callback,{maxRedirects:0})).headers().location).toContain('qq=failed')
    const after=await (await request.get('/api/member/me')).json();expect(after.member.id).toBe(u.me.member.id);expect(after.member.qqLinked).toBe(true)
    expect((await (await owner.get('/api/member/me')).json()).member.id).toBe(other.me.member.id)
    const db=new Database(path.join(process.env.HUB_TEST_ACCOUNTS_DATA_DIR!,'members.sqlite'),{readonly:true})
    try{expect(db.prepare('SELECT count(*) n FROM member_qq WHERE member_id=?').get(u.me.member.id)).toEqual({n:1})}finally{db.close()}
  }finally{await owner.dispose()}
})
test('password change invalidates a previously password-approved QQ replacement',async({request})=>{
  await local(request);await qq(request,{user:'reset-replacement-old',connect:true});const callback=await stagedQQ(request,'reset-replacement-new')
  expect((await mutation(request,'password',{oldPassword:password,password:password+'changed'})).status()).toBe(200)
  expect((await request.get(callback,{maxRedirects:0})).headers().location).toContain('qq=failed')
  expect((await (await request.get('/api/member/me')).json()).member.qqLinked).toBe(true)
})
test('invalid optional UnionID configuration does not disable ordinary QQ login',async({request})=>{
  test.skip(!process.env.HUB_TEST_QQ_REALM,'isolated malformed-scope run only')
  const state=await (await request.get('/api/member/status')).json();expect(state.qqConfigured).toBe(true);expect(state.qqAutoLinkConfigured).toBe(false)
  const {result}=await qq(request,{user:'invalid-realm-normal-login'});expect(result.headers().location).toBe(accountOrigin+'/account');expect((await request.get('/api/member/me')).status()).toBe(200)
})

test('a delayed member logout response cannot erase a newer account login',async({page})=>{
  const first=await local(page.request);await page.goto('/account')
  let release!:()=>void,received!:()=>void
  const held=new Promise<void>(resolve=>{release=resolve}),ready=new Promise<void>(resolve=>{received=resolve})
  await page.route('**/api/member/logout',async route=>{const response=await route.fetch();received();await held;await route.fulfill({response})})
  const pending=page.evaluate(async token=>{const r=await fetch('/api/member/logout',{method:'POST',headers:{'Content-Type':'application/json','X-Hub-CSRF':token},body:'{}'});return r.status},first.me.csrfToken)
  await ready
  try{const second=await local(page.request);release();expect(await pending).toBe(200);const now=await (await page.request.get('/api/member/me')).json();expect(now.member.id).toBe(second.me.member.id)}finally{release()}
})

test('QQ management UI preserves the selected operation after a wrong password and completes unlink',async({page})=>{
  const u=await local(page.request);await qq(page.request,{user:'qq-management-ui',connect:true})
  await page.goto('/account');await expect(page.getByRole('button',{name:'刷新账号',exact:true})).toBeEnabled()
  await page.getByRole('combobox',{name:'QQ 管理操作',exact:true}).selectOption('unlink');await page.getByLabel('验证主站密码',{exact:true}).fill('wrong')
  page.on('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'执行 QQ 账号操作',exact:true}).click()
  await expect(page.getByText('主站密码验证失败',{exact:true})).toBeVisible();await expect(page.getByRole('combobox',{name:'QQ 管理操作',exact:true})).toHaveValue('unlink')
  await page.getByLabel('验证主站密码',{exact:true}).fill(password);await page.getByRole('button',{name:'执行 QQ 账号操作',exact:true}).click()
  await expect(page.getByText('当前未关联 QQ',{exact:true})).toBeVisible();const current=await (await page.request.get('/api/member/me')).json();expect(current.member.id).toBe(u.me.member.id);expect(current.member.qqLinked).toBe(false)
})

test('default QQ entry creates a passwordless member then checks and links the same QQ blog',async({request})=>{
  await request.post('http://127.0.0.1:1031/__fixture/control',{data:{qqUnion:true}})
  await request.post('http://127.0.0.1:1032/__fixture/control',{data:{user:'alice'}})
  const start=await request.get('/api/member/qq',{maxRedirects:0}),grant=await request.get(start.headers().location,{maxRedirects:0})
  const logged=await request.get(grant.headers().location,{maxRedirects:0}),before=await (await request.get('/api/member/me')).json()
  expect(before.member.passwordReady).toBe(false);expect(before.member.qqLinked).toBe(true)
  expect(new URL(logged.headers().location).searchParams.get('hub_login')).toBe('qq')
  const callback=await authorizeAccount(request,logged.headers().location)
  expect((await request.get(callback,{maxRedirects:0})).headers().location).toBe(accountOrigin+'/account?blog=linked')
  const after=await (await request.get('/api/member/me')).json();expect(after.member.id).toBe(before.member.id);expect(after.blog.match).toBe('qq_union');expect(after.blog.authorized).toBe(true)
  await mutation(request,'blog/unlink',{confirm:true})
})

test('failed same QQ verification preserves a manually authorized blog and reports a separate result',async({request})=>{
  await local(request);await qq(request,{user:'manual-blog-verification',connect:true});await request.get(await link(request),{maxRedirects:0})
  const before=await (await request.get('/api/member/me')).json(),callback=await link(request,'alice',true)
  expect((await request.get(callback,{maxRedirects:0})).headers().location).toContain('blog=proof-missing')
  const after=await (await request.get('/api/member/me')).json();expect(after.member.id).toBe(before.member.id);expect(after.blog).toEqual(before.blog)
  const pending=await mutation(request,'blog/link',{automatic:true}),url=new URL((await pending.json()).url),cancel=new URL(accountOrigin+'/api/auth/callback')
  cancel.searchParams.set('state',url.searchParams.get('state')!);cancel.searchParams.set('error','blog_qq_not_found')
  expect((await request.get(cancel.href,{maxRedirects:0})).headers().location).toContain('blog=not-found')
  expect((await (await request.get('/api/member/me')).json()).blog).toEqual(before.blog)
  for(const [error,result] of [['blog_qq_conflict','conflict'],['blog_qq_unavailable','unavailable'],['blog_qq_cancelled','cancelled']]){
    const started=await mutation(request,'blog/link',{automatic:true}),target=new URL((await started.json()).url),back=new URL(accountOrigin+'/api/auth/callback')
    back.searchParams.set('state',target.searchParams.get('state')!);back.searchParams.set('error',error)
    expect((await request.get(back.href,{maxRedirects:0})).headers().location).toContain('blog='+result)
    expect((await (await request.get('/api/member/me')).json()).blog).toEqual(before.blog)
  }
  await mutation(request,'blog/unlink',{confirm:true})
})

test('QQ member can optionally customize username without setting a password or changing UID',async({request,page})=>{
  await qq(request,{user:'optional-username'})
  const before=await (await request.get('/api/member/me')).json(),chosen=username()
  expect((await mutation(request,'username',{username:chosen})).status()).toBe(200)
  const after=await (await request.get('/api/member/me')).json();expect(after.member.id).toBe(before.member.id);expect(after.member.username).toBe(chosen);expect(after.member.passwordReady).toBe(false)
  expect((await request.post('/api/member/username',{headers:origin,data:{username:username()}})).status()).toBe(403)
  await mutation(request,'password',{password});await mutation(request,'logout')
  expect((await request.post('/api/member/login',{headers:origin,data:{username:chosen,password}})).status()).toBe(200)
  expect((await (await request.get('/api/member/me')).json()).member.id).toBe(before.member.id)
  expect((await mutation(request,'username',{username:username(),password:'wrong'})).status()).toBe(403)
  await page.goto('/account');await expect(page.getByRole('link',{name:'QQ 登录',exact:true})).toHaveAttribute('href','/api/member/qq')
})

test('username conflicts and stale QQ verification cannot change identity',async({request})=>{
  const owner=await local(request);await mutation(request,'logout');await qq(request,{user:'rename-conflict'})
  const before=await (await request.get('/api/member/me')).json()
  expect((await mutation(request,'username',{username:owner.name})).status()).toBe(409)
  const db=new Database(path.join(process.env.HUB_TEST_ACCOUNTS_DATA_DIR!,'members.sqlite'))
  try{db.prepare('UPDATE member_sessions SET verified_at=0 WHERE member_id=?').run(before.member.id)}finally{db.close()}
  expect((await mutation(request,'username',{username:username()})).status()).toBe(403)
  expect((await (await request.get('/api/member/me')).json()).member.username).toBe(before.member.username)
})

test('account UI separates manual association from failed QQ verification and offers optional setup',async({page})=>{
  await qq(page.request,{user:'optional-ui'});await page.goto('/account?blog=proof-missing')
  await expect(page.getByRole('heading',{name:'自定义用户名（可选）'})).toBeVisible();await expect(page.getByRole('heading',{name:'设置主站密码（可选）'})).toBeVisible()
  await expect(page.getByRole('status')).toContainText('博客尚未取得可信 QQ 证明')
  const chosen=username();await page.getByLabel('新的用户名',{exact:true}).fill(chosen);await page.getByRole('button',{name:'保存用户名',exact:true}).click()
  await expect(page.getByText('用户名：'+chosen,{exact:true})).toBeVisible();expect(new URL(page.url()).search).toBe('')
  expect((await (await page.request.get('/api/member/me')).json()).member.passwordReady).toBe(false)
})
