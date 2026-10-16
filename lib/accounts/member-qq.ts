import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { SITE_ORIGIN } from '@/lib/config'
import { AccountError } from './config'
import { cookieOptions,privateHeaders } from './session'
import { MEMBER_COOKIE,currentMember } from './member-session'
import { beginMemberFlow,consumeMemberFlow,createMemberSession,findMemberSession,markMemberVerified,memberConfig,memberHash,resolveMemberQQ,type MemberSession,type QQIdentity } from './member-store'
import { beginBlogLink } from './blog-link'

function qqConfig(){
  const appId=process.env.HUB_QQ_APP_ID||'',key=process.env.HUB_QQ_APP_KEY||'',realm=process.env.HUB_QQ_UNION_REALM||''
  if(process.env.HUB_QQ_LOGIN_ENABLED!=='1'||!/^\d{5,20}$/.test(appId)||key.length<16||key.length>512||!/^[A-Za-z0-9_-]{0,100}$/.test(realm))throw new AccountError(503,'qq_unconfigured','主域 QQ 登录尚未配置，请使用主站用户名和密码')
  let base=new URL('https://graph.qq.com/')
  if(process.env.HUB_QQ_TEST_BASE){
    const test=new URL(process.env.HUB_QQ_TEST_BASE)
    if(process.env.HUB_ACCOUNTS_ALLOW_LOOPBACK!=='1'||new URL(SITE_ORIGIN).hostname!=='127.0.0.1'||test.hostname!=='127.0.0.1'||test.protocol!=='http:'||test.username||test.password||test.search||test.hash||test.pathname!=='/')throw new AccountError(503,'qq_unconfigured','QQ 测试配置不适用')
    base=test
  }
  if(!SITE_ORIGIN.startsWith('https://')&&!(base.hostname==='127.0.0.1'&&new URL(SITE_ORIGIN).hostname==='127.0.0.1'))throw new AccountError(503,'qq_unconfigured','QQ 登录要求 HTTPS')
  return {appId,key,realm,base,callback:SITE_ORIGIN+'/oauth/qq/callback',fingerprint:memberHash(JSON.stringify([appId,key,realm,base.href,SITE_ORIGIN]))}
}
export function mainQQConfigured(){try{qqConfig();return true}catch{return false}}
const transactionCookie=(state:string)=>'hub_qq_transaction_'+state
type QQFlow={fingerprint:string;actor?:{id:string;hash:string};automatic:boolean}
export async function beginQQAuthorization(automatic:boolean,actor?:MemberSession){
  const config=memberConfig(),qq=qqConfig(),jar=await cookies()
  if(jar.getAll().filter(c=>c.name.startsWith('hub_qq_transaction_')).length>=16)throw new AccountError(429,'authorization_limit','授权请求过多，请稍后重试')
  const browser=randomBytes(32).toString('base64url'),state=beginMemberFlow(config,browser,{fingerprint:qq.fingerprint,actor:actor?{id:actor.memberId,hash:actor.hash}:undefined,automatic})
  const target=new URL('oauth2.0/authorize',qq.base)
  target.search=new URLSearchParams({response_type:'code',client_id:qq.appId,redirect_uri:qq.callback,state,scope:'get_user_info'}).toString()
  const response=NextResponse.redirect(target,303)
  for(const [key,value] of Object.entries(privateHeaders))response.headers.set(key,value)
  response.headers.set('Referrer-Policy','no-referrer');response.cookies.set(transactionCookie(state),browser,cookieOptions(300))
  return response
}
async function qqRequest(base:URL,path:string,params:Record<string,string>){
  try{
    const target=new URL(path,base);target.search=new URLSearchParams(params).toString()
    const response=await fetch(target,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(3500)})
    if(!response.ok||!response.body)throw Error('Unavailable')
    const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0
    try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16000){await reader.cancel();throw Error('Too large')}parts.push(part.value)}}finally{reader.releaseLock()}
    const raw=Buffer.concat(parts).toString('utf8').trim()
    let value:unknown
    if(raw.startsWith('{'))value=JSON.parse(raw)
    else if(/^callback\s*\(/.test(raw))value=JSON.parse(raw.replace(/^callback\s*\(\s*/,'').replace(/\s*\);?\s*$/,''))
    else value=Object.fromEntries(new URLSearchParams(raw))
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid')
    return value as Record<string,unknown>
  }catch{throw new AccountError(503,'qq_unavailable','QQ 授权暂不可用，请重试或使用主站密码登录')}
}
export function qqAvatar(info:Record<string,unknown>){
  for(const value of [info.figureurl_qq_2,info.figureurl_qq_1]){
    if(typeof value!=='string'||value.length>2000)continue
    try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port||!(url.hostname==='qlogo.cn'||url.hostname.endsWith('.qlogo.cn')))continue;url.protocol='https:';return url.href}catch{}
  }
  return ''
}
export async function finishQQAuthorization(request:Request){
  let consumed=''
  try{
    const config=memberConfig(),qq=qqConfig(),query=new URL(request.url).searchParams,state=query.get('state')||'',code=query.get('code')||''
    if([...query.keys()].some(key=>!['state','code','error','error_description'].includes(key))||query.getAll('state').length!==1||query.getAll('code').length>1||query.getAll('error').length>1||query.getAll('error_description').length>1||!/^[\w-]{43}$/.test(state))throw new AccountError(400,'invalid_authorization','QQ 回调无效')
    const browser=(await cookies()).get(transactionCookie(state))?.value||''
    if(!/^[\w-]{43}$/.test(browser))throw new AccountError(401,'invalid_authorization','浏览器授权信息缺失')
    const flow=consumeMemberFlow<QQFlow>(config,state,browser);consumed=state
    if(flow.fingerprint!==qq.fingerprint||query.has('error')||!/^[A-Za-z0-9._~-]{20,1024}$/.test(code))throw new AccountError(401,'invalid_authorization','QQ 授权未完成')
    const actor=flow.actor?await currentMember(config):undefined
    if(flow.actor&&(actor?.memberId!==flow.actor.id||actor.hash!==flow.actor.hash))throw new AccountError(401,'member_session_changed','主站会话已变化')
    const tokenResult=await qqRequest(qq.base,'oauth2.0/token',{grant_type:'authorization_code',client_id:qq.appId,client_secret:qq.key,code,redirect_uri:qq.callback,fmt:'json'})
    const token=tokenResult.access_token
    if(typeof token!=='string'||!/^[A-Za-z0-9._~-]{16,2048}$/.test(token)||tokenResult.error!==undefined)throw new AccountError(401,'qq_authorization_failed','QQ 授权未开通、已过期或未完成')
    const identity=await qqRequest(qq.base,'oauth2.0/me',{access_token:token,fmt:'json'})
    if(String(identity.client_id)!==qq.appId||typeof identity.openid!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(identity.openid))throw new AccountError(401,'qq_wrong_app','QQ 返回的应用身份不匹配')
    let unionId=''
    if(qq.realm){
      try{
        const union=await qqRequest(qq.base,'oauth2.0/me',{access_token:token,unionid:'1',fmt:'json'})
        if(String(union.client_id)===qq.appId&&union.openid===identity.openid&&typeof union.unionid==='string'&&/^[A-Za-z0-9_-]{16,128}$/.test(union.unionid))unionId=union.unionid
      }catch{/* Optional identity matching is unavailable; the QQ login is still valid. */}
      // Missing UnionID permission must not prevent an ordinary local QQ login.
    }
    const profile=await qqRequest(qq.base,'user/get_user_info',{access_token:token,oauth_consumer_key:qq.appId,openid:identity.openid})
    if(profile.ret!==0&&profile.ret!=='0')throw new AccountError(503,'qq_profile_unavailable','未取得 QQ 资料，请重试')
    const qqIdentity:QQIdentity={appId:qq.appId,subject:identity.openid,realm:qq.realm,unionId,displayName:typeof profile.nickname==='string'?profile.nickname.replace(/[\x00-\x1f\x7f]/g,'').slice(0,80):'QQ 用户',avatarUrl:qqAvatar(profile)}
    const member=resolveMemberQQ(config,qqIdentity,actor)
    if(actor)markMemberVerified(config,actor)
    const sessionToken=actor?null:createMemberSession(config,member.id)
    const current=actor||findMemberSession(config,sessionToken!)!
    let response=NextResponse.redirect(SITE_ORIGIN+'/account',303)
    if(flow.automatic&&qq.realm&&unionId){try{response=beginBlogLink(current,true)}catch{response=NextResponse.redirect(SITE_ORIGIN+'/account?blog=unavailable',303)}}
    else if(flow.automatic)response=NextResponse.redirect(SITE_ORIGIN+'/account?blog=manual',303)
    if(sessionToken)response.cookies.set(MEMBER_COOKIE,sessionToken,cookieOptions(604800))
    response.cookies.set(transactionCookie(state),'',cookieOptions(0))
    for(const [key,value] of Object.entries(privateHeaders))response.headers.set(key,value)
    response.headers.set('Referrer-Policy','no-referrer')
    return response
  }catch{
    const response=NextResponse.redirect(SITE_ORIGIN+'/account?qq=failed',{status:303,headers:{...privateHeaders,'Referrer-Policy':'no-referrer'}})
    if(consumed)response.cookies.set(transactionCookie(consumed),'',cookieOptions(0))
    return response
  }
}
