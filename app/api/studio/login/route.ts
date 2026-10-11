import { NextResponse } from 'next/server'
import {
  cookieOptions,
  ADMIN_COOKIE,
  canTryLogin,
  clearLoginFailures,
  createAdminSession,
  isSameOrigin,
  loginAttemptKey,
  trackFailedLogin,
  verifyAdminPassword,
} from '@/lib/admin-auth'
import { parseJson } from '@/lib/api'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: '请求来源无效' }, { status: 403 })
  const key = loginAttemptKey(request)
  if (!canTryLogin(key))
    return NextResponse.json({ error: '尝试次数过多，请稍后重试' }, { status: 429 })
  try {
    const p = (await parseJson(request, 2048)) as Record<string, unknown>
    if (
      !p ||
      typeof p.username !== 'string' ||
      typeof p.password !== 'string' ||
      !verifyAdminPassword(p.username, p.password)
    ) {
      trackFailedLogin(key)
      return NextResponse.json({ error: '用户名或密码错误，或后台密码尚未配置' }, { status: 401 })
    }
    const session = createAdminSession()
    clearLoginFailures(key)
    const response = NextResponse.json({ ok: true })
    response.cookies.set(ADMIN_COOKIE, session, cookieOptions())
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch {
    return NextResponse.json({ error: '请求无效' }, { status: 400 })
  }
}
