import { testOrigin } from './helpers/origin'
import { test, expect, type Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import Database from 'better-sqlite3'
import sharp from 'sharp'
import type { ContentKind, HubSettings } from '@/lib/types'

const headers = { Origin:testOrigin }
let original: HubSettings, records: {kind:ContentKind;id:number}[], media:string[]
const marker = () => randomBytes(4).toString('hex')
async function login(page:Page) { expect((await page.request.post('/api/studio/login',{headers,data:{username:'duanap',password:process.env.HUB_TEST_ADMIN_PASSWORD}})).ok()).toBeTruthy() }
async function settings(page:Page,data:Partial<HubSettings>) { const response=await page.request.put('/api/studio/site',{headers,data});expect(response.status(),await response.text()).toBe(200);return (await response.json()).settings as HubSettings }
async function create(page:Page,kind:ContentKind,data:object) { const response=await page.request.post('/api/studio/content/'+kind,{headers,data});expect(response.status(),await response.text()).toBe(201);const item=(await response.json()).item;records.push({kind,id:item.id});return item }
function wav(seconds=30) {
  const size=8000*seconds*2,b=Buffer.alloc(44+size);b.write('RIFF');b.writeUInt32LE(36+size,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(size,40);return b
}
async function upload(page:Page,buffer=wav()) { const response=await page.request.post('/api/studio/audio',{headers,multipart:{file:{name:'my-song.wav',mimeType:'audio/wav',buffer}}});expect(response.status(),await response.text()).toBe(201);const item=(await response.json()).media;media.push(item.name);return item }
test.beforeEach(async({page})=>{records=[];media=[];await login(page);original=await settings(page,{})})
test.afterEach(async({page})=>{await login(page);await settings(page,original);for(const item of records)await page.request.delete(`/api/studio/content/${item.kind}/${item.id}`,{headers});for(const name of media)await page.request.delete('/api/studio/media/'+name,{headers})})

test('all published notes are visible across pages while drafts and schedules stay private',async({page})=>{
  const suffix=marker()
  for(let i=0;i<20;i++)await create(page,'notes',{body:'公开文案 '+suffix+' '+i,published:true})
  await create(page,'notes',{title:'草稿-'+suffix,body:'不自动公开',published:false})
  await create(page,'notes',{title:'排期-'+suffix,body:'将来公开',published:true,publishedAt:'2099-01-01T00:00:00.000Z'})
  await page.goto('/notes');await expect(page.locator('.hub-note')).toHaveCount(18)
  await expect(page.locator('#main-content')).not.toContainText('草稿-'+suffix)
  await expect(page.locator('#main-content')).not.toContainText('排期-'+suffix)
  const first=await page.locator('.hub-note').evaluateAll(items=>items.map(item=>item.id))
  await page.getByRole('button',{name:'下一页 →',exact:true}).click();await expect(page.locator('.hub-note')).toHaveCount(2)
  const last=await page.locator('.hub-note').evaluateAll(items=>items.map(item=>item.id))
  expect(new Set([...first,...last]).size).toBe(20)
})

test('saving draft is explicit and immediately publishing it updates public notes after reload',async({page})=>{
  const body='明确发布入口-'+marker()
  await page.goto('/duanap');await page.getByRole('button',{name:'文案管理',exact:true}).click();await page.getByRole('button',{name:'+ 新增文案',exact:true}).click()
  await page.getByRole('group',{name:'文案正文编辑器',exact:true}).getByRole('button',{name:'Markdown 源码',exact:true}).click()
  await page.getByLabel('文案正文（Markdown）',{exact:true}).fill(body)
  await expect(page.locator('.studio-content-manager')).toContainText('本次保存为草稿')
  let pending=page.waitForResponse(r=>r.url().endsWith('/api/studio/content/notes')&&r.request().method()==='POST')
  await page.getByRole('button',{name:'保存文案',exact:true}).click()
  const item=(await(await pending).json()).item;records.push({kind:'notes',id:item.id})
  await expect(page.getByRole('status')).toContainText('尚未公开')
  expect(await(await page.request.get('/notes')).text()).not.toContain(body)
  pending=page.waitForResponse(r=>r.url().endsWith('/api/studio/content/notes/'+item.id)&&r.request().method()==='PATCH')
  await page.getByRole('button',{name:'立即发布',exact:true}).click();expect((await(await pending).json()).item.published).toBe(true)
  await expect(page.getByRole('status')).toContainText('公开发布')
  await page.goto('/notes');await expect(page.locator('#note-'+item.id)).toContainText(body)
})

test('notes have equal heights and only text over four actual lines opens a full-card dialog',async({page})=>{
  const picture=await page.request.post('/api/studio/media',{headers,multipart:{file:{name:'note.png',mimeType:'image/png',buffer:await sharp({create:{width:32,height:24,channels:3,background:'#597c84'}}).png().toBuffer()}}})
  expect(picture.status()).toBe(201);const image=(await picture.json()).media;media.push(image.name)
  const short=await create(page,'notes',{body:'第一行  \n第二行  \n第三行  \n第四行',imageUrl:image.url,published:true})
  const longer=await create(page,'notes',{title:'五行短文',body:'一  \n二  \n三  \n四  \n五',published:true})
  const long=await create(page,'notes',{body:'完整长文。'.repeat(400),published:true})
  await page.goto('/notes')
  await expect(page.locator('#note-'+short.id).getByRole('button',{name:'展开',exact:true})).toHaveCount(0)
  const opener=page.locator('#note-'+longer.id).getByRole('button',{name:'展开',exact:true});await expect(opener).toBeVisible()
  await expect(page.locator('#note-'+long.id).getByRole('button',{name:'展开',exact:true})).toBeVisible()
  const heights=await page.locator('.hub-note').evaluateAll(cards=>cards.map(card=>card.getBoundingClientRect().height))
  expect(Math.max(...heights)-Math.min(...heights)).toBeLessThan(1)
  const before=await page.locator('#note-'+longer.id).boundingBox()
  await opener.click();const dialog=page.getByRole('dialog',{name:'文案全文'});await expect(dialog).toBeVisible();await expect(dialog.locator('.hub-note-full-body')).toContainText('五')
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(opener).toBeFocused()
  await page.locator('#note-'+short.id).getByRole('button',{name:'查看文案配图',exact:true}).click();await expect(dialog.locator('.hub-note-full-image')).toHaveAttribute('src',image.url);await page.keyboard.press('Escape')
  expect((await page.locator('#note-'+longer.id).boundingBox())!.height).toBe(before!.height)
  await page.setViewportSize({width:390,height:844});await page.locator('#note-'+long.id).getByRole('button',{name:'展开',exact:true}).click()
  expect(await dialog.evaluate(element=>element.scrollHeight>element.clientHeight)).toBeTruthy()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy()
  await page.screenshot({path:'test-results/notes-expanded-mobile.png',fullPage:true})
})

test('Links reuses an existing category and fills fetched website info without auto-saving',async({page})=>{
  const group='已有分类-'+marker()
  await create(page,'links',{title:'已有链接',url:'https://example.com',groupName:group,published:false})
  await page.route('**/api/studio/link-preview',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({title:'网站自动名称',iconUrl:'https://example.com/favicon.ico',url:'https://example.com/'})}))
  await page.goto('/duanap');await page.getByRole('button',{name:'友链管理',exact:true}).click();await page.getByRole('button',{name:'+ 新增友链',exact:true}).click()
  await page.getByLabel('已有友链分类',{exact:true}).selectOption(group);await expect(page.getByLabel('友链分组',{exact:true})).toHaveValue(group)
  await page.getByLabel('友链地址',{exact:true}).fill('example.com')
  await page.getByRole('button',{name:'获取网站名称和图标',exact:true}).click()
  await expect(page.getByLabel('友链标题',{exact:true})).toHaveValue('网站自动名称');await expect(page.getByLabel('友链图标',{exact:true})).toHaveValue('https://example.com/favicon.ico')
  expect((await(await page.request.get('/api/studio/content/links')).json()).items).toHaveLength(1)
  await page.getByLabel('公开发布友链').check()
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/studio/content/links')&&r.request().method()==='POST')
  await page.getByRole('button',{name:'保存友链',exact:true}).click();const item=(await(await pending).json()).item;records.push({kind:'links',id:item.id})
  expect(item.groupName).toBe(group)
  await page.goto('/links');await page.getByRole('button',{name:group,exact:true}).click();await expect(page.locator('.hub-directory-link')).toHaveCount(1)
})

