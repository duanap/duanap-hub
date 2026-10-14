import { test,expect } from '@playwright/test'
import { spawn,spawnSync,type ChildProcess } from 'node:child_process'
import { randomBytes,scryptSync } from 'node:crypto'
import { mkdtempSync,mkdirSync,writeFileSync,existsSync,rmSync } from 'node:fs'
import path from 'node:path'
import { decodeBackup } from '../scripts/backup-format.mjs'
import { gunzipSync } from 'node:zlib'
import Database from 'better-sqlite3'

test('actual Hub login backup restore invalidates sessions and callbacks with a synthetic provider',async({playwright})=>{
  test.setTimeout(60_000)
  const folder=mkdtempSync(path.resolve('.tmp','p2-restore-live-')),data=path.join(folder,'data');mkdirSync(data)
  const origin='http://127.0.0.1:1140',provider='http://127.0.0.1:1141',password=randomBytes(24).toString('base64url'),salt=randomBytes(16)
  const secret=randomBytes(32).toString('base64url'),key=randomBytes(32).toString('base64url')
  const env={...process.env,HUB_SITE_URL:origin,HUB_DATA_DIR:data,HUB_ADMIN_USERNAME:'fixture-admin',HUB_ADMIN_PASSWORD_HASH:`scrypt$${salt.toString('hex')}$${scryptSync(password,salt,64).toString('hex')}`,HUB_ACCOUNTS_ENABLED:'1',HUB_CHECKIN_ENABLED:'0',HUB_ACCOUNTS_ALLOW_LOOPBACK:'1',HUB_WORDPRESS_URL:provider+'/',HUB_WORDPRESS_CLIENT_ID:'restore-fixture',HUB_WORDPRESS_CLIENT_SECRET:secret,HUB_ACCOUNTS_TOKEN_KEY:key,NEXT_TELEMETRY_DISABLED:'1'}
  const launch=(args:string[],extra:Record<string,string>={})=>spawn(process.execPath,args,{env:{...env,...extra},stdio:'ignore'})
  let hub:ChildProcess|undefined,oauth:ChildProcess|undefined
  async function stop(child?:ChildProcess){if(!child||child.exitCode!==null)return;await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Fixture did not stop')),8000);child.once('close',()=>{clearTimeout(timer);resolve()});child.kill()})}
  async function ready(url:string,child:ChildProcess){for(let i=0;i<100;i++){if(child.exitCode!==null)throw new Error('Fixture startup failed');try{if((await fetch(url)).ok)return}catch{}await new Promise(resolve=>setTimeout(resolve,100))}throw new Error('Fixture startup timed out')}
  const admin=await playwright.request.newContext({baseURL:origin}),user=await playwright.request.newContext({baseURL:origin})
  const start=async()=>{hub=launch(['--import','./tests/helpers/offline.mjs','node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','1140']);await ready(origin+'/api/health',hub)}
  try{
    oauth=launch(['tests/helpers/oauth-fixture.mjs'],{HUB_ACCOUNTS_FIXTURE:'1',HUB_FIXTURE_PORT:'1141',HUB_FIXTURE_CALLBACK_ORIGIN:origin});await ready(provider+'/health',oauth)
    await start()
    expect((await admin.post('/api/studio/login',{headers:{Origin:origin},data:{username:'fixture-admin',password}})).status()).toBe(200)
    expect((await admin.patch('/api/studio/modules',{headers:{Origin:origin},data:{id:'accounts',enabled:true}})).status()).toBe(200)
    async function login(){const begin=await user.get('/api/auth/login',{maxRedirects:0}),grant=await user.get(begin.headers().location,{maxRedirects:0}),callback=grant.headers().location;expect((await user.get(callback,{maxRedirects:0})).status()).toBe(303);expect((await user.get('/api/account/me')).status()).toBe(200);return callback}
    const oldCallback=await login()
    expect((await user.get('/api/account/bindings')).status()).toBe(200)
    const pending=await user.get('/api/auth/login',{maxRedirects:0}),grant=await user.get(pending.headers().location,{maxRedirects:0}),unconsumed=grant.headers().location
    const created=await admin.post('/api/studio/backups',{headers:{Origin:origin}});expect(created.status()).toBe(201)
    const record=await created.json(),download=await admin.get('/api/studio/backups/'+record.backup.name);expect(download.status()).toBe(200)
    const archive=await download.body(),decoded=decodeBackup(archive)
    const payload=gunzipSync(archive).toString('utf8');expect(payload).not.toMatch(/accounts\.sqlite|accessToken|csrf/);expect(payload).not.toContain(secret)
    const snapshot=new Database(decoded.database,{readonly:true});try{
      expect(snapshot.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sessions','auth_transactions')").all()).toEqual([])
      expect(snapshot.prepare('SELECT COUNT(*) AS n FROM admin_sessions').get()).toEqual({n:0})
    }finally{snapshot.close()}
    expect(existsSync(path.join(data,'accounts.sqlite'))).toBe(true)
    const input=path.join(folder,'content.hub.gz');writeFileSync(input,archive)
    await stop(hub);hub=undefined
    const restored=spawnSync(process.execPath,['scripts/restore-backup.mjs','--input',input,'--data-dir',data,'--confirm-restore'],{env,encoding:'utf8'})
    expect(restored.status,restored.stderr).toBe(0)
    for(const suffix of ['','-wal','-shm'])expect(existsSync(path.join(data,'accounts.sqlite'+suffix))).toBe(false)
    await start()
    expect((await user.get('/api/account/me')).status()).toBe(401)
    for(const callback of [unconsumed,oldCallback]){
      const rejected=await user.get(callback,{maxRedirects:0});expect(rejected.status()).toBe(303);expect(rejected.headers().location).toBe(origin+'/account?auth=failed')
      expect((await user.get('/api/account/me')).status()).toBe(401)
    }
    expect((await admin.get('/api/studio/backups')).status()).toBe(401)
    for(const url of ['/','/robots.txt','/sitemap.xml','/feed.xml'])expect((await user.get(url)).status()).toBe(200)
    await login()
    expect((await user.get('/api/studio/backups')).status()).toBe(401)
  }finally{
    const stopped=await Promise.allSettled([stop(hub),stop(oauth)])
    await admin.dispose();await user.dispose()
    // Delete only this test's verified, private directory after both processes stop.
    const expected=path.resolve('.tmp')+path.sep
    if(stopped.every(result=>result.status==='fulfilled')&&folder.startsWith(expected)&&path.basename(folder).startsWith('p2-restore-live-'))rmSync(folder,{recursive:true,force:true})
    for(const result of stopped)if(result.status==='rejected')throw result.reason
  }
})
