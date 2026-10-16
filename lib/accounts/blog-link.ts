import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { accountConfig } from './config'
import { beginAuthorization } from './store'
import { AUTH_COOKIE,authTransactionCookie,cookieOptions,privateHeaders } from './session'
import { memberConfig,memberBindingVersion,type MemberSession } from './member-store'

// Only called after a local POST+CSRF check or a browser-bound QQ callback.
export function beginBlogLink(current:MemberSession,automatic=false){
  const config=accountConfig(),browser=randomBytes(32).toString('base64url')
  const transaction=beginAuthorization(config,browser,'/account',{memberId:current.memberId,sessionHash:current.hash,automatic,bindingVersion:memberBindingVersion(memberConfig(),current.memberId)})
  const target=new URL('oauth/authorize/',config.base)
  target.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.callback,response_type:'code',scope:'basic',state:transaction.state,code_challenge:transaction.challenge,code_challenge_method:'S256',...(automatic?{hub_login:'qq'}:{})}).toString()
  const response=NextResponse.redirect(target,303)
  for(const [key,value] of Object.entries(privateHeaders))response.headers.set(key,value)
  response.cookies.set(AUTH_COOKIE,browser,cookieOptions(600));response.cookies.set(authTransactionCookie(transaction.state),browser,cookieOptions(300))
  return response
}
