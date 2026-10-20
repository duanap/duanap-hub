import {createHash} from 'node:crypto'
import {getDatabase,isEnabled} from './db'
import {edgeoneCredentials,edgeoneScope,edgeoneSum,queryEdgeone,validDomain} from './edgeone-api'
import {DEFAULT_EDGEONE_SETTINGS,type EdgeoneSettings,type EdgeoneSnapshot} from './edgeone-types'

const TTL=30*60_000,RETRY=5*60_000,MANUAL_RETRY=30_000
function store(){
  const db=getDatabase()
  db.exec('CREATE TABLE IF NOT EXISTS edgeone_settings(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL);CREATE TABLE IF NOT EXISTS edgeone_cache(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL)')
  return db
}
export function validateEdgeone(value:unknown):EdgeoneSettings{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('EdgeOne 配置无效')
  const p={...DEFAULT_EDGEONE_SETTINGS,...value} as EdgeoneSettings
  const allowed=(process.env.HUB_EDGEONE_DOMAINS||'duanap.cn,www.duanap.cn,blog.duanap.cn').split(',').map(d=>d.trim())
  if(Object.keys(value).some(k=>!['title','description','domains','period'].includes(k))||typeof p.title!=='string'||!p.title.trim()||p.title.length>80||typeof p.description!=='string'||p.description.length>300||!['24h','7d'].includes(p.period)||!Array.isArray(p.domains)||!p.domains.length||p.domains.length>10||p.domains.some(d=>!validDomain(d)||!allowed.includes(d))||new Set(p.domains).size!==p.domains.length)throw Error('请选择服务器允许的域名、24 小时或 7 天，并填写标题')
  return {...p,title:p.title.trim(),domains:[...p.domains].sort()}
}
export function getEdgeoneSettings(){try{const row=store().prepare('SELECT json FROM edgeone_settings WHERE id=1').get() as {json:string}|undefined;return validateEdgeone(row?JSON.parse(row.json):DEFAULT_EDGEONE_SETTINGS)}catch{return {...DEFAULT_EDGEONE_SETTINGS}}}
export function saveEdgeoneSettings(value:unknown){const p=validateEdgeone(value);store().prepare('INSERT INTO edgeone_settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(JSON.stringify(p));return p}
export function edgeoneConfiguration(){
  const domains=(process.env.HUB_EDGEONE_DOMAINS||'duanap.cn,www.duanap.cn,blog.duanap.cn').split(',').map(d=>d.trim()).filter(validDomain)
  try{edgeoneScope();edgeoneCredentials();return {configured:true,message:'服务端凭据已加载；以实际同步结果确认只读权限',domains}}
  catch(e){return {configured:false,message:e instanceof Error?e.message:'EdgeOne 尚未配置',domains}}
}
function key(){return createHash('sha256').update(JSON.stringify([process.env.HUB_EDGEONE_ZONE_ID||'',getEdgeoneSettings()])).digest('hex')}
const empty=():EdgeoneSnapshot=>({requests:null,bytes:null,cacheHits:null,cacheEligible:null,mitigated:null,start:'',end:'',syncedAt:'',attemptedAt:'',error:'',status:'empty'})
export function edgeoneSnapshot():EdgeoneSnapshot{
  try{
    const row=store().prepare('SELECT json FROM edgeone_cache WHERE id=1').get() as {json:string}|undefined
    const c=row&&row.json.length<8000?JSON.parse(row.json):null
    if(!c||c.key!==key())return {...empty(),status:edgeoneConfiguration().configured?'empty':'unconfigured'}
    const data=empty()
    for(const field of ['requests','bytes','cacheHits','cacheEligible','mitigated'] as const){if(c[field]!==null&&(!Number.isSafeInteger(c[field])||c[field]<0))throw Error();data[field]=c[field]}
    for(const field of ['start','end','syncedAt','attemptedAt'] as const){if(typeof c[field]!=='string'||(c[field]&&!Number.isFinite(Date.parse(c[field]))))throw Error();data[field]=c[field]}
    if(typeof c.error!=='string'||c.error.length>300||(data.syncedAt&&(!data.start||!data.end||Date.parse(data.end)<=Date.parse(data.start)))||(data.cacheHits!==null&&data.cacheEligible!==null&&data.cacheHits>data.cacheEligible))throw Error()
    return {...data,error:c.error,status:c.error?(data.syncedAt?'stale':'error'):data.syncedAt?(Date.now()-Date.parse(data.syncedAt)>TTL?'stale':'ready'):'empty'}
  }catch{return {...empty(),status:'error',error:'EdgeOne 缓存暂不可用'}}
}
function save(snapshot:EdgeoneSnapshot,signature:string){store().prepare('INSERT INTO edgeone_cache VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(JSON.stringify({...snapshot,key:signature}))}
const state=globalThis as typeof globalThis&{hubEdgeoneSync?:Promise<EdgeoneSnapshot>}
export function refreshEdgeone(force=false):Promise<EdgeoneSnapshot>{
  if(!isEnabled('edgeone'))return Promise.reject(Error('EdgeOne 模块未启用'))
  const old=edgeoneSnapshot()
  if((!force&&old.syncedAt&&!old.error&&Date.now()-Date.parse(old.syncedAt)<TTL)||(old.attemptedAt&&Date.now()-Date.parse(old.attemptedAt)<(force?MANUAL_RETRY:RETRY)))return Promise.resolve(old)
  if(state.hubEdgeoneSync)return state.hubEdgeoneSync
  const signature=key(),generation=()=> (getDatabase().prepare("SELECT updated_at FROM module_settings WHERE id='edgeone'").get() as {updated_at:string}|undefined)?.updated_at,before=generation()
  const current=()=>isEnabled('edgeone')&&key()===signature&&generation()===before
  const attemptedAt=new Date().toISOString()
  save({...old,attemptedAt},signature)
  const task=(async()=>{
    try{
      const credentials=edgeoneCredentials(),scope=edgeoneScope(),settings=validateEdgeone(getEdgeoneSettings())
      // Completed UTC hours keep all groups on identical boundaries, beyond the API's ~10 minute delay.
      const end=new Date(Math.floor((Date.now()-15*60_000)/3600_000)*3600_000).toISOString().replace('.000Z','+00:00'),start=new Date(Date.parse(end)-(settings.period==='7d'?7:1)*24*3600_000).toISOString().replace('.000Z','+00:00')
      const signal=AbortSignal.timeout(5000)
      const query=(metrics:string[],mitigated:string[],cache?:string[])=>queryEdgeone({ZoneIds:[scope.zone],StartTime:start,EndTime:end,Interval:'hour',MetricNames:metrics,Filters:[{Key:'domain',Operator:'equals',Value:settings.domains},{Key:'mitigatedByWebSecurity',Operator:'equals',Value:mitigated},...(cache?[{Key:'cacheType',Operator:'equals',Value:cache}]:[])]},signal,credentials)
      const [total,hits,eligible,mitigated]=await Promise.all([query(['l7Flow_request','l7Flow_outFlux'],['yes','no']),query(['l7Flow_request'],['no'],['hit']),query(['l7Flow_request'],['no'],['hit','miss']),query(['l7Flow_request'],['yes'])])
      const sum=(r:typeof total,m='l7Flow_request')=>edgeoneSum(r,m,start,end)
      const next:EdgeoneSnapshot={requests:sum(total),bytes:sum(total,'l7Flow_outFlux'),cacheHits:sum(hits),cacheEligible:sum(eligible),mitigated:sum(mitigated),start,end,syncedAt:new Date().toISOString(),attemptedAt,error:'',status:'ready'}
      if(next.cacheHits!==null&&next.cacheEligible!==null&&next.cacheHits>next.cacheEligible)throw Error('Inconsistent cache metrics')
      if(current())save(next,signature)
    }catch{if(current())save({...old,attemptedAt,error:'EdgeOne 同步失败，请检查服务端凭据、只读权限、套餐支持或稍后重试；保留最近成功数据',status:old.syncedAt?'stale':'error'},signature)}
    return edgeoneSnapshot()
  })()
  state.hubEdgeoneSync=task;void task.finally(()=>{if(state.hubEdgeoneSync===task)state.hubEdgeoneSync=undefined}).catch(()=>{});return task
}