test('failed website fetching preserves manually entered title and icon',async({page})=>{
  await page.route('**/api/studio/link-preview',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'网站暂时无法连接，可手动填写'})}))
  await page.goto('/duanap');await page.getByRole('button',{name:'友链管理',exact:true}).click();await page.getByRole('button',{name:'+ 新增友链',exact:true}).click()
  await page.getByLabel('友链标题',{exact:true}).fill('手工名称');await page.getByLabel('友链图标',{exact:true}).fill('https://example.com/icon.png');await page.getByLabel('友链地址',{exact:true}).fill('https://example.com')
  await page.getByRole('button',{name:'获取网站名称和图标',exact:true}).click();await expect(page.locator('.studio-content-manager').getByRole('alert')).toContainText('手动填写')
  await expect(page.getByLabel('友链标题',{exact:true})).toHaveValue('手工名称');await expect(page.getByLabel('友链图标',{exact:true})).toHaveValue('https://example.com/icon.png')
})

test('audio upload validates permissions, file contents, limits and serves real byte ranges and HEAD',async({page})=>{
  await page.request.post('/api/studio/logout',{headers})
  expect((await page.request.post('/api/studio/audio',{headers,multipart:{file:{name:'x.wav',mimeType:'audio/wav',buffer:wav(1)}}})).status()).toBe(401)
  await login(page)
  expect((await page.request.post('/api/studio/audio',{headers:{Origin:'https://evil.invalid'},multipart:{file:{name:'x.wav',mimeType:'audio/wav',buffer:wav(1)}}})).status()).toBe(403)
  for(const buffer of [Buffer.from('<html><script>alert(1)</script></html>'),Buffer.from('RIFF0000WAVE0000000000'),Buffer.alloc(20*1024*1024+1)])expect((await page.request.post('/api/studio/audio',{headers,multipart:{file:{name:'fake.mp3',mimeType:'audio/mpeg',buffer}}})).status()).toBe(400)
  const bytes=wav(2),item=await upload(page,bytes)
  const head=await page.request.head(item.url);expect(head.status()).toBe(200);expect(Number(head.headers()['content-length'])).toBe(bytes.length);expect(head.headers()['content-type']).toBe('audio/wav')
  const part=await page.request.get(item.url,{headers:{Range:'bytes=4-19'}});expect(part.status()).toBe(206);expect(part.headers()['content-range']).toBe('bytes 4-19/'+bytes.length);expect(await part.body()).toEqual(bytes.subarray(4,20))
  const suffix=await page.request.get(item.url,{headers:{Range:'bytes=-10'}});expect(await suffix.body()).toEqual(bytes.subarray(-10))
  const invalid=await page.request.get(item.url,{headers:{Range:'bytes=999999-'}});expect(invalid.status()).toBe(416);expect(invalid.headers()['cache-control']).toContain('no-store')
  const larger=await upload(page,wav(400));expect(larger.size).toBeGreaterThan(6*1024*1024)
  expect((await page.request.head(larger.url)).status()).toBe(200)
})

