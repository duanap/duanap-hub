import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { getDatabase } from '@/lib/db'
import { SITE_ORIGIN } from '@/lib/config'
import { NextResponse } from 'next/server'

export const ADMIN_COOKIE = 'hub_admin_session'
const SESSION_SECONDS = 60 * 60 * 24 * 7
const WINDOW_SECONDS = 60 * 15

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export function verifyAdminPassword(user:string, password:string):boolean {
  const expectedUser = process.env.HUB_ADMIN_USERNAME || 'duanap'
  const stored = process.env.HUB_ADMIN_PASSWORD_HASH || ''
  if (user !== expectedUser || password.length < 12 || password.length > 200) return false
  const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored)
  if(!match)return false
  const candidate=scryptSync(password, Buffer.from(match[1], 'hex'),64)
  const expected=Buffer.from(match[2], 'hex')
  return expected.length === candidate.length && timingSafeEqual(expected,candidate)
}
export async function hasAdminSession():Promise<boolean> {
  const token=(await cookies()).get(ADMIN_COOKIE)?.value
  if(!token)return false
  const now=Math.floor(Date.now()/1000)
  const db=getDatabase()
  db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(now)
  return Boolean(db.prepare('SELECT 1 FROM admin_sessions WHERE token_hash=? AND expires_at>?').get(hashToken(token),now))
}
export function createAdminSession():string {
  const token=randomBytes(32).toString('base64url')
  getDatabase().prepare('INSERT INTO admin_sessions (token_hash,expires_at) VALUES (?,?)')
    .run(hashToken(token),Math.floor(Date.now()/1000)+SESSION_SECONDS)
  return token
}
export function cookieOptions(){return {httpOnly:true,sameSite:'lax' as const,secure:SITE_ORIGIN.startsWith('https://'),path:'/',maxAge:SESSION_SECONDS}}
export async function removeAdminSession():Promise<void> {
  const token=(await cookies()).get(ADMIN_COOKIE)?.value
  if(token)getDatabase().prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(hashToken(token))
}
export function isSameOrigin(request:Request) {
  const origin=request.headers.get('origin')
  return origin===SITE_ORIGIN
}
export async function guardAdminMutation(request:Request){
  if(!isSameOrigin(request))return NextResponse.json({error:'请求来源不匹配'}, {status:403})
  if(!await hasAdminSession())return NextResponse.json({error:'未登录管理员'}, {status:401})
  return null
}
export function loginAttemptKey(request:Request){
  const value=request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown'
  return createHash('sha256').update(value.slice(0,100)).digest('hex')
}
export function canTryLogin(key:string){
  const row=getDatabase().prepare('SELECT count,reset_at FROM admin_login_attempts WHERE key=?').get(key) as {count:number;reset_at:number}|undefined
  if(!row)return true
  return row.reset_at<=Math.floor(Date.now()/1000)||row.count<7
}
export function trackFailedLogin(key:string){
  const now=Math.floor(Date.now()/1000)
  const row=getDatabase().prepare('SELECT count,reset_at FROM admin_login_attempts WHERE key=?').get(key) as {count:number;reset_at:number}|undefined
  const next= !row||row.reset_at<=now ? {count:1,reset_at:now+WINDOW_SECONDS} : {count:row.count+1,reset_at:row.reset_at}
  getDatabase().prepare('INSERT INTO admin_login_attempts(key,count,reset_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,reset_at=excluded.reset_at').run(key,next.count,next.reset_at)
}
export function clearLoginFailures(key:string){getDatabase().prepare('DELETE FROM admin_login_attempts WHERE key=?').run(key)}
