import { test,expect,type APIRequestContext } from '@playwright/test'
import Database from 'better-sqlite3'
import { gunzipSync } from 'node:zlib'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { mkdirSync,writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const headers={Origin:'http://127.0.0.1:1027'},fixture='http://127.0.0.1:1033'
const control=(c:APIRequestContext,mode='normal')=>c.post(fixture+'/__fixture/control',{data:{mode}})
async function enable(c:APIRequestContext,value=true){expect((await c.patch('/api/studio/modules',{headers,data:{id:'content',enabled:value}})).status()).toBe(200)}
async function sync(c:APIRequestContext){const r=await c.post('/api/studio/content',{headers,data:{}});expect(r.status()).toBe(200);return (await r.json()).snapshot}
test.beforeEach(async({request})=>{await request.post('/api/studio/login',{headers,data:{username:'duanap',password:process.env.HUB_TEST_ADMIN_PASSWORD}});await control(request);await enable(request);expect((await request.put('/api/studio/content',{headers,data:{}})).status()).toBe(200)})
test.afterEach(async({request})=>{await control(request);await enable(request,false)})

test('public summaries, categories and covers sync without credentials, HTML or protected posts',async({request,page})=>{
  const snapshot=await sync(request);expect(snapshot.status).toBe('ready');expect(snapshot.posts.map((p:{id:number})=>p.id)).toEqual([1,2]);expect(snapshot.posts[0].title).toBe('文章 1 & 标题');expect(snapshot.posts[0].summary).toBe('公开摘要 1 …');expect(snapshot.posts[0].coverUrl).toContain('/wp-content/uploads/medium.png')
  const raw=JSON.stringify(snapshot);expect(raw).not.toMatch(/MUST_NOT_LEAK|DO_NOT_RENDER_SCRIPT|<script>/)
  expect((await (await request.get(fixture+'/__fixture/stats')).json()).privateHeaders).toBe(false)
  await page.goto('/');await expect(page.locator('[data-module=content] h2')).toHaveText('博客动态');await expect(page.locator('.blog-card')).toHaveCount(2)
  await expect(page.locator('.blog-categories').first()).toContainText('生活');expect(await page.locator('.blog-card a').first().getAttribute('href')).toBe(fixture+'/2.html')
})

test('disabled module performs no fetch and disappears from home, API and RSS',async({request})=>{
  await sync(request);await enable(request,false);await control(request)
  expect((await request.get('/api/content')).status()).toBe(404);expect(await (await request.get('/')).text()).not.toContain('data-module="content"');expect(await (await request.get('/feed.xml')).text()).not.toContain(fixture+'/1.html')
  expect((await (await request.get(fixture+'/__fixture/stats')).json()).calls).toBe(0)
})

test('RSS uses source links and cached plain summaries, excludes blog paths from sitemap',async({request})=>{
  await sync(request)
  const feed=await request.get('/feed.xml'),body=await feed.text();expect(feed.status()).toBe(200);expect(body).toContain('<link>'+fixture+'/1.html</link>');expect(body).toContain('文章 1 &amp; 标题');expect(body).not.toMatch(/MUST_NOT_LEAK|<script>/)
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain(fixture)
})

test('failure and malformed data retain last success; public cached requests respect backoff',async({request})=>{
  const good=await sync(request)
  for(const mode of ['unavailable','redirect','oversize','malformed','bad-link','bad-date','many-categories']){
    await control(request,mode);const failed=await sync(request);expect(failed.status).toBe('stale');expect(failed.syncedAt).toBe(good.syncedAt);expect(failed.posts).toEqual(good.posts);expect(failed.error).toContain('保留最近一次公开摘要')
  }
  await control(request,'unavailable');const before=await (await request.get(fixture+'/__fixture/stats')).json();await request.get('/api/content');await request.get('/api/content');expect((await (await request.get(fixture+'/__fixture/stats')).json()).calls).toBe(before.calls)
})

test('simultaneous sync deduplicates requests and disabling fences an in-flight result',async({request})=>{
  const before=(await (await request.get('/api/studio/content')).json()).snapshot.syncedAt
  await control(request,'hold')
  const pending=Array.from({length:5},()=>request.post('/api/studio/content',{headers,data:{}}))
  await expect.poll(async()=> (await (await request.get(fixture+'/__fixture/stats')).json()).calls).toBe(2)
  await enable(request,false);await enable(request,true);await request.post(fixture+'/__fixture/control',{data:{release:true}});await Promise.all(pending)
  expect((await (await request.get('/api/studio/content')).json()).snapshot.syncedAt).toBe(before)
  expect((await (await request.get(fixture+'/__fixture/stats')).json()).calls).toBe(2)
  await enable(request,false)
  expect((await request.get('/api/content')).status()).toBe(404)
})

test('admin settings require authentication and source checks; public cannot replace the data source',async({request,playwright})=>{
  const visitor=await playwright.request.newContext({baseURL:'http://127.0.0.1:1027'})
  try{expect((await visitor.get('/api/studio/content')).status()).toBe(401);expect((await visitor.put('/api/studio/content',{headers,data:{title:'no'}})).status()).toBe(401)}finally{await visitor.dispose()}
  expect((await request.post('/api/studio/content',{headers:{Origin:'https://evil.invalid'},data:{}})).status()).toBe(403)
  expect((await request.put('/api/studio/content',{headers,data:{source:'http://127.0.0.1:1/'}})).status()).toBe(400)
  expect((await request.put('/api/studio/content',{headers,data:{limit:100}})).status()).toBe(400)
  expect((await request.put('/api/studio/content',{headers,data:{featuredIds:[1,1]}})).status()).toBe(400)
})

test('Studio saves category, pin, order and card size with unsaved protection on mobile dark UI',async({page})=>{
  await page.request.post('/api/studio/login',{headers,data:{username:'duanap',password:process.env.HUB_TEST_ADMIN_PASSWORD}})
  await sync(page.request);await page.setViewportSize({width:390,height:844});await page.goto('/duanap');await page.getByRole('button',{name:'博客动态',exact:true}).click()
  await page.getByLabel('博客区域标题',{exact:true}).fill('我的博客笔记')
  page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'概览',exact:true}).click();await expect(page.getByLabel('博客区域标题',{exact:true})).toHaveValue('我的博客笔记')
  await page.getByLabel('展示篇数',{exact:true}).fill('1');await page.getByRole('combobox',{name:'文章卡片尺寸',exact:true}).selectOption('large');await page.getByRole('combobox',{name:'文章顺序',exact:true}).selectOption('oldest');await page.getByLabel('生活',{exact:true}).check();await page.getByLabel('文章 2 & 标题',{exact:true}).check();await page.getByRole('button',{name:'保存博客展示',exact:true}).click();await expect(page.getByText('博客展示设置已保存',{exact:true})).toBeVisible()
  await page.goto('/');await expect(page.locator('[data-module=content] h2')).toHaveText('我的博客笔记');await expect(page.locator('.blog-card')).toHaveCount(1);await expect(page.locator('.blog-grid')).toHaveClass(/blog-size-large/)
  await page.getByRole('button',{name:'切换深色模式',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'.tmp/content-mobile-dark.png',fullPage:true})
  const feed=await (await page.request.get('/feed.xml')).text();expect(feed).toContain(fixture+'/2.html');expect(feed).not.toContain(fixture+'/1.html')
})