test('Studio uploads a song file, saves it, plays and seeks it, and protects its media reference',async({page})=>{
  await page.goto('/duanap');await page.getByRole('button',{name:'歌曲库',exact:true}).click();await page.getByRole('button',{name:'添加歌曲',exact:true}).click()
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/studio/audio')&&r.request().method()==='POST')
  await page.getByLabel('上传歌曲音频 1',{exact:true}).setInputFiles({name:'my-song.wav',mimeType:'audio/wav',buffer:wav()})
  const item=(await(await pending).json()).media;media.push(item.name)
  await expect(page.getByLabel('歌曲名称 1',{exact:true})).toHaveValue('my-song');await expect(page.getByLabel('音频直链 1',{exact:true})).toHaveValue(item.url)
  await page.getByRole('button',{name:'保存歌曲库',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'站点设置已保存'})).toBeVisible()
  expect((await page.request.delete('/api/studio/media/'+item.name,{headers})).status()).toBe(409)
  await page.goto('/');await page.locator('.hub-music-open').click();await page.getByRole('button',{name:'播放歌曲：my-song',exact:true}).click()
  const audio=page.getByTestId('site-audio');await expect.poll(()=>audio.evaluate(a=>!(a as HTMLAudioElement).paused&&(a as HTMLAudioElement).currentTime>.2)).toBeTruthy()
  await expect(page.getByLabel('播放进度',{exact:true})).toBeEnabled();await page.getByLabel('播放进度',{exact:true}).fill('8')
  await expect.poll(()=>audio.evaluate(a=>(a as HTMLAudioElement).currentTime)).toBeGreaterThan(7)
})

