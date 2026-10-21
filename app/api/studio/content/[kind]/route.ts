import { NextResponse } from 'next/server'
import { guardAdminMutation, hasAdminSession } from '@/lib/admin-auth'
import { apiError, parseJson } from '@/lib/api'
import { contentKind, createContent, listContent } from '@/lib/managed-content'
import { withDataLock } from '@/lib/storage'

export const runtime = 'nodejs'
type Context = { params: Promise<{ kind: string }> }
export async function GET(_request: Request, { params }: Context) {
  if (!await hasAdminSession()) return NextResponse.json({ error: '未登录管理员' }, { status: 401 })
  try { return NextResponse.json({ items: listContent(contentKind((await params).kind)) }, { headers: { 'Cache-Control': 'no-store' } }) }
  catch (error) { return apiError(error) }
}
export async function POST(request: Request, { params }: Context) {
  const deny = await guardAdminMutation(request); if (deny) return deny
  try {
    const kind = contentKind((await params).kind), payload = await parseJson(request, 200_000)
    return await withDataLock(async () => NextResponse.json({ item: createContent(kind, payload), items: listContent(kind) }, { status: 201 }))
  } catch (error) { return apiError(error) }
}
