import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { SITE_ORIGIN } from '@/lib/config'
import { accountConfig,AccountError } from '@/lib/accounts/config'
import { authTransactionCookie,USER_COOKIE,cookieOptions,privateHeaders,accountFailure } from '@/lib/accounts/session'
import { consumeAuthorization,createAccountSession } from '@/lib/accounts/store'
import { exchangeCode,readIdentity,revokeWordPressToken } from '@/lib/accounts/wordpress'
export const runtime='nodejs'
export async function GET(request:Request){
  let config
  try{config=accountConfig()}catch(error){return accountFailure(error)}
  let token='',consumedState=''
  try{
    const query=new URL(request.url).searchParams,state=query.get('state')||'',code=query.get('code')||''
    const browser=(await cookies()).get(authTransactionCookie(state))?.value||''
    if(query.getAll('state').length!==1||query.getAll('code').length>1||query.getAll('error').length>1||!/^[-_A-Za-z0-9]{43}$/.test(state)||!/^[-_A-Za-z0-9]{43}$/.test(browser))throw new AccountError(401,'invalid_authorization','授权无效')
    const transaction=consumeAuthorization(config,state,browser)
    consumedState=state
    if(query.has('error')||!/^[A-Za-z0-9._~-]{20,512}$/.test(code))throw new AccountError(401,'invalid_authorization','授权未完成')
    const exchanged=await exchangeCode(config,code,transaction.verifier);token=exchanged.accessToken
    const identity=await readIdentity(config,token)
    if(exchanged.expiresAt<=Math.floor(Date.now()/1000))throw new AccountError(401,'expired_authorization','授权已过期')
    const session=createAccountSession(config,token,identity,exchanged.expiresAt)
    const response=NextResponse.redirect(new URL(transaction.returnTo,SITE_ORIGIN),303)
    for(const [key,value] of Object.entries(privateHeaders))response.headers.set(key,value)
    response.cookies.set(USER_COOKIE,session,cookieOptions(exchanged.expiresAt-Math.floor(Date.now()/1000)))
    response.cookies.set(authTransactionCookie(state),'',cookieOptions(0))
    return response
  }catch{
    if(token)await revokeWordPressToken(config,token)
    const response=NextResponse.redirect(SITE_ORIGIN+'/account?auth=failed',{status:303,headers:privateHeaders})
    if(consumedState)response.cookies.set(authTransactionCookie(consumedState),'',cookieOptions(0))
    return response
  }
}
