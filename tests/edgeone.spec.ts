import {test,expect} from '@playwright/test'
import Database from 'better-sqlite3'
import path from 'node:path'
import {gunzipSync} from 'node:zlib'
import {readFileSync,writeFileSync} from 'node:fs'
const headers={Origin:'http://127.0.0.1:1027'},fixture='http://127.0.0.1:1035'
function expire(){const db=new Database(path.join(process.env.HUB_TEST_EDGEONE_DIR!,'hub.sqlite'));try{const r=db.prepare('SELECT json FROM edgeone_cache WHERE id=1').get() as {json:string}|undefined;if(r){const c=JSON.parse(r.json);c.attemptedAt='';db.prepare('UPDATE edgeone_cache SET json=? WHERE id=1').run(JSON.stringify(c))}}finally{db.close()}}
test.beforeEach(async({request})=>{await request.post('/api/studio/login',{headers,data:{username:'duanap',password:process.env.HUB_TEST_ADMIN_PASSWORD}});await request.post(fixture+'/__fixture/control',{data:{}});await request.put('/api/studio/edgeone',{headers,data:{domains:['duanap.cn','www.duanap.cn'],period:'24h'}});await request.patch('/api/studio/modules',{headers,data:{id:'edgeone',enabled:true}});expire()})
test.afterEach(async({request})=>{await request.post(fixture+'/__fixture/control',{data:{release:true}});await request.patch('/api/studio/modules',{headers,data:{id:'edgeone',enabled:false}})})
test('signed API is domain scoped; public summaries exclude account/secret metadata and label real zero',async({request,page})=>{
 const data=(await (await request.post('/api/studio/edgeone',{headers,data:{}})).json()).snapshot
 expect(data.status).toBe('ready');expect(data.requests).toBe(100);expect(data.bytes).toBe(1000000);expect(data.cacheHits/data.cacheEligible).toBe(.8);expect(data.mitigated).toBe(0);expect(Date.parse(data.end)-Date.parse(data.start)).toBe(86400000);expect(Date.now()-Date.parse(data.end)).toBeGreaterThanOrEqual(10*60000);expect(JSON.stringify(data)).not.toContain('MUST_NOT_LEAK')
 expect((await (await request.get(fixture+'/__fixture/stats')).json())).toEqual({calls:4,valid:true});await page.goto('/');await expect(page.locator('[data-module=edgeone]')).toContainText('80.0%');await expect(page.locator('[data-module=edgeone]')).toContainText('1 MB');await expect(page.locator('[data-module=edgeone]')).toContainText('UV');await request.get('/api/edgeone');expect((await (await request.get(fixture+'/__fixture/stats')).json()).calls).toBe(4)
 const anon=await page.context().browser()!.newContext();expect((await anon.request.get('http://127.0.0.1:1027/api/studio/edgeone')).status()).toBe(401);await anon.close()
})
test('empty data stays null; denial, malformed, oversized, redirects and slow API preserve success',async({request})=>{
 const good=(await (await request.post('/api/studio/edgeone',{headers,data:{}})).json()).snapshot
 for(const mode of ['deny','invalid','huge','redirect','hang']){expire();await request.post(fixture+'/__fixture/control',{data:{mode}});const data=(await (await request.post('/api/studio/edgeone',{headers,data:{}})).json()).snapshot;expect(data.status).toBe('stale');expect(data.syncedAt).toBe(good.syncedAt);expect(data.requests).toBe(100);expect(JSON.stringify(data)).not.toContain('MUST_NOT_LEAK')}
 expire();await request.post(fixture+'/__fixture/control',{data:{mode:'empty'}});const data=(await (await request.post('/api/studio/edgeone',{headers,data:{}})).json()).snapshot;expect(data.requests).toBeNull();expect(data.mitigated).toBeNull();expect(data.syncedAt).toBeTruthy()
})
test('disable and re-enable fences in-flight work; Core and SEO remain independent',async({request})=>{
 const before=(await (await request.get('/api/studio/edgeone')).json()).snapshot.syncedAt
 await request.post(fixture+'/__fixture/control',{data:{mode:'hold'}});const pending=Array.from({length:3},()=>request.post('/api/studio/edgeone',{headers,data:{}}));await expect.poll(async()=>(await (await request.get(fixture+'/__fixture/stats')).json()).calls).toBe(4)
 for(const route of ['/','/robots.txt','/sitemap.xml','/feed.xml','/duanap'])expect((await request.get(route)).status()).toBe(200)
 await request.patch('/api/studio/modules',{headers,data:{id:'edgeone',enabled:false}});await request.patch('/api/studio/modules',{headers,data:{id:'edgeone',enabled:true}});await request.post(fixture+'/__fixture/control',{data:{release:true}});await Promise.all(pending);expect((await (await request.get('/api/studio/edgeone')).json()).snapshot.syncedAt).toBe(before)
 await request.patch('/api/studio/modules',{headers,data:{id:'edgeone',enabled:false}});await request.post(fixture+'/__fixture/control',{data:{}});expect((await request.get('/api/edgeone')).status()).toBe(404);expect(await (await request.get('/')).text()).not.toContain('data-module="edgeone"');expect((await (await request.get(fixture+'/__fixture/stats')).json()).calls).toBe(0)
})
test('Studio validates scope/CSRF, warns on drafts, supports mobile layout and secret-free backup',async({request,page})=>{
 await page.request.post('/api/studio/login',{headers,data:{username:'duanap',password:process.env.HUB_TEST_ADMIN_PASSWORD}})
 expect((await request.put('/api/studio/edgeone',{headers,data:{domains:['attacker.invalid']}})).status()).toBe(400);expect((await request.put('/api/studio/edgeone',{headers,data:{domains:[]}})).status()).toBe(400);expect((await request.put('/api/studio/edgeone',{headers:{Origin:'https://evil.invalid'},data:{}})).status()).toBe(403)
 await page.goto('/duanap');await page.getByRole('button',{name:'EdgeOne 数据',exact:true}).click();await page.getByLabel('EdgeOne 区域标题',{exact:true}).fill('加速统计');page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'概览',exact:true}).click();await expect(page.getByLabel('EdgeOne 区域标题',{exact:true})).toHaveValue('加速统计');await page.getByRole('combobox',{name:'统计时间范围',exact:true}).selectOption('7d');await page.getByRole('button',{name:'保存 EdgeOne 配置',exact:true}).click();await expect(page.getByText('EdgeOne 配置已保存',{exact:true})).toBeVisible()
 expire();const snapshot=(await (await request.post('/api/studio/edgeone',{headers,data:{}})).json()).snapshot;expect(Date.parse(snapshot.end)-Date.parse(snapshot.start)).toBe(7*86400000)
 await request.patch('/api/studio/modules',{headers,data:{id:'edgeone',size:'small'}});await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.locator('.home-widget:has([data-module=edgeone])')).toHaveClass(/widget-size-small/);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 const {backup}=await (await request.post('/api/studio/backups',{headers})).json(),buffer=await (await request.get('/api/studio/backups/'+backup.name)).body(),raw=gunzipSync(buffer).toString();expect(raw).not.toContain('fixture-secret');const archive=JSON.parse(raw),db=new Database(Buffer.from(archive.database,'base64'),{readonly:true});try{expect(db.prepare('SELECT COUNT(*) n FROM edgeone_settings').get()).toEqual({n:1});expect(db.prepare('SELECT COUNT(*) n FROM edgeone_cache').get()).toEqual({n:1})}finally{db.close()}
})
test('manual refresh has cooldown; expired and OAuth credentials never leave the server',async({request})=>{
 const credential=path.join(process.env.HUB_TEST_EDGEONE_DIR!,'fixture-credential.json'),before=readFileSync(credential)
 await request.post('/api/studio/edgeone',{headers,data:{}});await request.post('/api/studio/edgeone',{headers,data:{}});expect((await (await request.get(fixture+'/__fixture/stats')).json()).calls).toBe(4)
 try{
  for(const extra of [{expiresAt:1},{oauth:{refreshToken:'MUST_NOT_LEAK'}}]){
   expire();writeFileSync(credential,JSON.stringify({secretId:'fixture-id',secretKey:'fixture-secret-MUST_NOT_LEAK',...extra}));await request.post(fixture+'/__fixture/control',{data:{}})
   const response=await request.post('/api/studio/edgeone',{headers,data:{}}),value=await response.json();expect(value.snapshot.error).toContain('同步失败');expect(value.configuration.configured).toBe(false);expect(JSON.stringify(value)).not.toContain('MUST_NOT_LEAK');expect((await (await request.get(fixture+'/__fixture/stats')).json()).calls).toBe(0)
  }
 }finally{writeFileSync(credential,before)}
})
