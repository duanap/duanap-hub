import { NextResponse } from 'next/server'
import { guardAdminMutation, hasAdminSession } from '@/lib/admin-auth'
import { loadBlogIndex, wordpressSource } from '@/lib/blog'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!await hasAdminSession()) return NextResponse.json({ error: '未登录' }, { status: 401 })
  // Status checks do not make a network request. The explicit refresh uses POST.
  return NextResponse.json({ configured: Boolean(wordpressSource()) }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function POST(request: Request) {
  const deny = await guardAdminMutation(request); if (deny) return deny
  const result = await loadBlogIndex(true)
  return NextResponse.json({ status: result.status, count: result.posts.length, fetchedAt: result.fetchedAt, stale: result.stale, truncated: result.truncated }, { headers: { 'Cache-Control': 'no-store' } })
}
