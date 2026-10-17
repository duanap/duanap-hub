import { getDatabase,isEnabled } from './db'
import { SITE_ORIGIN } from './config'
import { DEFAULT_GITHUB_SETTINGS,type GithubSettings,type GithubSnapshot,type GithubRepository } from './github-types'
const TTL=30*60_000,RETRY=5*60_000
function store(){const db=getDatabase();db.exec('CREATE TABLE IF NOT EXISTS github_settings(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL);CREATE TABLE IF NOT EXISTS github_cache(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL)');return db}
export function validateGithub(value:unknown):GithubSettings{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('GitHub 配置无效')
 const p={...DEFAULT_GITHUB_SETTINGS,...value} as GithubSettings
 if(Object.keys(value).some(k=>!['title','description','repositories'].includes(k))||typeof p.title!=='string'||!p.title.trim()||p.title.length>80||typeof p.description!=='string'||p.description.length>300||!Array.isArray(p.repositories)||p.repositories.length>4||p.repositories.some(r=>typeof r!=='string'||!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/.test(r)||r.endsWith('/.')||r.endsWith('/..'))||new Set(p.repositories.map(r=>r.toLowerCase())).size!==p.repositories.length)throw Error('请填写标题及最多 4 个不重复的 owner/repo')
 return {...p,title:p.title.trim()}
}
export function getGithubSettings(){try{const r=store().prepare('SELECT json FROM github_settings WHERE id=1').get() as {json:string}|undefined;return r?validateGithub(JSON.parse(r.json)):{...DEFAULT_GITHUB_SETTINGS}}catch{return {...DEFAULT_GITHUB_SETTINGS}}}
export function saveGithubSettings(value:unknown){const p=validateGithub(value);store().prepare('INSERT INTO github_settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(JSON.stringify(p));return p}
function baseUrl(){
 if(!process.env.HUB_GITHUB_TEST_BASE)return new URL('https://api.github.com/')
 const url=new URL(process.env.HUB_GITHUB_TEST_BASE)
 if(process.env.HUB_GITHUB_ALLOW_LOOPBACK!=='1'||new URL(SITE_ORIGIN).hostname!=='127.0.0.1'||url.hostname!=='127.0.0.1'||url.protocol!=='http:'||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw Error('测试源不可用')
 return url
}
function key(){return JSON.stringify([baseUrl().href,getGithubSettings().repositories])}
const empty=():GithubSnapshot=>({repositories:[],syncedAt:'',attemptedAt:'',error:'',status:'empty'})
export function githubSnapshot():GithubSnapshot{
 try{
  const r=store().prepare('SELECT json FROM github_cache WHERE id=1').get() as {json:string}|undefined,c=r&&r.json.length<100_000?JSON.parse(r.json):null
  if(!c||c.key!==key())return {...empty(),status:getGithubSettings().repositories.length?'empty':'unconfigured'}
  if(![c.syncedAt,c.attemptedAt].every(v=>typeof v==='string'&&(!v||Number.isFinite(Date.parse(v))))||typeof c.error!=='string'||!Array.isArray(c.repositories)||c.repositories.length>4||c.repositories.some((r:GithubRepository)=>!r||!/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(r.url)||typeof r.name!=='string'||!safeLink(r.url,r.name)||typeof r.description!=='string'||(r.pushedAt!==''&&!Number.isFinite(Date.parse(r.pushedAt)))||!Number.isSafeInteger(r.stars)||r.stars<0||!Number.isSafeInteger(r.forks)||r.forks<0||!Array.isArray(r.tags)||r.tags.some(t=>typeof t!=='string')||(r.release&&!safeLink(r.release.url,r.name,'/releases/tag/'))))throw Error('Invalid cache')
  return {repositories:c.repositories,syncedAt:c.syncedAt,attemptedAt:c.attemptedAt,error:c.error,status:c.error?(c.syncedAt?'stale':'error'):c.syncedAt?(Date.now()-Date.parse(c.syncedAt)>TTL?'stale':'ready'):'empty'}
 }catch{return {...empty(),status:'error',error:'GitHub 缓存暂不可用'}}
}
function save(snapshot:GithubSnapshot,signature:string){store().prepare('INSERT INTO github_cache VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(JSON.stringify({...snapshot,key:signature}))}
function safeLink(value:unknown,repo:string,suffix=''){if(typeof value!=='string'||/[\\\x00-\x20]/.test(value))return '';try{const u=new URL(value);return u.origin==='https://github.com'&&!u.username&&!u.password&&!u.search&&!u.hash&&(suffix?u.pathname.toLowerCase().startsWith(('/'+repo+suffix).toLowerCase()):u.pathname.toLowerCase()==='/'+repo.toLowerCase())?u.href:''}catch{return ''}}
function text(v:unknown,max=300){if(typeof v!=='string')throw Error('Invalid text');return v.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,max)}
function date(v:unknown,nullable=false){if(nullable&&v===null)return '';if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))throw Error('Invalid date');return new Date(v).toISOString()}
async function request(path:string,signal:AbortSignal){
 const response=await fetch(new URL(path,baseUrl()),{cache:'no-store',redirect:'manual',signal,headers:{Accept:'application/vnd.github+json','User-Agent':'duanap-hub-public-widget'}})
 if(!response.ok||!response.body||!response.headers.get('content-type')?.includes('json'))throw Error('GitHub unavailable')
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0
 try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>128_000){await reader.cancel();throw Error('Too large')}parts.push(p.value)}}finally{reader.releaseLock()}
 return JSON.parse(Buffer.concat(parts).toString())
}
const state=globalThis as typeof globalThis&{hubGithubSync?:Promise<GithubSnapshot>}
export function refreshGithub(force=false):Promise<GithubSnapshot>{
 if(!isEnabled('github'))return Promise.reject(Error('GitHub 模块未启用'))
 const old=githubSnapshot(),settings=getGithubSettings()
 if(!settings.repositories.length||(!force&&((old.syncedAt&&!old.error&&Date.now()-Date.parse(old.syncedAt)<TTL)||(old.attemptedAt&&Date.now()-Date.parse(old.attemptedAt)<RETRY))))return Promise.resolve(old)
 if(state.hubGithubSync)return state.hubGithubSync
 const signature=key(),generation=(getDatabase().prepare("SELECT updated_at FROM module_settings WHERE id='github'").get() as {updated_at:string}|undefined)?.updated_at,attemptedAt=new Date().toISOString()
 const current=()=>isEnabled('github')&&key()===signature&&(getDatabase().prepare("SELECT updated_at FROM module_settings WHERE id='github'").get() as {updated_at:string}|undefined)?.updated_at===generation
 save({...old,attemptedAt},signature)
 const task=(async()=>{try{
  const signal=AbortSignal.timeout(3500),repositories:GithubRepository[]=await Promise.all(settings.repositories.map(async name=>{
   const [repo,tags,releases]=await Promise.all([request('repos/'+name,signal),request('repos/'+name+'/tags?per_page=3',signal),request('repos/'+name+'/releases?per_page=1',signal)])
   const url=safeLink(repo.html_url,name)
   if(repo.private!==false||repo.full_name?.toLowerCase()!==name.toLowerCase()||!url||!Number.isSafeInteger(repo.stargazers_count)||repo.stargazers_count<0||!Number.isSafeInteger(repo.forks_count)||repo.forks_count<0||!Array.isArray(tags)||tags.length>3||!Array.isArray(releases)||releases.length>1)throw Error('Invalid public repository')
   const r=releases[0];if(r&&(r.draft!==false||!safeLink(r.html_url,name,'/releases/tag/')))throw Error('Invalid release')
   return {name:repo.full_name,url,description:repo.description===null?'':text(repo.description),stars:repo.stargazers_count,forks:repo.forks_count,pushedAt:date(repo.pushed_at,true),tags:tags.map(t=>text(t.name,100)),release:r?{tag:text(r.tag_name,100),url:r.html_url,publishedAt:date(r.published_at)}:null}
  }))
  if(current())save({repositories,syncedAt:new Date().toISOString(),attemptedAt,error:'',status:'ready'},signature)
 }catch{if(current())save({...old,attemptedAt,error:'GitHub 同步暂不可用或已限流，保留最近成功数据',status:old.syncedAt?'stale':'error'},signature)}return githubSnapshot()})()
 state.hubGithubSync=task;void task.finally(()=>{if(state.hubGithubSync===task)state.hubGithubSync=undefined}).catch(()=>{});return task
}
