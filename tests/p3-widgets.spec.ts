import {test,expect} from '@playwright/test'
import {gunzipSync} from 'node:zlib'
import Database from 'better-sqlite3'
const headers={Origin:'http://127.0.0.1:1027'}
test('home widgets support independent size/order without enabling account API dependencies',async({page})=>{
 await page.request.post('/api/studio/login',{headers,data:{username:'duanap',password:process.env.HUB_TEST_ADMIN_PASSWORD}})
 await page.goto('/duanap');await page.getByRole('button',{name:'模块管理',exact:true}).click();await page.getByRole('combobox',{name:'首页尺寸 关于我',exact:true}).selectOption('small');await expect(page.getByText('首页卡片尺寸已保存',{exact:true})).toBeVisible()
 await page.goto('/');await expect(page.locator('.home-widget:has([data-module=about])')).toHaveClass(/widget-size-small/);await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'切换深色模式',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.goto('/duanap');await page.getByRole('button',{name:'工具配置',exact:true}).click();await page.locator('.studio-card').filter({has:page.getByRole('heading',{name:'文档转换',exact:true})}).getByLabel('工具名称',{exact:true}).fill('未保存的工具名称');page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'概览',exact:true}).click();await expect(page.locator('input[value="未保存的工具名称"]')).toBeVisible()
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'GitHub 动态',exact:true}).click();await page.getByLabel('公开仓库（每行 owner/repo）',{exact:true}).fill('duanap/duanap-hub\nduanap/another');await page.getByRole('button',{name:'保存 GitHub 配置',exact:true}).click();await expect(page.getByText('GitHub 配置已保存',{exact:true})).toBeVisible()
 await page.request.put('/api/studio/github',{headers,data:{repositories:['duanap/duanap-hub']}});await page.request.patch('/api/studio/modules',{headers,data:{id:'about',size:'large'}})
})
test('new layout, tool settings and repository snapshots participate in protected content backups',async({request})=>{
 await request.post('/api/studio/login',{headers,data:{username:'duanap',password:process.env.HUB_TEST_ADMIN_PASSWORD}});await request.patch('/api/studio/modules',{headers,data:{id:'tools',size:'medium'}});const tools=(await (await request.get('/api/studio/tools')).json()).tools;await request.put('/api/studio/tools',{headers,data:tools});const response=await request.post('/api/studio/backups',{headers});expect(response.status()).toBe(201);const {backup}=await response.json(),archive=JSON.parse(gunzipSync(await (await request.get('/api/studio/backups/'+backup.name)).body()).toString()),db=new Database(Buffer.from(archive.database,'base64'),{readonly:true})
 try{expect(db.prepare("SELECT size FROM module_layout WHERE id='tools'").get()).toEqual({size:'medium'});expect(db.prepare('SELECT COUNT(*) n FROM tool_settings').get()).toEqual({n:3});expect(db.prepare('SELECT COUNT(*) n FROM admin_sessions').get()).toEqual({n:0})}finally{db.close()}
 await request.patch('/api/studio/modules',{headers,data:{id:'tools',size:'large'}})
})
