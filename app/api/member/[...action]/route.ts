import { NextResponse } from 'next/server'
import { SITE_ORIGIN } from '@/lib/config'
import { readLimitedBody } from '@/lib/request-body'
import { loginAttemptKey } from '@/lib/admin-auth'
import { AccountError,accountConfig } from '@/lib/accounts/config'
import { accountFailure,cookieOptions,privateHeaders } from '@/lib/accounts/session'
import { MEMBER_COOKIE,currentMember,guardMemberMutation,guardMemberOrigin } from '@/lib/accounts/member-session'
import { authenticateMember,memberBlog,memberById,memberConfig,memberCsrf,memberQQ,memberQQVersion,memberSessions,memberThrottle,recoverMember,registerMember,removeMemberSession,setMemberPassword,unlinkMemberBlog,unlinkMemberQQ,updateMemberProfile,validPassword,validUsername,verifyMemberQQPassword } from '@/lib/accounts/member-store'
import { beginQQAuthorization,mainQQConfigured,mainQQAutoLinkConfigured } from '@/lib/accounts/member-qq'
import { beginBlogLink,revokeLinkedBlogSession } from '@/lib/accounts/blog-link'
import { deleteAccountSession,findAccountSession } from '@/lib/accounts/store'
import { revokeWordPressToken } from '@/lib/accounts/wordpress'
export const runtime='nodejs'
type Context={params:Promise<{action:string[]}>}
const json=(value:unknown)=>NextResponse.json(value,{headers:privateHeaders})
function jsonRedirect(response:NextResponse){const result=json({url:response.headers.get('location')});for(const cookie of response.cookies.getAll())result.cookies.set(cookie);return result}
async function body(request:Request){
  try{if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('JSON required');const value:unknown=JSON.parse((await readLimitedBody(request,4096)).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid');return value as Record<string,unknown>}
  catch{throw new AccountError(400,'invalid_request','请求参数无效')}
}
function onlyKeys(body:Record<string,unknown>,allowed:string[]){if(Object.keys(body).some(key=>!allowed.includes(key)))throw new AccountError(400,'invalid_request','请求参数无效')}
export async function GET(request:Request,context:Context){
  try{
    const config=memberConfig(),action=(await context.params).action.join('/')
    if(action==='qq'){
      if(request.headers.get('sec-fetch-site')==='cross-site')throw new AccountError(403,'invalid_source','请从主站进入 QQ 登录')
      const query=new URL(request.url).searchParams
      if([...query.keys()].some(k=>k!=='linkBlog')||query.getAll('linkBlog').length>1||(query.has('linkBlog')&&query.get('linkBlog')!=='1'))throw new AccountError(400,'invalid_request','QQ 登录参数无效')
      memberThrottle(config,'qq:'+loginAttemptKey(request),30,900)
      return await beginQQAuthorization(query.get('linkBlog')==='1')
    }
    if(action==='status')return json({qqConfigured:mainQQConfigured(),qqAutoLinkConfigured:mainQQAutoLinkConfigured()})
    const current=await currentMember(config)
    if(action==='me'){
      const member=memberById(config,current.memberId)!,blog=memberBlog(config,member.id)
      let authorized=false
      if(blog){try{authorized=!!findAccountSession(accountConfig(),blog.sessionToken)}catch{}}
      return json({member,csrfToken:memberCsrf(config,current),expiresAt:current.expiresAt,blog:blog?{linked:true,blogUid:blog.blogUid,linkedAt:blog.linkedAt,match:blog.match,authorized:blog.authorized&&authorized}:{linked:false,authorized:false},qqConfigured:mainQQConfigured(),qqAutoLinkConfigured:mainQQAutoLinkConfigured()})
    }
    if(action==='sessions')return json({sessions:memberSessions(config,current)})
    throw new AccountError(404,'not_found','页面不存在')
  }catch(error){if(error instanceof AccountError&&error.code==='qq_unconfigured')return NextResponse.redirect(SITE_ORIGIN+'/account?qq=unconfigured',{status:303,headers:privateHeaders});return accountFailure(error)}
}
export async function POST(request:Request,context:Context){
  try{
    const config=memberConfig(),action=(await context.params).action.join('/')
    guardMemberOrigin(request)
    memberThrottle(config,'request:'+loginAttemptKey(request),80,900)
    if(['login','register','recover'].includes(action)){
      const p=await body(request),username=validUsername(p.username),password=validPassword(p.password)
      onlyKeys(p,action==='recover'?['username','password','recovery']:['username','password'])
      memberThrottle(config,'password:'+username,30,900)
      let result
      if(action==='register'){
        memberThrottle(config,'register:'+loginAttemptKey(request),10,3600)
        result=await registerMember(config,username,password)
      }else if(action==='recover')result=await recoverMember(config,username,typeof p.recovery==='string'?p.recovery:'',password)
      else result=await authenticateMember(config,username,password)
      const response=json({member:result.member,...('recovery' in result?{recovery:result.recovery}:{}),ok:true})
      response.cookies.set(MEMBER_COOKIE,result.sessionToken,cookieOptions(604800));return response
    }
    const current=await currentMember(config);guardMemberMutation(request,config,current)
    if(action==='logout'){removeMemberSession(config,current);return json({ok:true})}
    if(action==='sessions/revoke'){
      const p=await body(request);onlyKeys(p,['id']);if(typeof p.id!=='string'||! /^[0-9a-f-]{36}$/.test(p.id))throw new AccountError(400,'invalid_request','会话无效')
      removeMemberSession(config,current,p.id);return json({ok:true})
    }
    if(action==='profile'){
      const p=await body(request)
      onlyKeys(p,['displayName','avatarSource'])
      if(typeof p.displayName!=='string'||!['qq','initials'].includes(String(p.avatarSource)))throw new AccountError(400,'invalid_profile','资料参数无效')
      updateMemberProfile(config,current.memberId,p.displayName.trim(),p.avatarSource as 'qq'|'initials');return json({ok:true})
    }
    if(action==='password'){
      const p=await body(request);onlyKeys(p,['oldPassword','password']);const recovery=await setMemberPassword(config,current,p.oldPassword,validPassword(p.password));return json({ok:true,recovery})
    }
    if(action==='qq/connect'){
      const p=await body(request);onlyKeys(p,['linkBlog','password']);const qqVersion=memberQQVersion(config,current.memberId);let credentialProof:string|undefined
      if(!memberQQ(config,current.memberId)){memberThrottle(config,'qq-change:'+current.memberId,10,900);credentialProof=await verifyMemberQQPassword(config,current,p.password)}
      return jsonRedirect(await beginQQAuthorization(p.linkBlog===true,current,{replace:false,credentialProof,qqVersion}))
    }
    if(action==='qq/replace'){
      const p=await body(request);onlyKeys(p,['password']);memberThrottle(config,'qq-change:'+current.memberId,10,900)
      if(!memberQQ(config,current.memberId))throw new AccountError(409,'qq_not_linked','当前未关联 QQ')
      const qqVersion=memberQQVersion(config,current.memberId),credentialProof=await verifyMemberQQPassword(config,current,p.password)
      return jsonRedirect(await beginQQAuthorization(false,current,{replace:true,credentialProof,qqVersion}))
    }
    if(action==='qq/unlink'){
      const p=await body(request);onlyKeys(p,['password','confirm']);if(p.confirm!==true)throw new AccountError(400,'confirmation_required','请确认解除 QQ 关联')
      memberThrottle(config,'qq-change:'+current.memberId,10,900);const blog=await unlinkMemberQQ(config,current,p.password),upstreamRevoked=blog?await revokeLinkedBlogSession(blog.sessionToken):false
      return json({ok:true,upstreamRevoked,blogReauthorizationRequired:!!blog,otherSessionsRevoked:true})
    }
    if(action==='blog/link'){const p=await body(request);onlyKeys(p,['automatic']);return jsonRedirect(beginBlogLink(current,p.automatic===true))}
    if(action==='blog/unlink'){
      const p=await body(request);onlyKeys(p,['confirm']);if(p.confirm!==true)throw new AccountError(400,'confirmation_required','请确认解除博客关联')
      const blog=unlinkMemberBlog(config,current.memberId);let upstreamRevoked=false
      if(blog){try{const wp=accountConfig(),linked=findAccountSession(wp,blog.sessionToken);if(linked){deleteAccountSession(wp,linked);upstreamRevoked=await revokeWordPressToken(wp,linked.accessToken)}}catch{}}
      return json({ok:true,upstreamRevoked})
    }
    throw new AccountError(404,'not_found','页面不存在')
  }catch(error){return accountFailure(error)}
}
