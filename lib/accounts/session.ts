import { cookies } from 'next/headers'
import { createHmac,timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { SITE_ORIGIN } from '@/lib/config'
import { AccountError,type AccountConfig } from './config'
import { findAccountSession,type AccountSession } from './store'
import { memberMode,memberConfig,memberBlog,memberCsrf } from './member-store'
import { currentMember } from './member-session'

export const USER_COOKIE='hub_user_session',AUTH_COOKIE='hub_auth_browser'
export const authTransactionCookie=(state:string)=>'hub_auth_transaction_'+state
export const privateHeaders={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Vary':'Cookie'}
export function cookieOptions(seconds:number){return {httpOnly:true,sameSite:'lax' as const,secure:SITE_ORIGIN.startsWith('https://'),path:'/',maxAge:Math.max(0,seconds)}}
export function csrfToken(config:AccountConfig,current:AccountSession){return createHmac('sha256',config.key).update('csrf:'+current.hash).digest('base64url')}
export function accountCsrf(config:AccountConfig,current:AccountSession){return 'mutationCsrf' in current?String(current.mutationCsrf):csrfToken(config,current)}
export async function currentAccount(config:AccountConfig){
  if(memberMode()){
    const local=memberConfig(),member=await currentMember(local),blog=memberBlog(local,member.memberId)
    if(!blog)throw new AccountError(403,'blog_binding_required','关联博客账号后才能使用签到与积分')
    if(!blog.authorized)throw new AccountError(403,'blog_reauth_required','请重新授权博客后使用签到与积分')
    const linked=findAccountSession(config,blog.sessionToken)
    if(!linked||linked.hubUid!==blog.blogUid)throw new AccountError(403,'blog_reauth_required','博客授权已到期，请重新授权；主站登录仍有效')
    return {...linked,mutationCsrf:memberCsrf(local,member)}
  }
  const cookie=(await cookies()).get(USER_COOKIE)?.value||''
  const current=findAccountSession(config,cookie)
  if(!current)throw new AccountError(401,'account_unauthenticated','请使用博客账号登录')
  return current
}
export function guardAccountMutation(request:Request,config:AccountConfig,current:AccountSession){
  const value=request.headers.get('x-hub-csrf')||'',expected=('mutationCsrf' in current?String(current.mutationCsrf):csrfToken(config,current))
  if(request.headers.get('origin')!==SITE_ORIGIN||!/^[-_A-Za-z0-9]{43}$/.test(value)||!timingSafeEqual(Buffer.from(value),Buffer.from(expected)))throw new AccountError(403,'invalid_source','请求来源或验证信息不匹配')
}
export function accountFailure(error:unknown){
  const e=error instanceof AccountError?error:new AccountError(503,'account_unavailable','账号服务暂不可用，请稍后再试')
  const response=NextResponse.json({code:e.code,error:e.message},{status:e.status,headers:privateHeaders})
  // Do not expire this shared cookie from asynchronous errors: an older response
  // could otherwise erase a newer login. Invalid server sessions already fail closed.
  return response
}
