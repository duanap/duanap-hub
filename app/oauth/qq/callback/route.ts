import { NextResponse } from 'next/server'
import { qqCallbackDestination } from '@/lib/qq-login'
import { memberMode } from '@/lib/accounts/member-store'
import { finishQQAuthorization } from '@/lib/accounts/member-qq'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' }
function failure(status: number, message: string) {
  return new NextResponse(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QQ登录</title><main><h1>QQ登录未完成</h1><p>${message}</p><a href="/">返回首页重新登录</a></main></html>`, { status, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } })
}
export async function GET(request: Request) {
  if(memberMode())return finishQQAuthorization(request)
  const query = new URL(request.url).searchParams
  const code = query.get('code') || '', state = query.get('state') || ''
  if ([...query.keys()].some(key => key !== 'code' && key !== 'state') || query.getAll('code').length !== 1 || query.getAll('state').length !== 1 || !/^[A-Za-z0-9._~-]{20,1024}$/.test(code) || !/^[A-Za-z0-9_-]{16,256}$/.test(state)) return failure(400, '授权回调无效或已取消，请从登录入口重新发起。')
  const target = qqCallbackDestination()
  if (!target) return failure(503, '主站QQ登录尚未启用，请稍后再试。')
  // The blog owns the original browser-bound PHP session and validates state.
  // This hop must not exchange tokens, grant a session, or forward arbitrary URLs.
  target.search = new URLSearchParams({ code, state }).toString()
  return NextResponse.redirect(target, { status: 303, headers })
}
export function HEAD() { return new NextResponse(null, { status: 405, headers: { ...headers, Allow: 'GET' } }) }
