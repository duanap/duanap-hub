import { cookies } from 'next/headers'
import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { accountConfig,accountReturnTo,AccountError } from '@/lib/accounts/config'
import { AUTH_COOKIE,authTransactionCookie,cookieOptions,privateHeaders,accountFailure } from '@/lib/accounts/session'
import { beginAuthorization } from '@/lib/accounts/store'
export const runtime='nodejs'
export async function GET(request:Request){
  try{
    if(request.headers.get('sec-fetch-site')==='cross-site')throw new AccountError(403,'invalid_source','请从主站进入登录')
    const config=accountConfig(),url=new URL(request.url)
    if(url.searchParams.getAll('returnTo').length>1)throw new AccountError(400,'invalid_return','返回地址无效')
    const provider=url.searchParams.get('provider')
    if(url.searchParams.getAll('provider').length>1||(provider!==null&&provider!=='qq'))throw new AccountError(400,'invalid_provider','登录方式无效')
    const returnTo=accountReturnTo(url.searchParams.get('returnTo'))
    const jar=await cookies()
    if(jar.getAll().filter(cookie=>cookie.name.startsWith('hub_auth_transaction_')).length>=16)throw new AccountError(429,'authorization_limit','登录请求过多，请稍后再试')
    const previous=jar.get(AUTH_COOKIE)?.value||''
    const browser=/^[-_A-Za-z0-9]{43}$/.test(previous)?previous:randomBytes(32).toString('base64url')
    const transaction=beginAuthorization(config,browser,returnTo)
    const target=new URL('oauth/authorize/',config.base)
    target.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.callback,response_type:'code',scope:'basic',state:transaction.state,code_challenge:transaction.challenge,code_challenge_method:'S256'}).toString()
    if(provider==='qq')target.searchParams.set('hub_login','qq')
    const response=NextResponse.redirect(target,303)
    for(const [key,value] of Object.entries(privateHeaders))response.headers.set(key,value)
    response.cookies.set(AUTH_COOKIE,browser,cookieOptions(600))
    // Each tab has its own binder cookie even when simultaneous initial starts
    // race to install the shared browser/rate-limit cookie.
    response.cookies.set(authTransactionCookie(transaction.state),browser,cookieOptions(300))
    return response
  }catch(error){return accountFailure(error)}
}
