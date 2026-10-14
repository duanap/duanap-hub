import { AccountError,type AccountConfig } from './config'
export type AccountIdentity={hubUid:string;displayName:string;avatarUrl:string;asOf:string}
export type Points={balance:number;asOf:string}
export type Checkin={businessDate:string;timezone:string;checkedIn:boolean;continuousDays:number;totalDays:number;asOf:string}
export type History={items:{delta:number;balanceAfter:number;reason:string;occurredAt:string}[];page:number;perPage:number;totalRetained:number;retentionLimit:number;asOf:string}
export type Bindings={providers:{provider:string;name:string;configured:boolean;linked:boolean;legacyReview:boolean}[];passwordReady:boolean;managementUrl:string;recoveryUrl:string;asOf:string}

async function provider(config:AccountConfig,path:string,options:RequestInit){
  try{
    const response=await fetch(new URL(path,config.base),{...options,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(2500),headers:{Accept:'application/json',...options.headers}})
    if(response.status===401||response.status===403)throw new AccountError(response.status,'upstream_unauthorized','博客授权已失效或账号不可用，请重新登录')
    if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Unavailable')
    const reader=response.body?.getReader();if(!reader)throw new Error('Missing body')
    const chunks:Uint8Array[]=[];let bytes=0
    try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>64_000){await reader.cancel();throw new Error('Too large')}chunks.push(part.value)}}finally{reader.releaseLock()}
    const value:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid response')
    return value as Record<string,unknown>
  }catch(error){if(error instanceof AccountError)throw error;throw new AccountError(503,'wordpress_unavailable','博客服务暂不可用，请稍后重试')}
}
const invalid=()=>new AccountError(503,'invalid_wordpress_data','博客返回的数据暂不可用')
function text(value:unknown,limit:number){if(typeof value!=='string'||value.length>limit)throw invalid();return value}
function integer(value:unknown,min=0,max=Number.MAX_SAFE_INTEGER){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)throw invalid();return value}
function date(value:unknown){const result=text(value,40);if(!/^\d{4}-\d\d-\d\dT/.test(result)||!Number.isFinite(Date.parse(result)))throw invalid();return result}
export async function exchangeCode(config:AccountConfig,code:string,verifier:string){
  const started=Math.floor(Date.now()/1000)
  const p=await provider(config,'oauth/token/',{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.callback,code,code_verifier:verifier})})
  const token=text(p.access_token,2048)
  if(!/^[A-Za-z0-9._~-]{40,2048}$/.test(token)||typeof p.token_type!=='string'||p.token_type.toLowerCase()!=='bearer'||p.id_token!==undefined||p.refresh_token!==undefined||typeof p.scope!=='string'||!p.scope.split(' ').includes('basic'))throw invalid()
  return {accessToken:token,expiresAt:started+integer(p.expires_in,1,3600)}
}
export async function readIdentity(config:AccountConfig,token:string):Promise<AccountIdentity>{
  const p=await provider(config,'wp-json/duanap-hub/v1/me',{headers:{Authorization:'Bearer '+token}})
  const hubUid=text(p.hub_uid,36),avatarUrl=text(p.avatar_url,2000)
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(hubUid))throw invalid()
  if(avatarUrl){try{const url=new URL(avatarUrl);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw invalid()}catch{throw invalid()}}
  // WordPress stores 250 characters; a character may occupy two UTF-16 units.
  return {hubUid,displayName:text(p.display_name,500),avatarUrl,asOf:date(p.as_of)}
}
export async function readPoints(config:AccountConfig,token:string):Promise<Points>{
  const p=await provider(config,'wp-json/duanap-hub/v1/me/points',{headers:{Authorization:'Bearer '+token}})
  return {balance:integer(p.balance,Number.MIN_SAFE_INTEGER),asOf:date(p.as_of)}
}
export async function readCheckin(config:AccountConfig,token:string):Promise<Checkin>{
  const p=await provider(config,'wp-json/duanap-hub/v1/me/checkin',{headers:{Authorization:'Bearer '+token}})
  const businessDate=text(p.business_date,10)
  if(!/^\d{4}-\d\d-\d\d$/.test(businessDate)||p.timezone!=='Asia/Shanghai'||typeof p.checked_in!=='boolean')throw invalid()
  return {businessDate,timezone:p.timezone,checkedIn:p.checked_in,continuousDays:integer(p.continuous_days),totalDays:integer(p.total_days),asOf:date(p.as_of)}
}
export async function readHistory(config:AccountConfig,token:string,page:string,size:string):Promise<History>{
  const p=await provider(config,'wp-json/duanap-hub/v1/me/points/history?'+new URLSearchParams({page,per_page:size}),{headers:{Authorization:'Bearer '+token}})
  if(!Array.isArray(p.items)||p.items.length>Number(size)||p.retention_limit!==50)throw invalid()
  return {items:p.items.map(raw=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw invalid();return {delta:integer(raw.delta,Number.MIN_SAFE_INTEGER),balanceAfter:integer(raw.balance_after,Number.MIN_SAFE_INTEGER),reason:text(raw.reason,4000),occurredAt:date(raw.occurred_at)}}),page:integer(p.page,1,50),perPage:integer(p.per_page,1,20),totalRetained:integer(p.total_retained,0,50),retentionLimit:50,asOf:date(p.as_of)}
}
export async function revokeWordPressToken(config:AccountConfig,token:string){
  try{await provider(config,'oauth/revoke/',{method:'POST',body:new URLSearchParams({token,token_type_hint:'access_token',client_id:config.clientId,client_secret:config.clientSecret})});return true}catch{return false}
}
export async function readBindings(config:AccountConfig,token:string):Promise<Bindings>{
  const p=await provider(config,'wp-json/duanap-hub/v1/me/bindings',{headers:{Authorization:'Bearer '+token}})
  if(!Array.isArray(p.providers)||p.providers.length!==3||typeof p.password_ready!=='boolean')throw invalid()
  const providers=p.providers.map(raw=>{
    if(!raw||typeof raw!=='object'||!['qq','github','gitee'].includes(raw.provider)||typeof raw.configured!=='boolean'||typeof raw.linked!=='boolean'||typeof raw.legacy_review!=='boolean')throw invalid()
    return {provider:raw.provider,name:text(raw.name,20),configured:raw.configured,linked:raw.linked,legacyReview:raw.legacy_review}
  })
  if(new Set(providers.map(p=>p.provider)).size!==3)throw invalid()
  const safeLink=(value:unknown)=>{const url=new URL(text(value,2000));if(url.origin!==config.base.origin||url.username||url.password)throw invalid();return url.href}
  return {providers,passwordReady:p.password_ready,managementUrl:safeLink(p.management_url),recoveryUrl:safeLink(p.recovery_url),asOf:date(p.as_of)}
}
