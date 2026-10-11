import { NextResponse } from 'next/server'
import { ADMIN_COOKIE, cookieOptions, isSameOrigin, removeAdminSession } from '@/lib/admin-auth'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: '请求来源无效' }, { status: 403 })
  await removeAdminSession()
  const response = NextResponse.json({ ok: true })
  response.cookies.set(ADMIN_COOKIE, '', { ...cookieOptions(), maxAge: 0 })
  response.headers.set('Cache-Control', 'no-store')
  return response
}
