import { cookies } from 'next/headers'
import { timingSafeEqual } from 'node:crypto'
import { SITE_ORIGIN } from '@/lib/config'
import { AccountError } from './config'
import { findMemberSession,memberCsrf,type MemberConfig,type MemberSession } from './member-store'
export const MEMBER_COOKIE='hub_member_session'
export async function currentMember(config:MemberConfig){const current=findMemberSession(config,(await cookies()).get(MEMBER_COOKIE)?.value||'');if(!current)throw new AccountError(401,'member_unauthenticated','请登录主站账号');return current}
export function guardMemberOrigin(request:Request){if(request.headers.get('origin')!==SITE_ORIGIN)throw new AccountError(403,'invalid_source','请求来源无效')}
export function guardMemberMutation(request:Request,config:MemberConfig,current:MemberSession){guardMemberOrigin(request);const token=request.headers.get('x-hub-csrf')||'';if(!/^[\w-]{43}$/.test(token)||!timingSafeEqual(Buffer.from(token),Buffer.from(memberCsrf(config,current))))throw new AccountError(403,'invalid_source','验证信息已变化，请刷新后重试')}
