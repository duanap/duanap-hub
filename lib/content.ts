import { getDatabase,isEnabled } from '@/lib/db'
import { SITE_ORIGIN } from '@/lib/config'
import { DEFAULT_CONTENT_SETTINGS,type BlogPost,type BlogCategory,type ContentSettings,type ContentSnapshot } from './content-types'

const REFRESH_MS=15*60_000,RETRY_MS=60_000
function store(){
  const db=getDatabase()
  db.exec('CREATE TABLE IF NOT EXISTS content_settings(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS content_cache(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL)')
  return db
}
export function validateContentSettings(value:unknown):ContentSettings{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('博客展示设置无效')
  const p=value as Record<string,unknown>,allowed=Object.keys(DEFAULT_CONTENT_SETTINGS)
  if(Object.keys(p).some(k=>!allowed.includes(k)))throw Error('不支持的博客设置')
  const result={...DEFAULT_CONTENT_SETTINGS,...p} as ContentSettings
  if(typeof result.title!=='string'||!result.title.trim()||result.title.length>80||typeof result.description!=='string'||result.description.length>300)throw Error('标题或说明长度无效')
  if(!Number.isInteger(result.limit)||result.limit<1||result.limit>12||!['small','medium','large'].includes(result.size)||!['newest','oldest'].includes(result.order))throw Error('展示篇数、尺寸或顺序无效')
  for(const key of ['categoryIds','featuredIds'] as const)if(!Array.isArray(result[key])||result[key].length>(key==='categoryIds'?30:12)||new Set(result[key]).size!==result[key].length||result[key].some(id=>!Number.isSafeInteger(id)||id<1))throw Error('分类或精选文章无效')
  return {...result,title:result.title.trim(),description:result.description.trim()}
}
export function getContentSettings(){try{const row=store().prepare('SELECT json FROM content_settings WHERE id=1').get() as {json:string}|undefined;return row?validateContentSettings(JSON.parse(row.json)):{...DEFAULT_CONTENT_SETTINGS}}catch{return {...DEFAULT_CONTENT_SETTINGS}}}
export function saveContentSettings(value:unknown){const settings=validateContentSettings(value);store().prepare('INSERT INTO content_settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(JSON.stringify(settings));return settings}
export function contentSourceUrl(){
  try{
    const source=new URL(process.env.HUB_CONTENT_WORDPRESS_URL||'')
    const local=process.env.HUB_CONTENT_ALLOW_LOOPBACK==='1'&&new URL(SITE_ORIGIN).hostname==='127.0.0.1'&&source.hostname==='127.0.0.1'&&source.protocol==='http:'
    if((source.protocol!=='https:'&&!local)||source.username||source.password||source.search||source.hash)throw Error('Invalid source')
    source.pathname=source.pathname.replace(/\/*$/,'/')
    return source
  }catch{return null}
}
function safeUrl(value:unknown,base:URL,cover=false){
  if(typeof value!=='string'||value.length>2000||/[\\\x00-\x20]/.test(value))return ''
  try{const url=new URL(value);if(url.origin!==base.origin||url.username||url.password||!url.pathname.startsWith(base.pathname)||(cover&&!url.pathname.startsWith(base.pathname+'wp-content/uploads/')))return '';return url.href}catch{return ''}
}
const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',hellip:'…',ndash:'–',mdash:'—',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',copy:'©'}
function plain(value:unknown,limit:number){
  if(typeof value!=='string'||value.length>40_000)throw Error('Invalid text')
  return value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<[^>]*>/g,' ').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(raw,key:string)=>{
    if(key[0]!=='#')return entities[key.toLowerCase()]??raw
    const point=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10)
    return point>0&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):''
  }).replace(/[\x00-\x1f\x7f\uFFFE\uFFFF]/g,' ').replace(/\s+/g,' ').trim().slice(0,limit)
}
function timestamp(value:unknown){if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(value)||!Number.isFinite(Date.parse(value+'Z'))||new Date(value+'Z').toISOString().slice(0,19)!==value)throw Error('Invalid date');return new Date(value+'Z').toISOString()}
type Cache={source:string;posts:BlogPost[];categories:BlogCategory[];syncedAt:string;attemptedAt:string;error:string;truncated?:boolean}
function empty(source:string):Cache{return {source,posts:[],categories:[],syncedAt:'',attemptedAt:'',error:''}}
function readCache(base:URL):Cache{
  try{
    const row=store().prepare('SELECT json FROM content_cache WHERE id=1').get() as {json:string}|undefined
    if(!row)return empty(base.href)
    if(row.json.length>3_000_000)throw Error('Oversized cache')
    const c=JSON.parse(row.json) as Cache
    if(c.source!==base.href)return empty(base.href)
    if(!Array.isArray(c.posts)||c.posts.length>500||!Array.isArray(c.categories)||c.categories.length>100||![c.syncedAt,c.attemptedAt].every(v=>typeof v==='string'&&(!v||Number.isFinite(Date.parse(v))))||typeof c.error!=='string'||c.posts.some(p=>p.tags!==undefined&&(!Array.isArray(p.tags)||p.tags.length>24||p.tags.some(t=>typeof t!=='string'||t.length>80))))throw Error('Invalid cache')
    if(c.posts.some(p=>!Number.isSafeInteger(p.id)||p.id<1||!safeUrl(p.url,base)||typeof p.title!=='string'||typeof p.summary!=='string'||!Number.isFinite(Date.parse(p.publishedAt))||typeof p.coverUrl!=='string'||(p.coverUrl&&!safeUrl(p.coverUrl,base,true))||!Array.isArray(p.categoryIds)||p.categoryIds.some(id=>!Number.isSafeInteger(id)||id<1)))throw Error('Invalid post cache')
    if(c.categories.some(c=>!Number.isSafeInteger(c.id)||c.id<1||typeof c.name!=='string'||!safeUrl(c.url,base)))throw Error('Invalid category cache')
    return c
  }catch{return {...empty(base.href),error:'本地摘要缓存不可用，请重新同步'}}
}
function writeCache(value:Cache){const json=JSON.stringify(value);if(json.length>3_000_000)throw Error('Oversized cache');store().prepare('INSERT INTO content_cache VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(json)}
export function contentSnapshot():ContentSnapshot{
  const base=contentSourceUrl(),c=base?readCache(base):empty('')
  return {...c,status:!base?'unconfigured':c.error?(c.syncedAt?'stale':'error'):!c.syncedAt?'empty':Date.now()-Date.parse(c.syncedAt)>REFRESH_MS?'stale':c.posts.length?'ready':'empty'}
}
async function jsonRequest(base:URL,resource:string,params:Record<string,string>,signal:AbortSignal){
  const url=new URL('wp-json/wp/v2/'+resource,base);url.search=new URLSearchParams(params).toString()
  const response=await fetch(url,{redirect:'manual',cache:'no-store',signal,headers:{Accept:'application/json'}})
  if(!response.ok||!response.headers.get('content-type')?.includes('application/json')||!response.body)throw Error('Unavailable')
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>512_000){await reader.cancel();throw Error('Too large')}parts.push(part.value)}}finally{reader.releaseLock()}
  const value:unknown=JSON.parse(Buffer.concat(parts).toString('utf8'))
  if(!Array.isArray(value))throw Error('Invalid collection')
  const totalPages=Number(response.headers.get('x-wp-totalpages'))
  if(Number.isInteger(totalPages)&&totalPages>0)Object.defineProperty(value,'totalPages',{value:totalPages})
  return value as Record<string,any>[] & {totalPages?:number}
}
const syncState=globalThis as typeof globalThis&{hubContentSync?:Promise<ContentSnapshot>}
export function refreshContent(force=false):Promise<ContentSnapshot>{
  if(!isEnabled('content'))return Promise.reject(Error('博客动态模块未启用'))
  const base=contentSourceUrl(),old=base?readCache(base):empty('')
  if(!base||(!force&&((old.syncedAt&&Date.now()-Date.parse(old.syncedAt)<REFRESH_MS&&!old.error)||(old.attemptedAt&&Date.now()-Date.parse(old.attemptedAt)<RETRY_MS))))return Promise.resolve(contentSnapshot())
  if(syncState.hubContentSync)return syncState.hubContentSync
  const generation=(getDatabase().prepare("SELECT updated_at FROM module_settings WHERE id='content'").get() as {updated_at:string}|undefined)?.updated_at
  const current=()=>isEnabled('content')&&contentSourceUrl()?.href===base.href&&(getDatabase().prepare("SELECT updated_at FROM module_settings WHERE id='content'").get() as {updated_at:string}|undefined)?.updated_at===generation
  const attemptedAt=new Date().toISOString()
  writeCache({...old,attemptedAt})
  const task=(async()=>{
    try{
      const signal=AbortSignal.timeout(3500)
      const [firstPage,rawCategories]=await Promise.all([
        jsonRequest(base,'posts',{per_page:'100',page:'1',status:'publish',context:'view',orderby:'date',order:'desc',_embed:'wp:term,wp:featuredmedia',_fields:'id,link,status,title,excerpt,date_gmt,categories,featured_media,_links,_embedded'},signal),
        jsonRequest(base,'categories',{per_page:'100',hide_empty:'true',_fields:'id,name,link'},signal)
      ])
      if(firstPage.length>100||rawCategories.length>100)throw Error('Oversized collection')
      const rawPosts=[...firstPage]
      let lastPage=firstPage,truncated=false
      for(let page=2;page<=5&&lastPage.length===100&&(!firstPage.totalPages||page<=firstPage.totalPages);page++){
        lastPage=await jsonRequest(base,'posts',{per_page:'100',page:String(page),status:'publish',context:'view',orderby:'date',order:'desc',_embed:'wp:term,wp:featuredmedia',_fields:'id,link,status,title,excerpt,date_gmt,categories,featured_media,_links,_embedded'},signal)
        if(lastPage.length>100)throw Error('Oversized collection')
        rawPosts.push(...lastPage)
        if(page===5&&lastPage.length===100)truncated=firstPage.totalPages?firstPage.totalPages>5:true
      }
      const categories:BlogCategory[]=rawCategories.map(c=>{const url=safeUrl(c.link,base);if(!Number.isSafeInteger(c.id)||c.id<1||!url)throw Error('Invalid category');return {id:c.id,name:plain(c.name,80),url}})
      const posts:BlogPost[]=[],mediaIds=new Map<number,number>()
      for(const p of rawPosts){
        if(p.status!=='publish'||p.excerpt?.protected!==false)continue
        const url=safeUrl(p.link,base),publishedAt=timestamp(p.date_gmt)
        if(!Number.isSafeInteger(p.id)||p.id<1||!url||!Array.isArray(p.categories)||p.categories.length>100||p.categories.some((id:unknown)=>!Number.isSafeInteger(id)||Number(id)<1))throw Error('Invalid post')
        if(Date.parse(publishedAt)>Date.now())continue
        const title=plain(p.title?.rendered,180);if(!title)throw Error('Missing title')
        const terms=Array.isArray(p._embedded?.['wp:term'])?p._embedded['wp:term']:[]
        const tags=[...new Set(terms.flatMap((group:unknown)=>Array.isArray(group)?group.filter(t=>t&&typeof t.name==='string').map(t=>plain(t.name,80)):[]))].slice(0,24) as string[]
        const embeddedCover=p._embedded?.['wp:featuredmedia']?.[0]?.source_url
        posts.push({id:p.id,title,summary:plain(p.excerpt.rendered,400),url,publishedAt,coverUrl:safeUrl(embeddedCover,base,true),categoryIds:p.categories,tags})
        if(Number.isSafeInteger(p.featured_media)&&p.featured_media>0)mediaIds.set(p.id,p.featured_media)
      }
      if(new Set(posts.map(p=>p.id)).size!==posts.length||new Set(categories.map(c=>c.id)).size!==categories.length)throw Error('Duplicate identity')
      if(current()&&mediaIds.size){try{
        const media=await jsonRequest(base,'media',{include:[...new Set(mediaIds.values())].slice(0,40).join(','),per_page:'40',_fields:'id,source_url,media_details'},signal)
        for(const post of posts){const m=media.find(m=>m.id===mediaIds.get(post.id));if(m)post.coverUrl=safeUrl(m.media_details?.sizes?.medium?.source_url??m.source_url,base,true)}
      }catch{/* Covers are optional; summaries remain usable. */}}
      if(current())writeCache({source:base.href,posts,categories,syncedAt:new Date().toISOString(),attemptedAt,error:'',truncated})
    }catch{if(current())writeCache({...old,attemptedAt,error:'博客同步暂不可用，保留最近一次公开摘要'})}
    return contentSnapshot()
  })()
  syncState.hubContentSync=task
  void task.finally(()=>{if(syncState.hubContentSync===task)syncState.hubContentSync=undefined}).catch(()=>{})
  return task
}