test('an uploaded MP3 with ID3 and real silent MPEG frames decodes in the site player',async({page})=>{
  const frames=Array.from({length:100},()=>{const frame=Buffer.alloc(417);frame.set([255,251,144,100]);return frame})
  const buffer=Buffer.concat([Buffer.from([73,68,51,3,0,0,0,0,0,0]),...frames])
  const response=await page.request.post('/api/studio/audio',{headers,multipart:{file:{name:'silent.mp3',mimeType:'audio/mpeg',buffer}}});expect(response.status()).toBe(201)
  const item=(await response.json()).media;media.push(item.name);expect(item.name).toMatch(/\.mp3$/)
  await settings(page,{musicPlaylist:[{title:'MP3 解码验收',artist:'',url:item.url,coverUrl:'',enabled:true}]})
  await page.goto('/');await page.locator('.hub-music-open').click();await page.getByRole('button',{name:'播放歌曲：MP3 解码验收',exact:true}).click()
  await expect.poll(()=>page.getByTestId('site-audio').evaluate(a=>!(a as HTMLAudioElement).paused&&(a as HTMLAudioElement).currentTime>.2)).toBeTruthy()
})

test('audio participates in online backups, real offline restore and rollback, with an explicit archive version',async({page})=>{
  const bytes=wav(2),item=await upload(page,bytes)
  await settings(page,{musicPlaylist:[{title:'上传的歌曲',artist:'',url:item.url,coverUrl:'',enabled:true}]})
  const created=await page.request.post('/api/studio/backups',{headers});expect(created.status()).toBe(201)
  const archive=await(await page.request.get('/api/studio/backups/'+(await created.json()).backup.name)).body()
  const decoded=JSON.parse(gunzipSync(archive).toString('utf8'));expect(decoded.version).toBe(2)
  expect(Buffer.from(decoded.media.find((file:{name:string})=>file.name===item.name).data,'base64')).toEqual(bytes)
  const target=path.join(process.env.HUB_TEST_DATA_DIR!,'audio-restore-'+marker()),input=target+'.hub.gz',priorName='33333333-3333-3333-3333-333333333333.wav',priorBytes=wav(1)
  await mkdir(path.join(target,'media'),{recursive:true});await writeFile(path.join(target,'media',priorName),priorBytes)
  const db=new Database(Buffer.from(decoded.database,'base64'));db.prepare('UPDATE site_settings SET json=? WHERE id=1').run(JSON.stringify(original));await writeFile(path.join(target,'hub.sqlite'),db.serialize());db.close();await writeFile(input,archive)
  const restored=spawnSync(process.execPath,['scripts/restore-backup.mjs','--input',input,'--data-dir',target,'--confirm-restore'],{encoding:'utf8'});expect(restored.status,restored.stderr).toBe(0)
  expect(await readFile(path.join(target,'media',item.name))).toEqual(bytes)
  const rollback=restored.stdout.trim().split('rollback: ')[1]
  expect(JSON.parse(gunzipSync(await readFile(path.join(rollback,'rollback.hub.gz'))).toString()).version).toBe(2)
  const reversed=spawnSync(process.execPath,['scripts/restore-backup.mjs','--input',path.join(rollback,'rollback.hub.gz'),'--data-dir',target,'--confirm-restore'],{encoding:'utf8'});expect(reversed.status,reversed.stderr).toBe(0)
  expect(await readFile(path.join(target,'media',priorName))).toEqual(priorBytes);await expect(access(path.join(target,'media',item.name))).rejects.toThrow()
})
