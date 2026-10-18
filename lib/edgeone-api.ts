import {createHash,createHmac} from 'node:crypto'
import {readFileSync,statSync} from 'node:fs'
import {isAbsolute} from 'node:path'
import {SITE_ORIGIN} from './config'

type Credentials={secretId:string;secretKey:string;token?:string;expiresAt?:number}
const host='teo.tencentcloudapi.com',action='DescribeTimingL7AnalysisData'
const hash=(value:string)=>createHash('sha256').update(value).digest('hex')
const hmac=(key:string|Buffer,value:string)=>createHmac('sha256',key).update(value).digest()
export function edgeoneCredentials():Credentials{
  const file=process.env.HUB_EDGEONE_CREDENTIAL_FILE
  if(!file||!isAbsolute(file))throw Error('EdgeOne 只读凭据尚未配置')
  try{
    const stat=statSync(file)
    if(!stat.isFile()||stat.size>8192||(process.platform!=='win32'&&(stat.mode&0o007)!==0))throw Error()
    const c=JSON.parse(readFileSync(file,'utf8'))
    if(!c||Object.keys(c).some(k=>!['secretId','secretKey','token','expiresAt'].includes(k))||typeof c.secretId!=='string'||!c.secretId||c.secretId.length>256||typeof c.secretKey!=='string'||!c.secretKey||c.secretKey.length>256||(c.token!==undefined&&(typeof c.token!=='string'||c.token.length>4096))||(c.expiresAt!==undefined&&(!Number.isSafeInteger(c.expiresAt)||c.expiresAt*1000<=Date.now()+60_000)))throw Error()
    return {secretId:c.secretId,secretKey:c.secretKey,...(c.token?{token:c.token}:{}),...(c.expiresAt?{expiresAt:c.expiresAt}:{})}
  }catch{throw Error('EdgeOne 只读凭据不可用或已过期，请在服务器更新')}
}
export function edgeoneScope(){
  const zone=process.env.HUB_EDGEONE_ZONE_ID||'',allowed=(process.env.HUB_EDGEONE_DOMAINS||'duanap.cn,www.duanap.cn,blog.duanap.cn').split(',').map(x=>x.trim()).filter(Boolean)
  if(!/^zone-[a-z0-9]+$/.test(zone)||!allowed.length||allowed.length>10||allowed.some(d=>!validDomain(d)))throw Error('EdgeOne 站点范围尚未配置')
  return {zone,allowed}
}
export function validDomain(v:unknown):v is string{return typeof v==='string'&&v.length<=253&&/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(v)}
function endpoint(){
  const test=process.env.HUB_EDGEONE_TEST_BASE
  if(!test)return 'https://'+host+'/'
  const u=new URL(test)
  // No production override can send signed credentials to another host.
  if(process.env.NODE_ENV==='production'||process.env.HUB_EDGEONE_ALLOW_LOOPBACK!=='1'||new URL(SITE_ORIGIN).hostname!=='127.0.0.1'||u.origin!=='http://127.0.0.1:1035'||u.pathname!=='/'||u.search||u.hash||u.username||u.password)throw Error('EdgeOne 测试源不可用')
  return u.href
}
export async function queryEdgeone(payload:object,signal:AbortSignal,credentials:Credentials){
  const body=JSON.stringify(payload),timestamp=Math.floor(Date.now()/1000),date=new Date(timestamp*1000).toISOString().slice(0,10),scope=date+'/teo/tc3_request'
  const headersText='content-type:application/json\nhost:'+host+'\n',signed='content-type;host'
  const canonical=['POST','/','',headersText,signed,hash(body)].join('\n')
  const signature=createHmac('sha256',hmac(hmac(hmac('TC3'+credentials.secretKey,date),'teo'),'tc3_request')).update(['TC3-HMAC-SHA256',timestamp,scope,hash(canonical)].join('\n')).digest('hex')
  const headers:Record<string,string>={'Content-Type':'application/json','X-TC-Action':action,'X-TC-Version':'2022-09-01','X-TC-Timestamp':String(timestamp),'X-TC-RequestClient':'duanap-hub-edgeone/1.0','Authorization':`TC3-HMAC-SHA256 Credential=${credentials.secretId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`}
  if(credentials.token)headers['X-TC-Token']=credentials.token
  const response=await fetch(endpoint(),{method:'POST',headers,body,redirect:'manual',cache:'no-store',signal})
  if(!response.ok||!response.body||!response.headers.get('content-type')?.includes('json'))throw Error('EdgeOne 接口暂不可用')
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0
  try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>256_000){await reader.cancel();throw Error('EdgeOne 响应超限')}parts.push(p.value)}}finally{reader.releaseLock()}
  const value=JSON.parse(Buffer.concat(parts).toString()).Response
  if(value?.Error){const code=value.Error.Code;if(typeof code==='string'&&/^(AuthFailure|UnauthorizedOperation)/.test(code))throw Error('EdgeOne 凭据或只读权限不可用');throw Error('EdgeOne 当前套餐、筛选条件或接口暂不可用')}
  if(!value||!Number.isSafeInteger(value.TotalCount)||!Array.isArray(value.Data)||value.TotalCount!==value.Data.length||value.Data.length>1)throw Error('EdgeOne 返回的数据不完整')
  return value as {TotalCount:number;Data:{TypeValue:{MetricName:string;Sum:number;Detail:{Timestamp:number;Value:number}[]|null}[]|null}[]}
}
export function edgeoneSum(response:Awaited<ReturnType<typeof queryEdgeone>>,metric:string,start:string,end:string):number|null{
  if(!response.Data.length||response.Data[0].TypeValue===null)return null
  const values=response.Data[0].TypeValue
  if(!Array.isArray(values))throw Error('EdgeOne 指标缺失')
  const rows=values.filter(v=>v.MetricName===metric)
  if(!rows.length)return null
  if(rows.length!==1)throw Error('EdgeOne 重复指标')
  const row=rows[0]
  if(row.Detail===null)return null
  if(!Array.isArray(row.Detail)||row.Detail.length>168||!Number.isSafeInteger(row.Sum)||row.Sum<0||row.Detail.some(p=>!Number.isSafeInteger(p.Timestamp)||p.Timestamp*1000<Date.parse(start)||p.Timestamp*1000>=Date.parse(end)||!Number.isSafeInteger(p.Value)||p.Value<0)||new Set(row.Detail.map(p=>p.Timestamp)).size!==row.Detail.length)throw Error('EdgeOne 指标格式无效')
  if(!row.Detail.length)return null
  return row.Sum
}