test('hung blog never delays cached home or RSS and the API has a bounded timeout',async({request})=>{
  await sync(request)
  const db=new Database(path.join(process.env.HUB_TEST_CONTENT_DIR!,'hub.sqlite'))
  try{const row=db.prepare('SELECT json FROM content_cache WHERE id=1').get() as {json:string},cache=JSON.parse(row.json);cache.syncedAt='2026-01-01T00:00:00.000Z';cache.attemptedAt='';db.prepare('UPDATE content_cache SET json=? WHERE id=1').run(JSON.stringify(cache))}finally{db.close()}
  await control(request,'hang');const pending=request.get('/api/content')
  await expect.poll(async()=> (await (await request.get(fixture+'/__fixture/stats')).json()).calls).toBe(2)
  const start=Date.now();const [home,feed]=await Promise.all([request.get('/'),request.get('/feed.xml')]);expect(home.status()).toBe(200);expect(feed.status()).toBe(200);expect(Date.now()-start).toBeLessThan(1800)
  const result=await pending;expect((await result.json()).snapshot.status).toBe('stale')
})

test('content configuration and cache are included in consistent backups without admin sessions',async({request})=>{
  await sync(request)
  const backup=await request.post('/api/studio/backups',{headers});expect(backup.status()).toBe(201)
  const {backup:entry}=await backup.json(),download=await request.get('/api/studio/backups/'+entry.name),archive=JSON.parse(gunzipSync(await download.body()).toString('utf8'))
  const db=new Database(Buffer.from(archive.database,'base64'),{readonly:true})
  try{expect(db.prepare('SELECT json FROM content_cache WHERE id=1').get()).toBeTruthy();expect(db.prepare('SELECT json FROM content_settings WHERE id=1').get()).toBeTruthy();expect(db.prepare('SELECT COUNT(*) n FROM admin_sessions').get()).toEqual({n:0})}finally{db.close()}
  const root=path.resolve('.tmp','content-restore-'+randomBytes(5).toString('hex'));mkdirSync(root,{recursive:true});const input=path.join(root,'backup.hub.gz'),target=path.join(root,'restored');writeFileSync(input,await download.body())
  execFileSync(process.execPath,['scripts/restore-backup.mjs','--input',input,'--data-dir',target,'--confirm-restore'],{stdio:'pipe'})
  const restored=new Database(path.join(target,'hub.sqlite'),{readonly:true});try{expect(restored.pragma('integrity_check',{simple:true})).toBe('ok');expect(JSON.parse((restored.prepare('SELECT json FROM content_cache WHERE id=1').get() as {json:string}).json).posts).toHaveLength(2)}finally{restored.close()}
})
